// ShowCrew PixelMap — offline-first Supabase sync.
// localStorage stays the source of truth. When online + signed in, jobs are pulled and pushed:
// last-write-wins per job on `updated` (ms) ⇄ `updated_at`, soft-delete tombstones, uploads local jobs on first sign-in.
// Sign-in (v1.3, same as ShowCrew GearVault): email + password, then a TOTP authenticator code (Supabase MFA).
// First sign-in enrolls the authenticator (QR + secret); every sign-in after that is challenged. Sync only runs at aal2,
// and the database RLS also requires aal2, so a password-only session can't read or write any job.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import * as Store from './store.js';

export const syncConfigured = /^https:\/\//.test(SUPABASE_URL) && /^sb_publishable_\w/.test(SUPABASE_PUBLISHABLE_KEY || '');
const VENDOR = './vendor/supabase-js-2.117.2.umd.js';
const DEBOUNCE_MS = 3000, PERIODIC_MS = 120000;

function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.supabase && window.supabase.createClient) return res();
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = () => res(); s.onerror = () => rej(new Error('Could not load sync library')); document.head.appendChild(s);
  });
}
const iso = ms => new Date(ms).toISOString();

/**
 * createSync({ getS, save, onChange, onStatus })
 *  getS(): app state {jobs, currentJobId, tombstones, sync}
 *  save(): persist state now; onChange(): re-render after remote changes; onStatus(state): header indicator;
 *  onRecovery(): a password-reset link was opened (show the account panel).
 */
