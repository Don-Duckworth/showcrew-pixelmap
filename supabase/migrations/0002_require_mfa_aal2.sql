-- ShowCrew PixelMap v1.3 — require MFA (aal2) for all cloud data, same as ShowCrew GearVault.
-- Idempotent; safe to re-run. Also folded into supabase/schema.sql.
--
-- A RESTRICTIVE policy is AND-ed with the permissive owner/share policies, so a password-only (aal1) session
-- sees no rows and can write nothing. Sign-in = email + password + authenticator (TOTP) code → JWT claim aal = 'aal2'.
do $$
declare t text;
begin
  foreach t in array array['jobs', 'job_shares'] loop
    execute format('drop policy if exists "require mfa (aal2)" on public.%I', t);
    execute format($p$create policy "require mfa (aal2)" on public.%I as restrictive for all to authenticated
                     using (((select auth.jwt()) ->> 'aal') = 'aal2') with check (((select auth.jwt()) ->> 'aal') = 'aal2')$p$, t);
  end loop;
end $$;

-- push_jobs: refuse aal1 sessions up front with a clear error (RLS would also deny every row).
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
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'two-factor authentication required (aal2)' using errcode = '42501';
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

notify pgrst, 'reload schema';
