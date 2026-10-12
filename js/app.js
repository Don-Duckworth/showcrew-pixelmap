// ShowCrew PixelMap — UI controller.
import * as G from './geometry.js';
import * as Store from './store.js';
import { drawScreen, drawOverview, canvasBounds, handlePoints, screenToBlob } from './render.js';
import { createSync, syncConfigured } from './sync.js';
import * as SL from './slides.js';
import { buildPptx } from './pptx.js';
import * as CFG from './config.js';   // namespace import: an older config.js without ALLOW_SIGNUP still loads
const ALLOW_SIGNUP = CFG.ALLOW_SIGNUP === true;

const $ = (sel, el = document) => el.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const F = G.fmt1;

let S = Store.load() || Store.seed();
const ui = { tab: 'coords', sel: null, view: 'screen', drag: null, snapLines: [], probe: null, hover: null, exportFiles: [], k: 1, ox: 0, oy: 0 };
const PREVIEW_COLORS = { bg: '#081424', line: '#00e5ff', seg: '#ffb020', box: '#ff3df2', text: '#d8f6ff' };

const job = () => S.jobs.find(j => j.id === S.currentJobId) || S.jobs[0];
const scr = () => { const j = job(); return j.screens.find(s => s.id === j.currentScreenId) || j.screens[0]; };
const box = () => (scr().boxes || []).find(b => b.id === ui.sel) || null;
const isGlobal = () => job().mode === 'global';
// Display origin: 'tl' (top-left = 0,0, default) or 'center' (screen center = 0,0). Y always increases downward.
// Internal storage is always top-left based; these convert for display / entry only.
const isCtr = () => job().origin === 'center';
const offX = s => (isCtr() ? s.w / 2 : 0), offY = s => (isCtr() ? s.h / 2 : 0);
const OX = (s, x) => (x == null ? null : x - offX(s)), OY = (s, y) => (y == null ? null : y - offY(s));
const n1 = v => String(Math.round(v * 10) / 10);
let saveT = 0;
function persist() { const j = job(); j.updated = Date.now(); delete j.seed; clearTimeout(saveT); saveT = setTimeout(() => Store.save(S), 150); sync.schedule(); }
function commit(parts = 'all') { persist(); render(parts); }

// ---------- formatting ----------
function val(v) {
  if (v == null) return '<span class="v dim">—</span>';
  return G.isInt(v) ? `<span class="v">${G.rnd(v)}</span>` : `<span class="v">${F(v)}</span><span class="r">≈${G.rnd(v)}</span>`;
}
const copyText = (x, y) => [x, y].filter(v => v != null).map(v => G.rnd(v)).join(', ');

// ---------- top-level render ----------
function render(parts = 'all') {
  const all = parts === 'all';
  if (all || parts.includes('top')) renderTop();
  if (all || parts.includes('screens')) renderScreens();
  if (all || parts.includes('chips')) renderChips();
  if (all || parts.includes('panel')) renderPanel();
  drawStage(); renderStatus();
}

function renderTop() {
  const j = job();
  $('#jobBtn .jobname').textContent = j.name;
  $('#jobBtn .jobmeta').textContent = `${j.screens.length} screen${j.screens.length === 1 ? '' : 's'}`;
  document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === j.mode));
  document.querySelectorAll('#originSeg button').forEach(b => b.classList.toggle('on', b.dataset.origin === (j.origin || 'tl')));
  document.title = `${j.name} · ShowCrew PixelMap`;
}

function renderScreens() {
  const j = job(), cur = scr();
  const gl = isGlobal();
  $('#screens').innerHTML = `
    <div class="pane-h"><span>SCREENS</span><button class="btn sm ghost" data-act="openSlideDlg" data-k="new">＋ Add</button></div>
    <div class="scr-list">${j.screens.map((s, i) => {
      const a = G.aspect(s.w, s.h), n = G.segCount(s), fit = G.segFit(s);
      return `<button class="scr-card ${s.id === cur.id ? 'on' : ''}" data-act="pickScreen" data-id="${s.id}">
        <span class="scr-idx">${String(i + 1).padStart(2, '0')}</span>
        <span class="scr-name">${esc(s.name)}</span>
        <span class="scr-res">${s.w}×${s.h}</span>
        <span class="scr-meta">${a.text} · ${a.decText}${G.hasSegs(s) ? ` · <b>${n} seg${G.isCustomSegs(s) ? (G.isFill(s) ? ' custom · fill' : ' custom') : ''}</b>` : ''}${s.boxes.length ? ` · ${s.boxes.length} box` : ''}${gl ? `<br><i>@ ${s.x}, ${s.y}</i>` : ''}</span>
        ${fit.exact ? '' : `<span class="fitbadge ${fit.level}" title="${esc(fit.issues.map(i => i.text).join('\n'))}">⚠ ${esc(fit.badge)}</span>`}
      </button>`;
    }).join('')}</div>
    ${gl ? `<div class="pane-f">
      <div class="lbl">GLOBAL CANVAS ${(() => { const b = canvasBounds(j); return `${b.x1 - b.x0}×${b.y1 - b.y0}`; })()}</div>
      <div class="col"><select id="placeAlign" class="inp"><option value="top">Align top</option><option value="middle">Align middle</option><option value="bottom">Align bottom</option></select>
      <button class="btn sm" data-act="autoPlace">Auto-place L→R</button></div></div>` : ''}`;
}

function chip(key, label, on, act = 'toggleView') { return `<button class="chip ${on ? 'on' : ''}" data-act="${act}" data-key="${key}">${label}</button>`; }
function renderChips() {
  const v = job().view, gl = isGlobal();
  $('#chips').innerHTML =
    (gl ? `<div class="seg mini">${['screen', 'canvas'].map(m => `<button class="${ui.view === m ? 'on' : ''}" data-act="stageView" data-v="${m}">${m === 'screen' ? 'Screen' : 'Canvas'}</button>`).join('')}</div>` : '') +
    chip('center', '✛ Center', v.center) + chip('centerLines', '┼ Lines', v.centerLines) + chip('thirds', '⅓ Thirds', v.thirds) +
    chip('grid', '▦ Grid', v.grid) + chip('segments', '▥ Segments', v.segments) + chip('segGuides', '┊ Seg guides', v.segGuides) +
    chip('boxes', '▣ Boxes', v.boxes) + chip('labels', 'Aa Labels', v.labels) + chip('snap', '⌖ Snap', v.snap);
}

function renderStatus() {
  const s = scr(), b = box(), gl = isGlobal();
  let t = `<b>${esc(s.name)}</b> ${s.w}×${s.h}`;
  const p = ui.hover || ui.probe;
  if (ui.view === 'canvas' && gl) t = `<b>Global canvas</b> — drag screens to reposition (snaps to edges)`;
  else if (p) t += ` <span class="sep">│</span> ⌖ x <b>${G.rnd(OX(s, p.x))}</b> y <b>${G.rnd(OY(s, p.y))}</b>${gl ? ` <span class="g">(global ${G.rnd(p.x + s.x)}, ${G.rnd(p.y + s.y)})</span>` : ''}`;
  if (b) t += ` <span class="sep">│</span> <span style="color:${b.color}">■</span> ${esc(b.name)} ${isCtr() ? 'TL ' : ''}x${n1(OX(s, b.x))} y${n1(OY(s, b.y))} ${b.w}×${b.h}`;
  $('#status').innerHTML = t;
}

// ---------- panel ----------
const TABS = [['coords', 'Coords'], ['boxes', 'PiP Boxes'], ['ratios', 'Ratios'], ['screen', 'Screen'], ['slides', 'Slides'], ['export', 'Export']];
function renderPanel() {
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<button class="tab ${ui.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('');
  const active = document.activeElement, fid = active && active.dataset ? active.dataset.f : null;
  const body = $('#panelBody'), scrollTop = body.scrollTop;
  body.innerHTML = ({ coords: panelCoords, boxes: panelBoxes, ratios: panelRatios, screen: panelScreen, slides: panelSlides, export: panelExport })[ui.tab]();
  body.scrollTop = scrollTop;
  if (fid) { const el = body.querySelector(`[data-f="${fid}"]`); if (el && el !== active) { el.focus({ preventScroll: true }); try { el.select && el.select(); } catch { } } }
  if (ui.tab === 'export') renderExportResults();
}

function aspectBlock(s) {
  const a = G.aspect(s.w, s.h);
  return `<div class="hud-stat"><div><div class="lbl">RESOLUTION</div><div class="big">${s.w}<i>×</i>${s.h}</div></div>
    <div><div class="lbl">ASPECT</div><div class="big">${a.text}</div><div class="sub">${a.decText}</div></div>
    ${G.hasSegs(s) ? `<div><div class="lbl">SEGMENTS</div><div class="big amber">${G.segCount(s)}</div><div class="sub">${G.isCustomSegs(s) ? (G.isFill(s) ? 'custom · fill width' : 'custom') : `${F(s.w / G.segCount(s))}×${s.h} each`}</div></div>` : ''}</div>
    ${fitBlock(s)}`;
}

/** Fit warning card (custom segments that don't exactly fill the screen). */
function fitBlock(s, full = false) {
  const f = G.segFit(s);
  if (!G.isCustomSegs(s)) return '';
  if (f.exact) return full ? `<p class="fitok">✓ Segments fill the screen exactly (${G.segments(s).map(g => g.w).join(' + ')} = ${s.w} px).</p>` : '';
  const list = full ? f.issues : f.issues.slice(0, 3);
  const fillBtn = full && !G.isFill(s) ? `<div class="row"><button class="btn sm primary" data-act="segLayout" data-m="fill">⇔ Re-layout segments to fill ${s.w} px</button></div>` : '';
  return `<div class="fitwarn ${f.level}"><div class="fw-h">⚠ SEGMENTS DON'T ${f.level === 'error' ? 'FIT' : 'FILL'} THE SCREEN <span>${esc(f.badge)}</span></div>
    <ul>${list.map(i => `<li class="${i.level}">${esc(i.text)}</li>`).join('')}${!full && f.issues.length > 3 ? `<li>…${f.issues.length - 3} more in the Screen tab</li>` : ''}</ul>
    ${full ? '<p class="hint">Unused areas are hatched amber on the canvas, overlaps red, edges a segment runs past get a red bar. Coordinates are still relative to the whole screen.</p>' : ''}${fillBtn}</div>`;
}

