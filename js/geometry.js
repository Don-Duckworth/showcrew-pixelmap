// ShowCrew PixelMap — pure geometry / math helpers (no DOM).
// Convention: pixel EDGE coordinates. A W×H screen spans x 0→W, y 0→H.
// (The last pixel column starts at W−1; a full-width box is x=0, w=W.)

export const EPS = 1e-9;
export const isInt = v => Math.abs(v - Math.round(v)) < 1e-6;
export const rnd = v => (v < 0 ? -Math.round(-v + EPS) : Math.round(v + EPS)); // halves round away from zero
/** Exact value with 1 decimal when fractional ("1194.7"), plain integer otherwise. */
export const fmt1 = v => (isInt(v) ? String(rnd(v)) : (Math.round(v * 10) / 10).toFixed(1));
/** Human string: "1194.7 (≈1195)" or "1280". */
/** Up to 2 decimals (panel counts): "18.67", "19". */
export const fmt2 = v => (isInt(v) ? String(rnd(v)) : (Math.round(v * 100) / 100).toFixed(2));
export const fmtFull = v => (isInt(v) ? String(rnd(v)) : `${fmt1(v)} (≈${rnd(v)})`);

export function gcd(a, b) {
  a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b));
  while (b) { [a, b] = [b, a % b]; }
  return a || 1;
}

export function aspect(w, h) {
  const g = gcd(w, h);
  const dec = w / h;
  return { num: Math.round(w / g), den: Math.round(h / g), dec, text: `${Math.round(w / g)}:${Math.round(h / g)}`, decText: `${dec.toFixed(2)}:1` };
}

/** Custom (explicit) segments? Old jobs have only `segments: N` → equal split (migrated as segMode 'equal'). */
export const isCustomSegs = s => s.segMode === 'custom' && Array.isArray(s.segs) && s.segs.length > 0;
/** Number of segments (custom list length, or N equal). */
export function segCount(s) { return isCustomSegs(s) ? s.segs.length : Math.max(1, Math.min(256, Math.floor(+s.segments || 1))); }
/** Draw / list segments? Equal split: only when N > 1. Custom: always (even a single segment that doesn't fill). */
export const hasSegs = s => isCustomSegs(s) || segCount(s) > 1;

function segRect(i, name, x, y, w, h, custom, id) {
  return { i, n: i + 1, id, name, custom, x0: x, x1: x + w, y0: y, y1: y + h, w, h, cx: x + w / 2, cy: y + h / 2,
    thirds: [x + w / 3, x + 2 * w / 3], thirdsY: [y + h / 3, y + 2 * h / 3] };
}
/** Segment rects. All coordinates are relative to the WHOLE screen (top-left based, Y down).
 *  Equal mode: N equal vertical slices (fractional widths kept exact). Custom: each {name,x,y,w,h}. */
export function segments(s) {
  if (isCustomSegs(s)) return s.segs.map((g, i) => segRect(i, g.name || `Seg ${i + 1}`, +g.x || 0, +g.y || 0, Math.max(1, +g.w || 1), Math.max(1, +g.h || 1), true, g.id));
  const n = segCount(s), sw = s.w / n, out = [];
  for (let i = 0; i < n; i++) out.push(segRect(i, `Seg ${i + 1}`, i * sw, 0, sw, s.h, false));
  return out;
}
/** N whole-pixel segments that exactly cover W (extra pixels go to the leftmost segments): 11344/3 → 3782,3781,3781. */
export function splitEqualInt(W, H, n, names = []) {
  n = Math.max(1, Math.min(256, Math.floor(n) || 1));
  const base = Math.floor(W / n), extra = W - base * n, out = []; let x = 0;
  for (let i = 0; i < n; i++) { const w = base + (i < extra ? 1 : 0); out.push({ name: names[i] || `Seg ${i + 1}`, x, y: 0, w, h: H }); x += w; }
  return out;
}
/** Re-place segments left → right in list order (top-aligned unless align given), with an optional gap (px, may be negative = overlap). */
export function autoPlaceSegs(segs, gap = 0, H = null, align = 'top') {
  let x = 0;
  for (const g of segs) {
    g.x = x; x += g.w + gap;
    g.y = H == null || align === 'top' ? 0 : align === 'middle' ? Math.round((H - g.h) / 2) : H - g.h;
  }
  return segs;
}

