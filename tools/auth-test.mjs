// Auth UI tests (v1.3): email + password + authenticator (TOTP) sign-in, same flow as ShowCrew GearVault.
// Uses the in-memory Supabase stand-in (tools/mock-supabase.mjs). Serve this folder, then:
//   PM_URL=http://127.0.0.1:8765/ node tools/auth-test.mjs
import { chromium } from 'playwright';
import { createBackend, MOCK, TOTP_OK } from './mock-supabase.mjs';
const URL = process.env.PM_URL || 'http://127.0.0.1:8765/';
const OUT = process.env.PM_OUT || new globalThis.URL('../screenshots/', import.meta.url).pathname;
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { backend, handle } = createBackend();
const EMAIL = 'mdduck@example.com', PW = 'stage left 2026!';
backend.addUser(EMAIL, PW);

const browser = await chromium.launch();
const IPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };
const IPAD = { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true };
async function device(name, opts, { signup = false } = {}) {
  const ctx = await browser.newContext({ ...opts, serviceWorkers: 'block' });
  await ctx.exposeFunction('pmBackend', (op, a) => handle(op, a));
  await ctx.addInitScript(MOCK);
  if (signup) await ctx.route('**/js/config.js', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace('ALLOW_SIGNUP = false', 'ALLOW_SIGNUP = true') }); });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  return { name, ctx, page, errs };
}
const st = p => p.evaluate(() => __pm.sync.status());
const key = p => p.locator('#modal .acct').getAttribute('data-key');
const calls = p => p.evaluate(() => __PM_SUPABASE_MOCK.auth.calls.slice());
const submit = p => p.locator('.acct button[type=submit]').click();
const msg = p => p.locator('#acctMsg').innerText();

// ---------- 1. signed out: the whole app still works, sign-in panel is password based ----------
const A = await device('iphone', IPHONE);
await A.page.goto(URL); await sleep(500);
ok((await st(A.page)).state === 'signedout', 'starts signed out');
await A.page.evaluate(() => { __pm.job().screens[0].w = 4000; }); await A.page.locator('.scr-card').nth(1).tap(); await sleep(100);
ok((await A.page.evaluate(() => JSON.parse(localStorage.getItem('showcrew.pixelmap.v1') || localStorage.getItem(Object.keys(localStorage).find(k => k.includes('pixelmap') && !k.includes('auth'))) || '{}').jobs?.[0]?.screens?.[0]?.w)) === 4000 || (await A.page.evaluate(() => __pm.job().screens[0].w)) === 4000, 'signed out: edits work and save locally');
await A.page.locator('#syncBtn').tap(); await sleep(150);
ok(await A.page.locator('#acctEmail').isVisible() && await A.page.locator('#acctPw').getAttribute('type') === 'password', 'account panel: email + password fields');
ok(await A.page.locator('[data-act=acctView][data-v=forgot]').isVisible(), '"Forgot password?" link shown');
ok(await A.page.locator('[data-v=signup]').count() === 0, 'ALLOW_SIGNUP=false: no "Create account" link');
ok(!(await A.page.locator('.acct').innerText()).match(/email you a code|sign-in code/i), 'no email-code / magic-link wording left');
await A.page.screenshot({ path: OUT + 'iphone-auth-signin.png' });
await A.page.fill('#acctEmail', 'not-an-email'); await submit(A.page); await sleep(50);
ok((await msg(A.page)).includes('valid email'), 'validates email');
await A.page.fill('#acctEmail', EMAIL); await A.page.fill('#acctPw', 'wrong'); await submit(A.page); await sleep(150);
ok((await msg(A.page)).includes('Invalid login credentials') && (await st(A.page)).state === 'signedout', 'wrong password → error, still signed out');

