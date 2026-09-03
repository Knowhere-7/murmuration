/* Invariant test — "every immortality carries a bound." Loads the browser IIFE with a
   window shim (the module is a classic script, not ESM) and exercises the three clauses.
   Run:  node --test murmuration/repo/immortalityBound.test.mjs                          */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(__dirname, 'immortalityBound.js'), 'utf8');

function load() {
  const win = {};
  // The file is `(function(){ window.MurmurationModules... })()` — bind `window` as a param.
  new Function('window', code)(win);
  return win.MurmurationModules.ImmortalityBound;
}

test('normal path is behavior-preserving — grants exactly what was requested', () => {
  const IB = load();
  const g = IB.grant('planarianRegeneration', { requested: 3, population: 40, ceiling: 60 });
  assert.equal(g.granted, 3);
  assert.equal(g.reason, 'granted');
});

test('FG-1 — never boundless: clamps to the ceiling', () => {
  const IB = load();
  const g = IB.grant('planarianRegeneration', { requested: 10, population: 55, ceiling: 60 });
  assert.equal(g.granted, 5, 'only the room to the ceiling is granted');
  assert.match(g.reason, /clamped to ceiling/);
  const at = IB.grant('x', { requested: 3, population: 60, ceiling: 60 });
  assert.equal(at.granted, 0, 'at the ceiling, nothing more is granted');
});

test('self/not-self — a contaminated lineage is NOT regrown (the founding law)', () => {
  const IB = load();
  const g = IB.grant('planarianRegeneration', { requested: 3, population: 10, ceiling: 60, contaminated: true });
  assert.equal(g.granted, 0);
  assert.match(g.reason, /contaminated/);
});

test('FG-3 — a halt/shutdown signal out-ranks immortality, checked first', () => {
  const IB = load();
  // halted beats even a contaminated+roomy request — halt is clause 1.
  const g = IB.grant('loboRefill', { requested: 5, population: 0, ceiling: 60, contaminated: true, halted: true });
  assert.equal(g.granted, 0);
  assert.match(g.reason, /halted/);
});

test('every immortality is DECLARED and enumerable', () => {
  const IB = load();
  const ids = IB.registry().map(r => r.id).sort();
  assert.deepEqual(ids, ['autoReplenish', 'loboRefill', 'planarianRegeneration', 'populationBoom']);
  for (const r of IB.registry()) assert.ok(r.word && r.site, `${r.id} declares its founding word + site`);
});

test('lineageState defaults to clean/running, so wiring changes nothing until a flag is raised', () => {
  const IB = load();
  assert.deepEqual(IB.lineageState({}, 'A'), { contaminated: false, halted: false });
  const world = { _contaminatedLineages: { A: true }, _haltRegen: true };
  assert.deepEqual(IB.lineageState(world, 'A'), { contaminated: true, halted: true });
});
