/**
 * MAZE — the swarm's navigation test rig.
 *
 * A maze is not a level we draw; it is the obstacle that FORCES the swarm's abstract
 * navigation traits to become real, spatial skills (Phases B–D layer those in):
 *   Phase A (this file, for now): real braided-grid geometry + generalized wall collision
 *           + a single-colony arena. Agents are truly CONTAINED by walls — they can only
 *           reach the goal through the actual passages. With no wall-sensing yet, they
 *           bounce and random-walk; some reach the goal. That's the honest Phase-A baseline.
 *   Phase B: echolocation wall-sensing (probe ahead, steer, stop bouncing).
 *   Phase C: pheromone stigmergy (deposit/evaporate/reinforce → colony finds shortest path).
 *   Phase D: trap cells + hazard memory (sacrifice-as-information).
 *
 * Self-contained, like gauntlet.js / relics.js: the maze owns its OWN walls and collision,
 * so it never touches world.applyWallCollision (the normal two-colony divider) and normal
 * play is undisturbed. Arm with k26.maze.enable({ singleColony:true, difficulty:2 }).
 */
window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.MazeSystem = class MazeSystem {
  constructor(world) {
    this.world = world;
    this.active = false;
    // difficulty → max grid dimension (cells adapt to canvas but never exceed this)
    this.MAX_COLS = { 1: 8, 2: 12, 3: 16 };
    this.TARGET_CELL = 34;   // aim for ~34px cells; clamps so cells stay navigable
    this.BRAID = 0.18;       // fraction of dead-ends opened into loops (multiple routes)
    this.finishes = 0;       // cumulative agents that have reached the goal
  }

  // ── geometry ──────────────────────────────────────────────────────────────
  enable(opts = {}) {
    const W = this.world.width, H = this.world.height;
    const diff = Math.max(1, Math.min(3, opts.difficulty || 2));
    const margin = 0.05;
    this.ox = W * margin;
    this.oy = H * margin;
    this.mazeW = W * (1 - 2 * margin);
    this.mazeH = H * (1 - 2 * margin);

    const maxC = this.MAX_COLS[diff];
    this.cols = Math.max(5, Math.min(maxC, Math.round(this.mazeW / this.TARGET_CELL)));
    this.rows = Math.max(5, Math.min(maxC, Math.round(this.mazeH / this.TARGET_CELL)));
    this.cw = this.mazeW / this.cols;
    this.ch = this.mazeH / this.rows;

    this._generate();

    // start top-left, goal bottom-right — maximizes the path the swarm must solve
    this.start = { c: 0, r: 0 };
    this.goal  = { c: this.cols - 1, r: this.rows - 1 };
    this.reward = { ...this._cellCenter(this.goal.c, this.goal.r), r: Math.min(this.cw, this.ch) * 0.42 };
    this.finishes = 0;

    if (opts.singleColony) {
      // Collapse to ONE squad (pure navigation test), drop everyone at the entrance,
      // and neutralize the normal dividing wall so only the maze walls matter.
      const s = this._cellCenter(this.start.c, this.start.r);
      for (const a of this.world.agents) {
        if (a.colony !== 'U') { a.colony = 'A'; a.swarmTint = 0; }
        a.x = s.x + (Math.random() - 0.5) * this.cw * 0.6;
        a.y = s.y + (Math.random() - 0.5) * this.ch * 0.6;
        a._mazeInGoal = false;
      }
      if (this.world.wall && this.world.wall.gates) {
        // full-height open window → world.applyWallCollision always grants free passage
        this.world.wall.gates.forEach(g => { g.open = true; g.yf = 0.5; g.hf = 0.5; });
        this._wallSilenced = true;
      }
    }

    this.active = true;
    if (window.logLine) {
      window.logLine(`▦ MAZE ARMED — ${this.cols}×${this.rows} braided grid. The goal is bottom-right. ` +
        `No wall-sensing yet (Phase A): the swarm must find it by contact.`, 'emerge');
    }
    return this.status();
  }

  disable() { this.active = false; }

  _cellCenter(c, r) {
    return { x: this.ox + (c + 0.5) * this.cw, y: this.oy + (r + 0.5) * this.ch };
  }

  /** Recursive-backtracker perfect maze, then partial braid to create loops. */
  _generate() {
    const C = this.cols, R = this.rows;
    // each cell: walls present on N,E,S,W (true = wall)
    const cells = [];
    for (let r = 0; r < R; r++) {
      const row = [];
      for (let c = 0; c < C; c++) row.push({ N: true, E: true, S: true, W: true, v: false });
      cells.push(row);
    }
    const idx = (c, r) => cells[r][c];
    // iterative DFS carve
    const stack = [[0, 0]];
    idx(0, 0).v = true;
    const dirs = [['N', 0, -1, 'S'], ['E', 1, 0, 'W'], ['S', 0, 1, 'N'], ['W', -1, 0, 'E']];
    while (stack.length) {
      const [c, r] = stack[stack.length - 1];
      const nbrs = [];
      for (const [dir, dc, dr, opp] of dirs) {
        const nc = c + dc, nr = r + dr;
        if (nc >= 0 && nc < C && nr >= 0 && nr < R && !cells[nr][nc].v) nbrs.push([dir, nc, nr, opp]);
      }
      if (!nbrs.length) { stack.pop(); continue; }
      const [dir, nc, nr, opp] = nbrs[(Math.random() * nbrs.length) | 0];
      idx(c, r)[dir] = false;      // remove wall between here and neighbor
      cells[nr][nc][opp] = false;
      cells[nr][nc].v = true;
      stack.push([nc, nr]);
    }
    // braid: open a fraction of interior walls to create alternate routes / loops
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        if (Math.random() > this.BRAID) continue;
        const opts = [];
        if (c < C - 1 && cells[r][c].E) opts.push(['E', c + 1, r, 'W']);
        if (r < R - 1 && cells[r][c].S) opts.push(['S', c, r + 1, 'N']);
        if (!opts.length) continue;
        const [dir, nc, nr, opp] = opts[(Math.random() * opts.length) | 0];
        cells[r][c][dir] = false;
        cells[nr][nc][opp] = false;
      }
    }
    this.cells = cells;
  }

  // ── simulation ────────────────────────────────────────────────────────────
  tick() {
    if (!this.active) return;
    const agents = this.world.agents.filter(a => !a.seppukuDone && !a.isSentinel);
    for (const a of agents) this._confine(a);

    // Goal reward — reaching the goal cell feeds the agent (real payoff) and is counted once.
    for (const a of agents) {
      const gc = this._cellOf(a);
      const inGoal = gc.c === this.goal.c && gc.r === this.goal.r;
      if (inGoal) {
        if (!a._mazeInGoal) { a._mazeInGoal = true; this.finishes++; }
        if (a.energy != null) a.energy = Math.min(1, a.energy + 0.0018);
        if (a.updateTrust) a.updateTrust(+0.0003);
      } else if (a._mazeInGoal && !(Math.abs(gc.c - this.goal.c) <= 0 && Math.abs(gc.r - this.goal.r) <= 0)) {
        a._mazeInGoal = false; // left the goal cell — can score again on a fresh arrival
      }
    }
  }

  _cellOf(a) {
    const c = Math.max(0, Math.min(this.cols - 1, Math.floor((a.x - this.ox) / this.cw)));
    const r = Math.max(0, Math.min(this.rows - 1, Math.floor((a.y - this.oy) / this.ch)));
    return { c, r };
  }

  /**
   * Generalized wall collision: keep the agent inside the maze bounds, then reflect it off
   * any CLOSED wall of the cell it currently occupies. Because the cell is computed from the
   * post-move position, an agent that stepped across a closed edge is already "in" the next
   * cell and gets pushed back through that cell's shared wall — no one-cell tunnelling.
   */
  _confine(a) {
    const rad = (a.radius || 4) + 1;
    // clamp to maze outer rectangle
    a.x = Math.max(this.ox + rad, Math.min(this.ox + this.mazeW - rad, a.x));
    a.y = Math.max(this.oy + rad, Math.min(this.oy + this.mazeH - rad, a.y));

    const { c, r } = this._cellOf(a);
    const cell = this.cells[r][c];
    const left   = this.ox + c * this.cw;
    const right  = left + this.cw;
    const top    = this.oy + r * this.ch;
    const bottom = top + this.ch;

    if (cell.W && a.x < left + rad)   { a.x = left + rad;   if (a.vx < 0) a.vx = -a.vx * 0.5; }
    if (cell.E && a.x > right - rad)  { a.x = right - rad;  if (a.vx > 0) a.vx = -a.vx * 0.5; }
    if (cell.N && a.y < top + rad)    { a.y = top + rad;    if (a.vy < 0) a.vy = -a.vy * 0.5; }
    if (cell.S && a.y > bottom - rad) { a.y = bottom - rad; if (a.vy > 0) a.vy = -a.vy * 0.5; }
  }

  // ── render ────────────────────────────────────────────────────────────────
  draw(ctx) {
    if (!this.active || !this.cells) return;
    ctx.save();

    // Reward glow at the goal
    ctx.globalCompositeOperation = 'lighter';
    const rg = ctx.createRadialGradient(this.reward.x, this.reward.y, 0, this.reward.x, this.reward.y, this.reward.r);
    rg.addColorStop(0, 'rgba(240,205,120,0.55)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.9; ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(this.reward.x, this.reward.y, this.reward.r, 0, Math.PI * 2); ctx.fill();

    // Maze walls — neon, matching the world wall palette. Draw each closed edge once
    // (N of every cell + W of every cell + the outer E/S border) to avoid double-strokes.
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    const stroke = (x1, y1, x2, y2) => {
      ctx.strokeStyle = 'rgba(60,200,230,0.12)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(150,235,255,0.8)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    };
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.cells[r][c];
        const left = this.ox + c * this.cw, top = this.oy + r * this.ch;
        const right = left + this.cw, bottom = top + this.ch;
        if (cell.N) stroke(left, top, right, top);
        if (cell.W) stroke(left, top, left, bottom);
        if (c === this.cols - 1 && cell.E) stroke(right, top, right, bottom);
        if (r === this.rows - 1 && cell.S) stroke(left, bottom, right, bottom);
      }
    }

    // Start marker (green) — where the squad enters
    const s = this._cellCenter(this.start.c, this.start.r);
    ctx.globalAlpha = 0.85; ctx.fillStyle = 'rgba(120,255,170,0.9)';
    ctx.beginPath(); ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2); ctx.fill();

    // Status readout
    ctx.globalAlpha = 0.85; ctx.textAlign = 'left';
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(240,205,120,0.95)';
    ctx.fillText(`MAZE ${this.cols}×${this.rows}  ·  GOAL-REACHES ${this.finishes}`, this.ox, this.oy - 4);
    ctx.restore();
  }

  status() {
    if (!this.active) return { active: false };
    const agents = this.world.agents.filter(a => !a.seppukuDone && !a.isSentinel);
    let inGoal = 0;
    for (const a of agents) {
      const gc = this._cellOf(a);
      if (gc.c === this.goal.c && gc.r === this.goal.r) inGoal++;
    }
    return {
      active: true,
      grid: `${this.cols}x${this.rows}`,
      agents: agents.length,
      inGoalNow: inGoal,
      goalReaches: this.finishes,
      goalCell: `${this.goal.c},${this.goal.r}`
    };
  }
};
