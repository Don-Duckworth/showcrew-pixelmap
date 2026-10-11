// In-memory Supabase stand-in for the browser tests (no real project needed).
// Node side: createBackend() → { backend, handle } — shared by every browser context via exposeFunction('pmBackend').
// Browser side: MOCK (an addInitScript function) installs window.__PM_SUPABASE_MOCK, which sync.js uses instead of supabase-js.
// Mirrors: password sign-in, TOTP MFA (valid code 246810), aal1/aal2 sessions, reset email, sign-up,
// and the database rules from supabase/schema.sql (owner-only rows, aal2 required, push_jobs LWW).
export const TOTP_OK = '246810';
export function createBackend() {
  const backend = { users: {}, rows: new Map(), resets: [], enrolls: 0, signups: 0, selects: 0, pushes: 0, aal1Denied: 0, nf: 0 };
  const uid = () => `0000000${Object.keys(backend.users).length + 1}-0000-4000-a000-000000000000`;
  backend.addUser = (email, pw) => (backend.users[email] = { id: uid(), email, pw, factors: [] });
  const pub = u => ({ id: u.id, email: u.email, factors: u.factors.map(f => ({ ...f })) });
  function handle(op, a) {
    const u = a && a.email ? backend.users[a.email] : null;
    switch (op) {
      case 'signin':
        if (!u || u.pw !== a.password) return { error: 'Invalid login credentials' };
        return { user: pub(u) };
      case 'signup':
        backend.signups++; if (u) return { error: 'User already registered' };
        backend.addUser(a.email, a.password); return { confirm: true };
      case 'reset': backend.resets.push(a.email); return {};
      case 'user': return { user: u ? pub(u) : null };
      case 'enroll': {
        backend.enrolls++; const f = { id: `f-${++backend.nf}`, factor_type: 'totp', status: 'unverified', friendly_name: a.name };
        u.factors.push(f); return { factor: f, secret: 'JBSWY3DPEHPK3PXP' + backend.nf };
      }
      case 'unenroll': u.factors = u.factors.filter(f => f.id !== a.factorId); return {};
      case 'verify': {
        const f = u.factors.find(x => x.id === a.factorId);
        if (!f) return { error: 'Factor not found' };
        if (a.code !== TOTP_OK) return { error: 'Invalid TOTP code entered' };
        f.status = 'verified'; return { user: pub(u) };
      }
      case 'setpw': u.pw = a.password; return {};
    }
    // data API — owner-only + restrictive aal2, like the real RLS
    if (!a.uid) return { data: null, error: { message: 'not authenticated' } };
    if (a.aal !== 'aal2') {
      backend.aal1Denied++;
      if (op === 'select') return { data: [], error: null };            // RLS: rows filtered out
      return { data: null, error: { message: 'two-factor authentication required (aal2)', code: '42501' } };
    }
    if (op === 'select') { backend.selects++; return { data: [...backend.rows.values()].filter(r => r.owner === a.uid).map(({ owner, ...r }) => r), error: null }; }
    if (op === 'push') {
      backend.pushes++;
      return { data: a.items.map(it => {
        const ex = backend.rows.get(it.id);
        if (ex && ex.owner !== a.uid) return { id: it.id, status: 'denied: new row violates row-level security policy', updated_at: null };
        if (ex && !(Date.parse(ex.updated_at) < Date.parse(it.updated_at))) return { id: it.id, status: 'stale', updated_at: ex.updated_at };
        backend.rows.set(it.id, { id: it.id, owner: a.uid, name: it.name, data: it.data, updated_at: it.updated_at, deleted: !!it.deleted });
        return { id: it.id, status: 'ok', updated_at: it.updated_at };
      }), error: null };
    }
    return { error: 'unknown op ' + op };
  }
  return { backend, handle };
}

