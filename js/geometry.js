// ShowCrew PixelMap — pure geometry / math helpers (no DOM).
// Convention: pixel EDGE coordinates. A W×H screen spans x 0→W, y 0→H.
// (The last pixel column starts at W−1; a full-width box is x=0, w=W.)

export const EPS = 1e-9;
export const isInt = v => Math.abs(v - Math.round(v)) < 1e-6;
export const rnd = v => Math.round(v + (v >= 0 ? EPS : -EPS)); // half rounds up (away from zero)
/** Exact value with 1 decimal when fractional ("1194.7"), plain integer otherwise. */
export const fmt1 = v => (isInt(v) ? String(rnd(v)) : (Math.round(v * 10) / 10).toFixed(1));
/** Human string: "1194.7 (≈1195)" or "1280". */
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

export function segCount(s) { return Math.max(1, Math.min(256, Math.floor(+s.segments || 1))); }

/** Equal vertical segments; all coordinates are relative to the WHOLE screen. */
export function segments(s) {
  const n = segCount(s), sw = s.w / n, out = [];
  for (let i = 0; i < n; i++) {
    const x0 = i * sw, x1 = (i + 1) * sw;
    out.push({ i, n: i + 1, x0, x1, w: sw, h: s.h, cx: x0 + sw / 2, cy: s.h / 2, thirds: [x0 + sw / 3, x0 + 2 * sw / 3] });
  }
  return out;
}

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
  } else return null;
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
  if (segs.length > 1) {
    for (let i = 1; i < segs.length; i++) P('Segment boundaries', `Seg ${i} | Seg ${i + 1}`, segs[i].x0, null);
    for (const g of segs) {
      const grp = `Segment ${g.n} (${fmt1(g.x0)}–${fmt1(g.x1)})`;
      P(grp, 'Center', g.cx, g.cy);
      P(grp, 'Left edge', g.x0, null); P(grp, 'Right edge', g.x1, null);
      P(grp, 'Thirds ⅓ / ⅔', g.thirds[0], null); rows[rows.length - 1].x2 = g.thirds[1];
      P(grp, 'Top-center', g.cx, 0); P(grp, 'Bottom-center', g.cx, h);
    }
  }
  const gl = gridLines(s);
  if (gl && gl.xs.length + gl.ys.length <= 80) {
    gl.xs.forEach((x, i) => P('Custom grid', `V line ${i + 1}`, x, null));
    gl.ys.forEach((y, i) => P('Custom grid', `H line ${i + 1}`, null, y));
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
  if (segs.length > 1) for (const g of segs) { xs.push(g.x0, g.cx, g.x1); }
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
