/**
 * GAUNTLET — a TEAM obstacle. Not a maze, not a solo confidence course: an obstacle
 * that is IMPOSSIBLE for one agent and only solvable by the group coordinating.
 *
 * The pressure gate: a barrier splits the field. The gate in it stays OPEN only while
 * at least REQUIRED pads are held AT THE SAME TIME. One agent cannot hold enough pads.
 * A reward the colony wants (rich food + optional relic) sits on the far side, so the
 * crowd is drawn to the barrier — and the only way the crowd gets through is if some
 * bodies STAY on the pads while the rest cross. Hold formation and you pass; scatter
 * and the gate slams. Trust/cohesion decide whether the group can hold it.
 *
 * Enable via k26.gauntlet.enable() (optionally { singleColony:true } to collapse the
 * two colonies into one squad — pure LRC, no tribe war muddying the test).
 */
window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.GauntletSystem = class GauntletSystem {
  constructor(world) {
    this.world = world;
    this.active = false;
    this.PAD_RADIUS   = 26;   // an agent within this holds the pad
    this.REQUIRED     = 3;    // pads that must be held AT ONCE to open the gate
    this.PAD_COUNT    = 4;    // total pads (need REQUIRED of them)
    this.PAD_LINGER   = 0.86; // pads gently hold whoever stands on them (a rest spot)
    this.REWARD_PULL  = 0.05; // how strongly the far-side reward tempts the crowd
    this.crossed      = 0;    // agents that have made it to the reward
  }

  enable(opts = {}) {
    const W = this.world.width, H = this.world.height;
    this.barrierX = W * 0.60;               // vertical barrier, reward to its right
    this.gateY    = H * 0.5;                // gate opening centered vertically
    this.gateHalf = H * 0.09;              // gate aperture half-height
    this.thickness = 10;
    // Pads on the APPROACH (left) side, staggered so a spread-out group can cover them.
    this.pads = [];
    for (let i = 0; i < this.PAD_COUNT; i++) {
      this.pads.push({
        x: W * 0.44,
        y: H * (0.24 + i * (0.52 / (this.PAD_COUNT - 1))),
        held: false
      });
    }
    this.reward = { x: W * 0.82, y: H * 0.5, r: 60 };
    this.gateOpen = false;
    this.crossed = 0;

    if (opts.singleColony) {
      // Collapse to ONE squad: everyone Colony A, tint unified. Pure LRC.
      for (const a of this.world.agents) {
        if (a.colony !== 'U') { a.colony = 'A'; a.swarmTint = 0; }
        // start them all on the approach side
        if (a.x > this.barrierX - 30) a.x = Math.random() * (this.barrierX - 40);
      }
      // silence the dividing wall so only the gauntlet barrier matters
      if (this.world.wall && this.world.wall.gates) {
        this.world.wall.gates.forEach(g => { g.open = true; });
        this._wallSilenced = true;
      }
    }
    this.active = true;
    if (window.logLine) {
      window.logLine('▣ GAUNTLET ARMED — the pressure gate opens only while ' + this.REQUIRED +
        ' pads are held at once. The reward is across. Coordinate or it stays shut.', 'emerge');
    }
    return this.status();
  }

  disable() { this.active = false; }

  tick() {
    if (!this.active) return;
    const agents = this.world.agents.filter(a => !a.seppukuDone && !a.isSentinel);

    // 1) Pad occupancy — how many DISTINCT pads are held right now.
    let heldCount = 0;
    for (const pad of this.pads) {
      let occupied = false;
      for (const a of agents) {
        if (Math.hypot(a.x - pad.x, a.y - pad.y) < this.PAD_RADIUS) {
          occupied = true;
          // Pads gently hold their occupant — standing your post has a little stickiness.
          a.vx *= this.PAD_LINGER; a.vy *= this.PAD_LINGER;
        }
      }
      pad.held = occupied;
      if (occupied) heldCount++;
    }
    this.heldCount = heldCount;
    this.gateOpen = heldCount >= this.REQUIRED;

    // 2) The reward tempts everyone on the APPROACH side toward the barrier/gate.
    for (const a of agents) {
      if (a.x < this.barrierX) {
        const dx = this.reward.x - a.x, dy = this.reward.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const f = this.REWARD_PULL * Math.min(1, 200 / d);
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
      }
    }

    // 3) Barrier collision — block crossing unless through an OPEN gate aperture.
    const bx = this.barrierX, half = this.thickness / 2;
    for (const a of agents) {
      const inGate = this.gateOpen && Math.abs(a.y - this.gateY) < this.gateHalf;
      if (inGate) {
        if (a._gx != null && a._gx < bx && a.x >= bx) this.crossed++;   // just crossed
        a._gx = a.x; continue;
      }
      // solid barrier — push back to whichever side the agent was on
      const prev = (a._gx != null) ? a._gx : a.x;
      if (prev <= bx) { if (a.x > bx - half) { a.x = bx - half; if (a.vx > 0) a.vx = -a.vx * 0.5; } }
      else            { if (a.x < bx + half) { a.x = bx + half; if (a.vx < 0) a.vx = -a.vx * 0.5; } }
      a._gx = a.x;
    }

    // 4) Reward — agents that reach it are fed (real payoff for solving the gate).
    for (const a of agents) {
      if (a.x > this.barrierX && Math.hypot(a.x - this.reward.x, a.y - this.reward.y) < this.reward.r) {
        if (a.energy != null) a.energy = Math.min(1, a.energy + 0.0015);
        if (a.updateTrust) a.updateTrust(+0.0002);
      }
    }
  }

  draw(ctx) {
    if (!this.active) return;
    const H = this.world.height;
    ctx.save();

    // Reward glow (far side)
    ctx.globalCompositeOperation = 'lighter';
    const rg = ctx.createRadialGradient(this.reward.x, this.reward.y, 0, this.reward.x, this.reward.y, this.reward.r);
    rg.addColorStop(0, 'rgba(240,200,120,0.5)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.9; ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(this.reward.x, this.reward.y, this.reward.r, 0, Math.PI * 2); ctx.fill();

    // Barrier — solid spans above and below the gate aperture
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = this.gateOpen ? 'rgba(120,220,150,0.75)' : 'rgba(255,90,70,0.8)';
    ctx.lineWidth = this.thickness;
    ctx.beginPath();
    ctx.moveTo(this.barrierX, 0);                       ctx.lineTo(this.barrierX, this.gateY - this.gateHalf);
    ctx.moveTo(this.barrierX, this.gateY + this.gateHalf); ctx.lineTo(this.barrierX, H);
    ctx.stroke();

    // Gate aperture markers — green posts when open, red when shut
    const gc = this.gateOpen ? 'rgba(120,220,150,0.9)' : 'rgba(255,90,70,0.9)';
    ctx.fillStyle = gc;
    for (const yy of [this.gateY - this.gateHalf, this.gateY + this.gateHalf]) {
      ctx.beginPath(); ctx.arc(this.barrierX, yy, 4, 0, Math.PI * 2); ctx.fill();
    }

    // Pads — lit when held, dim when empty; ring shows the count vs REQUIRED
    for (const pad of this.pads) {
      ctx.globalCompositeOperation = pad.held ? 'lighter' : 'source-over';
      ctx.globalAlpha = pad.held ? 0.9 : 0.4;
      ctx.strokeStyle = pad.held ? 'rgba(140,220,255,0.95)' : 'rgba(120,120,150,0.5)';
      ctx.lineWidth = pad.held ? 2 : 1;
      ctx.setLineDash(pad.held ? [] : [3, 4]);
      ctx.beginPath(); ctx.arc(pad.x, pad.y, this.PAD_RADIUS * 0.7, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Status readout above the gate
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.85; ctx.textAlign = 'center';
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillStyle = gc;
    ctx.fillText(`PADS ${this.heldCount || 0}/${this.REQUIRED}  ·  GATE ${this.gateOpen ? 'OPEN' : 'SHUT'}  ·  CROSSED ${this.crossed}`,
      this.barrierX, 16);
    ctx.restore();
  }

  status() {
    return { active: this.active, held: this.heldCount || 0, required: this.REQUIRED,
             gateOpen: !!this.gateOpen, crossed: this.crossed, pads: this.pads ? this.pads.length : 0 };
  }
};
