/* ══════════════════════════════════════════════════════════════════════════
   HEAT — where the map is hot, shown in place.

   Ghost, 2026-08-25: "should contested zones or heavily heated exchanges /
   behavior / special actions or tactics be color coded into the map so the eye
   is pulled to that region and we remove the close-up view."

   Yes, and it replaces the cut rather than joining it. The screen cut answered
   "where should I look" by DISCARDING the rest of the board — at exactly the
   moment an operator most needs to know whether the other crown is also under
   pressure. It also fought the diagonal: the crowns were moved apart to make the
   map feel large, and the cut spent that immediately by throwing most of it away.

   Heat answers the same question without taking anything: the whole field stays
   visible and the eye is pulled by brightness instead of by force. Two fights at
   once are two hot regions, which the cut could never show.

   IT IS A SIGNAL, NOT GROUND, and that keeps the earlier rule intact. Terrain
   stays silent white so it never competes; heat is an area wash that exists only
   where something is happening and fades when it stops.

   IT ALSO OWNS ITS OWN VISUAL CHANNEL. Every other element here is a line or a
   point — bond strings, keep rings, crowns, agents. Heat is diffuse AREA. That
   is why it can be warm and bright without being mistaken for LOBO's blood
   orange or a colony's amber: nothing else on the field is a soft field of
   colour, so the eye separates it by form before it ever reads the hue.
   ══════════════════════════════════════════════════════════════════════════ */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.HeatMap = class HeatMap {
  constructor(world, opts = {}) {
    this.world = world;
    this.enabled = opts.enabled !== false;
    this.cell = 0;                      // derived, like the alarm field
    this.DECAY = opts.decay ?? 0.965;   // heat fades fast — it means NOW
    this.MAX = 6;
    this._alloc();

    /* Each kind names WHY a region is hot, and hue carries the reason:
         CONTEST  amber-orange — bodies in contact, the ordinary fight
         BREACH   red — the crown itself is being reached
         ALARM    green — the colony's own signal is up here
         TACTIC   white-hot — something LEARNED just happened: an adaptation
                  taken, a break-off chosen, a silent approach committed.
       Kept few on purpose. A legend nobody can hold in their head is decoration,
       and the point of this is to be readable at a glance. */
    this.KIND = {
      CONTEST: { h: 32,  name: 'contested' },
      BREACH:  { h: 0,   name: 'crown reached', hollow: true },
      TACTIC:  { h: 55,  name: 'tactic' }
    };
  }

  _alloc() {
    const W = this.world.width || 1280, H = this.world.height || 720;
    this.cell = Math.max(10, Math.min(W, H) / 26);
    this.cols = Math.max(4, Math.ceil(W / this.cell));
    this.rows = Math.max(4, Math.ceil(H / this.cell));
    const n = this.cols * this.rows;
    // one plane per kind, so two reasons in one place blend rather than
    // overwrite — a contested crown under alarm should look like both.
    this.g = {};
    for (const k of ['CONTEST','BREACH','TACTIC']) this.g[k] = new Float32Array(n);
    this._w = W; this._h = H;
  }

  _idx(x, y) {
    const c = Math.min(this.cols - 1, Math.max(0, (x / this.cell) | 0));
    const r = Math.min(this.rows - 1, Math.max(0, (y / this.cell) | 0));
    return r * this.cols + c;
  }

  /** Mark a point hot. Everything that wants the eye comes through here. */
  add(kind, x, y, amount = 1) {
    if (!this.enabled || !this.g[kind]) return;
    const g = this.g[kind], i = this._idx(x, y);
    g[i] = Math.min(this.MAX, g[i] + amount);
  }

  /** Read the field itself each tick — contact, alarm and breaches are visible
      without anyone having to remember to report them. */
  step() {
    if (!this.enabled) return;
    if ((this.world.width || 1280) !== this._w) this._alloc();
    const A = window.MurmurationModules.Attrition;
    const agents = this.world.agents;

    // CONTEST — an attacker and a defender close enough to be fighting.
    const U = agents.filter(a => a.colony === 'U' && !a.seppukuDone);
    if (U.length) {
      for (const d of agents) {
        if (d.colony === 'U' || d.seppukuDone) continue;
        for (const u of U) {
          if (Math.hypot(u.x - d.x, u.y - d.y) < 46) {
            this.add('CONTEST', (u.x + d.x) / 2, (u.y + d.y) / 2, 0.22);
            break;
          }
        }
      }
    }
    // BREACH — the crown itself is being reached. The hottest ordinary event.
    if (A && A.kings) {
      for (const c of ['A','B']) {
        const home = A.kings.home(c);
        const near = U.filter(u => Math.hypot(u.x-home.x, u.y-home.y) < A.kings.captureR);
        if (near.length) this.add('BREACH', home.x, home.y, 0.35 * Math.min(4, near.length));
      }
    }
    /* ALARM IS NOT DRAWN HERE ANY MORE. Ghost, 2026-08-26: "the glow is
       entirely too powerful i can barely see the king or its location when that
       glow starts to appear."

       Measured mid-campaign: CONTEST 1.39, BREACH 0, ALARM 296.34 — the alarm
       plane was carrying two hundred times the weight of everything else and
       washing the board out. The cause was duplication, not tuning: alarm.js
       ALREADY draws the pheromone field as its own haze, and this added a second
       green copy of the same field on top of it every tick. Every cell above a
       low floor contributed, every tick, across the whole diffused field.

       One signal, one channel. The alarm owns its haze; heat stays for things
       that have no other way to be seen. */

    for (const k in this.g) {
      const g = this.g[k];
      for (let i = 0; i < g.length; i++) g[i] *= this.DECAY;
    }
  }

  /** Drawn UNDER the agents and bonds: it tells you where to look, it must
      never obscure what you then look at. */
  draw(ctx) {
    if (!this.enabled) return;
    const s = this.cell;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const k in this.g) {
      const g = this.g[k], hue = this.KIND[k].h;
      const white = k === 'TACTIC';
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const v = g[r * this.cols + c];
          if (v < 0.05) continue;
          const t = Math.min(1, v / 3);
          const cx = (c + 0.5) * s, cy = (r + 0.5) * s;
          const rad = s * (0.8 + t * 1.5);
          const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
          const sat = white ? 40 : 95, lum = 52 + t * 38;
          /* HOLLOW CENTRE. Ghost, 2026-08-26: "the glow is entirely too powerful
             i can barely see the king or its location when that glow starts to
             appear." BREACH sits on the crown by definition, so a filled disc
             saturates exactly the thing it exists to point at — the heat map
             defeating its own rule that it must never obscure what you then look
             at. Drawn as a RING it still pulls the eye, and leaves the crown
             legible inside it. */
          if (this.KIND[k].hollow) {
            grd.addColorStop(0.00, `hsla(${hue}, ${sat}%, ${lum}%, 0)`);
            grd.addColorStop(0.42, `hsla(${hue}, ${sat}%, ${lum}%, 0)`);
            grd.addColorStop(0.66, `hsla(${hue}, ${sat}%, ${lum}%, ${0.04 + t*0.22})`);
            grd.addColorStop(1.00, `hsla(${hue}, ${sat}%, ${lum}%, 0)`);
          } else {
            // hot centres wash toward white, the way heat actually looks
            grd.addColorStop(0, `hsla(${hue}, ${sat}%, ${lum}%, ${0.04 + t*0.22})`);
            grd.addColorStop(1, `hsla(${hue}, ${sat}%, 50%, 0)`);
          }
          ctx.fillStyle = grd;
          ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI*2); ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  stats() {
    const tot = k => { let t = 0; const g = this.g[k]; for (let i=0;i<g.length;i++) t += g[i]; return +t.toFixed(2); };
    return { CONTEST: tot('CONTEST'), BREACH: tot('BREACH'), TACTIC: tot('TACTIC') };
  }
};
