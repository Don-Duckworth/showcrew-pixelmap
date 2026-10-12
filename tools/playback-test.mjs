// v1.6 browser tests: Slides tab target output resolution + full-screen playback fit (bars, rendered area, scale, segment landing).
// Serve this folder on :8765, then: node tools/playback-test.mjs  (local test job with Don's sizes; never signs in)
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
    Object.assign(s, { name: 'Screen 1', w: 11344, h: 1080, segMode: 'custom', segments: 3, physUnit: 'ft', pptCur: { w: 55.561, h: 5.28, unit: 'in' }, pptOut: null,
      segs: [{ id: 'sl', name: 'Left', x: 0, y: 0, w: 3510, h: 1080, pw: 52, ph: 16 }, { id: 'sc', name: 'Center', x: 3510, y: 0, w: 4320, h: 1080, pw: 66, ph: 16 }, { id: 'sr', name: 'Right', x: 7830, y: 0, w: 3510, h: 1080, pw: 52, ph: 16 }],
      boxes: [] });
    __pm.ui.tab = 'slides'; __pm.render(); });
  await sleep(150);
  return { name, ctx, page, errs, tap: !!opts.isMobile };
}
const click = (d, sel) => (d.tap ? d.page.locator(sel).first().tap() : d.page.locator(sel).first().click());
const txt = (d, sel) => d.page.locator(sel).first().innerText();
const out = d => d.page.evaluate(() => __pm.scr().pptOut);
const setOut = async (d, w, h) => { await d.page.fill('[data-bind="pptout.w"]', String(w)); await d.page.dispatchEvent('[data-bind="pptout.w"]', 'change'); await sleep(80);
  await d.page.fill('[data-bind="pptout.h"]', String(h)); await d.page.dispatchEvent('[data-bind="pptout.h"]', 'change'); await sleep(80); };

