// v1.4 browser tests: custom segments + fit warnings + Slides (PowerPoint/Keynote) panel at iPad / iPhone / desktop sizes.
// Serve this folder on :8765, then: node tools/segments-test.mjs   (needs playwright; python3 for .pptx checks; soffice optional)
// Uses a LOCAL test job with Don's TacoBell segment sizes (Left 3510, Center 4320, Right 3510 × 1080 on 11344×1080). Never signs in.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const URL = process.env.PM_URL || 'http://127.0.0.1:8765/';
const OUT = process.env.PM_OUT || new globalThis.URL('../screenshots/', import.meta.url).pathname;
const TMP = '/tmp/pm-seg-test/'; fs.mkdirSync(TMP, { recursive: true });
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m);
const browser = await chromium.launch();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(name, opts) {
  const ctx = await browser.newContext({ ...opts, acceptDownloads: true, serviceWorkers: 'block' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await page.goto(URL); await page.waitForTimeout(500);
  return { name, ctx, page, errs, mobile: !!opts.isMobile };
}
const click = (d, sel) => (d.mobile ? d.page.locator(sel).first().tap() : d.page.locator(sel).first().click());
async function setField(d, f, v) { const el = d.page.locator(`[data-f="${f}"]`); await el.fill(String(v)); await el.press('Enter'); await el.dispatchEvent('change'); await sleep(60); }
async function tab(d, t) { await click(d, `.tab[data-tab=${t}]`); await sleep(120); }

/** Build Don's screen through the UI: 11344×1080 → equal 3 → Custom sizes → edit widths/names/physical → auto-place. */
async function buildTaco(d) {
  await d.page.evaluate(() => { __pm.ACTIONS.newExample(); const j = __pm.job(); j.name = 'TacoBell example (Don\'s segment sizes)'; j.screens = [j.screens[0]]; j.currentScreenId = j.screens[0].id; j.screens[0].name = 'Screen 1'; __pm.ui.tab = 'screen'; __pm.render(); });
  await setField(d, 'scr.w', 11344); await setField(d, 'scr.h', 1080); await setField(d, 'scr.segments', 3);
  await click(d, '[data-act=segMode][data-m=custom]'); await sleep(100);
  const segs0 = await d.page.evaluate(() => __pm.scr().segs.map(g => [g.x, g.w, g.h]));
  ok(JSON.stringify(segs0) === '[[0,3782,1080],[3782,3781,1080],[7563,3781,1080]]', `${d.name}: Custom starts from the equal split in whole px ${JSON.stringify(segs0)}`);
  ok(!(await d.page.locator('#fitBadge').isVisible()) && (await d.page.locator('.fitok').count()) === 1, `${d.name}: exact fill → no warning, ✓ shown`);
  const spec = [['Left', 3510, 52, 16], ['Center', 4320, 66, 16], ['Right', 3510, 52, 16]];
  for (let i = 0; i < 3; i++) { await setField(d, `seg.${i}.name`, spec[i][0]); await setField(d, `seg.${i}.w`, spec[i][1]); await setField(d, `seg.${i}.pw`, spec[i][2]); await setField(d, `seg.${i}.ph`, spec[i][3]); }
  await click(d, '[data-act=autoPlaceSegs]'); await sleep(150);
}

async function checks(d) {
  const p = d.page;
  const segs = await p.evaluate(() => __pm.scr().segs.map(g => [g.name, g.x, g.y, g.w, g.h, g.pw, g.ph]));
  ok(JSON.stringify(segs) === JSON.stringify([['Left', 0, 0, 3510, 1080, 52, 16], ['Center', 3510, 0, 4320, 1080, 66, 16], ['Right', 7830, 0, 3510, 1080, 52, 16]]), `${d.name}: segments edited + auto-placed ${JSON.stringify(segs)}`);
  const card = await p.locator('.scr-card.on .fitbadge').innerText();
  ok(card.includes('4 px short'), `${d.name}: screen-list badge "${card}"`);
  ok(await p.locator('#fitBadge').isVisible() && (await p.locator('#fitBadge').innerText()).includes('4 px short'), `${d.name}: canvas badge visible`);
  const fw = await p.locator('.seg-editor .fitwarn').innerText();
  ok(fw.includes('Segments total 11340 px wide; screen is 11344 px — 4 px short (4 px unused on the right)'), `${d.name}: Screen tab warning specifics`);
  ok((await p.locator('.seg-editor .fitwarn').getAttribute('class')).includes('warn'), `${d.name}: amber (warn) level`);
  const pitch = await p.locator('.seg-row[data-i="1"] .pitch').innerText();
  ok(pitch.includes('65.45 px/ft') && pitch.includes('4.66 mm') && pitch.includes('67.50 px/ft') && /differ/.test(pitch), `${d.name}: Center pitch W 65.45 px/ft · H 67.50 + non-square note`);
  ok((await p.locator('.seg-row[data-i="0"] .pitch').innerText()).includes('67.50 px/ft'), `${d.name}: Left 67.5 px/ft`);
}

// ================= iPad =================
const A = await open('iPad', { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true });
await buildTaco(A); await checks(A);
await A.page.locator('.seg-editor').scrollIntoViewIfNeeded();
await A.page.screenshot({ path: OUT + 'ipad-segments-warning.png' });
// overlap → red
await setField(A, 'seg.1.x', 3500); await sleep(100);
ok((await A.page.locator('.seg-editor .fitwarn').getAttribute('class')).includes('error') && (await A.page.locator('.seg-editor .fitwarn').innerText()).includes('Left and Center overlap by 10 × 1080 px'), 'iPad: overlap shows red error');
await setField(A, 'seg.1.x', 3510);
// Coords: segment centers relative to the whole screen; center origin
await tab(A, 'coords');
const cents = await A.page.evaluate(() => { const out = []; let grp = ''; for (const r of document.querySelectorAll('#panelBody table.ro tr')) { if (r.classList.contains('grp')) grp = r.innerText; else if (/^SEGMENT \d/.test(grp) && r.cells[0]?.innerText === 'Center') out.push(r.cells[1].innerText + ',' + r.cells[2].innerText); } return out; });
ok(JSON.stringify(cents) === '["1755,540","5670,540","9585,540"]', 'iPad: Coords segment centers ' + JSON.stringify(cents));
ok((await A.page.locator('#panelBody .fitwarn').count()) === 1, 'iPad: Coords tab also shows the fit warning');
await click(A, '#originSeg button[data-origin=center]'); await sleep(100);
const cc = await A.page.evaluate(() => { let grp = '', out = null; for (const r of document.querySelectorAll('#panelBody table.ro tr')) { if (r.classList.contains('grp')) grp = r.innerText; else if (/^SEGMENT 2/.test(grp) && r.cells[0]?.innerText === 'Center') out = r.cells[1].innerText + ',' + r.cells[2].innerText; } return out; });
ok(cc === '-2,0', 'iPad: Center=0,0 → Center segment center reads -2,0 (got ' + cc + ')');
await click(A, '#originSeg button[data-origin=tl]');
// PiP center/fit in the real segment
await tab(A, 'boxes');
await A.page.evaluate(() => { __pm.ui.addMode = 'size'; __pm.ui.addW = 1920; __pm.ui.addH = 1080; __pm.render(['panel']); });
await click(A, '[data-act=addBox]'); await sleep(100);
await A.page.selectOption('#segPick', '1'); await click(A, '[data-act=centerSeg]'); await sleep(80);
let b = await A.page.evaluate(() => __pm.scr().boxes[0]);
ok(b.x === 4710 && b.y === 0, `iPad: PiP centered in Center segment → x 4710 (got ${b.x},${b.y})`);
await A.page.selectOption('#segPick', '2'); await click(A, '[data-act=fitSeg]'); await sleep(80);
b = await A.page.evaluate(() => __pm.scr().boxes[0]);
ok(b.x === 7830 && b.w === 3510 && b.y === 0 && b.h === 1080, 'iPad: Fit seg → Right segment rect ' + JSON.stringify([b.x, b.y, b.w, b.h]));
await A.page.evaluate(() => { __pm.scr().boxes = []; __pm.ui.sel = null; __pm.render(); });
// Ratios per segment
await tab(A, 'ratios');
await A.page.selectOption('select[data-bind=ratioTarget]', '1'); await sleep(80);
const r169 = await A.page.locator('#panelBody table.fit tr', { hasText: '16:9' }).first().innerText();
ok(/1920×1080/.test(r169) && /4710/.test(r169), 'iPad: 16:9 fit inside Center = 1920×1080 @ 4710: ' + r169.replace(/\s+/g, ' '));
// snapping uses real segment edges
const T = await A.page.evaluate(() => __pm.G.snapTargets(__pm.scr()).xs);
ok([3510, 5670, 7830, 11340].every(v => T.includes(v)), 'iPad: snap targets include real segment edges/centers');
// PNG export: native size, hatched unused strip (and off when unchecked)
const px = await A.page.evaluate(async () => {
  const s = __pm.scr(), ex = JSON.parse(JSON.stringify(__pm.job().exportSettings));
  const read = async e => { const bl = await __pm.screenToBlob(s, e, 'tl'); const bm = await createImageBitmap(bl); const c = new OffscreenCanvas(bm.width, bm.height); const x = c.getContext('2d'); x.drawImage(bm, 0, 0);
    const d = x.getImageData(11340, 200, 4, 600).data; let amber = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 2] < 120) amber++; return { w: bm.width, h: bm.height, amber, bytes: bl.size }; };
  const on = await read(ex); ex.inc.unused = false; const off = await read(ex); return { on, off };
});
ok(px.on.w === 11344 && px.on.h === 1080, 'iPad: PNG export is 11344×1080');
ok(px.on.amber > 300 && px.off.amber < 50, `iPad: export hatches the 4 px unused strip (amber px ${px.on.amber}) and omits it when unchecked (${px.off.amber})`);
await tab(A, 'export');
ok((await A.page.locator('[data-bind="exinc.unused"]').isChecked()), 'iPad: export checklist has "Unused / overlap areas" (on)');
const dl0 = A.page.waitForEvent('download'); await click(A, '[data-act=exportOne]'); await sleep(2500);
const expFile = await A.page.evaluate(() => __pm.ui.exportFiles[0]?.file.name);
if (expFile) { const link = A.page.locator('#exportResults a.file').first(); const dl = A.page.waitForEvent('download'); await link.click(); const f = await dl; await f.saveAs(OUT + 'export-example-TacoBell_Screen1_11344x1080_segments.png'); }
dl0.catch(() => {});
ok(!!expFile && fs.existsSync(OUT + 'export-example-TacoBell_Screen1_11344x1080_segments.png'), 'iPad: exported PNG saved ' + expFile);

