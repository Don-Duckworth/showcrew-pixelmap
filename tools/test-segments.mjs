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

// ---------- v1.5: slide size → pixels, duplicate/resize keeping segments ----------
t('slide size → px (Don: 55.561 × 5.28 in)', () => {
  let r = SL.slideToPx(55.561, 5.28, 'in', 'ppi', 96);
  near(r.exW, 5333.856); near(r.exH, 506.88); assert.equal(r.w, 5334); assert.equal(r.h, 507); assert.equal(r.ppi, 96); assert.equal(r.outOfRange, false);
  r = SL.slideToPx(55.561, 5.28, 'in', 'width', 11344);
  assert.equal(r.w, 11344); assert.equal(r.h, 1078); near(r.exH, 1078.028, 1e-3); near(r.ppi, 204.172, 1e-3);
  r = SL.slideToPx(13.333, 7.5, 'in', 'ppi', 96); assert.deepEqual([r.w, r.h], [1280, 720]);
  r = SL.slideToPx(33.867, 19.05, 'cm', 'ppi', 96); assert.deepEqual([r.w, r.h], [1280, 720]);
  r = SL.slideToPx(141.125, 13.411, 'cm', 'width', 11344); assert.deepEqual([r.w, r.h], [11344, 1078]);
  r = SL.slideToPx(39.3889, 3.75, 'in', 'ppi', 288); assert.deepEqual([r.w, r.h], [11344, 1080]);
  assert.ok(SL.slideToPx(60, 5, 'in').outOfRange); assert.equal(SL.slideToPx(0, 5), null); assert.equal(SL.slideToPx(5, 5, 'in', 'ppi', -1), null);
  assert.equal(SL.slideLabel(55.561, 5.28), '55.561x5.28');
});
const segsOf = c => c.segs.map(g => [g.x, g.w, g.h]);
t('resize: scale proportionally (Don → 5334×507 @ 96 px/in)', () => {
  const s = { ...DON(), boxes: [{ id: 'b1', name: 'PiP', x: 4710, y: 0, w: 1920, h: 1080 }] }, before = JSON.stringify(s);
  const c = G.resizeScreen(s, 5334, 507);
  assert.equal(JSON.stringify(s), before, 'input untouched');
  assert.deepEqual([c.w, c.h], [5334, 507]);
  assert.deepEqual(segsOf(c), [[0, 1650, 507], [1650, 2032, 507], [3682, 1650, 507]]);   // 3510·f=1650.4, 7830·f=3681.7, 11340·f=5332.1
  assert.ok(c.segs.every((g, i) => i === 0 || g.x === c.segs[i - 1].x + c.segs[i - 1].w), 'still butted');
  const f = G.segFit(c); assert.equal(f.badge, '2 px short'); assert.equal(f.overlaps.length, 0);   // original 4 px gap scaled to 2 px
  assert.deepEqual(c.segs.map(g => [g.name, g.pw, g.ph]), [['Left', 52, 16], ['Center', 66, 16], ['Right', 52, 16]], 'physical feet kept');
  assert.deepEqual([c.boxes[0].x, c.boxes[0].y, c.boxes[0].w, c.boxes[0].h], [2215, 0, 902, 507]);
});
t('resize: target width 11344 → 11344×1078 keeps widths, heights follow', () => {
  const c = G.resizeScreen(DON(), 11344, 1078);
  assert.deepEqual(segsOf(c), [[0, 3510, 1078], [3510, 4320, 1078], [7830, 3510, 1078]]); assert.equal(G.segFit(c).badge, '4 px short');
});
t('resize: rounding never creates new gaps/overlaps, never erases an original gap', () => {
  // an exactly-filling 3-way split scaled to awkward sizes stays exact
  for (const [W, H] of [[5334, 507], [1001, 77], [7, 3], [99999, 12345]]) {
    const ex = { w: 11344, h: 1080, segMode: 'custom', segs: G.splitEqualInt(11344, 1080, 3) };
    const c = G.resizeScreen(ex, W, H); assert.ok(G.segFit(c).exact, `exact fill kept at ${W}×${H}: ${JSON.stringify(segsOf(c))}`);
  }
  // 13 butted segments of odd widths
  const odd = { w: 1000, h: 100, segMode: 'custom', segs: Array.from({ length: 13 }, (_, i) => ({ name: 'S' + i, x: 0, y: 0, w: 70 + (i % 5) * 3, h: 100 })) };
  G.autoPlaceSegs(odd.segs); const tot = odd.segs.reduce((a, g) => a + g.w, 0); odd.w = tot;
  for (const W of [333, 517, 1999]) { const c = G.resizeScreen(odd, W, 50); assert.ok(G.segFit(c).exact, 'odd exact at ' + W); }
  // a 1 px original gap shrunk ×0.1 doesn't round away; a 10 px overlap stays an overlap
  const gap = { w: 2001, h: 100, segMode: 'custom', segs: [{ name: 'A', x: 0, y: 0, w: 1000, h: 100 }, { name: 'B', x: 1001, y: 0, w: 1000, h: 100 }] };
  let c = G.resizeScreen(gap, 200, 10); assert.ok(c.segs[1].x > c.segs[0].x + c.segs[0].w, 'gap kept ' + JSON.stringify(segsOf(c))); assert.ok(!G.segFit(c).exact);
  const ov = { w: 1990, h: 100, segMode: 'custom', segs: [{ name: 'A', x: 0, y: 0, w: 1000, h: 100 }, { name: 'B', x: 990, y: 0, w: 1000, h: 100 }] };
  c = G.resizeScreen(ov, 199, 10); assert.equal(G.segFit(c).overlaps.length, 1);
});
t('resize: keep pixel sizes → warns; equal split frozen to whole px', () => {
  const k = G.resizeScreen(DON(), 5334, 507, 'keep');
  assert.deepEqual(segsOf(k), [[0, 3510, 1080], [3510, 4320, 1080], [7830, 3510, 1080]]);
  const f = G.segFit(k); assert.equal(f.level, 'error'); assert.ok(f.issues.some(i => i.text === 'Right is completely off the screen.'));
  const eq = G.resizeScreen({ w: 11344, h: 1080, segments: 3, boxes: [{ x: 1, y: 2, w: 3, h: 4 }] }, 5334, 507, 'keep');
  assert.equal(eq.segMode, 'custom'); assert.deepEqual(segsOf(eq), [[0, 3782, 1080], [3782, 3781, 1080], [7563, 3781, 1080]]); assert.deepEqual(eq.boxes[0], { x: 1, y: 2, w: 3, h: 4 });
  const eqs = G.resizeScreen({ w: 1536, h: 1280, segments: 6, boxes: [] }, 768, 640);   // scale: equal split just follows
  assert.equal(eqs.segMode, undefined); assert.deepEqual(G.segments(eqs).map(g => g.cx), [64, 192, 320, 448, 576, 704]);
});
// ---------- v1.6 playback fit on a target output ----------
t('playback: Don 55.561×5.28 in on 11344×1080 → 11344×1078.03, letterbox about 1 px top/bottom', () => {
  const f = SL.playbackFit(55.561, 5.28, 11344, 1080);
  assert.equal(f.kind, 'letterbox'); assert.equal(f.fitBy, 'width'); assert.equal(f.imgW, 11344); near(f.imgH, 1078.028, 1e-3); assert.equal(f.areaText, '11344 × 1078.03 px');
  near(f.offY, 0.986, 1e-3); near(f.totY, 1.972, 1e-3); assert.equal(f.offX, 0); near(f.pxPerIn, 204.172, 1e-3); near(f.scale96, 2.127, 1e-3);
  assert.ok(f.bars.approx); assert.ok(f.headline.startsWith('Letterbox — Black top and bottom: about 1 px each (exact 0.986 px each, 1.972 px total'), f.headline);
  const L = SL.landRects(f, 11344, 1080, DON().segs.map(g => ({ name: g.name, x: g.x, y: g.y, w: g.w, h: g.h })));
  assert.deepEqual(L.map(l => [Math.round(l.out.x0), Math.round(l.out.x1)]), [[0, 3510], [3510, 7830], [7830, 11340]]);   // x unchanged (width fits exactly)
  near(L[0].out.y0, 0.986, 1e-3); near(L[0].out.y1, 1079.014, 1e-3); assert.ok(L.every(l => !l.moved), 'no edge moves ≥ 1 px');
});
t('playback: recommended 1/3 slide (39.389×3.75 in) on its own 11344×1080 → no bars; on 1920×1080 / 3840×2160 → letterbox', () => {
  const p = SL.pptOptions(11344, 1080).options.find(o => o.recommended);
  let f = SL.playbackFit(p.slideW, p.slideH, 11344, 1080); assert.equal(f.kind, 'none'); assert.equal(f.bars.approx, false); assert.equal(f.areaText, '11344 × 1080 px'); near(f.pxPerIn, 288, 1e-9);
  const L = SL.landRects(f, 11344, 1080, [{ name: 'Center', x: 3510, y: 0, w: 4320, h: 1080 }]); assert.equal(L[0].maxShift < 1e-6, true);
  f = SL.playbackFit(p.slideW, p.slideH, 1920, 1080); assert.equal(f.kind, 'letterbox'); near(f.imgH, 182.793, 1e-3); assert.ok(/about 449 px each/.test(f.headline), f.headline);
  const M = SL.landRects(f, 11344, 1080, [{ name: 'Center', x: 3510, y: 0, w: 4320, h: 1080 }]);   // native scaled to 1920×1080: y 0–1080; lands y 448.6–631.4
  assert.ok(M[0].moved); assert.deepEqual(M[0].flags.map(x => x.edge), ['top', 'bottom']); near(M[0].out.x0, 3510 / 11344 * 1920, 1e-6);
  assert.equal(SL.playbackFit(p.slideW, p.slideH, 3840, 2160).kind, 'letterbox');
});
t('playback: pillarbox, odd totals, sub-pixel, exact', () => {
  let f = SL.playbackFit(10, 7.5, 1920, 1080); assert.equal(f.kind, 'pillarbox'); assert.equal(f.headline, 'Pillarbox — Black left and right: 240 px each (480 px total)'); assert.equal(f.areaText, '1440 × 1080 px'); near(f.offX, 240);
  f = SL.playbackFit(16, 9, 1920, 1083); assert.equal(f.kind, 'letterbox'); assert.ok(f.bars.odd); assert.equal(f.bars.lo, 1); assert.equal(f.bars.hi, 2);
  assert.ok(f.headline.includes('about 1.5 px each (3 px total, odd) — one side gets 1 px and the other 2 px'), f.headline);
  f = SL.playbackFit(16, 9, 1921, 1080); assert.equal(f.kind, 'pillarbox'); assert.ok(f.headline.includes('(1 px total, odd) — one side gets 0 px and the other 1 px'), f.headline);
  f = SL.playbackFit(16, 9, 1923, 1080); assert.equal(f.kind, 'pillarbox'); assert.ok(f.headline.includes('one side gets 1 px and the other 2 px'));
  f = SL.playbackFit(55.561, 5.28, 5334, 507); assert.equal(f.kind, 'none'); assert.ok(f.bars.subpixel); assert.ok(f.headline.startsWith('No black bars (only 0.11 px'), f.headline);
  f = SL.playbackFit(13.333, 7.5, 1920, 1080); assert.equal(f.kind, 'none');   // 13.333 in is 0.0025% narrow: < 0.5 px
  assert.equal(SL.playbackFit(0, 5, 10, 10), null); assert.equal(SL.playbackFit(1, 1, 0, 10), null);
  const L = SL.landRects(SL.playbackFit(10, 7.5, 1920, 1080), 1920, 1080, [{ name: 'A', x: 0, y: 0, w: 960, h: 1080 }]);
  assert.deepEqual(L[0].flags.map(x => [x.edge, Math.round(x.shift)]), [['left', 240]]);   // left half: 0–960 → 240–960 (right edge lands where it was)
});
t('store: pptOut kept/sanitized, optional', () => {
  const j = Store.sanitizeJob({ name: 'x', screens: [{ name: 'S', w: 11344, h: 1080, pptOut: { w: '1920.4', h: 1080 } }, { name: 'T', w: 10, h: 10, pptOut: { w: -1, h: 5 } }, { name: 'U', w: 10, h: 10 }] });
  assert.deepEqual(j.screens.map(s => s.pptOut), [{ w: 1920, h: 1080 }, null, null]);
  assert.equal(Store.makeScreen('n', 100, 100).pptOut, null);
});
// ---------- v1.7 Re-layout segments to fill ----------
const FILLED = () => { const d = DON(); return { ...d, segLayout: 'fill', segmentsOriginal: d.segs.map(g => ({ ...g })), segs: G.fillSegs(d.segs, d.w), boxes: [] }; };
t('fill: Don 3510/4320/3510 on 11344 → 3511/4322/3511 (largest remainder), butted from 0', () => {
  // exact shares: 3510·11344/11340 = 3511.238, 4320·11344/11340 = 4321.524 → floors 3511+4321+3511 = 11343; the 1 leftover px goes to the largest remainder (Center .524)
  near(3510 * 11344 / 11340, 3511.238, 1e-3); near(4320 * 11344 / 11340, 4321.524, 1e-3);
  assert.deepEqual(G.fillWidths([3510, 4320, 3510], 11344), [3511, 4322, 3511]);
  const f = G.fillSegs(DON().segs, 11344);
  assert.deepEqual(f.map(g => [g.name, g.x, g.y, g.w, g.h, g.pw]), [['Left', 0, 0, 3511, 1080, 52], ['Center', 3511, 0, 4322, 1080, 66], ['Right', 7833, 0, 3511, 1080, 52]]);
  const s = FILLED(); assert.ok(G.isFill(s)); const fit = G.segFit(s); assert.ok(fit.exact, JSON.stringify(fit.issues)); assert.equal(fit.level, 'ok');
  assert.ok(!G.segFit(DON()).exact, 'original is 4 px short');
  assert.equal(G.segments(s)[1].cx, 3511 + 4322 / 2);   // PiP "center in seg" uses the active layout
});
t('fill: rounding invariants (sum = W exactly, each within 1 px of exact share, ties → leftmost)', () => {
  assert.deepEqual(G.fillWidths([1, 1, 1], 5), [2, 2, 1]); assert.deepEqual(G.fillWidths([1, 1, 1], 6), [2, 2, 2]); assert.deepEqual(G.fillWidths([3510, 4320, 3510], 11340), [3510, 4320, 3510]);
  assert.deepEqual(G.fillWidths([3510, 4320, 3510], 11000), [3405, 4190, 3405]);   // shrink: 3404.762 / 4190.476 → floors 11000-… leftover to .762s
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 400; k++) {
    const n = 1 + Math.floor(rnd() * 12), ws = Array.from({ length: n }, () => 1 + Math.floor(rnd() * 5000)), W = n + Math.floor(rnd() * 30000), tot = ws.reduce((a, b) => a + b, 0);
    const out = G.fillWidths(ws, W); assert.equal(out.reduce((a, b) => a + b, 0), W, `sum ${ws} → ${W}`);
    out.forEach((w, i) => { assert.ok(w >= 1 && Math.abs(w - ws[i] * W / tot) < 1 + 1e-9, `share ${i}: ${w} vs ${ws[i] * W / tot}`); });
    const segs = ws.map((w, i) => ({ id: 'g' + i, name: 'S' + i, x: Math.floor(rnd() * 9000), y: 3, w, h: 50 }));
    const f = G.fillSegs(segs, W), sorted = f.map((g, i) => [g, i]).sort((a, b) => a[0].x - b[0].x);
    let x = 0; for (const [g, i] of sorted) { assert.equal(g.x, x); x += g.w; assert.equal(g.id, segs[i].id); assert.equal(g.y, 3); assert.equal(g.h, 50); }
    assert.equal(x, W);
  }
});
t('fill: order follows original X, not list order; y/h kept', () => {
  const segs = [{ id: 'b', name: 'B', x: 2000, y: 10, w: 1000, h: 500 }, { id: 'a', name: 'A', x: 0, y: 0, w: 1000, h: 600 }, { id: 'c', name: 'C', x: 1000, y: 0, w: 500, h: 600 }];
  assert.deepEqual(G.fillSegs(segs, 3000).map(g => [g.id, g.x, g.w, g.y, g.h]), [['b', 1800, 1200, 10, 500], ['a', 0, 1200, 0, 600], ['c', 1200, 600, 0, 600]]);
});
t('fill: resize from slide size keeps Fill (original scaled, then re-filled)', () => {
  const c = G.resizeScreen(FILLED(), 5334, 507, 'scale');
  assert.ok(G.isFill(c)); assert.deepEqual(c.segmentsOriginal.map(g => [g.x, g.w, g.h]), [[0, 1650, 507], [1650, 2032, 507], [3682, 1650, 507]]);
  assert.equal(c.segs.reduce((a, g) => a + g.w, 0), 5334); assert.ok(G.segFit(c).exact); assert.deepEqual(c.segs.map(g => g.w), G.fillWidths([1650, 2032, 1650], 5334));
  const k = G.resizeScreen(FILLED(), 11344, 1078, 'keep'); assert.ok(G.isFill(k)); assert.deepEqual(k.segs.map(g => g.w), [3511, 4322, 3511]);
});
t('store: segLayout / segmentsOriginal round-trip, validation, older jobs', () => {
  const f = FILLED(); f.segs.forEach((g, i) => g.id = 'id' + i); f.segmentsOriginal.forEach((g, i) => g.id = 'id' + i);
  let j = Store.sanitizeJob({ name: 'x', screens: [{ name: 'S', ...f }] }), s = j.screens[0];
  assert.equal(s.segLayout, 'fill'); assert.deepEqual(s.segs.map(g => g.w), [3511, 4322, 3511]); assert.deepEqual(s.segmentsOriginal.map(g => g.w), [3510, 4320, 3510]); assert.ok(G.isFill(s));
  assert.deepEqual(s.segmentsOriginal.map(g => g.id), s.segs.map(g => g.id));
  j = Store.sanitizeJob({ name: 'x', screens: [{ name: 'S', ...f }] }, true); s = j.screens[0];   // fresh ids (import copy) stay aligned
  assert.deepEqual(s.segmentsOriginal.map(g => g.id), s.segs.map(g => g.id)); assert.notEqual(s.segs[0].id, 'id0');
  s = Store.sanitizeJob({ name: 'x', screens: [{ name: 'S', ...f, segmentsOriginal: f.segmentsOriginal.slice(1) }] }).screens[0];
  assert.equal(s.segLayout, 'original'); assert.equal(s.segmentsOriginal, null); assert.deepEqual(s.segs.map(g => g.w), [3511, 4322, 3511]);
  s = Store.sanitizeJob({ name: 'x', screens: [{ name: 'S', ...DON() }] }).screens[0]; assert.equal(s.segLayout, 'original'); assert.equal(s.segmentsOriginal, null);
  s = Store.sanitizeJob({ name: 'x', screens: [{ name: 'S', w: 100, h: 100, segments: 2, segLayout: 'fill', segmentsOriginal: [] }] }).screens[0]; assert.equal(s.segLayout, 'original');
  // older app versions keep only `segs` → they see the active (filled) layout
  assert.equal(Store.makeScreen('n', 10, 10).segLayout, 'original');
});
t('slides: positions use the active layout', () => {
  const s = FILLED(), p = SL.pptOptions(s.w, s.h).options.find(o => o.recommended), g = G.segments(s)[2];
  const o = SL.onSlide(p, { name: g.name, x: g.x0, y: g.y0, w: g.w, h: g.h }); near(o.left.in, 7833 / 288, 1e-9); near(o.width.in, 3511 / 288, 1e-9);
  const L = SL.landRects(SL.playbackFit(55.561, 5.28, 11344, 1080), 11344, 1080, G.segments(s).map(g => ({ name: g.name, x: g.x0, y: g.y0, w: g.w, h: g.h })));
  assert.deepEqual(L.map(l => Math.round(l.out.x1)), [3511, 7833, 11344]);
});
// ---------- v1.8 Keynote ----------
t('keynote options: Don 11344×1080 → 1/2 5672×540 ★ (exact), 1/4 2836×270, largest 8192×779.915 → 780', () => {
  const ko = SL.keynoteOptions(11344, 1080); assert.ok(ko.tooBig && !ko.fitsNative);
  assert.deepEqual(ko.options.map(o => [o.key, o.wholeW, o.wholeH, o.exact, !!o.recommended]), [['exact2', 5672, 540, true, true], ['exact4', 2836, 270, true, false], ['max', 8192, 780, false, false]]);
  const m = ko.options[2]; near(m.k, 8192 / 11344, 1e-12); near(m.ptH, 1080 * 8192 / 11344, 1e-9); near(m.ptH, 779.915, 1e-3); near(m.backH, 780 * 11344 / 8192, 1e-9); near(m.errPx, 0.117, 1e-3);
  assert.equal(ko.options[0].emuW, 5672 * 12700); assert.equal(ko.options[0].emuH, 540 * 12700); assert.ok(ko.options[0].overOoxml); assert.ok(!ko.options[1].overOoxml);
  assert.equal(ko.options[0].scaleText, '1/2'); assert.equal(ko.options[0].errPx, 0);
});
t('keynote options: native, too small, no whole 1/N, impossible', () => {
  let ko = SL.keynoteOptions(1920, 1080); assert.equal(ko.options[0].key, 'native'); assert.ok(ko.options[0].recommended); assert.deepEqual(ko.options.slice(1).map(o => o.N), [2, 3, 4, 5]);
  ko = SL.keynoteOptions(8192, 8192); assert.equal(ko.options[0].key, 'native');
  ko = SL.keynoteOptions(100, 50); assert.deepEqual(ko.options.map(o => [o.key, o.wholeW, o.wholeH]), [['up', 400, 200]]);
  ko = SL.keynoteOptions(8193, 1000); assert.deepEqual(ko.options.map(o => [o.key, o.exact]), [['fit2', false], ['max', false]]); assert.equal(ko.options.find(o => o.recommended).key, 'max');
  ko = SL.keynoteOptions(100000, 100); assert.ok(ko.impossible); assert.equal(ko.options.length, 0);
});
t('keynote positions + compare + summary rows', () => {
  const o = SL.keynoteOptions(11344, 1080).options[0];
  assert.deepEqual(SL.keyRect(o, { name: 'Center', x: 3510, y: 0, w: 4320, h: 1080 }), { name: 'Center', x: 1755, y: 0, w: 2160, h: 540 });
  const c = SL.keyCompare(11344, 1080, { w: 5672, h: 540 }); assert.ok(c.match);
  const d = SL.keyCompare(11344, 1080, { w: 1920, h: 1080 }); assert.ok(!d.match); near(d.diffPct, (1920 / 1080) / (11344 / 1080) * 100 - 100, 1e-9); near(d.keepWidthH, 1920 * 1080 / 11344, 1e-9);
  assert.equal(SL.keyCompare(1, 1, null), null);
  const rows = SL.keySummaryRows({ w: 11344, h: 1080 }, o, [{ name: 'Center', x: 3510, y: 0, w: 4320, h: 1080 }]);
  assert.deepEqual(rows[1], ['Slide', '0', '0', '5672', '540', '0', '0', '11344', '1080']); assert.deepEqual(rows[2], ['Center', '1755', '0', '2160', '540', '3510', '0', '4320', '1080']);
  const f = SL.playbackFit(5672, 540, 11344, 1080); assert.equal(f.kind, 'none'); near(f.pxPerIn, 2, 1e-12);   // unit-agnostic: 2 output px per slide pt
});
t('store: keyCur kept, optional', () => {
  const j = Store.sanitizeJob({ name: 'x', screens: [{ name: 'S', w: 10, h: 10, keyCur: { w: '1920', h: 1080 } }, { name: 'T', w: 10, h: 10, keyCur: { w: -1 } }, { name: 'U', w: 10, h: 10 }] });
  assert.deepEqual(j.screens.map(s => s.keyCur), [{ w: 1920, h: 1080 }, null, null]);
});
console.log(`segment + slide tests passed (${n} groups)`);
