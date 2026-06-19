/**
 * K2.6 Integration Layer for Murmuration
 * Local orchestration: seed → sim → emergence → Gnosquam output.
 * LLM at edges only (future hook).
 */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.K26 = class K26 {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.world = null;
    this.economy = null;
    this.wealthEngine = null;
    this.warningLog = null;
    this.seedInjector = new window.MurmurationModules.SeedInjector();
    this.interactionEngine = new window.MurmurationModules.InteractionEngine();
    this.evolutionEngine = new window.MurmurationModules.EvolutionEngine();
    this.extractor = new window.MurmurationModules.EmergenceExtractor();
    this.isRunning = false;
    this.animationId = null;
  }

  init(agentCount = 50) {
    const width = this.canvas.width;
    const height = this.canvas.height;
    this.world = new window.MurmurationModules.World(width, height, agentCount);

    // Economy — energy, resources, disaster cycle
    if (window.MurmurationModules.Economy) {
      const scarcityEl = document.getElementById('scarcitySlider');
      this.economy = new window.MurmurationModules.Economy(this.world, {
        scarcityLevel: scarcityEl ? parseFloat(scarcityEl.value) : 0.5
      });
    }

    // Wealth & Social Class — inequality emerges from nothing
    if (window.MurmurationModules.WealthEngine && this.economy) {
      const taxEl = document.getElementById('taxSlider');
      this.wealthEngine = new window.MurmurationModules.WealthEngine(this.world, this.economy, {
        taxRate: taxEl ? parseFloat(taxEl.value) : 0
      });
    }

    // Warning Log — cascade risk tracking
    if (window.MurmurationModules.WarningLog) {
      this.warningLog = new window.MurmurationModules.WarningLog();
    }

    this.draw();
  }

  injectSeeds() {
    if (!this.world) return;
    const signals = window.MurmurationModules.SeedInjector.fromForm();
    this.seedInjector.inject(this.world, signals);
    if (!this.isRunning) { this.step(); this.draw(); this.updateUI(this.extract()); }
  }

  step() {
    // Orchestrate
    this.interactionEngine.computeInteractions(this.world);
    this.world.advanceStep();
    this.evolutionEngine.evolve(this.world);

    // Economy tick — energy drain, harvesting, cooperation bonuses, phase cycle
    if (this.economy) this.economy.tick();

    // Wealth tick — surplus accumulation, class assignment, employment, revolution
    if (this.wealthEngine) this.wealthEngine.tick();
  }

  extract() {
    return this.extractor.extract(this.world);
  }

  start() {
    this.isRunning = true;
    const loop = () => {
      if (!this.isRunning) return;
      try {
        // Time warp: echolocation slider controls steps per frame
        // 0 = 1 step (normal), 1.0 = up to 8 steps per frame
        const warpVal = this.world ? (this.world.env.timestepRes || 0) : 0;
        const stepsPerFrame = Math.max(1, Math.round(1 + warpVal * 7));
        for (let i = 0; i < stepsPerFrame; i++) {
          this.step();
        }
        this.draw();
        const emergence = this.extract();
        this.updateUI(emergence);
      } catch(e) {
        console.error('[K26 loop error]', e);
      }
      this.animationId = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    this.isRunning = false;
    if (this.animationId) cancelAnimationFrame(this.animationId);
  }

  draw() {
    const ctx = this.canvas.getContext('2d');
    if (!this.world) return;
    const W = this.world.width, H = this.world.height;

    // Layer 1: vanta void + state-reactive nebula (see VISUAL-BIBLE.md)
    this.drawBackground(ctx, W, H);

    // Layer 2: resource zones UNDER agents (so agents stay crisp)
    if (this.economy) this.economy.draw(ctx);

    // Layer 3: connection strings — persistent neural web (additive light)
    this.drawConnections(ctx);

    // Layer 4: agents on top
    for (const agent of this.world.agents) {
      agent.draw(ctx);
    }

    // Layer 5: class indicators (wealth rings, crowns)
    if (this.wealthEngine) this.wealthEngine.draw(ctx);

    // Layer 6: env overlay + sentinel label
    this.world.drawOverlay(ctx);
  }

  /**
   * Swarm mood, smoothed — 0 = stress, ~0.5 = normal, 1 = blissful.
   * Drives the reactive nebula. High trust/faith/consensus lift it; grief + disturbance drag it.
   */
  computeMood() {
    const live = this.world.agents.filter(a => !a.seppukuDone && !a.isSentinel);
    const n = live.length || 1;
    let trust = 0, faith = 0, grief = 0;
    for (const a of live) { trust += a.trustCharge; faith += a.faith; grief += a.griefLevel; }
    trust /= n; faith /= n; grief /= n;
    const m = this.world.getEmergenceMetrics ? this.world.getEmergenceMetrics() : { consensus: 0 };
    const consensus   = m.consensus || 0;
    const disturbance = (this.world.env && this.world.env.disturbance) || 0;
    let sat = trust * 0.35 + faith * 0.25 + consensus * 0.25 + 0.15 - grief * 0.5 - disturbance * 0.35;
    sat = Math.max(0, Math.min(1, sat));
    // breathe toward the target instead of snapping each frame
    this._mood = (this._mood == null) ? sat : this._mood + (sat - this._mood) * 0.04;
    return this._mood;
  }

  /**
   * Vanta-black void with a state-reactive nebula (see VISUAL-BIBLE.md).
   * Stress → amber/orange · normal → green · bliss → deep blue. Center colored, fading to black.
   */
  drawBackground(ctx, W, H) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const sat = this.computeMood();
    const hue = sat < 0.5 ? 35 + (sat / 0.5) * 85
                          : 120 + ((sat - 0.5) / 0.5) * 100;

    // Nebula follows mass — centroid of live agents drifts the glow toward where life is
    const live = this.world ? this.world.agents.filter(a => !a.seppukuDone && !a.isSentinel) : [];
    let targetCx = W * 0.5, targetCy = H * 0.5;
    if (live.length > 0) {
      let sx = 0, sy = 0;
      for (const a of live) { sx += a.x; sy += a.y; }
      targetCx = sx / live.length;
      targetCy = sy / live.length;
    }
    // Smooth drift — atmosphere responds slowly, not instantly
    this._nebCx = this._nebCx == null ? targetCx : this._nebCx + (targetCx - this._nebCx) * 0.018;
    this._nebCy = this._nebCy == null ? targetCy : this._nebCy + (targetCy - this._nebCy) * 0.018;
    const cx = this._nebCx, cy = this._nebCy;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Edge gradient — void at center, color at perimeter; center tracks the mass
    const edgeR = Math.max(W, H) * 0.88;
    const g0 = ctx.createRadialGradient(cx, cy, edgeR * 0.12, cx, cy, edgeR);
    g0.addColorStop(0,    'rgba(0,0,0,0)');
    g0.addColorStop(0.50, `hsla(${hue}, 55%, 20%, 0.14)`);
    g0.addColorStop(0.78, `hsla(${hue}, 68%, 32%, 0.32)`);
    g0.addColorStop(1,    `hsla(${hue}, 76%, 40%, 0.50)`);
    ctx.fillStyle = g0;
    ctx.fillRect(0, 0, W, H);

    // Mass glow — softer second gradient centered on the cluster, follows even tighter
    if (live.length > 10) {
      const density = Math.min(1, live.length / 150);
      const massR   = Math.min(W, H) * (0.28 + density * 0.18);
      const gm = ctx.createRadialGradient(cx, cy, 0, cx, cy, massR);
      gm.addColorStop(0,   `hsla(${hue}, 70%, 28%, ${0.06 + density * 0.08})`);
      gm.addColorStop(0.6, `hsla(${hue}, 60%, 20%, ${0.03 + density * 0.04})`);
      gm.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = gm;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
  }

  /**
   * Connection strings — the neural web. PERSISTENT: a bond stays fully visible until it is
   * SEVERED (the two agents move out of range). Bright neural cyan; only the last stretch warms
   * toward amber as it nears the break — a tendon going taut. Drawn ONCE per pair (n.id > a.id),
   * additive. See VISUAL-BIBLE.md §4.
   */
  drawConnections(ctx) {
    const MAXLEN = 220;                                      // sever distance — spider silk, quarter-screen reach before snap
    const ok = a => a && !a.seppukuDone && !a.isSentinel && a.griefState !== 'DISHONORED';
    const now = Date.now() * 0.0003;                         // slow global drift clock
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';            // spiritual layer — not burning through agents
    ctx.lineCap = 'round';
    for (const a of this.world.agents) {
      if (!ok(a)) continue;
      const nb = this.world.getNeighbors(a, MAXLEN);
      for (const n of nb) {
        if (n.id <= a.id || !ok(n)) continue;
        const dist   = Math.hypot(n.x - a.x, n.y - a.y);
        const strain = dist / MAXLEN;                        // 0 touching → 1 about to sever
        const taut   = 1 - strain;
        const bond   = Math.min(a.trustCharge, n.trustCharge);

        // Royal purple at rest → orange → red → white-grey at the moment of snap
        let hue, sat, light;
        // Neon royal purple → neon orange → neon red → white-grey at snap
        let sh, ss, sl;
        if (strain < 0.55) {
          sh = 270; ss = 92; sl = 58 + strain * 8;            // neon purple
        } else if (strain < 0.82) {
          const u = (strain - 0.55) / 0.27;
          sh = 270 - u * 232;                                  // purple → orange (270→38)
          ss = 92 + u * 8;                                     // stays neon
          sl = 62 + u * 8;                                     // neon orange ~70%
        } else if (strain < 0.94) {
          const u = (strain - 0.82) / 0.12;
          sh = 38 - u * 38;                                    // orange → red
          ss = 100;
          sl = 70 - u * 15;                                    // neon red ~55%
        } else {
          // Grey hair — the last moment before it snaps
          const u = (strain - 0.94) / 0.06;
          sh = 0; ss = Math.max(0, 100 - u * 100);            // drains to white
          sl = 55 + u * 40;                                    // brightens to silver-white
        }

        // Bezier bow — computed first, used by both normal and gold paths
        const mx    = (a.x + n.x) * 0.5;
        const my    = (a.y + n.y) * 0.5;
        const bnx   = -(n.y - a.y) / dist;                  // perpendicular unit vector
        const bny   =  (n.x - a.x) / dist;
        const phase = (a.id * 1.3 + n.id * 0.7);            // unique phase per pair
        const bow   = Math.sin(now + phase) * dist * 0.06;  // gentle, proportional bow
        const cpx   = mx + bnx * bow;
        const cpy   = my + bny * bow;

        // ── CONFLICT SIGNAL — overrides strain gradient when agents are in active conflict ──
        // Level 1 domestic: amber pulse · Level 2 local: red · Level 3+ civil/revolutionary: white-hot
        const conflicted    = a._conflictWith === n.id || n._conflictWith === a.id;
        const conflictLevel = conflicted ? Math.max(a._conflictLevel || 0, n._conflictLevel || 0) : 0;

        // ── EVOLUTION SIGNAL — electric blue when evolution ready ──
        const evoReady = !conflicted && (a._evolutionReady || n._evolutionReady);

        let lineW, strokeCol;
        if (conflicted && conflictLevel > 0) {
          const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.008 + a.id * 0.9); // faster pulse = tension
          if (conflictLevel === 1) {
            // Domestic — amber, barely visible, just below the surface
            lineW        = 0.5 + bond * 0.6 + pulse * 0.3;
            const cAlpha = (0.30 + bond * 0.25) * (0.5 + taut * 0.5) * (0.6 + pulse * 0.4);
            strokeCol    = `hsla(28, 85%, ${50 + pulse * 12}%, ${cAlpha})`;
            ctx.lineWidth   = lineW * 3;
            ctx.strokeStyle = `hsla(28, 80%, 45%, ${cAlpha * 0.12})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y);
            ctx.quadraticCurveTo(cpx, cpy, n.x, n.y); ctx.stroke();
          } else if (conflictLevel === 2) {
            // Local — red, more visible, spreading
            lineW        = 0.6 + bond * 0.7 + pulse * 0.4;
            const cAlpha = (0.35 + bond * 0.30) * (0.5 + taut * 0.5) * (0.7 + pulse * 0.3);
            strokeCol    = `hsla(5, 90%, ${48 + pulse * 10}%, ${cAlpha})`;
            ctx.lineWidth   = lineW * 4;
            ctx.strokeStyle = `hsla(5, 85%, 42%, ${cAlpha * 0.15})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y);
            ctx.quadraticCurveTo(cpx, cpy, n.x, n.y); ctx.stroke();
          } else {
            // Civil / Revolutionary — white-hot, unmistakable
            lineW        = 0.8 + bond * 0.8 + pulse * 0.5;
            const cAlpha = (0.45 + bond * 0.35) * (0.6 + taut * 0.4) * (0.8 + pulse * 0.2);
            const light  = conflictLevel >= 4 ? 88 : 70 + conflictLevel * 5;
            strokeCol    = `hsla(0, ${100 - conflictLevel * 8}%, ${light}%, ${cAlpha})`;
            ctx.lineWidth   = lineW * 5;
            ctx.strokeStyle = `hsla(0, 80%, 55%, ${cAlpha * 0.20})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y);
            ctx.quadraticCurveTo(cpx, cpy, n.x, n.y); ctx.stroke();
          }
        } else if (evoReady) {
                  // GOLD — oldest accumulated knowledge base; strings turn gold to track lineage of earned knowledge
                  const pulse  = 0.5 + 0.5 * Math.sin(Date.now() * 0.0018 + a.id * 0.5);
                  lineW        = 0.35 + bond * 0.55 + pulse * 0.25;
                  const gAlpha = (0.20 + bond * 0.20) * (0.45 + taut * 0.55) * (0.6 + pulse * 0.4);
                  strokeCol    = `hsla(45, 95%, ${52 + pulse * 12}%, ${gAlpha})`;  // gold, not blue
                  ctx.lineWidth   = lineW * 5;
                  ctx.strokeStyle = `hsla(45, 90%, 55%, ${gAlpha * 0.09})`;
                  ctx.beginPath(); ctx.moveTo(a.x, a.y);
                  ctx.quadraticCurveTo(cpx, cpy, n.x, n.y); ctx.stroke();
        } else {
          lineW         = 0.28 + bond * 0.60 * (0.45 + taut * 0.55);
          const alpha   = (0.20 + bond * 0.35) * (0.40 + taut * 0.60);
          strokeCol     = `hsla(${sh}, ${ss}%, ${sl}%, ${alpha})`;
        }

        ctx.lineWidth   = lineW;
        ctx.strokeStyle = strokeCol;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(cpx, cpy, n.x, n.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  populationBoom(count) {
    /**
     * Population boom — the Hydra trait.
     * Injects fresh agents into the colony after a seppuku cascade clears it.
     * New agents inherit the colony's doctrine but have no memory of what killed the previous generation.
     * They feel the proximity pressure immediately — without knowing why.
     *
     * @param {number} count - number of agents to inject
     * @returns {Agent[]} new agents
     */
    if (!this.world) return [];
    const Agent = window.MurmurationModules.Agent;
    const newAgents = [];
    const doctrine = this.world.doctrine || 'peace';
    const mode = this.world.mode || 'normal';

    for (let i = 0; i < count; i++) {
      // Place near the edges, heading inward — fresh arrivals from outside
      const edge = i % 2 === 0;
      const x = edge
        ? 30 + Math.random() * 60
        : this.world.width - 30 - Math.random() * 60;
      const y = 60 + Math.random() * (this.world.height - 120);

      const id = (this.economy && this.economy.nextAgentId)
        ? this.economy.nextAgentId++
        : this.world.agents.length + i + Math.floor(Math.random() * 1e6);

      const a = new Agent(id, x, y, this._randomPersonality());
      a.generation = 1;
      a._generation = 1;
      a._immigrant = false;
      a._boomSpawned = true;

      // Inherit doctrine
      a.doctrine = doctrine;
      a._doctrine = doctrine;

      // Start with slightly elevated energy — they're fresh
      a.energy = 0.65 + Math.random() * 0.25;

      // Track boom origin
      a._boomOrigin = true;

      this.world.agents.push(a);
      newAgents.push(a);
    }

    // Log the boom event
    const popNow = this.world.agents.filter(a => !a.seppukuDone && !a.isSentinel).length;
    if (window.logLine) {
      window.logLine(
        `T${this.world.time}  🌱 POPULATION BOOM — ${count} new agents injected (total: ${popNow})`,
        'green'
      );
    }

    return newAgents;
  }

  _randomPersonality() {
    return {
      riskTolerance:  0.3 + Math.random() * 0.4,
      trustBaseline: 0.5 + Math.random() * 0.3,
      reactivity:     0.4 + Math.random() * 0.4,
      memoryWeight:   0.2 + Math.random() * 0.5,
      optimism:       0.4 + Math.random() * 0.3,
    };
  }

  updateUI(emergence) {
    const pred     = emergence.prediction.toFixed(3);
    const conf     = emergence.confidence.toFixed(2);
    const vel      = emergence.cascadeVelocity.toFixed(2);
    const trust    = (emergence.avgTrust  || 0).toFixed(2);
    const grief    = (emergence.avgGrief  || 0).toFixed(2);
    const leaders  = emergence.highTrustCount  || 0;
    const depleted = emergence.lowTrustCount   || 0;
    const grieving = emergence.grievingCount   || 0;
    const crisis   = emergence.crisisCount     || 0;
    const seppuku  = emergence.seppukuCount    || 0;
    const dishonor = emergence.dishonoredCount || 0;
    const sentinel = emergence.hasSentinel
      ? `#${emergence.sentinelId}` : 'none';
    const wisdom   = emergence.wisdomCount || 0;

    const emergenceEl = document.getElementById('emergence');
    if (emergenceEl) {
      emergenceEl.innerText =
        `Prediction:  ${pred}\nConfidence:  ${conf}\nClusters:    ${emergence.clusters}\nCascade vel: ${vel}\nStability:   ${(emergence.stability||0).toFixed(2)}\n─────────────────────\nAvg Trust:   ${trust}  ▲${leaders}▼${depleted}\n─────────────────────\nAvg Grief:   ${grief}\nGrieving:    ${grieving}  Crisis: ${crisis}\nSeppuku:     ${seppuku}  Dishonor: ${dishonor}\nSentinel:    ${sentinel}  Wisdom: ${wisdom}`;
    }

    // Log every 30 ticks with color by emergence level
    if (this.world.time % 30 === 0) {
      if (window.logLine) {
        const type = Math.abs(emergence.prediction) > 0.4 ? 'emerge' :
                     Math.abs(emergence.prediction) > 0.1 ? 'evolve' : 'tick';
        window.logLine(
          `T${this.world.time}  pred=${pred}  conf=${conf}  [${emergence.clusters}]` +
          `  trust=${trust}▲${leaders}▼${depleted}` +
          `  grief=${grief}  ✦${seppuku}  ✗${dishonor}  ⚠${sentinel}`,
          type
        );
      }
    }
  }
};

// Global for UI
window.K26 = window.MurmurationModules.K26;
