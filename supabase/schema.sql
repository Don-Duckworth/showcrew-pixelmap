-- ShowCrew PixelMap — Supabase schema (idempotent; safe to re-run).
-- Run as the `postgres` role (SQL editor or psql). Contains no secrets.
--
-- Model: one row per job. `data` holds the full job object exactly as the app stores it in localStorage.
-- Sync is last-write-wins per job on `updated_at` (client edit time, clamped to now()+5 min).
-- Deletes are soft (`deleted = true` tombstones) so other devices learn about them.
-- `job_shares` makes the schema ready for crew sharing (viewer / editor); the app UI for sharing is a TODO.

create schema if not exists private;  -- helpers here are NOT exposed through the Data API
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------- tables
create table if not exists public.jobs (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null default '',
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint jobs_data_is_object check (jsonb_typeof(data) = 'object'),
  constraint jobs_data_size check (pg_column_size(data) < 4000000),
  constraint jobs_name_len check (char_length(name) <= 200)
);
create index if not exists jobs_owner_updated_idx on public.jobs (owner, updated_at desc);

create table if not exists public.job_shares (
  job_id      uuid not null references public.jobs (id) on delete cascade,
  email       text not null,                                   -- invitee email (lower-case)
  user_id     uuid references auth.users (id) on delete cascade, -- optional; filled once known
  role        text not null default 'viewer' check (role in ('viewer', 'editor')),
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (job_id, email),
  constraint job_shares_email_lower check (email = lower(email))
);
create index if not exists job_shares_user_idx on public.job_shares (user_id);
create index if not exists job_shares_email_idx on public.job_shares (email);

-- ---------------------------------------------------------------- helpers (security definer → no RLS recursion)
create or replace function private.is_job_owner(p_job uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.jobs j where j.id = p_job and j.owner = auth.uid());
$$;

-- Caller's share role on a job: 'editor', 'viewer' or null. Matches by user id or by JWT email.
create or replace function private.job_share_role(p_job uuid) returns text
language sql stable security definer set search_path = '' as $$
  select s.role from public.job_shares s
  where s.job_id = p_job
    and (s.user_id = auth.uid() or s.email = lower(coalesce(auth.jwt() ->> 'email', '')))
  order by (s.role = 'editor') desc
  limit 1;
$$;
revoke all on function private.is_job_owner(uuid), private.job_share_role(uuid) from public;
grant execute on function private.is_job_owner(uuid), private.job_share_role(uuid) to authenticated;

-- ---------------------------------------------------------------- triggers
create or replace function private.jobs_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := least(coalesce(new.updated_at, now()), now() + interval '5 minutes');
  else
    if new.owner is distinct from old.owner and auth.uid() is not null then
      raise exception 'jobs.owner cannot be changed' using errcode = '42501';
    end if;
    new.created_at := old.created_at;
    if new.updated_at is not distinct from old.updated_at then
      new.updated_at := now();                       -- plain UPDATEs that don't set updated_at
    else
      new.updated_at := least(new.updated_at, now() + interval '5 minutes');  -- client edit time, no far-future clocks
    end if;
  end if;
  return new;
end $$;
drop trigger if exists jobs_before_write on public.jobs;
create trigger jobs_before_write before insert or update on public.jobs
  for each row execute function private.jobs_before_write();

create or replace function private.job_shares_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.email := lower(trim(new.email));
  return new;
end $$;
drop trigger if exists job_shares_before_write on public.job_shares;
create trigger job_shares_before_write before insert or update on public.job_shares
  for each row execute function private.job_shares_before_write();

-- ---------------------------------------------------------------- RLS
alter table public.jobs enable row level security;
alter table public.job_shares enable row level security;

revoke all on public.jobs, public.job_shares from anon;
grant select, insert, update, delete on public.jobs, public.job_shares to authenticated;

drop policy if exists jobs_select on public.jobs;
drop policy if exists jobs_insert on public.jobs;
drop policy if exists jobs_update on public.jobs;
drop policy if exists jobs_delete on public.jobs;
create policy jobs_select on public.jobs for select to authenticated
  using (owner = (select auth.uid()) or private.job_share_role(id) is not null);
create policy jobs_insert on public.jobs for insert to authenticated
  with check (owner = (select auth.uid()));
create policy jobs_update on public.jobs for update to authenticated
  using (owner = (select auth.uid()) or private.job_share_role(id) = 'editor')
  with check (owner = (select auth.uid()) or private.job_share_role(id) = 'editor');
create policy jobs_delete on public.jobs for delete to authenticated
  using (owner = (select auth.uid()));

drop policy if exists shares_select on public.job_shares;
drop policy if exists shares_insert on public.job_shares;
drop policy if exists shares_update on public.job_shares;
drop policy if exists shares_delete on public.job_shares;
create policy shares_select on public.job_shares for select to authenticated
  using (private.is_job_owner(job_id) or user_id = (select auth.uid())
         or email = lower(coalesce((select auth.jwt()) ->> 'email', '')));
create policy shares_insert on public.job_shares for insert to authenticated
  with check (private.is_job_owner(job_id) and created_by = (select auth.uid()));
create policy shares_update on public.job_shares for update to authenticated
  using (private.is_job_owner(job_id)) with check (private.is_job_owner(job_id));
create policy shares_delete on public.job_shares for delete to authenticated
  using (private.is_job_owner(job_id));

-- ---------------------------------------------------------------- sync RPC
-- push_jobs(items): batch upsert with last-write-wins. Each item: {id, name, data, updated_at, deleted}.
-- Returns one row per item: status 'ok' (written), 'stale' (server copy is newer; client should pull) or 'denied: …'.
-- SECURITY INVOKER: all RLS policies above still apply.
create or replace function public.push_jobs(items jsonb)
returns table (id uuid, status text, updated_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_column
declare
  it jsonb; v_id uuid; v_ts timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if jsonb_typeof(items) <> 'array' then
    raise exception 'items must be a JSON array' using errcode = '22023';
  end if;
  for it in select value from jsonb_array_elements(items) loop
    begin
      v_id := (it ->> 'id')::uuid;
      insert into public.jobs as j (id, name, data, updated_at, deleted)
      values (v_id, left(coalesce(it ->> 'name', ''), 200), coalesce(it -> 'data', '{}'::jsonb),
              coalesce((it ->> 'updated_at')::timestamptz, now()), coalesce((it ->> 'deleted')::boolean, false))
      on conflict on constraint jobs_pkey do update
        set name = excluded.name, data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted
        where j.updated_at < excluded.updated_at
      returning j.updated_at into v_ts;
      if found then
        id := v_id; status := 'ok'; updated_at := v_ts;
      else
        select j.updated_at into v_ts from public.jobs j where j.id = v_id;
        id := v_id; status := 'stale'; updated_at := v_ts;
      end if;
    exception when others then
      id := v_id; status := 'denied: ' || sqlerrm; updated_at := null;
    end;
    return next;
  end loop;
end $$;
revoke all on function public.push_jobs(jsonb) from public, anon;
grant execute on function public.push_jobs(jsonb) to authenticated;

-- Let PostgREST pick up the new objects immediately.
notify pgrst, 'reload schema';
