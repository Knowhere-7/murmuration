/**
 * MAZE — the swarm's navigation test rig, solved by trait #11 (Slime Mold / Physarum).
 *
 * A maze, a pentest topology, and a hunt are the same object: a graph with a source, a sink,
 * gated edges, dead-ends, traps. This rig makes that graph WATCHABLE and drives it with the
 * real swarm.
 *
 *   Phase A: real braided-grid geometry + generalized wall collision + single-colony arena.
 *   Phase C (now): the maze grid becomes a graph fed to the shared SlimeMoldCore. The swarm
 *            IS the flow medium — agents deposit on the edges they traverse (thickening tubes),
 *            evaporation prunes the unused, and agents steer up the conductance gradient toward
 *            the chemoattractant. The colony converges on the shortest path — Physarum, not
 *            scripted. The core's own optimize() stays for the offline pentest / LOBO surfaces.
 *   Phase D (later): trap cells + hazard memory (sacrifice-as-information).
 *
 * The graph only has an edge where a passage is OPEN, so steering toward a neighbour cell always
 * routes through the gap, never into a wall — the graph IS the wall-knowledge (this is why the
 * old "echolocation wall-sensing" phase is unnecessary).
 *
 * Self-contained, like gauntlet.js / relics.js. Arm: k26.maze.enable({singleColony:true}).
 */
