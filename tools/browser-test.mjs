// Headless browser checks (needs `npm i playwright && npx playwright install chromium`). Serve this folder, then: PM_URL=http://127.0.0.1:8765/ node tools/browser-test.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.PM_URL || 'http://127.0.0.1:8765/';
const OUT = process.env.PM_OUT || new URL('../screenshots/', import.meta.url).pathname;
const results = []; const ok = (c, m) => { results.push((c ? 'PASS ' : 'FAIL ') + m); };
const browser = await chromium.launch();

// ---------- iPad ----------
let ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, acceptDownloads: true });
let page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
await page.goto(URL); await page.waitForTimeout(600);
const rowText = async label => page.locator('#panelBody tr', { hasText: label }).first().innerText();
ok((await page.locator('.scr-card').count()) === 4, 'sample job has 4 screens');
ok((await page.locator('.jobname').innerText()) === 'Example 4-Screen', 'sample job name');
// House Left thirds
let t = await rowText('Vertical ⅓'); ok(t.includes('1194.7') && t.includes('≈1195'), 'HL third 1 = 1194.7 ≈1195: ' + t.replace(/\s+/g, ' '));
t = await rowText('Vertical ⅔'); ok(t.includes('2389.3') && t.includes('≈2389'), 'HL third 2 = 2389.3 ≈2389');
ok((await page.locator('.hud-stat').innerText()).includes('7:2') && (await page.locator('.hud-stat').innerText()).includes('3.50:1'), 'HL aspect 7:2 / 3.50:1');
// Center screen
await page.locator('.scr-card', { hasText: 'Center' }).click();
t = await rowText('Center point'); ok(/1280\s+640/.test(t), 'Center screen center = 1280,640: ' + t.replace(/\s+/g, ' '));
// copy
await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
await page.locator('#panelBody tr', { hasText: 'Center point' }).first().click();
await page.waitForTimeout(200);
ok((await page.evaluate(() => navigator.clipboard.readText())) === '1280, 640', 'tap-to-copy gives "1280, 640"');
// Columns
await page.locator('.scr-card', { hasText: 'Columns' }).click();
const segCenters = await page.evaluate(() => [...document.querySelectorAll('#panelBody tr')].filter(r => r.previousElementSibling && false || true).map(r => r.innerText));
const cs = await page.evaluate(() => { const out = []; let grp = ''; for (const r of document.querySelectorAll('#panelBody table.ro tr')) { if (r.classList.contains('grp')) grp = r.innerText; else if (/^SEGMENT \d/.test(grp) && r.cells[0]?.innerText === 'Center') out.push(r.cells[1].innerText + ',' + r.cells[2].innerText); } return out; });
ok(JSON.stringify(cs) === JSON.stringify(['128,640', '384,640', '640,640', '896,640', '1152,640', '1408,640']), 'Columns segment centers ' + JSON.stringify(cs));
const bounds = await page.evaluate(() => { const out = []; let grp = ''; for (const r of document.querySelectorAll('#panelBody table.ro tr')) { if (r.classList.contains('grp')) grp = r.innerText; else if (/BOUNDARIES/.test(grp)) out.push(+r.cells[1].innerText); } return out; });
ok(JSON.stringify(bounds) === '[256,512,768,1024,1280]', 'segment boundaries ' + JSON.stringify(bounds));
ok((await page.locator('.hud-stat').innerText()).includes('6:5'), 'Columns aspect 6:5');
await page.screenshot({ path: OUT + 'ipad-columns-coords.png' });

