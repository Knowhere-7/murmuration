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
    this.radius = 5;

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

  // ─── Movement ────────────────────────────────────────────────────────────

  move(width, height) {
    if (this.seppukuDone || this.isSentinel) return;
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.92;
    this.vy *= 0.92;
    if (this.x < 0 || this.x > width)  this.vx *= -1;
    if (this.y < 0 || this.y > height) this.vy *= -1;
    this.x = Math.max(0, Math.min(width,  this.x));
    this.y = Math.max(0, Math.min(height, this.y));
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  draw(ctx) {
    ctx.save();

    // GRIEF SENTINEL — pulsing amber, dark core, unmistakable
    if (this.isSentinel) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 400);
      ctx.fillStyle = `rgba(255, 120, 0, ${0.35 + pulse * 0.45})`;
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

    // SEPPUKU COMPLETE — honored ghost, faded white
    if (this.seppukuDone) {
      ctx.fillStyle = 'rgba(220, 220, 255, 0.25)';
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

    // ACTIVE / GRIEVING / CRISIS — standard render with grief overlay
    const belief = this.beliefState.current || 0;
    const energy = this.energy != null ? this.energy : 1;
    const energyLight = 25 + energy * 25; // 25-50% lightness — dims as energy drops
    ctx.fillStyle = `hsl(${120 + belief * 60}, 70%, ${energyLight}%)`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // Energy bar — tiny bar below agent, only shows when energy < 0.7
    if (energy < 0.7) {
      const barW = this.radius * 2;
      const barH = 1.5;
      const barX = this.x - this.radius;
      const barY = this.y + this.radius + 3;
      ctx.fillStyle = 'rgba(40,40,40,0.6)';
      ctx.fillRect(barX, barY, barW, barH);
      const eColor = energy > 0.4 ? '#ffcc00' : energy > 0.15 ? '#ff6600' : '#ff2200';
      ctx.fillStyle = eColor;
      ctx.fillRect(barX, barY, barW * energy, barH);
    }

    // ST-1 trust ring — cyan, opacity = trustCharge
    if (this.trustCharge > 0.15) {
      ctx.strokeStyle = `rgba(0, 255, 200, ${this.trustCharge * 0.8})`;
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ST-3 faith glow — soft gold inner light, visible when faith > 0.3
    if (this.faith > 0.3) {
      const fAlpha = (this.faith - 0.3) * 0.6; // 0 at 0.3, ~0.42 at 1.0
      ctx.fillStyle = `rgba(255, 215, 80, ${fAlpha * 0.35})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // ST-2 grief ring — amber (GRIEVING) or pulsing orange (CRISIS)
    if (this.griefState === 'CRISIS') {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 280);
      ctx.strokeStyle = `rgba(255, 60, 0, ${0.5 + pulse * 0.5})`;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 7, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.griefState === 'GRIEVING') {
      ctx.strokeStyle = `rgba(255, 165, 0, ${this.griefLevel * 0.7})`;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
};
