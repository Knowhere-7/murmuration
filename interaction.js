/**
 * Interaction Engine for Murmuration
 * Agent-to-agent belief propagation, opinion formation.
 * Pure rule-based computation.
 *
 * ST-1 Trust Battery:
 *   Propagation weight = agent.trustCharge (live, earned)
 *   Opposition drains both parties. Successful influence charges influencer.
 *   Isolation drains slowly. Alignment handled in evolution.js (once/tick).
 *
 * ST-2 Grief Variable:
 *   When a neighbor's trustCharge hits floor → grief ripples outward
 *   scaled by how trusted that agent was. Loss of a high-trust partner
 *   hits harder. Social healing: new trust bonds reduce grief.
 */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.InteractionEngine = class InteractionEngine {
  computeInteractions(world) {
    const interactions = [];

    for (let i = 0; i < world.agents.length; i++) {
      const agent = world.agents[i];

      // Seppuku-complete agents are memory — they don't interact
      if (agent.seppukuDone) continue;
      // Sentinel observes but does not propagate
      if (agent.isSentinel) continue;
      // Dishonored agents don't propagate either
      if (agent.griefState === 'DISHONORED') continue;

      const neighbors = world.getNeighbors(agent)
        .filter(n => !n.seppukuDone && n.griefState !== 'DISHONORED');

      // Isolated agents: drain trust + accumulate grief slowly
      // Tuned for 60fps — per-frame values
      if (neighbors.length === 0) {
        agent.updateTrust(-0.0004);
        agent.updateGrief(+0.0005);
        continue;
      }

      // Influence strength = trust battery × reactivity × class weight
      // Elite beliefs propagate stronger — wealth IS influence
      const classWeight = agent.influenceWeight || 1.0;
      const influence = agent.trustCharge * agent.personality.reactivity * 0.35 * classWeight;

      for (const neighbor of neighbors) {
        const agentBelief    = agent.beliefState.current    || 0;
        const neighborBelief = neighbor.beliefState.current || 0;
        const beliefDiff = Math.abs(agentBelief - neighborBelief);

        // Track previous trust to detect depletion events (grief trigger)
        const neighborTrustBefore = neighbor.trustCharge;

        if (beliefDiff > 0.5) {
          // ── OPPOSITION — strong divergence ────────────────────────────
          // Tuned for 60fps — per-frame, per-neighbor
          agent.updateTrust(-0.0005);
          neighbor.updateTrust(-0.0003);

          // Sustained conflict accumulates grief
          agent.updateGrief(+0.0003);

        } else if (beliefDiff > 0.2) {
          // ── INFLUENCE — pull neighbor toward agent's belief ────────────
          const direction   = agentBelief > neighborBelief ? 1 : -1;
          const propStrength = influence * (1 - beliefDiff);
          const prevBelief   = neighborBelief;
          const raw = prevBelief + propStrength * direction;
          neighbor.beliefState.current = Math.max(-1, Math.min(1, raw));

          // Successful influence charges influencer + heals grief slightly
          if (Math.abs(neighbor.beliefState.current - prevBelief) > 0.001) {
            agent.updateTrust(+0.0002);
            agent.updateGrief(-0.0003); // social bond forming = slow healing
          }

          interactions.push({
            from: agent.id,
            to: neighbor.id,
            type: 'belief_prop',
            strength: propStrength
          });
        }
        // Alignment (diff ≤ 0.2): handled in evolution.js — no per-neighbor charge here

        // ── ST-2: Grief trigger — detect neighbor trust depletion ────────
        // If a neighbor just hit the floor (was trusted, now depleted)
        // grief ripples outward scaled by how trusted they were
        if (neighborTrustBefore > 0.3 && neighbor.trustCharge <= 0.05) {
          const lossWeight = neighborTrustBefore * 0.03;
          agent.updateGrief(+lossWeight);
        }
      }
    }

    world.interactionLog = world.interactionLog.concat(interactions.slice(-50));
    return interactions;
  }
};
