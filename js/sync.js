// ShowCrew PixelMap — offline-first Supabase sync.
// localStorage stays the source of truth. When online + signed in, jobs are pulled and pushed:
// last-write-wins per job on `updated` (ms) ⇄ `updated_at`, soft-delete tombstones, uploads local jobs on first sign-in.
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
 *  save(): persist state now; onChange(): re-render after remote changes; onStatus(state): header indicator.
 */
export function createSync({ getS, save, onChange, onStatus }) {
  const st = { state: 'signedout', detail: '', user: null, client: null, ready: null, timer: 0, running: false, again: false, lastSync: 0, pendingEmail: '' };
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

  async function init() {
    if (!syncConfigured) return;
    try {
      const c = await client();
      const { data } = await c.auth.getSession();
      st.user = data && data.session ? data.session.user : null;
      c.auth.onAuthStateChange((ev, session) => {
        const was = st.user && st.user.id;
        st.user = session ? session.user : null;
        if (!st.user) { set(navigator.onLine ? 'signedout' : 'offline'); return; }
        if (ev === 'SIGNED_IN' && was !== st.user.id) schedule(0);
      });
      if (st.user) await syncNow('open'); else set(navigator.onLine ? 'signedout' : 'offline');
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
    if (!st.user) return set('signedout');
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

  const api = {
    configured: syncConfigured, init, schedule, syncNow,
    status: () => ({ state: st.state, detail: st.detail, email: st.user ? st.user.email : '', lastSync: st.lastSync || (getS().sync || {}).lastSync || 0, pendingEmail: st.pendingEmail }),
    async sendCode(email) {
      const c = await client(); st.pendingEmail = email.trim().toLowerCase();
      const { error } = await c.auth.signInWithOtp({ email: st.pendingEmail, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } });
      if (error) throw error;
    },
    async verifyCode(token, email = st.pendingEmail) {
      const c = await client();
      const { data, error } = await c.auth.verifyOtp({ email, token: String(token).replace(/\s+/g, ''), type: 'email' });
      if (error) throw error;
      st.user = data.user || (data.session && data.session.user); st.pendingEmail = '';
      await syncNow('signin');
    },
    async signOut() {
      const c = await client(); await c.auth.signOut(); st.user = null; set('signedout');
    },
  };
  return api;
}