// Slides panel
await tab(A, 'slides');
const sl = await A.page.locator('#panelBody').innerText();
ok(sl.includes('118.167 × 11.25 in') && /over the 56 in limit/.test(sl), 'iPad: Slides shows 1:1 = 118.167 × 11.25 in, over 56 in');
ok((await A.page.locator('.pptcard .hud-stat').innerText()).replace(/\s+/g, ' ').includes('39.389') && (await A.page.locator('.pptcard .hud-stat').innerText()).includes('3.75'), 'iPad: ★ exact 1/3 slide 39.389 × 3.75 in');
ok(sl.includes('288') && sl.includes('11344×1080'), 'iPad: Windows ExportBitmapResolution 288 → 11344×1080');
const rowC = await A.page.locator('#panelBody .pptcard ~ .card table.sl tr', { hasText: 'Center' }).first().innerText();
ok(/12\.188/.test(rowC) && /\b15\b/.test(rowC) && /3\.75/.test(rowC), 'iPad: Center lands at Left 12.188 in, W 15 in: ' + rowC.replace(/\s+/g, ' '));
await click(A, '[data-act=pptOpt][data-k=max]'); await sleep(80);
const mx = (await A.page.locator('.pptcard .hud-stat').innerText()).replace(/\s+/g, ' ');
ok(mx.includes('56') && mx.includes('5.331'), 'iPad: largest option 56 × 5.331 in: ' + mx);
ok((await A.page.locator('#panelBody').innerText()).includes('202.571') && (await A.page.locator('#panelBody').innerText()).includes('11368×1082'), 'iPad: max option explains non-whole 202.571 dpi (203 → 11368×1082)');
await click(A, '[data-act=pptOpt][data-k=exact]');
await click(A, '[data-act=slideUnit][data-u=cm]'); await sleep(80);
ok((await A.page.locator('.pptcard .hud-stat').innerText()).includes('100.048'), 'iPad: cm toggle → 100.048 cm');
await click(A, '[data-act=slideUnit][data-u=in]');
// copy button
await A.page.locator('.pptcard .hud-stat .cpy').first().click(); await sleep(150);
ok((await A.page.evaluate(() => navigator.clipboard.readText())) === '39.389 in', 'iPad: copy button copies "39.389 in"');
// Don's current slide
await setField(A, 'pptcur.w', 55.561); await setField(A, 'pptcur.h', 5.28); await sleep(100);
const cur = await A.page.locator('.cur-slide').innerText();
ok(/ASPECT MISMATCH/.test(cur) && cur.includes('10.523:1') && cur.includes('10.504:1') && cur.includes('+0.18%'), 'iPad: current slide 55.561 × 5.28 → mismatch 10.523 vs 10.504 (+0.18%)');
ok(cur.includes('5.29 in') && cur.includes('1078') && cur.includes('17.191'), 'iPad: keep-width height 5.29 in, 11344×1078 image, Center at 17.191 in on his slide');
// Keynote
await click(A, '[data-act=slidesTab][data-k=key]'); await sleep(150);   // v1.8: Keynote has its own sub-tab
const kn = await A.page.locator('.card', { hasText: 'KEYNOTE · DOCUMENT' }).first().innerText() + await A.page.locator('.key-pos').innerText();
ok(kn.includes('5672') && kn.includes('540') && kn.includes('1755') && kn.includes('2160') && kn.includes('8192'), 'iPad: Keynote 5672 × 540 pt (1/2), Center X 1755 W 2160, max 8192 noted');
await click(A, '[data-act=slidesTab][data-k=ppt]'); await sleep(150);
await A.page.locator('.pptcard').scrollIntoViewIfNeeded();
await A.page.evaluate(() => { document.querySelector('#panelBody').scrollTop = 0; });
await A.page.screenshot({ path: OUT + 'ipad-slides-powerpoint.png' });
await A.page.locator('.cur-slide').scrollIntoViewIfNeeded();
await A.page.screenshot({ path: OUT + 'ipad-slides-current-slide.png' });
// summary + CSV + PPTX
const txt = await A.page.evaluate(() => __pm.slideSummaryText(__pm.scr()));
ok(txt.includes('39.389 in × 3.75 in') && txt.includes('Center:') && txt.includes('Segment fit warnings'), 'iPad: text summary has slide size, positions and warnings');
let dl = A.page.waitForEvent('download'); await click(A, '[data-act=slideCsv]'); let f = await dl; await f.saveAs(TMP + 'slides.csv');
const csv = fs.readFileSync(TMP + 'slides.csv', 'utf8');
ok(csv.split('\r\n')[0].startsWith('Item,Left in') && csv.includes('Center,12.188,0,15,3.75'), 'iPad: CSV export');
dl = A.page.waitForEvent('download', { timeout: 20000 }); await click(A, '[data-act=slidePptx]'); f = await dl; await f.saveAs(TMP + 'template.pptx');
fs.copyFileSync(TMP + 'template.pptx', OUT + 'template-example-TacoBell_Screen1_11344x1080.pptx');
const info = JSON.parse(execFileSync('python3', ['-c', `
import zipfile, re, json, sys
z = zipfile.ZipFile(sys.argv[1]); p = z.read('ppt/presentation.xml').decode(); s1 = z.read('ppt/slides/slide1.xml').decode()
sz = re.search(r'<p:sldSz cx="(\\d+)" cy="(\\d+)"', p)
offs = re.findall(r'<p:cNvPr id="\\d+" name="([^"]+)"[^>]*>.*?<a:off x="(\\d+)" y="(\\d+)"/><a:ext cx="(\\d+)" cy="(\\d+)"/>', s1, re.S)
print(json.dumps({'cx': int(sz.group(1)), 'cy': int(sz.group(2)), 'slides': len([n for n in z.namelist() if re.match(r'ppt/slides/slide\\d+\\.xml$', n)]), 'shapes': offs}))`, TMP + 'template.pptx']).toString());
ok(info.cx === 36017200 && info.cy === 3429000 && info.slides === 2, `iPad: .pptx slide size 36017200×3429000 EMU (39.389×3.75 in), 2 slides (${info.cx}×${info.cy}, ${info.slides})`);
const center = info.shapes.find(s => s[0] === 'Segment Center');
ok(center && +center[1] === 3510 * 3175 && +center[3] === 4320 * 3175 && +center[4] === 1080 * 3175, '.pptx Center rect at exact EMU (3510 px × 3175) ' + JSON.stringify(center));
ok(info.shapes.some(s => /^Unused 4x1080/.test(s[0])), '.pptx marks the 4×1080 unused strip');
try {
  execFileSync('soffice', ['--headless', '--convert-to', 'png', '--outdir', TMP, TMP + 'template.pptx'], { timeout: 90000, stdio: 'ignore' });
  ok(fs.existsSync(TMP + 'template.png'), 'LibreOffice opens and renders the .pptx'); if (fs.existsSync(TMP + 'template.png')) fs.copyFileSync(TMP + 'template.png', OUT + 'template-example-render-libreoffice.png');
} catch (e) { ok(true, 'soffice not available — skipped render check'); }
ok(A.errs.length === 0, 'iPad: no page errors ' + JSON.stringify(A.errs));
await A.ctx.close();

