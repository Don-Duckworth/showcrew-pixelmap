// v1.5 browser tests: Add screen from a PowerPoint slide size, Duplicate / Resize from slide size keeping segments.
// Serve this folder on :8765, then: node tools/slide-resize-test.mjs  (local test job with Don's sizes; never signs in)
import { chromium } from 'playwright';
const URL = process.env.PM_URL || 'http://127.0.0.1:8765/';
const OUT = process.env.PM_OUT || new globalThis.URL('../screenshots/', import.meta.url).pathname;
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch();
async function open(name, opts) {
  const ctx = await browser.newContext({ ...opts, serviceWorkers: 'block' }); const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await page.goto(URL); await page.waitForTimeout(500);
  await page.evaluate(() => { __pm.ACTIONS.newExample(); const j = __pm.job(); j.name = 'TacoBell example (Don\'s segment sizes)'; const s = j.screens[0]; j.screens = [s]; j.currentScreenId = s.id;
    Object.assign(s, { name: 'Screen 1', w: 11344, h: 1080, segMode: 'custom', segments: 3, physUnit: 'ft', pptCur: { w: 55.561, h: 5.28, unit: 'in' },
      segs: [{ id: 'sl', name: 'Left', x: 0, y: 0, w: 3510, h: 1080, pw: 52, ph: 16 }, { id: 'sc', name: 'Center', x: 3510, y: 0, w: 4320, h: 1080, pw: 66, ph: 16 }, { id: 'sr', name: 'Right', x: 7830, y: 0, w: 3510, h: 1080, pw: 52, ph: 16 }],
      boxes: [{ id: 'b1', name: 'PiP center', color: '#ff3df2', x: 4710, y: 0, w: 1920, h: 1080, lock: false }] });
    __pm.ui.tab = 'screen'; __pm.render(); });
  return { name, ctx, page, errs, tap: !!opts.isMobile };
}
const click = (d, sel) => (d.tap ? d.page.locator(sel).first().tap() : d.page.locator(sel).first().click());
const fill = async (d, id, v) => { await d.page.fill('#' + id, String(v)); await sleep(60); };
const prev = d => d.page.locator('#sdPrev').innerText();
const scrs = d => d.page.evaluate(() => __pm.job().screens.map(s => ({ name: s.name, w: s.w, h: s.h, segs: (s.segs || []).map(g => [g.name, g.x, g.w, g.h, g.pw]), boxes: s.boxes.map(b => [b.x, b.y, b.w, b.h]), cur: s.pptCur, mode: s.segMode })));

