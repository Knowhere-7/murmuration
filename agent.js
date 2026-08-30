/**
 * Agent Class for Murmuration
 * Personality-driven, rule-based swarm agent.
 * Gnosquam bio-traits inspired.
 *
 * ST-1 Trust Battery   — dynamic earned authority replacing static trust
 * ST-2 Grief Variable  — behavioral modifier triggered by significant loss
 *                        Three exits: Seppuku (honored), Dishonor (cost of selfishness),
 *                        NEMESIS (refusers — handled externally, not here)
 */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.Agent = class Agent {
  constructor(id, x, y, personality = {}) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.personality = {
      riskTolerance: personality.riskTolerance || Math.random(),
      trustBaseline:  personality.trustBaseline  || 0.5,
      reactivity:     personality.reactivity     || 0.7,
      memoryWeight:   personality.memoryWeight   || 0.6
    };
    this.memory      = [];
    this.beliefState = {};
    this.vx = 0;
    this.vy = 0;
    this.radius = 1.2;

    // ST-1 Trust Battery
    this.trustCharge = personality.trustBaseline || 0.5;

    // ST-2 Grief Variable
    this.griefLevel  = 0;
    this.griefState  = 'ACTIVE'; // ACTIVE | GRIEVING | CRISIS | SEPPUKU_COMPLETE | DISHONORED | GRIEF_SENTINEL
    this.graceTimer  = 0;        // ticks spent in CRISIS
    this.wisdomScore = 0;        // permanent scar — recovered grief becomes vigilance
    this.isSentinel  = false;    // designated by world — locked at grief=1.0
    this.seppukuDone = false;

    // WAR HONOR — earned through CTF attrition kills, plus a steady trickle for
    // any common soldier (below GENERAL) who actually stands in a fight.
    // Rank ladder while alive: GRUNT → DECORATED → VETERAN → GENERAL → HERO.
    // KING is a single unique title per colony, held by whoever is alive with
    // the most honor — it passes on death or on being outranked.
    // Dying in battle (never seppuku) always earns a posthumous tier too — not
    // from title, but from the actual effort and honor brought to the clan:
    // HERO, then LEGEND, then GOD for the very greatest contributors.
    this.honor      = 0;
    this.rank       = 'GRUNT';
    this.isKing     = false;
    this.fallenRank = null; // null | 'HERO' | 'LEGEND' | 'GOD' — set only on battle death

    // ST-3 Faith — belief in something larger than self
    this.faith       = 0.1 + Math.random() * 0.15;  // everyone starts with a seed
    this.evolution   = 0;        // accumulated knowledge from ancestors — the point of it all

    // Persistent wander heading — each agent has its own slowly-rotating direction
    // This is what makes different agents naturally go different ways
    this.wanderAngle = Math.random() * Math.PI * 2;
    this.wanderRate  = (Math.random() - 0.5) * 0.04; // how fast the heading rotates (unique per agent)

    // Conflict state — four-option decision system (yield/negotiate/withdraw/escalate)
    this._conflictWith   = null;  // agent ID of current conflict partner
    this._conflictTicks  = 0;     // ticks spent in this conflict
    this._conflictLevel  = 0;     // 0=none 1=domestic 2=local 3=civil 4=revolutionary
    this._lastDecision   = null;  // 'yield'|'negotiate'|'withdraw'|'escalate'

    // Evolution accumulation — earned through adversity, not assigned
    this._evolutionAccumulator = 0; // running tally of earned experience events
    this._evolutionReady       = false; // true when enough is accumulated for user to inspect/implement
    this._evolutionPulseTimer  = 0;    // drives the radiate animation on gold strings
    this._highTrustTicks       = 0;    // consecutive ticks above the trust threshold
  }

  // ─── ST-1 ────────────────────────────────────────────────────────────────

  updateTrust(delta) {
    this.trustCharge = Math.max(0.05, Math.min(1.0, this.trustCharge + delta));
  }

  // ─── ST-2 ────────────────────────────────────────────────────────────────

  /**
   * Apply a grief delta. Sentinel and completed agents are locked — no update.
   * Transitions state machine and increments graceTimer while in CRISIS.
   */
  updateGrief(delta) {
    if (this.isSentinel || this.seppukuDone) return;
    if (this.griefState === 'DISHONORED') return;

    // Faith dampens grief — loss still hurts, but meaning lets you carry it
    const faithDamper = delta > 0 ? (1 - this.faith * 0.45) : 1; // faith doesn't slow healing
    this.griefLevel = Math.max(0, Math.min(1, this.griefLevel + delta * faithDamper));

    if (this.griefLevel >= 0.9) {
      if (this.griefState !== 'CRISIS') {
        this.griefState = 'CRISIS';
        this.graceTimer = 0;
      }
    } else if (this.griefLevel >= 0.3) {
      if (this.griefState === 'ACTIVE') this.griefState = 'GRIEVING';
    } else {
      if (this.griefState === 'GRIEVING') {
        // Recovered — earn wisdom from the loss
        this.griefState  = 'ACTIVE';
        this.wisdomScore = Math.min(1, this.wisdomScore + 0.1);
        // Grief survived and integrated = the deepest learning event
        this.accumulateEvolution(0.5, 'grief_recovery');
      }
    }
  }

  /**
   * Evaluate whether seppuku is the right choice.
   * Checks 3 criteria — 2 of 3 must be met.
   * Honor requires choice. The system cannot impose it.
   */
  evaluateSeppuku() {
    if (this.griefLevel < 0.9 || this.seppukuDone || this.isSentinel) return false;
    let criteria = 0;
    if (this.trustCharge < 0.2) criteria++;
    const belief = Math.abs(this.beliefState.current || 0);
    if (belief < 0.05) criteria++; // lost the signal entirely
    const recentUpdates = this.memory.slice(-5).map(m => m.beliefUpdate);
    const avgUpdate = recentUpdates.length
      ? recentUpdates.reduce((s, v) => s + v, 0) / recentUpdates.length
      : 0;
    if (avgUpdate < 0) criteria++; // worsening, not healing
    // Prolonged unresolved crisis is itself proof there is no path back.
    // An agent deep in its grace window with depleted trust should not need
    // to also lose the signal — the time spent in crisis IS the evidence.
    if (this.graceTimer > 420) criteria++; // ~7 seconds at 60fps
    return criteria >= 2;
  }

  /**
   * Perform seppuku.
   * 1. Distribute trust to bonded survivors.
   * 2. Write to world collective memory.
   * 3. Clean exit — no noise, no damage.
   */
  performSeppuku(world) {
    // A King who chooses seppuku vacates the crown but earns no posthumous
    // tier — HERO/LEGEND/GOD are reserved for those who fall in battle, not
    // by their own hand.
    if (this.isKing) {
      this.isKing = false;
      if (window.addEvent) window.addEvent('♛ Colony ' + this.colony + "'s KING has chosen seppuku — the crown passes on, but no honor tier is earned this way.", 'crisis');
    }

    // 1. Redistribute trust to top bonded neighbors
    const neighbors = world.getNeighbors(this, 100);
    const top = neighbors
      .sort((a, b) => b.trustCharge - a.trustCharge)
      .filter(n => !n.seppukuDone && !n.isSentinel)
      .slice(0, 3);
    const share = (this.trustCharge - 0.05) / Math.max(1, top.length);
    for (const n of top) n.updateTrust(share);

    // 2. Collective memory — last gift at 2.0× weight (handled in extractor)
    world.collectiveMemory.push({
      agentId: this.id,
      wisdomScore: this.wisdomScore,
      beliefAtExit: this.beliefState.current || 0,
      trustAtExit: this.trustCharge,
      faithAtExit: this.faith,
      evolution: this.evolution,
      time: world.time,
      type: 'SEPPUKU'
    });

    // 3. Sacred ground — where honor was chosen, the ground remembers
    if (!world.sacredGrounds) world.sacredGrounds = [];
    world.sacredGrounds.push({
      x: this.x,
      y: this.y,
      wisdom: this.wisdomScore,
      faith: this.faith,
      evolution: this.evolution,
      time: world.time,
      agentId: this.id,
      strength: 1.0 // fades over time
    });

    // 4. Clean state
    this.trustCharge          = 0.05;
    this.griefLevel           = 0;
    this.griefState           = 'SEPPUKU_COMPLETE';
    this.seppukuDone          = true;
    this._seppukuTick         = world.time;
    this.beliefState.current  = 0;
    this.vx = 0;
    this.vy = 0;

    // GEA — seppuku is an agent choosing the group over itself: a FAILURE (it dies)
    // that carries real wisdom (high knowledge). The lesson survives the agent.
    try {
      if (typeof window !== 'undefined' && window.GEAWriter) window.GEAWriter.record({
        agentId: this.id, role: this.colony || 'agent', domain: 'murmuration',
        taskType: 'seppuku', event: 'failure',
        context: { wisdom: this.wisdomScore, faith: this.faith },
        outcome: { chose: 'group_over_self' },
        pressure: { performance: -1, survival: 0, efficiency: 0, knowledge: Math.max(0, Math.min(1, 0.4 + (this.wisdomScore || 0) * 0.6)) }
      });
    } catch (_) {}
  }

  // ─── Belief ──────────────────────────────────────────────────────────────

  updateBelief(neighborBeliefs, envSignal) {
    // Grief modulates reactivity — the grieving move more slowly
    const griefReactMod = this.griefState === 'GRIEVING' ? (1 - this.griefLevel * 0.4)
                        : this.griefState === 'CRISIS'   ? (1 - this.griefLevel * 0.6)
                        : 1;

    const trust = this.trustCharge;
    const react = this.personality.reactivity * griefReactMod;

    let avgBelief = 0, count = 0;
    for (const nb of neighborBeliefs) {
      avgBelief += nb.strength * trust;
      count++;
    }
    if (count > 0) avgBelief /= count;

    const signalInfluence = envSignal * react;
    const topic           = 'current';
    // Clamped to the legal belief range. Unclamped, a high-reactivity agent in
    // a disturbed world computes a "belief" of 3.6+ and then saturates against
    // the clamp below, which is how the population froze at 1.0.
    const newBelief       = Math.max(-1, Math.min(1,
      avgBelief * 0.4 + signalInfluence * 0.6));

    // Grief increases memory weight — loss written deeper
    const griefMemMod = 1 + this.griefLevel * 0.6;
    const memWeight   = this.personality.memoryWeight * griefMemMod;
    const memoryInfluence = this.memory.slice(-5)
      .reduce((s, m) => s + m.beliefUpdate, 0) / Math.max(1, this.memory.length) * memWeight;

    // PREV IS CAPTURED BEFORE THE WRITE.
    //
    // Measured 2026-08-15: every agent's memory was a flat line of the SAME
    // impossible number (3.5999 repeated), and belief sat pinned at the clamp.
    // Two faults, compounding:
    //
    //   1. `newBelief` was never clamped. signalInfluence = envSignal *
    //      reactivity, and with envSignal = 2 (disturbance 1 + anomaly 1) and
    //      reactivity up to ~3 it overshoots to 3.6+, so belief saturated at
    //      1.0 and could never come back down.
    //   2. beliefUpdate was computed against beliefState AFTER that field had
    //      already been overwritten, so it stored (unclamped - clamped) — a
    //      constant — instead of the change in belief.
    //
    // A constant in memory makes memoryInfluence a constant, which pins belief,
    // which makes getAction() return the same verdict forever. 43 of 60 agents
    // had beliefs that moved less than 0.01 across 200 ticks: they were not
    // deciding, they were repeating.
    //
    // headless/agent.py:211-214 always had this right — capture prev, then
    // store (new - prev). This restores the browser engine to its own reference.
    const prev = this.beliefState[topic] || 0;

    this.beliefState[topic] = Math.max(-1, Math.min(1,
      newBelief * 0.7 + memoryInfluence * 0.3
    ));

    this.memory.push({ signal: envSignal, beliefUpdate: this.beliefState[topic] - prev });
    if (this.memory.length > 10) this.memory.shift();
  }

  getAction(neighbors) {
    if (this.seppukuDone || this.isSentinel) return 'ignore';
    const myBelief = this.beliefState.current || 0;
    let action = 'ignore', maxDiff = 0;
    for (const nb of neighbors) {
      const diff = Math.abs(myBelief - (nb.beliefState.current || 0));
      if (diff > maxDiff) {
        maxDiff = diff;
        action  = diff > 0.5 ? 'oppose' : 'influence';
      }
    }
    return action;
  }

  // ─── Evolution accumulation ──────────────────────────────────────────────

  /**
   * Called when a genuine behavioral learning event occurs.
   * Reasons: 'grief_recovery' | 'disaster_survival' | 'sustained_trust'
   * When accumulator crosses the threshold, agent enters _evolutionReady state —
   * strings turn gold — oldest accumulated knowledge base becomes visible.
   * User decides: implement (Force Evolution) or trash.
   */
  accumulateEvolution(delta, reason) {
    if (this.seppukuDone || this.isSentinel) return;
    this._evolutionAccumulator = Math.min(2.0, (this._evolutionAccumulator || 0) + delta);
    if (!this._evolutionReady && this._evolutionAccumulator >= 0.7) {
      this._evolutionReady      = true;
      this._evolutionPulseTimer = 999999; // holds until user acts
    }
  }

  // ─── Movement ────────────────────────────────────────────────────────────

  move(width, height) {
    if (this.seppukuDone || this.isSentinel) return;

    // Speed cap — prevents runaway velocity while keeping swooping feel
    const speed = Math.hypot(this.vx, this.vy);
    const maxSpeed = 2.5;
    if (speed > maxSpeed) {
      this.vx = (this.vx / speed) * maxSpeed;
      this.vy = (this.vy / speed) * maxSpeed;
    }

    // Soft edge repulsion — gradual push instead of hard bounce
    // Each agent hits the edge zone at a different position, breaking sync
    const margin = 95;
    const edgeForce = 0.16;
    if (this.x < margin)          this.vx += (margin - this.x) / margin * edgeForce;
    if (this.x > width - margin)  this.vx -= (this.x - (width - margin)) / margin * edgeForce;
    if (this.y < margin)          this.vy += (margin - this.y) / margin * edgeForce;
    if (this.y > height - margin) this.vy -= (this.y - (height - margin)) / margin * edgeForce;

    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.95;  // lighter damping — momentum carries
    this.vy *= 0.95;

    // Hard clamp as safety net only
    this.x = Math.max(2, Math.min(width - 2,  this.x));
    this.y = Math.max(2, Math.min(height - 2, this.y));
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  draw(ctx) {
    ctx.save();

    // GRIEF SENTINEL — pulsing amber, dark core, unmistakable
    if (this.isSentinel) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 400);
      ctx.fillStyle = `rgba(220, 120, 20, ${0.35 + pulse * 0.45})`; // Ember
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0d0300';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius - 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // SEPPUKU COMPLETE — honored ghost, Aged Paper
    if (this.seppukuDone) {
      ctx.fillStyle = 'rgba(237, 230, 214, 0.22)';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // DISHONORED — dark red, no ring, no light
    if (this.griefState === 'DISHONORED') {
      ctx.fillStyle = '#3a0000';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // UNALIGNED — clinical red-white. No warmth, no faith glow, no cooperative signal.
    // They're not broken — they're optimized for self. That's the problem.
    if (this.colony === 'U') {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 600);
      const trust = this.trustCharge || 0;
      const alive = 0.3 + trust * 0.5;

      // Body — harsh red, dim when low trust (they're draining themselves)
      ctx.shadowBlur  = this.radius * 1.8;
      ctx.shadowColor = `rgba(255,50,30,${alive})`;
      ctx.fillStyle   = `hsl(4, 95%, ${38 + trust * 18}%)`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Hot white core — same as aligned but cold, no hue tint
      ctx.fillStyle = `rgba(255,200,190,0.5)`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,0.9)`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * 0.28, 0, Math.PI * 2);
      ctx.fill();

      // Trust ring — red not violet; shows they DO have a trust battery, they just don't share it
      if (trust > 0.15) {
        ctx.strokeStyle = `rgba(255,80,50,${trust * 0.7})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Crisis ring — same as aligned (they still die)
      if (this.griefState === 'CRISIS') {
        ctx.strokeStyle = `rgba(255,70,50,${0.5 + pulse * 0.5})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 4.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
      return;
    }

    // ACTIVE / GRIEVING / CRISIS — each colony holds its own hue family so they
    // always read apart: Knowhere (A) is turquoise, Mainland (B) is pink.
    const belief = this.beliefState.current || 0;
    const energy = this.energy != null ? this.energy : 1;
    const isMainland  = this.colony === 'B';
    const baseHue     = isMainland ? 326 : 176;               // Mainland pink · Knowhere turquoise
    const wobbleDir   = isMainland ? -1 : 1;                  // wobble inward, never toward the other family
    const beliefHue   = baseHue + wobbleDir * (belief * 16 - 8);   // gentle ±8 wobble within the family

    // Spectral accents — high-evolution and dense clusters deepen/brighten rather
    // than shift hue across colonies, so identity never blurs between the two
    const evo         = Math.min(1, (this.evolution || 0) / 3);  // saturates at evo=3
    const faithLevel  = this.faith || 0;
    const evoShift    = evo > 0.3 ? wobbleDir * (evo - 0.3) / 0.7 * 10 : 0;   // small in-family drift
    const faithWarm   = faithLevel > 0.5 ? (faithLevel - 0.5) * 2 : 0;   // faith warms the body

    const hue         = beliefHue + evoShift;
    const energyLight = 52 + energy * 22 + faithWarm * 6;         // brighter base — faith agents burn even more

    // Cluster density glow — the bigger the group, the brighter and wider the bloom.
    // Additive, so overlapping glows in a dense flock stack into real radiance.
    //
    // SUPPRESSED IN MAZE MODE. In open water this bloom IS the point — it makes
    // a civilization legible at a glance. Inside a 114x57 corridor it is a
    // light-flare: a packed group stacks additively into a white blob that
    // erases the very walls the run is about, and makes 1.2px agents read as
    // enormous. Bodies and rings still draw, so trust/grief/faith stay visible.
    // Agents hold no world back-reference, so the flag is read from the module
    // registry that agent.js already lives in.
    const mz = window.MurmurationModules && window.MurmurationModules.activeMaze;
    const mazeActive = !!(mz && mz.active);
    const cluster = mazeActive ? 0 : (this.clusterSize || 0);
    if (cluster > 1) {
      const intensity  = Math.min(1, (cluster - 1) / 10);    // starts at a pair, full by ~11
      const glowRadius = this.radius + 5 + intensity * 18;   // scaled to smaller agent
      const glowAlpha  = 0.12 + intensity * 0.26;            // brighter bloom so dense clusters read clearly
      const grad = ctx.createRadialGradient(
        this.x, this.y, this.radius * 0.5,
        this.x, this.y, glowRadius
      );
      // Dense clusters burn brighter and deeper into their own hue family — the
      // civilization blazing, without crossing into the other colony's color
      const bloomHue = hue + wobbleDir * intensity * 16;
      grad.addColorStop(0, `hsla(${bloomHue}, ${90 - intensity * 20}%, ${55 + intensity * 20}%, ${glowAlpha})`);
      grad.addColorStop(1, `hsla(${bloomHue}, 90%, 50%, 0)`);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(this.x, this.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Body — brighter, more luminous shadow so the swarm reads clearly against the void
    ctx.shadowBlur  = this.radius * 1.7;
    ctx.shadowColor = `hsl(${hue}, 90%, 65%)`;
    ctx.fillStyle   = `hsl(${hue}, 85%, ${energyLight}%)`;  // body is the color, not the brightness
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Quantum core — pure near-white hot pinpoint; this is the brightest thing on screen
    // Two passes: outer soft corona then sharp white nucleus
    ctx.fillStyle = `hsla(${hue}, 30%, 90%, 0.7)`;  // corona — slightly colored
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 255, 255, 0.97)`;      // nucleus — pure white, no hue
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.28, 0, Math.PI * 2);
    ctx.fill();

    // ST-3 faith glow — soft gold halo
    if (this.faith > 0.3) {
      const fAlpha = (this.faith - 0.3) * 0.7;
      ctx.fillStyle = `rgba(255, 215, 80, ${fAlpha * 0.35})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // THERMAL BALLING — a hostile being cooked glows RED-HOT, brighter and bigger as it nears the cook.
    if (this._beeHeat > 0) {
      const h = Math.min(1, this._beeHeat);
      ctx.fillStyle = `rgba(255, ${Math.round(35 + h * 150)}, ${Math.round(h * h * 50)}, ${0.35 + h * 0.5})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 1 + h * 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // THERMAL BALLING — a baller pushing the ball to EXTREME heats itself: a white glow with a
    // BLUE-HOT core (blue reads hotter than white, and is distinct from the plain white already in use).
    if (this._ballHeat > 0.6) {
      const wq = Math.min(1, (this._ballHeat - 0.6) / 1.0);
      ctx.fillStyle = `rgba(255, 255, 255, ${wq * 0.55})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 1 + wq * 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(90, 160, 255, ${wq * 0.9})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── TACTICIAN DOCTRINE tells (Knowhere) — the behaviour must announce itself ──
    // MIMIC OCTOPUS — an infiltrator wearing LOBO's colours: a red shell over a
    // turquoise Knowhere core (the disguise, and the tell that it IS a disguise).
    if (this._mimicGlow > 0) {
      const m = Math.min(1, this._mimicGlow);
      ctx.fillStyle = `rgba(255, 60, 80, ${m * 0.6})`;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(64, 232, 208, ${m * 0.9})`;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius * 0.5, 0, Math.PI * 2); ctx.fill();
    }
    // FLASHING COMMUNICATION — a turquoise sync pulse rippling through the colony.
    if (this._flashGlow > 0) {
      const f = Math.min(1, this._flashGlow);
      ctx.strokeStyle = `rgba(64, 232, 208, ${f * 0.85})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + 2 + (1 - f) * 5, 0, Math.PI * 2); ctx.stroke();
    }
    // MEERKAT SENTINEL — a lookout: a steady turquoise watch-ring while it holds the ridge.
    if (this._sentinelGlow > 0) {
      const s = Math.min(1, this._sentinelGlow);
      ctx.strokeStyle = `rgba(64, 232, 208, ${s * 0.7})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + 3, 0, Math.PI * 2); ctx.stroke();
    }
    // (CORDYCEPS-seized hosts are LOBO pawns — rendered as black husks in LOBO.draw,
    //  where they can override the crimson; agent.draw does not own them.)

    // ST-1 trust ring — violet, tight to the smaller body
    if (this.trustCharge > 0.15) {
      ctx.strokeStyle = `hsla(${hue + 20}, 90%, 70%, ${this.trustCharge * 0.75})`;
      ctx.lineWidth   = 0.8;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ── ARCHON: FEAR — the interior-capture ring. Panic reads red; an agent that
    //    has turned toward a more-afraid neighbour warms toward gold (the crack in
    //    the bondage). A gold shockwave marks the moment of gnosis.
    const _fear = this.archons && this.archons.FEAR;
    if (_fear && _fear.held) {
      const fp       = 0.5 + 0.5 * Math.sin(Date.now() / 180);
      const reaching = !!this._steadyTarget;
      ctx.strokeStyle = reaching
        ? `rgba(255, 185, 75, ${0.55 + fp * 0.35})`
        : `rgba(205, 55, 42, ${0.45 + fp * 0.50})`;
      ctx.lineWidth = reaching ? 1.4 : 1.1;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 6.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (this._freedPulse > 0) {                          // gnosis — liberation flash
      const t = this._freedPulse / 24;
      ctx.strokeStyle = `rgba(255, 216, 130, ${t * 0.8})`;
      ctx.lineWidth   = 1.6;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 6 + (1 - t) * 15, 0, Math.PI * 2);
      ctx.stroke();
      this._freedPulse--;
    }

    // ST-2 grief ring — amber (GRIEVING) → pulsing red (CRISIS)
    if (this.griefState === 'CRISIS') {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 280);
      ctx.strokeStyle = `rgba(255, 70, 50, ${0.5 + pulse * 0.5})`;
      ctx.lineWidth   = 1.2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 4.5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.griefState === 'GRIEVING') {
      ctx.strokeStyle = `rgba(255, 150, 0, ${this.griefLevel * 0.7})`;
      ctx.lineWidth   = 0.8;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
};