for (const [label, opts] of [['iPad', { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true }], ['iPhone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }], ['Desktop', { viewport: { width: 1440, height: 900 } }]]) {
  const d = await open(label, opts), P = label + ': ';
  ok(await d.page.locator('.outcard').isVisible(), P + 'target output card shown in Slides tab');
  ok((await d.page.inputValue('[data-bind="pptout.w"]')) === '11344' && (await d.page.inputValue('[data-bind="pptout.h"]')) === '1080', P + 'output defaults to the screen 11344×1080');
  ok(await d.page.locator('.qp .btn.on[data-screen]').count() === 1, P + 'quick pick "Screen 11344×1080" active');
  ok(await d.page.locator('.qp [data-w="1920"][data-h="1080"]').count() === 1 && await d.page.locator('.qp [data-w="3840"][data-h="2160"]').count() === 1, P + 'quick picks 1920×1080 and 3840×2160');
  // Don's current slide 55.561 × 5.28 in on 11344×1080
  let c = await txt(d, '[data-pb=cur]');
  ok(c.includes('Letterbox') && c.includes('Black top and bottom: about 1 px each') && c.includes('0.986 px each') && c.includes('1.972 px total'), P + 'current slide: letterbox, about 1 px top and bottom (0.986 each, 1.972 total)');
  ok(c.includes('11344 × 1078.03 px') && c.includes('204.172 px/in') && c.includes('×2.127'), P + 'current slide: rendered 11344 × 1078.03 px, 204.172 px/in, ×2.127');
  ok(/Left[\s\S]*x 0–3510[\s\S]*y 0.99–1079.01/.test(c) && /Right[\s\S]*x 7830–11340/.test(c), P + 'segments land: Left x 0–3510, y 0.99–1079.01; Right x 7830–11340');
  ok(c.includes('Every edge stays within 1 px') && !(await d.page.locator('[data-pb=cur] tr.moved').count()), P + 'no segment edge flagged (< 1 px)');
  let r = await txt(d, '[data-pb=rec]');
  ok(r.includes('No black bars — the slide fills the output exactly') && r.includes('11344 × 1080 px') && r.includes('288 px/in'), P + 'recommended 1/3 slide: no bars, 11344 × 1080 px at 288 px/in');
  if (label === 'iPad') {
    await d.page.locator('[data-pb=cur]').evaluate(e => e.scrollIntoView({ block: 'center' })); await sleep(120);
    await d.page.screenshot({ path: OUT + 'ipad-slides-playback-fit.png' });
  }
  // quick pick 1920×1080
  await click(d, '.qp [data-w="1920"][data-h="1080"]'); await sleep(150);
  ok(JSON.stringify(await out(d)) === '{"w":1920,"h":1080}' && (await d.page.inputValue('[data-bind="pptout.w"]')) === '1920', P + 'pick 1920×1080 → saved on screen, inputs updated');
  r = await txt(d, '[data-pb=rec]');
  ok(r.includes('ON A 1920×1080 OUTPUT') && r.includes('Letterbox') && r.includes('about 449 px each') && r.includes('1920 × 182.79 px'), P + 'recommended slide on 1920×1080: letterbox about 449 px each, 1920 × 182.79 px');
  ok(await d.page.locator('[data-pb=rec] tr.moved').count() === 3 && (await txt(d, '[data-pb=rec] .pb-flag')).includes('shift by 1 px or more'), P + '1920×1080: all 3 segments flagged (top/bottom move)');
  ok((await txt(d, '[data-pb=rec]')).includes('Native → 1920×1080'), P + 'native positions scaled to the output');
  // custom typed output, then Screen pick resets
  await setOut(d, 11344, 1083);
  ok(JSON.stringify(await out(d)) === '{"w":11344,"h":1083}', P + 'typed output 11344×1083 saved');
  c = await txt(d, '[data-pb=cur]'); ok(c.includes('about 2 px each') && c.includes('4.972 px total'), P + 'current slide on 11344×1083: about 2 px each');
  r = await txt(d, '[data-pb=rec]'); ok(r.includes('(3 px total, odd)') && r.includes('one side gets 1 px and the other 2 px'), P + 'odd 3 px total: says which split (1 / 2) and "about"');
  await click(d, '.qp [data-screen]'); await sleep(150);
  ok(await out(d) === null && (await d.page.inputValue('[data-bind="pptout.h"]')) === '1080', P + 'Screen pick → follows the screen again (null)');
  // pillarbox: 4:3 current slide
  await d.page.evaluate(() => { __pm.scr().pptCur = { w: 10, h: 7.5, unit: 'in' }; __pm.render(); }); await sleep(100);
  c = await txt(d, '[data-pb=cur]'); ok(c.includes('Pillarbox') && c.includes('Black left and right: 4952 px each (9904 px total)') && c.includes('1440 × 1080 px'), P + '4:3 slide → pillarbox 4952 px each, 1440 × 1080 px');
  ok(await d.page.locator('[data-pb=cur] tr.moved').count() === 3, P + 'pillarbox: segments flagged');
  await d.page.evaluate(() => { __pm.scr().pptCur = { w: 55.561, h: 5.28, unit: 'in' }; __pm.render(); }); await sleep(100);
  // summary text
  const sum = await d.page.evaluate(() => __pm.slideSummaryText(__pm.scr()));
  ok(sum.includes('Full screen on 11344×1080: No black bars'), P + 'summary includes playback line');
  // duplicate dialog shows playback of the entered slide
  await d.page.evaluate(() => { __pm.ui.tab = 'screen'; __pm.render(); }); await sleep(100);
  await click(d, '[data-act=openSlideDlg][data-k=dup]'); await sleep(150);
  let t = await txt(d, '#sdPrev');
  ok(t.includes('FULL-SCREEN PLAYBACK') && /5334×507[\s\S]*No black bars \(only 0.11 px/.test(t), P + 'dialog: on new 5334×507 → no bars (0.11 px)');
  ok(/11344×1080[\s\S]*Letterbox — Black top and bottom: about 1 px each[\s\S]*11344 × 1078.03 px/.test(t), P + "dialog: on Screen 1's 11344×1080 output → about 1 px top/bottom, 11344 × 1078.03 px");
  await click(d, '[data-act=sdSet][data-k=by][data-v=width]'); await sleep(120); t = await txt(d, '#sdPrev');
  ok(/11344×1078[\s\S]*No black bars \(only 0.3 px/.test(t), P + 'dialog target width: 11344×1078 → no bars (0.3 px)');
  await click(d, '.sdlg [data-act=closeModal]'); await sleep(100);
  // persisted
  await d.page.evaluate(() => { __pm.ui.tab = 'slides'; __pm.render(); }); await sleep(80);
  await click(d, '.qp [data-w="3840"][data-h="2160"]'); await sleep(400);
  await d.page.reload(); await sleep(600);
  ok(JSON.stringify(await out(d)) === '{"w":3840,"h":2160}', P + 'target output survives reload');
  ok(d.errs.length === 0, P + 'no page errors ' + JSON.stringify(d.errs));
  await d.ctx.close();
}
await browser.close();
console.log(results.join('\n'));
const fails = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - fails}/${results.length} playback checks passed`); process.exit(fails ? 1 : 0);