for (const [label, opts] of [['iPad', { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true }], ['iPhone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }], ['Desktop', { viewport: { width: 1440, height: 900 } }]]) {
  const d = await open(label, opts), P = label + ': ';
  // ---- Duplicate from slide size (prefilled from his current slide 55.561 × 5.28 in, 96 px/in)
  await click(d, '[data-act=openSlideDlg][data-k=dup]'); await sleep(150);
  ok(await d.page.locator('.sdlg').isVisible(), P + 'duplicate dialog opens');
  ok((await d.page.inputValue('#sdSw')) === '55.561' && (await d.page.inputValue('#sdSh')) === '5.28' && (await d.page.inputValue('#sdPpi')) === '96', P + 'prefilled with current slide 55.561 × 5.28 in @ 96 px/in');
  let t = await prev(d);
  ok(t.includes('5334') && t.includes('507') && t.includes('5333.856') && t.includes('506.88'), P + 'live preview 5333.856 × 506.88 → 5334 × 507');
  ok(/Left[\s\S]*3510×1080[\s\S]*1650×507/.test(t) && /Center[\s\S]*4320×1080[\s\S]*2032×507/.test(t) && /3682/.test(t), P + 'segment preview 3510→1650, 4320→2032, Right @ 3682');
  ok(t.includes('2 px short') && t.includes('4 px short'), P + 'preview shows new fit (2 px short) and notes original 4 px gap');
  ok((await d.page.inputValue('#sdName')) === 'Screen 1 (PPT 55.561x5.28)', P + 'default name "Screen 1 (PPT 55.561x5.28)"');
  if (label === 'iPad') { await d.page.screenshot({ path: OUT + 'ipad-duplicate-from-slide-size.png' });
    await d.page.evaluate(() => { const c = document.querySelector('.modal-card'); c.scrollTop = c.scrollHeight; }); await sleep(80);
    await d.page.screenshot({ path: OUT + 'ipad-duplicate-from-slide-size-fit.png' }); await d.page.evaluate(() => { document.querySelector('.modal-card').scrollTop = 0; }); }
  if (label === 'iPhone') await d.page.screenshot({ path: OUT + 'iphone-duplicate-from-slide-size.png' });
  // switch to target width 11344 → 11344 × 1078
  await click(d, '[data-act=sdSet][data-k=by][data-v=width]'); await sleep(80);
  await fill(d, 'sdTw', 11344); t = await prev(d);
  ok(t.includes('11344') && t.includes('1078') && t.includes('1078.028') && t.includes('204.172'), P + 'target width 11344 → 11344 × 1078 (exact 1078.028, 204.172 px/in)');
  if (label === 'iPad') await d.page.screenshot({ path: OUT + 'ipad-duplicate-from-slide-size-target-width.png' });
  await click(d, '[data-act=sdSet][data-k=by][data-v=ppi]'); await sleep(80);
  ok((await prev(d)).includes('5334'), P + 'back to px/in keeps 96');
  // keep pixel sizes → warning
  await click(d, '[data-act=sdSet][data-k=seg][data-v=keep]'); await sleep(80); t = await prev(d);
  ok(/completely off the screen/.test(t) && (await d.page.locator('#sdPrev .fitwarn.error').count()) === 1, P + 'keep pixel sizes warns (red) that segments no longer fit');
  await click(d, '[data-act=sdSet][data-k=seg][data-v=scale]'); await sleep(80);
  await click(d, '#sdOk'); await sleep(200);
  let S = await scrs(d);
  ok(S.length === 2 && S[1].name === 'Screen 1 (PPT 55.561x5.28)' && S[1].w === 5334 && S[1].h === 507, P + 'duplicate created 5334×507 ' + JSON.stringify(S.map(s => [s.name, s.w, s.h])));
  ok(JSON.stringify(S[1].segs) === JSON.stringify([['Left', 0, 1650, 507, 52], ['Center', 1650, 2032, 507, 66], ['Right', 3682, 1650, 507, 52]]), P + 'duplicate segments scaled + feet kept ' + JSON.stringify(S[1].segs));
  ok(JSON.stringify(S[1].boxes) === '[[2215,0,902,507]]' && JSON.stringify(S[0].boxes) === '[[4710,0,1920,1080]]', P + 'PiP scaled on copy, original untouched');
  ok(S[0].w === 11344 && S[0].segs[1][2] === 4320, P + 'original screen unchanged');
  ok((await d.page.locator('.scr-card.on .fitbadge').innerText()).includes('2 px short'), P + 'copy shows fit badge 2 px short');
  const ids = await d.page.evaluate(() => { const [a, b] = __pm.job().screens; return [a.id !== b.id, a.segs.every((g, i) => g.id !== b.segs[i].id)]; });
  ok(ids[0] && ids[1], P + 'copy has fresh screen + segment ids');
  // ---- Resize in place (back on screen 1) via target width
  await d.page.evaluate(() => { const j = __pm.job(); j.currentScreenId = j.screens[0].id; __pm.render(); });
  await click(d, '[data-act=openSlideDlg][data-k=resize]'); await sleep(120);
  ok((await d.page.locator('#sdName').count()) === 0, P + 'resize dialog has no name field');
  await click(d, '[data-act=sdSet][data-k=by][data-v=width]'); await fill(d, 'sdTw', 11344); await click(d, '#sdOk'); await sleep(150);
  S = await scrs(d);
  ok(S[0].w === 11344 && S[0].h === 1078 && JSON.stringify(S[0].segs.map(g => g[3])) === '[1078,1078,1078]' && S[0].name === 'Screen 1', P + 'resize in place → 11344×1078, heights 1078, name kept');
  // ---- New screen from PowerPoint size (cm)
  await click(d, '[data-act=openSlideDlg][data-k=new]'); await sleep(120);
  ok((await d.page.inputValue('#sdPw')) === '1920', P + 'Add screen dialog defaults to pixels 1920×1080');
  await click(d, '[data-act=sdSet][data-k=from][data-v=ppt]'); await sleep(80);
  await click(d, '[data-act=sdSet][data-k=unit][data-v=cm]'); await sleep(80);
  await fill(d, 'sdSw', 33.867); await fill(d, 'sdSh', 19.05); t = await prev(d);
  ok(t.includes('1280') && t.includes('720'), P + 'new screen 33.867 × 19.05 cm @ 96 → 1280×720');
  await fill(d, 'sdName', 'PPT widescreen'); await click(d, '#sdOk'); await sleep(150);
  S = await scrs(d);
  ok(S.length === 3 && S[2].name === 'PPT widescreen' && S[2].w === 1280 && S[2].h === 720 && S[2].cur && S[2].cur.unit === 'cm', P + 'new screen created and remembers its slide size ' + JSON.stringify(S[2]));
  // plain pixel add still works
  await click(d, '[data-act=openSlideDlg][data-k=new]'); await sleep(100); await click(d, '#sdOk'); await sleep(120);
  S = await scrs(d); ok(S.length === 4 && S[3].w === 1920 && S[3].h === 1080, P + 'plain Add 1920×1080 still works');
  // persisted (localStorage) and survives reload
  await sleep(300); await d.page.reload(); await sleep(500);
  S = await scrs(d); ok(S.length === 4 && S[1].w === 5334 && S[1].segs[1][2] === 2032, P + 'saved: survives reload');
  if (d.tap) ok(!(await d.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), P + 'no horizontal overflow');
  ok(d.errs.length === 0, P + 'no page errors ' + JSON.stringify(d.errs));
  await d.ctx.close();
}
await browser.close();
console.log(results.join('\n'));
const fails = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - fails}/${results.length} slide-size duplicate/resize checks passed`);
process.exit(fails ? 1 : 0);
