/**
 * Seasons Engine for Murmuration
 * ────────────────────────────────────────────────────────────────
 * Time has rhythm. The environment changes cyclically.
 * Agents that learn the pattern survive better.
 *
 * SEASON CYCLE:
 *   SPRING  — regeneration, recovery burst for winter survivors
 *   SUMMER  — peak harvest, minimal drain, golden conditions
 *   AUTUMN  — harvest declining, migration urge, surplus instinct
 *   WINTER  — harvest -60%, drain +40%, sluggish, faith surges
 *
 * Winter is NOT a disaster. It is a slow pressure test.
 * Agents that prepared in autumn survive. Those that did not, struggle.
 * Spring rewards the survivors.
 *
 * The season-terrain interaction matrix cross-references with terrain.js:
 * a PLAINS agent in WINTER is bad. A CAVE agent in WINTER is protected.
 * A PLAINS agent in SUMMER is paradise.
 *
 * Per-agent state written each tick (read by economy.js):
 *   agent._seasonSpeedMod    — speed multiplier (terrain.tick stacks onto this)
 *   agent._seasonHarvest     — seasonal harvest multiplier
 *   agent._terrainSeasonMod  — terrain-specific seasonal harvest adjustment
 *
 * Ghost's filter: "The environment gets harder and the organisms
 * that survive ARE the upgrade."
 */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.SeasonsEngine = class SeasonsEngine {
  constructor(world, economy, opts = {}) {
    this.world   = world;
    this.economy = economy;

    // 1800 ticks at 60fps = 30 seconds per season = 2 min full year
    this.seasonLength = opts.seasonLength || 1800;

    this.season      = 'SPRING';
    this.seasonTimer = 0;
    this.yearCount   = 0;

    this.seasons = {
      SPRING: {
        harvest: 1.3, drain: 0.7,  speed: 1.2, reproduction: 1.5,
        zonRegen: 2.0, faithMod: 1.0,
        label: 'SPRING', icon: '*', color: [100, 180, 80]
      },
      SUMMER: {
        harvest: 1.5, drain: 0.5,  speed: 1.0, reproduction: 1.2,
        zonRegen: 1.5, faithMod: 0.8,
        label: 'SUMMER', icon: 'O', color: [200, 180, 60]
      },
      AUTUMN: {
        harvest: 0.7, drain: 1.0,  speed: 1.1, reproduction: 0.5,
        zonRegen: 0.8, faithMod: 1.2,
        label: 'AUTUMN', icon: 'A', color: [170, 120, 50]
      },
      WINTER: {
        harvest: 0.4, drain: 1.4,  speed: 0.7, reproduction: 0.1,
        zonRegen: 0.3, faithMod: 1.8,
        label: 'WINTER', icon: 'W', color: [120, 140, 170]
      }
    };

    this._seasonOrder = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'];

    // Terrain-season interaction: how each season modifies each biome's harvest
    this.terrainSeasonMods = {
      SPRING: { PLAINS: 1.4, FOREST: 1.3, MOUNTAIN: 1.0, RIVER: 1.2, SWAMP: 1.5, DESERT: 0.8, CAVE: 1.0 },
      SUMMER: { PLAINS: 1.5, FOREST: 1.2, MOUNTAIN: 1.1, RIVER: 0.9, SWAMP: 1.0, DESERT: 0.5, CAVE: 1.0 },
      AUTUMN: { PLAINS: 0.8, FOREST: 1.1, MOUNTAIN: 0.7, RIVER: 1.0, SWAMP: 0.7, DESERT: 1.0, CAVE: 1.0 },
      WINTER: { PLAINS: 0.3, FOREST: 0.5, MOUNTAIN: 0.2, RIVER: 0.4, SWAMP: 0.3, DESERT: 1.2, CAVE: 1.5 }
    };

    this._yearSurvivors = [];
  }

  get mods() { return this.seasons[this.season]; }

  get progress() { return this.seasonTimer / this.seasonLength; }

  getTerrainSeasonMultiplier(biomeType) {
    const mods = this.terrainSeasonMods[this.season];
    return mods ? (mods[biomeType] || 1.0) : 1.0;
  }

  // ── MAIN TICK ───────────────────────────────────────────────

  tick() {
    this.seasonTimer++;
    if (this.seasonTimer >= this.seasonLength) this._advanceSeason();

    const m = this.mods;

    for (const agent of this.world.agents) {
      if (agent.seppukuDone || agent.isSentinel) continue;
      if (agent.griefState === 'DISHONORED') continue;

      // Speed — stacks on top of terrain speed applied in terrain.tick()
      agent.vx *= m.speed;
      agent.vy *= m.speed;

      // Write harvest mods for economy.tick() to read
      agent._seasonHarvest    = m.harvest;
      const biome = agent._currentBiome || 'PLAINS';
      agent._terrainSeasonMod = this.terrainSeasonMods[this.season][biome] || 1.0;

      // Seasonal energy drain (deviation from baseline only)
      if (agent.energy != null) {
        const seasonDrain = (m.drain - 1.0) * 0.00003;
        if (seasonDrain !== 0) {
          agent.energy = Math.max(0.05, agent.energy + seasonDrain);
        }
      }

      // Faith modifier — faith grows faster in hard times
      if (agent.faith != null && m.faithMod !== 1.0) {
        const faithDelta = (m.faithMod - 1.0) * 0.00002;
        agent.faith = Math.max(0, Math.min(1.0, agent.faith + faithDelta));
      }

      // Winter stress flag — used by predator/movement systems
      agent._winterStress = (this.season === 'WINTER' && agent.energy != null && agent.energy < 0.3);

      // Spring recovery burst for winter survivors
      if (this.season === 'SPRING' && agent._winterSurvivor && !agent._springRewarded) {
        if (agent.accumulateEvolution) agent.accumulateEvolution(0.15, 'winter_survival');
        agent._springRewarded = true;
      }
    }
  }

  // ── SEASON TRANSITION ──────────────────────────────────────

  _advanceSeason() {
    const idx  = this._seasonOrder.indexOf(this.season);
    this.season = this._seasonOrder[(idx + 1) % 4];
    this.seasonTimer = 0;

    if (this.season === 'SPRING') {
      this.yearCount++;
      const alive = this.world.agents.filter(a => !a.seppukuDone && !a.isSentinel && a.griefState !== 'DISHONORED');
      for (const a of alive) { a._winterSurvivor = true; a._springRewarded = false; }
      this._yearSurvivors.push(alive.length);
    }

    if (this.season === 'WINTER') {
      for (const a of this.world.agents) { a._winterSurvivor = false; a._springRewarded = false; }
    }

    // Zone depletion interaction on transition
    if (this.economy) {
      if (this.season === 'SPRING') {
        for (const z of this.economy.zones) z.depleted = Math.max(0, z.depleted - 0.15);
      }
      if (this.season === 'WINTER') {
        for (const z of this.economy.zones) z.depleted = Math.min(0.8, z.depleted + 0.10);
      }
    }

    if (window.logLine) {
      const m = this.mods;
      const icons = { SPRING: '[*]', SUMMER: '[O]', AUTUMN: '[A]', WINTER: '[W]' };
      const yearLabel = this.yearCount > 0 ? ` (Year ${this.yearCount})` : '';
      window.logLine(
        `${icons[this.season]} ${m.label}${yearLabel} -- harvest x${m.harvest} drain x${m.drain} speed x${m.speed}`,
        'emerge'
      );
    }
  }

  // ── DRAWING — subtle ambient seasonal tint ─────────────────

  draw(ctx) {
    const m   = this.mods;
    const rgb = m.color;

    // Very faint seasonal ambient — deepens as season progresses
    const alpha = 0.025 + this.progress * 0.015;
    ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
    ctx.fillRect(0, 0, this.world.width, this.world.height);

    // Winter: frost vignette at edges
    if (this.season === 'WINTER') {
      const intensity = 0.035 + this.progress * 0.035;
      const grad = ctx.createRadialGradient(
        this.world.width / 2, this.world.height / 2,
        Math.min(this.world.width, this.world.height) * 0.3,
        this.world.width / 2, this.world.height / 2,
        Math.max(this.world.width, this.world.height) * 0.6
      );
      grad.addColorStop(0, 'rgba(150, 170, 200, 0)');
      grad.addColorStop(1, `rgba(150, 170, 200, ${intensity})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.world.width, this.world.height);
    }

    // Season indicator — bottom right, alongside phase indicator
    const icons = { SPRING: '[*]', SUMMER: '[O]', AUTUMN: '[A]', WINTER: '[W]' };
    ctx.save();
    ctx.font = '11px monospace';
    ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    const pct       = Math.floor(this.progress * 100);
    const yearLabel = this.yearCount > 0 ? ` Y${this.yearCount}` : '';
    ctx.fillText(
      `${icons[this.season]} ${m.label} ${pct}%${yearLabel}`,
      this.world.width - 160,
      this.world.height - 24
    );
    ctx.restore();
  }

  // ── SERIALIZATION ───────────────────────────────────────────

  serialize() {
    return {
      season: this.season, seasonTimer: this.seasonTimer,
      seasonLength: this.seasonLength, yearCount: this.yearCount,
      yearSurvivors: [...this._yearSurvivors]
    };
  }

  static restore(world, economy, data, opts = {}) {
    const engine = new SeasonsEngine(world, economy, opts);
    engine.season       = data.season       || 'SPRING';
    engine.seasonTimer  = data.seasonTimer  || 0;
    engine.seasonLength = data.seasonLength || 1800;
    engine.yearCount    = data.yearCount    || 0;
    engine._yearSurvivors = data.yearSurvivors || [];
    return engine;
  }
};
