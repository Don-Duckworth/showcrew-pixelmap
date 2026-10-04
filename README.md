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
- Tests: `node tools/test-geometry.mjs` (math); `node tools/browser-test.mjs` (headless iPad/iPhone checks, needs playwright + a local server). Icons: `node tools/make-icons.mjs` (needs playwright).
- Updating: bump `VERSION` in sw.js when you change files so installed copies refresh.

## Cloud sync (Supabase, optional)
- Configure in `js/config.js` (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`). Empty key → sync UI hidden, nothing loaded, app is 100% local.
- Offline-first: localStorage is the source of truth. When signed in + online the app pulls/pushes on open, on
  visibility/online events, every 2 min while visible and ~3 s after edits. Last write wins per job (`updated`),
  deletes are tombstones (`deleted = true`). First sign-in uploads local jobs (an untouched sample job is not duplicated).
- Sign-in: email one-time code (works inside the installed iOS app); magic links also work in Safari.
- supabase-js is vendored in `vendor/` (no CDN) and precached by the service worker.
- Backend SQL + setup steps: `supabase/`. Tests: `tools/sync-test.mjs` (two devices vs. an in-memory backend that
  mirrors `push_jobs`), `tools/config-check.mjs` (empty-key behaviour + live Supabase Auth reachability).
