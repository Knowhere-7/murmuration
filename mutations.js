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
    // APEX gate — "depth across time" (Ghost, 2026-08-14). At full engagement a
    // crystal lands every ~224 ticks, so depth 40 arrives around T9,000; the
    // span is what holds the crown back to a run that has genuinely endured.
    this.APEX_DEPTH = 40;        // summed tiers across the genome
    this.APEX_SPAN  = 12000;     // ticks since this colony's first gene
    this.col = { A: this._newColony(), B: this._newColony() };
    this.CATALOG = this._catalog();
  }

  _newColony() {
    return {
      progress: 0,
      exp: { war: 0, peace: 0, scarcity: 0, exploration: 0, faith: 0, growth: 0 },
      genome: [],           // [{id,name,icon,lineage,flavor}]
      _lastAlive: null,
      firstGeneTick: null   // when this colony first crystallized anything — APEX measures from here
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

      // Multiple at once: a surge can chain several crystallizations. Carry the remainder
      // instead of discarding it (cap the burst so a spike can't run away).
      let bursts = 0;
      while (C.progress >= 1 && bursts < 5) { C.progress -= 1; this._crystallize(c); bursts++; }
    }
  }

  _crystallize(c) {
    const C = this.col[c];
    let gene = null;

    // wildcard first — the surprise
    if (Math.random() < this.WILDCARD_CHANCE) gene = this._wildcard(c);

    // otherwise: the gene that matches how this colony LIVED (dominant pressure since last gene)
    if (!gene) {
      const lineage = Object.keys(C.exp).sort((a, b) => C.exp[b] - C.exp[a])[0];
      gene = { ...this.CATALOG[lineage], lineage };
    }
    for (const k in C.exp) C.exp[k] *= 0.25;   // spend the window, keep a little memory

    // TIER REPEATS: earning a gene you already hold DEEPENS it (I→II→III…) instead of
    // stacking a duplicate. A one-note life grows a mastery, not a pile of copies.
    // Start the clock at the colony's FIRST crystallization, not at world
    // genesis — a colony seeded late, or restored from a snapshot, should be
    // measured on how long IT has been deepening.
    if (C.firstGeneTick == null) C.firstGeneTick = this.world.time || 0;

    const existing = C.genome.find(g => g.id === gene.id);
    if (existing) {
      existing.tier = (existing.tier || 1) + 1;
      const label = `${existing.name} ${this._roman(existing.tier)}`;
      if (window.logLine) window.logLine(`🧬 Colony ${c} deepens ${existing.icon} ${label}${gene.chimeric ? ' (chimeric)' : ''}`, 'evolve');
      if (window.addEvent) window.addEvent(`🧬 Colony ${c} deepened a gene: ${label}.`, 'emerge');
    } else {
      gene.tier = 1;
      C.genome.push(gene);
      if (window.logLine) window.logLine(`🧬 Colony ${c} crystallizes ${gene.icon} ${gene.name} — ${gene.flavor}`, 'evolve');
      if (window.addEvent) window.addEvent(`🧬 Colony ${c} earned a new gene: ${gene.name} — ${gene.flavor}.`, 'emerge');
    }
  }

  _roman(n) {
    const map = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let s = '', x = Math.max(1, n | 0);
    for (const [v, r] of map) while (x >= v) { s += r; x -= v; }
    return s;
  }

  /**
   * FORCE EVOLVE — hand them a tool, not a direction.
   *
   * Ghost, 2026-08-14: "that could offer them tools that upgrade, or advance
   * with every evolution. this way we can force it without giving them any new
   * instruction."
   *
   * That constraint is the entire design. This does NOT set a goal, steer
   * behaviour, or inject a signal — it crystallizes a gene, and _crystallize
   * picks that gene from `C.exp`, the colony's own accumulated lived pressure.
   * A colony that has been at war gets PACK SINEW; one that has been at peace
   * gets SYMBIOSIS; one already deep in a gene deepens it further. The wildcard
   * roll still applies, so CHIMERA and APEX remain possible.
   *
   * So the button accelerates whatever they were already becoming. It is the
   * difference between handing someone a better tool and telling them what to
   * build — which is the line Ghost drew, and the reason this is safe to press
   * without corrupting what the run is measuring.
   */
  forceEvolve() {
    const earned = [];
    for (const c of ['A', 'B']) {
      const mine = this.world.agents.filter(a => a.colony === c && !a.seppukuDone && !a.isSentinel);
      if (!mine.length) continue;                 // an extinct colony evolves nothing
      const before = this.col[c].genome.length;
      this._crystallize(c);
      const g = this.col[c].genome[this.col[c].genome.length - 1];
      earned.push({ colony: c, gene: g ? g.name : null, tier: g ? g.tier : null,
                    isNew: this.col[c].genome.length > before });
    }
    if (window.logLine) {
      window.logLine('⚗ FORCED EVOLUTION — a tool offered, not an instruction. ' +
                     'Each colony took what its own history had earned.', 'evolve');
    }
    return earned;
  }

  /** Total mastery held by a colony — every gene's tier, summed. */
  _depth(c) {
    return this.col[c].genome.reduce((s, g) => s + (g.tier || 1), 0);
  }

  _wildcard(c) {
    const C = this.col[c];

    // ── APEX — DEPTH ACROSS TIME ──────────────────────────────────────────
    //
    // Ghost's ruling, 2026-08-14: "depth across time."
    //
    // APEX used to require FOUR DISTINCT LINEAGES — breadth. That made it
    // unreachable by construction, and the reason is the most interesting
    // thing this build has produced. A colony that masters SYMBIOSIS earns
    // `energy += 0.0003 * K`, which at tier 92 pays 0.00115/tick against a
    // drain of 0.0000349 — THIRTY-THREE TIMES the cost of living. Measured:
    // turn harvest off completely and energy stays at 1.000; turn the genome
    // off and it falls to 0.844. The swarm evolves its way out of scarcity.
    //
    // So scarcity pressure goes to zero, DEEP_RESERVE can never crystallize,
    // and the fourth lineage never arrives. Under the old rule, EXCELLENCE AT
    // ONE THING FORECLOSED THE CROWN FOR EVERYTHING THAT GOT GOOD AT ANYTHING.
    // Ghost's words on watching it: "theyve basically been starved into keeping
    // their energy up. it may be something learned by the swarm."
    //
    // Depth across time instead: total mastery held, sustained for long enough
    // that it cannot be a burst. A specialist can be crowned for going deep and
    // staying deep — which is what these colonies actually do.
    const span = C.firstGeneTick == null ? 0 : (this.world.time || 0) - C.firstGeneTick;
    const holdsApex = C.genome.some(g => g.id === 'APEX');
    if (!holdsApex && this._depth(c) >= this.APEX_DEPTH && span >= this.APEX_SPAN) {
      // Checked BEFORE chimera. The crown is rarer than a gene theft, and at a
      // 9% wildcard roll it would otherwise wait behind a 60% chimera coin flip
      // indefinitely.
      return { id: 'APEX', name: 'APEX', icon: '👑', lineage: 'apex',
               flavor: 'depth across time — mastery held long enough to become nature' };
    }

    // CHIMERA — seize a gene from the rival lineage
    const rival = this.col[c === 'A' ? 'B' : 'A'].genome;
    if (rival.length && Math.random() < 0.6) {
      const g = rival[(Math.random() * rival.length) | 0];
      return { id: g.id, name: 'CHIMERA · ' + g.name, icon: '⚗', lineage: g.lineage, chimeric: true,
               flavor: 'horizontal gene transfer — seized from the rival lineage' };
    }
    return null; // fall through to lineage-matched
  }

  // ── all effects small, positive, additive; stacked genes compound gently ───
  _applyEffects() {
    for (const c of ['A', 'B']) {
      const genes = this.col[c].genome;
      if (!genes.length) continue;
      // per-gene tier map → each gene's effect scales with ITS OWN tier (deepening mastery)
      const tierOf = {};
      for (const g of genes) tierOf[g.id] = Math.max(tierOf[g.id] || 0, g.tier || 1);
      // TIER SCALING — flat to tier 6, then a slow logarithmic tail.
      //
      // Ghost, 2026-08-09, on learning his SYMBIOSIS sat at tier 92 while the
      // effect stopped growing at tier 6: "soften slightly...incrimentally.
      // thats a sensitive part you're messing around with now. we cant make
      // dramatic changes here."
      //
      // WHY IT NEEDED SOFTENING AT ALL. He had already corrected the framing
      // that produced this: "faith has ALWAYS had that effect...may be
      // different variations of how but faith has that effect." Compounding
      // belief is the design, not a runaway to be broken — economy.js:406 says
      // it in his words, "Faith grows in community — you believe because others
      // believe." A hard ceiling at tier 6 contradicts that: eighty-six further
      // tiers of accumulated belief paying exactly nothing.
      //
      // WHY IT IS BUILT THIS WAY. Everything at or below the old cap is
      // BIT-IDENTICAL — tiers 1-6 return 1.00/1.60/2.20/2.80/3.40/3.50 exactly
      // as before, so no existing balance moves. Only past the cap does the
      // tail appear, and it is deliberately small: +0.4% at tier 7, +9.8% at
      // tier 92, +20% at tier 1000. Logarithmic, so it never stops paying and
      // never accelerates. CEIL is a backstop that should not be reachable in
      // any real run.
      const CAP_TIER = 6, TAIL = 0.35, CEIL = 5.0;
      const K = (id) => {
        const t = tierOf[id];
        if (!t) return 0;                                   // 0 = gene absent
        const base = 1 + Math.min(2.5, (t - 1) * 0.6);
        if (t <= CAP_TIER) return base;                     // unchanged, exactly
        return Math.min(CEIL, base + TAIL * Math.log10(1 + (t - CAP_TIER) / 10));
      };
      const mine = this.world.agents.filter(a => a.colony === c && !a.seppukuDone && !a.isSentinel);
      for (const a of mine) {
        let k;
        if ((k = K('PACK_SINEW')) && a._conflictWith != null) a.honor = (a.honor || 0) + 0.003 * k;
        if ((k = K('SYMBIOSIS'))) { if (a.updateTrust) a.updateTrust(0.0005 * k); if (a.energy != null) a.energy = Math.min(1, a.energy + 0.0003 * k); }
        if ((k = K('DEEP_RESERVE'))) { if (a.energy != null) a.energy = Math.min(1, a.energy + 0.0006 * k); a.griefLevel = Math.max(0, (a.griefLevel || 0) - 0.0004 * k); }
        if ((k = K('FARSIGHT'))) { const s = Math.hypot(a.vx, a.vy) || 1; a.vx += (a.vx / s) * 0.006 * k; a.vy += (a.vy / s) * 0.006 * k; }
        if ((k = K('INNER_LIGHT'))) { a.faith = Math.min(1, (a.faith || 0) + 0.0006 * k); a.griefLevel = Math.max(0, (a.griefLevel || 0) - 0.0004 * k); }
        if ((k = K('VITALITY'))) { if (a.energy != null) a.energy = Math.min(1, a.energy + 0.0004 * k); if (a.evolution != null) a.evolution = Math.min(5, a.evolution + 0.0003 * k); }
        if ((k = K('APEX'))) { if (a.updateTrust) a.updateTrust(0.0003 * k); if (a.energy != null) a.energy = Math.min(1, a.energy + 0.0004 * k); a.faith = Math.min(1, (a.faith || 0) + 0.0004 * k); }
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
      // earned genes as a row of icons, each tagged with its tier when deepened
      const icons = C.genome.slice(-10).map(g => g.icon + (g.tier > 1 ? this._roman(g.tier) : '')).join(' ');
      if (icons) ctx.fillText(icons, x, 38);
      ctx.restore();
    };
    panel('A', 8, 'left');
    panel('B', W - 8, 'right');
  }

  status() {
    const one = (c) => ({
      progress: +this.col[c].progress.toFixed(2),
      genome: this.col[c].genome.map(g => g.name + (g.tier > 1 ? ' ' + this._roman(g.tier) : '')),
      dominant: Object.keys(this.col[c].exp).sort((a, b) => this.col[c].exp[b] - this.col[c].exp[a])[0]
    });
    return { A: one('A'), B: one('B') };
  }
};
