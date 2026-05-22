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

    // Layer 1: black background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.world.width, this.world.height);

    // Layer 2: resource zones UNDER agents (so agents stay crisp)
    if (this.economy) this.economy.draw(ctx);

    // Layer 3: agents on top
    for (const agent of this.world.agents) {
      agent.draw(ctx);
    }

    // Layer 4: class indicators (wealth rings, crowns)
    if (this.wealthEngine) this.wealthEngine.draw(ctx);

    // Layer 5: env overlay + sentinel label
    this.world.drawOverlay(ctx);
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
