// v1.9 browser tests: per-screen / per-segment color fills + job layer list (order, drag, ↑↓, show/hide, opacity), preview + PNG export.
// Serve this folder on :8765, then: node tools/layers-test.mjs   (local test job; never signs in)
import { chromium } from 'playwright';
const URL = process.env.PM_URL || 'http://127.0.0.1:8765/';
const OUT = process.env.PM_OUT || new globalThis.URL('../screenshots/', import.meta.url).pathname;
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch();
async function open(name, opts) {
  const ctx = await browser.newContext({ ...opts, acceptDownloads: true, serviceWorkers: 'block' }); const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await page.goto(URL); await page.waitForTimeout(500);
  await page.evaluate(() => { __pm.ACTIONS.newExample(); const j = __pm.job(); j.name = 'Layers test'; delete j.layers; const s = j.screens[0]; j.screens = [s]; j.currentScreenId = s.id;
    Object.assign(s, { name: 'Wall', w: 1000, h: 500, segMode: 'custom', segments: 2, segLayout: 'original', segmentsOriginal: null, fill: undefined, segFills: undefined,
      segs: [{ id: 'a', name: 'Left', x: 0, y: 0, w: 500, h: 500 }, { id: 'b', name: 'Right', x: 500, y: 0, w: 500, h: 500 }],
      boxes: [{ id: 'p', name: 'PiP', color: '#ff3df2', x: 0, y: 0, w: 400, h: 400, lock: false }] });
    s.grid.mode = 'off'; __pm.ui.tab = 'screen'; __pm.ui.sel = null; __pm.render(); });
  await sleep(150);
  return { name, ctx, page, errs, tap: !!opts.isMobile };
}
const click = (d, sel) => (d.tap ? d.page.locator(sel).first().tap() : d.page.locator(sel).first().click());
const tab = async (d, t) => { await click(d, `.tab[data-tab=${t}]`); await sleep(120); };
const order = d => d.page.evaluate(() => __pm.G.normLayers(__pm.job().layers).map(l => l.id).join(','));
const pick = async (d, bind, val) => { await d.page.locator(`input[data-bind="${bind}"]`).first().evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, val); await sleep(80); };
const slide = async (d, id, v) => { await d.page.locator(`input[data-bind="layer.${id}.opacity"]`).first().evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v); await sleep(80); };
const px = (d, pts) => d.page.evaluate(async pts => { const j = __pm.job(), b = await __pm.screenToBlob(__pm.scr(), { ...j.exportSettings, layers: j.layers }, j.origin), im = await createImageBitmap(b);
  const c = new OffscreenCanvas(im.width, im.height), g = c.getContext('2d'); g.drawImage(im, 0, 0); return pts.map(([x, y]) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3)); }, pts);
const stagePx = d => d.page.evaluate(() => { const c = document.querySelector('#stage canvas, canvas'); const g = c.getContext('2d'); return [...g.getImageData(0, 0, c.width, c.height).data].reduce((a, v, i) => (i % 4 === 0 ? a + v : a), 0); });
const same = (a, b, t = 2) => a.every((v, i) => Math.abs(v - b[i]) <= t);
const RIGHT = [760, 130], PIP = [200, 330];