const iv = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);   // overlap length (≤0 = none)
/** Uncovered parts of [0,W]×[0,H] given rects (coordinate compression, merged into rectangles). */
export function uncovered(W, H, rects, vertical = false) {
  if (vertical) return uncovered(H, W, rects.map(r => ({ x0: r.y0, x1: r.y1, y0: r.x0, y1: r.x1 })))
    .map(r => ({ x0: r.y0, x1: r.y1, y0: r.x0, y1: r.x1, w: r.h, h: r.w })).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const cl = rects.map(r => ({ x0: Math.max(0, r.x0), x1: Math.min(W, r.x1), y0: Math.max(0, r.y0), y1: Math.min(H, r.y1) })).filter(r => r.x1 > r.x0 && r.y1 > r.y0);
  const xs = [...new Set([0, W, ...cl.flatMap(r => [r.x0, r.x1])])].sort((a, b) => a - b);
  const ys = [...new Set([0, H, ...cl.flatMap(r => [r.y0, r.y1])])].sort((a, b) => a - b);
  let open = [], out = [];   // open: rects being extended downward
  for (let j = 0; j < ys.length - 1; j++) {
    const y0 = ys[j], y1 = ys[j + 1], my = (y0 + y1) / 2, runs = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const mx = (xs[i] + xs[i + 1]) / 2;
      if (!cl.some(r => mx > r.x0 && mx < r.x1 && my > r.y0 && my < r.y1)) {
        const last = runs[runs.length - 1];
        if (last && last.x1 === xs[i]) last.x1 = xs[i + 1]; else runs.push({ x0: xs[i], x1: xs[i + 1] });
      }
    }
    const next = [];
    for (const rn of runs) {
      const o = open.find(r => r.x0 === rn.x0 && r.x1 === rn.x1 && r.y1 === y0);
      if (o) { o.y1 = y1; next.push(o); } else next.push({ x0: rn.x0, x1: rn.x1, y0, y1 });
    }
    for (const o of open) if (!next.includes(o)) out.push(o);
    open = next;
  }
  out.push(...open);
  return out.map(r => ({ ...r, w: r.x1 - r.x0, h: r.y1 - r.y0 })).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}

/**
 * Do the segments exactly fill the screen? Returns
 * { level: 'ok'|'warn'|'error', exact, issues: [{level,text}], unused: [rects], overlaps: [rects + a,b], outside: [...],
 *   layout: 'row'|'column'|'free', totalW, totalH, unusedPx, badge }.
 * Equal-split screens always fill exactly (level 'ok'). Unused space = 'warn' (amber); overlaps / past the edge = 'error' (red).
 */
