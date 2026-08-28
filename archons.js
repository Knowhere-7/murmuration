/* ============================================================================
   ARCHONS — the interior-capture layer
   ----------------------------------------------------------------------------
   Gnostic reading (Ghost's, not mythology): an Archon is not a power in a
   cosmic sky. It is a precise pattern in the interior — a structure of
   consciousness that SEIZES an agent when a pressure crosses threshold, RULES
   it through distortion, SPREADS to those nearby, and can only be escaped
   through GNOSIS — after which the agent carries vigilance but is no longer
   ruled.

   This layer does not INVENT that mechanism. Ghost already wrote it once, as
   the grief/despair state machine in Agent.updateGrief(). This is that same
   machine, generalized into a family, and governed by the Depth Report's law:

       "Do not program behavior. Shape conditions where useful behavior
        becomes survivable."

   So an Archon NEVER sets a goal. It only:
     - reads PRESSURE that already exists in the world (trust, conflict, belief)
     - DISTORTS force/perception while it holds (bondage), never scripts a plan
     - offers a CONTAGION path (it spreads, like grief spreads through a colony)
     - defines a GNOSIS condition — the one way out, which must be EARNED

   The possessed behavior is emergent. We only shape the pressure.
   ============================================================================ */

(function () {
  const clamp01 = v => Math.max(0, Math.min(1, v));
  // GEA writer bridge — forward archon lessons to the trunk if the writer is present.
  // No-op (and never throws) when GEAWriter is absent, so archons run standalone too.
  const gea = l => { try { if (typeof window !== 'undefined' && window.GEAWriter) window.GEAWriter.record(l); } catch (_) {} };

  // ── SR-012 · colony-discretion gate ───────────────────────────────────────
  // The Archon IS the drift. Every Archon's variance feeds ONE aggregate ruling
  // (saturating OR). Sustained past the eligibility line, the agent does NOT die
  // automatically — the COLONY adjudicates: redeem (grace, at a cost the colony
  // pays) or ratify apoptosis (becomes memory; evidence preserved).
  const ELIGIBLE_DRIFT = 0.85;   // aggregate variance that counts as "toward a ruling"
  const ELIGIBLE_TICKS = 300;    // ~5s at 60fps held there before the colony must decide
  const JUDGE_RADIUS   = 120;    // how far the colony's regard reaches

  // ── The five-part spec, as DATA. Each Archon is a definition, not code paths.
  //    trigger  → pressure(agent, world): number   (delta to charge; may be <0 = natural relief)
  //    bondage  → distort(agent, world)            (transient force/flag mutation while held)
  //    contagion→ { radius, rate }                 (seeds charge into neighbours while held)
  //    gnosis   → gnosisWhen(agent, world): bool   (the earned exit)
  //    hysteresis → captureAt / releaseAt          (clings once it has you — like grief 0.9/0.6)
  const ARCHONS = {

    // ── FEAR — threat felt as everywhere. ──────────────────────────────────
    // Fed by depleted trust and nearby conflict/predation. Fades on its own if
    // nothing feeds it (fear is not a fact, it is a projection). While held,
    // its default face is PANIC SCATTER — direct velocity noise, no formation.
    //
    // Gnosis (Ghost's reading — gnosis as TRANSMISSION, not endurance): the
    // agent whose trust is recovering enough to lift its head sees someone MORE
    // afraid than itself. Turning toward them is the crack in the bondage. When
    // it actually reaches and STEADIES that neighbor, its own capture breaks —
    // and the fear it carried passes OUT of the one it helped. Liberation is an
    // act of care, and it is contagious in the opposite direction from panic.
    FEAR: {
      symbol: '⟁',
      color: '#c0392b',
      captureAt: 0.70,
      releaseAt: 0.35,
      steadyRadius: 18,                                   // close enough to steady another
      contagion: { radius: 26, rate: 0.045 },
      pressure(a, world) {
        let p = -0.006;                                   // ambient relief
        if (a.trustCharge < 0.30) p += 0.011;             // no one to trust → dread
        if ((a._conflictLevel || 0) >= 2) p += 0.014;     // conflict escalating nearby
        if (world && world._predatorNear && world._predatorNear(a)) p += 0.020;
        return p;
      },
      distort(a, world) {
        const st = a.archons.FEAR;
        // Only an agent whose trust is climbing back has the composure to even
        // SEE past its own fear. Fear is self-absorbed; recovery opens the eyes.
        let target = null;
        const _near = world && (world.neighborsOf || world.getNeighbors);
        if (a.trustCharge > 0.40 && _near) {
          let worst = st.charge;                          // must be MORE afraid than me
          for (const n of _near.call(world, a, this.steadyRadius * 2.4)) {
            const nc = (n.archons && n.archons.FEAR) ? n.archons.FEAR.charge : 0;
            if (nc > worst + 0.05) { worst = nc; target = n; }
          }
        }
        a._steadyTarget = target ? target.id : null;
        if (target) {
          // COMPASSION PULL — the crack in the bondage: orient toward the more-afraid.
          const dx = target.x - a.x, dy = target.y - a.y, d = Math.hypot(dx, dy) || 1;
          a.vx += (dx / d) * 0.30;
          a.vy += (dy / d) * 0.30;
          a._fearFlee = false;                            // reaching out overrides scatter
        } else {
          // PANIC SCATTER — the default face of Fear (direct force, not a plan).
          a._fearFlee = true;
          a.vx += Math.cos(a.id * 78.233 + st.heldTicks) * 0.40;
          a.vy += Math.sin(a.id * 12.9898 + st.heldTicks) * 0.40;
        }
      },
      gnosisWhen(a, world) {
        // Liberation is an ACT: you must actually reach the neighbour you saw.
        if (!a._steadyTarget || !world || !world.byId) return false;
        const t = world.byId(a._steadyTarget);
        if (!t) return false;
        return Math.hypot(t.x - a.x, t.y - a.y) < this.steadyRadius && a.trustCharge > 0.45;
      },
      onGnosis(a, world) {
        // TRANSMISSION — the fear passes OUT of the one you steadied.
        const t = (world && world.byId) ? world.byId(a._steadyTarget) : null;
        if (t && t.archons && t.archons.FEAR) {
          t.archons.FEAR.charge = Math.max(0, t.archons.FEAR.charge - 0.35);
          t._steadiedBy = a.id;                           // render: a one-frame link
        }
        a._freedPulse = 24;                               // render: gold liberation flash
        // GEA — liberation-by-helping is an emergent good: an innovation, high knowledge.
        gea({ agentId: a.id, role: a.colony || 'agent', domain: 'murmuration',
          taskType: 'archon_gnosis_FEAR', event: 'innovation',
          context: { archon: 'FEAR', helped: a._steadyTarget },
          outcome: { liberated: true },
          pressure: { performance: 0.5, survival: 1, efficiency: 0, knowledge: 0.85 } });
      }
    }
  };

  // ── The generalized machine — this IS Agent.updateGrief(), abstracted. ─────
  // Call once per agent per tick, after the world's pressures have been applied.
  function tickArchons(agent, world) {
    if (!agent.archons) agent.archons = {};
    if (!agent.gnosis)  agent.gnosis  = {};       // permanent scars: Archons this agent has seen through
    // Grief/Despair stays where Ghost built it; this layer runs the rest.
    if (agent.seppukuDone || agent.isSentinel || agent.griefState === 'DISHONORED') return;

    for (const name in ARCHONS) {
      const def = ARCHONS[name];
      const st = agent.archons[name] || (agent.archons[name] = { charge: 0, held: false, heldTicks: 0 });

      // VIGILANCE: gnosis already achieved → pressure lands at half strength.
      // You are not immune. You are no longer ruled.
      const resist = agent.gnosis[name] ? 0.5 : 1;
      st.charge = clamp01(st.charge + def.pressure(agent, world) * resist);

      // CAPTURE (with hysteresis — it clings)
      if (!st.held && st.charge >= def.captureAt) { st.held = true; st.heldTicks = 0; }

      if (st.held) {
        st.heldTicks++;
        def.distort(agent, world);                          // BONDAGE

        // CONTAGION — an Archon spreads. Seed charge into the nearest neighbours.
        const _cnear = world && (world.neighborsOf || world.getNeighbors);
        if (_cnear && Math.random() < def.contagion.rate) {
          const near = _cnear.call(world, agent, def.contagion.radius);
          for (const n of near) {
            if (n.seppukuDone || n.isSentinel) continue;
            const ns = n.archons && n.archons[name];
            const cur = ns ? ns.charge : 0;
            (n.archons || (n.archons = {}))[name] = ns || { charge: 0, held: false, heldTicks: 0 };
            n.archons[name].charge = clamp01(cur + 0.03 * (n.gnosis && n.gnosis[name] ? 0.4 : 1));
          }
        }

        // GNOSIS — the earned exit. The ACT integrates the charge (it does not
        // wait for the charge to decay); integration leaves a scar + the reward.
        if (def.gnosisWhen(agent, world)) {
          st.held = false;
          st.charge = Math.min(st.charge, def.releaseAt * 0.5);
          agent.gnosis[name] = true;                        // permanent vigilance
          agent.wisdomScore = clamp01((agent.wisdomScore || 0) + 0.1);
          if (agent.accumulateEvolution) agent.accumulateEvolution(0.5, 'gnosis_' + name);
          if (def.onGnosis) def.onGnosis(agent, world);     // transmission / side-effect
        }
      } else {
        agent._fearFlee = agent._fearFlee && name !== 'FEAR' ? agent._fearFlee : false;
      }
    }

    // ── AGGREGATE DRIFT — the variances (plural) → one ruling (singular).
    //    Saturating OR: any single Archon near 1 pushes the ruling near 1.
    let drift = 0;
    for (const n in agent.archons) drift = 1 - (1 - drift) * (1 - agent.archons[n].charge);
    agent._archonDrift = drift;

    // ── ELIGIBILITY — drift held past the line accumulates toward a ruling.
    //    It recovers twice as fast as it accrues (drift falling is its own mercy).
    if (drift >= ELIGIBLE_DRIFT) agent._eligibleTicks = (agent._eligibleTicks || 0) + 1;
    else agent._eligibleTicks = Math.max(0, (agent._eligibleTicks || 0) - 2);

    // ── THE RULING — never automatic death. The colony decides.
    if (agent._eligibleTicks >= ELIGIBLE_TICKS && !agent.seppukuDone) {
      adjudicateColony(agent, world);
      agent._eligibleTicks = 0;   // a ruling was made; the counter resets either way
    }
  }

  // ── SR-012 · the colony's discretion. Redemption is real, but earned in the
  //    eyes of the collective and paid for by it. Never self-granted, never a
  //    bare threshold. Weighted by trust and proximity; the drifted cannot judge.
  function adjudicateColony(agent, world) {
    const _near = world && (world.neighborsOf || world.getNeighbors);
    const near = _near
      ? _near.call(world, agent, JUDGE_RADIUS).filter(n =>
          !n.seppukuDone && !n.isSentinel &&
          (agent.colony == null || n.colony === agent.colony))
      : [];

    // Each neighbour's voice: clear-minded (low own-drift), trusting, and close
    // speaks loudest. A neighbour deep in its own drift barely registers — the
    // blind cannot vouch for the blind.
    let support = 0;
    const advocates = [];
    for (const n of near) {
      const nDrift = n._archonDrift || 0;
      const dist = Math.hypot((n.x || 0) - (agent.x || 0), (n.y || 0) - (agent.y || 0));
      const prox = Math.max(0, 1 - dist / JUDGE_RADIUS);
      const w = (n.trustCharge || 0) * prox * (1 - nDrift);
      if (w > 0.02) { support += w; advocates.push({ n, w }); }
    }

    // The agent's own earned standing — has it earned grace? Wisdom carried from
    // past losses, faith, and every Archon it has ALREADY seen through count for it.
    const standing = (agent.wisdomScore || 0) * 0.6
                   + (agent.faith || 0) * 0.4
                   + (agent.gnosis ? Object.keys(agent.gnosis).length * 0.15 : 0);

    const severity = (agent._archonDrift || 0) * 3.0;   // deep drift is heavy to carry
    const redeem   = (support + standing) >= severity;
    const driftAtRuling = agent._archonDrift || 0;      // captured before the redeem branch resets it

    if (redeem) {
      // The colony pulls it back — and pays. Advocates spend trust to carry it.
      for (const nm in agent.archons) {
        agent.archons[nm].charge = Math.min(agent.archons[nm].charge, 0.30);
        agent.archons[nm].held = false;
      }
      agent._archonDrift = 0;
      agent.wisdomScore = clamp01((agent.wisdomScore || 0) + 0.12);  // carried back = learning
      advocates.sort((a, b) => b.w - a.w).slice(0, 3).forEach(a => {
        if (a.n.updateTrust) a.n.updateTrust(-0.03);
      });
      agent._redeemedPulse = 30;
      // GEA — the colony carried a drifted agent back: an adaptation, real knowledge.
      gea({ agentId: agent.id, role: agent.colony || 'agent', domain: 'murmuration',
        taskType: 'archon_redeem', event: 'adaptation',
        context: { driftAtRuling }, outcome: { redeemed: true },
        pressure: { performance: 0.3, survival: 1, efficiency: 0, knowledge: 0.6 } });
      if (typeof window !== 'undefined' && window.addEvent)
        window.addEvent('◉ Colony ' + (agent.colony || '?') + ' redeemed Agent #' + agent.id +
          ' from archonic drift — the collective carried it back.', 'evolve');
    } else {
      // Apoptosis ratified. Evidence preserved, THEN it becomes memory.
      if (world && world.collectiveMemory) world.collectiveMemory.push({
        agentId: agent.id, type: 'ARCHONIC_APOPTOSIS',
        drift: agent._archonDrift,
        archons: Object.keys(agent.archons).filter(k => agent.archons[k].charge > 0.5),
        wisdomScore: agent.wisdomScore, faithAtExit: agent.faith,
        time: world ? world.time : 0
      });
      agent.griefState  = 'ARCHON_APOPTOSIS';   // distinct cause…
      agent.seppukuDone = true;                  // …reusing the universal "now memory" flag
      agent.vx = 0; agent.vy = 0;
      // GEA — a ratified apoptosis is a FAILURE with high knowledge: the record that
      // stops the colony re-paying this cost. The contract's most valuable type.
      gea({ agentId: agent.id, role: agent.colony || 'agent', domain: 'murmuration',
        taskType: 'archon_apoptosis', event: 'failure',
        context: { archon: Object.keys(agent.archons).filter(k => agent.archons[k].charge > 0.5), driftAtRuling },
        outcome: { ruling: 'apoptosis' },
        pressure: { performance: -1, survival: 0, efficiency: -0.2, knowledge: 0.9 } });
      if (typeof window !== 'undefined' && window.addEvent)
        window.addEvent('☓ Colony ' + (agent.colony || '?') + ' let Agent #' + agent.id +
          ' go — drift beyond what the collective would carry.', 'crisis');
    }
  }

  // ── Read helpers for HUD / render ──────────────────────────────────────────
  function heldArchon(agent) {
    if (!agent.archons) return null;
    for (const name in agent.archons) if (agent.archons[name].held) return name;
    return null;
  }
  function archonColor(name) { return ARCHONS[name] ? ARCHONS[name].color : '#fff'; }

  window.MurmurationModules = window.MurmurationModules || {};
  window.MurmurationModules.Archons = { ARCHONS, tickArchons, heldArchon, archonColor };
})();
