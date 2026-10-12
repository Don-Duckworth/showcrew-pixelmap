// v1.8.1: top-bar version tag comes from sw.js VERSION (active service worker + live sw.js). Never signs in.
// Serve this folder on :8765, then: node tools/version-test.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.PM_URL || 'http://127.0.0.1:8765/';
const OUT = process.env.PM_OUT || new globalThis.URL('../screenshots/', import.meta.url).pathname;
const SRC = fs.readFileSync(new globalThis.URL('../sw.js', import.meta.url), 'utf8').match(/VERSION = '([^']+)'/)[1];
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch();
const tag = p => p.evaluate(() => { const e = document.querySelector('#appVer'); return { text: e.textContent, active: e.dataset.active, server: e.dataset.server, stale: e.classList.contains('stale'), title: e.title, vis: !!(e.offsetWidth && e.offsetHeight) }; });
const short = SRC.replace(/^scpm-/, '');
ok(/^scpm-v\d+\.\d+\.\d+$/.test(SRC), `sw.js VERSION is ${SRC}`);
// 1. no service worker (blocked): falls back to the live sw.js
{ const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1180, height: 820 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await sleep(800); const t = await tag(p);
  ok(t.text === short && t.server === SRC && t.active === '' && t.vis && !t.stale, `no SW: tag "${t.text}" from server sw.js ${t.server}`);
  ok(t.title.includes('not installed yet'), 'tooltip explains no service worker yet'); ok(errs.length === 0, 'no page errors ' + errs); await ctx.close(); }
// 2. with the service worker: the ACTIVE worker reports its cache version
for (const [label, vp] of [['iPad', { width: 1180, height: 820 }], ['iPhone', { width: 390, height: 844 }], ['Desktop', { width: 1440, height: 900 }]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: label === 'iPhone', hasTouch: label !== 'Desktop' }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.evaluate(() => navigator.serviceWorker.ready); await p.reload(); await sleep(1000);
  let t = await tag(p);
  ok(await p.evaluate(() => !!navigator.serviceWorker.controller) && t.active === SRC && t.server === SRC && t.text === short && !t.stale, `${label}: active SW reports ${t.active}, tag "${t.text}"`);
  ok(t.title.includes(`This device (service worker cache): ${SRC}`) && t.title.includes(`Latest on the server: ${SRC}`), `${label}: tooltip shows device + server version`);
  ok(t.vis && await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: tag visible, no horizontal overflow`);
  const box = await p.locator('#appVer').boundingBox(), brand = await p.locator('.brand-main').boundingBox();
  ok(box && brand && box.y >= brand.y - 2 && box.y + box.height <= brand.y + brand.height + 2, `${label}: tag sits in the top-bar brand line`);
  if (label === 'iPad') await p.screenshot({ path: OUT + 'ipad-topbar-version.png', clip: { x: 0, y: 0, width: 1180, height: 70 } });
  if (label === 'Desktop') {   // a newer sw.js on the server → amber "v1.8.1 → v9.9.9"
    await p.route('**/sw.js*', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(SRC, 'scpm-v9.9.9') }); });
    await p.evaluate(() => document.querySelector('#appVer').textContent = ''); await p.reload(); await sleep(1200); t = await tag(p);
    ok(t.stale && t.text === `${short} → v9.9.9` && t.title.includes('reload to switch'), `server newer than device: amber "${t.text}"`);
    await p.unroute('**/sw.js*');
  }
  ok(errs.length === 0, `${label}: no page errors ${errs}`); await ctx.close();
}
await browser.close();
console.log(results.join('\n'));
const fails = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - fails}/${results.length} version checks passed`); process.exit(fails ? 1 : 0);
