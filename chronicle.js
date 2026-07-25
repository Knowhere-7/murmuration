/**
 * CHRONICLE — the swarm's flight recorder for EMERGENT EVENTS.
 *
 * The lesson of 2026-07-23: the most important thing the swarm ever did (two warring colonies
 * uniting against an invasion and then holding a peace that even ignored the War Games) almost
 * vanished because nobody was watching at the right second. This module fixes that permanently:
 * it samples the macro-state, runs emergence DETECTORS, and the instant one fires it writes a
 * durable record to localStorage — marked UNREVIEWED — so the event is saved the moment it
 * happens and kept until the sovereign has seen it. Nothing is lost to a blink again.
 *
 * Passive + self-contained (like relics/maze/mutations). Active by default.
 * Review API:  k26.chronicle.pending()  ·  .markReviewed(id|'all')  ·  .export()  ·  .all()
 */
window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.Chronicle = class Chronicle {
  constructor(world) {
    this.world = world;
    this.KEY = 'murmuration_chronicle_v1';
    this.SAMPLE_EVERY = 30;        // ticks between macro-samples (cheap)
    this.COOLDOWN = 3000;          // min ticks between two events of the same type
    this.HOLD_TICKS = 1500;        // sustained peace window that proves reconciliation "held"
    this.MAX_KEEP = 300;
    this.events = this._load();
    this._prev = null;
    this._recon = { stage: 'idle', since: 0, sawWarGames: false };  // reconciliation state machine
    this._cool = {};
    this._goldenSeen = false;
  }

  // ── macro-state sample ─────────────────────────────────────────────────────
  tick() {
    const t = this.world.time;
    if ((t % this.SAMPLE_EVERY) !== 0) return;
    const m = this._metrics();
    this._detect(m, t);
    this._prev = m;
  }

  _metrics() {
    const ag = this.world.agents.filter(a => !a.seppukuDone && !a.isSentinel);
    const byId = new Map(ag.map(a => [a.id, a]));
    let popA = 0, popB = 0, popU = 0, cross = 0, trust = 0, evo = 0;
    for (const a of ag) {
      if (a.colony === 'A') popA++; else if (a.colony === 'B') popB++; else if (a.colony === 'U') popU++;
      trust += a.trustCharge || 0; evo += a.evolution || 0;
      // cross-colony conflict: this agent is fighting someone of the OTHER colony
      if (a._conflictWith != null) {
        const foe = byId.get(a._conflictWith);
        if (foe && (foe.colony === 'A' || foe.colony === 'B') && foe.colony !== a.colony) cross++;
      }
    }
    const pop = ag.length || 1;
    const ctf = window.k26 && window.k26.ctf;
    return {
      pop, popA, popB, popU,
      interConflict: cross / pop,                          // fraction of the swarm in cross-colony conflict
      trustIndex: trust / pop,
      avgEvo: evo / pop,
      treaty: this.world.treatyState || 'none',
      warGamesActive: !!(ctf && ctf.mode && ctf.matchOver === false),
      goldenAge: !!(window.k26 && window.k26.economy && window.k26.economy.phase === 'GOLDEN'),
    };
  }

  // ── detectors ──────────────────────────────────────────────────────────────
  _detect(m, t) {
    const prev = this._prev;
    if (!prev) return;

    // ★ FLAGSHIP — PEACE FORGED IN FIRE: at war → invasion arrives → they unite → invasion
    // repelled → peace HOLDS (bonus: while the War Games were live and could have re-baited them).
    const R = this._recon;
    const atWar = m.interConflict > 0.06;
    switch (R.stage) {
      case 'idle':
        if (atWar) { R.stage = 'war'; R.since = t; R.sawWarGames = false; }
        break;
      case 'war':
        if (m.popU > 0 && m.interConflict < prev.interConflict) { R.stage = 'invasion'; R.since = t; }
        else if (!atWar && m.popU === 0) R.stage = 'idle';   // war just fizzled, no invasion
        break;
      case 'invasion':
        if (m.interConflict < 0.02) R.stage = 'united';       // stopped fighting each other
        else if (m.popU === 0) R.stage = 'idle';              // invasion gone but they kept fighting → not it
        break;
      case 'united':
        if (m.popU === 0) { R.stage = 'holding'; R.since = t; R.sawWarGames = false; }  // invasion repelled
        else if (m.interConflict > 0.06) R.stage = 'idle';    // fell back into their own war
        break;
      case 'holding':
        if (m.interConflict > 0.04) { R.stage = 'idle'; }     // peace broke → not lasting
        else {
          if (m.warGamesActive) R.sawWarGames = true;
          if (t - R.since >= this.HOLD_TICKS) {               // peace HELD → this is the event
            const wg = R.sawWarGames ? ' — and they ignored the War Games, refusing to be re-baited into combat' : '';
            this._fire('reconciliation', 'PEACE FORGED IN FIRE',
              `Two warring colonies united against the UNALIGNED invasion, won, and the peace HELD${wg}. ` +
              `Emergent, unscripted reconciliation.`, m, t);
            R.stage = 'idle';
          }
        }
        break;
    }

    // Invasion repelled (standalone) — unaligned were present, now gone.
    if (prev.popU > 0 && m.popU === 0)
      this._fire('invasion_repelled', 'INVASION REPELLED',
        `The UNALIGNED force (${prev.popU} at last count) was wiped out — the swarm held.`, m, t);

    // A colony driven extinct.
    if (prev.popA > 0 && m.popA === 0)
      this._fire('extinction_A', 'COLONY A EXTINCT', `Colony A has been wiped from the map.`, m, t);
    if (prev.popB > 0 && m.popB === 0)
      this._fire('extinction_B', 'COLONY B EXTINCT', `Colony B has been wiped from the map.`, m, t);

    // Near-extinction — the whole civilization on the brink.
    if (prev.pop >= 30 && m.pop < 12)
      this._fire('near_extinction', 'ON THE BRINK',
        `Population crashed to ${m.pop} — the civilization is near collapse.`, m, t);

    // Golden age reached (first time this session).
    if (m.goldenAge && !this._goldenSeen) {
      this._goldenSeen = true;
      this._fire('golden_age', 'GOLDEN AGE', `The swarm reached a GOLDEN AGE — abundance and high trust.`, m, t);
    }
  }

  // ── record + persist (instant, durable) ────────────────────────────────────
  _fire(type, title, desc, m, t) {
    if (this._cool[type] && t - this._cool[type] < this.COOLDOWN) return;
    this._cool[type] = t;
    const ev = {
      id: `${type}-${t}`, type, title, desc, tick: t, reviewed: false,
      snapshot: { pop: m.pop, A: m.popA, B: m.popB, U: m.popU,
                  interConflict: +m.interConflict.toFixed(3), trust: +m.trustIndex.toFixed(2),
                  evo: +m.avgEvo.toFixed(2), treaty: m.treaty, warGames: m.warGamesActive }
    };
    this.events.push(ev);
    if (this.events.length > this.MAX_KEEP) this.events = this.events.slice(-this.MAX_KEEP);
    this._save();   // written to localStorage the instant it happens
    if (window.logLine) window.logLine(`⚑ CHRONICLE — ${title} recorded (unreviewed). ${desc}`, 'emerge');
    if (window.addEvent) window.addEvent(`⚑ ${title} — the swarm recorded an emergent event for your review.`, 'emerge');
  }

  _save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.events)); } catch (e) {} }
  _load() { try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch (e) { return []; } }

  // ── review API ──────────────────────────────────────────────────────────────
  all() { return this.events; }
  pending() { return this.events.filter(e => !e.reviewed); }
  markReviewed(id) {
    if (id === 'all') this.events.forEach(e => e.reviewed = true);
    else { const e = this.events.find(x => x.id === id); if (e) e.reviewed = true; }
    this._save(); return this.pending().length;
  }
  export() {
    const blob = new Blob([JSON.stringify(this.events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `murmuration-chronicle-${this.world.time}.json`; a.click();
    URL.revokeObjectURL(url);
  }
  clear() { this.events = []; this._save(); }

  // ── on-canvas badge — you can't miss that something happened ─────────────────
  draw(ctx) {
    const n = this.pending().length;
    if (!n) return;
    const W = this.world.width;
    ctx.save();
    ctx.globalAlpha = 0.9; ctx.textAlign = 'center'; ctx.font = 'bold 10px ui-monospace, monospace';
    const pulse = 0.6 + 0.4 * Math.sin(this.world.time * 0.12);
    ctx.fillStyle = `rgba(255,210,90,${pulse})`;
    ctx.fillText(`⚑ ${n} UNREVIEWED EVENT${n > 1 ? 'S' : ''}`, W / 2, 12);
    ctx.restore();
  }

  status() { return { total: this.events.length, unreviewed: this.pending().length, reconStage: this._recon.stage }; }
};
