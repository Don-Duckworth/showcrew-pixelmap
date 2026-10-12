// v1.7 browser tests: "Re-layout segments to fill" (Original ↔ Fill width) on Don's 3510/4320/3510 segments (11344×1080, 4 px short).
// Serve this folder on :8765, then: node tools/fill-test.mjs   (local test job; never signs in; python3 for the .pptx check)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const URL = process.env.PM_URL || 'http://127.0.0.1:8765/';
const OUT = process.env.PM_OUT || new globalThis.URL('../screenshots/', import.meta.url).pathname;
const TMP = '/tmp/pm-fill-test/'; fs.mkdirSync(TMP, { recursive: true });
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch();
async function open(name, opts) {
  const ctx = await browser.newContext({ ...opts, acceptDownloads: true, serviceWorkers: 'block' }); const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await page.goto(URL); await page.waitForTimeout(500);
  await page.evaluate(() => { __pm.ACTIONS.newExample(); const j = __pm.job(); j.name = 'TacoBell example (Don\'s segment sizes)'; const s = j.screens[0]; j.screens = [s]; j.currentScreenId = s.id;
    Object.assign(s, { name: 'Screen 1', w: 11344, h: 1080, segMode: 'custom', segments: 3, physUnit: 'ft', pptCur: { w: 55.561, h: 5.28, unit: 'in' }, pptOut: null, segLayout: 'original', segmentsOriginal: null,
      segs: [{ id: 'sl', name: 'Left', x: 0, y: 0, w: 3510, h: 1080, pw: 52, ph: 16 }, { id: 'sc', name: 'Center', x: 3510, y: 0, w: 4320, h: 1080, pw: 66, ph: 16 }, { id: 'sr', name: 'Right', x: 7830, y: 0, w: 3510, h: 1080, pw: 52, ph: 16 }],
      boxes: [{ id: 'b1', name: 'PiP', color: '#ff3df2', x: 0, y: 0, w: 1920, h: 1080, lock: false }] });
    __pm.ui.tab = 'screen'; __pm.ui.sel = null; __pm.render(); });
  await sleep(150);
  return { name, ctx, page, errs, tap: !!opts.isMobile };
}
const click = (d, sel) => (d.tap ? d.page.locator(sel).first().tap() : d.page.locator(sel).first().click());
const txt = (d, sel) => d.page.locator(sel).first().innerText();
const st = d => d.page.evaluate(() => { const s = __pm.scr(); return { layout: s.segLayout, segs: s.segs.map(g => [g.name, g.x, g.w, g.y, g.h]), orig: s.segmentsOriginal && s.segmentsOriginal.map(g => [g.name, g.x, g.w]), w: s.w }; });
async function setField(d, f, v) { const el = d.page.locator(`[data-f="${f}"]`).first(); await el.fill(String(v)); await el.dispatchEvent('change'); await sleep(80); }
const tab = async (d, t) => { await click(d, `.tab[data-tab=${t}]`); await sleep(120); };
const pixel = (d, x, y) => d.page.evaluate(async ([x, y]) => { const s = __pm.scr(), b = await __pm.screenToBlob(s, __pm.job().exportSettings, __pm.job().origin), im = await createImageBitmap(b);
  const c = new OffscreenCanvas(im.width, im.height), g = c.getContext('2d'); g.drawImage(im, 0, 0); return [im.width, ...g.getImageData(x, y, 1, 1).data]; }, [x, y]);

