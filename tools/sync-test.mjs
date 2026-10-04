// Sync tests: two "devices" (separate browser contexts) against an in-memory backend that mirrors
// supabase/schema.sql push_jobs semantics (LWW on updated_at, tombstones, owner isolation).
import { chromium } from 'playwright';
const URL = process.env.PM_URL || 'http://127.0.0.1:8765/';
const OUT = process.env.PM_OUT || new URL('../screenshots/', import.meta.url).pathname;
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const backend = { users: {}, rows: new Map(), otps: 0 };
function handle(op, a) {
  if (op === 'otp') { backend.otps++; return { error: null }; }
  if (op === 'verify') {
    if (a.token !== '123456') return { error: 'Token has expired or is invalid' };
    const id = backend.users[a.email] ||= `0000000${Object.keys(backend.users).length + 1}-0000-4000-a000-000000000000`;
    return { user: { id, email: a.email } };
  }
  if (!a.uid) return { data: null, error: { message: 'not authenticated' } };
  if (op === 'select') return { data: [...backend.rows.values()].filter(r => r.owner === a.uid).map(({ owner, ...r }) => r), error: null };
  if (op === 'push') return { data: a.items.map(it => {
    const ex = backend.rows.get(it.id);
    if (ex && ex.owner !== a.uid) return { id: it.id, status: 'denied: new row violates row-level security policy', updated_at: null };
    if (ex && !(Date.parse(ex.updated_at) < Date.parse(it.updated_at))) return { id: it.id, status: 'stale', updated_at: ex.updated_at };
    backend.rows.set(it.id, { id: it.id, owner: a.uid, name: it.name, data: it.data, updated_at: it.updated_at, deleted: !!it.deleted });
    return { id: it.id, status: 'ok', updated_at: it.updated_at };
  }), error: null };
}
const MOCK = () => {
  const auth = {
    _user: JSON.parse(localStorage.getItem('mock.user') || 'null'), _cbs: [],
    async getSession() { return { data: { session: this._user ? { user: this._user } : null } }; },
    onAuthStateChange(cb) { this._cbs.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
    async signInWithOtp({ email }) { await window.pmBackend('otp', { email }); return { error: null }; },
    async verifyOtp({ email, token }) {
      const r = await window.pmBackend('verify', { email, token });
      if (r.error) return { data: {}, error: { message: r.error } };
      this._user = r.user; localStorage.setItem('mock.user', JSON.stringify(r.user));
      return { data: { user: r.user, session: { user: r.user } }, error: null };
    },
    async signOut() { this._user = null; localStorage.removeItem('mock.user'); this._cbs.forEach(cb => cb('SIGNED_OUT', null)); return { error: null }; },
  };
  window.__PM_SUPABASE_MOCK = {
    auth,
    from() { return { select: async () => { if (!navigator.onLine) throw new TypeError('Failed to fetch'); return window.pmBackend('select', { uid: auth._user && auth._user.id }); } }; },
    async rpc(n, { items }) { return window.pmBackend('push', { uid: auth._user && auth._user.id, items }); },
  };
};
const browser = await chromium.launch();
async function device(name, opts) {
  const ctx = await browser.newContext({ ...opts, serviceWorkers: 'block' });
  await ctx.exposeFunction('pmBackend', (op, a) => handle(op, a));
  await ctx.addInitScript(MOCK);
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL); await page.waitForTimeout(500);
  return { name, ctx, page, errs };
}
const st = p => p.evaluate(() => __pm.sync.status().state);
const names = p => p.evaluate(() => __pm.S.jobs.map(j => j.name).sort());
const syncNow = async p => { await p.evaluate(() => __pm.sync.syncNow('test')); await p.waitForTimeout(100); };
async function signIn(d, email, code = '123456') {
  await d.page.locator('#syncBtn').click();
  await d.page.fill('#acctEmail', email); await d.page.locator('[data-act=sendCode]').click();
  await d.page.waitForSelector('#acctCode');
  await d.page.fill('#acctCode', code); await d.page.locator('[data-act=verifyCode]').click();
  await d.page.waitForTimeout(400);
  if (await d.page.locator('#modal [data-act=closeModal]').count()) await d.page.locator('#modal [data-act=closeModal]').first().click();
}

