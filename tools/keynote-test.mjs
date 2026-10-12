// v1.8 browser tests: Slides ▸ PowerPoint | Keynote sub-tabs, Keynote options/positions/compare/playback, Keynote .pptx + guide PNG + TXT/CSV.
// Serve this folder on :8765, then: node tools/keynote-test.mjs  (local test job with Don's TacoBell sizes; never signs in; python3 + soffice for file checks)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const URL = process.env.PM_URL || 'http://127.0.0.1:8765/';
const OUT = process.env.PM_OUT || new globalThis.URL('../screenshots/', import.meta.url).pathname;
const TMP = '/tmp/pm-key-test/'; fs.mkdirSync(TMP, { recursive: true });
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch();
async function open(name, opts) {
  const ctx = await browser.newContext({ ...opts, acceptDownloads: true, serviceWorkers: 'block' }); const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await page.goto(URL); await page.waitForTimeout(500);
  await page.evaluate(() => { __pm.ACTIONS.newExample(); const j = __pm.job(); j.name = 'TacoBell example (Don\'s segment sizes)'; const s = j.screens[0]; j.screens = [s]; j.currentScreenId = s.id;
    Object.assign(s, { name: 'Screen 1', w: 11344, h: 1080, segMode: 'custom', segments: 3, physUnit: 'ft', pptCur: { w: 55.561, h: 5.28, unit: 'in' }, pptOut: null, keyCur: null, segLayout: 'original', segmentsOriginal: null,
      segs: [{ id: 'sl', name: 'Left', x: 0, y: 0, w: 3510, h: 1080, pw: 52, ph: 16 }, { id: 'sc', name: 'Center', x: 3510, y: 0, w: 4320, h: 1080, pw: 66, ph: 16 }, { id: 'sr', name: 'Right', x: 7830, y: 0, w: 3510, h: 1080, pw: 52, ph: 16 }],
      boxes: [{ id: 'b1', name: 'PiP center', color: '#ff3df2', x: 4710, y: 0, w: 1920, h: 1080, lock: false }] });
    __pm.ui.tab = 'slides'; __pm.render(); });
  await sleep(150);
  return { name, ctx, page, errs, tap: !!opts.isMobile };
}
const click = (d, sel) => (d.tap ? d.page.locator(sel).first().tap() : d.page.locator(sel).first().click());
const txt = (d, sel) => d.page.locator(sel).first().innerText();
const download = async (d, sel, name) => { const dl = d.page.waitForEvent('download', { timeout: 30000 }); await click(d, sel); const f = await dl; await f.saveAs(TMP + name); return TMP + name; };
const pptxInfo = file => JSON.parse(execFileSync('python3', ['-c', `
import zipfile, re, json, sys
z = zipfile.ZipFile(sys.argv[1]); p = z.read('ppt/presentation.xml').decode(); s1 = z.read('ppt/slides/slide1.xml').decode()
sz = re.search(r'<p:sldSz cx="(\\d+)" cy="(\\d+)"', p)
offs = re.findall(r'<p:cNvPr id="\\d+" name="([^"]+)"[^>]*>.*?<a:off x="(\\d+)" y="(\\d+)"/><a:ext cx="(\\d+)" cy="(\\d+)"/>', s1, re.S)
print(json.dumps({'cx': int(sz.group(1)), 'cy': int(sz.group(2)), 'shapes': offs}))`, file]).toString());
const pngSize = file => { const b = fs.readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

for (const [label, opts] of [['iPad', { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true }], ['iPhone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }], ['Desktop', { viewport: { width: 1440, height: 900 } }]]) {
  const d = await open(label, opts), P = label + ': ';
  ok(await d.page.locator('.subtabs [data-k=ppt].on').count() === 1 && await d.page.locator('.pptcard').isVisible() && await d.page.locator('[data-pb=cur]').count() === 1, P + 'Slides opens on PowerPoint sub-tab with everything (slide size, current slide, playback)');
  ok(await d.page.locator('.outcard').count() === 1 && await d.page.locator('[data-act=slidePptx]').count() === 1 && await d.page.locator('.keycard').count() === 0, P + 'PowerPoint tab keeps target output + .pptx; no Keynote card there');
  await click(d, '.subtabs [data-k=key]'); await sleep(150);
  ok(await d.page.locator('.keycard').isVisible() && await d.page.locator('.pptcard').count() === 0, P + 'Keynote sub-tab shows the Keynote panel');
  ok(await d.page.evaluate(() => JSON.parse(localStorage.getItem('showcrew.pixelmap.prefs')).slidesTab) === 'key', P + 'last sub-tab saved per device (localStorage prefs)');
  const head = await txt(d, '.subpane'); ok(head.includes('Document sidebar') && head.includes('1 pt as 1 slide pixel') && head.includes('community-reported') && head.includes('8192'), P + 'explains slide size + labels 8192/200 as community-reported');
  let k = await txt(d, '.keycard');
  ok(k.includes('5672') && k.includes('540') && /1\/2 exact ★/.test(k), P + '★ 1/2 exact = 5672 × 540 pt');
  ok(k.includes('2836 × 270') && k.includes('8192 × 780') && k.includes('exact 8192 × 779.915') && k.includes('0.117 px off'), P + 'options table: 1/4 2836×270, largest 8192×780 (exact 779.915, 0.117 px off)');
  ok(k.includes('1 slide pt = 2 screen px') && (await txt(d, '[data-pb=key]')).includes('No black bars') && (await txt(d, '[data-pb=key]')).includes('2 px per pt'), P + 'scale ×0.5, playback on 11344×1080: no bars, 2 px per pt');
  await click(d, '.keycard [data-act=keyOpt][data-k=max]'); await sleep(120); k = await txt(d, '.keycard');
  ok(k.includes('type 8192 × 780') && k.includes('1080.12'), P + 'largest option: type 8192 × 780, back at native 11344 × 1080.12');
  ok((await txt(d, '[data-pb=key]')).includes('Pillarbox — Black left and right: about 1 px each') && (await txt(d, '[data-pb=key]')).includes('11342.77 × 1080 px'), P + 'largest option on 11344×1080: pillarbox about 1 px each, 11342.77 × 1080 px');
  await click(d, '.keycard [data-act=keyOpt][data-k=exact2]'); await sleep(120);
  const pos = await txt(d, '.key-pos');
  ok(/Center[\s\S]*1755[\s\S]*0[\s\S]*2160[\s\S]*540/.test(pos) && /Right[\s\S]*3915/.test(pos) && /PiP center[\s\S]*2355[\s\S]*960/.test(pos), P + 'Arrange inspector pt: Center 1755,0 2160×540; Right 3915; PiP 2355 / 960');
  ok(await d.page.locator('.key-pos .cpy').count() >= 16, P + 'copy buttons on every position value');
  const nat = await txt(d, '.key-native');
  ok(nat.includes('Export To ▸ Movie') && nat.includes('Custom') && nat.includes('11344') && nat.includes('5672×540 px') && nat.includes('×2'), P + 'back to native: Movie custom 11344×1080; Images at 5672×540 → ×2');
  // current Keynote slide compare
  await d.page.fill('[data-bind="keycur.w"]', '1920'); await d.page.dispatchEvent('[data-bind="keycur.w"]', 'change'); await sleep(80);
  await d.page.fill('[data-bind="keycur.h"]', '1080'); await d.page.dispatchEvent('[data-bind="keycur.h"]', 'change'); await sleep(120);
  const kc = await txt(d, '.key-cur');
  ok(kc.includes('ASPECT MISMATCH') && kc.includes('-83.07%') && kc.includes('182.79 pt') && (await txt(d, '[data-pb=kcur]')).includes('Pillarbox — Black left and right: 4712 px each'), P + 'current Keynote 1920×1080 pt: mismatch −83.07%, keep width → 182.79 pt, pillarbox 4712 px each');
  ok(JSON.stringify(await d.page.evaluate(() => __pm.scr().keyCur)) === '{"w":1920,"h":1080}', P + 'current Keynote size saved on the screen (synced field keyCur)');
  // output resolution reused
  await click(d, '.qp [data-w="1920"][data-h="1080"]'); await sleep(150);
  ok((await txt(d, '[data-pb=key]')).includes('ON A 1920×1080 OUTPUT') && (await txt(d, '[data-pb=key]')).includes('Letterbox'), P + 'target output 1920×1080 reused → letterbox');
  await click(d, '.qp [data-screen]'); await sleep(120);
  // summary
  const sum = await d.page.evaluate(() => __pm.keySummaryText(__pm.scr()));
  ok(sum.includes('5672 × 540 pt') && sum.includes('Center: 1755, 0, 2160, 540') && sum.includes('community-reported') && sum.includes('Resolution > Custom 11344 × 1080'), P + 'Keynote TXT summary');
  if (label === 'iPad') {
    await d.page.locator('.subtabs').evaluate(e => e.scrollIntoView({ block: 'start' })); await sleep(150);
    await d.page.screenshot({ path: OUT + 'ipad-slides-keynote.png' });
    const csv = fs.readFileSync(await download(d, '[data-act=keyCsv]', 'key.csv'), 'utf8');
    ok(csv.startsWith('Item,X pt,Y pt,W pt,H pt') && csv.includes('Slide,0,0,5672,540,0,0,11344,1080') && csv.includes('Center,1755,0,2160,540,3510,0,4320,1080'), P + 'Keynote CSV export');
    ok(fs.readFileSync(await download(d, '[data-act=keyTxt]', 'key.txt'), 'utf8').includes('Arrange inspector'), P + 'Keynote TXT export');
    let f = await download(d, '[data-act=keyPptx]', 'key-half.pptx'), info = pptxInfo(f);
    const c = info.shapes.find(x => x[0] === 'Segment Center');
    ok(info.cx === 5672 * 12700 && info.cy === 540 * 12700, `${P}Keynote .pptx is exactly 5672 × 540 pt = ${info.cx} × ${info.cy} EMU`);
    ok(c && +c[1] === 1755 * 12700 && +c[3] === 2160 * 12700 && +c[4] === 540 * 12700, P + '.pptx Center rect exact: X 1755 pt, 2160 × 540 pt ' + JSON.stringify(c));
    fs.copyFileSync(f, OUT + 'keynote-template-example-TacoBell_Screen1_5672x540pt.pptx');
    try {
      fs.rmSync(TMP + 'key-half.png', { force: true });
      execFileSync('soffice', ['--headless', '--convert-to', 'png', '--outdir', TMP, f], { timeout: 120000, stdio: 'ignore' });
      ok(fs.existsSync(TMP + 'key-half.png'), P + 'LibreOffice opens and renders the oversize (5672 pt) Keynote .pptx');
    } catch (e) { ok(false, P + 'LibreOffice render: ' + e.message); }
    await click(d, '.keycard [data-act=keyOpt][data-k=exact4]'); await sleep(120);
    ok(!(await txt(d, '.key-tpl')).includes('over 4032 pt'), P + '1/4 option: no OOXML-limit warning');
    f = await download(d, '[data-act=keyPptx]', 'key-quarter.pptx'); info = pptxInfo(f);
    ok(info.cx === 2836 * 12700 && info.cy === 270 * 12700, P + '1/4 Keynote .pptx = 2836 × 270 pt (inside the 4032 pt OOXML limit)');
    await click(d, '.keycard [data-act=keyOpt][data-k=exact2]'); await sleep(120);
    ok((await txt(d, '.key-tpl')).includes('over 4032 pt') && (await txt(d, '.key-tpl')).includes('1/4 exact'), P + '1/2 option warns about the 4032 pt OOXML limit and suggests 1/4');
    const png = await download(d, '[data-act=keyPng]', 'guide.png'); const [pw, ph] = pngSize(png);
    ok(pw === 5672 && ph === 540, P + `guide PNG is 5672 × 540 px (${pw}×${ph})`);
    fs.copyFileSync(png, OUT + 'keynote-guide-example-TacoBell_Screen1_5672x540.png');
    ok((await txt(d, '.key-tpl')).includes('Edit Slide Layouts') && (await txt(d, '.key-tpl')).includes('Save Theme') && (await txt(d, '.key-tpl')).includes("can't be made in the browser"), P + 'theme/master steps + .key explanation');
  }
  // remembered per device after reload
  await sleep(300); await d.page.reload(); await sleep(600);
  await d.page.evaluate(() => { __pm.ui.tab = 'slides'; __pm.render(); }); await sleep(120);
  ok(await d.page.locator('.subtabs [data-k=key].on').count() === 1 && await d.page.locator('.keycard').count() === 1, P + 'Keynote sub-tab remembered after reload');
  await click(d, '.subtabs [data-k=ppt]'); await sleep(120);
  ok(await d.page.locator('.pptcard').count() === 1 && await d.page.evaluate(() => JSON.parse(localStorage.getItem('showcrew.pixelmap.prefs')).slidesTab) === 'ppt', P + 'back to PowerPoint, remembered');
  ok(d.errs.length === 0, P + 'no page errors ' + JSON.stringify(d.errs));
  await d.ctx.close();
}
await browser.close();
console.log(results.join('\n'));
const fails = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - fails}/${results.length} Keynote checks passed`); process.exit(fails ? 1 : 0);
