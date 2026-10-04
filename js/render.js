// ShowCrew PixelMap — canvas renderer shared by the live preview and PNG export.
import * as G from './geometry.js';

const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * Draw a screen in native pixel space (ctx must already be transformed so 1 unit = 1 screen px).
 * o: { u: native px per display px, lw: line width (display px), inc: {...}, colors: {bg,line,seg,box,text},
 *      boxOwnColors, fs: font size (native px), crisp: snap lines to whole px (export), selectedId, snapLines, glow }
 */
export function drawScreen(ctx, s, o) {
  const { w, h } = s, u = o.u, lw = o.lw * u, inc = o.inc, C = o.colors;
  const px = v => (o.crisp ? (Math.round(lw) % 2 === 1 ? Math.floor(v) + 0.5 : Math.round(v)) : v);
  const vline = (x, a = 1) => { ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(px(x), 0); ctx.lineTo(px(x), h); ctx.stroke(); ctx.globalAlpha = 1; };
  const hline = (y, a = 1) => { ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(0, px(y)); ctx.lineTo(w, px(y)); ctx.stroke(); ctx.globalAlpha = 1; };
  const glow = (c) => { if (o.glow) { ctx.shadowColor = c; ctx.shadowBlur = 6; } };
  const noGlow = () => { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; };
  const cross = (x, y, r, ring) => {
    ctx.beginPath(); ctx.moveTo(px(x) - r, px(y)); ctx.lineTo(px(x) + r, px(y)); ctx.moveTo(px(x), px(y) - r); ctx.lineTo(px(x), px(y) + r); ctx.stroke();
    if (ring) { ctx.beginPath(); ctx.arc(px(x), px(y), r * 0.55, 0, Math.PI * 2); ctx.stroke(); }
  };

  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  if (inc.bg) { ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h); }
  ctx.lineCap = 'butt'; ctx.lineWidth = lw;
  const segs = G.segments(s);

  if (inc.grid) {
    const gl = G.gridLines(s);
    const pi = G.panelInfo(s);
    if (pi && (pi.partialW || pi.partialH)) {
      ctx.fillStyle = hexA(C.seg, 0.09);
      if (pi.partialW) ctx.fillRect(w - pi.partialW, 0, pi.partialW, h);
      if (pi.partialH) ctx.fillRect(0, h - pi.partialH, w - pi.partialW, pi.partialH);
    }
    if (gl && pi) { ctx.strokeStyle = C.line; ctx.setLineDash([]); ctx.lineWidth = Math.max(u, lw * 0.8); gl.xs.forEach(x => vline(x, 0.5)); gl.ys.forEach(y => hline(y, 0.5)); ctx.lineWidth = lw; }
    else if (gl) { ctx.strokeStyle = C.line; ctx.setLineDash([]); ctx.lineWidth = Math.max(u * 0.75, lw * 0.6); gl.xs.forEach(x => vline(x, 0.32)); gl.ys.forEach(y => hline(y, 0.32)); ctx.lineWidth = lw; }
  }
  if (segs.length > 1) {
    if (inc.segGuides) {
      ctx.strokeStyle = C.seg; ctx.setLineDash([lw * 2, lw * 3]);
      for (const g of segs) { vline(g.cx, 0.55); vline(g.thirds[0], 0.3); vline(g.thirds[1], 0.3); }
      ctx.setLineDash([]);
    }
    if (inc.segDividers) { ctx.strokeStyle = C.seg; glow(C.seg); for (let i = 1; i < segs.length; i++) vline(segs[i].x0, 0.95); noGlow(); }
    if (inc.segCenters) {
      ctx.strokeStyle = C.seg; const r = Math.min(segs[0].w, h) * 0.12;
      for (const g of segs) cross(g.cx, g.cy, Math.max(r, 6 * u), true);
    }
  }
  if (inc.thirds) {
    ctx.strokeStyle = C.line; ctx.setLineDash([lw * 6, lw * 4]);
    vline(w / 3, 0.6); vline(2 * w / 3, 0.6); hline(h / 3, 0.6); hline(2 * h / 3, 0.6); ctx.setLineDash([]);
  }
  if (inc.centerLines) { ctx.strokeStyle = C.line; glow(C.line); vline(w / 2, 0.9); hline(h / 2, 0.9); noGlow(); }
  if (inc.crosshair) {
    ctx.strokeStyle = C.line; ctx.lineWidth = lw * 1.5; glow(C.line);
    cross(w / 2, h / 2, Math.max(Math.min(w, h) * 0.06, 10 * u), true); noGlow(); ctx.lineWidth = lw;
  }
  if (inc.outline) { ctx.strokeStyle = C.line; ctx.lineWidth = lw * 2; ctx.strokeRect(lw, lw, w - lw * 2, h - lw * 2); ctx.lineWidth = lw; }

  // PiP boxes
  if (inc.boxes) {
    for (const b of s.boxes || []) {
      const c = o.boxOwnColors ? b.color : C.box;
      ctx.fillStyle = hexA(c, 0.16); ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = c; ctx.lineWidth = lw * (b.id === o.selectedId ? 2 : 1.4); glow(c);
      ctx.strokeRect(b.x + ctx.lineWidth / 2, b.y + ctx.lineWidth / 2, b.w - ctx.lineWidth, b.h - ctx.lineWidth); noGlow();
      ctx.lineWidth = lw; cross(b.x + b.w / 2, b.y + b.h / 2, Math.max(Math.min(b.w, b.h) * 0.06, 6 * u), false);
    }
  }

  // Text
  const fs = o.fs;
  const text = (t, x, y, opt = {}) => {
    ctx.font = `${opt.bold ? '700 ' : '500 '}${opt.fs || fs}px ${MONO}`;
    const tw = ctx.measureText(t).width, f = opt.fs || fs, pad = f * 0.35;
    let tx = opt.align === 'center' ? x - tw / 2 : opt.align === 'right' ? x - tw : x;
    let ty = y;
    tx = Math.max(pad, Math.min(w - tw - pad, tx)); ty = Math.max(f + pad, Math.min(h - pad, ty));
    ctx.lineJoin = 'round'; ctx.lineWidth = f * 0.28; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(t, tx, ty);
    ctx.fillStyle = opt.color || C.text; ctx.fillText(t, tx, ty); ctx.lineWidth = lw;
  };
  const F = G.fmt1;
  // Display coordinates relative to the chosen origin (top-left or center). Y always increases downward.
  const org = o.origin || { x: 0, y: 0 }, centered = org.x !== 0 || org.y !== 0;
  const X = v => F(v - org.x), Y = v => F(v - org.y);
  const pinfo = inc.grid ? G.panelInfo(s) : null;
  // Panel numbers (C# R#) drawn from the top-left origin
  if (pinfo && inc.panelLabels && pinfo.total <= 4000) {
    const pf = Math.min(fs * 0.75, pinfo.pw * 0.16, pinfo.ph * 0.2);
    if (pf >= 7 * u) for (let r = 0; r < pinfo.rows; r++) for (let c = 0; c < pinfo.cols; c++) {
      // centered in the visible part of each panel (keeps corners free for coordinate labels)
      const x0 = c * pinfo.pw, y0 = r * pinfo.ph, vw = Math.min(pinfo.pw, w - x0), vh = Math.min(pinfo.ph, h - y0), t = `C${c + 1} R${r + 1}`;
      ctx.font = `600 ${pf}px ${MONO}`; const tw = ctx.measureText(t).width; if (tw > vw * 0.95 || vh < pf * 1.4) continue;
      ctx.globalAlpha = 0.6; ctx.fillStyle = C.text; ctx.fillText(t, x0 + (vw - tw) / 2, y0 + vh / 2 + pf * 0.35); ctx.globalAlpha = 1;
    }
  }
  // Corner labels: origin is unmistakably at the top-left (or center), W,H at bottom-right
  if (inc.coordLabels) {
    const cf = fs * 0.8;
    text(`${X(0)},${Y(0)}${centered ? '' : '  x→ y↓'}`, cf * 0.35, cf * 1.25, { fs: cf, bold: !centered });
    text(`${X(w)},${Y(0)}`, w - cf * 0.35, cf * 1.25, { fs: cf, align: 'right' });
    text(`${X(0)},${Y(h)}`, cf * 0.35, h - cf * 0.45, { fs: cf });
    text(`${X(w)},${Y(h)}`, w - cf * 0.35, h - cf * 0.45, { fs: cf, align: 'right' });
  }
  let ly = fs * 2.75;
  if (inc.labels) {
    text(`${s.name}  ${w}×${h}`, fs * 0.6, ly, { bold: true, fs: fs * 1.25 }); ly += fs * 1.4;
    if (segs.length > 1) { text(`${segs.length} segments × ${F(segs[0].w)}×${h}`, fs * 0.6, ly, { color: C.seg }); ly += fs * 1.3; }
    if (pinfo) { text(`Panels ${pinfo.pw}×${pinfo.ph}: ${pinfo.countText}${pinfo.whole ? '' : ` (${pinfo.exactText})`}`, fs * 0.6, ly, { color: C.text, fs: fs * 0.85 }); ly += fs * 1.2; }
    if (centered) { text('Origin 0,0 = center · Y down', fs * 0.6, ly, { fs: fs * 0.8, color: C.line }); ly += fs * 1.2; }
  }
  if (inc.boxes && (inc.labels || inc.coordLabels)) {
    for (const b of s.boxes || []) {
      const c = o.boxOwnColors ? b.color : C.box, lines = [];
      if (inc.labels) lines.push([b.name, c, true, 1]);
      if (inc.coordLabels) { lines.push([`${centered ? 'TL ' : ''}x${X(b.x)} y${Y(b.y)}`, C.text, false, 0.85]); lines.push([`${b.w}×${b.h}`, C.text, false, 0.85]); lines.push([`ctr ${X(b.x + b.w / 2)}, ${Y(b.y + b.h / 2)}`, C.text, false, 0.85]); }
      const lh = fs * 1.25, need = lh * lines.length + fs * 0.6;
      // inside top-left when the box is tall enough, otherwise stacked just below (or above) the box
      let y0 = b.h >= need + fs * 2 ? b.y + fs * 1.2 : (b.y + b.h + need <= h ? b.y + b.h + fs * 1.1 : b.y - need + fs * 0.9);
      lines.forEach(([t, col, bold, k], i) => text(t, b.x + fs * 0.4, y0 + i * lh, { color: col, bold, fs: fs * k }));
    }
  }
  if (inc.coordLabels) {
    text(`${X(w / 2)}, ${Y(h / 2)}${centered ? '  origin' : ''}`, w / 2 + fs * 0.5, h / 2 - fs * 0.5, { bold: true });
    if (inc.thirds) for (const [x, y] of [[w / 3, h / 3], [2 * w / 3, h / 3], [w / 3, 2 * h / 3], [2 * w / 3, 2 * h / 3]]) text(`${X(x)}, ${Y(y)}`, x + fs * 0.4, y - fs * 0.4, { fs: fs * 0.8 });
    if (segs.length > 1 && (inc.segCenters || inc.segDividers)) {
      for (const g of segs) {
        if (inc.segCenters) text(`${X(g.cx)}`, g.cx, h - fs * 1.9, { align: 'center', color: C.seg, fs: fs * 0.85 });
        if (inc.segDividers && g.i > 0) text(`${X(g.x0)}`, g.x0, ly + fs * 0.6, { align: 'center', color: C.seg, fs: fs * 0.75 });
      }
    }
  }

  // Interactive overlays (preview only)
  if (o.snapLines && o.snapLines.length) {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = u * 1.5; ctx.setLineDash([u * 4, u * 3]); glow('#ffffff');
    for (const sl of o.snapLines) sl.axis === 'x' ? vline(sl.v, 1) : hline(sl.v, 1);
    ctx.setLineDash([]); noGlow();
  }
  const sel = (s.boxes || []).find(b => b.id === o.selectedId);
  if (sel && o.handles) {
    const r = o.handleR * u;
    for (const [hx, hy] of handlePoints(sel)) {
      ctx.fillStyle = '#05080f'; ctx.strokeStyle = sel.color; ctx.lineWidth = u * 2;
      ctx.beginPath(); ctx.rect(hx - r, hy - r, r * 2, r * 2); ctx.fill(); ctx.stroke();
    }
  }
  if (o.probe) {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = u; ctx.globalAlpha = 0.8; cross(o.probe.x, o.probe.y, 14 * u, false); ctx.globalAlpha = 1;
  }
  ctx.restore();
}