const A = await device('ipad', { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true });
ok(await A.page.locator('#syncBtn').isVisible(), 'sync indicator visible in header when key configured');
ok((await st(A.page)) === 'signedout' && (await A.page.locator('#syncBtn .sl').innerText()).toUpperCase() === 'SIGN IN', 'starts signed out');
// local edit while signed out
await A.page.evaluate(() => { __pm.job().name = 'Arena'; });
await A.page.locator('.scr-card', { hasText: 'Center' }).click(); // commit → persist (clears seed flag)
await A.page.evaluate(() => { __pm.job().name = 'Arena'; });
await A.page.locator('.scr-card', { hasText: 'House Left' }).click();
// wrong code
await A.page.locator('#syncBtn').click();
await A.page.fill('#acctEmail', 'don@example.com'); await A.page.locator('[data-act=sendCode]').click();
await A.page.waitForSelector('#acctCode');
ok(backend.otps === 1, 'Send code calls signInWithOtp');
await A.page.screenshot({ path: OUT + 'ipad-sync-code-entry.png' });
await A.page.fill('#acctCode', '000000'); await A.page.locator('[data-act=verifyCode]').click(); await A.page.waitForTimeout(200);
ok((await A.page.locator('#acctMsg').innerText()).includes('invalid'), 'wrong code shows error');
await A.page.fill('#acctCode', '123456'); await A.page.locator('[data-act=verifyCode]').click(); await A.page.waitForTimeout(500);
ok((await st(A.page)) === 'synced', 'device A signed in → synced');
ok(backend.rows.size === 1 && [...backend.rows.values()][0].name === 'Arena', 'first sign-in uploads existing local job "Arena" (' + [...backend.rows.values()].map(r => r.name) + ')');
ok((await A.page.locator('.acct').innerText()).includes('don@example.com'), 'account panel shows signed-in email');
await A.page.locator('[data-act=closeModal]').click();
await A.page.screenshot({ path: OUT + 'ipad-sync-synced.png' });

