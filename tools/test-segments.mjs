// v1.4 unit tests: custom segments, fit warnings, migration, physical pitch, PowerPoint/Keynote slide math.  node tools/test-segments.mjs
import * as G from '../js/geometry.js';
import * as SL from '../js/slides.js';
import * as Store from '../js/store.js';
import assert from 'node:assert/strict';
const near = (a, b, e = 1e-3, m = '') => assert.ok(Math.abs(a - b) < e, `${m} ${a} != ${b}`);
let n = 0; const t = (name, fn) => { fn(); n++; };

// Don's TacoBell screen (real values from Don): Left 3510, Center 4320, Right 3510 (×1080) on an 11344×1080 output
const DON = () => ({ w: 11344, h: 1080, segMode: 'custom', segs: [
  { name: 'Left', x: 0, y: 0, w: 3510, h: 1080, pw: 52, ph: 16 }, { name: 'Center', x: 3510, y: 0, w: 4320, h: 1080, pw: 66, ph: 16 }, { name: 'Right', x: 7830, y: 0, w: 3510, h: 1080, pw: 52, ph: 16 }] });

t('legacy equal segments unchanged', () => {
  const COL = { w: 1536, h: 1280, segments: 6 };
  assert.equal(G.isCustomSegs(COL), false); assert.equal(G.segCount(COL), 6); assert.ok(G.hasSegs(COL));
  assert.deepEqual(G.segments(COL).map(s => s.cx), [128, 384, 640, 896, 1152, 1408]);
  assert.deepEqual(G.segments(COL).map(s => [s.y0, s.y1, s.cy]), Array(6).fill([0, 1280, 640]));
  assert.equal(G.segFit(COL).exact, true); assert.equal(G.hasSegs({ w: 10, h: 10, segments: 1 }), false);
  near(G.segments({ w: 11344, h: 1080, segments: 3 })[1].x0, 3781.333);
});
t('custom segment rects', () => {
  const s = DON(), g = G.segments(s);
  assert.deepEqual(g.map(x => [x.x0, x.x1, x.cx, x.cy]), [[0, 3510, 1755, 540], [3510, 7830, 5670, 540], [7830, 11340, 9585, 540]]);
  near(g[1].thirds[0], 4950); near(g[1].thirds[1], 6390);
  assert.equal(G.segCount(s), 3);
  const T = G.snapTargets(s); for (const v of [3510, 5670, 7830, 9585, 11340]) assert.ok(T.xs.includes(v), 'snap x ' + v);
  const rows = G.keyRows(s), c = rows.find(r => r.group.includes('Center') && r.group.startsWith('Segment 2') && r.label === 'Center');
  assert.deepEqual([c.x, c.y], [5670, 540]);
  assert.ok(!rows.some(r => r.group === 'Segment boundaries'));
  // center origin: display = internal − (W/2, H/2)
  const o = G.originOf(s, 'center'); assert.deepEqual([g[1].cx - o.x, g[1].cy - o.y], [-2, 0]);
});
t('fit: Don\'s 4 px short', () => {
  const f = G.segFit(DON());
  assert.equal(f.level, 'warn'); assert.equal(f.exact, false); assert.equal(f.totalW, 11340); assert.equal(f.badge, '4 px short');
  assert.equal(f.issues[0].text, 'Segments total 11340 px wide; screen is 11344 px — 4 px short (4 px unused on the right).');
  assert.equal(f.unused.length, 1); assert.deepEqual([f.unused[0].x0, f.unused[0].x1, f.unused[0].y0, f.unused[0].y1], [11340, 11344, 0, 1080]);
  assert.equal(f.overlaps.length, 0); assert.equal(f.outside.length, 0); assert.equal(f.unusedPx, 4 * 1080);
});
t('fit: exact fill → no warning', () => {
  const s = DON(); s.segs[1].w = 4324; G.autoPlaceSegs(s.segs);
  const f = G.segFit(s); assert.equal(f.exact, true); assert.equal(f.issues.length, 0); assert.equal(f.badge, '');
});
t('fit: height mismatch, overlap, past edge, gap between', () => {
  let s = DON(); s.segs[2].h = 1056;
  let f = G.segFit(s);
  assert.ok(f.issues.some(i => i.text === 'Right is 1056 px tall; screen is 1080 px (24 px short).'));
  assert.ok(f.issues.some(i => i.text.startsWith('3510 × 24 px unused below Right')), JSON.stringify(f.issues));
  assert.equal(f.badge, '4 px short · height mismatch');
  s = DON(); s.segs[1].x = 3500; s.segs[2].x = 7840;   // Center overlaps Left by 10; gap of 20 between Center and Right; Right runs 6 past
  f = G.segFit(s);
  assert.equal(f.level, 'error');
  assert.ok(f.issues.some(i => i.level === 'error' && i.text === 'Left and Center overlap by 10 × 1080 px (x 3500–3510).'), JSON.stringify(f.issues));
  assert.ok(f.issues.some(i => i.level === 'error' && i.text === 'Right extends 6 px past the right edge.'));
  assert.ok(f.issues.some(i => i.text.startsWith('20 × 1080 px unused between Center and Right')));
  assert.equal(f.overlaps[0].w, 10); assert.equal(f.outside[0].R, 6);
  s = DON(); s.segs[2].x = 20000; f = G.segFit(s); assert.ok(f.issues.some(i => i.text === 'Right is completely off the screen.'));
});
t('split / auto-place', () => {
  assert.deepEqual(G.splitEqualInt(11344, 1080, 3).map(g => [g.x, g.w]), [[0, 3782], [3782, 3781], [7563, 3781]]);
  assert.equal(G.segFit({ w: 11344, h: 1080, segMode: 'custom', segs: G.splitEqualInt(11344, 1080, 3) }).exact, true);
  const segs = [{ w: 100, h: 50 }, { w: 200, h: 80 }, { w: 50, h: 80 }]; G.autoPlaceSegs(segs, 4);
  assert.deepEqual(segs.map(g => [g.x, g.y]), [[0, 0], [104, 0], [308, 0]]);
  G.autoPlaceSegs(segs, 0, 80, 'bottom'); assert.deepEqual(segs.map(g => g.y), [30, 0, 0]);
});
t('uncovered area decomposition', () => {
  const u = G.uncovered(100, 50, [{ x0: 0, x1: 40, y0: 0, y1: 50 }, { x0: 60, x1: 100, y0: 0, y1: 30 }]);
  assert.equal(u.reduce((a, r) => a + r.w * r.h, 0), 20 * 50 + 40 * 20);
});
t('physical pitch', () => {
  const L = G.physInfo(3510, 1080, 52, 16, 'ft'), C = G.physInfo(4320, 1080, 66, 16, 'ft');
  near(L.pxPerUnitW, 67.5); near(L.pitchW, 4.5156); assert.equal(L.square, true);
  near(C.pxPerUnitW, 65.4545); near(C.pitchW, 4.6567); near(C.pxPerUnitH, 67.5); assert.equal(C.square, false);
  near(G.physInfo(1000, 500, 3.9, null, 'm').pitchW, 3.9); assert.equal(G.physInfo(10, 10, null, null), null);
});
t('migration: old job JSON (segments: N) → equal mode, no data lost; round trip of custom', () => {
  const old = { id: '00000000-0000-4000-8000-000000000001', name: 'Old', screens: [{ id: 'scr_a', name: 'Columns', w: 1536, h: 1280, segments: 6, boxes: [] }] };
  const j = Store.sanitizeJob(JSON.parse(JSON.stringify(old)));
  const s = j.screens[0];
  assert.equal(s.segMode, 'equal'); assert.equal(s.segments, 6); assert.deepEqual(s.segs, []); assert.equal(s.physUnit, 'ft'); assert.equal(s.pptCur, null);
  assert.deepEqual(G.segments(s).map(g => g.cx), [128, 384, 640, 896, 1152, 1408]);
  assert.equal(j.exportSettings.inc.unused, true);
  // custom job survives sanitize (load / import / cloud pull) intact, and mirrors `segments` = count for older app versions
  const d = { id: old.id, name: 'Taco', screens: [{ ...DON(), id: 'scr_1', name: 'Screen 1', segments: 1, pptCur: { w: 55.561, h: 5.28, unit: 'in' }, boxes: [] }] };
  const c = Store.sanitizeJob(JSON.parse(JSON.stringify(d))).screens[0];
  assert.equal(c.segMode, 'custom'); assert.equal(c.segments, 3);
  assert.deepEqual(c.segs.map(g => [g.name, g.x, g.y, g.w, g.h, g.pw, g.ph]), [['Left', 0, 0, 3510, 1080, 52, 16], ['Center', 3510, 0, 4320, 1080, 66, 16], ['Right', 7830, 0, 3510, 1080, 52, 16]]);
  assert.deepEqual(c.pptCur, { w: 55.561, h: 5.28, unit: 'in' });
  const again = Store.sanitizeJob(JSON.parse(JSON.stringify({ ...d, screens: [c] }))).screens[0];
  assert.deepEqual(again.segs, c.segs);
  // custom with no segments falls back to equal; switching back to equal keeps the custom list for later
  assert.equal(Store.sanitizeJob({ screens: [{ w: 100, h: 100, segMode: 'custom', segs: [] }] }).screens[0].segMode, 'equal');
  const eq = Store.sanitizeJob({ screens: [{ ...DON(), segMode: 'equal', segments: 2 }] }).screens[0];
  assert.equal(eq.segMode, 'equal'); assert.equal(eq.segs.length, 3); assert.equal(G.segCount(eq), 2);
});