function panelCoords() {
  const s = scr(), gl = isGlobal(), rows = G.keyRows(s);
  let html = aspectBlock(s);
  html += originHint(s) + panelCard(s);
  html += `<p class="hint">Tap a row to copy <b>x, y</b> (rounded whole px). Fractions show 1 decimal + ≈ rounded value. Edges run 0→W (last pixel column = W−1).${gl ? ` Tap the global columns to copy global coords. <b>Global is always top-left of the whole canvas</b>${isCtr() ? '; local columns use this screen\'s center' : ''}.` : ''}</p>`;
  let grp = null;
  html += `<table class="ro ${gl ? 'gl' : ''}"><thead><tr><th>Point</th><th>X</th><th>Y</th>${gl ? '<th class="g">Global X</th><th class="g">Global Y</th>' : ''}</tr></thead><tbody>`;
  for (const r of rows) {
    if (r.group !== grp) { grp = r.group; html += `<tr class="grp"><td colspan="${gl ? 5 : 3}">${esc(grp)}</td></tr>`; }
    const lx = OX(s, r.x), lx2 = r.x2 != null ? OX(s, r.x2) : null, ly = OY(s, r.y);
    const xs = lx2 != null ? `${val(lx)}<span class="v dim"> / </span>${val(lx2)}` : val(lx);
    const ct = lx2 != null ? `${G.rnd(lx)}, ${G.rnd(lx2)}` : copyText(lx, ly);
    html += `<tr data-act="copy" data-copy="${ct}"><td>${esc(r.label)}</td><td>${xs}</td><td>${val(ly)}</td>`;
    if (gl) {
      const gx = r.x == null ? null : r.x + s.x, gy = r.y == null ? null : r.y + s.y;
      html += `<td class="g" data-act="copy" data-copy="${r.x2 != null ? `${G.rnd(gx)}, ${G.rnd(r.x2 + s.x)}` : copyText(gx, gy)}">${r.x2 != null ? `${val(gx)}<span class="v dim"> / </span>${val(r.x2 + s.x)}` : val(gx)}</td><td class="g">${val(gy)}</td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table>`;
  if (s.boxes.length) {
    html += `<div class="lbl mt">PIP BOXES</div><table class="ro"><thead><tr><th>Box</th><th>${isCtr() ? 'TL X, Y' : 'X, Y'}</th><th>W×H</th><th>Center</th></tr></thead><tbody>`;
    for (const b of s.boxes) html += `<tr data-act="copy" data-copy="${G.rnd(OX(s, b.x))}, ${G.rnd(OY(s, b.y))}, ${b.w}, ${b.h}"><td><span style="color:${b.color}">■</span> ${esc(b.name)}</td><td><span class="v">${n1(OX(s, b.x))}, ${n1(OY(s, b.y))}</span>${gl ? `<span class="r">G ${b.x + s.x}, ${b.y + s.y}</span>` : ''}</td><td><span class="v">${b.w}×${b.h}</span></td><td>${val(OX(s, b.x + b.w / 2))} ${val(OY(s, b.y + b.h / 2))}</td></tr>`;
    html += `</tbody></table>`;
  }
  return html;
}

function originHint(s) {
  return isCtr()
    ? `<p class="hint origin-hint"><b>Origin: screen center = 0,0.</b> X − left / + right · Y − up / + down (Y-down, like media servers). Segments stay relative to the whole screen.</p>`
    : `<p class="hint origin-hint"><b>Origin: top-left = 0,0.</b> X increases → right · Y increases ↓ down.</p>`;
}
function panelCard(s) {
  const p = G.panelInfo(s); if (!p) return '';
  return `<div class="card panel-info"><div class="lbl">LED PANELS ${p.pw}×${p.ph} · FROM TOP-LEFT</div>
    <div class="hud-stat"><div><div class="lbl">COLS × ROWS</div><div class="big">${p.cols}<i>×</i>${p.rows}</div></div><div><div class="lbl">TOTAL</div><div class="big">${p.total}</div><div class="sub">${p.whole ? 'all full panels' : `${p.fullTotal} full + ${p.total - p.fullTotal} partial`}</div></div></div>
    ${p.whole ? `<p class="hint">${p.exactText} — exact fit.</p>` : `<p class="warn">⚠ ${p.exactText} — not a whole number.${p.partialW ? ` Last column ${F(p.partialW)} px wide.` : ''}${p.partialH ? ` Last row ${F(p.partialH)} px tall.` : ''}</p>`}</div>`;
}
function numInput(f, v, label, extra = '') {
  return `<label class="fld"><span>${label}</span><input class="inp num" inputmode="decimal" type="number" data-f="${f}" data-bind="${f}" value="${v}" ${extra}></label>`;
}

function panelBoxes() {
  const s = scr(), b = box(), gl = isGlobal(), n = G.hasSegs(s) ? 2 : 1;
  const am = ui.addMode || 'size';
  let html = `<div class="card"><div class="lbl">ADD PIP BOX</div>
    <div class="seg full">${[['size', 'W × H'], ['pct', 'Ratio · % W'], ['rw', 'Ratio · W'], ['rh', 'Ratio · H']].map(([k, l]) => `<button class="${am === k ? 'on' : ''}" data-act="addMode" data-m="${k}">${l}</button>`).join('')}</div>
    <div class="grid2">`;
  if (am === 'size') html += numInput('add.w', ui.addW ?? defW(s), 'Width px') + numInput('add.h', ui.addH ?? defH(s), 'Height px');
  else {
    html += `<label class="fld"><span>Ratio</span><input class="inp" data-f="add.ratio" data-bind="add.ratio" value="${esc(ui.addRatio ?? '16:9')}" placeholder="16:9"></label>`;
    if (am === 'pct') html += numInput('add.pct', ui.addPct ?? 40, '% of screen width', 'step="any"');
    if (am === 'rw') html += numInput('add.fw', ui.addFW ?? 1280, 'Width px');
    if (am === 'rh') html += numInput('add.fh', ui.addFH ?? 720, 'Height px');
  }
  html += `</div><div class="row wrap">${['16:9', '4:3', '1:1', '9:16', '21:9'].map(r => am !== 'size' ? `<button class="chip sm" data-act="setAddRatio" data-r="${r}">${r}</button>` : '').join('')}</div>
    <div class="row"><button class="btn primary grow" data-act="addBox">＋ Add box (centered)</button></div>
    <div class="hint">Preview: ${(() => { const d = addDims(); return d ? `${d.w}×${d.h} px` : 'invalid'; })()}</div></div>`;

  html += `<div class="lbl mt">BOXES ON ${esc(s.name.toUpperCase())}</div>`;
  if (!s.boxes.length) html += `<p class="hint">No boxes yet. Add one above, or use <b>Ratios</b> → Add.</p>`;
  html += `<div class="box-list">${s.boxes.map(x => `<button class="box-item ${x.id === ui.sel ? 'on' : ''}" data-act="selBox" data-id="${x.id}"><span class="sw" style="background:${x.color}"></span><span class="bn">${esc(x.name)}</span><span class="bd">${x.w}×${x.h} @ ${n1(OX(s, x.x))},${n1(OY(s, x.y))}</span></button>`).join('')}</div>`;

  if (b) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, a = G.aspect(b.w, b.h);
    html += `<div class="card sel"><div class="row"><input class="inp grow" data-f="box.name" data-bind="box.name" value="${esc(b.name)}" aria-label="Box name">
      <input type="color" class="inp color" data-f="box.color" data-bind="box.color" value="${b.color}" aria-label="Box color"></div>
      <div class="row wrap swatches">${Store.BOX_COLORS.map(c => `<button class="swb" style="background:${c}" data-act="boxColor" data-c="${c}" aria-label="${c}"></button>`).join('')}</div>
      <div class="grid4">${numInput('box.x', n1(OX(s, b.x)), 'Top-left X', 'step="any"')}${numInput('box.y', n1(OY(s, b.y)), 'Top-left Y', 'step="any"')}${numInput('box.w', b.w, 'W')}${numInput('box.h', b.h, 'H')}</div>
      <div class="grid4">${numInput('box.cx', n1(OX(s, cx)), 'Center X', 'step="any"')}${numInput('box.cy', n1(OY(s, cy)), 'Center Y', 'step="any"')}<div class="fld span2"><span>&nbsp;</span><p class="hint">X/Y = box's <b>top-left corner</b>; Center X/Y = its middle. Both editable${isCtr() ? ', measured from the <b>screen center</b>' : ''}. Y↓.</p></div></div>
      <label class="tgl"><input type="checkbox" data-bind="box.lock" ${b.lock ? 'checked' : ''}><span>Lock aspect ratio (${a.text})</span></label>
      <div class="readout">
        <div><span class="lbl">CENTER</span>${val(OX(s, cx))} , ${val(OY(s, cy))}</div>
        <div><span class="lbl">RIGHT / BOTTOM</span><span class="v">${n1(OX(s, b.x + b.w))}, ${n1(OY(s, b.y + b.h))}</span></div>
        ${gl ? `<div><span class="lbl">GLOBAL X,Y</span><span class="v g">${b.x + s.x}, ${b.y + s.y}</span></div><div><span class="lbl">GLOBAL CENTER</span>${val(cx + s.x)} , ${val(cy + s.y)}</div>` : ''}
        <div><span class="lbl">RATIO</span><span class="v">${a.text}</span><span class="r">${a.decText}</span></div>
      </div>
      <div class="row wrap"><button class="btn sm" data-act="center" data-a="h">↔ Center H</button><button class="btn sm" data-act="center" data-a="v">↕ Center V</button><button class="btn sm primary" data-act="center" data-a="both">✛ Center both</button></div>
      ${n > 1 ? `<div class="row"><select class="inp grow" id="segPick">${G.segments(s).map(g => `<option value="${g.i}" ${ui.segPick == g.i ? 'selected' : ''}>${g.custom ? esc(g.name) : `Segment ${g.n}`} (${F(g.x0)}–${F(g.x1)}${g.custom ? `, ${F(g.w)}×${F(g.h)}` : ''})</option>`).join('')}</select>
        <button class="btn sm" data-act="centerSeg">Center in seg</button><button class="btn sm" data-act="fitSeg">Fit seg</button></div>` : ''}
      <div class="row wrap"><button class="btn sm" data-act="copyBox">⧉ Copy X,Y,W,H</button><button class="btn sm" data-act="copyBoxCenter">⧉ Copy center</button><button class="btn sm" data-act="dupBox">Duplicate</button><button class="btn sm" data-act="frontBox">To front</button><button class="btn sm danger" data-act="delBox">Delete</button></div>
    </div>`;
  }
  return html;
}

// default W×H: 16:9 box at half the screen width (fits any sample screen)
const defW = s => Math.round(Math.min(s.w / 2, s.h * 16 / 9 / 2)), defH = s => Math.round(defW(s) * 9 / 16);
function addDims() {
  const s = scr(), am = ui.addMode || 'size';
  if (am === 'size') { const w = Math.round(+(ui.addW ?? defW(s))), h = Math.round(+(ui.addH ?? defH(s))); return w > 0 && h > 0 ? { w, h } : null; }
  const r = G.parseRatio(ui.addRatio ?? '16:9'); if (!r) return null;
  let w, h;
  if (am === 'pct') { w = s.w * (+(ui.addPct ?? 40)) / 100; h = w * r[1] / r[0]; }
  if (am === 'rw') { w = +(ui.addFW ?? 1280); h = w * r[1] / r[0]; }
  if (am === 'rh') { h = +(ui.addFH ?? 720); w = h * r[0] / r[1]; }
  w = Math.round(w); h = Math.round(h); return w > 0 && h > 0 ? { w, h } : null;
}

function panelRatios() {
  const s = scr(), n = G.hasSegs(s) ? 2 : 1, segs = G.segments(s);
  const tgt = ui.ratioTarget ?? -1, area = tgt >= 0 && segs[tgt] ? segs[tgt] : { x0: 0, y0: 0, w: s.w, h: s.h };
  const ratios = [['16:9', 16, 9], ['4:3', 4, 3], ['1:1', 1, 1], ['9:16', 9, 16]];
  const cr = G.parseRatio(ui.customRatio ?? '2.39:1'); if (cr) ratios.push([`Custom ${ui.customRatio ?? '2.39:1'}`, cr[0], cr[1]]);
  let html = aspectBlock(s);
  html += `<div class="card"><div class="lbl">LARGEST CENTERED FIT</div>
    ${n > 1 ? `<label class="fld"><span>Fit inside</span><select class="inp" data-bind="ratioTarget"><option value="-1">Whole screen (${s.w}×${s.h})</option>${segs.map(g => `<option value="${g.i}" ${tgt == g.i ? 'selected' : ''}>${g.custom ? esc(g.name) : `Segment ${g.n}`} (${F(g.w)}×${F(g.h)})</option>`).join('')}</select></label>` : ''}
    <label class="fld"><span>Custom ratio</span><input class="inp" data-f="customRatio" data-bind="customRatio" value="${esc(ui.customRatio ?? '2.39:1')}" placeholder="e.g. 2.39:1 or 5:4"></label>
    ${originHint(s)}<table class="ro fit"><thead><tr><th>Ratio</th><th>W×H</th><th>Top-left X, Y</th><th></th></tr></thead><tbody>`;
  for (const [label, rw, rh] of ratios) {
    const f = G.largestFit(area.w, area.h, rw, rh); if (!f) continue;
    const x = area.x0 + f.x, y = area.y0 + f.y;
    html += `<tr><td><b>${esc(label)}</b></td><td data-act="copy" data-copy="${f.w}, ${f.h}"><span class="v">${f.w}×${f.h}</span></td>
      <td data-act="copy" data-copy="${G.rnd(OX(s, x))}, ${G.rnd(OY(s, y))}">${val(OX(s, x))} ${val(OY(s, y))}${isCtr() ? `<span class="r">center ${F(OX(s, x + f.w / 2))}, ${F(OY(s, y + f.h / 2))}</span>` : ''}</td>
      <td><button class="btn sm primary" data-act="addFit" data-w="${f.w}" data-h="${f.h}" data-x="${x}" data-y="${y}" data-n="${esc(label)}">＋ Box</button></td></tr>`;
  }
  html += `</tbody></table><p class="hint">W/H are floored to whole pixels so the box always fits; X/Y center it (½-px offsets shown with ≈ rounding; boxes use the rounded value).</p></div>`;
  return html;
}

function panelScreen() {
  const s = scr(), j = job(), gl = isGlobal(), g = s.grid, idx = j.screens.indexOf(s);
  return `${aspectBlock(s)}<div class="card">
    <label class="fld"><span>Screen name</span><input class="inp" data-f="scr.name" data-bind="scr.name" value="${esc(s.name)}"></label>
    <div class="grid2">${numInput('scr.w', s.w, 'Width px', 'min="1"')}${numInput('scr.h', s.h, 'Height px', 'min="1"')}</div>
    ${gl ? `<div class="lbl mt">GLOBAL CANVAS OFFSET</div><div class="grid2">${numInput('scr.x', s.x, 'Offset X')}${numInput('scr.y', s.y, 'Offset Y')}</div>` : ''}
  </div>
  ${segEditor(s)}
  <div class="card"><div class="lbl">CUSTOM GRID</div>
    <div class="seg full wrap">${[['off', 'Off'], ['nm', 'N × M'], ['px', 'Every X px'], ['led192', 'LED 192×192'], ['led384', 'Double LED 192×384'], ['panel', 'Custom panel']].map(([k, l]) => `<button class="${g.mode === k ? 'on' : ''}" data-act="gridMode" data-m="${k}">${l}</button>`).join('')}</div>
    ${g.mode === 'panel' ? `<div class="grid2">${numInput('grid.panelW', g.panelW, 'Panel W px', 'min="1"')}${numInput('grid.panelH', g.panelH, 'Panel H px', 'min="1"')}</div>
      <div class="row wrap">${['250x250', '500x500', '500x1000', '192x192', '160x160', '128x128'].map(p => `<button class="chip sm" data-act="panelPreset" data-p="${p}">${p.replace('x', '×')}</button>`).join('')}</div>` : ''}
    ${panelCard(s)}
    ${g.mode === 'nm' ? `<div class="grid2">${numInput('grid.cols', g.cols, 'Columns (N)', 'min="1"')}${numInput('grid.rows', g.rows, 'Rows (M)', 'min="1"')}</div>` : ''}
    ${g.mode === 'px' ? `<div class="grid2">${numInput('grid.step', g.step, 'Step px', 'min="1"')}</div>` : ''}
  </div>
  <div class="row wrap"><button class="btn sm" data-act="moveScreen" data-d="-1" ${idx === 0 ? 'disabled' : ''}>↑ Move up</button><button class="btn sm" data-act="moveScreen" data-d="1" ${idx === j.screens.length - 1 ? 'disabled' : ''}>↓ Move down</button>
  <button class="btn sm" data-act="dupScreen">Duplicate</button><button class="btn sm danger" data-act="delScreen">Delete screen</button></div>
  <div class="row wrap"><button class="btn sm" data-act="openSlideDlg" data-k="dup">⧉ Duplicate from slide size…</button><button class="btn sm" data-act="openSlideDlg" data-k="resize">⤢ Resize from slide size…</button></div>`;
}

// ---------- v1.7: segment layout Original ↔ Fill width ----------
// Rule while Fill is active: the ORIGINAL layout is what you edit. Name, physical size, Y and height edits apply to both layouts;
// W / X edits, add, remove, reorder, auto-place and split change the original, and the fill is recalculated from it right away
// (also when the screen width changes). "Keep fill as original" bakes the filled widths in and turns Fill off.
const refill = s => { if (G.isFill(s)) s.segs = G.fillSegs(s.segmentsOriginal, s.w); };
function editSegs(s, fn) {
  if (!G.isFill(s)) return fn(s);
  s.segs = s.segmentsOriginal; const r = fn(s);
  if (s.segMode !== 'custom' || !s.segs.length) { s.segLayout = 'original'; s.segmentsOriginal = null; return r; }
  s.segmentsOriginal = s.segs; s.segs = G.fillSegs(s.segmentsOriginal, s.w); return r;
}
const segIdsFresh = c => { (c.segs || []).forEach((g, i) => { g.id = Store.uid('seg'); if (c.segmentsOriginal && c.segmentsOriginal[i]) c.segmentsOriginal[i].id = g.id; }); };
function layoutBox(s) {
  const fill = G.isFill(s), orig = fill ? s.segmentsOriginal : s.segs, filled = fill ? s.segs : G.fillSegs(s.segs, s.w);
  const sum = a => a.reduce((t, g) => t + g.w, 0), os = sum(orig), fs = sum(filled), of = G.segFit({ ...s, segs: orig, segLayout: 'original' });
  return `<div class="layout-box ${fill ? 'is-fill' : 'is-orig'}" data-layout="${fill ? 'fill' : 'original'}"><div class="row between"><div class="lbl">LAYOUT</div>
    <div class="seg mini">${[['original', 'Original'], ['fill', '⇔ Fill width']].map(([k, l]) => `<button class="${(fill ? 'fill' : 'original') === k ? 'on' : ''}" data-act="segLayout" data-m="${k}">${l}</button>`).join('')}</div></div>
    <p class="lay-state">Active: <b>${fill ? 'Fill width' : 'Original'}</b> — ${(fill ? filled : orig).map(g => g.w).join(' + ')} = ${fill ? fs : os} px${fill ? ` (fills ${s.w} exactly)` : of.exact ? ' (fills the screen)' : ` · ${esc(of.badge)}`}</p>
    <table class="ro sl lay-tbl"><thead><tr><th>Segment</th><th class="${fill ? '' : 'act'}">Original</th><th class="${fill ? 'act' : ''}">Fill width</th><th>Δ W</th></tr></thead><tbody>${orig.map((g, i) => `<tr><td>${esc(g.name)}</td>
      <td class="${fill ? '' : 'act'}">${g.w}<span class="r">x ${g.x}–${g.x + g.w}</span></td><td class="${fill ? 'act' : ''}">${filled[i].w}<span class="r">x ${filled[i].x}–${filled[i].x + filled[i].w}</span></td><td>${filled[i].w - g.w >= 0 ? '+' : ''}${filled[i].w - g.w}</td></tr>`).join('')}
      <tr class="tot"><td>Total</td><td class="${fill ? '' : 'act'}">${os}</td><td class="${fill ? 'act' : ''}">${fs}</td><td>${fs - os >= 0 ? '+' : ''}${fs - os}</td></tr></tbody></table>
    <p class="hint">Fill width scales the widths by the same ratio (×${(s.w / (os || 1)).toFixed(5).replace(/\.?0+$/, '')}) so they run butted from x = 0 to exactly ${s.w} px, left → right by original X; rounding goes to the segments with the largest remainders. Y and heights don't change. ${fill
      ? '<b>While Fill is on you edit the Original</b> (the W / X fields below are the original values); the fill is recalculated after every change. Names, physical size, Y and H apply to both.'
      : 'Original is remembered while Fill is on — one tap switches back.'}</p>
    ${fill ? '<div class="row"><button class="btn sm" data-act="bakeFill">Keep fill as the new original</button></div>' : ''}</div>`;
}

// ---------- segment editor (Screen tab) ----------
function segEditor(s) {
  const custom = G.isCustomSegs(s), n = G.segCount(s), U = s.physUnit || 'ft';
  let html = `<div class="card seg-editor"><div class="row between"><div class="lbl">SEGMENTS</div>
    <div class="seg mini">${[['equal', 'Equal split'], ['custom', 'Custom sizes']].map(([k, l]) => `<button class="${(custom ? 'custom' : 'equal') === k ? 'on' : ''}" data-act="segMode" data-m="${k}">${l}</button>`).join('')}</div></div>`;
  if (!custom) {
    html += `<div class="grid2">${numInput('scr.segments', G.segCount(s), 'Equal segments (N)', 'min="1" max="256"')}<div class="fld"><span>&nbsp;</span><p class="hint">${n > 1 ? `${F(s.w / n)}×${s.h} each` : 'Whole screen'}</p></div></div>
      ${n > 1 && !G.isInt(s.w / n) ? `<p class="warn">⚠ ${s.w} / ${n} = ${F(s.w / n)} px — segments are not whole pixels.</p>` : ''}
      <p class="hint">Equal split always fills the screen. Use <b>Custom sizes</b> when the real segments have their own widths/heights (they're filled in from this split so you can edit them).</p>`;
    return html + '</div>';
  }
  const segs = G.segments(s), fill = G.isFill(s), src = fill ? s.segmentsOriginal : s.segs;
  html += layoutBox(s);
  html += `<p class="hint">Each segment: name, size and X/Y offset <b>from the screen's top-left</b> (px). Readouts in Coords use the job origin${isCtr() ? ' (center = 0,0)' : ''}. Physical size is optional → pixel pitch.</p>
    <div class="seg-rows">${src.map((g, i) => {
      const pi = G.physInfo(g.w, g.h, g.pw, g.ph, U);
      return `<div class="seg-row" data-i="${i}"><div class="row"><span class="seg-n">${i + 1}</span><input class="inp grow" data-f="seg.${i}.name" data-bind="seg.${i}.name" value="${esc(g.name)}" aria-label="Segment ${i + 1} name">
        <button class="btn sm ghost" data-act="moveSeg" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button class="btn sm ghost" data-act="moveSeg" data-i="${i}" data-d="1" ${i === src.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button><button class="btn sm danger" data-act="delSeg" data-i="${i}" aria-label="Remove segment">✕</button></div>
        <div class="grid4">${numInput(`seg.${i}.w`, g.w, fill ? 'Original W' : 'W px', 'min="1"')}${numInput(`seg.${i}.h`, g.h, 'H px', 'min="1"')}${numInput(`seg.${i}.x`, g.x, fill ? 'Original X' : 'X offset')}${numInput(`seg.${i}.y`, g.y, 'Y offset')}</div>
        <div class="grid4 phys">${numInput(`seg.${i}.pw`, g.pw ?? '', `Phys W ${U}`, 'min="0" step="any" placeholder="opt."')}${numInput(`seg.${i}.ph`, g.ph ?? '', `Phys H ${U}`, 'min="0" step="any" placeholder="opt."')}
          <div class="fld span2"><span>PIXEL DENSITY</span><p class="hint pitch">${pi ? pitchText(pi) : 'Enter the physical size to see px per ' + (U === 'ft' ? 'foot' : 'meter') + ' and pitch.'}</p></div></div>
        <p class="hint seg-sum">${fill ? '<b>fill</b> ' : ''}x ${segs[i].x0}–${segs[i].x1} · y ${segs[i].y0}–${segs[i].y1} · center ${F(OX(s, segs[i].cx))}, ${F(OY(s, segs[i].cy))}</p></div>`;
    }).join('')}</div>
    <div class="row wrap"><button class="btn sm primary" data-act="addSeg">＋ Add segment</button>
      <div class="seg mini">${['ft', 'm'].map(k => `<button class="${U === k ? 'on' : ''}" data-act="physUnit" data-u="${k}">${k === 'ft' ? 'feet' : 'meters'}</button>`).join('')}</div></div>
    <div class="grid2">${numInput('segtool.gap', ui.segGap ?? 0, 'Gap px (auto-place)', 'step="1"')}<div class="fld"><span>&nbsp;</span><button class="btn sm" data-act="autoPlaceSegs">⇥ Auto-place L→R</button></div>
      ${numInput('segtool.split', ui.segSplit ?? Math.max(2, src.length), 'Split into N equal', 'min="1" max="256"')}<div class="fld"><span>&nbsp;</span><button class="btn sm" data-act="splitSegs">Split screen</button></div></div>
    <p class="hint">Auto-place lines the segments up left → right in list order, top-aligned, butted together (or with the gap). Split replaces them with N whole-pixel segments that exactly fill the width (extra pixels go to the left ones).</p>
    <div class="lbl mt">FIT CHECK</div>${fitBlock(s, true)}`;
  return html + '</div>';
}
function pitchText(pi) {
  const u = pi.unit === 'ft' ? 'ft' : 'm', p = v => v.toFixed(2);
  const parts = [];
  if (pi.pxPerUnitW) parts.push(`W: <b>${p(pi.pxPerUnitW)} px/${u}</b> · ${p(pi.pitchW)} mm pitch`);
  if (pi.pxPerUnitH) parts.push(`H: <b>${p(pi.pxPerUnitH)} px/${u}</b> · ${p(pi.pitchH)} mm pitch`);
  if (pi.square === false) parts.push(`<span class="warnc">⚠ W and H pitch differ by ${Math.abs((pi.pitchW / pi.pitchH - 1) * 100).toFixed(1)}% — check the physical size or pixel count</span>`);
  return parts.join('<br>');
}

// ---------- Slides tab: PowerPoint / Keynote slide size + where segments land ----------
const PREFS_KEY = 'showcrew.pixelmap.prefs';
const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; } })();
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { } };
const slUnit = () => (prefs.slideUnit === 'cm' ? 'cm' : 'in');
/** Segments (+ PiP boxes) of a screen as plain px rects. */
function slideRects(s, withBoxes = true) {
  const r = G.hasSegs(s) ? G.segments(s).map(g => ({ name: g.custom ? g.name : `Segment ${g.n}`, x: g.x0, y: g.y0, w: g.w, h: g.h, kind: 'seg' })) : [];
  if (withBoxes) for (const b of s.boxes) r.push({ name: `PiP · ${b.name}`, x: b.x, y: b.y, w: b.w, h: b.h, kind: 'box' });
  return r;
}
function slidePlan(s) {
  const o = SL.pptOptions(s.w, s.h);
  const p = o.options.find(x => x.key === ui.pptOpt) || o.options.find(x => x.recommended) || null;
  return { o, p, kp: SL.keynotePlan(s.w, s.h) };
}
const cpy = (v, label = v) => `<button class="cpy" data-act="copy" data-copy="${esc(v)}" title="Copy ${esc(v)}">${label}<i>⧉</i></button>`;
// v1.6: target output resolution + full-screen playback fit (uniform scale, centered)
const outOf = s => (s.pptOut && s.pptOut.w > 0 && s.pptOut.h > 0 ? { w: s.pptOut.w, h: s.pptOut.h, custom: true } : { w: s.w, h: s.h, custom: false });
function outputCard(s) {
  const o = outOf(s), picks = [[s.w, s.h, `Screen ${s.w}×${s.h}`, true], ...SL.COMMON_OUTPUTS.filter(([w, h]) => !(w === s.w && h === s.h)).map(([w, h]) => [w, h, `${w}×${h}`, false])];
  return `<div class="card outcard"><div class="lbl">TARGET OUTPUT RESOLUTION · SLIDE SHOW</div>
    <div class="grid2">${numInput('pptout.w', o.w, 'Output width px', 'min="1" step="1"')}${numInput('pptout.h', o.h, 'Output height px', 'min="1" step="1"')}</div>
    <div class="row wrap qp">${picks.map(([w, h, l, scrPick]) => `<button class="btn sm ${(scrPick ? !o.custom : o.custom && o.w === w && o.h === h) ? 'on' : ''}" data-act="pptOut" data-w="${w}" data-h="${h}"${scrPick ? ' data-screen="1"' : ''}>${l}</button>`).join('')}</div>
    <p class="hint">What the show computer sends to the processor. Full screen, PowerPoint and Keynote scale the slide <b>uniformly</b> to fit this output and center it (no stretching, no cropping), so a different aspect ratio gives black bars. ${o.custom ? `Set for this screen (the screen itself is ${s.w}×${s.h}).` : 'Defaults to this screen\'s resolution.'}</p></div>`;
}
function playbackHtml(fit, s, rects, key) {
  if (!fit) return '';
  const F2 = SL.f2, L = rects.length ? SL.landRects(fit, s.w, s.h, rects) : [], moved = L.filter(l => l.moved), scaled = fit.outW !== s.w || fit.outH !== s.h;
  let h = `<div class="pb pb-${fit.kind}" data-pb="${key}"><div class="lbl">FULL SCREEN ON A ${fit.outW}×${fit.outH} OUTPUT</div>
    <p class="pb-h ${fit.kind === 'none' ? 'fitok' : 'warnc'}">${fit.kind === 'none' ? '✓' : '▮'} ${esc(fit.headline)}.</p>
    <div class="readout"><div><span class="lbl">RENDERED SLIDE</span><span class="v">${fit.areaText}</span><span class="r">${SL.f2(fit.coverPct)}% of the output</span></div>
      <div><span class="lbl">SCALE</span><span class="v">${SL.f3(fit.pxPerIn)} px/in</span><span class="r">×${SL.f3(fit.scale96)} of 96 px/in · fitted by ${fit.fitBy}</span></div></div>`;
  if (!L.length) return h + '</div>';
  h += `<table class="ro sl pb-tbl"><thead><tr><th>Item</th><th>${scaled ? `Native → ${fit.outW}×${fit.outH}` : 'Native px'}</th><th>Lands at (px)</th><th>Shift</th></tr></thead><tbody>${L.map(l => `<tr class="${l.moved ? 'moved' : ''}"><td>${esc(l.name)}</td>
      <td>x ${F2(l.native.x0)}–${F2(l.native.x1)}<span class="r">y ${F2(l.native.y0)}–${F2(l.native.y1)}</span></td>
      <td><b>x ${F2(l.out.x0)}–${F2(l.out.x1)}</b><span class="r">y ${F2(l.out.y0)}–${F2(l.out.y1)} · ${F2(l.w)}×${F2(l.h)}</span></td>
      <td>${l.moved ? `<span class="warnc">⚠ ${l.flags.map(f => `${f.edge} ${f.shift > 0 ? '+' : ''}${F2(f.shift)}`).join(', ')}</span>` : `<span class="dim">≤ ${F2(l.maxShift)}</span>`}</td></tr>`).join('')}</tbody></table>`;
  h += moved.length
    ? `<p class="warn pb-flag">⚠ ${moved.reduce((n, l) => n + l.flags.length, 0)} edge${moved.reduce((n, l) => n + l.flags.length, 0) > 1 ? 's' : ''} shift by 1 px or more from the native position: ${moved.map(l => `${esc(l.name)} (${l.flags.map(f => `${f.edge} ${f.shift > 0 ? '+' : ''}${F2(f.shift)} px`).join(', ')})`).join('; ')}.</p>`
    : `<p class="fitok pb-ok">✓ Every edge stays within 1 px of its native position (largest shift ${F2(Math.max(...L.map(l => l.maxShift)))} px).</p>`;
  return h + `<p class="hint">Assumes the deck is laid out across the whole slide in proportion to the screen (like the PixelMap template)${scaled ? `; native positions are scaled ×${SL.f3(fit.outW / s.w)} W, ×${SL.f3(fit.outH / s.h)} H to the output` : ''}.</p></div>`;
}
function panelSlides() {
  const s = scr(), U = slUnit(), { o, p, kp } = slidePlan(s), rects = slideRects(s), f3 = SL.f3;
  const uv = (inch, cm) => (U === 'cm' ? cm : inch);
  let html = `<div class="row between"><div class="lbl">SLIDES FOR ${esc(s.name.toUpperCase())} · ${s.w}×${s.h}</div>
    <div class="seg mini">${['in', 'cm'].map(k => `<button class="${U === k ? 'on' : ''}" data-act="slideUnit" data-u="${k}">${k === 'in' ? 'inches' : 'cm'}</button>`).join('')}</div></div>`;
  html += `<p class="hint">PowerPoint maps <b>96 px = 1 in</b> (Widescreen 13.333 × 7.5 in = 1280×720) and allows <b>1–56 in</b> (2.54–142.24 cm) per side. At 1:1 this screen would be <b>${f3(uv(o.nativeW, o.nativeW * 2.54))} × ${f3(uv(o.nativeH, o.nativeH * 2.54))} ${U}</b> — ${o.impossible ? '<span class="warnc">aspect is wider than 56:1, PowerPoint can\'t hold it</span>' : o.fits ? 'fits as-is.' : o.tooBig ? '<span class="warnc">over the 56 in limit, so the slide has to be scaled down.</span>' : '<span class="warnc">under the 1 in minimum, so the slide is scaled up.</span>'}</p>`;
  html += outputCard(s);
  const OUT = outOf(s);
  if (!p) return html + `<p class="warn">⚠ No PowerPoint slide size keeps this exact ${G.aspect(s.w, s.h).decText} ratio within 1–56 in. Split the content across slides or use a media server.</p>`;
  // --- PowerPoint slide size
  html += `<div class="card pptcard"><div class="lbl">POWERPOINT · DESIGN ▸ SLIDE SIZE ▸ CUSTOM</div>
    ${o.options.length > 1 ? `<div class="seg full">${o.options.map(x => `<button class="${x === p ? 'on' : ''}" data-act="pptOpt" data-k="${x.key}">${esc(x.label)}${x.recommended ? ' ★' : ''}</button>`).join('')}</div>` : ''}
    <div class="hud-stat"><div><div class="lbl">WIDTH</div><div class="big">${cpy(`${f3(uv(p.slideW, p.slideWcm))} ${U}`, `${f3(uv(p.slideW, p.slideWcm))}<small>${U}</small>`)}</div><div class="sub">${f3(p.slideWpt)} pt</div></div>
      <div><div class="lbl">HEIGHT</div><div class="big">${cpy(`${f3(uv(p.slideH, p.slideHcm))} ${U}`, `${f3(uv(p.slideH, p.slideHcm))}<small>${U}</small>`)}</div><div class="sub">${f3(p.slideHpt)} pt</div></div></div>
    <p class="hint">Scale <b>${p.key === 'exact' ? `1/${p.N}` : p.key === 'up' ? `×${p.M}` : f3(p.k)}</b> of 1:1 (${f3(p.k * 100)}%) · 1 slide inch = <b>${f3(p.pxPerIn)} screen px</b> · ${p.emuExact ? 'every screen pixel is a whole number of EMU (exact)' : `${f3(p.emuPerPx)} EMU per px`}. Type the values with the unit (e.g. <code>${f3(uv(p.slideW, p.slideWcm))} ${U}</code>) — PowerPoint converts to your region's units. Then pick <i>Don't Scale</i> / <i>Ensure Fit</i>.</p>
    ${playbackHtml(SL.playbackFit(p.slideW, p.slideH, OUT.w, OUT.h), s, rects, 'rec')}</div>`;
  // --- export / playback
  html += `<div class="card"><div class="lbl">BACK TO ${s.w}×${s.h} NATIVE PIXELS</div>
    <ul class="steps">
      <li><b>Playback:</b> full screen on the ${OUT.w}×${OUT.h} output PowerPoint scales the slide uniformly to fit and centers it — ${esc(SL.playbackFit(p.slideW, p.slideH, OUT.w, OUT.h).headline)}.</li>
      <li><b>Mac — PNG export:</b> File ▸ Export ▸ File Format <b>PNG</b> ▸ Width ${cpy(String(s.w))} (Height becomes ${s.h}).</li>
      <li><b>Windows — PNG export:</b> ${p.winExact
        ? `set registry DWORD <code>ExportBitmapResolution</code> = ${cpy(String(p.winDpi))} (Decimal) under <code>HKCU\\Software\\Microsoft\\Office\\16.0\\PowerPoint\\Options</code>, then File ▸ Save As ▸ PNG → <b>${s.w}×${s.h}</b>.`
        : `this size needs ${f3(p.pxPerIn)} dpi, but <code>ExportBitmapResolution</code> only takes whole numbers — ${p.winCeilDpi} dpi gives ${p.winCeilPx[0]}×${p.winCeilPx[1]}. ${o.options.some(x => x.key === 'exact') ? 'Use the ★ exact option for a pixel-perfect export.' : ''}`}
        Without the registry value PowerPoint exports at 96 dpi = ${p.default96[0]}×${p.default96[1]}.${p.bitmapOk ? '' : ' <span class="warnc">Over PowerPoint\'s 100 MP export limit.</span>'}${Math.max(s.w, s.h) > SL.PPT.OLD_MAX_EDGE ? ' PowerPoint 2010 and older cap exports at 3072 px.' : ''}</li>
    </ul></div>`;
  // --- where segments land
  html += `<div class="card"><div class="lbl">WHERE THEY LAND · FORMAT SHAPE ▸ SIZE &amp; POSITION (${U})</div>
    ${rects.length ? slideTable(rects.map(r => { const q = SL.onSlide(p, r); return { r, L: q.left[U], T: q.top[U], W: q.width[U], H: q.height[U], pt: q }; }), U) : '<p class="hint">No segments or PiP boxes on this screen yet — add them in Screen / PiP Boxes.</p>'}
    <p class="hint">Position = <i>Horizontal / Vertical from Top Left Corner</i>. PowerPoint may display 2 decimals; type the 3-decimal value (0.001 in = ${f3(p.pxPerIn / 1000)} px here). Tap any value to copy it with its unit.</p></div>`;
  html += currentSlideCard(s, rects, U);
  // --- Keynote
  html += `<div class="card"><div class="lbl">KEYNOTE · DOCUMENT ▸ SLIDE SIZE ▸ CUSTOM</div>
    <div class="hud-stat"><div><div class="lbl">WIDTH</div><div class="big">${cpy(f3(kp.ptW))}</div><div class="sub">pt (= slide px)</div></div><div><div class="lbl">HEIGHT</div><div class="big">${cpy(f3(kp.ptH))}</div><div class="sub">${kp.N > 1 ? `1/${kp.N} scale` : '1:1 native'}</div></div></div>
    <p class="hint">Keynote sizes slides in points and treats 1 pt as 1 slide pixel. Apple doesn't publish a maximum; current Keynote is reported to stop at <b>8192 × 8192</b> (older versions 4000).
    ${kp.N > 1 ? ` ${s.w}×${s.h} is over that, so build at <b>1/${kp.N}</b>${kp.whole ? '' : ' (not whole points — round to the nearest point)'}; full-screen playback on the ${s.w}×${s.h} output scales it up ×${kp.N}.` : ' This screen fits at 1:1.'}
    Arrange inspector X / Y / W / H (pt):</p>
    ${rects.length ? `<table class="ro sl"><thead><tr><th>Item</th><th>X</th><th>Y</th><th>W</th><th>H</th></tr></thead><tbody>${rects.map(r => { const k = SL.keynoteRect(kp, r); return `<tr><td>${esc(r.name)}</td>${[k.x, k.y, k.w, k.h].map(v => `<td>${cpy(f3(v))}</td>`).join('')}</tr>`; }).join('')}</tbody></table>` : ''}
    <p class="hint">Opening the PowerPoint file in Keynote keeps its slide size (in points: inches × 72) instead.</p></div>`;
  // --- export summary / template
  html += `<div class="card"><div class="lbl">SUMMARY &amp; TEMPLATE</div>
    <div class="row wrap"><button class="btn sm" data-act="slideCopy">⧉ Copy summary</button><button class="btn sm" data-act="slideTxt">⤓ TXT</button><button class="btn sm" data-act="slideCsv">⤓ CSV</button><button class="btn sm primary" data-act="slidePptx">⤓ PowerPoint template (.pptx)</button></div>
    <p class="hint">The .pptx has this slide size and one labeled, outlined rectangle per segment (plus PiP boxes and any unused areas) on a guide slide, and a blank slide 2. Open it in PowerPoint or Keynote; delete the guide shapes before the show.</p></div>`;
  return html;
}
function slideTable(rows, U) {
  return `<table class="ro sl"><thead><tr><th>Item</th><th>Left</th><th>Top</th><th>Width</th><th>Height</th></tr></thead><tbody>${rows.map(({ r, L, T, W, H }) => `<tr><td>${esc(r.name)}<span class="r">${G.fmt1(r.x)}, ${G.fmt1(r.y)} · ${G.fmt1(r.w)}×${G.fmt1(r.h)} px</span></td>${[L, T, W, H].map(v => `<td>${cpy(`${SL.f3(v)} ${U}`, SL.f3(v))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function currentSlideCard(s, rects, U) {
  const pc = s.pptCur, cu = pc?.unit || U, c = pc ? SL.compareCurrent(s.w, s.h, pc) : null, f3 = SL.f3;
  const { o, p } = slidePlan(s);
  let html = `<div class="card cur-slide"><div class="lbl">YOUR CURRENT SLIDE SIZE</div>
    <div class="grid3">${numInput('pptcur.w', pc ? pc.w : '', 'Width', 'step="any" min="0" placeholder="e.g. 55.561"')}${numInput('pptcur.h', pc ? pc.h : '', 'Height', 'step="any" min="0" placeholder="e.g. 5.28"')}
      <div class="fld"><span>Unit</span><div class="seg full">${['in', 'cm'].map(k => `<button class="${cu === k ? 'on' : ''}" data-act="pptCurUnit" data-u="${k}">${k}</button>`).join('')}</div></div></div>`;
  if (!c) return html + `<p class="hint">Type the size from your deck's Design ▸ Slide Size ▸ Custom to check it against ${s.w}×${s.h} and see where the segments land on <b>your</b> slide.</p></div>`;
  const cv = v => (U === 'cm' ? v * 2.54 : v);
  html += `<div class="readout"><div><span class="lbl">YOUR SLIDE</span><span class="v">${f3(c.slideAspect)}:1</span><span class="r">${f3(cv(c.cw))} × ${f3(cv(c.ch))} ${U}</span></div>
      <div><span class="lbl">SCREEN</span><span class="v">${f3(c.screenAspect)}:1</span><span class="r">${s.w}×${s.h} px</span></div></div>`;
  if (c.tooBig || c.tooSmall) html += `<p class="warn">⚠ PowerPoint only accepts 1–56 in per side; this size is outside that.</p>`;
  if (c.match) html += `<p class="fitok">✓ Same aspect ratio as the screen — fills ${s.w}×${s.h} exactly. 1 slide inch = ${f3(c.pxPerIn)} px.</p>`;
  else html += `<div class="fitwarn warn"><div class="fw-h">⚠ ASPECT MISMATCH <span>${c.diffPct > 0 ? '+' : ''}${c.diffPct.toFixed(2)}%</span></div><ul>
      <li>Your slide is ${c.diffPct > 0 ? 'wider' : 'taller'} than the screen. Full screen on ${s.w}×${s.h} it is fitted by ${c.fitBy}: the image is <b>${G.fmt1(c.imgW)} × ${G.fmt1(c.imgH)} px</b> with ${G.fmt1(c.barsPx.each)} px bars ${c.barsPx.side} (${G.fmt1(c.barsPx.total)} px total) — nothing is stretched.</li>
      <li>Keep your width → set height to ${cpy(`${f3(cv(c.keepWidthH))} ${U}`, `<b>${f3(cv(c.keepWidthH))} ${U}</b>`)}; or keep your height → width ${cpy(`${f3(cv(c.keepHeightW))} ${U}`, `<b>${f3(cv(c.keepHeightW))} ${U}</b>`)}${p ? `; or use the ★ size above (${f3(U === 'cm' ? p.slideWcm : p.slideW)} × ${f3(U === 'cm' ? p.slideHcm : p.slideH)} ${U})` : ''}.</li></ul></div>`;
  const OUT = outOf(s);
  html += playbackHtml(SL.playbackFit(c.cw, c.ch, OUT.w, OUT.h), s, rects, 'cur');
  if (rects.length) html += `<div class="lbl mt">WHERE THEY LAND ON YOUR SLIDE (${U})</div>${slideTable(rects.map(r => { const q = SL.onCurrent(c, r); return { r, L: q.left[U], T: q.top[U], W: q.width[U], H: q.height[U] }; }), U)}
    <p class="hint">Assumes the slide is shown full screen on the ${s.w}×${s.h} output (uniform fit, centered). 1 slide inch = ${f3(c.pxPerIn)} screen px.${c.match ? '' : ' Negative/over-size values mean that edge falls in the bars.'}</p>`;
  return html + '</div>';
}
function slideSummaryText(s) {
  const { o, p, kp } = slidePlan(s), U = slUnit(), f3 = SL.f3, rects = slideRects(s), j = job();
  const L = [`ShowCrew PixelMap — ${j.name} — ${s.name} ${s.w}×${s.h} px`, ''];
  if (!p) return L.concat('No PowerPoint slide size keeps this aspect ratio within 1–56 in.').join('\n');
  L.push(`PowerPoint slide size (Design > Slide Size > Custom): ${f3(p.slideW)} in × ${f3(p.slideH)} in  (${f3(p.slideWcm)} × ${f3(p.slideHcm)} cm, ${f3(p.slideWpt)} × ${f3(p.slideHpt)} pt)`);
  L.push(`  ${p.label}; scale ${f3(p.k)} of 1:1 at 96 px/in; 1 slide inch = ${f3(p.pxPerIn)} screen px`);
  L.push(`  Export to ${s.w}×${s.h}: Mac File > Export > PNG width ${s.w}; Windows ExportBitmapResolution ${p.winExact ? `= ${p.winDpi}` : `would need ${f3(p.pxPerIn)} (not whole — ${p.winCeilDpi} gives ${p.winCeilPx.join('×')})`}`);
  const OUT = outOf(s), pf = SL.playbackFit(p.slideW, p.slideH, OUT.w, OUT.h);
  L.push(`  Full screen on ${OUT.w}×${OUT.h}: ${pf.headline}; slide renders ${pf.areaText} at ${f3(pf.pxPerIn)} px/in`);
  L.push(`Keynote slide size: ${f3(kp.ptW)} × ${f3(kp.ptH)} pt${kp.N > 1 ? ` (1/${kp.N} scale; Keynote max ≈ 8192)` : ''}`);
  const fit = G.segFit(s); if (!fit.exact) { L.push('', 'Segment fit warnings:'); fit.issues.forEach(i => L.push('  ! ' + i.text)); }
  L.push('', `Positions (${U}) — Left, Top, Width, Height | px X, Y, W, H | Keynote pt X, Y, W, H`);
  for (const r of rects) {
    const q = SL.onSlide(p, r), k = SL.keynoteRect(kp, r);
    L.push(`  ${r.name}: ${[q.left, q.top, q.width, q.height].map(v => f3(v[U])).join(', ')} | ${[r.x, r.y, r.w, r.h].map(f3).join(', ')} | ${[k.x, k.y, k.w, k.h].map(f3).join(', ')}`);
  }
  const c = s.pptCur && SL.compareCurrent(s.w, s.h, s.pptCur);
  if (c) {
    L.push('', `Current slide ${f3(c.cw)} × ${f3(c.ch)} in: aspect ${f3(c.slideAspect)}:1 vs screen ${f3(c.screenAspect)}:1 (${c.diffPct.toFixed(2)}%)${c.match ? '' : `; fitted by ${c.fitBy} → ${G.fmt1(c.imgW)}×${G.fmt1(c.imgH)} px; keep width → height ${f3(c.keepWidthH)} in`}`);
    for (const r of rects) { const q = SL.onCurrent(c, r); L.push(`  ${r.name} on current slide (${U}): ${[q.left, q.top, q.width, q.height].map(v => f3(v[U])).join(', ')}`); }
  }
  L.push('', 'Sources: support.microsoft.com "Change the size of your PowerPoint slides" (1–56 in); learn.microsoft.com "export high-resolution slides" (96 dpi default, ExportBitmapResolution).');
  return L.join('\n');
}

const EXP_ITEMS = [['bg', 'Background'], ['outline', 'Outline / border'], ['crosshair', 'Center crosshair'], ['centerLines', 'Center lines'], ['thirds', 'Thirds'], ['grid', 'Custom / panel grid'],
  ['segDividers', 'Segment dividers'], ['segCenters', 'Segment centers'], ['segGuides', 'Segment guides (center/thirds)'], ['boxes', 'PiP boxes'], ['labels', 'Labels (name + resolution)'], ['coordLabels', 'Coordinate labels'], ['panelLabels', 'Panel numbers (C# R#)'], ['unused', 'Unused / overlap areas (hatched, if segments don\'t fill)']];
function panelExport() {
  const ex = job().exportSettings, s = scr();
  const color = (k, l) => `<label class="fld cpick"><span>${l}</span><input type="color" class="inp color" data-bind="ex.${k}" value="${ex[k]}"></label>`;
  return `<div class="card"><div class="lbl">INCLUDE</div><div class="checks">${EXP_ITEMS.map(([k, l]) => `<label class="tgl"><input type="checkbox" data-bind="exinc.${k}" ${ex.inc[k] ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
    ${!ex.inc.bg ? '<p class="hint">Background off → transparent PNG.</p>' : ''}</div>
    <div class="card"><div class="lbl">STYLE</div><div class="grid3">${color('bg', 'Background')}${color('line', 'Lines / guides')}${color('seg', 'Segments')}${color('box', 'PiP boxes')}${color('text', 'Text')}</div>
    <label class="tgl"><input type="checkbox" data-bind="ex.boxOwnColors" ${ex.boxOwnColors ? 'checked' : ''}><span>Use each box's own color</span></label>
    <div class="grid2">${numInput('ex.lw', ex.lw, 'Line width px', 'min="1" max="64"')}${numInput('ex.textSize', ex.textSize, 'Text size px (0 = auto)', 'min="0"')}</div>
    <p class="hint">Saved per job. Lines are drawn on whole pixels at native resolution. Coordinate labels use the job's origin (${isCtr() ? 'center = 0,0' : 'top-left = 0,0'}).</p></div>
    <div class="row wrap"><button class="btn primary grow" data-act="exportOne">⤓ Export ${esc(s.name)} (${s.w}×${s.h})</button><button class="btn grow" data-act="exportAll">⤓ Export all screens (${job().screens.length})</button></div>
    <div id="exportResults"></div>`;
}

function renderExportResults() {
  const el = $('#exportResults'); if (!el) return;
  const fs = ui.exportFiles; if (!fs.length) { el.innerHTML = ''; return; }
  const canShare = !!(navigator.canShare && navigator.share && navigator.canShare({ files: fs.map(f => f.file) }));
  el.innerHTML = `<div class="card"><div class="lbl">READY — ${fs.length} PNG${fs.length > 1 ? 's' : ''}</div>
    ${canShare ? `<button class="btn primary full" data-act="shareFiles">⇪ Share / Save to Photos or Files</button>` : ''}
    <div class="files">${fs.map((f, i) => `<a class="file" href="${f.url}" download="${esc(f.file.name)}" data-i="${i}"><img src="${f.url}" alt=""><span>${esc(f.file.name)}</span><small>${f.w}×${f.h} · ${(f.file.size / 1024).toFixed(0)} KB</small></a>`).join('')}</div>
    <p class="hint">${canShare ? 'Or tap a file to download it.' : 'Tap a file to download. On iPad, long-press an image to save it.'}</p></div>`;
}

// ---------- stage ----------
const cv = $('#cv'), wrap = $('#canvasWrap');
function drawStage() {
  const dpr = window.devicePixelRatio || 1, cw = wrap.clientWidth, ch = wrap.clientHeight;
  if (!cw || !ch) return;
  if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
  const ctx = cv.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  const j = job(), v = j.view, m = cw < 500 ? 14 : 28;
  if (ui.view === 'canvas' && isGlobal()) {
    const b = canvasBounds(j), bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    const k = Math.min((cw - m * 2) / bw, (ch - m * 2) / bh);
    ui.k = k; ui.ox = (cw - bw * k) / 2 - b.x0 * k; ui.oy = (ch - bh * k) / 2 - b.y0 * k;
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * ui.ox, dpr * ui.oy);
    drawOverview(ctx, j, { u: 1 / k, selectedId: scr().id, snapLines: ui.snapLines, b });
    return;
  }
  const s = scr();
  const k = Math.min((cw - m * 2) / s.w, (ch - m * 2) / s.h);
  ui.k = k; ui.ox = (cw - s.w * k) / 2; ui.oy = (ch - s.h * k) / 2;
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * ui.ox, dpr * ui.oy);
  const u = 1 / k;
  // outer glow frame
  ctx.save(); ctx.shadowColor = 'rgba(0,229,255,0.55)'; ctx.shadowBlur = 18; ctx.fillStyle = PREVIEW_COLORS.bg; ctx.fillRect(0, 0, s.w, s.h); ctx.restore();
  const segs = G.hasSegs(s);
  // ultra-wide screens (e.g. 11344×1080) preview only ~40 px tall: canvas text would pile up, so hide it (status bar + badge still show it)
  const roomy = s.h * k >= 110, lbl = v.labels && roomy;
  drawScreen(ctx, s, {
    u, lw: 1.1, glow: true, colors: PREVIEW_COLORS, origin: G.originOf(s, j.origin), boxOwnColors: true, fs: 11 * u, selectedId: ui.sel, snapLines: ui.snapLines,
    handles: true, handleR: 9, probe: ui.drag ? null : ui.probe,
    inc: { bg: true, outline: true, crosshair: v.center, centerLines: v.centerLines, thirds: v.thirds, grid: v.grid, segDividers: v.segments && segs,
      segCenters: v.segments && segs && v.center, segGuides: v.segGuides && segs, boxes: v.boxes, labels: lbl, coordLabels: lbl, panelLabels: lbl && v.grid && j.exportSettings.inc.panelLabels, unused: true },
  });
  renderFitBadge(s);
}

function renderFitBadge(s) {
  const el = $('#fitBadge'); if (!el) return;
  const f = ui.view === 'canvas' && isGlobal() ? { exact: true } : G.segFit(s);
  el.hidden = f.exact; if (f.exact) return;
  el.className = 'fitbadge stage ' + f.level; el.textContent = `⚠ Segments don't ${f.level === 'error' ? 'fit' : 'fill'}: ${f.badge}`; el.title = f.issues.map(i => i.text).join('\n');
}
function toLocal(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left - ui.ox) / ui.k, y: (e.clientY - r.top - ui.oy) / ui.k };
}
function hitBox(p) {
  const bs = scr().boxes;
  for (let i = bs.length - 1; i >= 0; i--) { const b = bs[i]; if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b; }
  return null;
}
function hitHandle(b, p) {
  if (!b) return null; const r = 16 / ui.k;
  for (const [hx, hy, c] of handlePoints(b)) if (Math.abs(p.x - hx) <= r && Math.abs(p.y - hy) <= r) return c;
  return null;
}

cv.addEventListener('pointerdown', e => {
  const p = toLocal(e), j = job();
  if (ui.view === 'canvas' && isGlobal()) {
    const hit = [...j.screens].reverse().find(s => p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h);
    if (hit) { j.currentScreenId = hit.id; ui.sel = null; ui.drag = { type: 'screen', s: hit, dx: p.x - hit.x, dy: p.y - hit.y }; cv.setPointerCapture(e.pointerId); render(); }
    return;
  }
  const sb = box(), hc = hitHandle(sb, p);
  if (hc) { ui.drag = { type: 'resize', c: hc, b: sb, o: { ...sb }, ratio: sb.w / sb.h }; }
  else {
    const b = hitBox(p);
    if (b) { ui.sel = b.id; ui.drag = { type: 'move', b, dx: p.x - b.x, dy: p.y - b.y }; if (ui.tab !== 'boxes' && ui.tab !== 'coords') ui.tab = 'boxes'; }
    else { ui.sel = null; ui.probe = p; ui.drag = { type: 'probe' }; }
  }
  cv.setPointerCapture(e.pointerId); ui.moved = false;
  render(['panel']);
});
cv.addEventListener('pointermove', e => {
  const p = toLocal(e), d = ui.drag;
  if (!d) { if (e.pointerType === 'mouse' && ui.view !== 'canvas') { const s = scr(); ui.hover = p.x >= 0 && p.y >= 0 && p.x <= s.w && p.y <= s.h ? p : null; renderStatus(); } return; }
  ui.moved = true;
  const snapOn = job().view.snap, thr = 10 / ui.k;
  ui.snapLines = [];
  if (d.type === 'probe') { ui.probe = p; ui.hover = p; drawStage(); renderStatus(); return; }
  if (d.type === 'screen') {
    let nx = p.x - d.dx, ny = p.y - d.dy; const s = d.s;
    if (snapOn) {
      const xs = [0], ys = [0];
      for (const o of job().screens) if (o !== s) { xs.push(o.x, o.x + o.w); ys.push(o.y, o.y + o.h, o.y + o.h / 2); }
      const sx = G.bestSnap([nx, nx + s.w], xs, thr), sy = G.bestSnap([ny, ny + s.h, ny + s.h / 2], ys, thr);
      if (sx) { nx += sx.d; ui.snapLines.push({ axis: 'x', v: sx.t }); }
      if (sy) { ny += sy.d; ui.snapLines.push({ axis: 'y', v: sy.t }); }
    }
    s.x = Math.round(nx); s.y = Math.round(ny); drawStage(); return;
  }
  const s = scr(), T = G.snapTargets(s, { excludeId: d.b.id, grid: job().view.grid });
  if (d.type === 'move') {
    const b = d.b; let nx = p.x - d.dx, ny = p.y - d.dy;
    if (snapOn) {
      const sx = G.bestSnap([nx, nx + b.w / 2, nx + b.w], T.xs, thr), sy = G.bestSnap([ny, ny + b.h / 2, ny + b.h], T.ys, thr);
      if (sx) { nx += sx.d; ui.snapLines.push({ axis: 'x', v: sx.t }); }
      if (sy) { ny += sy.d; ui.snapLines.push({ axis: 'y', v: sy.t }); }
    }
    b.x = Math.round(nx); b.y = Math.round(ny);
  } else if (d.type === 'resize') {
    const b = d.b, o = d.o; let L = o.x, R = o.x + o.w, Tp = o.y, B = o.y + o.h;
    let px = p.x, py = p.y;
    if (snapOn) {
      const sx = G.bestSnap([px], T.xs, thr), sy = G.bestSnap([py], T.ys, thr);
      if (sx) { px += sx.d; ui.snapLines.push({ axis: 'x', v: sx.t }); }
      if (sy) { py += sy.d; ui.snapLines.push({ axis: 'y', v: sy.t }); }
    }
    if (d.c.includes('w')) L = Math.min(px, R - 4); else R = Math.max(px, L + 4);
    if (d.c.includes('n')) Tp = Math.min(py, B - 4); else B = Math.max(py, Tp + 4);
    if (b.lock) {
      const w = R - L, h = w / d.ratio;
      if (d.c.includes('n')) Tp = B - h; else B = Tp + h;
      ui.snapLines = ui.snapLines.filter(l => l.axis === 'x');
    }
    b.x = Math.round(L); b.y = Math.round(Tp); b.w = Math.max(1, Math.round(R - L)); b.h = Math.max(1, Math.round(B - Tp));
  }
  drawStage(); renderStatus();
  if (!ui.panelRaf) ui.panelRaf = requestAnimationFrame(() => { ui.panelRaf = 0; if (ui.tab === 'boxes') syncBoxFields(); });
});
function syncBoxFields() {
  const b = box(); if (!b) return;
  const s = scr(), v = { x: n1(OX(s, b.x)), y: n1(OY(s, b.y)), w: b.w, h: b.h, cx: n1(OX(s, b.x + b.w / 2)), cy: n1(OY(s, b.y + b.h / 2)) };
  for (const k in v) { const el = document.querySelector(`[data-f="box.${k}"]`); if (el && el !== document.activeElement) el.value = v[k]; }
}
function endDrag() {
  if (!ui.drag) return;
  const t = ui.drag.type; ui.drag = null; ui.snapLines = [];
  if (t === 'probe') { drawStage(); renderStatus(); return; }
  commit(t === 'screen' ? ['screens', 'panel'] : ['screens', 'panel']);
}
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', endDrag);
cv.addEventListener('pointerleave', () => { if (!ui.drag && ui.hover) { ui.hover = null; renderStatus(); } });

// keyboard nudge
window.addEventListener('keydown', e => {
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  const b = box(); if (!b) return;
  const st = e.shiftKey ? 10 : 1, m = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
  if (m) { b.x += m[0]; b.y += m[1]; e.preventDefault(); commit(['panel', 'screens']); }
  if (e.key === 'Delete' || e.key === 'Backspace') { delBox(); e.preventDefault(); }
});

// ---------- actions ----------
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1600); }
async function copyLong(text) {
  try { await navigator.clipboard.writeText(text); toast('Summary copied'); }
  catch { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Summary copied'); } catch { toast('Copy failed'); } ta.remove(); }
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch { } ta.remove(); }
  toast(`Copied ${text}`);
}
function addBoxRect(w, h, x, y, name) {
  const s = scr(), n = s.boxes.length;
  const b = { id: Store.uid('box'), name: name || `PiP ${n + 1}`, color: Store.BOX_COLORS[n % Store.BOX_COLORS.length], x: Math.round(x ?? (s.w - w) / 2), y: Math.round(y ?? (s.h - h) / 2), w, h, lock: false };
  s.boxes.push(b); ui.sel = b.id; ui.tab = 'boxes'; commit(); return b;
}
function delBox() { const s = scr(); s.boxes = s.boxes.filter(b => b.id !== ui.sel); ui.sel = null; commit(); }

