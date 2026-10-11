# ShowCrew PixelMap — Supabase backend

Project ref `ylilrphbplhauxqdbqni` · https://ylilrphbplhauxqdbqni.supabase.co

## Files
- `schema.sql` — tables `jobs` + `job_shares`, RLS policies (incl. the restrictive **aal2 / MFA** gate), `updated_at` trigger, `push_jobs()` sync RPC. Idempotent.
- `migrations/0002_require_mfa_aal2.sql` — v1.3 upgrade for projects created before MFA: restrictive `require mfa (aal2)` policy on both tables + `push_jobs` refuses aal1. Idempotent. (Applied to `ylilrphbplhauxqdbqni` as `require_mfa_aal2`.)
- `rls-test.sql` — 37 RLS checks (owner isolation, shares, LWW, aal1 sees/writes nothing, anon) with simulated users (`set_config('request.jwt.claims', …)` + `set role authenticated`). Wraps everything in a transaction and **rolls back**.
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
Sign-in is email + password + authenticator code (TOTP MFA) — see the main README → "One-time Supabase setup".
- MFA: https://supabase.com/dashboard/project/ylilrphbplhauxqdbqni/auth/mfa — TOTP enabled.
- Users: https://supabase.com/dashboard/project/ylilrphbplhauxqdbqni/auth/users — Add user → Create new user, **Auto Confirm User**.
- Sign In / Providers: https://supabase.com/dashboard/project/ylilrphbplhauxqdbqni/auth/providers — turn off "Allow new users to sign up".
- URL Configuration: https://supabase.com/dashboard/project/ylilrphbplhauxqdbqni/auth/url-configuration — Site URL
  `https://don-duckworth.github.io/showcrew-pixelmap/`, Redirect URL `https://don-duckworth.github.io/showcrew-pixelmap/**` (password-reset links only).
- Email templates no longer matter for sign-in (no magic links / email codes). Custom SMTP is optional (password resets only).

## Local test
```
psql -f supabase/local-stub.sql && psql -f supabase/schema.sql && psql -f supabase/migrations/0002_require_mfa_aal2.sql && psql -f supabase/rls-test.sql
```
(against a throwaway local Postgres — expect "37/37 RLS checks passed").