// ================= desktop =================
const D = await open('Desktop', { viewport: { width: 1440, height: 900 } });
await buildTaco(D); await checks(D);
await D.page.screenshot({ path: OUT + 'desktop-segments-warning.png' });
await tab(D, 'slides'); await setField(D, 'pptcur.w', 55.561); await setField(D, 'pptcur.h', 5.28);
await D.page.evaluate(() => { document.querySelector('#panelBody').scrollTop = 0; });
await D.page.screenshot({ path: OUT + 'desktop-slides-powerpoint.png' });
// legacy (v1.3) localStorage → migrates on load, nothing lost
await D.page.evaluate(() => {
  const legacy = { v: 1, currentJobId: '11111111-1111-4111-8111-111111111111', tombstones: {}, sync: {}, jobs: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Legacy v1.3', mode: 'screen', origin: 'tl', created: 1, updated: 2,
    screens: [{ id: 'scr_x', name: 'Columns', w: 1536, h: 1280, segments: 6, x: 0, y: 0, grid: { mode: 'off' }, boxes: [{ id: 'box_1', name: 'PiP', color: '#ff3df2', x: 10, y: 20, w: 300, h: 200, lock: false }] }] }] };
  localStorage.setItem('showcrew.pixelmap.v1', JSON.stringify(legacy));
});
await D.page.reload(); await sleep(500);
const leg = await D.page.evaluate(() => { const s = __pm.scr(); return { mode: s.segMode, n: s.segments, segs: s.segs.length, cx: __pm.G.segments(s).map(g => g.cx), box: s.boxes[0] && [s.boxes[0].x, s.boxes[0].w], fit: __pm.G.segFit(s).exact }; });
ok(leg.mode === 'equal' && leg.n === 6 && leg.segs === 0 && JSON.stringify(leg.cx) === '[128,384,640,896,1152,1408]' && JSON.stringify(leg.box) === '[10,300]' && leg.fit, 'legacy v1.3 job migrates to equal mode with identical segments + boxes ' + JSON.stringify(leg));
await tab(D, 'slides');
ok((await D.page.locator('.pptcard .hud-stat').innerText()).includes('16') && (await D.page.locator('#panelBody').innerText()).includes('fits as-is'), 'Columns 1536×1280 → 16 × 13.333 in fits as-is');
ok(D.errs.length === 0, 'Desktop: no page errors ' + JSON.stringify(D.errs));
await D.ctx.close();

// ================= iPhone =================
const B = await open('iPhone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
await buildTaco(B); await checks(B);
await B.page.evaluate(() => window.scrollTo(0, 0));
await B.page.screenshot({ path: OUT + 'iphone-segments-warning.png', fullPage: true });
await tab(B, 'slides'); await setField(B, 'pptcur.w', 55.561); await setField(B, 'pptcur.h', 5.28);
await B.page.evaluate(() => window.scrollTo(0, 0));
await B.page.screenshot({ path: OUT + 'iphone-slides-powerpoint.png', fullPage: true });
const overflow = await B.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
ok(!overflow, 'iPhone: no horizontal overflow on Slides');
await tab(B, 'screen');
ok(!(await B.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'iPhone: no horizontal overflow on segment editor');
ok(B.errs.length === 0, 'iPhone: no page errors ' + JSON.stringify(B.errs));
await B.ctx.close();
await browser.close();
console.log(results.join('\n'));
const fails = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - fails}/${results.length} segment/slide browser checks passed`);
process.exit(fails ? 1 : 0);