// ---------- 2. first sign-in: mandatory authenticator enrollment (QR + secret) ----------
await A.page.fill('#acctPw', PW); await A.page.press('#acctPw', 'Enter');
await A.page.waitForSelector('#totpQr');
let s = await st(A.page);
ok(s.step === 'enroll' && s.aal === 'aal1' && s.state === 'mfa', 'after password: aal1, enrollment step, pill state mfa');
ok((await A.page.locator('#syncBtn .sl').innerText()).toUpperCase() === '2FA CODE', 'header pill says 2FA CODE');
ok(backend.selects === 0 && backend.pushes === 0, 'no job data read or written at aal1');
ok((await A.page.locator('#totpQr').getAttribute('src')).startsWith('data:image/svg+xml') && /^JBSWY3DPEHPK3PXP\d+$/.test(await A.page.locator('#totpSecret').inputValue()), 'QR code image + manual secret shown');
ok((await calls(A.page)).includes('enroll:ShowCrew PixelMap'), 'enroll uses issuer "ShowCrew PixelMap"');
await A.page.screenshot({ path: OUT + 'iphone-auth-enroll.png' });
const secret1 = await A.page.locator('#totpSecret').inputValue();
// leave half-way: close + reload → still aal1, reopening drops the unverified factor and issues a fresh QR
await A.page.locator('[data-act=closeModal]').tap(); await A.page.reload(); await sleep(600);
s = await st(A.page);
ok(s.state === 'mfa' && s.step === 'enroll', 'reload mid-enrollment: still needs 2FA, no sync');
await A.page.locator('#syncBtn').tap(); await A.page.waitForSelector('#totpQr');
ok((await A.page.locator('#totpSecret').inputValue()) !== secret1 && (await calls(A.page)).includes('unenroll') && backend.users[EMAIL].factors.length === 1, 'half-finished factor removed, fresh QR/secret issued');
await A.page.fill('#acctCode', '12'); await submit(A.page); await sleep(50);
ok((await msg(A.page)).includes('6-digit'), 'code must be 6 digits');
await A.page.fill('#acctCode', '111111'); await submit(A.page); await sleep(200);
ok((await msg(A.page)).includes('Invalid TOTP') && (await st(A.page)).aal === 'aal1', 'wrong authenticator code rejected, stays aal1');
await A.page.fill('#acctCode', TOTP_OK); await submit(A.page); await sleep(600);
s = await st(A.page);
ok(s.step === 'done' && s.aal === 'aal2' && s.state === 'synced', 'correct code → aal2 → synced');
ok(backend.users[EMAIL].factors.filter(f => f.status === 'verified').length === 1, 'one verified TOTP factor on the account');
ok(backend.rows.size === 1 && backend.aal1Denied === 0, 'local job uploaded only after aal2');
ok((await A.page.locator('.acct').innerText()).includes('two-factor on'), 'account panel: signed in · two-factor on');
await A.page.screenshot({ path: OUT + 'iphone-auth-signedin.png' });
await A.page.locator('[data-act=closeModal]').tap();

// ---------- 3. second device: password then challenge (no QR) ----------
const B = await device('ipad', IPAD);
await B.page.goto(URL); await sleep(400);
await B.page.locator('#syncBtn').click(); await B.page.fill('#acctEmail', EMAIL); await B.page.fill('#acctPw', PW); await submit(B.page);
await B.page.waitForSelector('.acct[data-key=challenge]');
ok(await B.page.locator('#totpQr').count() === 0 && (await st(B.page)).state === 'mfa', 'second sign-in: TWO-FACTOR CHECK, no new QR code');
await B.page.screenshot({ path: OUT + 'ipad-auth-challenge.png' });
await B.page.fill('#acctCode', '000000'); await submit(B.page); await sleep(150);
ok((await msg(B.page)).includes('Invalid') && (await B.page.locator('#acctCode').inputValue()) === '', 'wrong code → error, field cleared');
await B.page.fill('#acctCode', TOTP_OK); await B.page.press('#acctCode', 'Enter'); await sleep(600);
ok((await st(B.page)).state === 'synced' && (await B.page.evaluate(() => __pm.S.jobs.some(j => j.screens[0].w === 4000))), 'challenge verified → synced, pulls job from device A');
ok((await calls(B.page)).filter(c => c === 'challenge').length >= 2 && !(await calls(B.page)).some(c => c.startsWith('enroll')), 'uses mfa.challenge + verify, no enroll');
// aal2 session persists over reload
await B.page.reload(); await sleep(600);
ok((await st(B.page)).state === 'synced', 'aal2 session survives reload');
// offline with an aal2 session: app opens and keeps working
await B.ctx.setOffline(true); await B.page.evaluate(() => __pm.sync.syncNow('t')); await sleep(100);
ok((await st(B.page)).state === 'offline' && (await B.page.locator('.scr-card').count()) >= 1, 'offline: pill shows Offline, app still usable');
await B.ctx.setOffline(false); await sleep(500);
// sign out
await B.page.locator('#syncBtn').click(); await B.page.locator('[data-act=signOut]').click(); await sleep(200);
ok((await st(B.page)).state === 'signedout' && await B.page.locator('#acctPw').isVisible() && (await B.page.evaluate(() => __pm.S.jobs.length)) >= 1, 'sign out → sign-in form, jobs kept on device');
await B.page.locator('[data-act=closeModal]').click();