// PiP add on Center: 16:9 at 40% width
await page.locator('.scr-card', { hasText: 'Center' }).click();
await page.locator('.tab', { hasText: 'PiP Boxes' }).click();
await page.locator('[data-act=addMode][data-m=pct]').click();
await page.locator('[data-act=addBox]').click();
let b = await page.evaluate(() => { const s = __pm.scr(); return s.boxes[0]; });
ok(b && b.w === 1024 && b.h === 576 && b.x === 768 && b.y === 352, 'add 16:9 @40% → 1024x576 centered at 768,352: ' + JSON.stringify(b));
// drag box via touchless mouse: compute screen position
const geo = await page.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); return { left: r.left, top: r.top, k: __pm.ui.k, ox: __pm.ui.ox, oy: __pm.ui.oy }; });
const toPx = (x, y) => [geo.left + geo.ox + x * geo.k, geo.top + geo.oy + y * geo.k];
// drag from box center (1280,640) so left edge approaches 0 + ~3px (snap to 0)
let [sx, sy] = toPx(1280, 640);
await page.mouse.move(sx, sy); await page.mouse.down();
// move left by 765 px native (left edge to 3) & down by 20
let [tx, ty] = toPx(1280 - 765, 640 + 7);
await page.mouse.move(tx, ty, { steps: 12 });
const snapDuring = await page.evaluate(() => __pm.ui.snapLines.slice());
await page.screenshot({ path: OUT + 'ipad-pip-drag-snap.png' });
await page.mouse.up();
b = await page.evaluate(() => __pm.scr().boxes[0]);
ok(b.x === 0, `drag snapped left edge to x=0 (got ${b.x},${b.y})`);
ok(b.y === 352, `vertical center snap kept y=352 (got ${b.y})`);
ok(snapDuring.length >= 1, 'snap guide lines shown during drag ' + JSON.stringify(snapDuring));
// snap off → no snap
await page.locator('.chip[data-key=snap]').click();
[sx, sy] = toPx(512, 640); await page.mouse.move(sx, sy); await page.mouse.down();
[tx, ty] = toPx(512 + 3 * (1 / geo.k) + 300, 640); await page.mouse.move(tx, ty, { steps: 6 }); await page.mouse.up();
b = await page.evaluate(() => __pm.scr().boxes[0]);
ok(b.x !== 0 && b.x > 250, 'snap off → free move x=' + b.x);
await page.locator('.chip[data-key=snap]').click();
// center both button
await page.locator('[data-act=center][data-a=both]').click();
b = await page.evaluate(() => __pm.scr().boxes[0]);
ok(b.x === 768 && b.y === 352, 'Center both → 768,352');
// resize via SE handle with snap to thirds: drag se corner (1792,928) to near 2/3 x (1706.67)
[sx, sy] = toPx(1792, 928); await page.mouse.move(sx, sy); await page.mouse.down();
[tx, ty] = toPx(1709, 900); await page.mouse.move(tx, ty, { steps: 8 }); await page.mouse.up();
b = await page.evaluate(() => __pm.scr().boxes[0]);
ok(b.x + b.w === 1707, 'resize SE snapped right edge to ⅔ (1706.67→1707): right=' + (b.x + b.w) + ' w=' + b.w);
// numeric edit
await page.fill('[data-f="box.w"]', '1920'); await page.press('[data-f="box.w"]', 'Enter');
await page.fill('[data-f="box.h"]', '1080'); await page.press('[data-f="box.h"]', 'Tab');
await page.locator('[data-act=center][data-a=both]').click();
b = await page.evaluate(() => __pm.scr().boxes[0]);
ok(b.w === 1920 && b.h === 1080 && b.x === 320 && b.y === 100, 'numeric W/H + center → ' + JSON.stringify([b.x, b.y, b.w, b.h]));
// second box snaps to first box edge
await page.locator('[data-act=addMode][data-m=size]').click();
await page.fill('[data-f="add.w"]', '400'); await page.press('[data-f="add.w"]', 'Enter');
await page.fill('[data-f="add.h"]', '300'); await page.press('[data-f="add.h"]', 'Enter');
await page.locator('[data-act=addBox]').click();
let b2 = await page.evaluate(() => __pm.scr().boxes[1]);
// drag b2 so its left edge nears box1 right (2240)
[sx, sy] = toPx(b2.x + 200, b2.y + 150); await page.mouse.move(sx, sy); await page.mouse.down();
[tx, ty] = toPx(2240 + 6 + 200, b2.y + 150 + 260); await page.mouse.move(tx, ty, { steps: 10 }); await page.mouse.up();
b2 = await page.evaluate(() => __pm.scr().boxes[1]);
ok(b2.x === 2240, 'box-to-box snap: left edge → 2240 (got ' + b2.x + ')');
// name + color
await page.fill('[data-f="box.name"]', 'Speaker PiP'); await page.press('[data-f="box.name"]', 'Enter');
await page.locator('.swb').nth(2).click();
b2 = await page.evaluate(() => __pm.scr().boxes[1]);
ok(b2.name === 'Speaker PiP' && b2.color === '#ffb020', 'rename + color box');
await page.screenshot({ path: OUT + 'ipad-pip-boxes.png' });

