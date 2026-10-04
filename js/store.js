// ShowCrew PixelMap — persistence (localStorage) + data model helpers.
const KEY = 'showcrew.pixelmap.v1';

export const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
export const BOX_COLORS = ['#ff3df2', '#00e5ff', '#ffb020', '#14f1c6', '#8b7bff', '#ff5a5a', '#b6ff3d', '#ffffff'];

export function defaultExport() {
  return {
    inc: { bg: true, outline: true, crosshair: true, centerLines: true, thirds: true, grid: false, segDividers: true,
      segCenters: true, segGuides: false, boxes: true, labels: true, coordLabels: true },
    bg: '#0b1220', line: '#00e5ff', seg: '#ffb020', box: '#ff3df2', text: '#ffffff',
    lw: 2, textSize: 0, boxOwnColors: true,
  };
}
export function defaultView() {
  return { center: true, centerLines: true, thirds: true, grid: true, segments: true, segGuides: true, boxes: true, labels: true, snap: true };
}
export function makeScreen(name, w, h, segments = 1) {
  return { id: uid('scr'), name, w, h, segments, x: 0, y: 0, grid: { mode: 'off', cols: 4, rows: 4, step: 256 }, boxes: [] };
}
export function autoPlace(job, align = 'top') {
  let x = 0; const maxH = Math.max(...job.screens.map(s => s.h), 0);
  for (const s of job.screens) {
    s.x = x; x += s.w;
    s.y = align === 'middle' ? Math.round((maxH - s.h) / 2) : align === 'bottom' ? maxH - s.h : 0;
  }
}
export function exampleJob() {
  const j = {
    id: uid('job'), name: 'Example 4-Screen', mode: 'screen', created: Date.now(), updated: Date.now(),
    screens: [
      makeScreen('House Left', 3584, 1024), makeScreen('Center', 2560, 1280),
      makeScreen('House Right', 3584, 1024), makeScreen('Columns', 1536, 1280, 6),
    ],
    view: defaultView(), exportSettings: defaultExport(),
  };
  autoPlace(j); j.currentScreenId = j.screens[0].id; return j;
}
export function emptyJob(name) {
  const s = makeScreen('Screen 1', 1920, 1080);
  return { id: uid('job'), name, mode: 'screen', created: Date.now(), updated: Date.now(), screens: [s], currentScreenId: s.id, view: defaultView(), exportSettings: defaultExport() };
}
const num = (v, d, min = -1e7, max = 1e7) => { v = +v; return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d; };
const str = (v, d) => (typeof v === 'string' && v.trim() ? v.slice(0, 120) : d);
const col = (v, d) => (/^#[0-9a-f]{6}$/i.test(v) ? v : d);

/** Validate/repair a job (used for load + import). freshIds => new ids. */
export function sanitizeJob(j, freshIds = false) {
  if (!j || !Array.isArray(j.screens)) throw new Error('Not a PixelMap job (no screens array).');
  const de = defaultExport(), ex = Object.assign({}, de, j.exportSettings || {});
  ex.inc = Object.assign({}, de.inc, (j.exportSettings || {}).inc || {});
  for (const k of ['bg', 'line', 'seg', 'box', 'text']) ex[k] = col(ex[k], de[k]);
  ex.lw = num(ex.lw, 2, 1, 64); ex.textSize = num(ex.textSize, 0, 0, 400);
  const out = {
    id: freshIds || !j.id ? uid('job') : String(j.id), name: str(j.name, 'Untitled job'),
    mode: j.mode === 'global' ? 'global' : 'screen', created: num(j.created, Date.now()), updated: Date.now(),
    view: Object.assign(defaultView(), j.view || {}), exportSettings: ex,
    screens: j.screens.slice(0, 200).map((s, i) => ({
      id: freshIds || !s.id ? uid('scr') : String(s.id), name: str(s.name, `Screen ${i + 1}`),
      w: Math.round(num(s.w, 1920, 1, 65536)), h: Math.round(num(s.h, 1080, 1, 65536)),
      segments: Math.round(num(s.segments, 1, 1, 256)), x: Math.round(num(s.x, 0)), y: Math.round(num(s.y, 0)),
      grid: { mode: ['off', 'nm', 'px'].includes((s.grid || {}).mode) ? s.grid.mode : 'off', cols: Math.round(num((s.grid || {}).cols, 4, 1, 500)),
        rows: Math.round(num((s.grid || {}).rows, 4, 1, 500)), step: num((s.grid || {}).step, 256, 1, 65536) },
      boxes: (Array.isArray(s.boxes) ? s.boxes : []).slice(0, 500).map((b, k) => ({
        id: freshIds || !b.id ? uid('box') : String(b.id), name: str(b.name, `Box ${k + 1}`), color: col(b.color, BOX_COLORS[k % BOX_COLORS.length]),
        x: Math.round(num(b.x, 0)), y: Math.round(num(b.y, 0)), w: Math.round(num(b.w, 100, 1, 65536)), h: Math.round(num(b.h, 100, 1, 65536)), lock: !!b.lock,
      })),
    })),
  };
  if (!out.screens.length) out.screens.push(makeScreen('Screen 1', 1920, 1080));
  out.currentScreenId = out.screens.some(s => s.id === j.currentScreenId) && !freshIds ? j.currentScreenId : out.screens[0].id;
  return out;
}
export function duplicateJob(j) {
  const c = sanitizeJob(JSON.parse(JSON.stringify(j)), true); c.name = j.name + ' copy'; c.created = Date.now(); return c;
}
export function load() {
  try {
    const raw = localStorage.getItem(KEY); if (!raw) return null;
    const S = JSON.parse(raw); if (!Array.isArray(S.jobs) || !S.jobs.length) return null;
    S.jobs = S.jobs.map(j => { try { return sanitizeJob(j); } catch { return null; } }).filter(Boolean);
    if (!S.jobs.length) return null;
    if (!S.jobs.some(j => j.id === S.currentJobId)) S.currentJobId = S.jobs[0].id;
    return S;
  } catch (e) { console.warn('load failed', e); return null; }
}
export function seed() { const j = exampleJob(); return { v: 1, jobs: [j], currentJobId: j.id }; }
export function save(S) {
  try { localStorage.setItem(KEY, JSON.stringify(S)); return true; } catch (e) { console.warn('save failed', e); return false; }
}