export function segFit(s) {
  const W = s.w, H = s.h, segs = segments(s);
  const res = { level: 'ok', exact: true, issues: [], unused: [], overlaps: [], outside: [], layout: 'row', totalW: W, totalH: H, unusedPx: 0, badge: '' };
  if (!isCustomSegs(s)) return res;
  const add = (level, text) => { res.issues.push({ level, text }); if (level === 'error' || res.level === 'ok') res.level = level; };
  const nm = g => g.name || `Seg ${g.n}`;
  // layout: a single row (every pair shares some height) or a single column
  const pairs = []; for (let a = 0; a < segs.length; a++) for (let b = a + 1; b < segs.length; b++) pairs.push([segs[a], segs[b]]);
  const row = pairs.every(([a, b]) => iv(a.y0, a.y1, b.y0, b.y1) > 0), col = !row && pairs.every(([a, b]) => iv(a.x0, a.x1, b.x0, b.x1) > 0);
  res.layout = row ? 'row' : col ? 'column' : 'free';
  res.totalW = segs.reduce((t, g) => t + g.w, 0); res.totalH = segs.reduce((t, g) => t + g.h, 0);
  if (row) {
    const d = W - res.totalW;
    if (d !== 0) { add('warn', `Segments total ${fmt1(res.totalW)} px wide; screen is ${W} px — ${d > 0 ? `${fmt1(d)} px short` : `${fmt1(-d)} px too wide`}.`); res.widthIssue = res.issues[res.issues.length - 1]; }
    for (const g of segs) if (g.h !== H) add('warn', `${nm(g)} is ${fmt1(g.h)} px tall; screen is ${H} px (${g.h < H ? `${fmt1(H - g.h)} px short` : `${fmt1(g.h - H)} px too tall`}).`);
  } else if (col) {
    const d = H - res.totalH;
    if (d !== 0) add('warn', `Segments total ${fmt1(res.totalH)} px tall; screen is ${H} px — ${d > 0 ? `${fmt1(d)} px short` : `${fmt1(-d)} px too tall`}.`);
    for (const g of segs) if (g.w !== W) add('warn', `${nm(g)} is ${fmt1(g.w)} px wide; screen is ${W} px (${g.w < W ? `${fmt1(W - g.w)} px short` : `${fmt1(g.w - W)} px too wide`}).`);
  }
  // past the screen edges
  for (const g of segs) {
    const L = Math.max(0, -g.x0), R = Math.max(0, g.x1 - W), T = Math.max(0, -g.y0), B = Math.max(0, g.y1 - H);
    if (L || R || T || B) {
      const parts = [R && `${fmt1(R)} px past the right edge`, L && `${fmt1(L)} px past the left edge`, B && `${fmt1(B)} px past the bottom`, T && `${fmt1(T)} px past the top`].filter(Boolean);
      const off = iv(g.x0, g.x1, 0, W) <= 0 || iv(g.y0, g.y1, 0, H) <= 0;
      res.outside.push({ seg: g, L, R, T, B, off });
      add('error', off ? `${nm(g)} is completely off the screen.` : `${nm(g)} extends ${parts.join(', ')}.`);
    }
  }
  // overlaps
  for (const [a, b] of pairs) {
    const ow = iv(a.x0, a.x1, b.x0, b.x1), oh = iv(a.y0, a.y1, b.y0, b.y1);
    if (ow > 0 && oh > 0) {
      const r = { a, b, x0: Math.max(a.x0, b.x0), x1: Math.min(a.x1, b.x1), y0: Math.max(a.y0, b.y0), y1: Math.min(a.y1, b.y1), w: ow, h: oh };
      res.overlaps.push(r);
      add('error', `${nm(a)} and ${nm(b)} overlap by ${fmt1(ow)} × ${fmt1(oh)} px (x ${fmt1(r.x0)}–${fmt1(r.x1)}${oh < H ? `, y ${fmt1(r.y0)}–${fmt1(r.y1)}` : ''}).`);
    }
  }
  // unused areas (described with where they are)
  res.unused = uncovered(W, H, segs, row);   // row layout → describe gaps as vertical strips
  for (const u of res.unused) {
    const left = segs.find(g => g.x1 === u.x0 && iv(g.y0, g.y1, u.y0, u.y1) > 0), right = segs.find(g => g.x0 === u.x1 && iv(g.y0, g.y1, u.y0, u.y1) > 0);
    const above = segs.find(g => g.y1 === u.y0 && iv(g.x0, g.x1, u.x0, u.x1) > 0);
    let where;
    if (u.w === W && u.h === H) where = 'the whole screen';
    else if (u.h === H || (u.y0 === 0 && u.y1 === H)) where = u.x0 === 0 ? 'on the left' : u.x1 === W ? 'on the right' : left && right ? `between ${nm(left)} and ${nm(right)}` : 'in the middle';
    else if (u.w === W) where = u.y0 === 0 ? 'along the top' : u.y1 === H ? 'along the bottom' : 'across the middle';
    else if (above && u.y1 === H) where = `below ${nm(above)}`;
    else if (left && right) where = `between ${nm(left)} and ${nm(right)}`;
    else where = `${u.y0 === 0 ? 'top' : u.y1 === H ? 'bottom' : 'middle'}-${u.x0 === 0 ? 'left' : u.x1 === W ? 'right' : 'middle'}`;
    u.where = where; res.unusedPx += u.w * u.h;
    add('warn', `${fmt1(u.w)} × ${fmt1(u.h)} px unused ${where} (x ${fmt1(u.x0)}–${fmt1(u.x1)}, y ${fmt1(u.y0)}–${fmt1(u.y1)}).`);
  }
  // say where the missing width went, e.g. "… 4 px short (4 px unused on the right)."
  if (res.widthIssue) {
    const strips = res.unused.filter(u => u.h === H);
    if (strips.length) res.widthIssue.text = res.widthIssue.text.replace(/\.$/, ` (${strips.map(u => `${fmt1(u.w)} px unused ${u.where}`).join(', ')}).`);
    delete res.widthIssue;
  }
  res.exact = res.level === 'ok';
  if (!res.exact) {
    const bits = [], dW = W - res.totalW, dH = H - res.totalH;
    if (row && dW) bits.push(`${fmt1(Math.abs(dW))} px ${dW > 0 ? 'short' : 'too wide'}`);
    if (col && dH) bits.push(`${fmt1(Math.abs(dH))} px ${dH > 0 ? 'short' : 'too tall'}`);
    if ((row && segs.some(g => g.h !== H)) || (col && segs.some(g => g.w !== W))) bits.push(row ? 'height mismatch' : 'width mismatch');
    if (!bits.length && res.unused.length) bits.push(res.unused.length === 1 ? `${fmt1(res.unused[0].w)}×${fmt1(res.unused[0].h)} unused` : `${res.unused.length} unused areas`);
    if (res.overlaps.length) bits.push(`${res.overlaps.length} overlap${res.overlaps.length > 1 ? 's' : ''}`);
    if (res.outside.length) bits.push(`${res.outside.length} past edge`);
    res.badge = bits.join(' · ');
  }
  return res;
}