// Columns: center in segment 2
await page.locator('.scr-card', { hasText: 'Columns' }).click();
await page.locator('[data-act=addMode][data-m=size]').click();
await page.fill('[data-f="add.w"]', '200'); await page.press('[data-f="add.w"]', 'Enter');
await page.fill('[data-f="add.h"]', '200'); await page.press('[data-f="add.h"]', 'Enter');
await page.locator('[data-act=addBox]').click();
await page.selectOption('#segPick', '1'); await page.locator('[data-act=centerSeg]').click();
b = await page.evaluate(() => __pm.scr().boxes[0]);
ok(b.x === 284 && b.y === 540 && b.x + b.w / 2 === 384, 'center in segment 2 → center x=384 (box x=284,y=540)');

// Ratios on House Left
await page.locator('.scr-card', { hasText: 'House Left' }).click();
await page.locator('.tab', { hasText: 'Ratios' }).click();
t = await page.locator('#panelBody tr', { hasText: '16:9' }).first().innerText();
ok(t.includes('1820×1024') && t.includes('882'), '16:9 fit on HL = 1820×1024 @882,0: ' + t.replace(/\s+/g, ' '));
await page.locator('#panelBody tr', { hasText: '4:3' }).first().locator('button').click();
b = await page.evaluate(() => __pm.scr().boxes[0]);
ok(b.w === 1365 && b.h === 1024 && b.x === 1110 && b.y === 0, '4:3 fit added as box ' + JSON.stringify([b.x, b.y, b.w, b.h]));
await page.locator('.tab', { hasText: 'Ratios' }).click();
await page.screenshot({ path: OUT + 'ipad-ratios.png' });

// Global mode
await page.locator('#modeSeg button[data-mode=global]').click();
await page.locator('.scr-card', { hasText: 'Center' }).click();
await page.locator('.tab', { hasText: 'Coords' }).click();
t = await rowText('Center point'); ok(/1280\s+640\s+4864\s+640/.test(t), 'global coords Center point local 1280,640 global 4864,640: ' + t.replace(/\s+/g, ' '));
await page.locator('[data-act=stageView][data-v=canvas]').click();
await page.waitForTimeout(150);
await page.screenshot({ path: OUT + 'ipad-global-canvas.png' });
await page.locator('[data-act=stageView][data-v=screen]').click();
await page.locator('#modeSeg button[data-mode=screen]').click();

