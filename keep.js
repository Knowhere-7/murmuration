/* ══════════════════════════════════════════════════════════════════════════
   THE KEEP — the king's last line of defence.

   Ghost, 2026-08-24: "my goal is to make the maze the kings last line of
   defense. it slows attackers and offer time for guards to catch up or king
   to escape. so king is there alone but guards can be added. traps can exist
   but not hurt an entire squad" — and "keep the maze round not square".

   THIS IS NOT MazeSystem. That system drops a whole colony into a grid and
   runs a pathfinding MISSION: pellets, slime-mold flow, a goal cell, and a
   grief cascade that is the point of the exercise. The keep inverts every one
   of those. Nobody is placed inside it. It is standing architecture that sits
   on the ground around a crown, and its only job is to COST AN ATTACKER TIME.

   ROUND, NOT SQUARE. Concentric ring walls with one gap each, staggered so no
   two gaps line up. An attacker cannot run straight at the crown: reaching it
   means finding a gap, arcing around the ring to the next one, and repeating
   inward. That is defence in depth expressed as architecture rather than as
   terrain ripples — and it is the same shape as the basin it sits in, so the
   keep reads as the floor of the bowl rather than a box dropped into it.

   DELAY IS THE PRODUCT. Every tick an attacker spends arcing is a tick the
   guard detail uses to close, or the king uses to run. The keep never kills;
   it only makes distance expensive. What that bought is measured, not
   asserted — see `stats()`.

   TRAPS COST AN INDIVIDUAL, NEVER A SQUAD. A trap here fires on ONE agent,
   goes on cooldown, and applies a movement penalty rather than damage. The
   maze system's traps drain life and push grief into neighbours, which is how
   a confined cohort grieves itself to death; that behaviour is correct for a
   mission and catastrophic for a keep, where it would delete the squad the
   range exists to train against.
   ══════════════════════════════════════════════════════════════════════════ */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.Keep = class Keep {
  /**
   * @param world   the live world (for agents + dimensions)
   * @param opts.colony  'A' | 'B' — whose crown this keep defends
   * @param opts.centre  () => ({x,y}) — the crown, sampled live so the keep
   *                     follows a king that is re-crowned or relocated
   */
  constructor(world, opts = {}) {
    this.world = world;
    this.colony = opts.colony || 'A';
    this.centreFn = opts.centre || (() => ({ x: 0, y: 0 }));

    this.rings = opts.rings || 3;        // how many walls between open ground and the crown
    this.innerR = opts.innerR || 34;     // clear ground the king stands on
    this.spacing = opts.spacing || 30;   // distance between ring walls
    this.gapArc = opts.gapArc || 0.44;   // gap width in radians (~25 degrees)
    this.wallPush = opts.wallPush || 1.5;// how hard a wall refuses passage

    // Traps: individual cost, never a squad wipe.
    this.trapsPerRing = opts.trapsPerRing == null ? 2 : opts.trapsPerRing;
    this.TRAP_SLOW = 0.55;               // velocity retained when snared
    this.TRAP_TICKS = 42;                // how long one agent stays snared
    this.TRAP_COOLDOWN = 150;            // ticks before that trap can fire again
    this.TRAP_MAX_CONCURRENT = 2;        // hard ceiling on simultaneously snared

    this.active = false;
    this.traps = [];
    this._snared = new Map();            // agent -> ticks remaining
    this._delayTicks = 0;                // total attacker-ticks spent inside
    this._breaches = 0;                  // times an attacker reached the crown
    this._deepest = 0;                   // deepest ring an attacker has cleared
    this._buildGeometry();
  }

  /** Gap bearings, staggered so no two rings open on the same line. */
  _buildGeometry() {
    this.gaps = [];
    // golden-angle stagger: successive gaps land as far from the previous
    // bearing as possible, so no straight run to the crown exists at any angle.
    const GOLDEN = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < this.rings; i++) this.gaps.push((i * GOLDEN) % (Math.PI * 2));

    this.traps = [];
    if (this.trapsPerRing > 0) {
      for (let i = 0; i < this.rings; i++) {
        const r = this.innerR + (i + 1) * this.spacing;
        for (let t = 0; t < this.trapsPerRing; t++) {
          // seat traps AWAY from the gap — the gap is the invitation, the
          // corridor beside it is where the cost lives.
          const a = this.gaps[i] + Math.PI * (0.6 + 0.8 * (t + 1) / (this.trapsPerRing + 1));
          this.traps.push({ ring: i, ang: a % (Math.PI * 2), r: r - this.spacing * 0.5, cool: 0 });
        }
      }
    }
  }

  enable() { this.active = true; return this; }
  disable() { this.active = false; this._snared.clear(); return this; }

  /** Radius of ring i, outermost last. */
  ringR(i) { return this.innerR + (i + 1) * this.spacing; }
  /** Everything inside this is the keep's footprint. */
  outerR() { return this.ringR(this.rings - 1); }

  _isDefender(a) { return a.colony === this.colony; }

  /**
   * Post-step correction, called after the world advances — the same contract
   * the kings and the maze use. Walls are enforced here rather than as forces
   * so an attacker cannot simply out-accelerate the architecture.
   */
  step() {
    if (!this.active) return;
    const c = this.centreFn();
    if (!c) return;
    const agents = this.world.agents;
    const outer = this.outerR();

    // release expired snares first so a freed agent moves this same tick
    for (const [a, t] of this._snared) {
      if (t <= 1) this._snared.delete(a); else this._snared.set(a, t - 1);
    }
    for (const t of this.traps) if (t.cool > 0) t.cool--;

    for (const a of agents) {
      if (a.seppukuDone || a.isSentinel) continue;
      const dx = a.x - c.x, dy = a.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d > outer + this.spacing) continue;          // not in the keep's business

      const isKing = !!a.isKing;
      // THE KING IS ALONE IN HERE, AND FREE. He is the one agent the walls do
      // not hold — the keep exists to buy him time, so it must never be the
      // thing that traps him when he runs.
      if (isKing) continue;

      const defender = this._isDefender(a);
      if (!defender) this._delayTicks++;               // an attacker is paying rent

      const ang = Math.atan2(dy, dx);
      // Walls, outermost inward. A defender passes freely — GUARDS CAN BE
      // ADDED, and a guard detail that could not reach its own king would be
      // an own-goal. Only the unaligned are held.
      if (!defender) {
        for (let i = this.rings - 1; i >= 0; i--) {
          const R = this.ringR(i);
          if (Math.abs(d - R) > this.wallPush * 2.2) continue;   // not at this wall
          let diff = Math.abs(((ang - this.gaps[i] + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (diff < this.gapArc * 0.5) {              // through the gap
            const cleared = this.rings - i;
            if (cleared > this._deepest) this._deepest = cleared;
            continue;
          }
          // refused: push back out along the radius and kill inward velocity
          const nx = dx / (d || 1), ny = dy / (d || 1);
          const side = d < R ? -1 : 1;                 // hold them on the side they came from
          a.x = c.x + nx * (R + side * this.wallPush * 2.2);
          a.y = c.y + ny * (R + side * this.wallPush * 2.2);
          const radial = a.vx * nx + a.vy * ny;
          if ((side === 1 && radial < 0) || (side === -1 && radial > 0)) {
            a.vx -= radial * nx; a.vy -= radial * ny;  // strip the inward component only,
          }                                            // so sliding ALONG the wall still works
          break;
        }
      }

      // TRAPS — one agent, one snare, hard ceiling. Attackers only.
      if (!defender && this._snared.size < this.TRAP_MAX_CONCURRENT && !this._snared.has(a)) {
        for (const t of this.traps) {
          if (t.cool > 0) continue;
          const tx = c.x + Math.cos(t.ang) * t.r, ty = c.y + Math.sin(t.ang) * t.r;
          if (Math.hypot(a.x - tx, a.y - ty) < 9) {
            this._snared.set(a, this.TRAP_TICKS);
            t.cool = this.TRAP_COOLDOWN;
            break;
          }
        }
      }
      if (this._snared.has(a)) { a.vx *= this.TRAP_SLOW; a.vy *= this.TRAP_SLOW; }

      // breach: an attacker standing on the crown's clear ground
      if (!defender && d < this.innerR) this._breaches++;
    }
  }

  draw(ctx) {
    if (!this.active) return;
    const c = this.centreFn();
    if (!c) return;
    ctx.save();
    for (let i = 0; i < this.rings; i++) {
      const R = this.ringR(i);
      const g = this.gaps[i];
      // inner rings read hotter — the closer to the crown, the more it matters
      const heat = i / Math.max(1, this.rings - 1);
      ctx.strokeStyle = `hsla(${175 - heat * 150}, 78%, ${52 + heat * 8}%, ${0.30 + (1 - heat) * 0.34})`;
      ctx.lineWidth = 1 + (1 - heat) * 0.7;
      ctx.beginPath();
      ctx.arc(c.x, c.y, R, g + this.gapArc * 0.5, g - this.gapArc * 0.5 + Math.PI * 2);
      ctx.stroke();
    }
    // traps — small, dim, and only visible once armed
    for (const t of this.traps) {
      if (t.cool > 0) continue;
      const tx = c.x + Math.cos(t.ang) * t.r, ty = c.y + Math.sin(t.ang) * t.r;
      ctx.fillStyle = 'rgba(255,176,32,0.5)';
      ctx.beginPath(); ctx.arc(tx, ty, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /** What the keep actually bought, in ticks — never asserted, only measured. */
  stats() {
    return {
      active: this.active,
      colony: this.colony,
      rings: this.rings,
      delayTicks: this._delayTicks,
      breaches: this._breaches,
      deepestRingCleared: this._deepest,
      snared: this._snared.size
    };
  }
};