/**
 * Scale a set of edge coordinates from [0, oldLen] to [0, newLen] in whole pixels (v1.5).
 * Every distinct edge is mapped once (round(e × f)), so segments that shared an edge still share it (no new gaps/overlaps);
 * the order of distinct edges is kept strictly increasing, so an original gap or overlap never rounds away to nothing.
 * Returns a function original-edge → new-edge.
 */
export function edgeMapper(edges, oldLen, newLen) {
  const f = newLen / oldLen, uniq = [...new Set([0, oldLen, ...edges])].sort((a, b) => a - b), map = new Map();
  let prev = -Infinity;
  const raw = uniq.map(e => (e === oldLen ? newLen : e === 0 ? 0 : rnd(e * f)));
  // forward: keep strictly increasing
  for (let i = 0; i < uniq.length; i++) { let v = raw[i]; if (i && v <= prev) v = prev + 1; raw[i] = v; prev = v; }
  // backward: an edge that was ≤ oldLen must stay ≤ newLen when possible (re-tighten after the forward push)
  const iL = uniq.indexOf(oldLen);
  if (raw[iL] > newLen) { raw[iL] = newLen; for (let i = iL - 1; i >= 0; i--) if (raw[i] >= raw[i + 1]) raw[i] = raw[i + 1] - 1; }
  uniq.forEach((e, i) => map.set(e, raw[i]));
  return e => map.get(e) ?? rnd(e * f);
}
/**
 * New W×H for a screen, keeping its segments and PiP boxes (v1.5).
 * mode 'scale' (default): segments + boxes scale by W and H factors via edgeMapper (butted segments stay butted,
 *   an original fit gap shrinks/grows proportionally but doesn't vanish).
 * mode 'keep': segment + box pixel sizes/offsets unchanged (an equal split is first frozen to its whole-px custom sizes,
 *   so it doesn't silently re-split) — segFit() then reports anything that no longer fits.
 * Physical sizes (pw/ph), names, ids, grid and other fields are kept. Returns a NEW screen object (input untouched).
 */