// Export
await page.locator('.scr-card', { hasText: 'Columns' }).click();
await page.locator('.tab', { hasText: 'Export' }).click();
await page.locator('[data-act=exportAll]').click();
await page.waitForSelector('.file', { timeout: 15000 });
await page.waitForTimeout(300);
const files = await page.evaluate(async () => {
  const out = [];
  for (const f of __pm.ui.exportFiles) {
    const bmp = await createImageBitmap(f.file); out.push({ name: f.file.name, w: bmp.width, h: bmp.height, size: f.file.size });
  }
  return out;
});
const expect = { House_Left: [3584, 1024], Center: [2560, 1280], House_Right: [3584, 1024], Columns: [1536, 1280] };
for (const f of files) { const key = Object.keys(expect).find(k => f.name.includes('_' + k + '_')); ok(key && f.w === expect[key][0] && f.h === expect[key][1], `export ${f.name} = ${f.w}x${f.h}`); }
ok(files.length === 4, 'export all produced 4 files');
// save PNGs via download links
fs.mkdirSync('/workspace/showcrew-pixelmap/screenshots/export-examples', { recursive: true });
for (let i = 0; i < files.length; i++) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.file').nth(i).click()]);
  await dl.saveAs('/workspace/showcrew-pixelmap/screenshots/export-examples/' + dl.suggestedFilename());
}
await page.screenshot({ path: OUT + 'ipad-export.png' });
// settings persisted per job
await page.locator('[data-bind="exinc.thirds"]').uncheck();
await page.waitForTimeout(300);
await page.reload(); await page.waitForTimeout(600);
const persisted = await page.evaluate(() => ({ thirds: __pm.job().exportSettings.inc.thirds, boxes: __pm.job().screens.map(s => s.boxes.length) }));
ok(persisted.thirds === false && persisted.boxes.join() === '1,2,0,1', 'state persists across reload ' + JSON.stringify(persisted));
await page.evaluate(() => { __pm.job().exportSettings.inc.thirds = true; });

// Jobs: duplicate, rename, export json, import json, delete
await page.locator('#jobBtn').click(); await page.locator('[data-act=dupJob]').click();
ok((await page.locator('.job-item').count()) === 2 && (await page.locator('.jobname').innerText()) === 'Example 4-Screen copy', 'duplicate job');
await page.locator('[data-act=renameJob]').click(); await page.fill('#askIn', 'Arena Gig'); await page.locator('#askOk').click();
ok((await page.locator('.jobname').innerText()) === 'Arena Gig', 'rename job');
const [jdl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-act=exportJson]').click()]);
const jpath = '/workspace/pm-test/' + jdl.suggestedFilename(); await jdl.saveAs(jpath);
const jdata = JSON.parse(fs.readFileSync(jpath, 'utf8'));
ok(jdata.job.name === 'Arena Gig' && jdata.job.screens.length === 4, 'export JSON ' + jdl.suggestedFilename());
await page.locator('#importIn').setInputFiles(jpath); await page.waitForTimeout(300);
ok((await page.evaluate(() => __pm.S.jobs.length)) === 3, 'import JSON adds job');
await page.locator('#jobBtn').click(); await page.locator('[data-act=delJob]').click(); await page.locator('#cOk').click();
ok((await page.evaluate(() => __pm.S.jobs.length)) === 2, 'delete job');
await page.locator('[data-act=pickJob]').first().click();
await page.locator('#jobBtn').click(); await page.screenshot({ path: OUT + 'ipad-jobs.png' }); await page.locator('[data-act=closeModal]').click();