for (const [label, opts] of [['iPad', { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true }], ['iPhone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }], ['Desktop', { viewport: { width: 1440, height: 900 } }]]) {
  const d = await open(label, opts), P = label + ': ';
  // ---- Original
  let lb = await txt(d, '.layout-box');
  ok((await d.page.getAttribute('.layout-box', 'data-layout')) === 'original' && lb.includes('Active: Original') && lb.includes('3510 + 4320 + 3510 = 11340 px') && lb.includes('4 px short'), P + 'layout shows Original active (3510 + 4320 + 3510 = 11340, 4 px short)');
  ok(lb.includes('×1.00035') && /Left[\s\S]*3510[\s\S]*3511[\s\S]*\+1/.test(lb) && /Center[\s\S]*4320[\s\S]*4322[\s\S]*\+2/.test(lb) && /Total[\s\S]*11340[\s\S]*11344[\s\S]*\+4/.test(lb), P + 'before/after widths table: 3510→3511, 4320→4322, 3510→3511, total 11340→11344');
  ok((await txt(d, '.scr-card')).includes('4 px short'), P + 'screen list fit badge "4 px short" in Original');
  const pxOrig = await pixel(d, 11342, 540);
  // ---- one tap: Fill (from the fit warning's button)
  ok(await d.page.locator('.fitwarn [data-act=segLayout][data-m=fill]').count() === 1, P + 'fit warning offers "Re-layout segments to fill"');
  await click(d, '.fitwarn [data-act=segLayout][data-m=fill]'); await sleep(150);
  let S = await st(d);
  ok(S.layout === 'fill' && JSON.stringify(S.segs) === JSON.stringify([['Left', 0, 3511, 0, 1080], ['Center', 3511, 4322, 0, 1080], ['Right', 7833, 3511, 0, 1080]]), P + 'Fill: 3511 / 4322 / 3511 at x 0 / 3511 / 7833, y & h unchanged ' + JSON.stringify(S.segs));
  ok(JSON.stringify(S.orig) === JSON.stringify([['Left', 0, 3510], ['Center', 3510, 4320], ['Right', 7830, 3510]]), P + 'original layout stored in segmentsOriginal');
  lb = await txt(d, '.layout-box');
  ok((await d.page.getAttribute('.layout-box', 'data-layout')) === 'fill' && lb.includes('Active: Fill width') && lb.includes('3511 + 4322 + 3511 = 11344 px') && lb.includes('fills 11344 exactly'), P + 'layout shows Fill width active, sum 11344');
  ok(await d.page.locator('.layout-box [data-act=segLayout][data-m=fill].on').count() === 1 && await d.page.locator('.lay-tbl th.act').innerText() === 'Fill width', P + 'Fill button + column highlighted');
  ok(!(await txt(d, '.scr-card')).includes('px short') && (await txt(d, '.scr-card')).includes('custom · fill'), P + 'fit warning cleared; screen list says "custom · fill"');
  ok((await txt(d, '.seg-editor')).includes('Segments fill the screen exactly (3511 + 4322 + 3511 = 11344 px)'), P + 'fit check reflects active layout');
  ok((await d.page.inputValue('[data-f="seg.0.w"]')) === '3510' && (await txt(d, '.seg-row')).includes('Original W'), P + 'fill mode edits the Original (W field = 3510, labelled)');
  const pxFill = await pixel(d, 11342, 540);
  ok(pxOrig[0] === 11344 && pxFill[0] === 11344 && pxOrig.slice(1).join() !== pxFill.slice(1).join(), P + 'PNG export: 4 px unused strip hatched in Original, gone in Fill ' + JSON.stringify([pxOrig, pxFill]));
  // ---- toggle back and forth (one tap each)
  await click(d, '.layout-box [data-act=segLayout][data-m=original]'); await sleep(120); S = await st(d);
  ok(S.layout === 'original' && S.orig === null && S.segs.map(g => g[2]).join() === '3510,4320,3510' && S.segs[2][1] === 7830 && (await txt(d, '.scr-card')).includes('4 px short'), P + 'one tap → Original restored exactly (3510/4320/3510, Right @ 7830)');
  await click(d, '.layout-box [data-act=segLayout][data-m=fill]'); await sleep(120); S = await st(d);
  ok(S.layout === 'fill' && S.segs.map(g => g[2]).join() === '3511,4322,3511', P + 'one tap → Fill again');
  // ---- edits in Fill mode go to the Original, fill recalculated
  await setField(d, 'seg.0.w', 3500); S = await st(d);
  ok(S.orig[0][2] === 3500 && S.segs.reduce((a, g) => a + g[2], 0) === 11344 && S.segs.map(g => g[2]).join() === '3504,4326,3514', P + 'edit Original W 3510→3500 in Fill: fill recalculated 3504/4326/3514 = 11344 ' + JSON.stringify(S.segs.map(g => g[2])));
  await setField(d, 'seg.0.w', 3510); await setField(d, 'seg.1.name', 'Middle'); S = await st(d);
  ok(S.orig[1][0] === 'Middle' && S.segs[1][0] === 'Middle' && S.segs.map(g => g[2]).join() === '3511,4322,3511', P + 'rename applies to both layouts; W back → 3511/4322/3511');
  await setField(d, 'seg.1.name', 'Center');
  await setField(d, 'scr.w', 11340); S = await st(d); ok(S.segs.map(g => g[2]).join() === '3510,4320,3510', P + 'screen width 11340 → fill = original sizes');
  await setField(d, 'scr.w', 11344); S = await st(d); ok(S.segs.map(g => g[2]).join() === '3511,4322,3511', P + 'screen width back to 11344 → re-filled');
  // ---- PiP "center in seg" uses the active layout
  await tab(d, 'boxes'); await click(d, '.box-item'); await sleep(120);
  ok((await txt(d, '#segPick')).includes('Center (3511–7833'), P + 'PiP segment picker lists the filled Center (3511–7833)');
  await d.page.selectOption('#segPick', '1'); await click(d, '[data-act=centerSeg]'); await sleep(120);
  const bx = await d.page.evaluate(() => __pm.scr().boxes[0].x); ok(bx === 3511 + 2161 - 960, P + `PiP center in Center → x ${bx} (5672 − 960)`);
  // ---- Slides tab + playback use the active layout
  await tab(d, 'slides');
  const sl = await txt(d, '.pptcard + .card + .card');
  ok(sl.includes('7833, 0 · 3511×1080 px') && sl.includes('27.198'), P + 'Slides positions: Right at 7833 px = 27.198 in');
  const pb = await txt(d, '[data-pb=cur]'); ok(/Right[\s\S]*x 7833–11344/.test(pb), P + 'playback fit: Right lands x 7833–11344');
  const sum = await d.page.evaluate(() => __pm.slideSummaryText(__pm.scr())); ok(sum.includes('3511') && !sum.includes('Segment fit warnings'), P + 'summary uses fill (no fit warning)');
  if (label === 'iPad') {
    await tab(d, 'screen'); await d.page.locator('.layout-box').evaluate(e => e.scrollIntoView({ block: 'start' })); await sleep(150);
    await d.page.screenshot({ path: OUT + 'ipad-segments-fill-width.png' }); await tab(d, 'slides');
    const dl = d.page.waitForEvent('download', { timeout: 20000 }); await click(d, '[data-act=slidePptx]'); const f = await dl; await f.saveAs(TMP + 'fill.pptx');
    const info = JSON.parse(execFileSync('python3', ['-c', `
import zipfile, re, json, sys
s1 = zipfile.ZipFile(sys.argv[1]).read('ppt/slides/slide1.xml').decode()
print(json.dumps(re.findall(r'<p:cNvPr id="\\d+" name="([^"]+)"[^>]*>.*?<a:off x="(\\d+)" y="(\\d+)"/><a:ext cx="(\\d+)" cy="(\\d+)"/>', s1, re.S)))`, TMP + 'fill.pptx']).toString());
    const c = info.find(s => s[0] === 'Segment Center'), r = info.find(s => s[0] === 'Segment Right');
    ok(c && +c[1] === 3511 * 3175 && +c[3] === 4322 * 3175 && r && +r[1] === 7833 * 3175 && !info.some(s => /^Unused/.test(s[0])), P + '.pptx template uses the fill layout (Center @3511, 4322 wide; no unused strip) ' + JSON.stringify([c, r]));
  }
  // ---- persisted + synced field shape
  await sleep(300); await d.page.reload(); await sleep(600); S = await st(d);
  ok(S.layout === 'fill' && S.orig && S.orig.map(g => g[2]).join() === '3510,4320,3510' && S.segs.map(g => g[2]).join() === '3511,4322,3511', P + 'Fill + original survive reload');
  // ---- bake fill
  await d.page.evaluate(() => { __pm.ui.tab = 'screen'; __pm.render(); }); await sleep(100);
  await click(d, '[data-act=bakeFill]'); await sleep(120); await click(d, '#cOk'); await sleep(150); S = await st(d);
  ok(S.layout === 'original' && S.orig === null && S.segs.map(g => g[2]).join() === '3511,4322,3511', P + '"Keep fill as the new original" bakes 3511/4322/3511');
  ok(d.errs.length === 0, P + 'no page errors ' + JSON.stringify(d.errs));
  await d.ctx.close();
}
await browser.close();
console.log(results.join('\n'));
const fails = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - fails}/${results.length} fill-layout checks passed`); process.exit(fails ? 1 : 0);
