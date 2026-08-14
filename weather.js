/**
 * WEATHER — localized disasters with random paths that kill and deny ground.
 *
 * Ghost, 2026-08-09: "there is no better source for applying pressure than mother
 * nature and the human condition." And: "the path of disaster is random."
 *
 * WHAT WAS WRONG BEFORE. A disaster was a number change — economy.js flipped to a
 * DISASTER phase, drain went to 3.0 for 300 ticks, nothing died, nowhere was hit,
 * and nothing could be learned by watching. Ghost: "no visible effect indicating a
 * natural disaster, no area damage, no deaths, no relation to anything
 * experientially educational, no difficulty other than it saying scarcity."
 *
 * SIX SHAPES, NOT SIX LABELS. These are not severity variants of one event. Each
 * denies ground differently, and the difference IS the mechanic:
 *   TORNADO     narrow, fast, brief   — lethal where it touches, little denial
 *   HURRICANE   huge, sustained       — wide denial, moderate kill
 *   FLOOD       slow, wide            — low kill, LONG denial
 *   FIRE        grows as it travels   — the only one that expands
 *   EARTHQUAKE  instant, broad        — does not travel; strikes once
 *   HAIL        broad, brief          — damage without denial
 *
 * THE PATH IS RANDOM AND IT MOVES. You trigger a disaster; you never aim it.
 * Deliberate contrast with the UNALIGNED, which HAS targeting (TARGET A / BOTH /
 * TARGET B) — a nomadic force can be pointed, weather cannot.
 *
 * DEATH IS A FOURTH EXIT. Seppuku is honored, dishonor is the cost of
 * selfishness, NEMESIS is for refusers. Environmental death is none of those — it
 * is not earned, not chosen, and carries no verdict. `deathCause` records it so it
 * is never displayed as "Honored the collective."
 */

// Track sampling. Bounded on purpose — this repo has already lost a 26M-entry
// interactionLog and a 25M event log to unbounded accumulation, and a storm
// path is exactly the shape of thing that quietly becomes one.
const TRACK_EVERY = 6;    // ticks between breadcrumbs
const TRACK_MAX   = 180;  // hard ceiling per storm

