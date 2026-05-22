/**
 * Economy Engine for Murmuration
 * ────────────────────────────────────────────────────────────────
 * Ghost's vision: "We want this to nearly mirror society."
 *
 * Energy:    Behavioral driver, never a death clock. Floor at 0.05.
 *            Low energy = hunger = move toward food + cooperate.
 *            High energy = surplus = share with neighbors, reproduce.
 *
 * Movement:  Purposeful. Hungry → food. Lonely → allies. Surplus → share.
 *            Every agent has a reason to move at all times.
 *
 * Reproduction: Well-fed, trusted agents create offspring.
 *               Parents sacrifice energy. Baby inherits blended traits.
 *               THIS is the generational drive — working for the next gen.
 *               Population grows slow and steady, like a real society.
 *
 * Golden Age: The natural default. Cooperation IS the path of least
 *             resistance. The math makes selfishness expensive and
 *             teamwork cheap. A healthy swarm trends toward golden.
 *
 * Cycle:     GOLDEN (permanent default) → DISASTER (you trigger it)
 *            → SCARCITY → REBUILD → GOLDEN (heals back)
 *
 * Ghost's law: "They need reasons to interact on a regular basis.
 *              They need to travel. They need to work towards a common
 *              goal. They all need to be focused on the greater good
 *              for society."
 */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.Economy = class Economy {
  constructor(world, opts = {}) {
    this.world = world;

    // ── Tuning knobs (all per-frame at 60fps) ──
    this.baseDrain      = opts.baseDrain      || 0.00005; // energy cost of existing
    this.soloHarvest    = opts.soloHarvest    || 0.0004;  // energy from solo harvesting
    this.coopBonus      = opts.coopBonus      || 0.65;    // multiplier per trusted ally
    this.harvestRadius  = opts.harvestRadius  || 80;      // reach around a zone
    this.coopRadius     = opts.coopRadius     || 60;      // ally detection range
    this.trustThreshold = opts.trustThreshold || 0.15;    // min trust to count as ally
    this.scarcityLevel  = opts.scarcityLevel  || 0.5;     // slider: 0=easy, 1=harsh

    // ── Reproduction ──
    this.birthCooldown  = opts.birthCooldown  || 600;     // min ticks between births (~10sec)
    this.birthEnergy    = opts.birthEnergy    || 0.75;    // parent must have this much energy
    this.birthTrust     = opts.birthTrust     || 0.4;     // parent must be this trusted
    this.birthCost      = opts.birthCost      || 0.3;     // energy parent sacrifices
    this.maxPopulation  = opts.maxPopulation  || 200;     // carrying capacity
    this._lastBirthTick = 0;
    this.totalBirths    = 0;
    this.nextAgentId    = 1000; // IDs for newborns start high to avoid collisions

    // ── Resource zones ──
    this.zones = [];
    this.initZones(opts.zoneCount || 8);

    // ── Cycle state ──
    this.phase       = 'GOLDEN';
    this.phaseTimer  = 0;
    this.phaseTicks  = opts.phaseTicks || {
      GOLDEN:   Infinity,   // permanent until you break it
      DISASTER: 300,        // ~5 seconds of hell
      SCARCITY: 900,        // ~15 seconds of pressure
      REBUILD:  600         // ~10 seconds of recovery
    };
    this.cycleCount  = 0;
    this.autoCycle   = false; // YOU control the cycle

    // ── Stats ──
    this.totalHarvested = 0;
  }

  // ── RESOURCE ZONES ──────────────────────────────────────────

  initZones(count) {
    this.zones = [];
    const w = this.world.width;
    const h = this.world.height;
    for (let i = 0; i < count; i++) {
      const margin = 60;
      this.zones.push({
        x: margin + Math.random() * (w - margin * 2),
        y: margin + Math.random() * (h - margin * 2),
        radius: 80 + Math.random() * 60,
        richness: 0.6 + Math.random() * 0.4,
        depleted: 0
      });
    }
  }

  // ── PHASE CYCLE ─────────────────────────────────────────────

  static PHASE_ORDER = ['GOLDEN', 'DISASTER', 'SCARCITY', 'REBUILD'];

  get phaseMultipliers() {
    switch (this.phase) {
      case 'GOLDEN':   return { drain: 0.5,  harvest: 1.5,  zoneShrink: 1.0  };
      case 'DISASTER': return { drain: 3.0,  harvest: 0.15, zoneShrink: 0.3  };
      case 'SCARCITY': return { drain: 1.8,  harvest: 0.4,  zoneShrink: 0.5  };
      case 'REBUILD':  return { drain: 0.8,  harvest: 1.2,  zoneShrink: 0.8  };
      default:         return { drain: 1.0,  harvest: 1.0,  zoneShrink: 1.0  };
    }
  }

  advancePhase() {
    const order = Economy.PHASE_ORDER;
    const idx = order.indexOf(this.phase);
    const nextIdx = (idx + 1) % order.length;
    this.phase = order[nextIdx];
    this.phaseTimer = 0;

    if (this.phase === 'GOLDEN') this.cycleCount++;

    if (this.phase === 'DISASTER') {
      const w = this.world.width;
      const h = this.world.height;
      for (const zone of this.zones) {
        if (Math.random() < 0.4) {
          zone.x = 80 + Math.random() * (w - 160);
          zone.y = 80 + Math.random() * (h - 160);
        }
        zone.depleted = 0.5 + Math.random() * 0.5;
      }
    }

    if (this.phase === 'REBUILD') {
      for (const zone of this.zones) {
        zone.depleted = Math.max(0, zone.depleted - 0.3);
      }
    }

    if (this.phase === 'GOLDEN') {
      for (const zone of this.zones) {
        zone.depleted = 0;
      }
    }

    if (window.logLine) {
      const labels = {
        GOLDEN:   '☀ GOLDEN AGE — abundance returns.',
        DISASTER: '⚡ DISASTER — resources collapse. Survival mode.',
        SCARCITY: '🔥 SCARCITY — the worst is over but hunger remains.',
        REBUILD:  '🔨 REBUILD — cooperation pays. Those who held together thrive.'
      };
      window.logLine(labels[this.phase], 'emerge');
    }
  }

  triggerDisaster() {
    if (this.phase === 'GOLDEN') {
      this.advancePhase(); // GOLDEN → DISASTER
    }
  }

  // ── MAIN TICK ───────────────────────────────────────────────

  tick() {
    const mult = this.phaseMultipliers;
    const scarcityMod = 1 + this.scarcityLevel * 0.4;

    // Phase timer — only non-GOLDEN phases count down back toward golden
    if (this.phase !== 'GOLDEN') {
      this.phaseTimer++;
      if (this.phaseTimer >= (this.phaseTicks[this.phase] || 900)) {
        this.advancePhase();
      }
    }

    // Zone regeneration
    for (const zone of this.zones) {
      zone.depleted = Math.max(0, zone.depleted - 0.0005 * mult.zoneShrink);
    }

    // ── AGENT ECONOMY LOOP ──
    const alive = [];
    for (const agent of this.world.agents) {
      if (agent.seppukuDone || agent.isSentinel) continue;
      if (agent.griefState === 'DISHONORED') continue;
      alive.push(agent);
    }

    for (const agent of alive) {
      // Initialize energy + generation if missing
      if (agent.energy == null) agent.energy = 0.8 + Math.random() * 0.2;
      if (agent.generation == null) agent.generation = 0;

      // ── DRAIN ──
      const drain = this.baseDrain * mult.drain * scarcityMod;
      agent.energy -= drain;

      // ── HARVEST ──
      let harvested = 0;
      let atZone = false;
      for (const zone of this.zones) {
        const dist = Math.hypot(agent.x - zone.x, agent.y - zone.y);
        if (dist < zone.radius + this.harvestRadius) {
          atZone = true;
          const proximity = 1 - (dist / (zone.radius + this.harvestRadius));
          const effective = zone.richness * (1 - zone.depleted) * proximity;
          let gain = this.soloHarvest * effective * mult.harvest;

          // Cooperation bonus
          const allies = this.world.getNeighbors(agent, this.coopRadius)
            .filter(n => !n.seppukuDone && !n.isSentinel
                      && n.griefState !== 'DISHONORED'
                      && n.trustCharge >= this.trustThreshold);

          const allyCount = Math.min(allies.length, 6);
          if (allyCount > 0) {
            gain *= 1 + this.coopBonus * Math.sqrt(allyCount);
            agent.updateTrust(+0.0003 * allyCount);
            agent.updateGrief(-0.0004 * allyCount);
          }

          harvested += gain;
          zone.depleted = Math.min(0.9, zone.depleted + 0.00002);
        }
      }

      agent.energy = Math.min(1.0, agent.energy + harvested);
      this.totalHarvested += harvested;

      // ── ENERGY FLOOR — hunger is pressure, not death ──
      agent.energy = Math.max(0.05, agent.energy);

      // ── PURPOSEFUL MOVEMENT ──
      // Every agent has a reason to move. This is society.
      this.applyMovementDrive(agent, atZone, alive);

      // ── SURPLUS SHARING ──
      // Well-fed agents near hungry trusted neighbors share.
      // "They should want to feed the next generation."
      if (agent.energy > 0.6) {
        const nearbyHungry = this.world.getNeighbors(agent, this.coopRadius)
          .filter(n => !n.seppukuDone && !n.isSentinel
                    && n.energy != null && n.energy < 0.35
                    && n.trustCharge >= this.trustThreshold * 0.5);

        for (const hungry of nearbyHungry) {
          const share = 0.0003;
          if (agent.energy - share > 0.45) {
            agent.energy -= share;
            hungry.energy = Math.min(1.0, hungry.energy + share);
            agent.updateTrust(+0.0001);
            hungry.updateTrust(+0.0002);
          }
        }
      }
    }

    // ── FAITH & AFTERLIFE — the dead shape the living ──
    this.tickFaith(alive);

    // ── REPRODUCTION — the generational drive ──
    this.tickReproduction(alive);

    // ── GHOST CLEANUP — seppuku agents fade after ~30 seconds ──
    const tick = this.world.time;
    const ghostTTL = 1800; // 30 seconds at 60fps
    this.world.agents = this.world.agents.filter(a => {
      if (!a.seppukuDone) return true;
      // Track when they completed seppuku
      if (a._seppukuTick == null) a._seppukuTick = tick;
      return (tick - a._seppukuTick) < ghostTTL;
    });
  }

  // ── FAITH & AFTERLIFE ────────────────────────────────────────
  //
  // "The only way to truly balance everything is to give them religion,
  //  god, possibly an afterlife." — Ghost
  //
  // Faith grows through:   community, sacred ground, inherited evolution
  // Faith does:            dampens grief, increases cooperation, drives purpose
  // Sacred ground:         where the honored died — pilgrimage sites
  // Afterlife:             collective memory feeds back to living agents
  // God:                   emergent field when collective faith > threshold
  // Evolution:             accumulated ancestral knowledge — the point of living

  tickFaith(alive) {
    if (!this.world.sacredGrounds) this.world.sacredGrounds = [];
    const sacredGrounds = this.world.sacredGrounds;
    const collectiveMemory = this.world.collectiveMemory || [];
    const tick = this.world.time;

    // ── Afterlife influence — the dead speak through accumulated wisdom ──
    // Sum the evolution and wisdom of all honored dead
    const afterlifeWisdom = collectiveMemory
      .filter(m => m.type === 'SEPPUKU')
      .reduce((s, m) => s + (m.wisdomScore || 0) + (m.evolution || 0) * 0.5, 0);
    // Normalize: soft cap so it doesn't grow unbounded
    const afterlifeStrength = Math.min(1.0, afterlifeWisdom * 0.05);

    // ── Sacred ground decay ──
    for (let i = sacredGrounds.length - 1; i >= 0; i--) {
      const sg = sacredGrounds[i];
      // Sacred ground fades very slowly — memory is long
      sg.strength = Math.max(0, sg.strength - 0.00003);
      if (sg.strength <= 0) sacredGrounds.splice(i, 1);
    }

    // ── Collective faith measurement (for emergent god) ──
    let totalFaith = 0;

    for (const agent of alive) {
      if (agent.faith == null) agent.faith = 0.1 + Math.random() * 0.15;
      if (agent.evolution == null) agent.evolution = 0;

      // ── FAITH SOURCE 1: Community — more trusted neighbors = stronger faith ──
      const neighbors = this.world.getNeighbors(agent, 80);
      const trustedNearby = neighbors.filter(n =>
        !n.seppukuDone && n.griefState !== 'DISHONORED'
        && n.trustCharge >= this.trustThreshold);
      if (trustedNearby.length >= 2) {
        // Faith grows in community — you believe because others believe
        const communityFaith = 0.00008 * Math.min(trustedNearby.length, 5);
        agent.faith = Math.min(1.0, agent.faith + communityFaith);
      } else {
        // Isolation erodes faith slowly
        agent.faith = Math.max(0.02, agent.faith - 0.00003);
      }

      // ── FAITH SOURCE 2: Sacred ground — pilgrimage ──
      for (const sg of sacredGrounds) {
        const dist = Math.hypot(agent.x - sg.x, agent.y - sg.y);
        if (dist < 100) {
          const proximity = 1 - (dist / 100);
          // Standing where someone chose honor over self
          agent.faith = Math.min(1.0, agent.faith + 0.0002 * proximity * sg.strength);
          // Sacred ground heals grief
          agent.updateGrief(-0.0003 * proximity * sg.strength);
          // And passes evolution — learning from the dead
          agent.evolution = Math.min(5.0, agent.evolution + 0.00005 * sg.evolution * proximity);
        }
      }

      // ── FAITH SOURCE 3: Afterlife — collective memory radiates ──
      if (afterlifeStrength > 0.1) {
        // The more honored dead, the stronger the signal
        agent.faith = Math.min(1.0, agent.faith + 0.00004 * afterlifeStrength);
        // Ancestral knowledge feeds evolution
        agent.evolution = Math.min(5.0, agent.evolution + 0.00002 * afterlifeStrength);
      }

      // ── EVOLUTION — what faith and ancestry actually BUILD ──
      // Evolution improves base capabilities subtly
      // Higher evolution = slightly better at everything
      // This is the payoff: the generations before you make you stronger
      if (agent.evolution > 0.1) {
        const evoBonus = agent.evolution * 0.02;
        // Better cooperation radius — evolved agents work together from further
        // Better reactivity — faster learning
        // These don't modify personality permanently, just a live buff
        agent._evoCoopBonus = evoBonus;
        agent._evoReactBonus = evoBonus * 0.5;
      }

      // ── FAITH PASSIVE EFFECT — the faithful cooperate more ──
      if (agent.faith > 0.5 && trustedNearby.length > 0) {
        // Faithful agents share a tiny trust bonus with nearby allies
        agent.updateTrust(+0.00005 * agent.faith);
      }

      totalFaith += agent.faith;
    }

    // ── EMERGENT GOD — the collective field ──
    const avgFaith = alive.length > 0 ? totalFaith / alive.length : 0;
    this._collectiveFaith = avgFaith;

    // God emerges when average faith exceeds threshold
    // Not a being — a field effect. The sum of shared belief creating real power.
    if (avgFaith > 0.45) {
      const godStrength = (avgFaith - 0.45) * 2; // 0 at 0.45, 1.0 at 0.95
      this._godPresent = true;
      this._godStrength = Math.min(1.0, godStrength);

      // God's effect: reduced drain, enhanced cooperation, grief recovery
      for (const agent of alive) {
        agent.energy = Math.min(1.0, agent.energy + 0.00002 * godStrength);
        agent.updateGrief(-0.00008 * godStrength);
      }
    } else {
      this._godPresent = false;
      this._godStrength = 0;
    }
  }

  // ── PURPOSEFUL MOVEMENT ─────────────────────────────────────

  /**
   * Nudge agent toward a target position with a fixed-strength force.
   * Direction is normalized so distance doesn't cause overshoot.
   */
  _nudge(agent, tx, ty, strength) {
    const dx = tx - agent.x, dy = ty - agent.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return; // already there
    agent.vx += (dx / dist) * strength;
    agent.vy += (dy / dist) * strength;
  }

  applyMovementDrive(agent, atZone, alive) {
    const energy = agent.energy;

    // Gentle gravity toward world center — prevents scatter to edges
    const cx = this.world.width / 2, cy = this.world.height / 2;
    const edgeDist = Math.hypot(agent.x - cx, agent.y - cy);
    const maxDist = Math.min(cx, cy);
    if (edgeDist > maxDist * 0.5) {
      const gravity = 0.04 * ((edgeDist / maxDist) - 0.5);
      this._nudge(agent, cx, cy, gravity);
    }

    // DRIVE 1: Hungry → move toward nearest resource zone
    if (energy < 0.4 && !atZone) {
      let nearestZone = null, nearestDist = Infinity;
      for (const zone of this.zones) {
        const d = Math.hypot(agent.x - zone.x, agent.y - zone.y);
        if (d < nearestDist) { nearestDist = d; nearestZone = zone; }
      }
      if (nearestZone) {
        const urgency = 0.06 + (0.4 - energy) * 0.15; // hungrier = stronger
        this._nudge(agent, nearestZone.x, nearestZone.y, urgency);
      }
    }

    // DRIVE 2: Social cohesion — agents always want to be near others.
    // Stronger when isolated, weaker when already in a group.
    const neighbors = this.world.getNeighbors(agent, 150);
    const livingNearby = neighbors.filter(n =>
      !n.seppukuDone && n.griefState !== 'DISHONORED');

    if (livingNearby.length < 4 && alive.length > 1) {
      // Find nearest cluster of agents (average position of closest 5)
      const sorted = [];
      for (const other of alive) {
        if (other === agent) continue;
        sorted.push({ a: other, d: Math.hypot(agent.x - other.x, agent.y - other.y) });
      }
      sorted.sort((a, b) => a.d - b.d);
      const closest5 = sorted.slice(0, 5);
      if (closest5.length > 0) {
        const avgX = closest5.reduce((s, o) => s + o.a.x, 0) / closest5.length;
        const avgY = closest5.reduce((s, o) => s + o.a.y, 0) / closest5.length;
        // Lonelier = stronger pull. 0 neighbors → 0.15, 3 neighbors → 0.04
        const loneliness = 0.04 + (4 - livingNearby.length) * 0.035;
        this._nudge(agent, avgX, avgY, loneliness);
      }
    }

    // DRIVE 3: Well-fed + near zone → occasionally explore a different zone
    if (energy > 0.7 && atZone && Math.random() < 0.002) {
      const otherZones = this.zones.filter(z => {
        const d = Math.hypot(agent.x - z.x, agent.y - z.y);
        return d > z.radius * 2;
      });
      if (otherZones.length > 0) {
        const target = otherZones[Math.floor(Math.random() * otherZones.length)];
        this._nudge(agent, target.x, target.y, 0.12);
      }
    }

    // DRIVE 4: Surplus agent near hungry → move toward them to share
    if (energy > 0.65) {
      const hungryNearby = this.world.getNeighbors(agent, 120)
        .filter(n => !n.seppukuDone && n.energy != null && n.energy < 0.25);
      if (hungryNearby.length > 0) {
        this._nudge(agent, hungryNearby[0].x, hungryNearby[0].y, 0.03);
      }
    }

    // DRIVE 5: Pilgrimage — grieving faithful seek sacred ground
    const sacredGrounds = this.world.sacredGrounds || [];
    if (agent.faith > 0.3 && agent.griefLevel > 0.2 && sacredGrounds.length > 0) {
      // Find nearest sacred ground
      let nearest = null, nearestDist = Infinity;
      for (const sg of sacredGrounds) {
        const d = Math.hypot(agent.x - sg.x, agent.y - sg.y);
        if (d < nearestDist && sg.strength > 0.1) { nearestDist = d; nearest = sg; }
      }
      if (nearest && nearestDist > 30) {
        const pilgrimStrength = 0.04 * agent.faith * agent.griefLevel;
        this._nudge(agent, nearest.x, nearest.y, pilgrimStrength);
      }
    }
  }

  // ── REPRODUCTION ────────────────────────────────────────────

  tickReproduction(alive) {
    const tick = this.world.time;
    if (tick - this._lastBirthTick < this.birthCooldown) return;

    // Carrying capacity — no births if at max
    const currentPop = alive.length;
    if (currentPop >= this.maxPopulation) return;

    // Find eligible parents — well-fed, trusted, active
    const eligible = alive.filter(a =>
      a.energy >= this.birthEnergy &&
      a.trustCharge >= this.birthTrust &&
      a.griefState === 'ACTIVE'
    );

    if (eligible.length < 2) return;

    // Pick two parents — highest energy + trust combination
    eligible.sort((a, b) =>
      (b.energy + b.trustCharge) - (a.energy + a.trustCharge));

    const parent1 = eligible[0];
    const parent2 = eligible[1];

    // Parents must be near each other
    const parentDist = Math.hypot(parent1.x - parent2.x, parent1.y - parent2.y);
    if (parentDist > 80) return;

    // ── BIRTH ──
    const Agent = window.MurmurationModules.Agent;
    const childId = this.nextAgentId++;

    // Position: between parents with small offset
    const cx = (parent1.x + parent2.x) / 2 + (Math.random() - 0.5) * 20;
    const cy = (parent1.y + parent2.y) / 2 + (Math.random() - 0.5) * 20;

    // Personality: blend of both parents with mutation
    const blend = (a, b) => {
      const avg = (a + b) / 2;
      const mutation = (Math.random() - 0.5) * 0.15;
      return Math.max(0.1, Math.min(1.0, avg + mutation));
    };

    const childPersonality = {
      riskTolerance: blend(parent1.personality.riskTolerance, parent2.personality.riskTolerance),
      trustBaseline: blend(parent1.personality.trustBaseline, parent2.personality.trustBaseline),
      reactivity:    blend(parent1.personality.reactivity, parent2.personality.reactivity),
      memoryWeight:  blend(parent1.personality.memoryWeight, parent2.personality.memoryWeight)
    };

    const child = new Agent(childId, cx, cy, childPersonality);
    child.energy = 0.5; // born with half energy — parents fed them
    child.generation = Math.max(parent1.generation || 0, parent2.generation || 0) + 1;

    // ── EVOLUTION INHERITANCE — the whole point ──
    // Children inherit the better of their parents' evolution, plus a boost.
    // Each generation starts slightly ahead. THIS is progress.
    const parentEvo1 = parent1.evolution || 0;
    const parentEvo2 = parent2.evolution || 0;
    child.evolution = Math.max(parentEvo1, parentEvo2) + 0.1;

    // Faith is partially inherited — you learn what your parents believed
    child.faith = ((parent1.faith || 0.1) + (parent2.faith || 0.1)) / 2 * 0.7;

    // Parents sacrifice energy — the cost of creating life
    parent1.energy -= this.birthCost * 0.5;
    parent2.energy -= this.birthCost * 0.5;

    // Parents gain trust, wisdom, AND evolution — creating life is the highest act
    parent1.updateTrust(+0.02);
    parent2.updateTrust(+0.02);
    parent1.wisdomScore = Math.min(1, (parent1.wisdomScore || 0) + 0.05);
    parent2.wisdomScore = Math.min(1, (parent2.wisdomScore || 0) + 0.05);
    parent1.evolution = Math.min(5.0, parentEvo1 + 0.05);
    parent2.evolution = Math.min(5.0, parentEvo2 + 0.05);

    this.world.agents.push(child);
    this._lastBirthTick = tick;
    this.totalBirths++;

    if (window.logLine) {
      window.logLine(
        `💒 BORN — Agent #${childId} (Gen ${child.generation}) — ` +
        `parents #${parent1.id} + #${parent2.id} — population ${currentPop + 1}`,
        'emerge'
      );
    }
  }

  // ── DRAWING ─────────────────────────────────────────────────

  draw(ctx) {
    const mult = this.phaseMultipliers;

    for (const zone of this.zones) {
      const effective = zone.richness * (1 - zone.depleted) * mult.harvest;
      const alpha = 0.03 + effective * 0.05; // subtle glow

      const grad = ctx.createRadialGradient(
        zone.x, zone.y, 0,
        zone.x, zone.y, zone.radius
      );

      if (this.phase === 'DISASTER') {
        grad.addColorStop(0, `rgba(255, 50, 30, ${alpha})`);
        grad.addColorStop(1, 'rgba(255, 50, 30, 0)');
      } else if (this.phase === 'SCARCITY') {
        grad.addColorStop(0, `rgba(255, 160, 0, ${alpha})`);
        grad.addColorStop(1, 'rgba(255, 160, 0, 0)');
      } else {
        grad.addColorStop(0, `rgba(0, 255, 120, ${alpha})`);
        grad.addColorStop(1, 'rgba(0, 255, 120, 0)');
      }

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Sacred ground — soft golden crosses where honor was chosen ──
    const sacredGrounds = this.world.sacredGrounds || [];
    for (const sg of sacredGrounds) {
      if (sg.strength < 0.05) continue;
      const alpha = sg.strength * 0.25;
      // Soft radial glow
      const sgGrad = ctx.createRadialGradient(sg.x, sg.y, 0, sg.x, sg.y, 40);
      sgGrad.addColorStop(0, `rgba(255, 200, 50, ${alpha * 0.6})`);
      sgGrad.addColorStop(1, 'rgba(255, 200, 50, 0)');
      ctx.fillStyle = sgGrad;
      ctx.beginPath();
      ctx.arc(sg.x, sg.y, 40, 0, Math.PI * 2);
      ctx.fill();

      // Small cross marker
      ctx.strokeStyle = `rgba(255, 215, 80, ${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sg.x, sg.y - 5); ctx.lineTo(sg.x, sg.y + 5);
      ctx.moveTo(sg.x - 3, sg.y - 2); ctx.lineTo(sg.x + 3, sg.y - 2);
      ctx.stroke();
    }

    // ── Emergent God — soft ambient glow when collective faith is high ──
    if (this._godPresent && this._godStrength > 0.05) {
      const gAlpha = this._godStrength * 0.04;
      ctx.fillStyle = `rgba(255, 220, 100, ${gAlpha})`;
      ctx.fillRect(0, 0, this.world.width, this.world.height);
    }

    // Phase indicator
    ctx.save();
    ctx.font = '11px monospace';
    ctx.fillStyle = this.phase === 'GOLDEN'   ? '#00ff77' :
                    this.phase === 'DISASTER' ? '#ff3322' :
                    this.phase === 'SCARCITY' ? '#ff8800' :
                                                '#00ccff';
    if (this.phase !== 'GOLDEN') {
      const phasePct = Math.floor((this.phaseTimer / (this.phaseTicks[this.phase] || 900)) * 100);
      ctx.fillText(`${this.phase} ${phasePct}%`, 10, this.world.height - 10);
    } else {
      ctx.fillText('GOLDEN', 10, this.world.height - 10);
    }

    // Faith & evolution indicator
    if (this._collectiveFaith > 0) {
      ctx.fillStyle = this._godPresent ? '#ffd700' : 'rgba(255, 215, 80, 0.5)';
      const faithLabel = this._godPresent
        ? `FAITH ${this._collectiveFaith.toFixed(2)} ✦ GOD PRESENT`
        : `FAITH ${this._collectiveFaith.toFixed(2)}`;
      ctx.fillText(faithLabel, 10, this.world.height - 24);
    }
    ctx.restore();
  }

  // ── SERIALIZATION ───────────────────────────────────────────

  serialize() {
    return {
      phase: this.phase,
      phaseTimer: this.phaseTimer,
      cycleCount: this.cycleCount,
      scarcityLevel: this.scarcityLevel,
      totalHarvested: this.totalHarvested,
      totalBirths: this.totalBirths,
      nextAgentId: this.nextAgentId,
      zones: this.zones.map(z => ({ ...z })),
      sacredGrounds: (this.world.sacredGrounds || []).map(sg => ({ ...sg })),
      collectiveFaith: this._collectiveFaith || 0
    };
  }

  static restore(world, data, opts = {}) {
    const econ = new Economy(world, opts);
    econ.phase = data.phase || 'GOLDEN';
    econ.phaseTimer = data.phaseTimer || 0;
    econ.cycleCount = data.cycleCount || 0;
    econ.scarcityLevel = data.scarcityLevel || 0.5;
    econ.totalHarvested = data.totalHarvested || 0;
    econ.totalBirths = data.totalBirths || 0;
    econ.nextAgentId = data.nextAgentId || 1000;
    if (data.zones) econ.zones = data.zones.map(z => ({ ...z }));
    if (data.sacredGrounds) world.sacredGrounds = data.sacredGrounds.map(sg => ({ ...sg }));
    return econ;
  }
};
