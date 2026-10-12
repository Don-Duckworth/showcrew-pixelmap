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

## Screens from PowerPoint slide sizes (v1.5)
- **＋ Add** (Screens pane) opens a dialog: size in pixels, or a PowerPoint slide size W × H (in or cm) with either px per inch
  (default 96 = PowerPoint's mapping) or a target pixel width (e.g. the export width; height follows the aspect). Live preview of the exact
  and whole-pixel size (rounded half up). The new screen remembers the slide size as its "current slide".
- Screen tab ▸ **Duplicate from slide size…** / **Resize from slide size…**: same inputs, prefilled from the screen's current slide size,
  with *Scale proportionally* (default) or *Keep pixel sizes* for segments and PiP boxes, and a before → after preview including the new fit check.
  Scaling maps every distinct segment edge once (`G.edgeMapper`), so butted segments stay butted, an exact fill stays exact, and an original
  gap/overlap scales but never rounds away. Physical sizes (ft/m) are kept. Copies are named e.g. `Screen 1 (PPT 55.561x5.28)`.
- Example: 55.561 × 5.28 in @ 96 px/in = 5333.856 × 506.88 → 5334 × 507 (segments 3510/4320/3510 → 1650/2032/1650, 4 px gap → 2 px);
  @ target width 11344 → 11344 × 1078. Tests: `node tools/test-segments.mjs`, `node tools/slide-resize-test.mjs`.

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

## Target output & full-screen playback fit (v1.6)

Slides tab ▸ **Target output resolution** (W × H px; defaults to the selected screen, quick picks for the screen size, 1280×720, 1920×1080, 1920×1200, 2560×1440, 3840×2160, 4096×2160; saved per screen as `pptOut`, `null` = follow the screen).

For the recommended PowerPoint slide size, your current slide size and the slide entered in the New / Duplicate / Resize dialogs, PixelMap works out how Slide Show fits the slide into that output — uniform scale, centered — and states:

* letterbox (black top/bottom), pillarbox (black left/right) or no bars, with pixels per side — odd totals say "about n.5 px each — one side gets n, the other n+1" (PowerPoint doesn't document which side), fractional ones say "about" and give the exact value; under 0.5 px total counts as no bars;
* the rendered slide area in px, the scale (output px per slide inch and × of 96 px/in);
* where each segment / PiP box lands in output px (deck laid out across the whole slide in proportion to the screen), flagging every edge that moves ≥ 1 px from its native position (scaled to the output when the output isn't the screen size).

Example: 55.561 × 5.28 in on 11344×1080 → 11344 × 1078.03 px at 204.172 px/in, "Black top and bottom: about 1 px each (exact 0.986 px each, 1.972 px total)"; no segment edge moves ≥ 1 px.

Tests: `node tools/test-segments.mjs` (playback math) and `node tools/playback-test.mjs` (browser, iPad / iPhone / desktop).

## Re-layout segments to fill (v1.7)

Screen tab ▸ Segments (custom) ▸ **Layout: Original | ⇔ Fill width** (also offered as a button in the fit warning). Fill width scales every segment width by the same ratio so the segments run butted from x = 0 to exactly the screen width, left → right by their original X. Widths are whole pixels: each exact share is floored and the leftover pixels go one each to the largest fractional remainders (ties → leftmost), so the total is always exactly W. Y and heights are unchanged.

Example: 3510 / 4320 / 3510 (11340, 4 px short) on 11344 → exact 3511.238 / 4321.524 / 3511.238 → **3511 / 4322 / 3511** = 11344 at x 0 / 3511 / 7833.

Stored per screen (synced, backward compatible): `segLayout: 'original' | 'fill'`, `segmentsOriginal` (the original rects, same order/ids) and `segs` = the ACTIVE layout. Everything that reads segments (fit warning, canvas, PiP "Center in seg", Coords, Ratios, Slides positions, playback fit, PNG export, .pptx template) therefore uses the active layout, and older app versions simply see the active layout.

**Editing while Fill is on edits the Original:** the W / X fields show the original values, and add / remove / reorder / auto-place / split change the original; the fill is recalculated immediately (also when the screen width or a slide-size resize changes the width). Name, physical size, Y and H apply to both layouts. "Keep fill as the new original" bakes the filled widths in (asks first) and turns Fill off.

Tests: `node tools/test-segments.mjs` (fill math, rounding fuzz, store round-trip) and `node tools/fill-test.mjs` (browser, iPad / iPhone / desktop).

## Slides ▸ PowerPoint | Keynote sub-tabs (v1.8)

The Slides tab has two sub-tabs; the last one used is remembered per device (`showcrew.pixelmap.prefs` → `slidesTab`). **PowerPoint** keeps everything from v1.4–v1.7. **Keynote**:

* Slide size: Document sidebar ▸ Document ▸ Slide Size ▸ Custom Slide Size ([Apple](https://support.apple.com/guide/keynote/change-the-slide-size-tan929f13a1f/mac)); Keynote measures slides in points, 1 pt = 1 slide pixel. Limits 8192 × 8192 max / 200 pt min are **community-reported** (Eric Alba, LinkedIn Oct 2023; [Stoatworks Wallslide](https://wallslide.stoatworks-labs.com/), measured) — Apple publishes none.
* Options: 1:1 native (if it fits), exact 1/N that divide evenly, largest exact-aspect size (longest side 8192, whole-pt rounding + error back at native), ×M when under 200 pt. 11344×1080 → ★ 1/2 = 5672 × 540, 1/4 = 2836 × 270, largest 8192 × 779.915 → 780 (0.117 px off).
* Current Keynote slide compare (W × H pt, saved per screen as `keyCur`), target output + playback fit (shared with PowerPoint), Arrange-inspector positions (pt) with copy buttons, Movie/Images export notes ([Apple](https://support.apple.com/guide/keynote/export-to-powerpoint-or-another-file-format-tana0d19882a/mac)).
* Template: a native .key can't be generated (undocumented IWA/protobuf zip). "Keynote template (.pptx for Keynote)" is sized in points (1 pt = 12 700 EMU, exact); sizes over 4032 pt (56 in) are outside the OOXML schema — LibreOffice opens them, Keynote's import is unverified, so a ≤ 4032 pt option (e.g. 1/4) is suggested. Plus a full-size guide PNG and steps: View ▸ Edit Slide Layouts ([Apple](https://support.apple.com/guide/keynote/add-and-edit-slide-layouts-tan7a2b69972/mac)) → File ▸ Save Theme ([Apple](https://support.apple.com/guide/keynote/tanb343cb739/mac)). TXT / CSV summary.

Tests: `node tools/test-segments.mjs` and `node tools/keynote-test.mjs`.