export function createSync({ getS, save, onChange, onStatus, onRecovery }) {
  // step: 'signin' (no session) · 'enroll' (aal1, no verified authenticator) · 'challenge' (aal1, has one) · 'newpw' (aal2 after a reset link) · 'done' (aal2)
  const st = { state: 'signedout', detail: '', user: null, client: null, timer: 0, running: false, again: false, lastSync: 0,
    step: 'signin', aal: null, recovery: false, factors: [], enroll: null };
  const set = (state, detail = '') => { st.state = state; st.detail = detail; onStatus && onStatus(api.status()); };

  async function client() {
    if (st.client) return st.client;
    if (window.__PM_SUPABASE_MOCK) { st.client = window.__PM_SUPABASE_MOCK; return st.client; } // tests
    await loadScript(VENDOR);
    st.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'showcrew.pixelmap.auth' },
    });
    return st.client;
  }

  /** Re-read session + assurance level and work out the next sign-in step. */
  async function refreshAuth() {
    const c = await client();
    const { data } = await c.auth.getSession();
    const session = data && data.session;
    st.user = session ? session.user : null;
    if (!st.user) { st.aal = null; st.factors = []; st.enroll = null; st.step = 'signin'; return st.step; }
    const { data: aal, error } = await c.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    st.aal = aal.currentLevel;
    if (aal.currentLevel === 'aal2') { st.enroll = null; st.step = st.recovery ? 'newpw' : 'done'; }
    else if (aal.nextLevel === 'aal2') {
      st.step = 'challenge';
      const { data: list } = await c.auth.mfa.listFactors();
      st.factors = ((list && list.totp) || []).filter(f => f.status === 'verified').map(f => ({ id: f.id, name: f.friendly_name || 'Authenticator' }));
    } else st.step = 'enroll';
    return st.step;
  }
  /** Status after an auth change: sync when fully signed in, otherwise show what's needed. */
  async function afterAuth(reason) {
    const step = await refreshAuth();
    if (step === 'done') return syncNow(reason);
    set(step === 'signin' ? (navigator.onLine ? 'signedout' : 'offline') : 'mfa');
  }

  async function init() {
    if (!syncConfigured) return;
    try {
      const c = await client();
      c.auth.onAuthStateChange((ev, session) => {
        if (ev === 'PASSWORD_RECOVERY') { st.recovery = true; onRecovery && setTimeout(onRecovery, 0); }
        if (ev === 'INITIAL_SESSION') return;
        if (!session) { st.user = null; st.aal = null; st.step = 'signin'; st.enroll = null; set(navigator.onLine ? 'signedout' : 'offline'); return; }
        // Don't call back into supabase-js from inside this callback (it can deadlock) — defer.
        const was = st.user && st.user.id, wasAal = st.aal;
        setTimeout(async () => {
          try {
            const step = await refreshAuth();
            if (step === 'done') { if (was !== st.user.id || wasAal !== 'aal2') schedule(0); else onStatus && onStatus(api.status()); }
            else set('mfa');
          } catch (e) { console.warn('auth refresh failed', e); }
        }, 0);
      });
      await afterAuth('open');
    } catch (e) {
      // Library failed to load (offline first run) — app keeps working locally.
      set(navigator.onLine ? 'error' : 'offline', e.message);
    }
    window.addEventListener('online', () => schedule(0));
    window.addEventListener('offline', () => set(st.user ? 'offline' : 'signedout'));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(0); });
    setInterval(() => { if (document.visibilityState === 'visible') schedule(0); }, PERIODIC_MS);
  }

  function schedule(ms = DEBOUNCE_MS) {
    if (!syncConfigured) return;
    clearTimeout(st.timer); st.timer = setTimeout(() => syncNow('auto'), ms);
  }

  async function syncNow(reason = 'manual') {
    if (!syncConfigured) return;
    if (st.running) { st.again = true; return; }
    if (!st.client) { try { await client(); } catch (e) { return set('offline', e.message); } }
    if (!st.user) return set(navigator.onLine ? 'signedout' : 'offline');
    if (st.aal !== 'aal2' || st.step !== 'done') return set(navigator.onLine ? 'mfa' : 'offline');   // password-only session: no data access
    if (!navigator.onLine) return set('offline');
    st.running = true; set('syncing');
    try {
      const S = getS(); S.tombstones = S.tombstones || {}; S.sync = S.sync || {};
      // Different account than last time on this device → treat all local jobs as new uploads for this account.
      if (S.sync.userId && S.sync.userId !== st.user.id) S.sync = {};
      const { data: rows, error } = await st.client.from('jobs').select('id,name,data,updated_at,deleted');
      if (error) throw error;
      const remote = new Map(rows.map(r => [r.id, r]));
      const remoteLive = rows.some(r => !r.deleted);
      const push = []; let changed = false;
      const fromRemote = r => { const j = Store.sanitizeJob(Object.assign({}, r.data, { id: r.id })); j.updated = Date.parse(r.updated_at); delete j.seed; return j; };

      // local jobs vs remote
      for (let i = S.jobs.length - 1; i >= 0; i--) {
        const j = S.jobs[i], r = remote.get(j.id);
        if (!r) {
          if (j.seed && remoteLive) continue;   // untouched sample job: don't duplicate it into an account that has jobs
          push.push({ id: j.id, name: j.name, data: j, updated_at: iso(j.updated), deleted: false }); continue;
        }
        const rt = Date.parse(r.updated_at);
        if (rt > j.updated) {
          if (r.deleted) S.jobs.splice(i, 1); else S.jobs[i] = fromRemote(r);
          changed = true;
        } else if (j.updated > rt) push.push({ id: j.id, name: j.name, data: j, updated_at: iso(j.updated), deleted: false });
      }
      // local tombstones
      for (const [id, t] of Object.entries(S.tombstones)) {
        const r = remote.get(id);
        if (!r || r.deleted) { delete S.tombstones[id]; continue; }      // never uploaded / already deleted remotely
        if (Date.parse(r.updated_at) > t) { delete S.tombstones[id]; if (!S.jobs.some(j => j.id === id)) { S.jobs.push(fromRemote(r)); changed = true; } }
        else push.push({ id, name: r.name, data: {}, updated_at: iso(t), deleted: true });
      }
      // remote-only jobs
      const localIds = new Set(S.jobs.map(j => j.id));
      for (const r of rows) if (!r.deleted && !localIds.has(r.id) && !S.tombstones[r.id]) { S.jobs.push(fromRemote(r)); changed = true; }
      // drop an untouched local sample once real remote jobs arrived
      if (remoteLive && S.jobs.length > 1) { const before = S.jobs.length; S.jobs = S.jobs.filter(j => !(j.seed && !remote.has(j.id))); if (S.jobs.length !== before) changed = true; }

      let denied = 0, stale = 0;
      if (push.length) {
        const { data: res, error: perr } = await st.client.rpc('push_jobs', { items: push });
        if (perr) throw perr;
        for (const r of res || []) {
          if (r.status === 'ok') { if (S.tombstones[r.id]) delete S.tombstones[r.id]; const j = S.jobs.find(x => x.id === r.id); if (j && j.seed) delete j.seed; }
          else if (r.status === 'stale') stale++;
          else {
            // id taken by a row we can't write (e.g. another account) → give the local job a fresh id, retry next round
            denied++; const j = S.jobs.find(x => x.id === r.id);
            if (j) { const nid = Store.newJobId(); if (S.currentJobId === j.id) S.currentJobId = nid; j.id = nid; changed = true; }
            else delete S.tombstones[r.id];
          }
        }
      }
      if (!S.jobs.length) { const j = Store.exampleJob(); S.jobs.push(j); changed = true; }
      if (!S.jobs.some(j => j.id === S.currentJobId)) { S.currentJobId = S.jobs[0].id; changed = true; }
      S.sync.userId = st.user.id; S.sync.lastSync = Date.now(); st.lastSync = S.sync.lastSync;
      save(); if (changed) onChange && onChange();
      if (stale || denied) st.again = true;
      set('synced', `${rows.length} remote · ${push.length} pushed${stale ? ` · ${stale} stale` : ''}${denied ? ` · ${denied} re-keyed` : ''}`);
    } catch (e) {
      console.warn('sync failed', e);
      set(navigator.onLine ? 'error' : 'offline', e.message || String(e));
    } finally {
      st.running = false;
      if (st.again) { st.again = false; schedule(1500); }
    }
  }

  const redirectTo = () => location.origin + location.pathname;
  const need = (step) => { if (st.step !== step) throw new Error('Sign-in step changed — please try again.'); };
  const api = {
    configured: syncConfigured, init, schedule, syncNow, refreshAuth,
    status: () => ({ state: st.state, detail: st.detail, email: st.user ? st.user.email : '', signedIn: st.step === 'done',
      step: st.step, aal: st.aal, recovery: st.recovery, factors: st.factors, enroll: st.enroll,
      lastSync: st.lastSync || (getS().sync || {}).lastSync || 0 }),
    /** Email + password. Resolves with the next step ('enroll' | 'challenge' | 'done'). */
    async signIn(email, password) {
      const c = await client();
      const { error } = await c.auth.signInWithPassword({ email: String(email).trim(), password });
      if (error) throw error;
      await afterAuth('signin'); return st.step;
    },
    /** Optional self sign-up (only when ALLOW_SIGNUP). Resolves true when a confirmation email was sent. */
    async signUp(email, password) {
      const c = await client();
      const { data, error } = await c.auth.signUp({ email: String(email).trim(), password, options: { emailRedirectTo: redirectTo() } });
      if (error) throw error;
      if (data.session) { await afterAuth('signup'); return false; }
      return true;
    },
    /** First sign-in: create a TOTP factor. Drops half-finished ones so a fresh QR code is issued. */
    async startEnroll() {
      const c = await client(); need('enroll');
      const { data: list } = await c.auth.mfa.listFactors();
      for (const f of ((list && list.all) || []).filter(x => x.factor_type === 'totp' && x.status !== 'verified')) await c.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await c.auth.mfa.enroll({ factorType: 'totp', friendlyName: `PixelMap ${new Date().toISOString().slice(0, 16)}`, issuer: 'ShowCrew PixelMap' });
      if (error) throw error;
      st.enroll = { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
      onStatus && onStatus(api.status());
      return st.enroll;
    },
    async verifyEnroll(code) {
      const c = await client();
      if (!st.enroll) throw new Error('Start the authenticator setup first.');
      const { error } = await c.auth.mfa.challengeAndVerify({ factorId: st.enroll.id, code: String(code).replace(/\s+/g, '') });
      if (error) throw error;
      st.enroll = null; await afterAuth('enrolled'); return st.step;
    },
    /** Every sign-in after enrollment: challenge + verify the 6-digit code → aal2. */
    async verifyCode(code, factorId) {
      const c = await client(); need('challenge');
      const id = factorId || (st.factors[0] && st.factors[0].id);
      if (!id) throw new Error('No verified authenticator on this account.');
      const { data: ch, error: e1 } = await c.auth.mfa.challenge({ factorId: id });
      if (e1) throw e1;
      const { error: e2 } = await c.auth.mfa.verify({ factorId: id, challengeId: ch.id, code: String(code).replace(/\s+/g, '') });
      if (e2) throw e2;
      await afterAuth('verified'); return st.step;
    },
    async resetPassword(email) {
      const c = await client();
      const { error } = await c.auth.resetPasswordForEmail(String(email).trim(), { redirectTo: redirectTo() });
      if (error) throw error;
    },
    /** After a reset link + authenticator code (aal2): set the new password. */
    async updatePassword(pw) {
      const c = await client();
      const { error } = await c.auth.updateUser({ password: pw });
      if (error) throw error;
      st.recovery = false;
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
      await afterAuth('password'); return st.step;
    },
    async signOut() {
      const c = await client(); await c.auth.signOut();
      st.user = null; st.aal = null; st.step = 'signin'; st.enroll = null; st.factors = []; st.recovery = false;
      set(navigator.onLine ? 'signedout' : 'offline');
    },
  };
  return api;
}
