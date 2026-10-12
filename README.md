# ShowCrew PixelMap — ShowCrew Tools

Offline-capable PWA for finding key coordinates in event-screen pixel space (Millumin / PowerPoint / Keynote).
Plain HTML/CSS/JS, no build step. Deploy the static files (index.html, manifest.webmanifest, sw.js, css/, js/, icons/) to any HTTPS static host.

- Run locally: `python3 -m http.server 8765` in this folder → http://localhost:8765
- Install on iPad/iPhone: open the HTTPS URL in Safari → Share → Add to Home Screen. After the first load it works offline.
- Data: stored per device in localStorage. Use Job menu → Export JSON for backups.
- Origin (per job, header toggle): **Top-left = 0,0** (default) or **Center = 0,0**. Y always increases downward (like media servers);
  in center mode X is − left / + right and Y is − up / + down. Box X/Y = top-left corner; Center X/Y fields are also shown and editable.
  Segments stay relative to the whole screen. Global-canvas coordinates are always top-left of the whole canvas.
- Grids: N×M, every X px, LED panel 192×192, double LED 192×384, custom panel W×H — tiled from the top-left, partial panels tinted, counts in Coords.
- Coordinates: pixel edges, 0 → W (a full-width box is x=0, w=W; last pixel column is W−1).
  Fractional values show 1 decimal plus ≈ rounded whole px (half rounds up); tap-to-copy copies the rounded value.
  PiP boxes always use whole pixels.
- Tests: `node tools/test-geometry.mjs` + `node tools/test-segments.mjs` (math); `node tools/browser-test.mjs` (headless iPad/iPhone checks, needs playwright + a local server). Icons: `node tools/make-icons.mjs` (needs playwright).
- Updating: bump `VERSION` in sw.js when you change files so installed copies refresh.

