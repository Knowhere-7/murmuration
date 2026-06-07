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
    this.radius = 2.5;

    // ST-1 Trust Battery
    this.trustCharge = personality.trustBaseline || 0.5;

    // ST-2 Grief Variable
    this.griefLevel  = 0;
    this.griefState  = 'ACTIVE'; // ACTIVE | GRIEVING | CRISIS | SEPPUKU_COMPLETE | DISHONORED | GRIEF_SENTINEL
    this.graceTimer  = 0;        // ticks spent in CRISIS
    this.wisdomScore = 0;        // permanent scar — recovered grief becomes vigilance
    this.isSentinel  = false;    // designated by world — locked at grief=1.0
    this.seppukuDone = false;

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
    const newBelief       = avgBelief * 0.4 + signalInfluence * 0.6;

    // Grief increases memory weight — loss written deeper
    const griefMemMod = 1 + this.griefLevel * 0.6;
    const memWeight   = this.personality.memoryWeight * griefMemMod;
    const memoryInfluence = this.memory.slice(-5)
      .reduce((s, m) => s + m.beliefUpdate, 0) / Math.max(1, this.memory.length) * memWeight;

    this.beliefState[topic] = Math.max(-1, Math.min(1,
      newBelief * 0.7 + memoryInfluence * 0.3
    ));

    this.memory.push({ signal: envSignal, beliefUpdate: newBelief - (this.beliefState[topic] || 0) });
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
   * strings go gold, user decides: implement (Force Evolution) or trash.
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
    const margin = 60;
    const edgeForce = 0.08;
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

    // ACTIVE / GRIEVING / CRISIS — violet/pink palette, agents are the show
    const belief = this.beliefState.current || 0;
    const energy = this.energy != null ? this.energy : 1;
    const beliefHue   = 272 + belief * 52;          // 220 blue-violet → 272 violet → 324 neon pink

    // Spectral accents — high-evolution drifts toward magenta, high-faith warms toward gold
    const evo         = Math.min(1, (this.evolution || 0) / 3);  // saturates at evo=3
    const faithLevel  = this.faith || 0;
    const evoShift    = evo > 0.3 ? (evo - 0.3) / 0.7 * 35 : 0;          // +35 hue toward magenta
    const faithWarm   = faithLevel > 0.5 ? (faithLevel - 0.5) * 2 : 0;   // faith warms the body

    const hue         = beliefHue + evoShift + (this.swarmTint || 0);
    const energyLight = 42 + energy * 20 + faithWarm * 6;         // faith agents burn slightly brighter

    // Cluster density glow — the bigger the group, the brighter and wider the bloom.
    // Additive, so overlapping glows in a dense flock stack into real radiance.
    const cluster = this.clusterSize || 0;
    if (cluster > 1) {
      const intensity  = Math.min(1, (cluster - 1) / 10);    // starts at a pair, full by ~11
      const glowRadius = this.radius + 5 + intensity * 18;   // scaled to smaller agent
      const glowAlpha  = 0.06 + intensity * 0.18;            // slightly stronger to compensate for smaller body
      const grad = ctx.createRadialGradient(
        this.x, this.y, this.radius * 0.5,
        this.x, this.y, glowRadius
      );
      // Dense clusters burst toward neon pink — the civilization blazing
      const bloomHue = hue + intensity * 40;        // violet → pink as crowd grows
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

    // Body — tight contained shadow, dimmer body so core contrast reads clearly
    ctx.shadowBlur  = this.radius * 1.2;           // tighter — less ambient spill into the void
    ctx.shadowColor = `hsl(${hue}, 85%, 55%)`;
    ctx.fillStyle   = `hsl(${hue}, 75%, ${energyLight}%)`;  // body is the color, not the brightness
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Quantum core — pure near-white hot pinpoint; this is the brightest thing on screen
    // Two passes: outer soft corona then sharp white nucleus
    ctx.fillStyle = `hsla(${hue}, 30%, 88%, 0.55)`;  // corona — slightly colored
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 255, 255, 0.92)`;      // nucleus — pure white, no hue
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

    // ST-1 trust ring — violet, tight to the smaller body
    if (this.trustCharge > 0.15) {
      ctx.strokeStyle = `hsla(${hue + 20}, 90%, 70%, ${this.trustCharge * 0.75})`;
      ctx.lineWidth   = 0.8;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 2, 0, Math.PI * 2);
      ctx.stroke();
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
