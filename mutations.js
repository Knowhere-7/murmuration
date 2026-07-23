/**
 * MUTATIONS — the evolution meter, reborn as a living genome.
 *
 * The old evolution meter was a capped accumulator: it climbed to 5.0 and died as a signal.
 * Here, reaching the top is GRADUATION, not the end. Crossing it CRYSTALLIZES a new gene — and
 * the colony does not choose which one. It earns the gene that matches HOW IT LIVED: a colony
 * that thrived through war crystallizes something martial; through peace, symbiosis; through
 * famine, endurance. The meter becomes a genome that writes the colony's own biography, and no
 * two runs are alike because it depends on what the colony actually went through.
 *
 * The fill is fueled by ENGAGEMENT (the pressure the colony is actually under), so an idle colony
 * earns nothing — the same law the swarm just proved: never let it go idle.
 *
 * Surprise: a rare wildcard. Sometimes the crystal comes out CHIMERA — a gene seized from the
 * rival lineage (horizontal gene transfer, #43) — or, for a true generalist that has survived
 * every kind of pressure, APEX.
 *
 * Self-contained like relics/gauntlet/maze. Effects are all small, positive, additive — it can
 * only enrich the swarm, never break it. Data-driven: add a lineage to the catalog to experiment.
 */
window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.MutationSystem = class MutationSystem {
  constructor(world) {
    this.world = world;
    this.active = true;
    this.SAMPLE_EVERY = 16;      // ticks between engagement samples (cheap)
    this.FILL = 0.0045;          // engagement → progress; higher = genes crystallize faster
    this.WILDCARD_CHANCE = 0.09; // chance a crystal comes out rare instead of lineage-matched
    this.col = { A: this._newColony(), B: this._newColony() };
    this.CATALOG = this._catalog();
  }

  _newColony() {
    return {
      progress: 0,
      exp: { war: 0, peace: 0, scarcity: 0, exploration: 0, faith: 0, growth: 0 },
      genome: [],           // [{id,name,icon,lineage,flavor}]
      _lastAlive: null
    };
  }

  // Each lineage → the gene it crystallizes. Add an entry here to experiment with a new one.
  _catalog() {
    return {
      war:         { id: 'PACK_SINEW',   name: 'PACK SINEW',   icon: '⚔', flavor: 'forged in war — the pack strikes as one' },
      peace:       { id: 'SYMBIOSIS',    name: 'SYMBIOSIS',    icon: '🕊', flavor: 'grown in peace — cooperation feeds the whole' },
      scarcity:    { id: 'DEEP_RESERVE', name: 'DEEP RESERVE', icon: '🐢', flavor: 'tempered by famine — it endures what others cannot' },
      exploration: { id: 'FARSIGHT',     name: 'FARSIGHT',     icon: '👁', flavor: 'earned by wandering — it sees the far country' },
      faith:       { id: 'INNER_LIGHT',  name: 'INNER LIGHT',  icon: '✦', flavor: 'carried through grief — a light that spreads' },
      growth:      { id: 'VITALITY',     name: 'VITALITY',     icon: '🌱', flavor: 'born of plenty — each generation stronger' },
    };
  }

  tick() {
    if (!this.active) return;
    const now = this.world.time;
    if ((now % this.SAMPLE_EVERY) === 0) this._sample();
    this._applyEffects();
  }

  // ── fuel: read the pressure each colony is actually under ──────────────────
  _sample() {
    for (const c of ['A', 'B']) {
      const C = this.col[c];
      const mine = this.world.agents.filter(a => a.colony === c && !a.seppukuDone && !a.isSentinel);
      if (!mine.length) { C._lastAlive = 0; continue; }
      const n = mine.length;

      const avg = (f) => mine.reduce((s, a) => s + (f(a) || 0), 0) / n;
      const frac = (p) => mine.filter(p).length / n;

      const avgE = avg(a => a.energy != null ? a.energy : 1);
      const avgFaith = avg(a => a.faith);
      const inConflict = frac(a => a._conflictWith != null || (a._combatTicks || 0) > 0);
      const grieving = frac(a => (a.griefLevel || 0) > 0.4);
      const bearingRelic = frac(a => !!a._relic);

      // distance-from-home → wandering (exploration)
      const cx = avg(a => a.x), cy = avg(a => a.y);
      const spread = avg(a => Math.hypot(a.x - cx, a.y - cy)) / (Math.hypot(this.world.width, this.world.height) || 1);

      // births — a rise in the living count since last sample
      const births = C._lastAlive == null ? 0 : Math.max(0, n - C._lastAlive);
      C._lastAlive = n;

      const treaty = this.world.treatyState === 'active';
      const peaceDoc = this.world.doctrine && (this.world.doctrine[c] || '').includes('peace');
      const highTrust = frac(a => (a.trustCharge || 0) > 0.7);

      // pressure intensities (0..~1 each)
      const P = {
        war:         Math.min(1, inConflict * 1.4),
        peace:       Math.min(1, (treaty || peaceDoc ? 0.5 : 0) + highTrust * 0.5),
        scarcity:    Math.min(1, Math.max(0, (0.6 - avgE) / 0.6)),
        exploration: Math.min(1, bearingRelic * 2.0 + spread * 1.2),
        faith:       Math.min(1, avgFaith * grieving * 1.6),   // faith EARNED by carrying grief
        growth:      Math.min(1, births * 0.5),
      };
      // accumulate the lived experience, and fill the crystal from total engagement
      let engagement = 0;
      for (const k in P) { C.exp[k] += P[k]; engagement += P[k]; }
      C.progress += Math.min(1, engagement) * this.FILL * this.SAMPLE_EVERY;

      if (C.progress >= 1) this._crystallize(c);
    }
  }

  _crystallize(c) {
    const C = this.col[c];
    C.progress = 0;
    let gene = null;

    // wildcard first — the surprise
    if (Math.random() < this.WILDCARD_CHANCE) gene = this._wildcard(c);

    // otherwise: the gene that matches how this colony LIVED (dominant pressure since last gene)
    if (!gene) {
      const lineage = Object.keys(C.exp).sort((a, b) => C.exp[b] - C.exp[a])[0];
      gene = { ...this.CATALOG[lineage], lineage };
    }
    C.genome.push(gene);
    for (const k in C.exp) C.exp[k] *= 0.25;   // spend the window, keep a little memory

    if (window.logLine) window.logLine(`🧬 Colony ${c} crystallizes ${gene.icon} ${gene.name} — ${gene.flavor}`, 'evolve');
    if (window.addEvent) window.addEvent(`🧬 Colony ${c} earned a new gene: ${gene.name} — ${gene.flavor}.`, 'emerge');
  }

  _wildcard(c) {
    const other = c === 'A' ? 'B' : 'A';
    const rival = this.col[other].genome;
    // CHIMERA — seize a gene from the rival lineage
    if (rival.length && Math.random() < 0.6) {
      const g = rival[(Math.random() * rival.length) | 0];
      return { id: g.id, name: 'CHIMERA · ' + g.name, icon: '⚗', lineage: g.lineage,
               flavor: 'horizontal gene transfer — seized from the rival lineage' };
    }
    // APEX — only for a true generalist that has survived every kind of pressure
    const distinct = new Set(this.col[c].genome.map(g => g.lineage));
    if (distinct.size >= 4) {
      return { id: 'APEX', name: 'APEX', icon: '👑', lineage: 'apex',
               flavor: 'survived every pressure — a generalist crowned' };
    }
    return null; // fall through to lineage-matched
  }

  // ── all effects small, positive, additive; stacked genes compound gently ───
  _applyEffects() {
    for (const c of ['A', 'B']) {
      const genes = this.col[c].genome;
      if (!genes.length) continue;
      const ids = new Set(genes.map(g => g.id));
      const stack = genes.length;                          // more genes = slightly stronger
      const k = 1 + Math.min(2, stack * 0.15);             // gentle compounding, capped
      const mine = this.world.agents.filter(a => a.colony === c && !a.seppukuDone && !a.isSentinel);
      for (const a of mine) {
        if (ids.has('PACK_SINEW') && a._conflictWith != null) a.honor = (a.honor || 0) + 0.003 * k;
        if (ids.has('SYMBIOSIS')) { if (a.updateTrust) a.updateTrust(0.0005 * k); if (a.energy != null) a.energy = Math.min(1, a.energy + 0.0003 * k); }
        if (ids.has('DEEP_RESERVE')) { if (a.energy != null) a.energy = Math.min(1, a.energy + 0.0006 * k); a.griefLevel = Math.max(0, (a.griefLevel || 0) - 0.0004 * k); }
        if (ids.has('FARSIGHT')) { const s = Math.hypot(a.vx, a.vy) || 1; a.vx += (a.vx / s) * 0.006 * k; a.vy += (a.vy / s) * 0.006 * k; }
        if (ids.has('INNER_LIGHT')) { a.faith = Math.min(1, (a.faith || 0) + 0.0006 * k); a.griefLevel = Math.max(0, (a.griefLevel || 0) - 0.0004 * k); }
        if (ids.has('VITALITY')) { if (a.energy != null) a.energy = Math.min(1, a.energy + 0.0004 * k); if (a.evolution != null) a.evolution = Math.min(5, a.evolution + 0.0003 * k); }
        if (ids.has('APEX')) { if (a.updateTrust) a.updateTrust(0.0003 * k); if (a.energy != null) a.energy = Math.min(1, a.energy + 0.0004 * k); a.faith = Math.min(1, (a.faith || 0) + 0.0004 * k); }
      }
    }
  }

  draw(ctx) {
    if (!this.active) return;
    const W = this.world.width;
    const panel = (c, x, align) => {
      const C = this.col[c];
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.textAlign = align;
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillStyle = c === 'A' ? 'rgba(120,200,255,0.95)' : 'rgba(255,180,120,0.95)';
      // progress bar
      const bw = 74, bh = 4, bx = align === 'left' ? x : x - bw;
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(bx, 22, bw, bh);
      ctx.fillStyle = c === 'A' ? 'rgba(120,200,255,0.9)' : 'rgba(255,180,120,0.9)';
      ctx.fillRect(bx, 22, bw * Math.max(0, Math.min(1, C.progress)), bh);
      ctx.fillStyle = c === 'A' ? 'rgba(120,200,255,0.95)' : 'rgba(255,180,120,0.95)';
      ctx.fillText(`Colony ${c} · genome ${C.genome.length}`, x, 18);
      // earned genes as a row of icons
      const icons = C.genome.slice(-10).map(g => g.icon).join(' ');
      if (icons) ctx.fillText(icons, x, 38);
      ctx.restore();
    };
    panel('A', 8, 'left');
    panel('B', W - 8, 'right');
  }

  status() {
    const one = (c) => ({
      progress: +this.col[c].progress.toFixed(2),
      genome: this.col[c].genome.map(g => g.name),
      dominant: Object.keys(this.col[c].exp).sort((a, b) => this.col[c].exp[b] - this.col[c].exp[a])[0]
    });
    return { A: one('A'), B: one('B') };
  }
};