window.MurmurationModules = window.MurmurationModules || {};
window.MurmurationModules.Weather = class Weather {
  constructor(world, opts = {}) {
    this.world = world;

    // Per-hit death toll. Ghost's original spec: "Varying 8-17% death toll on
    // every hit." Lowered to 4-9% on evidence from his 29,613-tick run.
    //
    // WHY, and it is not just "313 was a lot". The toll was suppressing an
    // entire evolutionary lineage. mutations.js earns the GROWTH gene from
    // `births = max(0, n - lastAlive)` — the NET rise in living agents between
    // samples. Weather taking 8-17% of the living on every event meant the net
    // never rose, so growth pressure read 0 permanently and the gene could not
    // crystallize. Combined with abundance pinning energy at 1.00 (no scarcity
    // pressure) and near-zero grief (no faith pressure), four of six lineages
    // were unreachable and APEX — which needs four distinct ones — was
    // impossible by construction.
    //
    // 8-17% is still the right feel for a SINGLE catastrophe. It was never
    // costed against a storm arriving every ~2400 ticks forever.
    this.killMin = opts.killMin ?? 0.04;
    this.killMax = opts.killMax ?? 0.09;

    this.active = [];   // disasters currently crossing the map
    this.scars  = [];   // ground denied after one passed; decays
    this.log    = [];   // append-only: what struck, where, who it took

    // CADENCE. Weather arrives on its own or it is not weather — an operator
    // pressing a button is a scenario, and a scenario the swarm can wait out is
    // not pressure. Ghost: "there is no better source for applying pressure than
    // mother nature." So this runs unattended.
    //
    // `concurrent` is the real safety rail, not the interval: three fronts on a
    // 1442-unit map at 8-17% each is an extinction event, and a dead colony
    // teaches nothing. Storms queue rather than stack.
    this.enabled    = opts.enabled ?? true;
    this.cadence    = opts.cadence ?? 2400;   // mean ticks between events
    this.concurrent = opts.concurrent ?? 2;   // hard ceiling on simultaneous fronts
    this.ticks      = 0;
    this.nextAt     = this._reschedule();

    // Shape table. radius/speed in world units, life in ticks.
    // `denial` is how long the ground stays unusable after the front passes.
    this.KINDS = {
      TORNADO:    { radius:  38, speed: 3.4, life: 420, denial:  120, grows: 0,    travels: true  },
      HURRICANE:  { radius: 190, speed: 0.9, life: 900, denial:  600, grows: 0,    travels: true  },
      FLOOD:      { radius: 150, speed: 0.6, life: 780, denial: 1400, grows: 0,    travels: true  },
      FIRE:       { radius:  55, speed: 1.4, life: 700, denial:  900, grows: 0.09, travels: true  },
      EARTHQUAKE: { radius: 240, speed: 0,   life:  90, denial:  300, grows: 0,    travels: false },
      HAIL:       { radius: 170, speed: 2.0, life: 300, denial:    0, grows: 0,    travels: true  },
    };
  }

  get kinds() { return Object.keys(this.KINDS); }

  /**
   * Next arrival, spread 0.5x-1.5x around the cadence.
   *
   * Deliberately NOT a fixed interval. A metronome is learnable — the swarm
   * would settle into the gaps and the pressure would stop being pressure. The
   * spread is what keeps it from becoming a schedule.
   */
  _reschedule() { return this.ticks + Math.round(this.cadence * (0.5 + Math.random())); }

  /**
   * FREQUENCY CONTROL — Ghost, 2026-08-14: "we need a slider for the storm
   * frequency... i think it should be controllable."
   *
   * Takes 0..1 where higher means MORE storms, and maps it exponentially onto
   * the cadence, because frequency is felt on a ratio scale — the step from
   * one storm every 6000 ticks to one every 3000 reads the same as 3000 to
   * 1500, and a linear dial would waste most of its travel in the rare end.
   *
   *   0.00 -> 6000 ticks between storms (rare)
   *   0.40 -> 2389                      (the shipped default of 2400, near enough)
   *   0.70 -> 1197
   *   1.00 ->  600                      (relentless)
   *
   * Rescheduling on change is the point: without it a storm already queued at
   * the old cadence keeps its old arrival time, and moving the dial appears to
   * do nothing until after the next storm.
   */
  setFrequency(f) {
    const freq = Math.max(0, Math.min(1, f));
    this.cadence = Math.round(6000 * Math.pow(0.1, freq));
    this.nextAt = this._reschedule();
    return this.cadence;
  }

  /**
   * Spawn a disaster. Type may be named; PATH IS ALWAYS RANDOM.
   *
   * Travelling events enter from a random edge and cross at a random heading, so
   * neither the operator nor a colony can predict or claim the safe side.
   * Earthquakes do not travel — they strike a random interior point.
   */
  spawn(kind = null, intensity = 1.0) {
    const type = kind && this.KINDS[kind] ? kind : this.kinds[(Math.random() * 6) | 0];
    const K = this.KINDS[type];
    const W = this.world.width, H = this.world.height;

    let x, y, dx = 0, dy = 0;
    if (K.travels) {
      // Enter from a random edge, aim at a random point on the far side. The
      // heading is drawn, not chosen — that is what makes it weather.
      const edge = (Math.random() * 4) | 0;
      if (edge === 0) { x = Math.random() * W; y = -K.radius; }
      else if (edge === 1) { x = W + K.radius; y = Math.random() * H; }
      else if (edge === 2) { x = Math.random() * W; y = H + K.radius; }
      else { x = -K.radius; y = Math.random() * H; }
      const tx = Math.random() * W, ty = Math.random() * H;
      const d = Math.hypot(tx - x, ty - y) || 1;
      dx = (tx - x) / d; dy = (ty - y) / d;
    } else {
      x = K.radius + Math.random() * (W - K.radius * 2);
      y = K.radius + Math.random() * (H - K.radius * 2);
    }

    // DEATH BUDGET — Ghost: "Varying 8-17% death toll on every hit."
    // The band is the toll on the POPULATION, not a per-agent coin flip. Measured
    // first: per-agent gave 0.5-2.7%, four to ten times light.
    //
    // Budgeting also sharpens the shapes instead of flattening them. A tornado
    // catches few, so its budget is spent on nearly all of them — lethal where it
    // touches. A hurricane catches many and spreads the same kind of budget thin —
    // wide, survivable, and remembered for the ground it denies rather than the
    // deaths. That falls out of the arithmetic; it is not special-cased.
    const living = this.world.agents.filter(a => !a.seppukuDone && !a.isSentinel).length;
    const band = this.killMin + Math.random() * (this.killMax - this.killMin);
    // NO lethality multiplier here. Ghost: "8-17% death toll on EVERY hit."
    // The band is the whole band, for every type. Shapes differ in FOOTPRINT,
    // SPEED and DENIAL — not in how deadly a hit is. A narrow tornado simply
    // cannot reach 17% of a dispersed population, so it comes out catch-limited
    // near the floor; that is geometry doing the work, not a tuned exception.
    const budget = Math.round(living * band * intensity);

    // Estimate how many it will catch, so the budget can be spread across the
    // whole crossing rather than spent entirely on whoever is at the entry edge.
    const area = W * H;
    // Path length is speed x life, NOT the map diagonal. Using the diagonal
    // over-estimated the catch for every slow or short-lived front, so their
    // per-agent chance came out too low and the budget went unspent: flood and
    // hail landed at ~3% against a 8-17% target. A flood at speed 0.6 over 780
    // ticks crosses 468 units of a 1442-unit diagonal — under a third of it.
    const reach = K.travels ? Math.min(K.speed * K.life, Math.hypot(W, H)) : 0;
    const swept = K.travels
      ? Math.min(area, 2 * K.radius * reach)              // corridor actually walked
      : Math.PI * K.radius * K.radius;                    // strike
    const expected = Math.max(1, (swept / area) * living);

    const d = {
      id: `WX-${++Weather._seq}`, type, x, y, dx, dy,
      radius: K.radius, speed: K.speed * intensity, life: K.life,
      age: 0, intensity, struck: new Set(), deaths: 0,
      budget, perAgent: Math.min(1, budget / expected),
      // THE TRACK — where this storm has actually been.
      //
      // Ghost, 2026-08-09: "still no storm tracker." He runs at 3-4x sim speed,
      // where a storm's whole life is 0.38s (EARTHQUAKE) to 3.75s (HURRICANE)
      // of wall clock, with ~10s of nothing between. Lifetime is counted in
      // TICKS, so the faster the world runs the less weather can be seen.
      //
      // A tracker shows where a storm HAS BEEN, not only where it is. The track
      // outlives the storm as the denied corridor, so a 0.38s earthquake still
      // leaves something on the map to find.
      track: [{ x, y, r: K.radius }],
    };
    this.active.push(d);

    if (window.logLine) {
      window.logLine(`⛈ ${type} — path random, no side is safe`, 'crisis');
    }
    return d;
  }

  /** Advance every active disaster one tick. Call from the sim step. */
  update() {
    const W = this.world.width, H = this.world.height;

    // Arrival. Held back rather than skipped when the map is already full, so a
    // busy sky delays the next front instead of silently dropping it.
    this.ticks++;
    if (this.enabled && this.ticks >= this.nextAt) {
      if (this.active.length < this.concurrent) {
        this.spawn();
        this.nextAt = this._reschedule();
      } else {
        this.nextAt = this.ticks + 120;   // sky is full — try again shortly
      }
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const d = this.active[i];
      d.age++;

      d.x += d.dx * d.speed;
      d.y += d.dy * d.speed;
      const K = this.KINDS[d.type];
      if (K.grows) d.radius += K.grows;              // FIRE is the one that expands

      // Breadcrumb the path. Sampled, not per-tick: a 900-tick hurricane would
      // otherwise carry 900 points, and TRACK_MAX caps it regardless.
      if (d.age % TRACK_EVERY === 0) {
        d.track.push({ x: d.x, y: d.y, r: d.radius });
        if (d.track.length > TRACK_MAX) d.track.shift();
      }

      this._strike(d);

      // Retire when spent, or once a travelling front has fully left the map
      const gone = d.age > d.life ||
        (K.travels && (d.x < -d.radius * 2 || d.x > W + d.radius * 2 ||
                       d.y < -d.radius * 2 || d.y > H + d.radius * 2));
      if (gone) {
        if (K.denial > 0) {
          // THE SCAR IS THE CORRIDOR, NOT THE EXIT POINT. Previously this
          // recorded a single circle at d.x/d.y — wherever the storm happened
          // to stop, which for a travelling front is OFF THE MAP EDGE. So a
          // hurricane that crossed the whole world denied a dot in the margin
          // and left the ground it actually destroyed untouched and unmarked.
          this.scars.push({
            x: d.x, y: d.y, radius: d.radius, type: d.type,
            track: d.track.filter(p => p.x > -d.radius && p.x < W + d.radius &&
                                       p.y > -d.radius && p.y < H + d.radius),
            ttl: K.denial, max: K.denial,
          });
        }
        this.log.push({ id: d.id, type: d.type, deaths: d.deaths, age: d.age });
        this.active.splice(i, 1);
      }
    }

    for (let i = this.scars.length - 1; i >= 0; i--) {
      if (--this.scars[i].ttl <= 0) this.scars.splice(i, 1);
    }
  }

  /**
   * Kill inside the footprint.
   *
   * `struck` guarantees one agent is only ever taken once by the same event — a
   * slow hurricane must not grind the same agent every tick for 900 ticks. The
   * toll is drawn per agent from Ghost's 8-17% band, scaled by the shape's
   * lethality, so a tornado is deadly where it touches and a flood mostly is not.
   */
  _strike(d) {
    const K = this.KINDS[d.type];
    const r2 = d.radius * d.radius;

    for (const a of this.world.agents) {
      if (a.seppukuDone || a.isSentinel) continue;
      if (d.struck.has(a.id)) continue;

      const ddx = a.x - d.x, ddy = a.y - d.y;
      if (ddx * ddx + ddy * ddy > r2) continue;
      d.struck.add(a.id);

      if (d.deaths >= d.budget) continue;          // the event has spent its toll
      if (Math.random() >= d.perAgent) continue;

      // ── environmental death — the fourth exit ──────────────────────────
      // Not seppuku (honored), not dishonor (the cost of selfishness), not
      // NEMESIS (refusers). Nothing was chosen and nothing is judged.
      a.deathCause = `disaster:${d.type}`;
      a.seppukuDone = true;             // the flag every system reads as "gone"
      a.vx = 0; a.vy = 0;
      d.deaths++;

      // Ghost, 2026-08-09: "environmental deaths only give honor to the agents
      // with the top 10 highest holding honor spots with the longest lineage."
      //
      // Weather creates no honor — it cannot, nothing was chosen. What this does
      // is stop the MANNER of death erasing what was already earned, and only for
      // the greatest and longest-persisting. Everyone else the storm takes goes
      // unmarked, which is what makes the exception mean anything.
      if (this._eligibleForMonument(a)) {
        const lifetime = a.honor || 0;
        a.fallenRank = lifetime >= 20 ? 'GOD' : lifetime >= 10 ? 'LEGEND' : 'HERO';
        const icon = a.fallenRank === 'GOD' ? '☀' : a.fallenRank === 'LEGEND' ? '⚔' : '★';
        if (window.addEvent) {
          window.addEvent(`${icon} Colony ${a.colony} #${a.id} taken by ${d.type} — ` +
            `${a.fallenRank}, gen ${a.generation || 1}, ${lifetime.toFixed(2)} honor. ` +
            `The storm did not earn this; it could not take it either.`, 'emerge');
        }
      } else if (window.logLine) {
        window.logLine(`☠ ${d.type} took Agent #${a.id} — no honor, no dishonor, weather`, 'crisis');
      }
    }
  }

  /**
   * Monument eligibility for a weather death.
   *
   * Read as an INTERSECTION of two top-tens: the agent must be among the ten
   * highest lifetime-honor holders AND among the ten longest lineages. Being
   * decorated is not enough, and neither is merely being old — the rule names
   * both, so both are required.
   *
   * ⚠️ Ghost should confirm the reading. The alternative is a single ranking with
   * lineage as tiebreak, which is more permissive.
   */
  _eligibleForMonument(agent) {
    // AN AGENT WITH NO HONOR HOLDS NO HONOR SPOT.
    //
    // Ghost's run produced: "★ Colony A #8 taken by HAIL — HERO, gen 1, 0.00
    // honor." A first-generation agent that had earned nothing was given a
    // monument, because when the whole colony sits at 0.00 the "top ten by
    // honor" is just the first ten in sort order — every one of them tied at
    // nothing. The rule says "the top 10 highest holding honor spots"; holding
    // zero is not holding a spot. War games in SKIRMISH mode award no attrition
    // honor at all, so this is the NORMAL state, not an edge case.
    if (!(agent.honor > 0)) return false;

    const pool = this.world.agents.filter(a => !a.isSentinel);
    const byHonor = [...pool].sort((x, y) => (y.honor || 0) - (x.honor || 0)).slice(0, 10);
    if (!byHonor.includes(agent)) return false;
    const byLineage = [...pool]
      .sort((x, y) => (y.generation || 1) - (x.generation || 1)).slice(0, 10);
    return byLineage.includes(agent);
  }

  /** Denial: 0 = clear, 1 = fully unusable. Read by the economy and the radar. */
  denialAt(x, y) {
    let worst = 0;
    for (const d of this.active) {
      const K = this.KINDS[d.type];
      if (K.denial <= 0) continue;
      const t = 1 - Math.hypot(x - d.x, y - d.y) / d.radius;
      if (t > 0) worst = Math.max(worst, t);
    }
    for (const s of this.scars) {
      // Walk the corridor, not just the endpoint. A scar is now the whole path
      // the storm swept; checking only s.x/s.y would deny one circle at the map
      // edge and leave the destroyed ground fully usable.
      const fade = s.ttl / s.max;
      if (s.track && s.track.length) {
        for (const p of s.track) {
          const t = (1 - Math.hypot(x - p.x, y - p.y) / (p.r || s.radius)) * fade;
          if (t > worst) worst = t;
        }
      } else {
        const t = (1 - Math.hypot(x - s.x, y - s.y) / s.radius) * fade;
        if (t > worst) worst = t;
      }
    }
    return Math.min(1, worst);
  }

  /** Everything the storm radar needs. Fronts first — they are what is coming. */
  getHazards() {
    return {
      fronts: this.active.map(d => ({
        x: d.x, y: d.y, radius: d.radius, type: d.type,
        dx: d.dx, dy: d.dy, intensity: d.intensity,
        deaths: d.deaths, track: d.track,
        fade: 1 - d.age / d.life,
      })),
      scars: this.scars.map(s => ({
        x: s.x, y: s.y, radius: s.radius, type: s.type, track: s.track,
        fade: s.ttl / s.max,
      })),
    };
  }

  getStatus() {
    return {
      active: this.active.length,
      scars: this.scars.length,
      // Retired storms AND the ones still on the map. Counting only the log
      // meant a storm mid-crossing showed a toll of zero while it was killing.
      totalDeaths: this.log.reduce((n, e) => n + e.deaths, 0) +
                   this.active.reduce((n, d) => n + d.deaths, 0),
      lastEvent: this.log[this.log.length - 1] || null,
    };
  }
}

window.MurmurationModules.Weather._seq = 0;
