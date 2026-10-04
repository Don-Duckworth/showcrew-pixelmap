-- ShowCrew PixelMap — RLS verification. Runs inside a transaction and ROLLS BACK (leaves no data).
-- Usage: psql "$DB" -v ON_ERROR_STOP=1 -f supabase/rls-test.sql   → prints PASS/FAIL lines.
begin;
create temp table _r (n serial, ok boolean, msg text);
grant all on _r to authenticated, anon; grant usage on sequence _r_n_seq to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-00000000000a', 'alice@test.local'),
  ('00000000-0000-4000-a000-00000000000b', 'bob@test.local'),
  ('00000000-0000-4000-a000-00000000000c', 'carol@test.local');

create or replace function pg_temp.as_user(p uuid, p_email text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'email', p_email, 'role', 'authenticated')::text, true);
$$;
create or replace function pg_temp.check(ok boolean, msg text) returns void language sql as $$
  insert into _r (ok, msg) values (coalesce(ok, false), msg);
$$;

set local role authenticated;
-- Alice creates a job (owner defaults to auth.uid())
select pg_temp.as_user('00000000-0000-4000-a000-00000000000a', 'alice@test.local');
insert into public.jobs (id, name, data) values ('11111111-1111-4111-8111-111111111111', 'Alice gig', '{"name":"Alice gig"}');
select pg_temp.check((select owner from public.jobs where id = '11111111-1111-4111-8111-111111111111') = '00000000-0000-4000-a000-00000000000a', 'owner defaults to auth.uid()');
select pg_temp.check((select count(*) from public.jobs) = 1, 'Alice sees her own job');

-- Alice cannot insert a row owned by Bob
do $$ begin
  insert into public.jobs (name, owner) values ('spoof', '00000000-0000-4000-a000-00000000000b');
  perform pg_temp.check(false, 'insert with foreign owner blocked');
exception when insufficient_privilege then perform pg_temp.check(true, 'insert with foreign owner blocked');
end $$;

-- Bob sees nothing, cannot update/delete Alice's job
select pg_temp.as_user('00000000-0000-4000-a000-00000000000b', 'bob@test.local');
select pg_temp.check((select count(*) from public.jobs) = 0, 'Bob cannot see Alice''s job');
with u as (update public.jobs set name = 'hacked' where id = '11111111-1111-4111-8111-111111111111' returning 1)
select pg_temp.check((select count(*) from u) = 0, 'Bob cannot update Alice''s job');
with d as (delete from public.jobs where id = '11111111-1111-4111-8111-111111111111' returning 1)
select pg_temp.check((select count(*) from d) = 0, 'Bob cannot delete Alice''s job');
select pg_temp.check((select status from public.push_jobs('[{"id":"11111111-1111-4111-8111-111111111111","name":"x","data":{},"updated_at":"2099-01-01T00:00:00Z"}]'::jsonb)) like 'denied%', 'Bob push_jobs onto Alice''s id → denied');
select pg_temp.check((select count(*) from public.job_shares) = 0, 'Bob sees no shares');
do $$ begin
  insert into public.job_shares (job_id, email, role) values ('11111111-1111-4111-8111-111111111111', 'bob@test.local', 'editor');
  perform pg_temp.check(false, 'Bob cannot share Alice''s job to himself');
exception when insufficient_privilege then perform pg_temp.check(true, 'Bob cannot share Alice''s job to himself');
end $$;

-- push_jobs LWW for Alice
select pg_temp.as_user('00000000-0000-4000-a000-00000000000a', 'alice@test.local');
select pg_temp.check((select status from public.push_jobs('[{"id":"22222222-2222-4222-8222-222222222222","name":"Pushed","data":{"a":1},"updated_at":"2026-01-01T00:00:00Z"}]'::jsonb)) = 'ok', 'push_jobs insert new → ok');
select pg_temp.check((select status from public.push_jobs('[{"id":"22222222-2222-4222-8222-222222222222","name":"Older","data":{"a":0},"updated_at":"2025-01-01T00:00:00Z"}]'::jsonb)) = 'stale', 'push_jobs older edit → stale (not written)');
select pg_temp.check((select name from public.jobs where id = '22222222-2222-4222-8222-222222222222') = 'Pushed', 'stale push did not overwrite');
select pg_temp.check((select status from public.push_jobs('[{"id":"22222222-2222-4222-8222-222222222222","name":"Newer","data":{"a":2},"updated_at":"2026-02-01T00:00:00Z","deleted":true}]'::jsonb)) = 'ok', 'push_jobs newer tombstone → ok');
select pg_temp.check((select deleted and name = 'Newer' from public.jobs where id = '22222222-2222-4222-8222-222222222222'), 'tombstone stored (deleted=true)');
select pg_temp.check((select status from public.push_jobs('[{"id":"33333333-3333-4333-8333-333333333333","name":"Future","data":{},"updated_at":"2099-01-01T00:00:00Z"}]'::jsonb)) = 'ok', 'push_jobs far-future edit → ok');
select pg_temp.check((select updated_at < now() + interval '6 minutes' from public.jobs where id = '33333333-3333-4333-8333-333333333333'), 'far-future updated_at clamped to now()+5min');
do $$ begin
  update public.jobs set owner = '00000000-0000-4000-a000-00000000000b' where id = '11111111-1111-4111-8111-111111111111';
  perform pg_temp.check(false, 'owner cannot be changed');
