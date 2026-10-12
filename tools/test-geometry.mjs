import * as G from '../js/geometry.js';
import assert from 'node:assert/strict';
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} != ${b}`);
const C = { w: 2560, h: 1280 }, HL = { w: 3584, h: 1024 }, COL = { w: 1536, h: 1280, segments: 6 };
const p = (s, g, l) => G.keyRows(s).find(r => r.group.startsWith(g) && r.label === l);
near(p(C, 'Center', 'Center point').x, 1280); near(p(C, 'Center', 'Center point').y, 640);
near(p(HL, 'Thirds', 'Vertical ⅓').x, 1194.67); near(p(HL, 'Thirds', 'Vertical ⅔').x, 2389.33);
assert.equal(G.fmt1(3584 / 3), '1194.7'); assert.equal(G.rnd(3584 / 3), 1195); assert.equal(G.fmt1(2 * 3584 / 3), '2389.3'); assert.equal(G.rnd(2 * 3584 / 3), 2389);
assert.deepEqual(G.segments(COL).map(s => s.cx), [128, 384, 640, 896, 1152, 1408]);
assert.deepEqual(G.segments(COL).slice(1).map(s => s.x0), [256, 512, 768, 1024, 1280]);
near(p(COL, 'Segment 2', 'Center').x, 384); near(p(COL, 'Segment 2', 'Center').y, 640);
assert.equal(G.aspect(3584, 1024).text, '7:2'); assert.equal(G.aspect(3584, 1024).decText, '3.50:1');
assert.equal(G.aspect(2560, 1280).text, '2:1'); assert.equal(G.aspect(1536, 1280).text, '6:5');
assert.deepEqual(G.largestFit(3584, 1024, 16, 9), { w: 1820, h: 1024, x: 882, y: 0 });
assert.deepEqual(G.largestFit(2560, 1280, 16, 9), { w: 2275, h: 1280, x: 142.5, y: 0 });
assert.deepEqual(G.largestFit(256, 1280, 16, 9), { w: 256, h: 144, x: 0, y: 568 });
assert.deepEqual(G.parseRatio('2.39:1'), [2.39, 1]);
// v1.1 — panel grids (tiled from top-left)
let pi = G.panelInfo({ w: 2560, h: 1280, grid: { mode: 'led192' } });
assert.equal(pi.exactText, '13.33 × 6.67 panels'); assert.equal(pi.countText, '14 × 7 = 98'); assert.equal(pi.partialW, 64); assert.equal(pi.partialH, 128); assert.equal(pi.whole, false);
pi = G.panelInfo({ w: 3584, h: 1024, grid: { mode: 'led192' } });
assert.equal(pi.exactText, '18.67 × 5.33 panels'); assert.equal(pi.total, 114);
pi = G.panelInfo({ w: 3584, h: 1024, grid: { mode: 'led384' } }); assert.deepEqual([pi.pw, pi.ph, pi.cols, pi.rows], [192, 384, 19, 3]);
pi = G.panelInfo({ w: 3584, h: 1024, grid: { mode: 'panel', panelW: 256, panelH: 256 } }); assert.ok(pi.whole); assert.equal(pi.total, 56);
assert.deepEqual(G.gridLines({ w: 2560, h: 1280, grid: { mode: 'led192' } }).xs.slice(0, 3), [192, 384, 576]);
// v1.1 — center origin offsets (display = internal − origin)
const o = G.originOf(C, 'center'); assert.deepEqual([0 - o.x, 0 - o.y], [-1280, -640]);
assert.deepEqual(G.originOf(C, 'tl'), { x: 0, y: 0 });
assert.equal(G.rnd(-597.33), -597); assert.equal(G.rnd(-0.5), -1); assert.equal(G.rnd(0.5), 1);
console.log('geometry tests passed');

// v1.9 layers + fills (sanitize back-compat)
{
  const G2 = await import('../js/geometry.js'), S2 = await import('../js/store.js');
  const d = G2.normLayers(undefined); if (d.map(l => l.id).join() !== 'fill,grid,segs,pip' || d[0].opacity !== 0.4) throw new Error('default layers');
  const n = G2.normLayers([{ id: 'pip', opacity: 2 }, { id: 'pip' }, { id: 'x' }, { id: 'grid', on: false, opacity: -1 }]);
  if (n.map(l => l.id).join() !== 'pip,grid,fill,segs' || n[0].opacity !== 1 || n[1].on || n[1].opacity !== 0) throw new Error('normLayers ' + JSON.stringify(n));
  const old = S2.sanitizeJob({ name: 'old', screens: [{ name: 'a', w: 100, h: 50, segments: 2 }] });
  if (old.layers.length !== 4 || old.screens[0].fill !== null || old.screens[0].segFills.length || old.exportSettings.inc.fill !== true) throw new Error('back-compat defaults');
  const j = S2.sanitizeJob({ name: 'n', screens: [{ name: 'a', w: 100, h: 50, fill: '#AbCdEf', segFills: ['#000000', 'red'], segMode: 'custom', segs: [{ x: 0, y: 0, w: 50, h: 50, fill: 'nope' }, { x: 50, y: 0, w: 50, h: 50, fill: '#ff0000' }] }] });
  const s = j.screens[0]; if (s.fill !== '#AbCdEf' || s.segFills[1] !== null || s.segs[0].fill !== null || s.segs[1].fill !== '#ff0000') throw new Error('fill sanitize');
  console.log('layer/fill tests passed');
}