// device B: fresh untouched sample → should not be duplicated
const B = await device('iphone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
await signIn(B, 'don@example.com');
ok(JSON.stringify(await names(B.page)) === '["Arena"]', 'device B pulls "Arena" and drops its untouched sample: ' + JSON.stringify(await names(B.page)));
ok(backend.rows.size === 1, 'untouched sample not uploaded (remote still 1 row)');
const idA = await A.page.evaluate(() => __pm.job().id), idB = await B.page.evaluate(() => __pm.job().id);
ok(idA === idB && /^[0-9a-f-]{36}$/.test(idA), 'same UUID job id on both devices');

// B edits → debounced push; A pulls
await B.page.evaluate(() => { __pm.job().screens[1].w = 3000; });
await B.page.locator('.scr-card', { hasText: 'Center' }).tap(); // commit → schedule(3s)
await sleep(3800);
ok([...backend.rows.values()][0].data.screens[1].w === 3000, 'debounced auto-sync pushed B\'s edit (Center width 3000)');
await A.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await sleep(400);
ok((await A.page.evaluate(() => __pm.job().screens[1].w)) === 3000, 'A pulls B\'s edit on visibilitychange');

// LWW conflict: A edits offline (older), B edits later & syncs → B wins
await A.ctx.setOffline(true); await sleep(100);
await A.page.evaluate(() => { const j = __pm.job(); j.screens[0].name = 'HL offline edit'; j.updated = Date.now(); });
await syncNow(A.page);
ok((await st(A.page)) === 'offline', 'offline indicator while offline');
await A.page.screenshot({ path: OUT + 'ipad-sync-offline.png' });
await sleep(30);
await B.page.evaluate(() => { const j = __pm.job(); j.screens[0].name = 'HL from iPhone'; j.updated = Date.now(); });
await syncNow(B.page);
await A.ctx.setOffline(false); await sleep(600);
ok((await A.page.evaluate(() => __pm.job().screens[0].name)) === 'HL from iPhone', 'conflict: newer remote edit wins over older offline edit (online event triggered sync)');
// A newer edit wins
await A.page.evaluate(() => { const j = __pm.job(); j.screens[0].name = 'HL final'; j.updated = Date.now(); });
await syncNow(A.page); await syncNow(B.page);
ok((await B.page.evaluate(() => __pm.job().screens[0].name)) === 'HL final', 'newer local edit pushes and wins on the other device');
// stale protection: B pushes an older timestamp → not written
const before = [...backend.rows.values()][0].name;
await B.page.evaluate(() => { const j = __pm.job(); j.name = 'Old'; j.updated = Date.now() - 86400000; });
await syncNow(B.page);
ok([...backend.rows.values()][0].name === before && (await names(B.page)).includes(before), 'older local copy is replaced by newer remote (no clobber)');

// create + delete with tombstones
await A.page.evaluate(() => { __pm.ACTIONS.newExample(); }); await sleep(100);
await A.page.evaluate(() => { const j = __pm.job(); j.name = 'Temp'; j.updated = Date.now(); delete j.seed; });
await syncNow(A.page); await syncNow(B.page);
ok((await names(B.page)).includes('Temp'), 'new job created on A appears on B');
await B.page.evaluate(async () => { const j = __pm.S.jobs.find(x => x.name === 'Temp'); __pm.S.currentJobId = j.id; __pm.render(); });
await B.page.locator('#jobBtn').tap(); await B.page.locator('[data-act=delJob]').tap(); await B.page.locator('#cOk').tap(); await sleep(100);
await B.page.locator('[data-act=closeModal]').tap().catch(() => {});
await syncNow(B.page);
const tempRow = [...backend.rows.values()].find(r => r.name === 'Temp');
ok(tempRow && tempRow.deleted === true, 'delete on B pushes a tombstone (deleted=true)');
ok((await B.page.evaluate(() => Object.keys(__pm.S.tombstones).length)) === 0, 'local tombstone cleared after upload');
await syncNow(A.page);
ok(!(await names(A.page)).includes('Temp'), 'tombstone removes the job on A');

// persistence of session + data across reload
await A.page.reload(); await A.page.waitForTimeout(600);
ok((await st(A.page)) === 'synced' && (await names(A.page)).length >= 1, 'after reload: still signed in and synced');

// a second user can't see Don's jobs; id collision gets re-keyed
const C = await device('ipad2', { viewport: { width: 1180, height: 820 } });
await C.page.evaluate(id => { const j = __pm.job(); j.id = id; __pm.S.currentJobId = id; j.name = 'Carol job'; j.updated = Date.now(); delete j.seed; }, idA);
await signIn(C, 'carol@example.com'); await sleep(2000);
const carolRows = [...backend.rows.values()].filter(r => r.owner !== backend.users['don@example.com']);
ok(!(await names(C.page)).includes('Arena'), 'other account does not receive Don\'s jobs');
ok(carolRows.length === 1 && carolRows[0].id !== idA && carolRows[0].name === 'Carol job', 'id collision with another account → re-keyed and uploaded');

// sign out keeps local data
await A.page.locator('#syncBtn').click(); await A.page.locator('[data-act=signOut]').click(); await sleep(200);
ok((await st(A.page)) === 'signedout' && (await names(A.page)).length >= 1, 'sign out keeps jobs on device');
await A.page.locator('[data-act=closeModal]').click();

// iPhone screenshots
await B.page.evaluate(() => window.scrollTo(0, 0));
await B.page.screenshot({ path: OUT + 'iphone-sync-synced.png' });
await B.page.locator('#syncBtn').tap(); await sleep(150);
await B.page.screenshot({ path: OUT + 'iphone-sync-account.png' });
for (const d of [A, B, C]) ok(d.errs.length === 0, `no page errors on ${d.name} ${JSON.stringify(d.errs)}`);
await browser.close();
console.log(results.join('\n'));