export function handlePoints(b) {
  return [[b.x, b.y, 'nw'], [b.x + b.w, b.y, 'ne'], [b.x, b.y + b.h, 'sw'], [b.x + b.w, b.y + b.h, 'se']];
}

/** Global canvas overview: all screens at their offsets. ctx transformed to canvas units. */
export function drawOverview(ctx, job, o) {
  const u = o.u;
  for (const s of job.screens) {
    const on = s.id === o.selectedId;
    ctx.save(); ctx.translate(s.x, s.y);
    drawScreen(ctx, s, { u, lw: 1, inc: { bg: true, outline: false, crosshair: true, centerLines: false, thirds: false, grid: false, segDividers: true, segCenters: false, segGuides: false, boxes: true, labels: false, coordLabels: false },
      colors: { bg: on ? '#0c2236' : '#0a1626', line: '#00e5ff', seg: '#ffb020', box: '#ff3df2', text: '#d8f6ff' }, boxOwnColors: true, fs: 11 * u });
    ctx.strokeStyle = on ? '#00e5ff' : 'rgba(0,229,255,0.45)'; ctx.lineWidth = u * (on ? 2.5 : 1.2);
    if (on) { ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 10; }
    ctx.strokeRect(0, 0, s.w, s.h); ctx.shadowBlur = 0;
    ctx.font = `700 ${12 * u}px ${MONO}`; ctx.fillStyle = '#d8f6ff';
    ctx.fillText(s.name, 6 * u, 16 * u);
    ctx.font = `500 ${10.5 * u}px ${MONO}`; ctx.fillStyle = '#7fd8ea';
    ctx.fillText(`${s.w}×${s.h}`, 6 * u, 30 * u);
    ctx.fillStyle = '#ffb020'; ctx.fillText(`@ ${s.x}, ${s.y}`, 6 * u, 44 * u);
    ctx.restore();
  }
  // Global canvas origin is always the canvas top-left (0,0), Y down
  ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = u * 1.5;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(28 * u, 0); ctx.moveTo(0, 0); ctx.lineTo(0, 28 * u); ctx.stroke();
  ctx.font = `700 ${11 * u}px ${MONO}`; ctx.fillText('0,0 global  x→ y↓', 4 * u, -6 * u); ctx.restore();
  if (o.snapLines) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = u * 1.5; ctx.setLineDash([u * 4, u * 3]);
    for (const sl of o.snapLines) { ctx.beginPath(); if (sl.axis === 'x') { ctx.moveTo(sl.v, o.b.y0); ctx.lineTo(sl.v, o.b.y1); } else { ctx.moveTo(o.b.x0, sl.v); ctx.lineTo(o.b.x1, sl.v); } ctx.stroke(); }
    ctx.setLineDash([]);
  }
}

export function canvasBounds(job) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of job.screens) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x + s.w); y1 = Math.max(y1, s.y + s.h); }
  if (!isFinite(x0)) return { x0: 0, y0: 0, x1: 1920, y1: 1080 };
  return { x0, y0, x1, y1 };
}

export function exportFontSize(s, ex) {
  return ex.textSize > 0 ? ex.textSize : Math.max(12, Math.min(72, Math.round(Math.min(s.w, s.h) / 38)));
}

/** Render a screen at native resolution and return a PNG Blob. */
export function screenToBlob(s, ex, originMode = 'tl') {
  const c = document.createElement('canvas'); c.width = s.w; c.height = s.h;
  const ctx = c.getContext('2d');
  drawScreen(ctx, s, { u: 1, lw: ex.lw, inc: ex.inc, colors: { bg: ex.bg, line: ex.line, seg: ex.seg, box: ex.box, text: ex.text },
    boxOwnColors: ex.boxOwnColors, fs: exportFontSize(s, ex), crisp: true, origin: G.originOf(s, originMode) });
  return new Promise((res, rej) => c.toBlob(b => { c.width = c.height = 0; b ? res(b) : rej(new Error('PNG encode failed (canvas too large for this device?)')); }, 'image/png'));
}
