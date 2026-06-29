/**
 * Terrain Engine for Murmuration v2
 * ────────────────────────────────────────────────────────────────
 * The world is no longer flat. Different regions have different rules.
 *
 * TERRAIN TYPES:
 *   PLAINS     — high harvest, low defense, full visibility
 *   FOREST     — moderate harvest, stealth bonus, limited visibility
 *   MOUNTAIN   — low harvest, high defense, slow movement
 *   RIVER      — movement barrier, rich banks, energy drain to cross
 *   SWAMP      — energy drain, disease risk, rare resources
 *   DESERT     — near-zero harvest, fast movement, max visibility
 *   CAVE       — hidden, zero harvest, complete stealth
 *
 * Implementation: Voronoi-style biome regions generated from seed points.
 * Each cell modifies: harvest rate, movement speed, visibility range,
 * stealth modifier, energy drain, and defense bonus.
 *
 * Terrain does NOT change agent capabilities. It changes what happens
 * when agents use those capabilities in different places.
 *
 * Ghost's filter: "What does the world make them become?"
 */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.TerrainEngine = class TerrainEngine {
  constructor(world, opts = {}) {
    this.world = world;

    this.cellSize = opts.cellSize || 20;
    this.cols = Math.ceil(world.width / this.cellSize);
    this.rows = Math.ceil(world.height / this.cellSize);

    // Terrain type definitions — each modifies agent behavior differently.
    // `elevation` (0=low,1=high) drives the topographic contour render only;
    // it has no gameplay effect. `color` retained for legacy/debug, unused by draw.
    this.types = {
      PLAINS:   { harvest: 1.3,  speed: 1.0,  visibility: 1.0,  stealth: 0.0,  drain: 0.0,   defense: 0.0,  elevation: 0.42, color: [85, 140, 65]  },
      FOREST:   { harvest: 0.9,  speed: 0.8,  visibility: 0.5,  stealth: 0.4,  drain: 0.0,   defense: 0.2,  elevation: 0.55, color: [40, 80, 35]   },
      MOUNTAIN: { harvest: 0.4,  speed: 0.5,  visibility: 1.3,  stealth: 0.0,  drain: 0.0002, defense: 0.5, elevation: 0.95, color: [90, 85, 75]   },
      RIVER:    { harvest: 1.1,  speed: 0.3,  visibility: 0.8,  stealth: 0.0,  drain: 0.0004, defense: 0.0, elevation: 0.08, color: [50, 80, 120]  },
      SWAMP:    { harvest: 0.6,  speed: 0.6,  visibility: 0.4,  stealth: 0.3,  drain: 0.0003, defense: 0.1, elevation: 0.20, color: [55, 70, 45]   },
      DESERT:   { harvest: 0.15, speed: 1.3,  visibility: 1.5,  stealth: 0.0,  drain: 0.0003, defense: 0.0, elevation: 0.62, color: [160, 140, 95] },
      CAVE:     { harvest: 0.0,  speed: 0.7,  visibility: 0.2,  stealth: 0.8,  drain: 0.0,   defense: 0.6,  elevation: 0.30, color: [35, 30, 30]   }
    };

    // Grid: flat array, row-major. Each cell stores terrain type string.
    this.grid = new Array(this.cols * this.rows).fill('PLAINS');

    // Generate terrain
    this.seedCount = opts.seedCount || 12;
    this._seeds = [];
    this.generate(opts.preset || 'continental');

    // Pre-rendered terrain canvas for performance
    this._terrainCanvas = null;
    this._dirty = true;
  }

  // ── TERRAIN GENERATION ──────────────────────────────────────

  generate(preset = 'continental') {
    const w = this.world.width;
    const h = this.world.height;

    // Seed points with terrain type assignments based on preset
    this._seeds = [];

    if (preset === 'continental') {
      this._generateContinental(w, h);
    } else if (preset === 'archipelago') {
      this._generateArchipelago(w, h);
    } else if (preset === 'pangaea') {
      this._generatePangaea(w, h);
    } else {
      this._generateRandom(w, h);
    }

    // Assign each grid cell to nearest seed (Voronoi)
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const cx = (col + 0.5) * this.cellSize;
        const cy = (row + 0.5) * this.cellSize;

        let nearest = null;
        let nearestDist = Infinity;
        for (const seed of this._seeds) {
          const d = Math.hypot(cx - seed.x, cy - seed.y);
          if (d < nearestDist) {
            nearestDist = d;
            nearest = seed;
          }
        }
        this.grid[row * this.cols + col] = nearest ? nearest.type : 'PLAINS';
      }
    }

    // River pass — carve river corridors from mountain seeds toward low ground
    this._carveRivers(w, h);

    this._dirty = true;
  }

  _generateContinental(w, h) {
    // Central fertile region, mountains on edges, desert in corners,
    // forests between plains and mountains, swamp in low areas
    const seeds = [
      // Central plains
      { x: w * 0.45, y: h * 0.45, type: 'PLAINS' },
      { x: w * 0.55, y: h * 0.55, type: 'PLAINS' },
      { x: w * 0.50, y: h * 0.35, type: 'PLAINS' },

      // Forest belt
      { x: w * 0.25, y: h * 0.40, type: 'FOREST' },
      { x: w * 0.75, y: h * 0.40, type: 'FOREST' },
      { x: w * 0.35, y: h * 0.70, type: 'FOREST' },

      // Mountain ranges
      { x: w * 0.12, y: h * 0.20, type: 'MOUNTAIN' },
      { x: w * 0.88, y: h * 0.80, type: 'MOUNTAIN' },

      // Desert
      { x: w * 0.85, y: h * 0.15, type: 'DESERT' },

      // Swamp
      { x: w * 0.20, y: h * 0.80, type: 'SWAMP' },

      // Cave
      { x: w * 0.10, y: h * 0.50, type: 'CAVE' },
      { x: w * 0.90, y: h * 0.50, type: 'CAVE' },
    ];

    // Add jitter
    for (const s of seeds) {
      s.x += (Math.random() - 0.5) * w * 0.08;
      s.y += (Math.random() - 0.5) * h * 0.08;
    }
    this._seeds = seeds;
  }

  _generateArchipelago(w, h) {
    // Islands of different terrain in a river/water matrix
    const seeds = [];
    const islandCount = 8 + Math.floor(Math.random() * 4);
    const landTypes = ['PLAINS', 'FOREST', 'MOUNTAIN', 'DESERT', 'SWAMP'];
    for (let i = 0; i < islandCount; i++) {
      seeds.push({
        x: w * 0.1 + Math.random() * w * 0.8,
        y: h * 0.1 + Math.random() * h * 0.8,
        type: landTypes[Math.floor(Math.random() * landTypes.length)]
      });
    }
    // Fill gaps with river (water)
    const waterCount = 6;
    for (let i = 0; i < waterCount; i++) {
      seeds.push({
        x: Math.random() * w,
        y: Math.random() * h,
        type: 'RIVER'
      });
    }
    this._seeds = seeds;
  }

  _generatePangaea(w, h) {
    // One massive continent with terrain rings: plains center, forest, mountain edge
    const cx = w * 0.5, cy = h * 0.5;
    const seeds = [];
    // Inner plains
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      seeds.push({ x: cx + Math.cos(a) * w * 0.1, y: cy + Math.sin(a) * h * 0.1, type: 'PLAINS' });
    }
    // Mid forest ring
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      seeds.push({ x: cx + Math.cos(a) * w * 0.25, y: cy + Math.sin(a) * h * 0.25, type: 'FOREST' });
    }
    // Outer mountain ring
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      seeds.push({ x: cx + Math.cos(a) * w * 0.38, y: cy + Math.sin(a) * h * 0.38, type: 'MOUNTAIN' });
    }
    // Swamp pocket + desert pocket
    seeds.push({ x: w * 0.3, y: h * 0.7, type: 'SWAMP' });
    seeds.push({ x: w * 0.7, y: h * 0.3, type: 'DESERT' });
    // Cave
    seeds.push({ x: cx, y: cy, type: 'CAVE' });

    this._seeds = seeds;
  }

  _generateRandom(w, h) {
    const allTypes = Object.keys(this.types);
    this._seeds = [];
    for (let i = 0; i < this.seedCount; i++) {
      this._seeds.push({
        x: Math.random() * w,
        y: Math.random() * h,
        type: allTypes[Math.floor(Math.random() * allTypes.length)]
      });
    }
  }

  _carveRivers(w, h) {
    // Find mountain seeds and carve river paths downhill toward plains
    const mountainSeeds = this._seeds.filter(s => s.type === 'MOUNTAIN');
    for (const mtn of mountainSeeds) {
      if (Math.random() > 0.6) continue; // not every mountain spawns a river
      let cx = mtn.x;
      let cy = mtn.y;
      // Flow toward center (rough "downhill")
      const targetX = w * 0.5 + (Math.random() - 0.5) * w * 0.3;
      const targetY = h * 0.5 + (Math.random() - 0.5) * h * 0.3;
      const steps = 15 + Math.floor(Math.random() * 10);
      for (let i = 0; i < steps; i++) {
        const dx = targetX - cx, dy = targetY - cy;
        const dist = Math.hypot(dx, dy);
        if (dist < 30) break;
        // Step toward target with wobble
        cx += (dx / dist) * this.cellSize * 1.5 + (Math.random() - 0.5) * this.cellSize;
        cy += (dy / dist) * this.cellSize * 1.5 + (Math.random() - 0.5) * this.cellSize;
        // Paint river cells in a 2-cell wide corridor
        const col = Math.floor(cx / this.cellSize);
        const row = Math.floor(cy / this.cellSize);
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const r = row + dr, c = col + dc;
            if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) {
              if (Math.abs(dr) + Math.abs(dc) <= 1) { // cross pattern, not full 3x3
                this.grid[r * this.cols + c] = 'RIVER';
              }
            }
          }
        }
      }
    }
  }

  // ── QUERIES ─────────────────────────────────────────────────

  getTerrainAt(x, y) {
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return 'PLAINS';
    return this.grid[row * this.cols + col];
  }

  getModifiersAt(x, y) {
    const type = this.getTerrainAt(x, y);
    return this.types[type] || this.types.PLAINS;
  }

  // ── MAIN TICK ───────────────────────────────────────────────

  tick() {
    for (const agent of this.world.agents) {
      if (agent.seppukuDone || agent.isSentinel) continue;
      if (agent.griefState === 'DISHONORED') continue;

      const mods = this.getModifiersAt(agent.x, agent.y);

      // Movement speed modification
      // Applied as velocity scaling — terrain doesn't change where you want to go,
      // it changes how fast you get there
      agent.vx *= mods.speed;
      agent.vy *= mods.speed;

      // Energy drain from hostile terrain
      if (mods.drain > 0 && agent.energy != null) {
        agent.energy = Math.max(0.05, agent.energy - mods.drain);
      }

      // Stealth modifier — stored on agent for other systems to read
      // (predators, disease, conflict — they check agent._terrainStealth)
      agent._terrainStealth = mods.stealth;

      // Defense modifier — stored for territory/conflict systems
      agent._terrainDefense = mods.defense;

      // Visibility modifier — affects neighbor detection range
      agent._terrainVisibility = mods.visibility;

      // Store current terrain type for other systems
      agent._currentTerrain = this.getTerrainAt(agent.x, agent.y);
    }
  }

  // ── ECONOMY INTEGRATION ─────────────────────────────────────
  // Call this from economy.tick() to modify harvest rates by terrain

  getHarvestMultiplier(x, y) {
    return this.getModifiersAt(x, y).harvest;
  }

  // ── DRAWING ─────────────────────────────────────────────────

  draw(ctx) {
    // Pre-render the contour map to an offscreen canvas (only when dirty)
    if (this._dirty || !this._terrainCanvas) {
      this._renderTerrainCanvas();
      this._dirty = false;
    }
    // Faint topographic overlay — sits quietly beneath the agents
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.drawImage(this._terrainCanvas, 0, 0);
    ctx.restore();
  }

  /**
   * Render terrain as a faint white/cyan topographic contour map.
   * Elevation is derived from terrain type, smoothed into a continuous field,
   * then traced with marching squares into iso-contour lines. Cyberpunk-blueprint
   * aesthetic — reads as a map, never competes with agent colors.
   */
  _renderTerrainCanvas() {
    if (!this._terrainCanvas) {
      this._terrainCanvas = document.createElement('canvas');
    }
    const W = this.world.width, H = this.world.height;
    this._terrainCanvas.width = W;
    this._terrainCanvas.height = H;
    const tctx = this._terrainCanvas.getContext('2d');
    tctx.clearRect(0, 0, W, H);
    tctx.lineCap = 'round';
    tctx.lineJoin = 'round';

    const field = this._buildCornerField();   // (cols+1)*(rows+1) smoothed elevations
    const CW = this.cols + 1;
    const S = this.cellSize;

    const interp = (v0, v1, L) => {
      const d = v1 - v0;
      if (Math.abs(d) < 1e-6) return 0.5;
      return Math.max(0, Math.min(1, (L - v0) / d));
    };

    // Contour levels — every 3rd is a "major" line (brighter cyan)
    const levels = [];
    for (let L = 0.12; L <= 0.93; L += 0.08) levels.push(+L.toFixed(3));

    levels.forEach((L, li) => {
      const major = (li % 3 === 0);
      tctx.strokeStyle = major ? 'rgba(130, 240, 255, 0.85)' : 'rgba(165, 205, 215, 0.45)';
      tctx.lineWidth   = major ? 1.15 : 0.65;
      tctx.beginPath();

      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const a  = field[r * CW + c];           // top-left
          const b  = field[r * CW + c + 1];       // top-right
          const cc = field[(r + 1) * CW + c + 1]; // bottom-right
          const d  = field[(r + 1) * CW + c];     // bottom-left

          let idx = 0;
          if (a  >= L) idx |= 1;
          if (b  >= L) idx |= 2;
          if (cc >= L) idx |= 4;
          if (d  >= L) idx |= 8;
          if (idx === 0 || idx === 15) continue;

          const x0 = c * S, y0 = r * S;
          const eT = [x0 + S * interp(a, b, L),  y0];
          const eR = [x0 + S,                    y0 + S * interp(b, cc, L)];
          const eB = [x0 + S * interp(d, cc, L), y0 + S];
          const eL = [x0,                        y0 + S * interp(a, d, L)];
          const seg = (p, q) => { tctx.moveTo(p[0], p[1]); tctx.lineTo(q[0], q[1]); };

          switch (idx) {
            case 1:  case 14: seg(eL, eT); break;
            case 2:  case 13: seg(eT, eR); break;
            case 3:  case 12: seg(eL, eR); break;
            case 4:  case 11: seg(eR, eB); break;
            case 6:  case 9:  seg(eT, eB); break;
            case 7:  case 8:  seg(eL, eB); break;
            case 5:  seg(eL, eT); seg(eR, eB); break; // saddle
            case 10: seg(eT, eR); seg(eL, eB); break; // saddle
          }
        }
      }
      tctx.stroke();
    });
  }

  /**
   * Build a smoothed elevation field sampled at grid-cell CORNERS.
   * Each corner averages the elevations of its surrounding cells, then the
   * whole field is box-blurred so contours flow organically instead of
   * snapping to the Voronoi grid.
   */
  _buildCornerField() {
    const cols = this.cols, rows = this.rows;
    const CW = cols + 1, CH = rows + 1;
    const corners = new Float32Array(CW * CH);
    const counts  = new Float32Array(CW * CH);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = this.types[this.grid[r * cols + c]];
        const e = (t && t.elevation != null) ? t.elevation : 0.4;
        const idxs = [r * CW + c, r * CW + c + 1, (r + 1) * CW + c, (r + 1) * CW + c + 1];
        for (const i of idxs) { corners[i] += e; counts[i]++; }
      }
    }
    for (let i = 0; i < corners.length; i++) {
      if (counts[i] > 0) corners[i] /= counts[i];
    }
    this._blurField(corners, CW, CH, 2);
    return corners;
  }

  _blurField(f, W, H, passes) {
    for (let p = 0; p < passes; p++) {
      const src = f.slice();
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let s = 0, n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx, yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
              s += src[yy * W + xx]; n++;
            }
          }
          f[y * W + x] = s / n;
        }
      }
    }
  }

  // ── RESIZE ──────────────────────────────────────────────────

  resize(newWidth, newHeight) {
    this.world.width = newWidth;
    this.world.height = newHeight;
    this.cols = Math.ceil(newWidth / this.cellSize);
    this.rows = Math.ceil(newHeight / this.cellSize);
    this.grid = new Array(this.cols * this.rows).fill('PLAINS');
    this.generate();
  }

  // ── SERIALIZATION ───────────────────────────────────────────

  serialize() {
    return {
      cellSize: this.cellSize,
      cols: this.cols,
      rows: this.rows,
      seeds: this._seeds.map(s => ({ ...s })),
      grid: [...this.grid]
    };
  }

  static restore(world, data, opts = {}) {
    const engine = new TerrainEngine(world, {
      ...opts,
      cellSize: data.cellSize
    });
    engine.cols = data.cols;
    engine.rows = data.rows;
    engine._seeds = data.seeds;
    engine.grid = data.grid;
    engine._dirty = true;
    return engine;
  }
};
