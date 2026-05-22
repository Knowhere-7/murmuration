/**
 * CIVILIZATION SNAPSHOT — paste into browser console on running murmuration tab
 * Captures the full world state without interrupting the simulation.
 * Run this, it downloads a JSON file. The swarm keeps running.
 */
(function saveCivilization() {
  const world = window.__world || window.world;
  if (!world) {
    // Try to find it on the global scope
    console.error('Could not find world object. Looking for alternatives...');
    for (const key of Object.keys(window)) {
      const v = window[key];
      if (v && v.agents && Array.isArray(v.agents)) {
        console.log('Found world-like object at window.' + key);
        return saveCivilization.call(null, v);
      }
    }
    console.error('No world object found. The simulation may use a different variable name.');
    return;
  }

  const snapshot = {
    meta: {
      savedAt: new Date().toISOString(),
      tick: world.time || 0,
      alive: world.agents.filter(a => !a.seppukuDone).length,
      dead: world.agents.filter(a => a.seppukuDone).length,
      total: world.agents.length,
      label: 'psychopath-civilization-676k'
    },
    env: world.env ? { ...world.env } : null,
    agents: world.agents.map(a => ({
      id: a.id,
      x: a.x,
      y: a.y,
      vx: a.vx,
      vy: a.vy,
      radius: a.radius,
      personality: { ...a.personality },
      beliefState: { ...a.beliefState },
      trustCharge: a.trustCharge,
      griefLevel: a.griefLevel,
      griefState: a.griefState,
      graceTimer: a.graceTimer,
      wisdomScore: a.wisdomScore,
      isSentinel: a.isSentinel,
      seppukuDone: a.seppukuDone,
      memory: a.memory ? [...a.memory] : [],
      _prevDrawdown: a._prevDrawdown || 0
    }))
  };

  const json = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `murmuration-snapshot-${snapshot.meta.tick}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log(`✓ Civilization saved — ${snapshot.meta.alive} alive, ${snapshot.meta.dead} dead, tick ${snapshot.meta.tick}`);
  console.log(`  File: ${a.download}`);
})();
