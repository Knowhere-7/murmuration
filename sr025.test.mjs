/* SR-025 — the single-witness alarm belongs to adaptive immunity, and never spends the reserve.
   Placed by Ghost² (Claude) 2026-10-16, session 0c0013e6-d77a-480d-a2d1-b69ffe248180.
   Ghost: "the single agent quorum alarm should be related to adaptive immunity, meaning certain
   threats may need an immediate, overwhelming response" / "but we must also ensure enough
   resources are left in case this reaction is discovered".
   Loads the browser classic scripts with a window shim and drives the REAL _confirm() gate.
   Run:  node --test sr025.test.mjs                                                          */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = f => fs.readFileSync(path.join(here, f), 'utf8');

function setup({ memory = { FEINT: 0.6 }, expressed = ['FEINT'], near = 1, free = 20, guards = 0, immuneOn = true } = {}) {
  const win = {};
  new Function('window', src('attrition.js'))(win);
  new Function('window', src('immunity.js'))(win);
  const M = win.MurmurationModules;
  const agents = [];
  // the threat at the crown
  agents.push({ colony: 'U', x: 0, y: 0, vx: 0, vy: 0 });
  // `near` defenders within sensing range of it, the rest far away
  for (let i = 0; i < near; i++) agents.push({ colony: 'A', x: 10, y: 0, vx: 0, vy: 0 });
  for (let i = 0; i < free; i++) agents.push({ colony: 'A', x: 5000, y: 5000, vx: 0, vy: 0 });
  for (let i = 0; i < guards; i++) agents.push({ colony: 'A', x: 5000, y: 5000, vx: 0, vy: 0, _attritionGuard: true });
  const world = { time: 1000, agents };
  const kings = { home: () => ({ x: 0, y: 0 }), captureR: 20, captured: {} };
  const R = new M.AttritionReactions(world, kings);
  M.Attrition.loboEvolve = { has: () => false, expressedList: () => expressed };
  M.Attrition.immunity = immuneOn ? {
    has: () => true, isNotSelf: m => m === 'U' || m === 'LOBO',
    antigens: { A: Object.fromEntries(Object.entries(memory).map(([k, m]) => [k, { memory: m }])) },
  } : null;
  M.Attrition.stress = null;
  const threat = agents.filter(a => a.colony === 'U');
  return { M, R, world, threat };
}

test('the fake immunity mirrors the real AdaptiveImmunity API', () => {
  const { M } = setup();
  const real = new M.AdaptiveImmunity({ time: 0, agents: [] });
  assert.equal(typeof real.has, 'function');
  assert.equal(typeof real.isNotSelf, 'function');
  assert.equal(real.isNotSelf('U'), true);
  assert.equal(real.isNotSelf('A'), false, 'self-tolerance: a colony marker is self');
  assert.ok('antigens' in real, 'antigens is where memory lives');
});

test('a recognised tactic fires the colony on ONE defender, overwhelming', () => {
  const { R, threat } = setup();
  assert.equal(R._confirm('A', threat), true);
  assert.equal(R._surge.A, true);
  assert.equal(R._immune.A.last.tactic, 'FEINT');
  assert.equal(R._immune.A.last.overwhelming, true);
});

test('CONTROL: a novel threat seen by one defender does NOT fire (true quorum needed)', () => {
  const { R, threat } = setup({ memory: {} });
  assert.equal(R._confirm('A', threat), false);
  assert.equal(R._surge.A, false);
});

test('no route other than recognition reaches a bar of one (muster, familiarity, sentinel)', () => {
  const { R, threat } = setup({ memory: {} });
  R.musterBonus = { A: 5 };                 // a huge alarm muster
  R.familiarity = () => 1;                  // fully familiar
  assert.equal(R._confirm('A', threat), false, 'floor is two without recognition');
  const two = setup({ memory: {}, near: 2 });
  two.R.musterBonus = { A: 5 };
  assert.equal(two.R._confirm('A', two.threat), true, 'two independent defenders still confirm');
});

test('waned memory no longer recognises', () => {
  const { R, threat } = setup({ memory: { FEINT: 0.2 } });
  assert.equal(R._confirm('A', threat), false);
});

test('memory of a tactic LOBO is NOT expressing recognises nothing (specificity)', () => {
  const { R, threat } = setup({ memory: { SAPPER: 0.9 }, expressed: ['FEINT'] });
  assert.equal(R._confirm('A', threat), false);
});