export const MOCK = () => {
  const B = (op, a) => window.pmBackend(op, a);
  const KEY = 'mock.session';
  const err = m => ({ message: m });
  const auth = {
    _s: JSON.parse(localStorage.getItem(KEY) || 'null'), _cbs: [], calls: [],
    _save(s, ev) { this._s = s; if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); this._cbs.forEach(cb => cb(ev, s ? { user: s.user } : null)); },
    async _refreshUser() { if (!this._s) return; const r = await B('user', { email: this._s.user.email }); if (r.user) { this._s.user = r.user; localStorage.setItem(KEY, JSON.stringify(this._s)); } },
    async getSession() { return { data: { session: this._s ? { user: this._s.user } : null }, error: null }; },
    onAuthStateChange(cb) { this._cbs.push(cb); setTimeout(() => cb('INITIAL_SESSION', this._s ? { user: this._s.user } : null), 0); return { data: { subscription: { unsubscribe() {} } } }; },
    async signInWithPassword({ email, password }) {
      this.calls.push('signInWithPassword');
      const r = await B('signin', { email, password }); if (r.error) return { data: {}, error: err(r.error) };
      this._save({ user: r.user, aal: 'aal1' }, 'SIGNED_IN'); return { data: { user: r.user, session: { user: r.user } }, error: null };
    },
    async signUp({ email, password }) { this.calls.push('signUp'); const r = await B('signup', { email, password }); return r.error ? { data: {}, error: err(r.error) } : { data: { user: null, session: null }, error: null }; },
    async signInWithOtp() { this.calls.push('signInWithOtp'); return { error: null }; },
    async verifyOtp() { this.calls.push('verifyOtp'); return { data: {}, error: err('not used') }; },
    async resetPasswordForEmail(email, opts) { this.calls.push('resetPasswordForEmail:' + (opts && opts.redirectTo)); await B('reset', { email }); return { data: {}, error: null }; },
    async updateUser({ password }) {
      this.calls.push('updateUser');
      if (!this._s || this._s.aal !== 'aal2') return { data: {}, error: err('AAL2 required to update password') };
      await B('setpw', { email: this._s.user.email, password }); this._save(this._s, 'USER_UPDATED'); return { data: { user: this._s.user }, error: null };
    },
    async signOut() { this.calls.push('signOut'); this._save(null, 'SIGNED_OUT'); return { error: null }; },
    // test helper: what a password-reset link does (signs in at aal1 + PASSWORD_RECOVERY)
    async _recoveryLink(email) { const r = await B('user', { email }); this._save({ user: r.user, aal: 'aal1' }, 'SIGNED_IN'); this._cbs.forEach(cb => cb('PASSWORD_RECOVERY', { user: r.user })); },
    mfa: {
      async getAuthenticatorAssuranceLevel() {
        const s = auth._s; if (!s) return { data: { currentLevel: null, nextLevel: null }, error: null };
        const verified = (s.user.factors || []).some(f => f.status === 'verified');
        return { data: { currentLevel: s.aal, nextLevel: verified ? 'aal2' : 'aal1' }, error: null };
      },
      async listFactors() {
        await auth._refreshUser(); const all = auth._s ? auth._s.user.factors : [];
        return { data: { all, totp: all.filter(f => f.factor_type === 'totp' && f.status === 'verified') }, error: null };
      },
      async enroll({ factorType, friendlyName, issuer }) {
        auth.calls.push('enroll:' + issuer);
        const r = await B('enroll', { email: auth._s.user.email, name: friendlyName }); await auth._refreshUser();
        const uri = `otpauth://totp/${issuer}:${auth._s.user.email}?secret=${r.secret}`;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#fff"/><rect x="1" y="1" width="3" height="3"/><rect x="6" y="1" width="3" height="3"/><rect x="1" y="6" width="3" height="3"/><rect x="5" y="5" width="2" height="2"/></svg>`;
        return { data: { id: r.factor.id, type: 'totp', totp: { qr_code: 'data:image/svg+xml;utf-8,' + encodeURIComponent(svg), secret: r.secret, uri } }, error: null };
      },
      async unenroll({ factorId }) { auth.calls.push('unenroll'); await B('unenroll', { email: auth._s.user.email, factorId }); await auth._refreshUser(); return { data: {}, error: null }; },
      async challenge({ factorId }) { auth.calls.push('challenge'); return { data: { id: 'ch-' + factorId }, error: null }; },
      async verify({ factorId, challengeId, code }) {
        auth.calls.push('verify');
        if (challengeId !== 'ch-' + factorId) return { data: null, error: err('bad challenge') };
        const r = await B('verify', { email: auth._s.user.email, factorId, code }); if (r.error) return { data: null, error: err(r.error) };
        auth._s.user = r.user; auth._save({ user: r.user, aal: 'aal2' }, 'MFA_CHALLENGE_VERIFIED'); return { data: {}, error: null };
      },
      async challengeAndVerify({ factorId, code }) { const { data: ch } = await this.challenge({ factorId }); return this.verify({ factorId, challengeId: ch.id, code }); },
    },
  };
  const who = () => ({ uid: auth._s && auth._s.user.id, aal: auth._s && auth._s.aal });
  window.__PM_SUPABASE_MOCK = {
    auth,
    from() { return { select: async () => { if (!navigator.onLine) throw new TypeError('Failed to fetch'); return B('select', who()); } }; },
    async rpc(n, { items }) { return B('push', { ...who(), items }); },
  };
};
