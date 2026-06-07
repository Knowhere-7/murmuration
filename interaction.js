/**
 * Interaction Engine for Murmuration
 * Agent-to-agent belief propagation, opinion formation, and conflict.
 *
 * CONFLICT SYSTEM — four balanced options, trait-weighted:
 *   yield      — faith + calm + wisdom (choosing peace)
 *   negotiate  — evolution + trust + wisdom (earned resolution)
 *   withdraw   — energy + faith + calm (can afford to leave)
 *   escalate   — grief + low-trust + low-faith (nowhere else to go)
 *
 *   No dominant strategy. The option that costs least for THIS agent
 *   at THIS moment is what they choose. Outcome reveals character.
 *
 * CONFLICT TRIGGERS (not ideology — real situational pressure):
 *   - Agent in GRIEVING or CRISIS state encounters a neighbor
 *   - Both agents are below trust threshold (collective erosion)
 *   - Sustained close proximity with accumulating friction ticks
 *
 * ESCALATION LEVELS:
 *   0 = none  1 = domestic  2 = local  3 = civil  4 = revolutionary
 *   Each consecutive escalate decision without resolution advances the level.
 */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.InteractionEngine = class InteractionEngine {

  computeInteractions(world) {
    const interactions = [];

    for (let i = 0; i < world.agents.length; i++) {
      const agent = world.agents[i];
      if (agent.seppukuDone)                 continue;
      if (agent.isSentinel)                  continue;
      if (agent.griefState === 'DISHONORED') continue;

      const neighbors = world.getNeighbors(agent)
        .filter(n => !n.seppukuDone && n.griefState !== 'DISHONORED');

      // ── ISOLATION ────────────────────────────────────────────────────────
      if (neighbors.length === 0) {
        agent.updateTrust(-0.0004);
        agent.updateGrief(+0.0005);
        continue;
      }

      const classWeight = agent.influenceWeight || 1.0;
      const influence   = agent.trustCharge * agent.personality.reactivity * 0.35 * classWeight;

      for (const neighbor of neighbors) {
        const agentBelief    = agent.beliefState.current    || 0;
        const neighborBelief = neighbor.beliefState.current || 0;
        const beliefDiff     = Math.abs(agentBelief - neighborBelief);
        const neighborTrustBefore = neighbor.trustCharge;

        // ── CONFLICT TRIGGER ─────────────────────────────────────────────
        const agentGrieving     = agent.griefState === 'GRIEVING' || agent.griefState === 'CRISIS';
        const mutualLowTrust    = agent.trustCharge < 0.40 && neighbor.trustCharge < 0.40;
        const sharpDivergence   = beliefDiff > 0.55;
        const sustainedFriction = (agent._conflictWith === neighbor.id);

        // Cross-colony encounter — different colonies in the same zone = immediate contest
        const agentColony    = agent.colony    || 'A';
        const neighborColony = neighbor.colony || 'A';
        const crossColony    = agentColony !== neighborColony;
        const sharedZone     = agent._commonsZone && neighbor._commonsZone &&
                               agent._commonsZone.name === neighbor._commonsZone.name;
        const zoneContest    = crossColony && sharedZone;

        const conflictCondition = agentGrieving || mutualLowTrust || sharpDivergence || sustainedFriction || zoneContest;

        if (conflictCondition && !agent._conflictWith) {
          agent._conflictWith        = neighbor.id;
          agent._conflictTicks       = 0;
          // Cross-colony zone contest starts at LOCAL (2), not DOMESTIC (1) — this is war over turf
          agent._conflictLevel       = zoneContest ? 2 : 1;
          agent._crossColonyConflict = crossColony;
        }

        // ── ACTIVE CONFLICT: DECISION ENGINE ─────────────────────────────
        if (agent._conflictWith === neighbor.id) {
          agent._conflictTicks++;

          // Decision runs every 45 ticks per agent — staggered by id to avoid lock-step
          if (world.time % 45 === agent.id % 45) {
            const decision = this._chooseConflictAction(agent, world);
            this._applyDecision(agent, neighbor, decision, world);
            interactions.push({
              from: agent.id, to: neighbor.id,
              type: `conflict_${decision}`,
              level: agent._conflictLevel
            });
          }

        } else if (beliefDiff > 0.2) {
          // ── INFLUENCE — belief drift toward agent ─────────────────────
          const direction    = agentBelief > neighborBelief ? 1 : -1;
          const propStrength = influence * (1 - beliefDiff);
          const prevBelief   = neighborBelief;
          const raw = prevBelief + propStrength * direction;
          neighbor.beliefState.current = Math.max(-1, Math.min(1, raw));

          if (Math.abs(neighbor.beliefState.current - prevBelief) > 0.001) {
            agent.updateTrust(+0.0002);
            agent.updateGrief(-0.0003);
          }

          interactions.push({
            from: agent.id, to: neighbor.id,
            type: 'belief_prop', strength: propStrength
          });
        }

        // ── ST-2: Grief trigger — neighbor trust depletion ───────────────
        if (neighborTrustBefore > 0.3 && neighbor.trustCharge <= 0.05) {
          agent.updateGrief(+(neighborTrustBefore * 0.03));
        }
      }

      // If conflict partner has left neighbor range, cool the conflict slowly
      if (agent._conflictWith) {
        const stillNear = neighbors.some(n => n.id === agent._conflictWith);
        if (!stillNear) {
          agent._conflictTicks = Math.max(0, agent._conflictTicks - 2);
          if (agent._conflictTicks === 0) {
            agent._conflictWith  = null;
            agent._conflictLevel = 0;
          }
        }
      }
    }

    world.interactionLog = world.interactionLog.concat(interactions.slice(-50));
    return interactions;
  }

  // ── DECISION WEIGHTS ─────────────────────────────────────────────────────
  // Four options, all balanced — the cheapest one for THIS agent wins.
  // Weights are trait-derived, not random. Character determines outcome.

  _chooseConflictAction(agent, world) {
    const grief   = agent.griefLevel   || 0;
    const trust   = agent.trustCharge  || 0.5;
    const faith   = agent.faith        || 0.1;
    const evo     = agent.evolution    || 0;
    const wisdom  = agent.wisdomScore  || 0;
    const energy  = agent.energy       != null ? agent.energy : 0.5;
    const calm    = 1 - grief;
    const level   = agent._conflictLevel || 1;

    // Each weight = how CHEAP this option is for this agent right now
    let yieldW     = faith * 0.45 + calm * 0.30 + wisdom * 0.25;
    let negotiateW = evo   * 0.40 + trust * 0.40 + wisdom * 0.20;
    let withdrawW  = energy* 0.40 + faith * 0.30 + calm   * 0.30;
    let escalateW  = grief * 0.50 + (1 - trust) * 0.30 + (1 - faith) * 0.20;

    // Cross-colony conflict weights depend on colony doctrine
    if (agent._crossColonyConflict) {
      const doctrine = (typeof world !== 'undefined' && world?.doctrine?.[agent.colony || 'A']) || 'neutral';
      const treatyActive = (typeof world !== 'undefined' && world?.treatyState === 'active');

      if (treatyActive || doctrine === 'peace') {
        // Peace doctrine: strongly prefer yield + negotiate — war is a treaty violation
        yieldW     *= 2.5;
        negotiateW *= 2.0;
        escalateW  *= 0.1;  // almost never escalate — it would break the peace
      } else if (doctrine === 'peace_leaning') {
        yieldW     *= 1.6;
        negotiateW *= 1.4;
        escalateW  *= 0.5;
      } else if (doctrine === 'war' || doctrine === 'war_leaning') {
        // War doctrine: this is existential — fight for it
        yieldW    *= 0.2;
        withdrawW *= 0.4;
        escalateW *= 2.0;
      } else {
        // Neutral: cross-colony tension but no doctrine lock
        yieldW    *= 0.3;
        withdrawW *= 0.5;
        escalateW *= 1.6;
      }
    }

    // As conflict deepens, all options become harder except escalate (sunk-cost trap)
    const sunk = Math.min(0.4, (level - 1) * 0.12);
    yieldW     = Math.max(0, yieldW     - sunk);
    negotiateW = Math.max(0, negotiateW - sunk * 0.7);
    withdrawW  = Math.max(0, withdrawW  - sunk * 0.5);
    escalateW  = Math.min(1, escalateW  + sunk * 0.3);

    const total = (yieldW + negotiateW + withdrawW + escalateW) || 1;
    const r = Math.random() * total;

    let acc = 0;
    if ((acc += yieldW)     >= r) return 'yield';
    if ((acc += negotiateW) >= r) return 'negotiate';
    if ((acc += withdrawW)  >= r) return 'withdraw';
    return 'escalate';
  }

  // ── APPLY DECISION ───────────────────────────────────────────────────────

  _applyDecision(agent, neighbor, decision, world) {
    agent._lastDecision = decision;

    switch (decision) {

      case 'yield':
        // Letting go is a choice — costs grief, earns small trust
        agent.updateGrief(-0.025);
        agent.updateTrust(+0.008);
        neighbor.updateTrust(+0.004);
        agent._conflictWith  = null;
        agent._conflictTicks = 0;
        agent._conflictLevel = 0;
        break;

      case 'negotiate':
        agent.updateTrust(-0.006);
        neighbor.updateTrust(-0.006);
        agent._conflictTicks = Math.max(0, agent._conflictTicks - 25);
        agent._conflictLevel = Math.max(1, agent._conflictLevel - 1);
        if (agent._conflictTicks === 0) {
          agent.accumulateEvolution(0.15, 'conflict_resolved');
          neighbor.accumulateEvolution(0.08, 'conflict_resolved');
          agent._conflictWith        = null;
          agent._conflictLevel       = 0;
          agent._crossColonyConflict = false;

          // Cross-colony negotiated resolution → propose treaty if both colonies willing
          if (agent._crossColonyConflict && world?.treatyState === 'none') {
            const agentColony    = agent.colony    || 'A';
            const neighborColony = neighbor.colony || 'A';
            const aDoc = world.doctrine?.[agentColony]    || 'neutral';
            const bDoc = world.doctrine?.[neighborColony] || 'neutral';
            if (aDoc.includes('peace') || bDoc.includes('peace')) {
              world.treatyState = `proposed:${agentColony}`;
              if (window.logLine) {
                window.logLine(`🕊 NEGOTIATION — Colony ${agentColony} proposes peace to Colony ${neighborColony}`, 'evolve');
              }
            }
          }
        }
        break;

      case 'withdraw':
        // Leave — costs trust, spends energy, but the conflict ends for you
        const dx = agent.x - neighbor.x;
        const dy = agent.y - neighbor.y;
        const d  = Math.hypot(dx, dy) || 1;
        agent.vx += (dx / d) * 1.8;
        agent.vy += (dy / d) * 1.8;
        agent.updateTrust(-0.012);
        if (agent.energy != null) agent.energy = Math.max(0, agent.energy - 0.04);
        agent._conflictWith  = null;
        agent._conflictTicks = 0;
        agent._conflictLevel = 0;
        break;

      case 'escalate':
        // Both pay. The one who escalates pays more — this is a choice with a cost.
        agent.updateTrust(-0.018);
        agent.updateGrief(+0.025);
        neighbor.updateTrust(-0.012);
        neighbor.updateGrief(+0.015);

        agent._conflictTicks += 8;
        agent._conflictLevel  = Math.min(4, agent._conflictLevel + 1);

        // Mirror the conflict on the neighbor
        if (!neighbor._conflictWith) {
          neighbor._conflictWith        = agent.id;
          neighbor._conflictTicks       = agent._conflictTicks;
          neighbor._conflictLevel       = agent._conflictLevel;
          neighbor._crossColonyConflict = agent._crossColonyConflict;
        }

        // ── FRICTION → EVOLUTION: combat is a teacher ──
        // Surviving escalation produces adaptation — this is the friction loop Ghost described.
        // Cross-colony combat produces more growth (higher stakes = more pressure to adapt).
        if (agent._crossColonyConflict) {
          // Both sides learn from real conflict — winners and losers alike
          if (agent.accumulateEvolution)    agent.accumulateEvolution(0.06, 'cross_colony_combat');
          if (neighbor.accumulateEvolution) neighbor.accumulateEvolution(0.04, 'cross_colony_combat');
        } else {
          // Within-colony friction still produces some growth
          if (agent.accumulateEvolution) agent.accumulateEvolution(0.02, 'intra_colony_friction');
        }

        if (window.logLine) {
          const label = ['','DOMESTIC','LOCAL','CIVIL','REVOLUTIONARY'][agent._conflictLevel] || 'WAR';
          const tag   = agent._crossColonyConflict ? '⚔' : '〜';
          window.logLine(
            `${tag} ${label} — #${agent.id}[${agent.colony||'A'}]→#${neighbor.id}[${neighbor.colony||'A'}] | grief ${agent.griefLevel.toFixed(2)} trust ${agent.trustCharge.toFixed(2)}`,
            'crisis'
          );
        }
        break;
    }
  }
};