function modal(html) {
  const m = $('#modal'); m.innerHTML = `<div class="modal-card">${html}</div>`; m.hidden = false;
  return m;
}
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
function ask(title, value = '', okLabel = 'OK') {
  return new Promise(res => {
    const m = modal(`<div class="lbl">${esc(title)}</div><input class="inp" id="askIn" value="${esc(value)}"><div class="row"><button class="btn ghost grow" id="askNo">Cancel</button><button class="btn primary grow" id="askOk">${esc(okLabel)}</button></div>`);
    const inp = $('#askIn', m); setTimeout(() => { inp.focus(); inp.select(); }, 30);
    const done = v => { closeModal(); res(v); };
    $('#askOk', m).onclick = () => done(inp.value.trim() || null); $('#askNo', m).onclick = () => done(null);
    inp.onkeydown = e => { if (e.key === 'Enter') done(inp.value.trim() || null); if (e.key === 'Escape') done(null); };
  });
}
function confirmBox(title, okLabel = 'Delete') {
  return new Promise(res => {
    const m = modal(`<div class="lbl">${esc(title)}</div><div class="row"><button class="btn ghost grow" id="cNo">Cancel</button><button class="btn danger grow" id="cOk">${esc(okLabel)}</button></div>`);
    $('#cOk', m).onclick = () => { closeModal(); res(true); }; $('#cNo', m).onclick = () => { closeModal(); res(false); };
  });
}
function openJobs() {
  const j = job();
  modal(`<div class="row between"><div class="lbl">JOBS</div><button class="btn sm ghost" data-act="closeModal">✕</button></div>
    <div class="job-list">${S.jobs.map(x => `<button class="job-item ${x.id === j.id ? 'on' : ''}" data-act="pickJob" data-id="${x.id}"><span>${esc(x.name)}</span><small>${x.screens.length} screens · ${new Date(x.updated).toLocaleDateString()}</small></button>`).join('')}</div>
    <div class="lbl mt">CURRENT: ${esc(j.name)}</div>
    <div class="row wrap"><button class="btn sm" data-act="renameJob">Rename</button><button class="btn sm" data-act="dupJob">Duplicate</button><button class="btn sm danger" data-act="delJob">Delete</button></div>
    <div class="row wrap"><button class="btn sm" data-act="exportJson">⤓ Export JSON</button><label class="btn sm">⤒ Import JSON<input type="file" id="importIn" accept=".json,application/json" hidden></label></div>
    <div class="row wrap"><button class="btn sm primary" data-act="newJob">＋ New job</button><button class="btn sm ghost" data-act="newExample">＋ Example 4-Screen</button></div>
    <p class="hint">Jobs are stored on this device (localStorage). Export JSON for backup or to move jobs between devices.</p>`);
  $('#importIn').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const data = JSON.parse(await f.text()); const nj = Store.sanitizeJob(data.job || data, true); S.jobs.push(nj); S.currentJobId = nj.id; ui.sel = null; closeModal(); commit(); toast(`Imported “${nj.name}”`); }
    catch (err) { toast('Import failed: ' + err.message); }
  };
}
async function shareOrDownload(files) {
  if (navigator.canShare && navigator.share && navigator.canShare({ files })) {
    try { await navigator.share({ files }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  for (const f of files) { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
}
const fileSafe = s => s.replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '') || 'screen';
async function doExport(screens) {
  const ex = job().exportSettings;
  ui.exportFiles.forEach(f => URL.revokeObjectURL(f.url)); ui.exportFiles = [];
  toast(`Rendering ${screens.length} PNG${screens.length > 1 ? 's' : ''}…`);
  for (const s of screens) {
    if (s.w * s.h > 16777216) toast(`⚠ ${s.name} is ${s.w}×${s.h} — may exceed iOS canvas limit (16.7 MP)`);
    try {
      const blob = await screenToBlob(s, ex, job().origin);
      const file = new File([blob], `${fileSafe(job().name)}_${fileSafe(s.name)}_${s.w}x${s.h}.png`, { type: 'image/png' });
      ui.exportFiles.push({ file, url: URL.createObjectURL(blob), w: s.w, h: s.h });
    } catch (e) { toast(`${s.name}: ${e.message}`); }
  }
  renderExportResults();
  const el = $('#exportResults'); el && el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  toast(`${ui.exportFiles.length} PNG ready — tap Share or a file`);
}

// ---------- v1.5: new / duplicate / resize a screen from a PowerPoint slide size ----------
const SD_TITLE = { new: 'NEW SCREEN', dup: 'DUPLICATE FROM SLIDE SIZE', resize: 'RESIZE FROM SLIDE SIZE' };
function openSlideDlg(kind) {
  const s = scr(), pc = s.pptCur, j = job();
  ui.sd = {
    kind, from: kind === 'new' ? 'px' : 'ppt', pw: 1920, ph: 1080,
    unit: pc ? pc.unit : slUnit(), sw: pc ? pc.w : (slUnit() === 'cm' ? 33.867 : 13.333), sh: pc ? pc.h : (slUnit() === 'cm' ? 19.05 : 7.5),
    by: 'ppi', ppi: SL.PPT.PX_PER_IN, tw: s.w, seg: 'scale', name: kind === 'new' ? `Screen ${j.screens.length + 1}` : null, nameEdited: false,
  };
  renderSlideDlg();
}
function sdResult() {
  const d = ui.sd, s = scr();
  if (d.from === 'px') { const w = Math.round(+d.pw), h = Math.round(+d.ph); return w >= 1 && h >= 1 && w <= 65536 && h <= 65536 ? { w, h, exW: w, exH: h, px: true } : null; }
  const r = SL.slideToPx(d.sw, d.sh, d.unit, d.by, d.by === 'width' ? d.tw : d.ppi);
  return r && r.w <= 65536 && r.h <= 65536 ? r : null;
}
const sdName = () => { const d = ui.sd, s = scr(); return d.nameEdited || d.kind === 'new' ? d.name : `${s.name} (PPT ${SL.slideLabel(d.sw, d.sh, d.unit)})`; };
function renderSlideDlg() {
  const d = ui.sd, s = scr(), hasStuff = G.hasSegs(s) || s.boxes.length;
  const seg = (k, opts) => `<div class="seg full">${opts.map(([v, l]) => `<button type="button" class="${d[k] === v ? 'on' : ''}" data-act="sdSet" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const inp = (id, v, label, extra = '') => `<label class="fld"><span>${label}</span><input class="inp num" id="${id}" inputmode="decimal" type="number" step="any" value="${v ?? ''}" ${extra}></label>`;
  let h = `<div class="sdlg" data-kind="${d.kind}"><div class="row between"><div class="lbl">${SD_TITLE[d.kind]}${d.kind !== 'new' ? ` · ${esc(s.name)} ${s.w}×${s.h}` : ''}</div><button type="button" class="btn sm ghost" data-act="closeModal">✕</button></div>`;
  if (d.kind === 'new') h += `<div class="fld"><span>Size from</span>${seg('from', [['px', 'Pixels'], ['ppt', 'PowerPoint slide size']])}</div>`;
  if (d.from === 'px') h += `<div class="grid2">${inp('sdPw', d.pw, 'Width px', 'min="1"')}${inp('sdPh', d.ph, 'Height px', 'min="1"')}</div>`;
  else h += `<div class="grid3">${inp('sdSw', d.sw, `Slide width (${d.unit})`, 'min="0"')}${inp('sdSh', d.sh, `Slide height (${d.unit})`, 'min="0"')}<div class="fld"><span>Unit</span>${seg('unit', [['in', 'in'], ['cm', 'cm']])}</div></div>
    <div class="fld"><span>Pixels from</span>${seg('by', [['ppi', 'Pixels per inch'], ['width', 'Target pixel width']])}</div>
    <div class="grid2">${d.by === 'ppi' ? inp('sdPpi', d.ppi, 'px per inch (PowerPoint = 96)', 'min="0"') : inp('sdTw', d.tw, 'Target width px (e.g. export width)', 'min="1"')}
      <div class="fld"><span>&nbsp;</span><p class="hint">${d.by === 'ppi' ? 'PowerPoint maps 96 px to 1 inch (its default picture export).' : 'Height follows the slide\'s aspect ratio.'}</p></div></div>`;
  if (d.kind !== 'resize') h += `<label class="fld"><span>Name</span><input class="inp" id="sdName" value="${esc(sdName())}"></label>`;
  if (d.kind !== 'new' && hasStuff) h += `<div class="fld"><span>Segments &amp; PiP boxes</span>${seg('seg', [['scale', 'Scale proportionally'], ['keep', 'Keep pixel sizes']])}</div>`;
  h += `<div id="sdPrev"></div><div class="row"><button type="button" class="btn ghost grow" data-act="closeModal">Cancel</button><button type="button" class="btn primary grow" id="sdOk" data-act="sdApply">${d.kind === 'new' ? '＋ Create screen' : d.kind === 'dup' ? '⧉ Duplicate' : '⤢ Resize'}</button></div></div>`;
  const m = modal(h);
  const bind = (id, k, isName) => { const el = $('#' + id, m); if (el) el.addEventListener('input', () => { d[k] = isName ? el.value : el.value; if (isName) d.nameEdited = true; renderSdPreview(); }); };
  bind('sdPw', 'pw'); bind('sdPh', 'ph'); bind('sdSw', 'sw'); bind('sdSh', 'sh'); bind('sdPpi', 'ppi'); bind('sdTw', 'tw'); bind('sdName', 'name', true);
  renderSdPreview();
}
function renderSdPreview() {
  const d = ui.sd, s = scr(), el = $('#sdPrev'); if (!el) return;
  const r = sdResult(), ok = $('#sdOk');
  if (ok) ok.disabled = !r;
  const nm = $('#sdName'); if (nm && !d.nameEdited && d.kind !== 'new' && document.activeElement !== nm) nm.value = sdName();
  if (!r) { el.innerHTML = `<p class="warn">Enter positive numbers to see the pixel size.</p>`; return; }
  const exact = (v, w) => (G.isInt(v) ? String(Math.round(v)) : `${SL.f3(v)}${w != null ? ` → ${w}` : ''}`);
  let h = `<div class="sd-res"><div class="lbl">NEW PIXEL SIZE</div><div class="big">${r.w}<i>×</i>${r.h}</div>`;
  if (!r.px) h += `<div class="sub">exact ${exact(r.exW, r.w)} × ${exact(r.exH, r.h)} px · ${SL.f3(r.ppi)} px/in · ${SL.f3(r.wIn)} × ${SL.f3(r.hIn)} in${r.w !== r.exW || r.h !== r.exH ? ' · rounded to whole px' : ''}</div>`;
  h += `<div class="sub">aspect ${G.aspect(r.w, r.h).decText}${d.kind !== 'new' ? ` (was ${G.aspect(s.w, s.h).decText}) · scale ×${SL.f3(r.w / s.w)} W, ×${SL.f3(r.h / s.h)} H` : ''}</div></div>`;
  if (!r.px) {
    const o = outOf(s), outs = [[r.w, r.h, d.kind === 'new' ? 'the new screen' : `the new ${d.kind === 'dup' ? 'copy' : 'size'}`]];
    if (d.kind !== 'new' && !(o.w === r.w && o.h === r.h)) outs.push([o.w, o.h, `${esc(s.name)}'s ${o.custom ? 'target output' : 'current output'}`]);
    h += `<div class="sd-pb"><div class="lbl">FULL-SCREEN PLAYBACK OF THIS SLIDE</div><ul>${outs.map(([w, hh, l]) => { const f = SL.playbackFit(r.wIn, r.hIn, w, hh); return `<li data-out="${w}x${hh}"><b>${w}×${hh}</b> (${l}): ${esc(f.headline)} · slide renders <b>${f.areaText}</b> · ${SL.f3(f.pxPerIn)} px/in</li>`; }).join('')}</ul></div>`;
  }
  if (r.outOfRange) h += `<p class="warn">⚠ ${SL.f3(r.wIn)} × ${SL.f3(r.hIn)} in is outside PowerPoint's 1–56 in per side — check the numbers.</p>`;
  if (d.kind !== 'new') {
    const c = G.resizeScreen(s, r.w, r.h, d.seg), f = G.segFit(c), segs = G.hasSegs(c) ? G.segments(c) : [], old = G.segments(s);
    if (segs.length) h += `<table class="ro sl sd-tbl"><thead><tr><th>Segment</th><th>Now</th><th>New</th></tr></thead><tbody>${segs.map((g, i) => `<tr><td>${esc(g.custom ? g.name : `Segment ${g.n}`)}</td><td>${F(old[i]?.w)}×${F(old[i]?.h)}<span class="r">@ ${F(old[i]?.x0)}, ${F(old[i]?.y0)}</span></td><td><b>${F(g.w)}×${F(g.h)}</b><span class="r">@ ${F(g.x0)}, ${F(g.y0)}</span></td></tr>`).join('')}</tbody></table>`;
    if (c.boxes.length) h += `<table class="ro sl sd-tbl"><thead><tr><th>PiP box</th><th>Now</th><th>New</th></tr></thead><tbody>${c.boxes.map((b, i) => `<tr><td>${esc(b.name)}</td><td>${s.boxes[i].w}×${s.boxes[i].h}<span class="r">@ ${s.boxes[i].x}, ${s.boxes[i].y}</span></td><td><b>${b.w}×${b.h}</b><span class="r">@ ${b.x}, ${b.y}</span></td></tr>`).join('')}</tbody></table>`;
    const of = G.segFit(s);
    if (G.isCustomSegs(c)) h += f.exact ? `<p class="fitok">✓ Segments fill the new size exactly.</p>` : `<div class="fitwarn ${f.level}"><div class="fw-h">⚠ AFTER ${d.kind === 'dup' ? 'DUPLICATE' : 'RESIZE'} <span>${esc(f.badge)}</span></div><ul>${[...f.issues].sort((x, y) => (y.level === 'error') - (x.level === 'error')).map(i => `<li class="${i.level}">${esc(i.text)}</li>`).join('')}</ul>${!of.exact && d.seg === 'scale' ? `<p class="hint">The original was already ${esc(of.badge)}; scaling keeps that gap proportionally.</p>` : ''}</div>`;
    if (segs.some(g => g.custom)) h += `<p class="hint">Physical sizes (${s.physUnit === 'm' ? 'meters' : 'feet'}) are kept, so px per ${s.physUnit === 'm' ? 'meter' : 'foot'} changes with the new size.</p>`;
  }
  el.innerHTML = h;
}
function applySlideDlg() {
  const d = ui.sd, s = scr(), j = job(), r = sdResult(); if (!r) return;
  const slide = d.from === 'ppt' ? { w: +d.sw, h: +d.sh, unit: d.unit } : null;
  if (d.kind === 'new') {
    const n = Store.makeScreen((d.name || '').trim() || `Screen ${j.screens.length + 1}`, r.w, r.h), last = j.screens[j.screens.length - 1];
    if (last) n.x = last.x + last.w; if (slide) n.pptCur = slide;
    j.screens.push(n); j.currentScreenId = n.id; ui.tab = 'screen'; ui.sel = null;
    closeModal(); commit(); toast(`Added ${n.name} ${r.w}×${r.h}`); return;
  }
  const c = G.resizeScreen(s, r.w, r.h, d.seg);
  if (slide) c.pptCur = slide;
  if (d.kind === 'dup') {
    c.id = Store.uid('scr'); c.name = (sdName() || '').trim() || `${s.name} copy`;
    c.boxes.forEach(b => b.id = Store.uid('box')); segIdsFresh(c);
    j.screens.splice(j.screens.indexOf(s) + 1, 0, c); j.currentScreenId = c.id; ui.sel = null;
    closeModal(); commit(); toast(`Duplicated → ${c.name} ${r.w}×${r.h}`); return;
  }
  Object.assign(s, c, { id: s.id }); ui.sel = null; closeModal(); commit(); toast(`Resized to ${r.w}×${r.h}`);
}

// ---------- cloud sync (only when js/config.js has a publishable key) ----------
// Sign-in = email + password, then a 6-digit authenticator (TOTP) code — same as ShowCrew GearVault.
// No email links are needed to sign in (work-mail link scanners can't burn anything). Signed out, the app works 100% locally.
const acctOpen = () => !$('#modal').hidden && !!$('#modal .acct');
const sync = createSync({
  getS: () => S,
  save: () => { clearTimeout(saveT); Store.save(S); },
  onChange: () => { ui.sel = null; ui.exportFiles = []; render(); if (acctOpen()) openAccount(); },
  onStatus: st => { renderSync(st); if (acctOpen()) openAccount(); },
  onRecovery: () => { ui.acctView = 'signin'; openAccount(); },
});
const SYNC_LABEL = { signedout: 'Sign in', syncing: 'Syncing', synced: 'Synced', offline: 'Offline', error: 'Sync error', mfa: '2FA code' };
function renderSync(st = sync.status()) {
  const b = $('#syncBtn'); if (!b) return;
  b.hidden = !syncConfigured; b.dataset.state = st.state;
  b.querySelector('.sl').textContent = SYNC_LABEL[st.state] || st.state;
  b.querySelector('.st').textContent = st.state === 'synced' && st.lastSync ? new Date(st.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : st.state === 'signedout' ? 'cloud' : st.state === 'mfa' ? 'needed' : '';
  b.title = `Cloud sync: ${SYNC_LABEL[st.state] || st.state}${st.detail ? ' — ' + st.detail : ''}`;
}
const codeField = (id = 'acctCode') => `<label class="fld"><span>6-digit code from your authenticator app</span><input class="inp code" id="${id}" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" placeholder="••••••"></label>`;
const emailField = () => `<label class="fld"><span>Email</span><input class="inp" id="acctEmail" type="email" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="you@example.com" value="${esc(ui.acctEmail || '')}"></label>`;
function acctBody(st) {
  const who = st.email ? `<p class="hint">Signed in as <b>${esc(st.email)}</b>.</p>` : '';
  const back = '<button type="button" class="linkish" data-act="acctView" data-v="signin">← Back to sign in</button>';
  const out = '<button type="button" class="linkish" data-act="signOut">Sign out / use another account</button>';
  switch (st.step) {
    case 'done': return { key: 'done', html: `<p class="hint">Signed in as <b>${esc(st.email)}</b> · two-factor on. Jobs sync automatically when online; this device keeps working offline.</p>
      <div class="row wrap"><button type="button" class="btn primary grow" data-act="syncNow">⟳ Sync now</button><button type="button" class="btn danger grow" data-act="signOut">Sign out</button></div>
      <p class="hint">Signing out keeps the jobs on this device. Sharing jobs with crew: coming soon.</p>` };
    case 'enroll': {
      const e = st.enroll;
      if (!e) return { key: 'enroll-wait', html: `<div class="lbl auth-title">SET UP TWO-FACTOR (REQUIRED)</div>${who}<p class="hint" id="enrollWait">Preparing your authenticator QR code…</p><div class="auth-foot">${out}</div>`, after: startEnroll };
      return { key: 'enroll-' + e.id, form: 'verifyEnroll', html: `<div class="lbl auth-title">SET UP TWO-FACTOR (REQUIRED)</div>${who}
        <p class="hint">Scan this with an authenticator app (1Password, Authy, Google Authenticator, iOS Passwords…), then enter the 6-digit code. Cloud sync starts once this is done.</p>
        <div class="qr"><img id="totpQr" alt="Authenticator QR code" src="${esc(e.qr)}"></div>
        <label class="fld"><span>Or enter this secret manually — save it somewhere safe</span><input class="inp mono-sm" id="totpSecret" readonly value="${esc(e.secret)}"></label>
        ${codeField()}<button class="btn primary full" type="submit">Verify &amp; turn on 2FA</button><div class="auth-foot">${out}</div>` };
    }
    case 'challenge': return { key: 'challenge', form: 'verifyCode', html: `<div class="lbl auth-title">TWO-FACTOR CHECK</div>${who}
        <p class="hint">Enter the current code from your authenticator app.</p>
        ${st.factors.length > 1 ? `<label class="fld"><span>Authenticator</span><select class="inp" id="acctFactor">${st.factors.map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}</select></label>` : ''}
        ${codeField()}<button class="btn primary full" type="submit">Verify</button><div class="auth-foot">${out}</div>` };
    case 'newpw': return { key: 'newpw', form: 'savePassword', html: `<div class="lbl auth-title">CHOOSE A NEW PASSWORD</div><p class="hint">For <b>${esc(st.email)}</b>.</p>
        <label class="fld"><span>New password (12+ characters)</span><input class="inp" id="acctPw" type="password" autocomplete="new-password" minlength="12"></label>
        <label class="fld"><span>Repeat</span><input class="inp" id="acctPw2" type="password" autocomplete="new-password"></label>
        <button class="btn primary full" type="submit">Save password</button>` };
  }
  // signed out
  const v = ui.acctView || 'signin';
  if (v === 'forgot') return { key: 'forgot', form: 'sendReset', html: `<div class="lbl auth-title">RESET PASSWORD</div>${emailField()}
      <button class="btn primary full" type="submit">Email me a reset link</button><div class="auth-foot">${back}</div>` };
  if (v === 'sent') return { key: 'sent', html: `<div class="lbl auth-title">CHECK YOUR EMAIL</div><p class="hint">${esc(ui.acctSentMsg || '')}</p><div class="auth-foot">${back}</div>` };
  if (v === 'signup' && ALLOW_SIGNUP) return { key: 'signup', form: 'signUp', html: `<div class="lbl auth-title">CREATE ACCOUNT</div>${emailField()}
      <label class="fld"><span>Password (12+ characters)</span><input class="inp" id="acctPw" type="password" autocomplete="new-password" minlength="12"></label>
      <button class="btn primary full" type="submit">Create account</button><div class="auth-foot">${back}</div>` };
  return { key: 'signin', form: 'signIn', html: `<p class="hint">Sign in to back up jobs and sync them between iPad, iPhone and computer. Password + a code from your authenticator app — no email links.</p>
      ${emailField()}
      <label class="fld"><span>Password</span><input class="inp" id="acctPw" type="password" autocomplete="current-password"></label>
      <button class="btn primary full" type="submit">Sign in</button>
      <div class="auth-foot"><button type="button" class="linkish" data-act="acctView" data-v="forgot">Forgot password?</button>${ALLOW_SIGNUP ? '<button type="button" class="linkish" data-act="acctView" data-v="signup">Create account</button>' : ''}</div>
      <p class="hint">Not signed in? Everything still works and stays on this device.</p>` };
}
function openAccount() {
  const st = sync.status(), body = acctBody(st);
  const stateHtml = `<span class="dot"></span><b>${esc(SYNC_LABEL[st.state] || st.state)}</b>${st.lastSync && st.signedIn ? `<small>last sync ${new Date(st.lastSync).toLocaleString()}</small>` : ''}${st.detail && st.state === 'error' ? `<small class="err">${esc(st.detail)}</small>` : ''}`;
  const cur = acctOpen() ? $('#modal .acct') : null;
  if (cur && cur.dataset.key === body.key) {   // same screen: refresh the status line only, keep what's typed
    const sEl = $('.sync-state', cur); sEl.dataset.state = st.state; sEl.innerHTML = stateHtml; return;
  }
  const keepMsg = cur ? ($('#acctMsg', cur) || {}).textContent : '';
  const inner = `<div class="sync-state" data-state="${st.state}">${stateHtml}</div>${body.html}<div class="acct-msg hint" id="acctMsg" role="alert"></div>`;
  const m = modal(`<div class="acct" data-key="${body.key}"><div class="row between"><div class="lbl">CLOUD SYNC · ACCOUNT</div><button type="button" class="btn sm ghost" data-act="closeModal">✕</button></div>
    ${body.form ? `<form class="acct-form col" data-form="${body.form}" novalidate>${inner}</form>` : `<div class="col">${inner}</div>`}</div>`);
  const f = $('form.acct-form', m);
  if (f) f.onsubmit = ev => { ev.preventDefault(); AUTH[f.dataset.form](f); };
  if (keepMsg && body.key !== 'done') acctMsg(keepMsg);
  const first = $('input:not([readonly])', m);
  if (first) setTimeout(() => { const e = $('#acctEmail', m); (e && e.value ? $('#acctPw', m) || first : first).focus({ preventScroll: true }); }, 30);
  const sec = $('#totpSecret', m); if (sec) sec.onfocus = () => sec.select();
  if (body.after) body.after();
}
const acctMsg = (t, err) => { const el = $('#acctMsg'); if (el) { el.textContent = t; el.classList.toggle('err', !!err); } };
const authErr = e => (e && (e.message || e.error_description)) || String(e || 'Something went wrong');
async function busy(form, label, fn) {
  const b = $('button[type=submit]', form); const l = b && b.textContent;
  if (b) { b.disabled = true; b.textContent = label; }
  acctMsg('');
  try { return await fn(); }
  catch (e) { acctMsg(authErr(e), true); return null; }
  finally { if (b && b.isConnected) { b.disabled = false; b.textContent = l; } }
}
let enrolling = false;
async function startEnroll() {
  if (enrolling) return; enrolling = true;
  try { await sync.startEnroll(); } catch (e) { const w = $('#enrollWait'); if (w) { w.textContent = authErr(e); w.classList.add('err'); } }
  finally { enrolling = false; }
}
const validEmail = v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
const AUTH = {
  signIn: f => {
    const email = $('#acctEmail', f).value.trim(), pw = $('#acctPw', f).value; ui.acctEmail = email;
    if (!validEmail(email)) return acctMsg('Enter a valid email address.', true);
    if (!pw) return acctMsg('Enter your password.', true);
    return busy(f, 'Signing in…', async () => { await sync.signIn(email, pw); openAccount(); });
  },
  signUp: f => {
    const email = $('#acctEmail', f).value.trim(), pw = $('#acctPw', f).value; ui.acctEmail = email;
    if (!validEmail(email)) return acctMsg('Enter a valid email address.', true);
    if (pw.length < 12) return acctMsg('Use at least 12 characters.', true);
    return busy(f, 'Creating…', async () => {
      if (await sync.signUp(email, pw)) { ui.acctView = 'sent'; ui.acctSentMsg = 'Confirm your address with the link we sent, then sign in. You\'ll set up two-factor authentication next.'; }
      openAccount();
    });
  },
  sendReset: f => {
    const email = $('#acctEmail', f).value.trim(); ui.acctEmail = email;
    if (!validEmail(email)) return acctMsg('Enter a valid email address.', true);
    return busy(f, 'Sending…', async () => {
      await sync.resetPassword(email);
      ui.acctView = 'sent'; ui.acctSentMsg = 'If that address has an account, a reset link is on its way. Open it on this device; you\'ll enter your authenticator code, then choose a new password.';
      openAccount();
    });
  },
  verifyEnroll: f => {
    const code = $('#acctCode', f).value.replace(/\D/g, '');
    if (code.length !== 6) return acctMsg('Enter the 6-digit code from your authenticator app.', true);
    return busy(f, 'Verifying…', async () => { await sync.verifyEnroll(code); openAccount(); toast('Two-factor on — syncing'); });
  },
  verifyCode: f => {
    const code = $('#acctCode', f).value.replace(/\D/g, '');
    if (code.length !== 6) return acctMsg('Enter the 6-digit code from your authenticator app.', true);
    return busy(f, 'Verifying…', async () => {
      try { await sync.verifyCode(code, $('#acctFactor', f)?.value); }
      catch (e) { $('#acctCode', f).value = ''; throw e; }
      openAccount(); if (sync.status().signedIn) toast('Signed in — syncing');
    });
  },
  savePassword: f => {
    const pw = $('#acctPw', f).value;
    if (pw.length < 12) return acctMsg('Use at least 12 characters.', true);
    if (pw !== $('#acctPw2', f).value) return acctMsg('Passwords don\'t match.', true);
    return busy(f, 'Saving…', async () => { await sync.updatePassword(pw); openAccount(); toast('Password updated'); });
  },
};
// A reset/confirmation email link that was already used (e.g. by a mail link scanner) comes back as #error=…
function authLinkError() {
  const h = new URLSearchParams(location.hash.slice(1)); const d = h.get('error_description') || h.get('error');
  if (!d || !syncConfigured) return;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  ui.acctView = 'signin'; openAccount();
  acctMsg(`That email link didn't work (${d.replace(/\+/g, ' ')}). Links in emails can only be used once — some work-mail scanners open them first. Request a new one, or ask for help.`, true);
}

const ACTIONS = {
  openAccount: () => { if (ui.acctView === 'sent') ui.acctView = 'signin'; openAccount(); },
  acctView: el => { ui.acctView = el.dataset.v; openAccount(); },
  syncNow: () => sync.syncNow('manual'),
  signOut: async () => { try { await sync.signOut(); } catch (e) { toast(e.message); } ui.acctView = 'signin'; openAccount(); },
  tab: el => { ui.tab = el.dataset.tab; render(['panel']); },
  pickScreen: el => { job().currentScreenId = el.dataset.id; ui.sel = null; ui.probe = null; if (ui.view === 'canvas') ui.view = 'screen'; commit(['screens', 'panel', 'chips']); },
  addScreen: () => { const j = job(), s = Store.makeScreen(`Screen ${j.screens.length + 1}`, 1920, 1080); const last = j.screens[j.screens.length - 1]; if (last) s.x = last.x + last.w; j.screens.push(s); j.currentScreenId = s.id; ui.tab = 'screen'; ui.sel = null; commit(); },
  dupScreen: () => { const j = job(), s = scr(), c = JSON.parse(JSON.stringify(s)); c.id = Store.uid('scr'); c.name += ' copy'; c.boxes.forEach(b => b.id = Store.uid('box')); segIdsFresh(c); j.screens.splice(j.screens.indexOf(s) + 1, 0, c); j.currentScreenId = c.id; commit(); },
  delScreen: async () => { const j = job(); if (j.screens.length < 2) return toast('A job needs at least one screen'); if (await confirmBox(`Delete screen “${scr().name}”?`)) { j.screens = j.screens.filter(s => s !== scr()); j.currentScreenId = j.screens[0].id; ui.sel = null; commit(); } },
  moveScreen: el => { const j = job(), s = scr(), i = j.screens.indexOf(s), k = i + +el.dataset.d; if (k < 0 || k >= j.screens.length) return; j.screens.splice(i, 1); j.screens.splice(k, 0, s); commit(); },
  toggleView: el => { const v = job().view; v[el.dataset.key] = !v[el.dataset.key]; commit(['chips']); },
  stageView: el => { ui.view = el.dataset.v; render(['chips']); },
  autoPlace: () => { Store.autoPlace(job(), $('#placeAlign')?.value || 'top'); commit(); toast('Screens placed left → right'); },
  copy: (el, e) => { e.stopPropagation(); copy(el.dataset.copy); },
  addMode: el => { ui.addMode = el.dataset.m; render(['panel']); },
  setAddRatio: el => { ui.addRatio = el.dataset.r; render(['panel']); },
  addBox: () => { const d = addDims(); if (!d) return toast('Enter a valid size / ratio'); addBoxRect(d.w, d.h); },
  addFit: el => { addBoxRect(+el.dataset.w, +el.dataset.h, G.rnd(+el.dataset.x), G.rnd(+el.dataset.y), `${el.dataset.n} fit`); },
  selBox: el => { ui.sel = el.dataset.id; render(['panel']); },
  boxColor: el => { const b = box(); if (b) { b.color = el.dataset.c; commit(['panel']); } },
  center: el => { const b = box(), s = scr(); if (!b) return; const a = el.dataset.a; if (a !== 'v') b.x = G.rnd((s.w - b.w) / 2); if (a !== 'h') b.y = G.rnd((s.h - b.h) / 2); commit(['panel']); },
  centerSeg: () => { const b = box(), s = scr(), g = G.segments(s)[+($('#segPick')?.value || 0)]; ui.segPick = g.i; b.x = G.rnd(g.cx - b.w / 2); b.y = G.rnd(g.cy - b.h / 2); commit(['panel']); },
  fitSeg: () => { const b = box(), s = scr(), g = G.segments(s)[+($('#segPick')?.value || 0)]; ui.segPick = g.i; b.x = G.rnd(g.x0); b.w = G.rnd(g.x1) - b.x; b.y = G.rnd(g.y0); b.h = G.rnd(g.y1) - b.y; commit(['panel']); },
  copyBox: () => { const b = box(), s = scr(); b && copy(`${G.rnd(OX(s, b.x))}, ${G.rnd(OY(s, b.y))}, ${b.w}, ${b.h}`); },
  copyBoxCenter: () => { const b = box(), s = scr(); b && copy(`${G.rnd(OX(s, b.x + b.w / 2))}, ${G.rnd(OY(s, b.y + b.h / 2))}`); },
  dupBox: () => { const b = box(); if (b) addBoxRect(b.w, b.h, b.x + 40, b.y + 40, b.name + ' copy'); },
  frontBox: () => { const s = scr(), b = box(); if (!b) return; s.boxes = s.boxes.filter(x => x !== b).concat(b); commit(['panel']); },
  delBox: () => delBox(),
  gridMode: el => { scr().grid.mode = el.dataset.m; if (el.dataset.m !== 'off') { job().view.grid = true; job().exportSettings.inc.grid = true; } commit(); },
  panelPreset: el => { const [w, h] = el.dataset.p.split('x').map(Number); Object.assign(scr().grid, { mode: 'panel', panelW: w, panelH: h }); commit(); },
  segLayout: el => {
    const s = scr(); if (!G.isCustomSegs(s)) return;
    if (el.dataset.m === 'fill' && !G.isFill(s)) { s.segmentsOriginal = JSON.parse(JSON.stringify(s.segs)); s.segs = G.fillSegs(s.segmentsOriginal, s.w); s.segLayout = 'fill'; toast(`Fill width: ${s.segs.map(g => g.w).join(' + ')} = ${s.w}`); }
    else if (el.dataset.m === 'original' && G.isFill(s)) { s.segs = s.segmentsOriginal; s.segmentsOriginal = null; s.segLayout = 'original'; toast('Original segment layout'); }
    commit();
  },
  bakeFill: async () => {
    const s = scr(); if (!G.isFill(s)) return;
    if (!(await confirmBox(`Make the filled widths (${s.segs.map(g => g.w).join(' / ')}) the new original? The current original (${s.segmentsOriginal.map(g => g.w).join(' / ')}) is discarded.`, 'Keep fill'))) return;
    s.segmentsOriginal = null; s.segLayout = 'original'; commit();
  },
  segMode: el => {
    const s = scr();
    if (el.dataset.m !== 'custom' && G.isFill(s)) { s.segs = s.segmentsOriginal; s.segmentsOriginal = null; s.segLayout = 'original'; }
    if (el.dataset.m === 'custom') {
      if (!s.segs || !s.segs.length) s.segs = G.splitEqualInt(s.w, s.h, G.segCount(s)).map(g => ({ id: Store.uid('seg'), ...g, pw: null, ph: null }));
      s.segMode = 'custom';
    } else s.segMode = 'equal';
    s.segments = G.segCount(s); commit();
  },
  addSeg: () => {
    const s = scr(); editSegs(s, s => {
      const segs = G.segments(s), last = segs[segs.length - 1], x = last ? last.x1 : 0;
      const w = Math.max(1, s.w - x > 0 ? s.w - x : (last ? last.w : s.w)), n = s.segs.length + 1;
      s.segs.push({ id: Store.uid('seg'), name: `Seg ${n}`, x, y: 0, w, h: s.h, pw: null, ph: null }); s.segments = s.segs.length;
    }); commit();
  },
  delSeg: async el => {
    const s = scr(), i = +el.dataset.i; if (!(await confirmBox(`Remove segment “${s.segs[i].name}”?`, 'Remove'))) return;
    editSegs(s, s => { s.segs.splice(i, 1); if (!s.segs.length) s.segMode = 'equal'; s.segments = G.segCount(s); }); commit();
  },
  moveSeg: el => { const s = scr(), i = +el.dataset.i, k = i + +el.dataset.d; if (k < 0 || k >= s.segs.length) return; editSegs(s, s => { const [g] = s.segs.splice(i, 1); s.segs.splice(k, 0, g); }); commit(); },
  autoPlaceSegs: () => { const s = scr(); editSegs(s, s => G.autoPlaceSegs(s.segs, Math.round(+(ui.segGap ?? 0)) || 0)); commit(); toast('Segments placed left → right'); },
  splitSegs: async () => {
    const s = scr(), n = Math.max(1, Math.min(256, Math.round(+(ui.segSplit ?? Math.max(2, s.segs.length))) || 1));
    if (!(await confirmBox(`Replace the ${s.segs.length} segment(s) with ${n} equal whole-pixel segments?`, 'Split'))) return;
    editSegs(s, s => { const old = s.segs; s.segs = G.splitEqualInt(s.w, s.h, n, old.map(g => g.name)).map((g, i) => ({ id: Store.uid('seg'), ...g, pw: null, ph: null })); s.segments = s.segs.length; });
    commit();
  },
  physUnit: el => { scr().physUnit = el.dataset.u; commit(['panel']); },
  slideUnit: el => { prefs.slideUnit = el.dataset.u; savePrefs(); render(['panel']); },
  pptOut: el => { const s = scr(); s.pptOut = el.dataset.screen ? null : { w: +el.dataset.w, h: +el.dataset.h }; commit(['panel']); },
  pptOpt: el => { ui.pptOpt = el.dataset.k; render(['panel']); },
  pptCurUnit: el => { const s = scr(); if (s.pptCur) { s.pptCur.unit = el.dataset.u; commit(['panel']); } else { ui.pptCurUnit = el.dataset.u; prefs.slideUnit = el.dataset.u; savePrefs(); render(['panel']); } },
  slideCopy: () => { copyLong(slideSummaryText(scr())); },
  slideTxt: () => { const s = scr(); shareOrDownload([new File([slideSummaryText(s)], `${fileSafe(job().name)}_${fileSafe(s.name)}_slides.txt`, { type: 'text/plain' })]); },
  slideCsv: () => {
    const s = scr(), { p, kp } = slidePlan(s); if (!p) return toast('No valid PowerPoint size for this aspect ratio');
    shareOrDownload([new File([SL.toCsv(SL.summaryRows(s, p, kp, slideRects(s), slUnit()))], `${fileSafe(job().name)}_${fileSafe(s.name)}_slides.csv`, { type: 'text/csv' })]);
  },
  slidePptx: async () => {
    const s = scr(), { p } = slidePlan(s); if (!p) return toast('No valid PowerPoint size for this aspect ratio');
    toast('Building .pptx…');
    try {
      const blob = await buildPptx({ job: job(), s, p, rects: slideRects(s), fit: G.segFit(s), summary: slideSummaryText(s) });
      const f = new File([blob], `${fileSafe(job().name)}_${fileSafe(s.name)}_${s.w}x${s.h}.pptx`, { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      ui.lastPptx = f; await shareOrDownload([f]);
    } catch (e) { toast('PPTX failed: ' + e.message); }
  },
  openSlideDlg: el => openSlideDlg(el.dataset.k),
  sdSet: el => { ui.sd[el.dataset.k] = el.dataset.v; renderSlideDlg(); },
  sdApply: () => applySlideDlg(),
  exportOne: () => doExport([scr()]),
  exportAll: () => doExport(job().screens.slice()),
  shareFiles: () => shareOrDownload(ui.exportFiles.map(f => f.file)),
  openJobs: () => openJobs(),
  closeModal: () => closeModal(),
  pickJob: el => { S.currentJobId = el.dataset.id; ui.sel = null; ui.view = 'screen'; ui.exportFiles = []; closeModal(); commit(); },
  renameJob: async () => { const n = await ask('Rename job', job().name, 'Rename'); if (n) { job().name = n; commit(); } openJobs(); },
  dupJob: () => { const c = Store.duplicateJob(job()); S.jobs.push(c); S.currentJobId = c.id; ui.sel = null; commit(); openJobs(); toast('Job duplicated'); },
  delJob: async () => {
    const j = job(); if (!(await confirmBox(`Delete job “${j.name}” and all its screens?`))) return openJobs();
    (S.tombstones = S.tombstones || {})[j.id] = Date.now();
    S.jobs = S.jobs.filter(x => x !== j); if (!S.jobs.length) S.jobs.push(Store.exampleJob()); S.currentJobId = S.jobs[0].id; ui.sel = null; commit(); openJobs();
  },
  newJob: async () => { const n = await ask('New job name', `Job ${new Date().toLocaleDateString()}`, 'Create'); if (n) { const j = Store.emptyJob(n); S.jobs.push(j); S.currentJobId = j.id; ui.sel = null; ui.tab = 'screen'; commit(); } else openJobs(); },
  newExample: () => { const j = Store.exampleJob(); S.jobs.push(j); S.currentJobId = j.id; closeModal(); commit(); },
  exportJson: () => { const j = job(); const f = new File([JSON.stringify({ app: 'ShowCrew PixelMap', version: 1, exported: new Date().toISOString(), job: j }, null, 2)], `${fileSafe(j.name)}.pixelmap.json`, { type: 'application/json' }); shareOrDownload([f]); },
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act]; if (fn) fn(el, e);
});
$('#modeSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  job().mode = b.dataset.mode; if (b.dataset.mode !== 'global') ui.view = 'screen'; commit();
});
$('#originSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  job().origin = b.dataset.origin; commit(); toast(b.dataset.origin === 'center' ? 'Origin: screen center = 0,0 (Y down)' : 'Origin: top-left = 0,0');
});
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

// bound inputs
document.addEventListener('change', e => {
  const el = e.target, key = el.dataset.bind; if (!key) return;
  const [ns, k] = key.split('.'), v = el.type === 'checkbox' ? el.checked : el.value, n = +v;
  const s = scr(), b = box(), ex = job().exportSettings;
  const int = (x, min = -1e7, max = 1e7) => Number.isFinite(x) ? Math.min(max, Math.max(min, Math.round(x))) : null;
  if (ns === 'seg') {   // seg.<index>.<field>
    const [, i, fk] = key.split('.'), fill = G.isFill(s), src = fill ? s.segmentsOriginal : s.segs, g = src && src[+i]; if (!g) return;
    const both = fill ? [g, s.segs[+i]] : [g];   // fill mode: name / physical / Y / H go to both layouts, W / X to the original
    if (fk === 'name') { const nm = v.trim() || g.name; both.forEach(x => x.name = nm); }
    else if (fk === 'pw' || fk === 'ph') both.forEach(x => x[fk] = v === '' || !(n > 0) ? null : n);
    else {
      const x = int(n, fk === 'w' || fk === 'h' ? 1 : -65536, fk === 'w' || fk === 'h' ? 65536 : 131072); if (x == null || v === '') return render(['panel']);
      if (fk === 'y' || fk === 'h') both.forEach(t => t[fk] = x); else g[fk] = x;
      refill(s);
    }
    return commit();
  }
  if (ns === 'segtool') { if (k === 'gap') ui.segGap = n; else ui.segSplit = n; return; }
  if (ns === 'pptout') {
    const o = outOf(s), x = int(n, 1, 65536); if (!x || v === '') return render(['panel']);
    o[k] = x; s.pptOut = o.w === s.w && o.h === s.h ? null : { w: o.w, h: o.h };
    return commit(['panel']);
  }
  if (ns === 'pptcur') {
    const pc = s.pptCur || { w: null, h: null, unit: ui.pptCurUnit || slUnit() };
    pc[k] = v === '' || !(n > 0) ? null : n;
    s.pptCur = pc.w && pc.h ? pc : (pc.w || pc.h ? pc : null);
    return commit(['panel']);
  }
  if (ns === 'scr') {
    if (k === 'name') s.name = v.trim() || s.name;
    else if (k === 'segments') { const x = int(n, 1, 256); if (x) s.segments = x; }
    else { const x = int(n, k === 'w' || k === 'h' ? 1 : -1e7, 65536); if (x != null) s[k] = x; if (k === 'w') refill(s); }
    return commit();
  }
  if (ns === 'grid') { if (n > 0) s.grid[k] = k === 'step' ? n : Math.round(n); return commit(); }
  if (ns === 'box' && b) {
    if (k === 'name') b.name = v.trim() || b.name;
    else if (k === 'color') b.color = v;
    else if (k === 'lock') b.lock = v;
    else {
      const x = int(n, k === 'w' || k === 'h' ? 1 : -1e7); if (x == null || !Number.isFinite(n)) return render(['panel']);
      if (k === 'x') b.x = G.rnd(n + offX(s)); else if (k === 'y') b.y = G.rnd(n + offY(s));
      else if (k === 'cx') b.x = G.rnd(n + offX(s) - b.w / 2); else if (k === 'cy') b.y = G.rnd(n + offY(s) - b.h / 2);
      else if (b.lock && (k === 'w' || k === 'h')) { const r = b.w / b.h; if (k === 'w') { b.w = x; b.h = Math.max(1, G.rnd(x / r)); } else { b.h = x; b.w = Math.max(1, G.rnd(x * r)); } }
      else b[k] = x;
    }
    return commit(['panel', 'screens']);
  }
  if (ns === 'add') { ({ w: () => ui.addW = v, h: () => ui.addH = v, ratio: () => ui.addRatio = v, pct: () => ui.addPct = v, fw: () => ui.addFW = v, fh: () => ui.addFH = v })[k](); return render(['panel']); }
  if (ns === 'ratioTarget') { ui.ratioTarget = +v; return render(['panel']); }
  if (ns === 'customRatio') { ui.customRatio = v; return render(['panel']); }
  if (ns === 'exinc') { ex.inc[k] = v; return commit(['panel']); }
  if (ns === 'ex') {
    if (k === 'lw') ex.lw = Math.min(64, Math.max(1, n || 1)); else if (k === 'textSize') ex.textSize = Math.max(0, n || 0);
    else ex[k] = v; return commit(['panel']);
  }
});
// live color preview while dragging the picker
document.addEventListener('input', e => { const el = e.target; if (el.dataset.bind === 'box.color' && box()) { box().color = el.value; drawStage(); } });

new ResizeObserver(() => drawStage()).observe(wrap);
if (syncConfigured) { renderSync(); sync.init(); authLinkError(); }
window.addEventListener('orientationchange', () => setTimeout(drawStage, 300));
render();
window.__pm = { get S() { return S; }, ui, G, SL, render, slideSummaryText, job, scr, ACTIONS, screenToBlob, sync };

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW registration failed', e));
}