export function resizeScreen(s, W, H, mode = 'scale') {
  const c = JSON.parse(JSON.stringify(s)); c.w = W; c.h = H;
  if (mode === 'keep') {
    if (!isCustomSegs(s) && segCount(s) > 1) { c.segMode = 'custom'; c.segs = splitEqualInt(s.w, s.h, segCount(s)).map((g, i) => ({ id: `seg_${i}_${Date.now().toString(36)}`, ...g, pw: null, ph: null })); c.segments = c.segs.length; }
    return c;
  }
  if (isCustomSegs(s)) {
    const mx = edgeMapper(s.segs.flatMap(g => [g.x, g.x + g.w]), s.w, W), my = edgeMapper(s.segs.flatMap(g => [g.y, g.y + g.h]), s.h, H);
    c.segs = s.segs.map((g, i) => { const x0 = mx(g.x), x1 = mx(g.x + g.w), y0 = my(g.y), y1 = my(g.y + g.h); return { ...c.segs[i], x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) }; });
  }
  const fx = W / s.w, fy = H / s.h;
  c.boxes = (s.boxes || []).map((b, i) => { const x0 = rnd(b.x * fx), y0 = rnd(b.y * fy); return { ...c.boxes[i], x: x0, y: y0, w: Math.max(1, rnd((b.x + b.w) * fx) - x0), h: Math.max(1, rnd((b.y + b.h) * fy) - y0) }; });
  if (c.grid && c.grid.mode === 'px') c.grid.step = c.grid.step;   // grids are in px and stay as-is (LED panels don't scale)
  return c;
}

/** Physical size → pixel density. unit 'ft' | 'm'. pw/ph = physical width/height of a w×h px segment. */
export const MM_PER = { ft: 304.8, m: 1000 };
export function physInfo(w, h, pw, ph, unit = 'ft') {
  if (!(pw > 0) && !(ph > 0)) return null;
  const mm = MM_PER[unit] || 304.8, o = { unit };
  if (pw > 0) { o.pxPerUnitW = w / pw; o.pitchW = pw * mm / w; }
  if (ph > 0) { o.pxPerUnitH = h / ph; o.pitchH = ph * mm / h; }
  o.square = o.pitchW && o.pitchH ? Math.abs(o.pitchW / o.pitchH - 1) < 0.01 : null;   // within 1 %
  return o;
}

/** Panel-grid presets (W×H px). */
export const PANEL_PRESETS = { led192: [192, 192], led384: [192, 384] };
export function panelSize(s) {
  const g = s.grid || {};
  if (PANEL_PRESETS[g.mode]) return PANEL_PRESETS[g.mode];
  if (g.mode === 'panel') return [Math.max(1, +g.panelW || 1), Math.max(1, +g.panelH || 1)];
  return null;
}
/** Panel tiling from the top-left origin (partial panels at right/bottom). */
export function panelInfo(s) {
  const p = panelSize(s); if (!p) return null;
  const [pw, ph] = p, cx = s.w / pw, cy = s.h / ph;
  const fullCols = Math.floor(cx + 1e-9), fullRows = Math.floor(cy + 1e-9);
  const cols = Math.ceil(cx - 1e-9), rows = Math.ceil(cy - 1e-9);
  const partialW = s.w - fullCols * pw, partialH = s.h - fullRows * ph;
  const whole = isInt(cx) && isInt(cy);
  return { pw, ph, colsExact: cx, rowsExact: cy, cols, rows, fullCols, fullRows, total: cols * rows, fullTotal: fullCols * fullRows,
    partialW: partialW > 1e-6 ? partialW : 0, partialH: partialH > 1e-6 ? partialH : 0, whole,
    exactText: `${fmt2(cx)} × ${fmt2(cy)} panels`, countText: `${cols} × ${rows} = ${cols * rows}` };
}
/** Origin offset to subtract for display: top-left (0,0) or center. */
export function originOf(s, origin) { return origin === 'center' ? { x: s.w / 2, y: s.h / 2 } : { x: 0, y: 0 }; }

