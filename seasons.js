/**
 * Seasons Engine for Murmuration v2
 * ────────────────────────────────────────────────────────────────
 * Time has rhythm. The environment changes cyclically.
 * Agents that learn the pattern survive better.
 *
 * SEASON CYCLE:
 *   SPRING  — regeneration, reproduction boost, movement +20%
 *   SUMMER  — peak harvest, low drain, golden conditions
 *   AUTUMN  — harvest declining, migration urge, surplus instinct
 *   WINTER  — harvest -60%, drain +40%, movement -30%, faith strengthens
 *
 * Winter is NOT a DISASTER. It's a slow pressure test.
 * Agents that prepared in autumn survive. Agents that didn't, struggle.
 * Spring rewards the survivors.
 *
 * Seasons modify the ECONOMY multipliers and TERRAIN behavior.
 * They don't touch agent capabilities.
 *
 * Key question: Do later generations handle winter better than
 * the first? Does epigenetic memory encode seasonal knowledge?
 *
 * Ghost's filter: "The environment gets harder and the organisms
 * that survive ARE the upgrade."
 */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.SeasonsEngine = class SeasonsEngine {
  constructor(world, economy, opts = {}) {
    this.world = world;
    this.economy = economy;

    // Season duration in ticks (at 60fps: 1800 = 30 sec per season = 2 min full year)
    this.seasonLength = opts.seasonLength || 1800;

    // Current state
    this.season = 'SPRING';
    this.seasonTimer = 0;
    this.yearCount = 0;

    // Season definitions
    this.seasons = {
      SPRING: {
        harvest:      1.3,     // zones regenerate faster
        drain:        0.7,     // life is easier
        speed:        1.2,     // movement boost
        reproduction: 1.5,     // birth rate boost
        zonRegen:     2.0,     // zone depletion recovers 2x
        faithMod:     1.0,     // baseline
        label:        'SPRING',
        icon:         '🌱',
        color:        [100, 180, 80]
      },
      SUMMER: {
        harvest:      1.5,     // peak abundance
        drain:        0.5,     // minimal cost of living
        speed:        1.0,     // normal movement
        reproduction: 1.2,     // good conditions for birth
        zonRegen:     1.5,     // zones recover well
        faithMod:     0.8,     // faith less urgent when life is easy
        label:        'SUMMER',
        icon:         '☀',
        color:        [200, 180, 60]
      },
      AUTUMN: {
        harvest:      0.7,     // declining
        drain:        1.0,     // normal
        speed:        1.1,     // slight restlessness — migration urge
        reproduction: 0.5,     // poor time to have children
        zonRegen:     0.8,     // zones slow down
        faithMod:     1.2,     // unease grows
        label:        'AUTUMN',
        icon:         '🍂',
        color:        [170, 120, 50]
      },
      WINTER: {
        harvest:      0.4,     // scarce
        drain:        1.4,     // expensive to exist
        speed:        0.7,     // sluggish
        reproduction: 0.1,     // almost no births
        zonRegen:     0.3,     // zones barely recover
        faithMod:     1.8,     // faith surges in hardship
        label:        'WINTER',
        icon:         '❄',
        color:        [120, 140, 170]
      }
    };

    this._seasonOrder = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'];

    // Terrain interaction: how seasons modify terrain types
    // Multiplied against terrain's base harvest rate
    this.terrainSeasonMods = {
      SPRING: { PLAINS: 1.4, FOREST: 1.3, MOUNTAIN: 1.0, RIVER: 1.2, SWAMP: 1.5, DESERT: 0.8, CAVE: 1.0 },
      SUMMER: { PLAINS: 1.5, FOREST: 1.2, MOUNTAIN: 1.1, RIVER: 0.9, SWAMP: 1.0, DESERT: 0.5, CAVE: 1.0 },
      AUTUMN: { PLAINS: 0.8, FOREST: 1.1, MOUNTAIN: 0.7, RIVER: 1.0, SWAMP: 0.7, DESERT: 1.0, CAVE: 1.0 },
      WINTER: { PLAINS: 0.3, FOREST: 0.5, MOUNTAIN: 0.2, RIVER: 0.4, SWAMP: 0.3, DESERT: 1.2, CAVE: 1.5 }
    };

    // Stats
    this._winterDeaths = 0;
    this._springBirths = 0;
    this._yearSurvivors = [];
  }

  // ── CURRENT MODIFIERS ──────────────────────────────────────

  get mods() {
    return this.seasons[this.season];
  }

  get progress() {
    return this.seasonTimer / this.seasonLength;
  }

  getTerrainSeasonMultiplier(terrainType) {
    const mods = this.terrainSeasonMods[this.season];
    return mods ? (mods[terrainType] || 1.0) : 1.0;
  }

  // ── MAIN TICK ───────────────────────────────────────────────

  tick() {
    this.seasonTimer++;

    // Season transition
    if (this.seasonTimer >= this.seasonLength) {
      this._advanceSeason();
    }

    const m = this.mods;

    // Apply seasonal modifiers to living agents
    for (const agent of this.world.agents) {
      if (agent.seppukuDone || agent.isSentinel) continue;
      if (agent.griefState === 'DISHONORED') continue;

      // Movement speed modification (stacks with terrain)
      agent.vx *= m.speed;
      agent.vy *= m.speed;

      // Seasonal energy drain
      if (agent.energy != null) {
        const seasonDrain = (m.drain - 1.0) * 0.00003; // deviation from baseline
        if (seasonDrain !== 0) {
          agent.energy = Math.max(0.05, agent.energy + seasonDrain);
        }
      }

      // Faith modifier — faith grows faster in hard times
      if (agent.faith != null && m.faithMod !== 1.0) {
        const faithDelta = (m.faithMod - 1.0) * 0.00002;
        agent.faith = Math.max(0, Math.min(1.0, agent.faith + faithDelta));
      }

      // Winter-specific: migration urge toward resource zones
      if (this.season === 'WINTER' && agent.energy != null && agent.energy < 0.3) {
        agent._winterStress = true;
      } else {
        agent._winterStress = false;
      }

      // Spring-specific: recovery burst for survivors
      if (this.season === 'SPRING' && agent._winterSurvivor) {
        // First spring tick after surviving winter — evolution reward
        if (!agent._springRewarded) {
          if (agent.accumulateEvolution) {
            agent.accumulateEvolution(0.15, 'winter_survival');
          }
          agent._springRewarded = true;
        }
      }
    }
  }

  // ── SEASON TRANSITION ──────────────────────────────────────

  _advanceSeason() {
    const idx = this._seasonOrder.indexOf(this.season);
    const prev = this.season;
    const nextIdx = (idx + 1) % 4;
    this.season = this._seasonOrder[nextIdx];
    this.seasonTimer = 0;

    // Year boundary
    if (this.season === 'SPRING') {
      this.yearCount++;

      // Mark all living agents as winter survivors
      const alive = this.world.agents.filter(
        a => !a.seppukuDone && !a.isSentinel && a.griefState !== 'DISHONORED'
      );
      for (const a of alive) {
        a._winterSurvivor = true;
        a._springRewarded = false;
      }
      this._yearSurvivors.push(alive.length);
    }

    // Entering winter: clear survivor flags
    if (this.season === 'WINTER') {
      for (const a of this.world.agents) {
        a._winterSurvivor = false;
        a._springRewarded = false;
      }
    }

    // Modify economy phase behavior — seasons interact with economy phases
    // Winter during SCARCITY is brutal. Summer during GOLDEN is paradise.
    if (this.economy) {
      this._applySeasonToEconomy();
    }

    if (window.logLine) {
      const m = this.mods;
      const yearLabel = this.yearCount > 0 ? ` (Year ${this.yearCount})` : '';
      window.logLine(
        `${m.icon} ${m.label}${yearLabel} — harvest ×${m.harvest} drain ×${m.drain} speed ×${m.speed}`,
        'emerge'
      );
    }
  }

  _applySeasonToEconomy() {
    // Seasons don't override economy phases, they compound.
    // The economy reads season modifiers via getSeasonMultipliers()
    // This is a hook for additional season-transition effects.

    // Spring: boost zone regeneration
    if (this.season === 'SPRING') {
      for (const zone of this.economy.zones) {
        zone.depleted = Math.max(0, zone.depleted - 0.15);
      }
    }

    // Winter: partial zone depletion
    if (this.season === 'WINTER') {
      for (const zone of this.economy.zones) {
        zone.depleted = Math.min(0.8, zone.depleted + 0.1);
      }
    }
  }

  // ── ECONOMY INTEGRATION ─────────────────────────────────────
  // Called by economy.tick() to get seasonal multipliers

  getSeasonMultipliers() {
    const m = this.mods;
    return {
      harvest: m.harvest,
      drain: m.drain,
      zonRegen: m.zonRegen,
      reproduction: m.reproduction
    };
  }

  // ── DRAWING ─────────────────────────────────────────────────

  draw(ctx) {
    const m = this.mods;

    // Seasonal ambient overlay — very subtle tint
    const rgb = m.color;
    const alpha = 0.03 + this.progress * 0.02; // deepens as season progresses
    ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
    ctx.fillRect(0, 0, this.world.width, this.world.height);

    // Winter: subtle frost vignette at edges
    if (this.season === 'WINTER') {
      const intensity = 0.04 + this.progress * 0.04;
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

    // Season indicator
    ctx.save();
    ctx.font = '11px monospace';
    ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    const pct = Math.floor(this.progress * 100);
    const yearLabel = this.yearCount > 0 ? ` Y${this.yearCount}` : '';
    ctx.fillText(`${m.icon} ${m.label} ${pct}%${yearLabel}`, this.world.width - 140, this.world.height - 10);
    ctx.restore();
  }

  // ── SERIALIZATION ───────────────────────────────────────────

  serialize() {
    return {
      season: this.season,
      seasonTimer: this.seasonTimer,
      seasonLength: this.seasonLength,
      yearCount: this.yearCount,
      yearSurvivors: [...this._yearSurvivors]
    };
  }

  static restore(world, economy, data, opts = {}) {
    const engine = new SeasonsEngine(world, economy, opts);
    engine.season = data.season || 'SPRING';
    engine.seasonTimer = data.seasonTimer || 0;
    engine.seasonLength = data.seasonLength || 1800;
    engine.yearCount = data.yearCount || 0;
    engine._yearSurvivors = data.yearSurvivors || [];
    return engine;
  }
};