window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.MazeSystem = class MazeSystem {
  constructor(world) {
    this.world = world;
    this.active = false;
    this.MAX_COLS = { 1: 8, 2: 12, 3: 16 };
    this.TARGET_CELL = 34;
    this.BRAID = 0.18;
    this.finishes = 0;
    // Phase C tuning
    this.GRADIENT_FORCE = 0.45;   // pull toward the committed next cell (overcomes flock cohesion)
    this.EXPLORE_PROB   = 0.20;   // chance to pick a random open neighbour instead of the best
    this.DEPOSIT        = 1.0;    // flow laid per edge traversal (agents = the flow medium)
    this.SUCCESS_BONUS  = 6.0;    // extra flow laid back along a route that REACHED the goal
    this.exitTimes = [];          // rolling time-to-exit (the learning curve)
    // Phase D — traps + hazard memory (sacrifice-as-information)
    this.TRAP_FRAC    = 0.10;   // base fraction of cells that are traps (scaled by difficulty)
    this.SUSTAIN      = 0.003;  // arena baseline: safe travel sustains an agent (no background starving)
    this.TRAP_DRAIN   = 0.009;  // trap net = SUSTAIN - TRAP_DRAIN < 0, so ONLY traps cause loss/death
    this.TRAP_GRIEF   = 0.004;  // grief added per tick in a trap
    this.DANGER_LEARN = 0.09;   // colony learns fast — a couple of passes mark a trap (less death needed)
    this.DANGER_EVAP  = 0.006;  // danger memory fades where no one suffers (a shunned trap dims)
    this.DANGER_AVOID = 0.9;    // how strongly learned danger repels steering
    // ── PELLETS — the fulfilment constraint (Ghost, 2026-07-29) ──
    // The grief cascade is not a bug to damp; it is the maze's real difficulty.
    // Confined in corridors, one seppuku pushes grief into neighbours faster
    // than it can heal, and the cohort grieves itself to death.
    //
    // The relief is the resource node — the same thing the WELL/HEARTH spheres
    // are on the open map, but laid out the way Pac-Man lays out its dots: one
    // pellet at every cell centre AND at the midpoint of every open edge, so
    // they form a continuous trail through the entire traversable graph.
    //
    // That layout is the whole trick. Feeding the swarm only along the solved
    // route would paint the answer on the floor; covering EVERY corridor —
    // dead ends and wrong branches alike — means eating tells an agent nothing
    // about where the exit is. Pellets regenerate slowly, like commons supply,
    // so a stripped corridor recovers and the swarm keeps circulating.
    this.PELLET_RELIEF = 0.055;   // grief eased by one pellet
    this.PELLET_REGEN  = 0.0022;  // regrowth per tick once eaten
    this.PELLET_R      = 0.17;    // eat radius, as a fraction of cell size
    this.pellets = [];            // {x, y, v} — v is 0..1 ripeness
    this.pelletsByCell = new Map();  // cellId -> pellets, so eating is O(1)
    this.pelletsEaten = 0;
    this.traps  = new Set();    // cellIds that are physical traps (invisible until discovered)
    this.danger = new Map();    // cellId → learned danger 0..1 (the collective spatial memory)
    this.trapFalls = 0;
  }

  _id(c, r) { return c + ',' + r; }

  /** Does this maze govern that agent? Unscoped mazes take everyone. */
  _owns(a) { return !this.colony || a.colony === this.colony; }

  enable(opts = {}) {
    const diff = Math.max(1, Math.min(3, opts.difficulty || 2));

    // A maze can own the whole canvas or a region of it. Two colonies of 60
    // fit far better as two mazes than one crowd of 120 in a single grid —
    // 120 agents jam a 12x12, spanning barely half its width. Bounds let each
    // colony run its own arena, side by side, so the two can be compared.
    this.colony = opts.colony || null;      // null = every agent, else 'A' | 'B'
    const b = opts.bounds;
    const margin = 0.05;
    if (b) {
      this.ox = b.x + b.w * margin; this.oy = b.y + b.h * margin;
      this.mazeW = b.w * (1 - 2 * margin); this.mazeH = b.h * (1 - 2 * margin);
    } else {
      const W = this.world.width, H = this.world.height;
      this.ox = W * margin; this.oy = H * margin;
      this.mazeW = W * (1 - 2 * margin); this.mazeH = H * (1 - 2 * margin);
    }

    const maxC = this.MAX_COLS[diff];
    this.cols = Math.max(5, Math.min(maxC, Math.round(this.mazeW / this.TARGET_CELL)));
    this.rows = Math.max(5, Math.min(maxC, Math.round(this.mazeH / this.TARGET_CELL)));
    this.cw = this.mazeW / this.cols; this.ch = this.mazeH / this.rows;

    // A controlled comparison needs both colonies in the SAME maze. cloneFrom
    // copies another arena's topology and traps verbatim, so the only thing that
    // differs between arenas is which swarm is in it — any divergence in the
    // result is the colony, not the map. Falls back to generating if the grids
    // do not match.
    const src = opts.cloneFrom;
    const cloneable = src && src.cells && src.cols === this.cols && src.rows === this.rows;
    if (cloneable) {
      this.cells = src.cells.map(row => row.map(cell => ({ ...cell })));
    } else {
      this._generate();
    }
    this.start = { c: 0, r: 0 };
    this.goal  = { c: this.cols - 1, r: this.rows - 1 };
    this.reward = { ...this._cellCenter(this.goal.c, this.goal.r), r: Math.min(this.cw, this.ch) * 0.42 };
    this.finishes = 0; this.exitTimes = [];

    // Phase D — scatter trap cells (never on start/goal). Difficulty scales the count.
    // Traps are INVISIBLE until an agent falls; the danger mark is learned from suffering.
    this.traps = new Set(); this.danger = new Map(); this.trapFalls = 0;
    const trapN = Math.round(this.cols * this.rows * this.TRAP_FRAC * (0.5 + diff * 0.35));
    const startId = this._id(this.start.c, this.start.r), goalId = this._id(this.goal.c, this.goal.r);
    let guard = 0;
    // Cloned arenas inherit the same hazards. Identical walls with different
    // traps would still be an unfair race.
    if (cloneable) {
      for (const id of src.traps) this.traps.add(id);
    }
    while (!cloneable && this.traps.size < trapN && guard++ < trapN * 25) {
      const c = (Math.random() * this.cols) | 0, r = (Math.random() * this.rows) | 0;
      const id = this._id(c, r);
      if (id === startId || id === goalId) continue;
      this.traps.add(id);
    }

    // Pellets — one per cell centre, one per open edge. Full corridor coverage
    // means the trail never hints at the route. Never on the goal (its own
    // reward) and never on a trap (a cell is sanctuary or hazard, not both).
    this.pellets = [];
    this.pelletsEaten = 0;
    this.pelletsByCell = new Map();
    for (let c = 0; c < this.cols; c++) {
      for (let r = 0; r < this.rows; r++) {
        const id = this._id(c, r);
        if (id === goalId || this.traps.has(id)) continue;
        const p = this._cellCenter(c, r);
        const bucket = [];
        const add = (px, py) => { const pel = { x: px, y: py, v: 1 }; this.pellets.push(pel); bucket.push(pel); };
        add(p.x, p.y);
        const cell = this.cells[r][c];
        // Edge pellets bridge adjacent cells so the trail is continuous.
        if (!cell.E && c < this.cols - 1 && !this.traps.has(this._id(c + 1, r))) {
          add(this.ox + (c + 1) * this.cw, p.y);
        }
        if (!cell.S && r < this.rows - 1 && !this.traps.has(this._id(c, r + 1))) {
          add(p.x, this.oy + (r + 1) * this.ch);
        }
        // Bucket by cell so eating is O(pellets-in-this-cell), not O(all).
        this.pelletsByCell.set(id, bucket);
      }
    }

    // Phase C — slime mold network (trait #11) over the maze-as-graph
    this.mold = window.MurmurationModules.SlimeMoldCore
      ? new window.MurmurationModules.SlimeMoldCore()
      : null;
    if (this.mold) {
      this.mold.buildFromGrid(this.cells, this.cols, this.rows, this.start, this.goal);
      // Scale the stochastic explore-walk to the graph so flow can actually reach a distant goal
      // (the tiny default only suited small abstract graphs). The deterministic Dijkstra
      // extraction solves regardless of size; this just lets the flow layer contribute/animate.
      this.mold.config.exploreSteps = Math.min(120, 3 * (this.cols + this.rows));
    }
    this.trueShortest = this._bfsShortest(this.start, this.goal);   // honesty baseline
    this.bestPath = null; this._bestSet = new Set();
    // Solve immediately so the optimal path is visible (gold) from t=0 — this IS the answer
    // the pentest engine consumes: the optimal path through the topology.
    if (this.mold) this._refreshBestPath();

    const sId = this._id(this.start.c, this.start.r);
    const s = this._cellCenter(this.start.c, this.start.r);
    for (const a of this.world.agents) {
      // singleColony is legacy and DESTRUCTIVE — it rewrites colony B out of
      // existence. Prefer opts.colony, which claims agents without erasing them.
      if (opts.singleColony && a.colony !== 'U') { a.colony = 'A'; a.swarmTint = 0; }
      if (!this._owns(a)) continue;
      a.x = s.x + (Math.random() - 0.5) * this.cw * 0.6;
      a.y = s.y + (Math.random() - 0.5) * this.ch * 0.6;
      a._mazeSeek = 'goal'; a._mazeCell = sId; a._mazeStart = this.world.time; a._mazeInGoal = false;
      a._mazeTgt = null; a._mazePrev = null;
    }
    if (opts.singleColony && this.world.wall && this.world.wall.gates) {
      this.world.wall.gates.forEach(g => { g.open = true; g.yf = 0.5; g.hf = 0.5; });
    }

    this.active = true;
    // Publish to the module registry so agent.js — which has no world
    // back-reference — can suppress its cluster bloom while the maze is armed.
    window.MurmurationModules.activeMaze = this;
    if (window.logLine) {
      window.logLine(`▦ MAZE ARMED — ${this.cols}×${this.rows} braided grid, solved by SLIME MOLD ` +
        `(#11). The swarm is the flow; the tubes thicken toward the goal. Shortest path = ${this.trueShortest} hops.`, 'emerge');
    }
    return this.status();
  }

  disable() {
    this.active = false;
    if (window.MurmurationModules && window.MurmurationModules.activeMaze === this) {
      window.MurmurationModules.activeMaze = null;
    }
  }

  _cellCenter(c, r) { return { x: this.ox + (c + 0.5) * this.cw, y: this.oy + (r + 0.5) * this.ch }; }

  _generate() {
    const C = this.cols, R = this.rows;
    const cells = [];
    for (let r = 0; r < R; r++) { const row = []; for (let c = 0; c < C; c++) row.push({ N: true, E: true, S: true, W: true, v: false }); cells.push(row); }
    const stack = [[0, 0]]; cells[0][0].v = true;
    const dirs = [['N', 0, -1, 'S'], ['E', 1, 0, 'W'], ['S', 0, 1, 'N'], ['W', -1, 0, 'E']];
    while (stack.length) {
      const [c, r] = stack[stack.length - 1];
      const nbrs = [];
      for (const [dir, dc, dr, opp] of dirs) { const nc = c + dc, nr = r + dr; if (nc >= 0 && nc < C && nr >= 0 && nr < R && !cells[nr][nc].v) nbrs.push([dir, nc, nr, opp]); }
      if (!nbrs.length) { stack.pop(); continue; }
      const [dir, nc, nr, opp] = nbrs[(Math.random() * nbrs.length) | 0];
      cells[r][c][dir] = false; cells[nr][nc][opp] = false; cells[nr][nc].v = true; stack.push([nc, nr]);
    }
    // braid — open some walls to create loops / multiple routes
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      if (Math.random() > this.BRAID) continue;
      const opts = [];
      if (c < C - 1 && cells[r][c].E) opts.push(['E', c + 1, r, 'W']);
      if (r < R - 1 && cells[r][c].S) opts.push(['S', c, r + 1, 'N']);
      if (!opts.length) continue;
      const [dir, nc, nr, opp] = opts[(Math.random() * opts.length) | 0];
      cells[r][c][dir] = false; cells[nr][nc][opp] = false;
    }
    this.cells = cells;
  }

  /** True shortest hop-count start→goal over open passages (honesty baseline for Phase C). */
  _bfsShortest(start, goal) {
    const q = [[start.c, start.r, 0]]; const seen = new Set([this._id(start.c, start.r)]);
    while (q.length) {
      const [c, r, d] = q.shift();
      if (c === goal.c && r === goal.r) return d;
      const cell = this.cells[r][c];
      const steps = [];
      if (!cell.N && r > 0) steps.push([c, r - 1]);
      if (!cell.S && r < this.rows - 1) steps.push([c, r + 1]);
      if (!cell.W && c > 0) steps.push([c - 1, r]);
      if (!cell.E && c < this.cols - 1) steps.push([c + 1, r]);
      for (const [nc, nr] of steps) { const k = this._id(nc, nr); if (!seen.has(k)) { seen.add(k); q.push([nc, nr, d + 1]); } }
    }
    return -1;
  }

  _cellOf(a) {
    const c = Math.max(0, Math.min(this.cols - 1, Math.floor((a.x - this.ox) / this.cw)));
    const r = Math.max(0, Math.min(this.rows - 1, Math.floor((a.y - this.oy) / this.ch)));
    return { c, r };
  }

  _confine(a) {
    const rad = (a.radius || 4) + 1;
    a.x = Math.max(this.ox + rad, Math.min(this.ox + this.mazeW - rad, a.x));
    a.y = Math.max(this.oy + rad, Math.min(this.oy + this.mazeH - rad, a.y));
    const { c, r } = this._cellOf(a);
    const cell = this.cells[r][c];
    const left = this.ox + c * this.cw, right = left + this.cw, top = this.oy + r * this.ch, bottom = top + this.ch;
    if (cell.W && a.x < left + rad)   { a.x = left + rad;   if (a.vx < 0) a.vx = -a.vx * 0.5; }
    if (cell.E && a.x > right - rad)  { a.x = right - rad;  if (a.vx > 0) a.vx = -a.vx * 0.5; }
    if (cell.N && a.y < top + rad)    { a.y = top + rad;    if (a.vy < 0) a.vy = -a.vy * 0.5; }
    if (cell.S && a.y > bottom - rad) { a.y = bottom - rad; if (a.vy > 0) a.vy = -a.vy * 0.5; }
  }

  tick() {
    if (!this.active) return;
    const agents = this.world.agents.filter(a => !a.seppukuDone && !a.isSentinel && this._owns(a));

    for (const a of agents) {
      this._confine(a);
      // Arena sustenance — safe travel keeps an agent alive so the colony can actually solve the
      // maze instead of background-starving; only traps (which drain faster) cause net loss.
      if (a.energy != null) a.energy = Math.min(1, a.energy + this.SUSTAIN);
      const { c, r } = this._cellOf(a);
      const cellId = this._id(c, r);

      // Crossed into a new adjacent cell? Deposit flow on that edge (agents = the flow medium).
      if (this.mold && a._mazeCell && a._mazeCell !== cellId) {
        this.mold.deposit(a._mazeCell, cellId, this.DEPOSIT);
        a._mazeCell = cellId;
      } else if (!a._mazeCell) { a._mazeCell = cellId; }

      // Phase D — TRAPS: standing in one harms the agent AND teaches the colony. The danger
      // mark grows from suffering (sacrifice-as-information). A depleted agent that falls here
      // is the sacrifice: a hard danger spike + honor + a note in collective memory. The living
      // then route around it (see _steer). Nobody was told where the traps are — they learned.
      if (this.traps.has(cellId)) {
        if (a.energy != null) a.energy = Math.max(0, a.energy - this.TRAP_DRAIN);
        a.griefLevel = Math.min(1, (a.griefLevel || 0) + this.TRAP_GRIEF);
        this.danger.set(cellId, Math.min(1, (this.danger.get(cellId) || 0) + this.DANGER_LEARN));
        if (this.world.markHit) this.world.markHit(a, '255,60,40');
        if (a.energy != null && a.energy <= 0 && !a._mazeFell) {
          a._mazeFell = true; this.trapFalls++;
          this.danger.set(cellId, 1);
          a.honor = (a.honor || 0) + 1;      // a death that teaches earns honor
          a.seppukuDone = true;              // the sacrifice
          if (this.world.collectiveMemory) this.world.collectiveMemory.push({ type: 'trap_learned', cell: cellId, t: this.world.time });
          if (window.logLine) window.logLine(`☠ Agent #${a.id} fell to the trap at ${cellId} — the colony learns the danger.`, 'crisis');
          if (window.addEvent) window.addEvent(`☠ A scout fell to a hidden trap — the swarm now marks it and routes around.`, 'crisis');
          continue;                          // fallen — no steering
        }
      }

      // ── EAT ────────────────────────────────────────────────────────
      // Passing over a ripe pellet consumes it and eases grief. Faith deepens
      // the relief, the way pilgrimage does on the open map. Because pellets
      // blanket every corridor, an agent staying fed is wandering, not
      // homing — which is exactly the counter-pressure to the goal.
      if (this._eatR == null) this._eatR = Math.min(this.cw, this.ch) * this.PELLET_R;
      const bucket = this.pelletsByCell.get(cellId);
      if (bucket) {
        for (let i = 0; i < bucket.length; i++) {
          const pel = bucket[i];
          if (pel.v < 0.9) continue;
          if (Math.abs(pel.x - a.x) > this._eatR || Math.abs(pel.y - a.y) > this._eatR) continue;
          pel.v = 0;
          const faithBonus = 1 + (a.faith || 0) * 0.6;
          a.griefLevel = Math.max(0, (a.griefLevel || 0) - this.PELLET_RELIEF * faithBonus);
          a._mazeFed = this.world.time;
          this.pelletsEaten++;
          break;                                  // one pellet per tick per agent
        }
      }

      // Attractor: seek the goal, then head home — the round trip is what reinforces short tubes.
      const target = a._mazeSeek === 'home' ? this.start : this.goal;

      if (c === this.goal.c && r === this.goal.r) {
        if (a._mazeSeek === 'goal') {
          this.finishes++;
          this._recordExit(a);
          this._reinforceRoute(a);          // lay SUCCESS_BONUS back toward start along the tubes
          a._mazeSeek = 'home';
        }
        if (a.energy != null) a.energy = Math.min(1, a.energy + 0.0016);
        if (a.updateTrust) a.updateTrust(+0.0003);
      } else if (c === this.start.c && r === this.start.r && a._mazeSeek === 'home') {
        a._mazeSeek = 'goal'; a._mazeStart = this.world.time;
      }

      if (this.mold) this._steer(a, cellId, target);
    }

    if (this.mold) {
      // The mold ACTUALLY SOLVES the graph — self-exploration (Physarum flow) + the agents'
      // deposited traffic together. This is the pentest-relevant computation: find the optimal
      // path through the topology. Dead-end tubes decay (= H2O pruning a non-credible path);
      // the route to the goal thickens. The swarm then follows the solved gradient.
      this.mold.step();
      if ((this.world.time & 15) === 0) this._refreshBestPath();   // re-extract often (watch it hold/adapt)
    }

    // Pellets regrow, so a stripped corridor becomes worth revisiting and the
    // swarm keeps circulating instead of permanently exhausting the board.
    if ((this.world.time & 3) === 0 && this.pellets.length) {
      const step = this.PELLET_REGEN * 4;
      for (let i = 0; i < this.pellets.length; i++) {
        const pel = this.pellets[i];
        if (pel.v < 1) pel.v = Math.min(1, pel.v + step);
      }
    }

    // Phase D — danger memory fades where no one is suffering (a truly-shunned trap dims, so
    // the colony can re-explore if the map changes). Cheap sweep every 8 ticks.
    if ((this.world.time & 7) === 0 && this.danger.size) {
      for (const [id, d] of this.danger) {
        const nd = d - this.DANGER_EVAP;
        if (nd <= 0) this.danger.delete(id); else this.danger.set(id, nd);
      }
    }
  }

  /** Extract the optimal path from the core (deterministic, scales) and cache its edge set for render. */
  _refreshBestPath() {
    const res = this.mold.extractOptimalPaths();
    this.bestPath = res.paths[0] || null;
    this._bestSet = new Set();
    if (this.bestPath) for (let i = 0; i < this.bestPath.nodes.length - 1; i++) {
      this._bestSet.add(this.bestPath.nodes[i] + '|' + this.bestPath.nodes[i + 1]);
      this._bestSet.add(this.bestPath.nodes[i + 1] + '|' + this.bestPath.nodes[i]);
    }
  }

  _recordExit(a) {
    const t = this.world.time - (a._mazeStart || this.world.time);
    if (t > 0) { this.exitTimes.push(t); if (this.exitTimes.length > 50) this.exitTimes.shift(); }
  }

  /** Reaching the goal reinforces the tubes the agent actually used to get there. */
  _reinforceRoute(a) {
    // The chemoattractant gradient already concentrates flow; add a success bonus at the goal
    // node's incident edges so proven approaches thicken faster (shorter routes get it more often).
    const gId = this._id(this.goal.c, this.goal.r);
    for (const n of this.mold.neighbors(gId)) this.mold.deposit(gId, n.target, this.SUCCESS_BONUS);
  }

  /**
   * Steer toward the current attractor. Hysteresis is the key: an agent COMMITS to a target
   * neighbour cell and holds it until it arrives, instead of re-choosing every tick (which made
   * agents oscillate in place between two cells and stall). It also avoids immediate backtracking,
   * and if the attractor itself is one open hop away it takes that hop NOW (closes the last cell).
   * Exploit = conductance × chemoattractant proximity (the Physarum chemical gradient); explore =
   * a random open neighbour. The graph only has edges through OPEN passages, so this never steers
   * into a wall.
   */
  _steer(a, cellId, attractorCell) {
    const nbrs = this.mold.neighbors(cellId);
    if (!nbrs.length) { a._mazeTgt = null; return; }
    const attractorId = this._id(attractorCell.c, attractorCell.r);

    if (nbrs.some(n => n.target === attractorId)) {              // attractor one hop away → take it
      a._mazeTgt = attractorId; a._mazePrev = cellId;
    } else if (!a._mazeTgt || a._mazeTgt === cellId) {           // arrived (or none) → commit new target
      let pool = nbrs.filter(n => n.target !== a._mazePrev);     // don't immediately backtrack
      if (!pool.length) pool = nbrs;
      let choice;
      if (Math.random() < this.EXPLORE_PROB) {
        choice = pool[(Math.random() * pool.length) | 0];
      } else {
        let best = null, bestScore = -1;
        for (const n of pool) {
          const [nc, nr] = n.target.split(',').map(Number);
          const dist = Math.hypot(nc - attractorCell.c, nr - attractorCell.r);
          const dgr = this.danger.get(n.target) || 0;               // Phase D — shun learned traps
          const score = (0.4 + n.conductance) * (1 / (1 + dist)) * (1 - dgr * this.DANGER_AVOID);
          if (score > bestScore) { bestScore = score; best = n; }
        }
        choice = best;
      }
      a._mazePrev = cellId; a._mazeTgt = choice.target;
    }

    const [nc, nr] = a._mazeTgt.split(',').map(Number);
    const tgt = this._cellCenter(nc, nr);
    const dx = tgt.x - a.x, dy = tgt.y - a.y, d = Math.hypot(dx, dy) || 1;
    a.vx += (dx / d) * this.GRADIENT_FORCE; a.vy += (dy / d) * this.GRADIENT_FORCE;
  }

  draw(ctx) {
    if (!this.active || !this.cells) return;
    ctx.save();

    // Pellets — small discrete dots along every corridor, Pac-Man style. Ripe
    // ones read bright; eaten ones fade out and grow back. Drawn beneath the
    // walls so corridors stay the clearest thing on screen.
    if (this.pellets && this.pellets.length) {
      const rad = Math.max(1.1, Math.min(this.cw, this.ch) * 0.055);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.pellets.length; i++) {
        const pel = this.pellets[i];
        if (pel.v <= 0.05) continue;
        ctx.fillStyle = `rgba(245,215,140,${0.30 + 0.55 * pel.v})`;
        ctx.beginPath();
        ctx.arc(pel.x, pel.y, rad * (0.55 + 0.45 * pel.v), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // Reward glow at the goal
    ctx.globalCompositeOperation = 'lighter';
    const rg = ctx.createRadialGradient(this.reward.x, this.reward.y, 0, this.reward.x, this.reward.y, this.reward.r);
    rg.addColorStop(0, 'rgba(240,205,120,0.55)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.9; ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(this.reward.x, this.reward.y, this.reward.r, 0, Math.PI * 2); ctx.fill();

    // Slime-mold TUBES — every edge, thickness + brightness ∝ conductance (the network thinking)
    if (this.mold) {
      for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
        const cell = this.cells[r][c], a = this._id(c, r);
        const drawTube = (b, bc, br) => {
          const k = this.mold.conductance(a, b);
          if (k < 0.04) return;
          const p1 = this._cellCenter(c, r), p2 = this._cellCenter(bc, br);
          const onBest = this._bestSet && this._bestSet.has(a + '|' + b);
          ctx.strokeStyle = onBest ? `rgba(240,205,120,${0.5 + 0.5 * k})` : `rgba(150,235,190,${0.25 + 0.55 * k})`;
          ctx.lineWidth = (onBest ? 2.2 : 1.2) + k * 4.5;
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        };
        if (!cell.E && c < this.cols - 1) drawTube(this._id(c + 1, r), c + 1, r);
        if (!cell.S && r < this.rows - 1) drawTube(this._id(c, r + 1), c, r + 1);
      }
    }

    // Maze walls — neon, over the tubes
    ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round';
    const stroke = (x1, y1, x2, y2) => {
      ctx.strokeStyle = 'rgba(60,200,230,0.10)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(150,235,255,0.7)'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    };
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const cell = this.cells[r][c];
      const left = this.ox + c * this.cw, top = this.oy + r * this.ch, right = left + this.cw, bottom = top + this.ch;
      if (cell.N) stroke(left, top, right, top);
      if (cell.W) stroke(left, top, left, bottom);
      if (c === this.cols - 1 && cell.E) stroke(right, top, right, bottom);
      if (r === this.rows - 1 && cell.S) stroke(left, bottom, right, bottom);
    }

    // Phase D — DANGER MARKS: learned traps glow red ∝ how much the colony has suffered there.
    // Undiscovered traps are INVISIBLE — the mark is knowledge, earned by sacrifice.
    ctx.globalCompositeOperation = 'source-over';
    for (const [id, d] of this.danger) {
      const [c, r] = id.split(',').map(Number);
      const p = this._cellCenter(c, r);
      const rad = Math.min(this.cw, this.ch) * 0.30;
      ctx.globalAlpha = 0.25 + 0.5 * d;
      ctx.fillStyle = `rgba(255,60,50,${0.18 + 0.4 * d})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fill();
      if (d > 0.5) {   // an X once the colony knows it well
        ctx.strokeStyle = `rgba(255,140,130,${0.5 + 0.4 * d})`; ctx.lineWidth = 1.4;
        const q = rad * 0.5;
        ctx.beginPath();
        ctx.moveTo(p.x - q, p.y - q); ctx.lineTo(p.x + q, p.y + q);
        ctx.moveTo(p.x + q, p.y - q); ctx.lineTo(p.x - q, p.y + q); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    const s = this._cellCenter(this.start.c, this.start.r);
    ctx.globalAlpha = 0.85; ctx.fillStyle = 'rgba(120,255,170,0.9)';
    ctx.beginPath(); ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2); ctx.fill();

    // Status readout
    const avg = this.exitTimes.length ? Math.round(this.exitTimes.reduce((x, y) => x + y, 0) / this.exitTimes.length) : 0;
    const bpLen = this.bestPath ? this.bestPath.nodes.length - 1 : 0;
    ctx.globalAlpha = 0.9; ctx.textAlign = 'left'; ctx.font = '9px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(240,205,120,0.95)';
    ctx.fillText(`MAZE ${this.cols}×${this.rows} · SLIME MOLD · reaches ${this.finishes} · path ${bpLen}/${this.trueShortest} · avg-exit ${avg}t · traps ${this.traps.size} learned ${this.danger.size} fell ${this.trapFalls}`, this.ox, this.oy - 4);
    ctx.restore();
  }

  status() {
    if (!this.active) return { active: false };
    const avg = this.exitTimes.length ? +(this.exitTimes.reduce((x, y) => x + y, 0) / this.exitTimes.length).toFixed(1) : null;
    return {
      active: true,
      grid: `${this.cols}x${this.rows}`,
      goalReaches: this.finishes,
      trueShortest: this.trueShortest,
      bestPathLen: this.bestPath ? this.bestPath.nodes.length - 1 : null,
      optimal: this.bestPath ? (this.bestPath.nodes.length - 1 === this.trueShortest) : null,
      avgExitTicks: avg,
      recentExitSamples: this.exitTimes.length,
      traps: this.traps.size,
      dangerLearned: this.danger.size,
      trapFalls: this.trapFalls,
      pellets: this.pellets ? this.pellets.length : 0,
      pelletsRipe: this.pellets ? this.pellets.filter(p => p.v >= 0.9).length : 0,
      pelletsEaten: this.pelletsEaten || 0,
      mold: this.mold ? this.mold.stats() : null
    };
  }
};