/** Custom grid lines (interior lines only). */
export function gridLines(s) {
  const g = s.grid || {};
  const xs = [], ys = [];
  if (g.mode === 'nm') {
    const c = Math.max(1, Math.floor(+g.cols || 1)), r = Math.max(1, Math.floor(+g.rows || 1));
    for (let i = 1; i < c; i++) xs.push(s.w * i / c);
    for (let j = 1; j < r; j++) ys.push(s.h * j / r);
  } else if (g.mode === 'px') {
    const st = Math.max(1, +g.step || 1);
    const sty = Math.max(1, +(g.stepY || g.step) || 1);
    for (let x = st; x < s.w - EPS && xs.length < 2000; x += st) xs.push(x);
    for (let y = sty; y < s.h - EPS && ys.length < 2000; y += sty) ys.push(y);
  } else {
    const p = panelSize(s); if (!p) return null;
    for (let x = p[0]; x < s.w - EPS && xs.length < 2000; x += p[0]) xs.push(x);
    for (let y = p[1]; y < s.h - EPS && ys.length < 2000; y += p[1]) ys.push(y);
  }
  return { xs, ys };
}

/** Grouped readout rows: {group,label,x,y} (x or y null => line). */
export function keyRows(s) {
  const { w, h } = s, rows = [];
  const P = (group, label, x, y) => rows.push({ group, label, x, y });
  P('Corners', 'Top-left', 0, 0); P('Corners', 'Top-right', w, 0);
  P('Corners', 'Bottom-left', 0, h); P('Corners', 'Bottom-right', w, h);
  P('Center', 'Center point', w / 2, h / 2);
  P('Center', 'Top-center', w / 2, 0); P('Center', 'Bottom-center', w / 2, h);
  P('Center', 'Left-middle', 0, h / 2); P('Center', 'Right-middle', w, h / 2);
  P('Thirds', 'Vertical ⅓', w / 3, null); P('Thirds', 'Vertical ⅔', 2 * w / 3, null);
  P('Thirds', 'Horizontal ⅓', null, h / 3); P('Thirds', 'Horizontal ⅔', null, 2 * h / 3);
  P('Thirds', '⅓ × ⅓ (TL)', w / 3, h / 3); P('Thirds', '⅔ × ⅓ (TR)', 2 * w / 3, h / 3);
  P('Thirds', '⅓ × ⅔ (BL)', w / 3, 2 * h / 3); P('Thirds', '⅔ × ⅔ (BR)', 2 * w / 3, 2 * h / 3);
  const segs = segments(s);
  if (hasSegs(s) && !isCustomSegs(s)) {
    for (let i = 1; i < segs.length; i++) P('Segment boundaries', `Seg ${i} | Seg ${i + 1}`, segs[i].x0, null);
    for (const g of segs) {
      const grp = `Segment ${g.n} (${fmt1(g.x0)}–${fmt1(g.x1)})`;
      P(grp, 'Center', g.cx, g.cy);
      P(grp, 'Left edge', g.x0, null); P(grp, 'Right edge', g.x1, null);
      P(grp, 'Thirds ⅓ / ⅔', g.thirds[0], null); rows[rows.length - 1].x2 = g.thirds[1];
      P(grp, 'Top-center', g.cx, 0); P(grp, 'Bottom-center', g.cx, h);
    }
  } else if (isCustomSegs(s)) {
    for (const g of segs) {
      const grp = `Segment ${g.n} · ${g.name} ${fmt1(g.w)}×${fmt1(g.h)} (x ${fmt1(g.x0)}–${fmt1(g.x1)})`;
      P(grp, 'Center', g.cx, g.cy);
      P(grp, 'Top-left', g.x0, g.y0); P(grp, 'Bottom-right', g.x1, g.y1);
      P(grp, 'Left edge', g.x0, null); P(grp, 'Right edge', g.x1, null);
      if (g.y0 !== 0 || g.y1 !== h) { P(grp, 'Top edge', null, g.y0); P(grp, 'Bottom edge', null, g.y1); }
      P(grp, 'Thirds ⅓ / ⅔', g.thirds[0], null); rows[rows.length - 1].x2 = g.thirds[1];
      P(grp, 'Top-center', g.cx, g.y0); P(grp, 'Bottom-center', g.cx, g.y1);
    }
  }
  const gl = gridLines(s);
  if (gl && gl.xs.length + gl.ys.length <= 80) {
    const pn = panelSize(s), grp = pn ? `Panel grid ${pn[0]}×${pn[1]}` : 'Custom grid';
    gl.xs.forEach((x, i) => P(grp, pn ? `Col ${i + 1} | ${i + 2}` : `V line ${i + 1}`, x, null));
    gl.ys.forEach((y, i) => P(grp, pn ? `Row ${i + 1} | ${i + 2}` : `H line ${i + 1}`, null, y));
  }
  return rows;
}

