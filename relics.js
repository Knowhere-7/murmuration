/**
 * RELICS — heritable special abilities seated at the far points of the map.
 * Phase 1 (foundation): finite relics at the four far corners; a pull draws nearby
 * pilgrims in; the first to reach a charged node CLAIMS it and bears its ability for
 * a charge window; the node goes DORMANT while held and RELOADS when the charge
 * expires or the bearer falls. Contest (many drawn to few) keeps them cycling — no
 * house can hold them all.
 *
 * Phase 2 (later): honorable death passes the relic-gene to nearest kin; every 3rd
 * birth in that family is born able to wield it, but the CHARGE must still be fetched.
 *
 * Each relic sustains one of the swarm's real vitals (energy / trust / faith / speed),
 * so its effect is inspectable on the bearer's ID card — not decoration.
 */
window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.RelicSystem = class RelicSystem {
  constructor(world) {
    this.world = world;
    // Charge window in TICKS. ~3 min at 1x (60fps); fast-forward compresses it, same as
    // every other timed system here. 60 * 180 = 10800.
    this.CHARGE_TICKS = 10800;
    this.CLAIM_RADIUS = 24;    // must actually reach the node to claim it
    this.PULL_RADIUS  = 130;   // pilgrims within this feel the draw
    this.PULL_FORCE   = 0.045; // gentle — creates traffic, doesn't teleport
    this.relics = this._define();
  }

  _define() {
    const F = 0.10; // inset from each corner — deep, far, contested ground
    return [
      { id: 'TARDIGRADE', short: 'CRYPTOBIOSIS',     color: '#8be0ff', stat: 'energy', fx: F,     fy: F,
        desc: 'sustains energy — the drain cannot touch its bearer' },
      { id: 'SHARK',      short: 'ELECTRORECEPTION', color: '#7bd88f', stat: 'trust',  fx: 1 - F, fy: F,
        desc: 'sustains trust — its bearer reads every heartbeat' },
      { id: 'PIT VIPER',  short: 'INFRARED',         color: '#ff8a5c', stat: 'faith',  fx: F,     fy: 1 - F,
        desc: 'sustains faith — warmth seen in the dark' },
      { id: 'MANTIS',     short: '16-BAND VISION',   color: '#c9a6ff', stat: 'speed',  fx: 1 - F, fy: 1 - F,
        desc: 'quickens its bearer — a spectrum you cannot see' },
    ].map(r => ({ ...r, carrier: null, expires: 0 }));
  }

  _pos(r) { return { x: r.fx * this.world.width, y: r.fy * this.world.height }; }

  tick() {
    const now = this.world.time;
    const agents = this.world.agents.filter(a => !a.seppukuDone && !a.isSentinel);
    const carrying = new Set(agents.filter(a => a._relic).map(a => a._relic));

    for (const r of this.relics) {
      // Bearer gone (died / seppuku / culled) or charge expired -> reload at the node.
      if (r.carrier && (!agents.includes(r.carrier) || now >= r.expires)) {
        this._release(r);
      }

      if (r.carrier) {
        this._applyEffect(r, r.carrier);
        r.carrier._relic = r; // keep the tag fresh for the renderer
        continue;
      }

      // DORMANT & available: draw pilgrims in; the nearest to reach it claims it.
      const p = this._pos(r);
      let claimant = null, best = Infinity;
      for (const a of agents) {
        if (a._relic) continue;                 // one relic per bearer
        const dx = p.x - a.x, dy = p.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < this.PULL_RADIUS) {
          const f = this.PULL_FORCE * (1 - d / this.PULL_RADIUS);
          a.vx += (dx / d) * f;
          a.vy += (dy / d) * f;
        }
        if (d < this.CLAIM_RADIUS && d < best) { best = d; claimant = a; }
      }
      if (claimant) this._claim(r, claimant, now);
    }
  }

  _claim(r, a, now) {
    r.carrier = a;
    r.expires = now + this.CHARGE_TICKS;
    a._relic = r;
    if (window.logLine) {
      window.logLine(`✦ RELIC CLAIMED — Agent #${a.id} (Colony ${a.colony}) bears ${r.id} · ${r.short}`, 'emerge');
    }
  }

  _release(r) {
    if (r.carrier && r.carrier._relic === r) r.carrier._relic = null;
    r.carrier = null;
    r.expires = 0;
    if (window.logLine) {
      window.logLine(`◇ RELIC RELOADED — ${r.id} returns to its far point, waiting for the next pilgrim.`, 'evolve');
    }
  }

  // Real, single-module, ID-card-visible effects. Distinct combat powers = Phase 3.
  _applyEffect(r, a) {
    switch (r.stat) {
      case 'energy': if (a.energy != null) a.energy = Math.min(1, a.energy + 0.0006); break;
      case 'trust':  if (a.updateTrust)    a.updateTrust(+0.0004);                    break;
      case 'faith':  a.faith = Math.min(1, (a.faith || 0) + 0.0004);                  break;
      case 'speed':  { const s = Math.hypot(a.vx, a.vy) || 1; a.vx += (a.vx / s) * 0.03; a.vy += (a.vy / s) * 0.03; } break;
    }
  }

  draw(ctx) {
    const now = this.world.time;
    for (const r of this.relics) {
      const p = this._pos(r);
      ctx.save();
      if (!r.carrier) {
        // CHARGED beacon — a pulsing light waiting at the far point.
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.06);
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 34);
        g.addColorStop(0, r.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.30 + 0.35 * pulse;
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, 34, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = r.color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, 9 + 3 * pulse, 0, Math.PI * 2); ctx.stroke();
      } else {
        // DORMANT socket — a dark dashed ring where the relic used to sit.
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = 'rgba(130,130,150,0.35)';
        ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        // Bearer aura — the ability made visible on the carrier.
        const c = r.carrier;
        if (typeof c.x === 'number') {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = r.color; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(c.x, c.y, (c.radius || 4) + 4, 0, Math.PI * 2); ctx.stroke();
        }
      }
      // Far-point label.
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = r.color;
      ctx.font = '7px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(r.id, p.x, p.y - 40);
      ctx.restore();
    }
  }

  // Small status read for tests / UI.
  status() {
    return this.relics.map(r => ({
      id: r.id, held: !!r.carrier,
      carrier: r.carrier ? r.carrier.id : null,
      ticksLeft: r.carrier ? Math.max(0, r.expires - this.world.time) : 0
    }));
  }
};