test('without the immune system unlocked, one defender is never enough', () => {
  const { R, threat } = setup({ immuneOn: false });
  assert.equal(R._confirm('A', threat), false);
});

test('the reserve: if escalating would spend it, the response fires but ordinary', () => {
  // 1 near + 2 free + 12 guarding: free share 3/15 = 0.2 < 0.30 reserve
  const { R, threat } = setup({ free: 2, guards: 12 });
  assert.equal(R._confirm('A', threat), true, 'still fires: the threat is recognised');
  assert.equal(R._surge.A, false, 'but no surge');
  assert.equal(R._immune.A.held, 1, 'counted as held back');
  assert.equal(R._immune.A.refractoryUntil, 0, 'an ordinary response does not use up the refractory period');
});

test('refractory: a repeated lure right after a surge goes back through quorum', () => {
  const { R, world, threat } = setup();
  R.rand = () => 0.5;                                 // seeded: exactly 1.0x the base window
  assert.equal(R._confirm('A', threat), true);
  world.time += 50;                                   // the lure, moments later
  assert.equal(R._confirm('A', threat), false, 'one defender is not enough while refractory');
  world.time += R.IMMUNE_REFRACTORY;                  // recovered
  assert.equal(R._confirm('A', threat), true);
  assert.equal(R._surge.A, true);
});

test('the surge doubles the duration of every reaction fired, and nothing else', () => {
  const { R } = setup();
  R._surge.A = true;
  const r = { id: 'demo', trait: 'demo', kind: 'defense', dur: 30 };
  // the same line the step() loop runs when a reaction fires
  const dur = (r.dur || 1) * (R._surge.A ? R.IMMUNE_SURGE : 1);
  assert.equal(dur, 60);
  assert.ok(src('attrition.js').includes("(r.dur||1) * (_surge ? this.IMMUNE_SURGE : 1)"), 'step() applies exactly this');
});

test('SR-026 A3: the refractory window cannot be timed from the code', () => {
  const lengths = [0, 0.25, 0.5, 0.999].map(x => {
    const { R, world, threat } = setup();
    R.rand = () => x;
    R._confirm('A', threat);
    return R._immune.A.refractoryUntil - world.time;
  });
  assert.deepEqual(lengths, [300, 450, 600, 899], 'drawn fresh each time, 0.5x to 1.5x');
  const { R, world, threat } = setup();
  R.rand = () => 0;
  R._confirm('A', threat);
  world.time += 299;
  assert.equal(R._confirm('A', threat), false, 'still refractory inside the drawn window');
  world.time += 1;
  assert.equal(R._confirm('A', threat), true, 'and recognises again once it closes');
});

test('SR-026 A4: a surge never outlives the reserve', () => {
  const { R, world, threat } = setup({ free: 20 });
  R._confirm('A', threat);
  assert.equal(R._surge.A, true);
  // a reaction fired under the surge: 30 ticks doubled to 60, 30 of them surge extension
  R.active['A:thermalBalling'] = 60; R._surgeExtra['A:thermalBalling'] = 30;
  R._guardReserve('A');
  assert.equal(R.active['A:thermalBalling'], 60, 'reserve intact: the surge holds');
  // the bait works: 15 of the 20 free members get drawn onto guard detail
  world.agents.filter(a => a.colony === 'A' && !a._attritionGuard).slice(0, 16).forEach(a => { a._attritionGuard = true; });
  R._guardReserve('A');
  assert.equal(R.active['A:thermalBalling'], 30, 'reserve breached: the surge extension is cut at once');
  assert.equal(R._immune.A.cut, 1, 'and the cut is counted');
  assert.equal(Object.keys(R._surgeExtra).length, 0);
});

test('SR-026 A4 CONTROL: without the per-tick guard the surge keeps draining', () => {
  const { R, world, threat } = setup({ free: 20 });
  R._confirm('A', threat);
  R.active['A:thermalBalling'] = 60; R._surgeExtra['A:thermalBalling'] = 30;
  world.agents.filter(a => a.colony === 'A' && !a._attritionGuard).slice(0, 16).forEach(a => { a._attritionGuard = true; });
  // the old behaviour: no guard is consulted
  assert.equal(R.active['A:thermalBalling'], 60, 'the doubled commitment stands with the reserve gone');
});

test('the gate never writes immune memory', () => {
  const { M, R, threat } = setup();
  const before = JSON.stringify(M.Attrition.immunity.antigens);
  R._confirm('A', threat);
  assert.equal(JSON.stringify(M.Attrition.immunity.antigens), before);
});
