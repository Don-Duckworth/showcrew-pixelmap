# ShowCrew PixelMap — Supabase backend

Project ref `ylilrphbplhauxqdbqni` · https://ylilrphbplhauxqdbqni.supabase.co

## Files
- `schema.sql` — tables `jobs` + `job_shares`, RLS policies, `updated_at` trigger, `push_jobs()` sync RPC. Idempotent.
- `rls-test.sql` — RLS checks with simulated users (`set_config('request.jwt.claims', …)` + `set role authenticated`). Wraps everything in a transaction and **rolls back**.
- `local-stub.sql` — TEST ONLY: fakes Supabase's `auth` schema/roles on a plain local Postgres. Never run it on the real project.

## Apply
Either paste `schema.sql` into Dashboard → SQL Editor → Run, or:
```
psql "<connection string>" -v ON_ERROR_STOP=1 -f supabase/schema.sql
psql "<connection string>" -v ON_ERROR_STOP=1 -f supabase/rls-test.sql   # expect "N/N RLS checks passed"
```
The direct host `db.<ref>.supabase.co` is IPv6-only; from IPv4 networks use the Session pooler string from
Dashboard → Connect (host `aws-0-us-east-1.pooler.supabase.com`, port 5432, user `postgres.ylilrphbplhauxqdbqni`).

## Auth settings (Dashboard)
- Authentication → URL Configuration: Site URL `https://don-duckworth.github.io/showcrew-pixelmap/`;
  Redirect URLs: `https://don-duckworth.github.io/showcrew-pixelmap/**` (optionally `http://localhost:8765/**` for local testing).
- Authentication → Emails → Templates: add the code to **Magic Link** and **Confirm signup** templates, e.g.
  `<p>Your PixelMap sign-in code: <strong>{{ .Token }}</strong></p>` (keep `{{ .ConfirmationURL }}` if you also want the link).
- Built-in email only delivers to project team members and is heavily rate-limited — add Don's address to the
  org team or configure custom SMTP (Authentication → Emails → SMTP Settings) before inviting crew.
