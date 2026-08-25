/* ══════════════════════════════════════════════════════════════════════════
   WASP ALARM PHEROMONE — the call to arms.

   Ghost, 2026-08-24: "it should behave like the real thing. a call to arms,
   but just as a real pheromone has to spread outward and takes time to reach
   everyone this will do the same."

   THE SPREAD IS THE FEATURE, NOT AN IMPLEMENTATION DETAIL. A global flag would
   tell every agent instantly that something is wrong and teach nothing. A
   DIFFUSING field makes distance into delay, which does two things a flag
   cannot: it lets a colony arrive late, and — because agents climb the
   gradient — it tells them not just THAT there is trouble but WHICH WAY.
   The signal is a map.

   RELEASING AND RECEIVING ARE DIFFERENT CAPABILITIES. Real alarm pheromone
   comes from the venom apparatus: it is released by a wasp that is stinging or
   being crushed. It is not a rank, it is a consequence of CONTACT. So:

     RELEASE  the king's guard detail (they ring the crown and meet the breach
              first, like guards at a nest entrance), and ANY colony member
              actually under attack — an ambush at a distant well raises the
              colony exactly as a breach at the keep does.
     SILENT   the KING. He is the queen-analogue: the thing defended, not a
              defender. A king who calls for help is doing his guard's job.
              Also the grief SENTINEL, which is already locked out of colony
              participation by definition (no vote, no tasks).
     RECEIVE  every living colony member. Receiving is universal; releasing is
              earned by contact.

   LOBO IS DEAF AND MUTE TO IT (Ghost's ruling, 2026-08-24): "LOBO does not get
   this and no lobo cant smell it." The unaligned neither release nor sense the
   field. Predators do exploit alarm signals in nature, but this range exists to
   teach defence, and a trait that hands the attacker a map of where the fight
   is worth pressing would muddy the lesson it is here to deliver.

   The two colonies carry SEPARATE fields. Alarm pheromone is colony-specific
   in nature, and KNOWHERE's panic has no business moving MAINLAND's people.
   ══════════════════════════════════════════════════════════════════════════ */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.AlarmField = class AlarmField {
  constructor(world, opts = {}) {
    this.world = world;
    // Cell size is PROPORTIONAL, never fixed. A colony sits about 115 units
    // from its crown, so a 44-unit cell put barely two and a half cells across
    // an entire colony — the gradient had nothing to point with. Scaling to the
    // world keeps the same resolution whether the range is a phone pane or a
    // full display, which matters because this field is a direction-finder, not
    // a flag.
    this._fixedCell = !!opts.cell;        // an explicit cell wins, for tests
    this.cell = opts.cell || 0;           // 0 = derive from the world
    // PER-COLONY SENSE. The field was always separate; the CAPABILITY now is
    // too, so one colony can hold the alarm while the other does not — which is
    // the only way to ever measure what it is worth.
    this.granted = { A: opts.enabled === true, B: opts.enabled === true };
    Object.defineProperty(this, 'enabled', {
      get(){ return this.granted.A || this.granted.B; },
      set(v){ this.granted.A = this.granted.B = !!v; },
      configurable: true
    });

    // How fast the news travels, and how fast it goes stale.
    this.DIFFUSE = opts.diffuse ?? 0.38;  // share passed to neighbours per tick
    this.DECAY   = opts.decay   ?? 0.997; // per tick; alarm fades if nothing renews it
    this.GUARD_DEPOSIT  = 0.35;           // a guard in contact, per tick
    this.WOUNDED_BURST  = 3.0;            // an agent actually attacked
    this.CONTACT_R      = 70;             // how close an enemy must be to count
    this.FOLLOW         = opts.follow ?? 1.0;  // steering gain, operator-tunable
    this.MAX            = 12;             // ceiling so a long siege cannot saturate

    this._alloc();
    this.releasedThisTick = { A: 0, B: 0 };
  }

  _alloc() {
    const W = this.world.width || 1280, H = this.world.height || 720;
    if (!this._fixedCell) this.cell = Math.max(8, Math.min(W, H) / 20);
    this.cols = Math.max(4, Math.ceil(W / this.cell));
    this.rows = Math.max(4, Math.ceil(H / this.cell));
    const n = this.cols * this.rows;
    this.grid = { A: new Float32Array(n), B: new Float32Array(n) };
    this.buf  = new Float32Array(n);
    this._w = W; this._h = H;
  }

  _idx(x, y) {
    const c = Math.min(this.cols - 1, Math.max(0, (x / this.cell) | 0));
    const r = Math.min(this.rows - 1, Math.max(0, (y / this.cell) | 0));
    return r * this.cols + c;
  }

  /** Concentration at a world point, for the given colony. */
  sample(colony, x, y) {
    const g = this.grid[colony];
    return g ? g[this._idx(x, y)] : 0;
  }

  /** Which way the alarm is coming FROM — the direction to run toward. */
  gradient(colony, x, y) {
    const g = this.grid[colony];
    if (!g) return { x: 0, y: 0 };
    const s = this.cell;
    const gx = this.sample(colony, x + s, y) - this.sample(colony, x - s, y);
    const gy = this.sample(colony, x, y + s) - this.sample(colony, x, y - s);
    return { x: gx, y: gy };
  }

  grantTo(colony){ if (colony==='A'||colony==='B') this.granted[colony] = true; return this.granted; }
  hasSense(colony){ return !!this.granted[colony]; }

  _isColonist(a) {
    return a && !a.seppukuDone && !a.isSentinel && (a.colony === 'A' || a.colony === 'B');
  }

  /** Post-step, same contract as the kings and the keep. */
  step() {
    if (!this.enabled) return;
    if ((this.world.width || 1280) !== this._w || (this.world.height || 720) !== this._h) this._alloc();

    const agents = this.world.agents;
    this.releasedThisTick = { A: 0, B: 0 };

    // ── RELEASE ──────────────────────────────────────────────────────────
    // Only from contact. Nobody sounds the alarm because of a rumour.
    const enemies = agents.filter(a => a.colony === 'U' && !a.seppukuDone);
    if (enemies.length) {
      for (const a of agents) {
        if (!this._isColonist(a)) continue;
        if (a.isKing) continue;                       // the crown stays silent
        if (!this.granted[a.colony]) continue;        // a colony without the sense cannot release
        const guard = !!a._attritionGuard;
        let near = 0;
        for (const e of enemies) {
          const d = Math.hypot(e.x - a.x, e.y - a.y);
          if (d < this.CONTACT_R) { near++; if (near > 3) break; }
        }
        if (!near) continue;
        // A guard in contact releases steadily; anyone being set upon by more
        // than one releases the burst of a wasp under the hand.
        const amt = (guard ? this.GUARD_DEPOSIT : 0) + (near >= 2 ? this.WOUNDED_BURST * 0.25 : 0);
        if (amt <= 0) continue;
        const g = this.grid[a.colony];
        const i = this._idx(a.x, a.y);
        g[i] = Math.min(this.MAX, g[i] + amt);
        this.releasedThisTick[a.colony] += amt;
      }
    }

    // ── SPREAD + FADE ────────────────────────────────────────────────────
    for (const col of ['A', 'B']) this._diffuse(this.grid[col]);
  }

  _diffuse(g) {
    const C = this.cols, R = this.rows, b = this.buf, k = this.DIFFUSE * 0.25;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const i = r * C + c;
        const up    = r > 0     ? g[i - C] : g[i];
        const down  = r < R - 1 ? g[i + C] : g[i];
        const left  = c > 0     ? g[i - 1] : g[i];
        const right = c < C - 1 ? g[i + 1] : g[i];
        b[i] = (g[i] + k * (up + down + left + right - 4 * g[i])) * this.DECAY;
      }
    }
    g.set(b);
  }

  /**
   * The response. Called with an agent; returns a steering vector toward the
   * alarm, or null. Kept as a pull the caller applies rather than a position
   * change, so the flock's own cohesion still argues with it — a colony that
   * answers an alarm should still look like a colony moving, not iron filings.
   */
  pull(a) {
    if (!this._isColonist(a) || a.isKing) return null;
    if (!this.granted[a.colony]) return null;     // cannot hear what it never gained
    const here = this.sample(a.colony, a.x, a.y);
    // A wasp does not need a lungful to react. The threshold is the faintest
    // trace that still carries a direction — set too high, the far side of a
    // colony never hears at all and the trait becomes a local-only alarm.
    if (here < 0.008) return null;                   // nothing in the air here
    const g = this.gradient(a.colony, a.x, a.y);
    const m = Math.hypot(g.x, g.y);
    if (m < 1e-4) return null;
    // Strength saturates: a colonist already deep in the alarm does not run
    // faster than one who just caught the edge of it.
    const s = this.FOLLOW * Math.min(1, here / 0.6) / m;
    return { x: g.x * s, y: g.y * s };
  }

  /** Faint haze so the operator can SEE the news travelling. */
  draw(ctx) {
    if (!this.enabled) return;
    const s = this.cell;
    ctx.save();
    for (const col of ['A', 'B']) {
      const g = this.grid[col];
      const hue = col === 'A' ? 150 : 40;
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const v = g[r * this.cols + c];
          if (v < 0.06) continue;
          ctx.fillStyle = `hsla(${hue}, 90%, 60%, ${Math.min(0.22, v * 0.05)})`;
          ctx.fillRect(c * s, r * s, s, s);
        }
      }
    }
    ctx.restore();
  }

  stats() {
    const tot = (col) => { let t = 0; const g = this.grid[col]; for (let i = 0; i < g.length; i++) t += g[i]; return t; };
    return {
      enabled: this.enabled,
      A: +tot('A').toFixed(2),
      B: +tot('B').toFixed(2),
      releasedA: +this.releasedThisTick.A.toFixed(2),
      releasedB: +this.releasedThisTick.B.toFixed(2)
    };
  }
};