// ---------- PowerPoint / Keynote ----------
t('PowerPoint reference: Widescreen 13.333 × 7.5 in = 1280×720 at 96 px/in', () => {
  const o = SL.pptOptions(1280, 720); assert.ok(o.fits); const p = o.options[0];
  assert.equal(p.key, 'native'); near(p.slideW, 13.3333); near(p.slideH, 7.5); assert.deepEqual(p.default96, [1280, 720]); assert.equal(p.winDpi, 96);
  const f = SL.pptOptions(1920, 1080).options[0]; near(f.slideW, 20); near(f.slideH, 11.25); near(f.slideWcm, 50.8);
});
t('11344×1080: 118.17 × 11.25 in exceeds 56 in → exact 1/3 and largest 56 × 5.331', () => {
  const o = SL.pptOptions(11344, 1080);
  near(o.nativeW, 118.1667); near(o.nativeH, 11.25); assert.ok(o.tooBig); assert.ok(!o.fits);
  const ex = o.options.find(p => p.key === 'exact'), mx = o.options.find(p => p.key === 'max');
  assert.equal(ex.N, 3); assert.ok(ex.recommended); near(ex.slideW, 39.3889); near(ex.slideH, 3.75); near(ex.pxPerIn, 288);
  assert.equal(ex.winExact, true); assert.equal(ex.winDpi, 288); assert.equal(ex.slideWemu, 36017200); assert.equal(ex.slideHemu, 3429000); assert.equal(ex.emuExact, true);
  assert.deepEqual(ex.default96, [3781, 360]); near(ex.slideWcm, 100.0478); near(ex.slideWpt, 2836);
  near(mx.slideW, 56); near(mx.slideH, 5.33145, 1e-4); near(mx.k, 0.473907, 1e-5); near(mx.pxPerIn, 202.5714, 1e-3);
  near(mx.slideWcm, 142.24); near(mx.slideHcm, 13.5419, 1e-3); near(mx.slideWpt, 4032); near(mx.slideHpt, 383.8646, 1e-3);
  assert.equal(mx.slideWemu, 51206400); assert.equal(mx.winExact, false); assert.equal(mx.winCeilDpi, 203); assert.deepEqual(mx.winCeilPx, [11368, 1082]);
  assert.equal(SL.f3(mx.slideH), '5.331');
});
t('segments on the slide (inches / cm / pt)', () => {
  const ex = SL.pptOptions(11344, 1080).options.find(p => p.key === 'exact');
  const c = SL.onSlide(ex, { name: 'Center', x: 3510, y: 0, w: 4320, h: 1080 });
  near(c.left.in, 12.1875); near(c.width.in, 15); near(c.height.in, 3.75); near(c.left.cm, 30.95625); near(c.left.pt, 877.5); assert.equal(c.left.emu, 11144250);
  const mx = SL.pptOptions(11344, 1080).options.find(p => p.key === 'max');
  const r = SL.onSlide(mx, { name: 'Right', x: 7830, y: 0, w: 3510, h: 1080 });
  near(r.left.in, 7830 / 202.5714, 1e-3); near(r.width.in, 17.3272, 1e-3);
});
t('small / impossible sizes', () => {
  const o = SL.pptOptions(64, 64); assert.ok(o.tooSmall); assert.equal(o.options[0].M, 2); near(o.options[0].slideW, 1.3333); assert.equal(o.options[0].winDpi, 48);
  assert.ok(SL.pptOptions(20000, 100).impossible); assert.equal(SL.pptOptions(20000, 100).options.length, 0);
  assert.ok(SL.pptOptions(5376, 96).fits);   // exactly 56 × 1 in
});
t('Keynote', () => {
  const k = SL.keynotePlan(11344, 1080); assert.equal(k.N, 2); assert.equal(k.ptW, 5672); assert.equal(k.ptH, 540); assert.ok(k.whole);
  assert.deepEqual(SL.keynoteRect(k, { x: 3510, y: 0, w: 4320, h: 1080 }), { name: undefined, x: 1755, y: 0, w: 2160, h: 540 });
  const k1 = SL.keynotePlan(1920, 1080); assert.equal(k1.N, 1); assert.ok(k1.fits);
  assert.equal(SL.keynotePlan(8192, 100).N, 1); const k3 = SL.keynotePlan(8193, 100); assert.equal(k3.N, 2); assert.equal(k3.whole, false);   // no whole-point 1/N nearby → 1/2, flagged
  assert.equal(SL.keynotePlan(16000, 1000).N, 2); assert.equal(SL.keynotePlan(9000, 1005).N, 3);   // 1005/2 not whole → first N dividing both (3000 × 335)
});
t('Don\'s current slide 55.561 × 5.28 in vs 11344×1080', () => {
  const c = SL.compareCurrent(11344, 1080, { w: 55.561, h: 5.28, unit: 'in' });
  near(c.slideAspect, 10.5229, 1e-4); near(c.screenAspect, 10.5037, 1e-4); assert.equal(c.match, false); near(c.diffPct, 0.1829, 1e-3);
  assert.equal(c.fitBy, 'width'); near(c.pxPerIn, 204.172, 1e-3); near(c.imgH, 1078.03, 1e-2); assert.equal(c.barsPx.side, 'top/bottom'); near(c.barsPx.each, 0.986, 1e-3);
  near(c.keepWidthH, 5.28966, 1e-4); near(c.keepHeightW, 55.4596, 1e-4);
  near(10.5, 11340 / 1080);   // Don's segments total 11340 → 10.5:1
  const q = SL.onCurrent(c, { name: 'Center', x: 3510, y: 0, w: 4320, h: 1080 });
  near(q.left.in, 17.1914, 1e-3); near(q.width.in, 21.1586, 1e-3); near(q.top.in, -0.00483, 1e-4);
  const cm = SL.compareCurrent(11344, 1080, { w: 141.125, h: 13.411, unit: 'cm' }); near(cm.cw, 55.561, 1e-3);
  assert.ok(SL.compareCurrent(11344, 1080, { w: 39.3889, h: 3.75, unit: 'in' }).match);
});
t('CSV summary', () => {
  const s = DON(), o = SL.pptOptions(s.w, s.h), p = o.options[0], kp = SL.keynotePlan(s.w, s.h);
  const rows = SL.summaryRows(s, p, kp, G.segments(s).map(g => ({ name: g.name, x: g.x0, y: g.y0, w: g.w, h: g.h })), 'in');
  assert.deepEqual(rows[1].slice(0, 5), ['Slide', '0', '0', '39.389', '3.75']);
  assert.deepEqual(rows[3].slice(0, 5), ['Center', '12.188', '0', '15', '3.75']);
  assert.deepEqual(rows[3].slice(13), ['1755', '0', '2160', '540']);
  assert.ok(SL.toCsv([['a,b', 'c']]).startsWith('"a,b",c'));
});
console.log(`segment + slide tests passed (${n} groups)`);