exception when insufficient_privilege then perform pg_temp.check(true, 'owner cannot be changed');
end $$;

-- Alice shares her job: Bob = viewer (by email), Carol = editor (by user id)
insert into public.job_shares (job_id, email, role) values ('11111111-1111-4111-8111-111111111111', 'Bob@Test.local', 'viewer');
insert into public.job_shares (job_id, email, user_id, role) values ('11111111-1111-4111-8111-111111111111', 'carol@test.local', '00000000-0000-4000-a000-00000000000c', 'editor');
select pg_temp.check((select count(*) from public.job_shares) = 2, 'owner sees her shares (email lower-cased: ' || (select string_agg(email, ',') from public.job_shares) || ')');

-- Bob (viewer): can read, cannot write
select pg_temp.as_user('00000000-0000-4000-a000-00000000000b', 'bob@test.local');
select pg_temp.check((select count(*) from public.jobs) = 1, 'viewer Bob can now see the shared job');
with u as (update public.jobs set name = 'viewer edit' where id = '11111111-1111-4111-8111-111111111111' returning 1)
select pg_temp.check((select count(*) from u) = 0, 'viewer Bob cannot update');
select pg_temp.check((select count(*) from public.job_shares) = 1, 'Bob sees only his own share row');
with d as (delete from public.job_shares returning 1)
select pg_temp.check((select count(*) from d) = 0, 'Bob cannot delete shares');

-- Carol (editor): can update, cannot delete or reshare
select pg_temp.as_user('00000000-0000-4000-a000-00000000000c', 'carol@test.local');
with u as (update public.jobs set name = 'Carol edit', updated_at = '2026-03-01T00:00:00Z' where id = '11111111-1111-4111-8111-111111111111' returning 1)
select pg_temp.check((select count(*) from u) = 1, 'editor Carol can update');
select pg_temp.check((select status from public.push_jobs('[{"id":"11111111-1111-4111-8111-111111111111","name":"Carol push","data":{},"updated_at":"2026-04-01T00:00:00Z"}]'::jsonb)) = 'ok', 'editor Carol push_jobs → ok');
with d as (delete from public.jobs where id = '11111111-1111-4111-8111-111111111111' returning 1)
select pg_temp.check((select count(*) from d) = 0, 'editor Carol cannot hard-delete');
do $$ begin
  insert into public.job_shares (job_id, email, role) values ('11111111-1111-4111-8111-111111111111', 'dave@test.local', 'editor');
  perform pg_temp.check(false, 'editor Carol cannot add shares');
exception when insufficient_privilege then perform pg_temp.check(true, 'editor Carol cannot add shares');
end $$;
select pg_temp.check((select owner from public.jobs where id = '11111111-1111-4111-8111-111111111111') = '00000000-0000-4000-a000-00000000000a', 'owner unchanged after editor writes');

-- Anonymous (no JWT, anon role): nothing
reset role; set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  perform count(*) from public.jobs;
  perform pg_temp.check(false, 'anon has no access to jobs');
exception when insufficient_privilege then perform pg_temp.check(true, 'anon has no access to jobs');
end $$;
do $$ begin
  perform public.push_jobs('[]'::jsonb);
  perform pg_temp.check(false, 'anon cannot call push_jobs');
exception when insufficient_privilege then perform pg_temp.check(true, 'anon cannot call push_jobs');
end $$;

-- Owner hard delete (cascades shares)
reset role; set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a000-00000000000a', 'alice@test.local');
with d as (delete from public.jobs where id = '11111111-1111-4111-8111-111111111111' returning 1)
select pg_temp.check((select count(*) from d) = 1, 'owner Alice can delete; shares cascade');

reset role;
select case when ok then 'PASS ' else 'FAIL ' end || msg as result from _r order by n;
select count(*) filter (where ok) || '/' || count(*) || ' RLS checks passed' as summary from _r;
rollback;
