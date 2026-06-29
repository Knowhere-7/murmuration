/**
 * Murmuration — Main Simulation Engine
 * Gnosquam Swarm World Sim — Zero Dependencies — Rule-Based
 *
 * Traits wired:
 *   ST-1  Trust Battery        — dynamic earned authority
 *   ST-2  Grief Variable       — behavioral modifier, three exits
 *   #14   Epigenetic Memory    — successful patterns strengthen
 *   #3    Pheromone Trail      — failed patterns decay
 *   #31   Echolocation         — frequency controls sim resolution
 *   #32   Lateral Line         — pressure triggers cascade
 *   #33   Electroreception     — anomaly modulates reactivity
 *   #34   PitViper Divergence  — disturbance signal to world env
 *   #16   Mantis Shrimp        — 16-band filter controls spawn
 *
 * NOT FOR PUBLIC USE — internal Gnosquam tool only.
 * Embed via boardroom protected route.
 */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.MurmurationSim = class MurmurationSim {

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts
   * @param {number} opts.agentCount   — default 80
   * @param {function} opts.onLog      — (msg, type) => void  — hook for boardroom log panel
   * @param {function} opts.onEmerge   — (emergence) => void  — hook for boardroom metrics panel
   */
  constructor(canvas, opts = {}) {
    this.canvas     = canvas;
    this.agentCount = opts.agentCount  || 80;
    this.onLog      = opts.onLog       || null;
    this.onEmerge   = opts.onEmerge    || null;

    // Sub-engines
    this.world             = null;
    this.seedInjector      = new window.MurmurationModules.SeedInjector();
    this.interactionEngine = new window.MurmurationModules.InteractionEngine();
    this.evolutionEngine   = new window.MurmurationModules.EvolutionEngine();
    this.extractor         = new window.MurmurationModules.EmergenceExtractor();

    // V2 options
    this.v2 = opts.v2 || false;
    this.terrainPreset = opts.terrainPreset || 'continental';
    this.seasonLength  = opts.seasonLength  || 1800;

    this.isRunning   = false;
    this.animationId = null;
    this.timeStep    = 1; // default — overridden by EcholocationFrequency

    // Wire global logLine so sub-modules can emit
    const self = this;
    window.logLine = (msg, type = 'sys') => {
      if (self.onLog) self.onLog(msg, type);
    };
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Initialize world with fresh agents.
   * Safe to call repeatedly — stops any running sim first.
   */
  init(agentCount) {
    this.stop();
    this.agentCount = agentCount || this.agentCount;
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.world = new window.MurmurationModules.World(w, h, this.agentCount);

    // V2: bootstrap terrain and seasons if enabled
    if (this.v2 && window.MurmurationModules.TerrainEngine) {
      const terrain = new window.MurmurationModules.TerrainEngine(this.world, {
        preset: this.terrainPreset
      });
      this.world.terrain = terrain;
      if (window.logLine) window.logLine('// V2: Terrain Engine loaded — ' + this.terrainPreset, 'sys');
    }

    if (this.v2 && window.MurmurationModules.SeasonsEngine) {
      const seasons = new window.MurmurationModules.SeasonsEngine(
        this.world,
        this.world._economy || null,
        { seasonLength: this.seasonLength }
      );
      this.world.seasons = seasons;
      if (window.logLine) window.logLine('// V2: Seasons Engine loaded — ' + this.seasonLength + ' ticks/season', 'sys');
    }

    this._draw();
    if (window.logLine) {
      const v2Label = this.v2 ? ' [V2 Environmental Complexity]' : '';
      window.logLine(`// World initialized — ${this.agentCount} agents${v2Label} — waiting for RUN`, 'sys');
    }
    return this;
  }

  start() {
    if (!this.world) this.init();
    this.isRunning = true;
    const loop = () => {
      if (!this.isRunning) return;
      this._step();
      this._draw();
      const emergence = this.extract();
      if (this.onEmerge) this.onEmerge(emergence);
      this.animationId = requestAnimationFrame(loop);
    };
    loop();
    return this;
  }

  stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    return this;
  }

  reset() {
    this.stop();
    this.world = null;
    const ctx = this.canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (window.logLine) window.logLine('// Murmuration reset', 'sys');
    return this;
  }

  // ── Single tick — callable externally for step-through mode ─────────────

  tick() {
    if (!this.world) return null;
    this._step();
    this._draw();
    return this.extract();
  }

  // ── Seed injection ───────────────────────────────────────────────────────

  /**
   * Inject bio-trait signals directly.
   * @param {object} signals — { PitViperDivergence, ElectroreceptionAnomaly, ... }
   */
  inject(signals = {}) {
    if (!this.world) return this;
    this.seedInjector.inject(this.world, signals);

    // EcholocationFrequency controls sim resolution
    if (signals.EcholocationFrequency !== undefined) {
      this.timeStep = Math.max(0.1, Math.min(3, signals.EcholocationFrequency * 3));
    }

    const active = Object.entries(signals)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k.replace(/Divergence|Anomaly|Pressure|Frequency|16Bands/g, '')}=${v.toFixed(2)}`)
      .join('  ');
    if (window.logLine) {
      window.logLine(`▶ INJECT — ${active || 'all signals zero'} — watch emergence ↑`, 'seed');
    }
    return this;
  }

  // ── Emergence data ───────────────────────────────────────────────────────

  extract() {
    if (!this.world) return null;
    return this.extractor.extract(this.world);
  }

  /**
   * Snapshot for external systems (boardroom, n8n, Council).
   * Serializable — no DOM refs.
   */
  snapshot() {
    const em = this.extract();
    if (!em) return null;
    return {
      time:             this.world.time,
      agentCount:       this.world.agents.length,
      activeCount:      this.world.agents.filter(a => !a.seppukuDone && !a.isSentinel).length,
      prediction:       em.prediction,
      confidence:       em.confidence,
      consensus:        em.consensus,
      divergence:       em.divergence,
      stability:        em.stability,
      clusters:         em.clusters,
      cascadeVelocity:  em.cascadeVelocity,
      avgTrust:         em.avgTrust,
      highTrustCount:   em.highTrustCount,
      lowTrustCount:    em.lowTrustCount,
      avgGrief:         em.avgGrief,
      grievingCount:    em.grievingCount,
      crisisCount:      em.crisisCount,
      seppukuCount:     em.seppukuCount,
      dishonoredCount:  em.dishonoredCount,
      hasSentinel:      em.hasSentinel,
      sentinelId:       em.sentinelId,
      wisdomCount:      em.wisdomCount,
      env:              { ...this.world.env },
      ts:               Date.now()
    };
  }

  // ── Private ──────────────────────────────────────────────────────────────

  _step() {
    this.interactionEngine.computeInteractions(this.world);
    this.world.advanceStep();
    this.evolutionEngine.evolve(this.world);
  }

  _draw() {
    if (this.world) this.world.draw(this.canvas.getContext('2d'));
  }
};

// ── Top-level factory — used by boardroom embed ──────────────────────────

/**
 * Mount Murmuration onto a canvas element.
 * Returns the MurmurationSim instance for external control.
 *
 * Usage:
 *   const sim = Murmuration.mount('canvas', { onLog, onEmerge });
 *   sim.init(80).start();
 */
window.Murmuration = {
  mount(canvasId, opts = {}) {
    const canvas = typeof canvasId === 'string'
      ? document.getElementById(canvasId)
      : canvasId;
    if (!canvas) throw new Error(`Murmuration.mount: canvas '${canvasId}' not found`);
    const sim = new window.MurmurationModules.MurmurationSim(canvas, opts);
    window._murmurationInstance = sim;
    return sim;
  },

  /** Get the running instance (for console access) */
  get instance() { return window._murmurationInstance || null; }
};
