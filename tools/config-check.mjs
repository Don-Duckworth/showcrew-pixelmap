import { chromium } from 'playwright';
const URL = process.env.PM_URL || 'http://127.0.0.1:8765/';
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m);
const browser = await chromium.launch();
// 1) empty key → behaves as before (no sync UI, nothing loaded)
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
  await ctx.route('**/js/config.js', r => r.fulfill({ contentType: 'text/javascript', body: "export const SUPABASE_URL = 'https://ylilrphbplhauxqdbqni.supabase.co';\nexport const SUPABASE_PUBLISHABLE_KEY = '';\n" }));
  const page = await ctx.newPage(); const reqs = []; const errs = [];
  page.on('request', r => reqs.push(r.url())); page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL); await page.waitForTimeout(800);
  ok(await page.locator('#syncBtn').isHidden(), 'empty key: sync indicator hidden');
  ok(!reqs.some(u => u.includes('vendor/supabase')) && !reqs.some(u => u.includes('supabase.co')), 'empty key: no supabase library or network requests');
  ok((await page.locator('.scr-card').count()) === 4 && errs.length === 0, 'empty key: app works normally, no errors');
  await page.evaluate(() => { __pm.job().name = 'x'; }); await page.locator('.scr-card').nth(1).click(); await page.waitForTimeout(3500);
  ok(!reqs.some(u => u.includes('supabase.co')), 'empty key: edits trigger no network sync');
  await ctx.close();
}
// 2) real Supabase project with the real publishable key (no email sent)
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await ctx.newPage(); const reqs = []; const errs = [];
  page.on('request', r => reqs.push(r.url())); page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => typeof window.supabase?.createClient === 'function'), 'vendored supabase-js loaded from ' + reqs.find(u => u.includes('vendor/')));
  ok((await page.evaluate(() => __pm.sync.status().state)) === 'signedout', 'real backend: signed-out state');
  const err = await page.evaluate(async () => { try { await __pm.sync.verifyCode('123456', 'nobody@example.com'); return 'no error'; } catch (e) { return e.message; } });
  ok(/expired|invalid/i.test(err) && reqs.some(u => u.includes('ylilrphbplhauxqdbqni.supabase.co/auth/v1/verify')), 'real Supabase Auth reachable: bogus OTP rejected → "' + err + '"');
  ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs));
  await ctx.close();
}
await browser.close();
console.log(results.join('\n'));
