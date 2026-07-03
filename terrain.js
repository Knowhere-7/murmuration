/**
 * Terrain Engine for Murmuration — Elevation-Backed Edition
 * ────────────────────────────────────────────────────────────────
 * Derives biome type directly from the TopoField elevation surface,
 * so the map you SEE is the world you FEEL. No Voronoi grid, no
 * random generation — the same continuous field that draws the
 * contours also governs agent speed, harvest, stealth, and drain.
 *
 * BIOME THRESHOLDS (normalized elevation 0–1):
 *   RIVER    h < 0.18  — valley floors, energy-costly to cross, rich banks
 *   SWAMP    0.18–0.30 — low wetlands, slow, stealthy, disease-prone
 *   PLAINS   0.30–0.50 — fertile mid-ground, full speed, best harvest
 *   FOREST   0.50–0.65 — moderate slopes, stealth, visibility penalty
 *   DESERT   0.65–0.78 — high exposed ridges, fast, nearly no harvest
 *   MOUNTAIN 0.78–0.90 — peaks, slow, defensive advantage, high visibility
 *   CAVE     h >= 0.90  — summits, hidden, zero harvest, total stealth
 *
 * Ghost's filter: "What does the world make them become?"
 *
 * Per-agent state written each tick (read by seasons.js and economy.js):
 *   agent._currentBiome       — biome string at current position
 *   agent._terrainHarvest     — harvest multiplier (economy reads this)
 *   agent._terrainStealth     — stealth modifier (predator/CTF reads this)
 *   agent._terrainDefense     — defense modifier (CTF reads this)
 *   agent._terrainVisibility  — visibility range modifier
 */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.TerrainEngine = class TerrainEngine {
  constructor(world) {
    this.world = world;

    this.types = {
      PLAINS:   { harvest: 1.30, speed: 1.00, visibility: 1.0, stealth: 0.0,  drain: 0.0000, defense: 0.0 },
      FOREST:   { harvest: 0.90, speed: 0.80, visibility: 0.5, stealth: 0.4,  drain: 0.0000, defense: 0.2 },
      MOUNTAIN: { harvest: 0.40, speed: 0.50, visibility: 1.3, stealth: 0.0,  drain: 0.0002, defense: 0.5 },
      RIVER:    { harvest: 1.10, speed: 0.30, visibility: 0.8, stealth: 0.0,  drain: 0.0004, defense: 0.0 },
      SWAMP:    { harvest: 0.60, speed: 0.60, visibility: 0.4, stealth: 0.3,  drain: 0.0003, defense: 0.1 },
      DESERT:   { harvest: 0.15, speed: 1.30, visibility: 1.5, stealth: 0.0,  drain: 0.0003, defense: 0.0 },
      CAVE:     { harvest: 0.00, speed: 0.70, visibility: 0.2, stealth: 0.8,  drain: 0.0000, defense: 0.6 }
    };
  }

  getBiomeAt(x, y) {
    if (!window.TopoField) return 'PLAINS';
    const h = window.TopoField.height(x, y, this.world.width, this.world.height);
    return TerrainEngine.elevationToBiome(h);
  }

  static elevationToBiome(h) {
    if (h < 0.18) return 'RIVER';
    if (h < 0.30) return 'SWAMP';
    if (h < 0.50) return 'PLAINS';
    if (h < 0.65) return 'FOREST';
    if (h < 0.78) return 'DESERT';
    if (h < 0.90) return 'MOUNTAIN';
    return 'CAVE';
  }

  getModifiersAt(x, y) {
    return this.types[this.getBiomeAt(x, y)] || this.types.PLAINS;
  }

  getHarvestMultiplier(x, y) {
    return this.getModifiersAt(x, y).harvest;
  }

  tick() {
    for (const agent of this.world.agents) {
      if (agent.seppukuDone || agent.isSentinel) continue;
      if (agent.griefState === 'DISHONORED') continue;

      const biome = this.getBiomeAt(agent.x, agent.y);
      const mods  = this.types[biome] || this.types.PLAINS;

      agent._currentBiome       = biome;
      agent._terrainHarvest     = mods.harvest;
      agent._terrainStealth     = mods.stealth;
      agent._terrainDefense     = mods.defense;
      agent._terrainVisibility  = mods.visibility;
// Energy drain from hostile terrain
      if (mods.drain > 0 && agent.energy != null) {
        agent.energy = Math.max(0.05, agent.energy - mods.drain);
      }
    }
  }
};