for (const [label, opts] of [['iPad', { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true }], ['iPhone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }], ['Desktop', { viewport: { width: 1440, height: 900 } }]]) {
  const d = await open(label, opts), P = label + ': ';
  // defaults
  ok(await order(d) === 'fill,grid,segs,pip', P + 'default layer order Color < Grid < Segments < PiPs');
  const L0 = await d.page.evaluate(() => __pm.G.normLayers(__pm.job().layers));
  ok(L0[0].opacity === 0.4 && L0.every(l => l.on) && L0.slice(1).every(l => l.opacity === 1), P + 'defaults: color 40%, others 100%, all shown');
  ok(await d.page.evaluate(() => !__pm.scr().fill && __pm.scr().segs.every(g => !g.fill)), P + 'no fill until picked (screen + segments null)');
  ok(await d.page.locator('.card.fills input[type=color]').count() === 3, P + 'Screen tab: color box for screen + each segment (3)');
  ok(await d.page.locator('.card.layers .lay-row').count() === 4, P + 'Screen tab: layers card with 4 rows');
  const names = await d.page.locator('.card.layers .lay-name').allInnerTexts();
  ok(/^PiPs\|Segments[^|]*\|Grid[^|]*\|Color fills/.test(names.join('|')), P + 'list shows top → bottom: ' + names.join('|'));
  const [r0, p0] = await px(d, [RIGHT, PIP]);
  const stage0 = await stagePx(d);
  // pick colors via the UI
  await pick(d, 'seg.1.fill', '#ff0000');
  ok(await d.page.evaluate(() => __pm.scr().segs[1].fill) === '#ff0000', P + 'segment picker stores seg.fill');
  await pick(d, 'scr.fill', '#0000ff');
  ok(await d.page.evaluate(() => __pm.scr().fill) === '#0000ff', P + 'screen picker stores screen.fill');
  ok(await stagePx(d) !== stage0, P + 'canvas preview changes with fills');
  const [r1, p1] = await px(d, [RIGHT, PIP]);
  const exp = r0.map((v, i) => Math.round(v * 0.6 + [255, 0, 0][i] * 0.4));
  ok(same(r1, exp, 3), P + `export: red segment fill at 40% over bg ${JSON.stringify(r0)} → ${JSON.stringify(r1)} (expected ≈${JSON.stringify(exp)})`);
  ok(r1[2] <= r0[2] + 3, P + 'segment color replaces (not stacks with) the blue screen fill');
  // PiP above fill by default: PiP area pixel unchanged by order? record, then move fill to top
  for (let k = 0; k < 3; k++) await click(d, '.lay-row[data-id=fill] [data-act=layerMove][data-d="1"]');
  ok(await order(d) === 'grid,segs,pip,fill', P + '↑ ×3 moves Color fills to top');
  const [, p2] = await px(d, [RIGHT, PIP]);
  ok(!same(p1, p2, 1), P + `order changes pixels in PiP area ${JSON.stringify(p1)} → ${JSON.stringify(p2)}`);
  await click(d, '.lay-row[data-id=fill] [data-act=layerMove][data-d="-1"]');
  ok(await order(d) === 'grid,segs,fill,pip', P + '↓ moves it back one');
  ok(await d.page.locator('.lay-row[data-id=fill] [data-act=layerMove][data-d="1"]').isEnabled() && !(await d.page.locator('.lay-row[data-id=pip] [data-act=layerMove][data-d="1"]').isEnabled()), P + 'top row ↑ disabled');
  // drag (desktop pointer) — use dragTo on all; HTML5 dnd
  if (!d.tap) { await d.page.locator('.lay-row[data-id=fill]').dragTo(d.page.locator('.lay-row[data-id=grid]')); await sleep(150);
    ok(await order(d) === 'fill,grid,segs,pip', P + 'drag Color fills onto Grid → back to bottom: ' + await order(d)); }
  else { await d.page.evaluate(() => __pm.ACTIONS.layerReset()); await sleep(80); ok(await order(d) === 'fill,grid,segs,pip', P + 'Reset restores default order'); }
  // opacity
  await slide(d, 'fill', 100);
  let [r3] = await px(d, [RIGHT]);
  ok(same(r3, [255, 0, 0], 3), P + 'opacity 100% → solid red ' + JSON.stringify(r3));
  ok((await d.page.locator('.lay-row[data-id=fill] output').innerText()) === '100%', P + 'opacity readout 100%');
  await slide(d, 'fill', 0); [r3] = await px(d, [RIGHT]);
  ok(same(r3, r0, 1), P + 'opacity 0% → no fill');
  await slide(d, 'fill', 40);
  // toggle
  await click(d, '.lay-row[data-id=fill] [data-act=layerOn]'); [r3] = await px(d, [RIGHT]);
  ok(same(r3, r0, 1) && (await d.page.evaluate(() => __pm.job().layers.find(l => l.id === 'fill').on)) === false, P + 'hide layer → no fill in export');
  await click(d, '.lay-row[data-id=fill] [data-act=layerOn]');
  await click(d, '.lay-row[data-id=pip] [data-act=layerOn]'); const [, p4] = await px(d, [RIGHT, PIP]);
  ok(!same(p4, p1, 1), P + 'hide PiPs layer removes the PiP box');
  await click(d, '.lay-row[data-id=pip] [data-act=layerOn]');
  // export checklist + same pickers in Export tab
  await tab(d, 'export');
  ok(await d.page.locator('[data-bind="exinc.fill"]').count() === 1, P + 'export checklist has Color fills option');
  ok(await d.page.locator('.card.fills input[type=color]').count() === 3 && (await d.page.locator('.card.fills input[data-bind="seg.1.fill"]').inputValue()) === '#ff0000', P + 'Export tab shows the same color pickers / values');
  ok(await d.page.locator('.card.layers .lay-row').count() === 4, P + 'Export tab shows layers card');
  await d.page.locator('[data-bind="exinc.fill"]').first().evaluate(el => { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(80);
  [r3] = await px(d, [RIGHT]); ok(same(r3, r0, 1), P + 'unchecking Color fills excludes fill from PNG');
  await d.page.locator('[data-bind="exinc.fill"]').first().evaluate(el => { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(80);
  await pick(d, 'scr.fill', '#00ff00');
  await tab(d, 'screen');
  ok((await d.page.locator('.card.fills input[data-bind="scr.fill"]').inputValue()) === '#00ff00', P + 'picker change in Export reflected in Screen tab');
  // clear
  await click(d, '.card.fills [data-act=clearFill][data-k="seg.1.fill"]');
  ok(await d.page.evaluate(() => __pm.scr().segs[1].fill) === null, P + 'None clears a fill');
  // equal mode pickers
  await d.page.evaluate(() => { const s = __pm.scr(); s.segMode = 'equal'; s.segments = 3; __pm.render(); }); await sleep(100);
  ok(await d.page.locator('.card.fills input[data-bind^="segfill."]').count() === 3, P + 'equal split: 3 segment pickers');
  await pick(d, 'segfill.2', '#ffff00');
  ok(await d.page.evaluate(() => __pm.scr().segFills[2]) === '#ffff00', P + 'equal segment picker stores segFills[2]');
  // persistence
  await d.page.evaluate(() => { const L = __pm.job().layers; [L[0], L[1]] = [L[1], L[0]]; __pm.ACTIONS.layerMove({ dataset: { id: 'pip', d: '-1' } }); });
  const ord = await order(d); await sleep(400); await d.page.reload(); await sleep(600);
  const after = await d.page.evaluate(() => ({ o: __pm.G.normLayers(__pm.job().layers).map(l => l.id).join(','), f: __pm.scr().fill, sf: __pm.scr().segFills[2] }));
  ok(after.o === ord && after.f === '#00ff00' && after.sf === '#ffff00', P + 'layers + fills persist after reload ' + JSON.stringify(after));
  await tab(d, 'screen');
  if (label === 'iPhone') {
    const bb = await d.page.locator('.lay-row[data-id=fill] [data-act=layerMove]').first().boundingBox();
    ok(bb && bb.height >= 36 && bb.width >= 32, P + `↑ button touch target ${bb && Math.round(bb.width)}×${bb && Math.round(bb.height)}`);
    const ov = await d.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); ok(ov, P + 'no horizontal overflow');
  }
  if (label === 'iPad') {
    await d.page.evaluate(() => { const s = __pm.scr(); Object.assign(s, { segMode: 'custom', segments: 3, w: 11344, h: 1080, segs: [{ id: 'l', name: 'Left', x: 0, y: 0, w: 3511, h: 1080, fill: '#ff3d71' }, { id: 'c', name: 'Center', x: 3511, y: 0, w: 4322, h: 1080, fill: null }, { id: 'r', name: 'Right', x: 7833, y: 0, w: 3511, h: 1080, fill: '#3dff8a' }], fill: '#2b6cff', boxes: [{ id: 'p', name: 'PiP', color: '#ff3df2', x: 4500, y: 140, w: 1920, h: 800 }] }); s.grid.mode = 'panel'; s.grid.panelW = 176; s.grid.panelH = 180; __pm.job().view.grid = true; __pm.job().layers = __pm.G.defaultLayers(); __pm.render(); });
    await sleep(300); await d.page.screenshot({ path: OUT + 'ipad-color-fills-layers.png' }); await d.page.locator('.card.layers').scrollIntoViewIfNeeded(); await d.page.locator('.card.layers').screenshot({ path: OUT + 'ipad-layers-card.png' });
  }
  ok(d.errs.length === 0, P + 'no console errors ' + d.errs.join(' | '));
  await d.ctx.close();
}
await browser.close();
console.log(results.join('\n'));
const f = results.filter(r => r.startsWith('FAIL')).length; console.log(`\n${results.length - f}/${results.length} passed`); process.exit(f ? 1 : 0);