## Segments, fit check, Slides (v1.4)
- **Segments** (Screen tab): *Equal split* (N equal slices — what every pre-1.4 job has; `segments: N` loads unchanged as `segMode: 'equal'`)
  or *Custom sizes*: per segment name, W×H px, X/Y offset from the screen's top-left, optional physical W×H (feet / meters → px per ft/m and
  mm pitch, flags non-square pitch). Add / remove / reorder, *Split into N equal* (whole px, exact fill), *Auto-place L→R* with optional gap.
  Switching to Custom starts from the current equal split; switching back keeps the custom list. `segments` always mirrors the count so
  older app versions still show the right number of slices (they can't show custom sizes — update every device).
  Dividers/outlines, centers, guides, Coords readouts, snapping, PiP *Center in seg* / *Fit seg*, Ratios fit and PNG export use the real rects.
- **Fit check**: custom segments that don't exactly fill the screen get an amber badge (screen list, canvas, Coords/Screen tabs) with
  specifics (total width vs screen, per-segment height, unused areas + where); overlaps and segments past an edge are red.
  Unused areas are hatched on the canvas and (checkbox *Unused / overlap areas*) in PNG exports.
- **Slides** tab (`js/slides.js`, sources in its header): PowerPoint slide size (96 px = 1 in; 1–56 in per side) — 1:1 when it fits, otherwise
  ★ *1/N exact* (Windows `ExportBitmapResolution` = 96·N dpi gives native pixels; e.g. 11344×1080 → 39.389 × 3.75 in, 288 dpi) and
  *Largest* (56 in side, e.g. 56 × 5.331 in; needs 202.571 dpi which the registry can't take). Mac: File ▸ Export ▸ PNG width = native.
  Where each segment / PiP lands (Left/Top/Width/Height in in or cm, + pt, px), your current slide size vs the screen (aspect mismatch,
  bars, matching sizes, positions on your slide), Keynote size in pt (1 pt = 1 slide px; reported max 8192). Copy buttons, TXT / CSV
  summary, and a .pptx template (PptxGenJS 4.0.1 vendored, MIT) with the slide size and labeled guide rectangles.
- Tests: `node tools/test-segments.mjs` (segment / fit / migration / slide math) and `node tools/segments-test.mjs` (iPad / iPhone / desktop
  browser checks, .pptx XML check, optional LibreOffice render; writes `screenshots/*segments*`, `*slides*`, `template-example-*`).

## Cloud sync (Supabase, optional)
- Configure in `js/config.js` (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`). Empty key → sync UI hidden, nothing loaded, app is 100% local.
- Offline-first: localStorage is the source of truth. When signed in + online the app pulls/pushes on open, on
  visibility/online events, every 2 min while visible and ~3 s after edits. Last write wins per job (`updated`),
  deletes are tombstones (`deleted = true`). First sign-in uploads local jobs (an untouched sample job is not duplicated).
- Sign-in (v1.3, same as ShowCrew GearVault): **email + password + a 6-digit code from an authenticator app** (Supabase TOTP MFA).
  No email links are needed to sign in, so work-mail link scanners can't burn anything. Sync (and the database's RLS) only
  works for an MFA-verified (`aal2`) session; a password-only session sees nothing. Signed out, the app is 100% usable locally.
- supabase-js is vendored in `vendor/` (no CDN) and precached by the service worker.
- Backend SQL + setup steps: `supabase/`. Tests (serve this folder on :8765 first):
  - `node tools/auth-test.mjs` — sign-in UI: password, mandatory authenticator enrollment (QR + secret), challenge on every
    sign-in, aal1 can't sync, sign-out, password reset (email → link → code → new password), expired-link message, `ALLOW_SIGNUP`.
  - `node tools/sync-test.mjs` — two devices vs. an in-memory backend that mirrors `push_jobs` + aal2 RLS.
  - Both use the fake Supabase client in `tools/mock-supabase.mjs` (valid TOTP code `246810`) — no real project needed.
  - `node tools/config-check.mjs` — empty-key behaviour + live Supabase Auth reachability (bogus password rejected).
  - `supabase/rls-test.sql` — 37 RLS checks incl. the aal1 gate (see `supabase/README.md`).

## Status of Don's project

Project **PixelMap** (ref `ylilrphbplhauxqdbqni`). Done: schema (`pixelmap_jobs_sync_schema`) and the MFA gate
(`require_mfa_aal2` = `supabase/migrations/0002_require_mfa_aal2.sql`) are applied; `js/config.js` holds the URL + publishable key.
Still to do in the dashboard (steps 2–5 below):

- MFA (check TOTP is enabled): https://supabase.com/dashboard/project/ylilrphbplhauxqdbqni/auth/mfa
- Add your user (Auto Confirm): https://supabase.com/dashboard/project/ylilrphbplhauxqdbqni/auth/users
- Turn off "Allow new users to sign up": https://supabase.com/dashboard/project/ylilrphbplhauxqdbqni/auth/providers
- URL configuration (only for password-reset links): https://supabase.com/dashboard/project/ylilrphbplhauxqdbqni/auth/url-configuration
- Optional custom SMTP: https://supabase.com/dashboard/project/ylilrphbplhauxqdbqni/auth/smtp

## One-time Supabase setup

1. **Tables + security rules** — Dashboard → *SQL Editor* → paste [`supabase/schema.sql`](supabase/schema.sql) → *Run* (safe to re-run;
   it already includes the MFA gate). On a project set up before v1.3, also run
   [`supabase/migrations/0002_require_mfa_aal2.sql`](supabase/migrations/0002_require_mfa_aal2.sql).
2. **Check TOTP MFA is on** — *Authentication → Multi-Factor*: **TOTP (App Authenticator)** must be *Enabled* (it is by default). Phone/SMS MFA isn't used.
3. **Create your account** — *Authentication → Users → Add user → Create new user*: your email + a strong password, tick **Auto Confirm User**.
   If a user with that email already exists (e.g. from the old email-code sign-in) and you don't know its password, delete it first
   (*⋯ → Delete user*) and create it again — or use *Forgot password?* in the app.
   (Alternative: set `ALLOW_SIGNUP = true` in `js/config.js`, sign up in the app, confirm the email, then set it back to `false`.)
4. **Turn off public sign-ups** — *Authentication → Sign In / Providers*: switch **off "Allow new users to sign up"**. The app hides sign-up
   (`ALLOW_SIGNUP = false`), but only this switch stops strangers creating accounts (and RLS means they'd never see your jobs anyway).
5. **Point reset links at the app** — *Authentication → URL Configuration*: Site URL `https://don-duckworth.github.io/showcrew-pixelmap/`,
   Redirect URLs `https://don-duckworth.github.io/showcrew-pixelmap/**` (+ `http://localhost:8765/**` for local testing). Only used by password-reset emails.
6. **First sign-in** — tap the **Sign in · cloud** pill → email + password → the app makes you **set up 2FA**: scan the QR code (or type the secret)
   into 1Password / Authy / Google Authenticator / iOS Passwords and enter the 6-digit code. **Save the secret somewhere safe** (or scan it into two
   apps) — there are no backup codes; if you lose the authenticator, remove the factor in *Authentication → Users → (you) → MFA factors*.
   From then on every sign-in asks for the 6-digit code. You can use the same authenticator app as GearVault; it shows up as "ShowCrew PixelMap".

Optional: *Authentication → Emails → SMTP* with your own mail provider — the built-in sender is heavily rate-limited, which now only matters for
password resets. Password-reset links are one-time links, so a work-mail link scanner can still burn them; if that happens, reset from a personal
address or delete + re-create the user in the dashboard. Free-plan projects pause after a week of no use; open the dashboard and *Restore* if that happens.
