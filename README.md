# ShowCrew PixelMap — ShowCrew Tools

Offline-capable PWA for finding key coordinates in event-screen pixel space (Millumin / PowerPoint / Keynote).
Plain HTML/CSS/JS, no build step. Deploy the static files (index.html, manifest.webmanifest, sw.js, css/, js/, icons/) to any HTTPS static host.

- Run locally: `python3 -m http.server 8765` in this folder → http://localhost:8765
- Install on iPad/iPhone: open the HTTPS URL in Safari → Share → Add to Home Screen. After the first load it works offline.
- Data: stored per device in localStorage. Use Job menu → Export JSON for backups.
- Coordinates: pixel edges, 0 → W (a full-width box is x=0, w=W; last pixel column is W−1).
  Fractional values show 1 decimal plus ≈ rounded whole px (half rounds up); tap-to-copy copies the rounded value.
  PiP boxes always use whole pixels.
- Tests: `node tools/test-geometry.mjs` (math). Icons: `node tools/make-icons.mjs` (needs playwright).
- Updating: bump `VERSION` in sw.js when you change files so installed copies refresh.