// ---------- v1.1: origin + panel grids ----------
await page.evaluate(() => { window.__txt = []; const f = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t, x, y) { window.__txt.push({ t, x, y, cw: this.canvas.width, ch: this.canvas.height }); return f.apply(this, arguments); }; });
const labelsFor = async (fn) => page.evaluate(async (src) => { window.__txt = []; await (0, eval)(src)(); return window.__txt; }, fn);
await page.locator('.scr-card', { hasText: 'Columns' }).click();
await page.locator('.tab', { hasText: 'Coords' }).click();
let L = await labelsFor('() => __pm.render()');
const tlLbl = L.find(l => l.t.startsWith('0,0')), brLbl = L.find(l => l.t === '1536,1280');
ok(tlLbl && tlLbl.x < 80 && tlLbl.y < 1280 * 0.08, 'TL mode: "0,0" label drawn at top-left of preview ' + JSON.stringify(tlLbl && [tlLbl.t, Math.round(tlLbl.x), Math.round(tlLbl.y)]));
ok(brLbl && brLbl.x > 1300 && brLbl.y > 1200, 'TL mode: "1536,1280" label at bottom-right');
ok(!L.some(l => l.t === '0,0' && l.y > 640), 'no "0,0" label at bottom-left anymore');
ok((await page.locator('.origin-hint').innerText()).includes('top-left = 0,0'), 'TL origin hint shown');
// switch to center origin
await page.locator('#originSeg button[data-origin=center]').click();
ok((await page.evaluate(() => __pm.job().origin)) === 'center', 'origin stored on job = center');
await page.locator('.scr-card', { hasText: 'Center' }).click();
t = await rowText('Top-left'); ok(/-1280\s+-640/.test(t), 'center mode: Center screen top-left reads -1280,-640: ' + t.replace(/\s+/g, ' '));
t = await rowText('Bottom-right'); ok(/1280\s+640/.test(t), 'center mode: bottom-right 1280,640');
t = await rowText('Center point'); ok(/Center point\s+0\s+0/.test(t), 'center mode: center point 0,0');
ok((await page.locator('.origin-hint').innerText()).includes('Y − up / + down'), 'center origin hint explains Y-down');
await page.locator('#panelBody tr', { hasText: 'Top-left' }).first().click(); await page.waitForTimeout(150);
ok((await page.evaluate(() => navigator.clipboard.readText())) === '-1280, -640', 'center mode tap-to-copy "-1280, -640"');
await page.locator('.scr-card', { hasText: 'House Left' }).click();
t = await rowText('Vertical ⅓'); ok(t.includes('-597.3') && t.includes('≈-597'), 'center mode HL third = -597.3 ≈-597');
await page.locator('.scr-card', { hasText: 'Columns' }).click();
const cs2 = await page.evaluate(() => { const out = []; let grp = ''; for (const r of document.querySelectorAll('#panelBody table.ro tr')) { if (r.classList.contains('grp')) grp = r.innerText; else if (/^SEGMENT \d/.test(grp) && r.cells[0]?.innerText === 'Center') out.push(r.cells[1].innerText + ',' + r.cells[2].innerText); } return out; });
ok(JSON.stringify(cs2) === JSON.stringify(['-640,0', '-384,0', '-128,0', '128,0', '384,0', '640,0']), 'center mode Columns seg centers ' + JSON.stringify(cs2));
// box entry in center mode
await page.locator('.tab', { hasText: 'PiP Boxes' }).click();
await page.locator('.box-item').first().click();
await page.fill('[data-f="box.cx"]', '0'); await page.press('[data-f="box.cx"]', 'Enter');
await page.fill('[data-f="box.cy"]', '0'); await page.press('[data-f="box.cy"]', 'Enter');
b = await page.evaluate(() => __pm.scr().boxes[0]);
ok(b.x === 668 && b.y === 540, `center mode: Center X/Y = 0,0 centers 200×200 box (internal ${b.x},${b.y})`);
ok((await page.inputValue('[data-f="box.x"]')) === '-100' && (await page.inputValue('[data-f="box.y"]')) === '-100', 'center mode: Top-left X/Y shows -100,-100');
await page.fill('[data-f="box.x"]', '-768'); await page.press('[data-f="box.x"]', 'Enter');
b = await page.evaluate(() => __pm.scr().boxes[0]);
ok(b.x === 0, 'center mode: Top-left X -768 → screen left edge');
// ratios in center mode
await page.locator('.scr-card', { hasText: 'House Left' }).click();
await page.locator('.tab', { hasText: 'Ratios' }).click();
t = await page.locator('#panelBody tr', { hasText: '16:9' }).first().innerText();
ok(t.includes('-910') && t.includes('-512') && t.includes('center 0, 0'), 'center mode ratio fit 16:9 TL -910,-512, center 0,0: ' + t.replace(/\s+/g, ' '));
// export labels in center mode
L = await labelsFor('async () => { const s = __pm.job().screens.find(x => x.name === "Center"); await __pm.screenToBlob(s, __pm.job().exportSettings, __pm.job().origin); }');
ok(L.some(l => l.t === '-1280,-640' && l.x < 100 && l.y < 100) && L.some(l => l.t.startsWith('0, 0') && l.t.includes('origin')) && L.some(l => l.t === '1280,640' && l.x > 2000), 'center mode export labels: -1280,-640 top-left, "0, 0 origin" center, 1280,640 bottom-right');
// global + center: global stays top-left
await page.locator('#modeSeg button[data-mode=global]').click();
await page.locator('.scr-card', { hasText: 'Center' }).click();
await page.locator('.tab', { hasText: 'Coords' }).click();
t = await rowText('Top-left'); ok(/-1280\s+-640\s+3584\s+0/.test(t), 'global+center: local -1280,-640, global 3584,0: ' + t.replace(/\s+/g, ' '));
await page.locator('#modeSeg button[data-mode=screen]').click();
await page.locator('#originSeg button[data-origin=tl]').click();
// panel grids
await page.locator('.scr-card', { hasText: 'Center' }).click();
await page.locator('.tab', { hasText: 'Screen' }).click();
await page.locator('[data-act=gridMode][data-m=led192]').click();
let pc = await page.locator('.panel-info').first().innerText();
ok(pc.includes('14\n×\n7') || /14\s*×\s*7/.test(pc), 'Center 192 panels: 14 × 7 ' );
ok(pc.includes('98') && pc.includes('13.33 × 6.67 panels — not a whole number') && pc.includes('Last column 64 px') && pc.includes('Last row 128 px'), 'Center 192: 98 total, 13.33 × 6.67 not whole, partial 64/128: ' + pc.replace(/\s+/g, ' '));
ok((await page.evaluate(() => __pm.job().exportSettings.inc.grid)) === true, 'choosing a panel grid enables grid in export');
await page.locator('.tab', { hasText: 'Coords' }).click();
ok((await page.locator('#panelBody .panel-info').innerText()).includes('98'), 'panel count shown in Coords readout');
t = await rowText('Col 1 | 2'); ok(/192/.test(t), 'panel column boundary 192 listed');
await page.locator('.scr-card', { hasText: 'House Left' }).click();
await page.locator('.tab', { hasText: 'Screen' }).click();
await page.locator('[data-act=gridMode][data-m=led192]').click();
pc = await page.locator('.panel-info').first().innerText();
ok(pc.includes('18.67 × 5.33 panels') && pc.includes('114'), 'House Left 192: 18.67 × 5.33, 19×6=114: ' + pc.replace(/\s+/g, ' '));
await page.locator('[data-act=gridMode][data-m=led384]').click();
pc = await page.locator('.panel-info').first().innerText();
ok(pc.includes('192×384') && pc.includes('18.67 × 2.67 panels') && pc.includes('57'), 'House Left double 192×384: 18.67 × 2.67, 19×3=57');
await page.locator('[data-act=gridMode][data-m=panel]').click();
await page.locator('[data-act=panelPreset][data-p="500x500"]').click();
pc = await page.locator('.panel-info').first().innerText();
ok(pc.includes('500×500') && pc.includes('7.17 × 2.05 panels') && pc.includes('24'), 'custom 500×500 on HL: 7.17 × 2.05, 8×3=24');
await page.fill('[data-f="grid.panelW"]', '256'); await page.press('[data-f="grid.panelW"]', 'Enter');
await page.fill('[data-f="grid.panelH"]', '256'); await page.press('[data-f="grid.panelH"]', 'Enter');
pc = await page.locator('.panel-info').first().innerText();
ok(pc.includes('14 × 4 panels — exact fit') && pc.includes('56'), 'custom 256×256 on HL: exact 14×4=56');
// export with panel grid + panel numbers
await page.locator('.scr-card', { hasText: 'Center' }).click();
await page.locator('.tab', { hasText: 'Export' }).click();
await page.locator('[data-bind="exinc.panelLabels"]').check();
L = await labelsFor('async () => { const s = __pm.job().screens.find(x => x.name === "Center"); await __pm.screenToBlob(s, __pm.job().exportSettings, __pm.job().origin); }');
ok(L.some(l => l.t === 'C1 R1') && L.some(l => l.t === 'C14 R7' || l.t === 'C14 R6' || l.t === 'C13 R7') && L.some(l => l.t.startsWith('Panels 192×192: 14 × 7 = 98')), 'export draws panel numbers + panel count label');
await page.locator('[data-act=exportOne]').click();
await page.waitForSelector('.file', { timeout: 15000 });
const pf = await page.evaluate(async () => { const f = __pm.ui.exportFiles[0]; const bmp = await createImageBitmap(f.file); return { name: f.file.name, w: bmp.width, h: bmp.height }; });
ok(pf.w === 2560 && pf.h === 1280, 'panel-grid export at native 2560×1280');
{ const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.file').first().click()]);
  await dl.saveAs('/workspace/showcrew-pixelmap/screenshots/export-example-Center_2560x1280_LED192.png'); }
