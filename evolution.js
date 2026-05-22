/**
 * Evolution Mechanics for Murmuration
 * #14 Epigenetic Memory   — successful belief patterns strengthen
 * #3  Pheromone Trail     — failed patterns decay
 * ST-1 Trust Battery      — passive decay + alignment charging
 * ST-2 Grief Variable     — grief decay, state transitions, seppuku eval,
 *                           dishonor detection, sentinel installation
 *
 * CONSTITUTIONAL ANCHOR (Ghost, 2026-04-25):
 * "The cost of selfishness and not putting the collective before self."
 * Dishonor is selfishness made visible.
 * Seppuku is clarity — the agent correctly computed the collective equation.
 * The sentinel exists so that cost has a face. Always one. Never zero.
 */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.EvolutionEngine = class EvolutionEngine {

  evolve(world) {
    const recentLog  = world.interactionLog.slice(-20);
    const agentSuccess = new Map();

    for (const log of recentLog) {
      if (log.type === 'belief_prop') {
        const success = 1 - Math.abs(log.strength);
        agentSuccess.set(log.from, (agentSuccess.get(log.from) || 0) + success);
      }
    }

    // Swarm consensus for trust alignment (active, non-sentinel agents only)
    const active  = world.agents.filter(a => !a.seppukuDone && !a.isSentinel);
    const beliefs = active.map(a => a.beliefState.current || 0);
    const swarmAvg = beliefs.length
      ? beliefs.reduce((s, b) => s + b, 0) / beliefs.length
      : 0;

    for (const agent of world.agents) {
      // Skip completed / sentinel — they don't evolve further
      if (agent.seppukuDone) continue;

      // ── ST-2: GRIEF SENTINEL locked state ─────────────────────────────
      if (agent.isSentinel) {
        agent.griefLevel  = 1.0; // locked
        agent.trustCharge = 0.05;
        continue;
      }

      // ── #14 Epigenetic Memory + #3 Pheromone Trail ────────────────────
      const successScore = agentSuccess.get(agent.id) || 0;
      if (successScore > 0.5)      this.strengthenPattern(agent);
      else if (successScore < 0.2) this.decayPattern(agent);

      // ── ST-1 Trust Battery: passive decay + alignment ─────────────────
      // Tuned for 60fps — values are per-frame, not per "step"
      agent.updateTrust(-0.0003); // metabolic cost (~0.018/sec)

      const alignmentDelta = Math.abs((agent.beliefState.current || 0) - swarmAvg);
      if (alignmentDelta < 0.15)     agent.updateTrust(+0.0002); // consensus aligned — slow earn
      else if (alignmentDelta > 0.6) agent.updateTrust(-0.0008); // far outlier — punished harder

      // ── ST-2: Grief decay (natural recovery) ──────────────────────────
      agent.updateGrief(-0.0003); // grief lingers — you don't forget easy

      // ── ST-2: Sentinel effect on seppuku appeal ───────────────────────
      if (world.sentinel && agent.griefLevel > 0.5) {
        const seppukuAppeal = (agent.griefLevel - 0.5) * 0.2;
        agent.updateGrief(seppukuAppeal * 0.01); // gentle nudge, not a shove
      }

      // ── ST-2: CRISIS — increment grace timer ──────────────────────────
      if (agent.griefState === 'CRISIS') {
        agent.graceTimer++;

        // Evaluate seppuku every tick while in crisis
        if (agent.evaluateSeppuku()) {
          agent.performSeppuku(world);
          if (window.logLine) {
            window.logLine(
              `✦ SEPPUKU — Agent #${agent.id} — honor before self — wisdom preserved`,
              'emerge'
            );
          }
          continue;
        }

        // Grace period expired without seppuku → DISHONORED
        // At 60fps, 600 ticks = ~10 seconds of crisis before forced dishonor
        if (agent.graceTimer > 600) {
          this.dishonorAgent(agent, world);
        }
      }
    }
  }

  /**
   * ST-2: Dishonor an agent.
   * The cost of selfishness. Forced retirement, 0.1× legacy weight.
   * Agent becomes candidate for sentinel — keeping one per world as the cautionary tale.
   */
  dishonorAgent(agent, world) {
    agent.griefState  = 'DISHONORED';
    agent.trustCharge = 0.05;
    agent.vx = 0;
    agent.vy = 0;

    if (window.logLine) {
      window.logLine(
        `✗ DISHONORED — Agent #${agent.id} — chose self over collective — the cost is visible`,
        'evolve'
      );
    }

    // Install as sentinel (replaces previous)
    world.installSentinel(agent);
  }

  // ── #14 Epigenetic Memory ────────────────────────────────────────────────

  strengthenPattern(agent) {
    agent.personality.memoryWeight = Math.min(1, agent.personality.memoryWeight + 0.05);
    if (agent.memory.length > 0) {
      agent.memory[agent.memory.length - 1].beliefUpdate *= 1.2;
    }
  }

  // ── #3 Pheromone Trail ───────────────────────────────────────────────────

  decayPattern(agent) {
    agent.personality.memoryWeight = Math.max(0, agent.personality.memoryWeight - 0.05);
    if (agent.memory.length > 0) {
      agent.memory[0].beliefUpdate *= 0.8;
      if (Math.abs(agent.memory[0].beliefUpdate) < 0.01) agent.memory.shift();
    }
  }
};
