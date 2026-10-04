// ShowCrew PixelMap — UI controller.
import * as G from './geometry.js';
import * as Store from './store.js';
import { drawScreen, drawOverview, canvasBounds, handlePoints, screenToBlob } from './render.js';

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
function persist() { job().updated = Date.now(); clearTimeout(saveT); saveT = setTimeout(() => Store.save(S), 150); }
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
    <div class="pane-h"><span>SCREENS</span><button class="btn sm ghost" data-act="addScreen">＋ Add</button></div>
    <div class="scr-list">${j.screens.map((s, i) => {
      const a = G.aspect(s.w, s.h), n = G.segCount(s);
      return `<button class="scr-card ${s.id === cur.id ? 'on' : ''}" data-act="pickScreen" data-id="${s.id}">
        <span class="scr-idx">${String(i + 1).padStart(2, '0')}</span>
        <span class="scr-name">${esc(s.name)}</span>
        <span class="scr-res">${s.w}×${s.h}</span>
        <span class="scr-meta">${a.text} · ${a.decText}${n > 1 ? ` · <b>${n} seg</b>` : ''}${s.boxes.length ? ` · ${s.boxes.length} box` : ''}${gl ? `<br><i>@ ${s.x}, ${s.y}</i>` : ''}</span>
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
const TABS = [['coords', 'Coords'], ['boxes', 'PiP Boxes'], ['ratios', 'Ratios'], ['screen', 'Screen'], ['export', 'Export']];
function renderPanel() {
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<button class="tab ${ui.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('');
  const active = document.activeElement, fid = active && active.dataset ? active.dataset.f : null;
  const body = $('#panelBody'), scrollTop = body.scrollTop;
  body.innerHTML = ({ coords: panelCoords, boxes: panelBoxes, ratios: panelRatios, screen: panelScreen, export: panelExport })[ui.tab]();
  body.scrollTop = scrollTop;
  if (fid) { const el = body.querySelector(`[data-f="${fid}"]`); if (el && el !== active) { el.focus({ preventScroll: true }); try { el.select && el.select(); } catch { } } }
  if (ui.tab === 'export') renderExportResults();
}

function aspectBlock(s) {
  const a = G.aspect(s.w, s.h);
  return `<div class="hud-stat"><div><div class="lbl">RESOLUTION</div><div class="big">${s.w}<i>×</i>${s.h}</div></div>
    <div><div class="lbl">ASPECT</div><div class="big">${a.text}</div><div class="sub">${a.decText}</div></div>
    ${G.segCount(s) > 1 ? `<div><div class="lbl">SEGMENTS</div><div class="big amber">${G.segCount(s)}</div><div class="sub">${F(s.w / G.segCount(s))}×${s.h} each</div></div>` : ''}</div>`;
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
  const s = scr(), b = box(), gl = isGlobal(), n = G.segCount(s);
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
      ${n > 1 ? `<div class="row"><select class="inp grow" id="segPick">${G.segments(s).map(g => `<option value="${g.i}" ${ui.segPick == g.i ? 'selected' : ''}>Segment ${g.n} (${F(g.x0)}–${F(g.x1)})</option>`).join('')}</select>
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
  const s = scr(), n = G.segCount(s), segs = G.segments(s);
  const tgt = ui.ratioTarget ?? -1, area = tgt >= 0 && segs[tgt] ? segs[tgt] : { x0: 0, w: s.w, h: s.h };
  const ratios = [['16:9', 16, 9], ['4:3', 4, 3], ['1:1', 1, 1], ['9:16', 9, 16]];
  const cr = G.parseRatio(ui.customRatio ?? '2.39:1'); if (cr) ratios.push([`Custom ${ui.customRatio ?? '2.39:1'}`, cr[0], cr[1]]);
  let html = aspectBlock(s);
  html += `<div class="card"><div class="lbl">LARGEST CENTERED FIT</div>
    ${n > 1 ? `<label class="fld"><span>Fit inside</span><select class="inp" data-bind="ratioTarget"><option value="-1">Whole screen (${s.w}×${s.h})</option>${segs.map(g => `<option value="${g.i}" ${tgt == g.i ? 'selected' : ''}>Segment ${g.n} (${F(g.w)}×${s.h})</option>`).join('')}</select></label>` : ''}
    <label class="fld"><span>Custom ratio</span><input class="inp" data-f="customRatio" data-bind="customRatio" value="${esc(ui.customRatio ?? '2.39:1')}" placeholder="e.g. 2.39:1 or 5:4"></label>
    ${originHint(s)}<table class="ro fit"><thead><tr><th>Ratio</th><th>W×H</th><th>Top-left X, Y</th><th></th></tr></thead><tbody>`;
  for (const [label, rw, rh] of ratios) {
    const f = G.largestFit(area.w, area.h, rw, rh); if (!f) continue;
    const x = area.x0 + f.x, y = f.y;
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
    <div class="grid3">${numInput('scr.w', s.w, 'Width px', 'min="1"')}${numInput('scr.h', s.h, 'Height px', 'min="1"')}${numInput('scr.segments', G.segCount(s), 'Segments', 'min="1" max="256"')}</div>
    ${G.segCount(s) > 1 && !G.isInt(s.w / G.segCount(s)) ? `<p class="warn">⚠ ${s.w} / ${G.segCount(s)} = ${F(s.w / G.segCount(s))} px — segments are not whole pixels.</p>` : ''}
    ${gl ? `<div class="lbl mt">GLOBAL CANVAS OFFSET</div><div class="grid2">${numInput('scr.x', s.x, 'Offset X')}${numInput('scr.y', s.y, 'Offset Y')}</div>` : ''}
  </div>
  <div class="card"><div class="lbl">CUSTOM GRID</div>
    <div class="seg full wrap">${[['off', 'Off'], ['nm', 'N × M'], ['px', 'Every X px'], ['led192', 'LED 192×192'], ['led384', 'Double LED 192×384'], ['panel', 'Custom panel']].map(([k, l]) => `<button class="${g.mode === k ? 'on' : ''}" data-act="gridMode" data-m="${k}">${l}</button>`).join('')}</div>
    ${g.mode === 'panel' ? `<div class="grid2">${numInput('grid.panelW', g.panelW, 'Panel W px', 'min="1"')}${numInput('grid.panelH', g.panelH, 'Panel H px', 'min="1"')}</div>
      <div class="row wrap">${['250x250', '500x500', '500x1000', '192x192', '160x160', '128x128'].map(p => `<button class="chip sm" data-act="panelPreset" data-p="${p}">${p.replace('x', '×')}</button>`).join('')}</div>` : ''}
    ${panelCard(s)}
    ${g.mode === 'nm' ? `<div class="grid2">${numInput('grid.cols', g.cols, 'Columns (N)', 'min="1"')}${numInput('grid.rows', g.rows, 'Rows (M)', 'min="1"')}</div>` : ''}
    ${g.mode === 'px' ? `<div class="grid2">${numInput('grid.step', g.step, 'Step px', 'min="1"')}</div>` : ''}
  </div>
  <div class="row wrap"><button class="btn sm" data-act="moveScreen" data-d="-1" ${idx === 0 ? 'disabled' : ''}>↑ Move up</button><button class="btn sm" data-act="moveScreen" data-d="1" ${idx === j.screens.length - 1 ? 'disabled' : ''}>↓ Move down</button>
  <button class="btn sm" data-act="dupScreen">Duplicate</button><button class="btn sm danger" data-act="delScreen">Delete screen</button></div>`;
}

const EXP_ITEMS = [['bg', 'Background'], ['outline', 'Outline / border'], ['crosshair', 'Center crosshair'], ['centerLines', 'Center lines'], ['thirds', 'Thirds'], ['grid', 'Custom / panel grid'],
  ['segDividers', 'Segment dividers'], ['segCenters', 'Segment centers'], ['segGuides', 'Segment guides (center/thirds)'], ['boxes', 'PiP boxes'], ['labels', 'Labels (name + resolution)'], ['coordLabels', 'Coordinate labels'], ['panelLabels', 'Panel numbers (C# R#)']];
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
  const segs = G.segCount(s) > 1;
  drawScreen(ctx, s, {
    u, lw: 1.1, glow: true, colors: PREVIEW_COLORS, origin: G.originOf(s, j.origin), boxOwnColors: true, fs: 11 * u, selectedId: ui.sel, snapLines: ui.snapLines,
    handles: true, handleR: 9, probe: ui.drag ? null : ui.probe,
    inc: { bg: true, outline: true, crosshair: v.center, centerLines: v.centerLines, thirds: v.thirds, grid: v.grid, segDividers: v.segments && segs,
      segCenters: v.segments && segs && v.center, segGuides: v.segGuides && segs, boxes: v.boxes, labels: v.labels, coordLabels: v.labels, panelLabels: v.labels && v.grid && j.exportSettings.inc.panelLabels },
  });
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

const ACTIONS = {
  tab: el => { ui.tab = el.dataset.tab; render(['panel']); },
  pickScreen: el => { job().currentScreenId = el.dataset.id; ui.sel = null; ui.probe = null; if (ui.view === 'canvas') ui.view = 'screen'; commit(['screens', 'panel', 'chips']); },
  addScreen: () => { const j = job(), s = Store.makeScreen(`Screen ${j.screens.length + 1}`, 1920, 1080); const last = j.screens[j.screens.length - 1]; if (last) s.x = last.x + last.w; j.screens.push(s); j.currentScreenId = s.id; ui.tab = 'screen'; ui.sel = null; commit(); },
  dupScreen: () => { const j = job(), s = scr(), c = JSON.parse(JSON.stringify(s)); c.id = Store.uid('scr'); c.name += ' copy'; c.boxes.forEach(b => b.id = Store.uid('box')); j.screens.splice(j.screens.indexOf(s) + 1, 0, c); j.currentScreenId = c.id; commit(); },
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
  centerSeg: () => { const b = box(), s = scr(), g = G.segments(s)[+($('#segPick')?.value || 0)]; ui.segPick = g.i; b.x = G.rnd(g.cx - b.w / 2); b.y = G.rnd((s.h - b.h) / 2); commit(['panel']); },
  fitSeg: () => { const b = box(), s = scr(), g = G.segments(s)[+($('#segPick')?.value || 0)]; ui.segPick = g.i; b.x = G.rnd(g.x0); b.w = G.rnd(g.x1) - b.x; b.y = 0; b.h = s.h; commit(['panel']); },
  copyBox: () => { const b = box(), s = scr(); b && copy(`${G.rnd(OX(s, b.x))}, ${G.rnd(OY(s, b.y))}, ${b.w}, ${b.h}`); },
  copyBoxCenter: () => { const b = box(), s = scr(); b && copy(`${G.rnd(OX(s, b.x + b.w / 2))}, ${G.rnd(OY(s, b.y + b.h / 2))}`); },
  dupBox: () => { const b = box(); if (b) addBoxRect(b.w, b.h, b.x + 40, b.y + 40, b.name + ' copy'); },
  frontBox: () => { const s = scr(), b = box(); if (!b) return; s.boxes = s.boxes.filter(x => x !== b).concat(b); commit(['panel']); },
  delBox: () => delBox(),
  gridMode: el => { scr().grid.mode = el.dataset.m; if (el.dataset.m !== 'off') { job().view.grid = true; job().exportSettings.inc.grid = true; } commit(); },
  panelPreset: el => { const [w, h] = el.dataset.p.split('x').map(Number); Object.assign(scr().grid, { mode: 'panel', panelW: w, panelH: h }); commit(); },
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
  if (ns === 'scr') {
    if (k === 'name') s.name = v.trim() || s.name;
    else if (k === 'segments') { const x = int(n, 1, 256); if (x) s.segments = x; }
    else { const x = int(n, k === 'w' || k === 'h' ? 1 : -1e7, 65536); if (x != null) s[k] = x; }
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
window.addEventListener('orientationchange', () => setTimeout(drawStage, 300));
render();
window.__pm = { get S() { return S; }, ui, G, render, job, scr, ACTIONS, screenToBlob };

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW registration failed', e));
}