await page.locator('[data-bind="exinc.panelLabels"]').uncheck();

// final iPad hero: Columns with box
await page.locator('.scr-card', { hasText: 'Columns' }).click();
await page.locator('.tab', { hasText: 'Coords' }).click();
await page.screenshot({ path: OUT + 'ipad-landscape.png' });
await page.locator('.scr-card', { hasText: 'Center' }).click();
await page.locator('.tab', { hasText: 'PiP Boxes' }).click();
await page.locator('.box-item').first().click();
await page.screenshot({ path: OUT + 'ipad-landscape-center-pip.png' });

// Offline: SW cached?
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload(); await page.waitForTimeout(500);
await ctx.setOffline(true);
await page.reload(); await page.waitForTimeout(800);
ok((await page.locator('.scr-card').count()) >= 1 && (await page.locator('.brand-main').innerText()).includes('PIXEL'), 'app loads offline via service worker');
await ctx.setOffline(false);
ok(errs.length === 0, 'no console errors (iPad): ' + JSON.stringify(errs));
await ctx.close();

// ---------- iPhone ----------
ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
page = await ctx.newPage(); const errs2 = []; page.on('pageerror', e => errs2.push(e.message));
await page.goto(URL); await page.waitForTimeout(600);
await page.screenshot({ path: OUT + 'iphone-portrait.png' });
await page.locator('.scr-card', { hasText: 'Columns' }).tap();
await page.screenshot({ path: OUT + 'iphone-columns-full.png', fullPage: true });
// touch drag a PiP box on phone
await page.locator('.tab', { hasText: 'PiP Boxes' }).tap();
await page.locator('[data-act=addBox]').tap();
const g2 = await page.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); return { left: r.left, top: r.top, k: __pm.ui.k, ox: __pm.ui.ox, oy: __pm.ui.oy, b: __pm.scr().boxes[0] }; });
const cdp = await ctx.newCDPSession(page);
const P = (x, y) => ({ x: g2.left + g2.ox + x * g2.k, y: g2.top + g2.oy + y * g2.k });
const bc = P(g2.b.x + g2.b.w / 2, g2.b.y + g2.b.h / 2);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [bc] });
for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bc.x - i * 6, y: bc.y }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const nb = await page.evaluate(() => __pm.scr().boxes[0]);
ok(nb.x !== g2.b.x, `iPhone touch drag moved box ${g2.b.x} → ${nb.x}`);
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: OUT + 'iphone-pip.png' });
// iPhone: center origin + 192 panel grid
await page.locator('#originSeg button[data-origin=center]').tap();
await page.locator('.scr-card', { hasText: 'Center' }).tap();
await page.locator('.tab', { hasText: 'Coords' }).tap();
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: OUT + 'iphone-center-origin.png', fullPage: true });
await page.locator('#originSeg button[data-origin=tl]').tap();
await page.locator('.tab', { hasText: 'Screen' }).tap();
await page.locator('[data-act=gridMode][data-m=led192]').tap();
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: OUT + 'iphone-led192-grid.png', fullPage: true });
ok((await page.locator('.panel-info').first().innerText()).includes('13.33 × 6.67'), 'iPhone: LED 192 note on Center');
ok(errs2.length === 0, 'no errors (iPhone) ' + JSON.stringify(errs2));
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
ok(!overflow, 'no horizontal overflow on iPhone');
await ctx.close();
await browser.close();
console.log(results.join('\n'));
