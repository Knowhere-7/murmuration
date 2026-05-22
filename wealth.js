/**
 * Wealth & Social Class Engine for Murmuration
 * ────────────────────────────────────────────────────────────────
 * Energy keeps you alive. Wealth gives you POWER.
 *
 * Surplus energy → wealth accumulation. Wealth determines class.
 * Class determines influence — the rich shape the narrative.
 * But stack the deck too hard and the bottom revolts.
 *
 * Classes are EMERGENT. Nobody is born elite. Nobody is assigned
 * destitute. The simulation creates inequality from nothing but
 * proximity, cooperation, and luck. Sound familiar?
 *
 * CLASS LADDER:
 *   ELITE      top ~10%    gold ring, beliefs propagate 2x
 *   MERCHANT   next ~25%   silver ring, surplus traders
 *   WORKER     next ~40%   default — the backbone
 *   DESTITUTE  bottom ~25% shrunk, desperate, revolutionary
 *
 * MECHANICS:
 *   Surplus:      energy above 0.6 converts to wealth (slowly)
 *   Maintenance:  wealth decays — being rich costs upkeep
 *   Employment:   elite near workers = both gain (unequally)
 *   Taxation:     slider — redistributes from top to bottom
 *   Revolution:   too many destitute + high grief = uprising
 *                 elites lose everything, wealth redistributes
 *
 * Ghost's insight: "that would be the icing on the damn cake"
 */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.WealthEngine = class WealthEngine {
  constructor(world, economy, opts = {}) {
    this.world = world;
    this.economy = economy;

    // ── Tuning knobs ──
    this.surplusThreshold = opts.surplusThreshold || 0.6;   // energy above this → wealth
    this.surplusRate      = opts.surplusRate      || 0.0004; // how fast surplus converts
    this.wealthDecay      = opts.wealthDecay      || 0.0001; // maintenance cost of wealth
    this.employRadius     = opts.employRadius     || 55;     // range for employment effect
    this.employerGain     = opts.employerGain     || 0.0003; // elite gains from nearby workers
    this.employeeGain     = opts.employeeGain     || 0.0001; // worker gains from nearby elite
    this.taxRate          = opts.taxRate          || 0.0;    // 0-1 redistribution slider
    this.revolutionThresh = opts.revolutionThresh || 0.6;    // % destitute to trigger revolt
    this.influenceMult    = opts.influenceMult    || 1.8;    // how much more elite beliefs spread

    // ── Class thresholds (wealth values) ──
    this.classBreaks = opts.classBreaks || {
      elite:    0.7,   // wealth >= 0.7 = ELITE
      merchant: 0.4,   // wealth >= 0.4 = MERCHANT
      worker:   0.15   // wealth >= 0.15 = WORKER, below = DESTITUTE
    };

    // ── Stats ──
    this.revolutionCount = 0;
    this.totalTaxed      = 0;
    this.classCounts     = { ELITE: 0, MERCHANT: 0, WORKER: 0, DESTITUTE: 0 };
    this.giniCoefficient = 0;  // 0 = perfect equality, 1 = one agent owns everything
  }

  // ── CLASS ASSIGNMENT ────────────────────────────────────────

  getClass(wealth) {
    if (wealth >= this.classBreaks.elite)    return 'ELITE';
    if (wealth >= this.classBreaks.merchant) return 'MERCHANT';
    if (wealth >= this.classBreaks.worker)   return 'WORKER';
    return 'DESTITUTE';
  }

  classColor(cls) {
    switch(cls) {
      case 'ELITE':     return '#ffd700';  // gold
      case 'MERCHANT':  return '#c0c0c0';  // silver
      case 'WORKER':    return null;        // no extra ring
      case 'DESTITUTE': return '#661100';  // dark desperate red
      default:          return null;
    }
  }

  // ── GINI COEFFICIENT — inequality measurement ──────────────

  computeGini(wealthValues) {
    if (wealthValues.length < 2) return 0;
    const sorted = [...wealthValues].sort((a, b) => a - b);
    const n = sorted.length;
    let sumDiffs = 0;
    let sumWealth = 0;
    for (let i = 0; i < n; i++) {
      sumWealth += sorted[i];
      sumDiffs += (2 * (i + 1) - n - 1) * sorted[i];
    }
    if (sumWealth === 0) return 0;
    return sumDiffs / (n * sumWealth);
  }

  // ── MAIN TICK ───────────────────────────────────────────────

  tick() {
    const counts = { ELITE: 0, MERCHANT: 0, WORKER: 0, DESTITUTE: 0 };
    const wealthValues = [];
    const liveAgents = [];

    for (const agent of this.world.agents) {
      if (agent.seppukuDone || agent.isSentinel) continue;
      if (agent.griefState === 'DISHONORED' || agent.griefState === 'STARVED') continue;

      // Initialize wealth if missing
      if (agent.wealth == null) agent.wealth = 0.1 + Math.random() * 0.15;
      if (agent.socialClass == null) agent.socialClass = 'WORKER';

      liveAgents.push(agent);

      // ── SURPLUS ACCUMULATION — energy above threshold converts to wealth ──
      if (agent.energy > this.surplusThreshold) {
        const surplus = (agent.energy - this.surplusThreshold) * this.surplusRate;
        agent.wealth = Math.min(1.0, agent.wealth + surplus);
      }

      // ── WEALTH DECAY — maintenance costs, nothing is free ──
      // Higher wealth = higher maintenance (progressive decay)
      const decay = this.wealthDecay * (1 + agent.wealth * 2);
      agent.wealth = Math.max(0, agent.wealth - decay);

      // ── DESPERATION — low energy eats into wealth (selling assets to survive) ──
      if (agent.energy < 0.25 && agent.wealth > 0.05) {
        const liquidate = Math.min(agent.wealth * 0.01, 0.3 - agent.energy);
        agent.wealth -= liquidate;
        agent.energy += liquidate * 0.5; // fire sale — you lose value converting
      }

      // ── ASSIGN CLASS ──
      agent.socialClass = this.getClass(agent.wealth);
      counts[agent.socialClass]++;
      wealthValues.push(agent.wealth);
    }

    // ── EMPLOYMENT — elite near workers: exploitation or symbiosis ──
    for (const agent of liveAgents) {
      if (agent.socialClass !== 'ELITE' && agent.socialClass !== 'MERCHANT') continue;

      const nearby = this.world.getNeighbors(agent, this.employRadius)
        .filter(n => !n.seppukuDone && !n.isSentinel
                  && n.griefState !== 'DISHONORED'
                  && n.griefState !== 'STARVED'
                  && (n.socialClass === 'WORKER' || n.socialClass === 'DESTITUTE'));

      for (const worker of nearby) {
        // Employer extracts value — wealth flows up
        agent.wealth = Math.min(1.0, agent.wealth + this.employerGain);
        // Worker gets a cut — trickle down (less than employer gains)
        worker.wealth = Math.min(1.0, worker.wealth + this.employeeGain);
        // Employment builds weak trust between employer and employee
        agent.updateTrust(+0.0001);
        worker.updateTrust(+0.0001);
      }
    }

    // ── TAXATION — redistribution from top to bottom ──
    if (this.taxRate > 0 && liveAgents.length > 0) {
      const elites = liveAgents.filter(a => a.socialClass === 'ELITE');
      const poor = liveAgents.filter(a => a.socialClass === 'DESTITUTE');

      if (elites.length > 0 && poor.length > 0) {
        let taxPool = 0;
        for (const elite of elites) {
          const tax = elite.wealth * this.taxRate * 0.002;
          elite.wealth -= tax;
          taxPool += tax;
        }
        // Distribute evenly to destitute
        const share = taxPool / poor.length;
        for (const p of poor) {
          p.wealth = Math.min(1.0, p.wealth + share);
        }
        this.totalTaxed += taxPool;
      }
    }

    // ── REVOLUTION — the bottom rises ──
    if (liveAgents.length > 5) {
      const destituteRatio = counts.DESTITUTE / liveAgents.length;
      const avgGrief = liveAgents.reduce((s, a) => s + a.griefLevel, 0) / liveAgents.length;

      // Revolution triggers when: too many destitute AND grief is high
      if (destituteRatio > this.revolutionThresh && avgGrief > 0.35) {
        this.triggerRevolution(liveAgents, counts);
      }
    }

    // ── INFLUENCE — elite beliefs propagate stronger ──
    // (This is handled in the draw phase and by modifying agent behavior)
    // We store the influence multiplier on the agent for the interaction engine to read
    for (const agent of liveAgents) {
      agent.influenceWeight = agent.socialClass === 'ELITE' ? this.influenceMult :
                              agent.socialClass === 'MERCHANT' ? 1.3 :
                              agent.socialClass === 'DESTITUTE' ? 0.5 : 1.0;
    }

    // ── STATS ──
    this.classCounts = counts;
    this.giniCoefficient = this.computeGini(wealthValues);
  }

  // ── REVOLUTION ──────────────────────────────────────────────

  triggerRevolution(liveAgents, counts) {
    this.revolutionCount++;

    // The elites lose most of their wealth
    const elites = liveAgents.filter(a => a.socialClass === 'ELITE');
    let seized = 0;
    for (const e of elites) {
      const loss = e.wealth * 0.7; // lose 70%
      e.wealth -= loss;
      seized += loss;
      e.updateGrief(+0.15);  // being overthrown hurts
      e.updateTrust(-0.1);   // trust in the system collapses
    }

    // Merchants lose some too
    const merchants = liveAgents.filter(a => a.socialClass === 'MERCHANT');
    for (const m of merchants) {
      const loss = m.wealth * 0.3;
      m.wealth -= loss;
      seized += loss;
    }

    // Redistribute to everyone (revolution isn't surgical)
    const share = seized / liveAgents.length;
    for (const a of liveAgents) {
      a.wealth = Math.min(1.0, a.wealth + share);
      a.updateGrief(+0.05);  // revolution is traumatic for everyone
    }

    // Destitute feel emboldened
    const poor = liveAgents.filter(a => a.socialClass === 'DESTITUTE' || a.socialClass === 'WORKER');
    for (const p of poor) {
      p.updateTrust(+0.03);
      p.updateGrief(-0.03); // catharsis
    }

    if (window.logLine) {
      window.logLine(
        `🔥 REVOLUTION #${this.revolutionCount} — ${elites.length} elites overthrown, ` +
        `${seized.toFixed(3)} wealth seized and redistributed to ${liveAgents.length} agents`,
        'emerge'
      );
    }
  }

  // ── DRAWING — class indicators on agents ────────────────────

  draw(ctx) {
    for (const agent of this.world.agents) {
      if (agent.seppukuDone || agent.isSentinel) continue;
      if (agent.griefState === 'DISHONORED' || agent.griefState === 'STARVED') continue;
      if (agent.socialClass == null) continue;

      // ELITE — gold crown ring
      if (agent.socialClass === 'ELITE') {
        const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 600);
        ctx.strokeStyle = `rgba(255, 215, 0, ${pulse * 0.7})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(agent.x, agent.y, agent.radius + 9, 0, Math.PI * 2);
        ctx.stroke();

        // Tiny wealth indicator — diamond shape above agent
        ctx.fillStyle = `rgba(255, 215, 0, ${0.4 + agent.wealth * 0.4})`;
        ctx.beginPath();
        ctx.moveTo(agent.x, agent.y - agent.radius - 8);
        ctx.lineTo(agent.x + 3, agent.y - agent.radius - 5);
        ctx.lineTo(agent.x, agent.y - agent.radius - 2);
        ctx.lineTo(agent.x - 3, agent.y - agent.radius - 5);
        ctx.closePath();
        ctx.fill();
      }

      // MERCHANT — silver ring, thinner
      if (agent.socialClass === 'MERCHANT') {
        ctx.strokeStyle = `rgba(192, 192, 192, 0.4)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(agent.x, agent.y, agent.radius + 7, 0, Math.PI * 2);
        ctx.stroke();
      }

      // DESTITUTE — shrinking effect, dark aura
      if (agent.socialClass === 'DESTITUTE') {
        ctx.fillStyle = `rgba(100, 20, 0, ${0.15 + (1 - agent.wealth / this.classBreaks.worker) * 0.15})`;
        ctx.beginPath();
        ctx.arc(agent.x, agent.y, agent.radius + 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ── SERIALIZATION ───────────────────────────────────────────

  serialize() {
    return {
      taxRate: this.taxRate,
      revolutionCount: this.revolutionCount,
      totalTaxed: this.totalTaxed,
      giniCoefficient: this.giniCoefficient,
      classCounts: { ...this.classCounts }
    };
  }

  static restore(world, economy, data, opts = {}) {
    const engine = new WealthEngine(world, economy, opts);
    engine.taxRate = data.taxRate || 0;
    engine.revolutionCount = data.revolutionCount || 0;
    engine.totalTaxed = data.totalTaxed || 0;
    engine.giniCoefficient = data.giniCoefficient || 0;
    if (data.classCounts) engine.classCounts = { ...data.classCounts };
    return engine;
  }
};