/** Largest box of ratio rw:rh inside W×H, centered. W/H floored to whole px. */
export function largestFit(W, H, rw, rh) {
  if (!(rw > 0 && rh > 0 && W > 0 && H > 0)) return null;
  let w, h;
  if (W / H > rw / rh) { h = H; w = H * rw / rh; } else { w = W; h = W * rh / rw; }
  w = Math.min(W, Math.floor(w + 1e-6)); h = Math.min(H, Math.floor(h + 1e-6));
  return { w, h, x: (W - w) / 2, y: (H - h) / 2 };
}

/** Snap targets for a screen (optionally including other boxes). */
export function snapTargets(s, opts = {}) {
  const xs = [0, s.w, s.w / 2, s.w / 3, 2 * s.w / 3];
  const ys = [0, s.h, s.h / 2, s.h / 3, 2 * s.h / 3];
  const segs = segments(s);
  if (hasSegs(s)) for (const g of segs) { xs.push(g.x0, g.cx, g.x1); if (g.custom) ys.push(g.y0, g.cy, g.y1); }
  if (opts.grid) { const gl = gridLines(s); if (gl) { xs.push(...gl.xs); ys.push(...gl.ys); } }
  for (const b of (s.boxes || [])) {
    if (b.id === opts.excludeId) continue;
    xs.push(b.x, b.x + b.w / 2, b.x + b.w); ys.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  return { xs, ys };
}

/** Find best snap for any anchor value toward any target within thr. */
export function bestSnap(anchors, targets, thr) {
  let best = null;
  for (const a of anchors) for (const t of targets) {
    const d = t - a;
    if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t };
  }
  return best;
}

/** Parse "16:9", "16x9", "1.78", "2.39:1". Returns [rw, rh] or null. */
export function parseRatio(str) {
  const m = String(str).trim().match(/^(\d*\.?\d+)\s*[:x×/]\s*(\d*\.?\d+)$/i);
  if (m) { const a = +m[1], b = +m[2]; return a > 0 && b > 0 ? [a, b] : null; }
  const d = parseFloat(str); return d > 0 ? [d, 1] : null;
}