// ---------- 4. aal1 session can't sync even if asked; sign out from the 2FA screen ----------
await B.page.locator('#syncBtn').click(); await B.page.fill('#acctEmail', EMAIL); await B.page.fill('#acctPw', PW); await submit(B.page);
await B.page.waitForSelector('.acct[data-key=challenge]');
const sel0 = backend.selects; await B.page.evaluate(() => __pm.sync.syncNow('forced')); await sleep(100);
ok(backend.selects === sel0 && (await st(B.page)).state === 'mfa', 'syncNow at aal1 does nothing (waits for 2FA)');
await B.page.locator('.acct [data-act=signOut]').click(); await sleep(200);
ok((await st(B.page)).state === 'signedout' && (await key(B.page)) === 'signin', '"Sign out / use another account" from the 2FA screen');

// ---------- 5. password reset: email → link → authenticator code → new password ----------
await B.page.locator('[data-v=forgot]').click(); await B.page.fill('#acctEmail', EMAIL); await submit(B.page); await sleep(150);
ok(backend.resets.includes(EMAIL) && (await calls(B.page)).includes('resetPasswordForEmail:' + URL), 'reset email requested with redirectTo = app URL');
ok((await B.page.locator('.acct').innerText()).includes('CHECK YOUR EMAIL'), 'reset: "check your email" screen');
await B.page.locator('[data-act=closeModal]').click();
await B.page.evaluate(e => __PM_SUPABASE_MOCK.auth._recoveryLink(e), EMAIL); await sleep(300);
ok((await key(B.page)) === 'challenge', 'reset link opens the account panel at the 2FA check (aal1)');
await B.page.fill('#acctCode', TOTP_OK); await submit(B.page); await sleep(300);
ok((await key(B.page)) === 'newpw' && backend.selects === sel0, 'after the code: CHOOSE A NEW PASSWORD (no sync yet)');
await B.page.screenshot({ path: OUT + 'ipad-auth-newpw.png' });
await B.page.fill('#acctPw', 'short'); await B.page.fill('#acctPw2', 'short'); await submit(B.page); await sleep(50);
ok((await msg(B.page)).includes('12 characters'), 'new password: 12+ characters');
await B.page.fill('#acctPw', 'a brand new passphrase'); await B.page.fill('#acctPw2', 'a different passphrase'); await submit(B.page); await sleep(50);
ok((await msg(B.page)).includes("don't match"), 'new password: must match');
await B.page.fill('#acctPw2', 'a brand new passphrase'); await submit(B.page); await sleep(500);
ok(backend.users[EMAIL].pw === 'a brand new passphrase' && (await st(B.page)).state === 'synced', 'password saved → signed in and synced');

// ---------- 6. used/expired email link (#error=…) shows a clear message ----------
const C = await device('ipad-c', IPAD);
await C.page.goto(URL + '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'); await sleep(500);
ok((await msg(C.page)).includes('Email link is invalid or has expired') && !(await C.page.evaluate(() => location.hash)), 'expired link: explained in the account panel, hash cleared');

// ---------- 7. ALLOW_SIGNUP = true shows Create account ----------
const D = await device('signup', IPHONE, { signup: true });
await D.page.goto(URL); await sleep(400); await D.page.locator('#syncBtn').tap();
ok(await D.page.locator('[data-v=signup]').isVisible(), 'ALLOW_SIGNUP=true: "Create account" link');
await D.page.locator('[data-v=signup]').tap(); await D.page.fill('#acctEmail', 'crew@example.com'); await D.page.fill('#acctPw', 'short'); await submit(D.page); await sleep(50);
ok((await msg(D.page)).includes('12 characters'), 'sign-up: 12+ character password');
await D.page.fill('#acctPw', 'crew member password'); await submit(D.page); await sleep(200);
ok(backend.users['crew@example.com'] && (await D.page.locator('.acct').innerText()).includes('CHECK YOUR EMAIL'), 'sign-up → confirm-email screen');

for (const d of [A, B, C, D]) {
  ok(!(await calls(d.page)).some(c => c === 'signInWithOtp' || c === 'verifyOtp'), `${d.name}: no email OTP / magic-link calls`);
  ok(d.errs.length === 0, `no page errors on ${d.name} ${JSON.stringify(d.errs)}`);
}
await browser.close();
console.log(results.join('\n'));
const fails = results.filter(r => r.startsWith('FAIL')).length;
console.log(`${results.length - fails}/${results.length} auth checks passed`);
process.exitCode = fails ? 1 : 0;
