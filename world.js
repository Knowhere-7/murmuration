/**
 * World State for Murmuration
 * Env vars, agent registry, log, time-step.
 *
 * ST-2: Collective Memory (seppuku wisdom dumps) + Sentinel management
 */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.World = class World {
  constructor(width, height, agentCount = 50) {
    this.width  = width;
    this.height = height;
    this.agents = [];
    // ── EASY-CURRENT VARIANT (branch: easy-current) ──
    // The current has been adjusted to make the corner power-ups easier to reach:
    // boundary-layer glide (world.js) + strong relic grab (relics.js) are turned ON.
    // This is the DELIBERATE counterpart to the crucible on `super-murmuration`, where
    // this flag is false and the unreachable-corners-against-the-current forced THE-SWARM
    // to invent orbital-slingshot travel (2026-07-24). Effect of easy access on emergence
    // is UNKNOWN and under observation — that is the point of keeping this a separate line.
    this.easyCorners = true;
    // ── PER-COLONY ENVIRONMENT — each colony evolves on its own path. Every
    // 'Break the Swarm' trait, plus the new positive/threat levers, is scoped
    // to A or B independently instead of hitting both at once. ──
    this.envA = {
      disturbance:  0, // PitViperDivergence
      anomaly:      0, // ElectroreceptionAnomaly
      pressure:     0, // LateralLinePressure
      timestepRes:  0, // EcholocationFrequency — cognitive sharpness, NOT sim speed
      spawnFilter:  0, // MantisShrimp16Bands
      abundance:    0, // Symbiotic Abundance — the positive lever
      predatorPressure: 0
    };
    this.envB = {
      disturbance: 0, anomaly: 0, pressure: 0, timestepRes: 0,
      spawnFilter: 0, abundance: 0, predatorPressure: 0
    };
    // Legacy alias so any code still reading world.env sees colony A's values.
    this.env = this.envA;
    // Global time control — ticks processed per rendered frame. 1 = real-time,
    // 20 = fast-forward evolution. Independent of any per-colony trait.
    this.simSpeed = 1;
    this.interactionLog = [];
    this.time = 0;

    // ST-2 Collective Memory — seppuku wisdom dumps, weighted 2.0×
    this.collectiveMemory = [];
    // ST-3 Sacred Grounds — where honored agents chose death, pilgrimage sites
    this.sacredGrounds = [];
    // ST-2 Sentinel — one per world, the cautionary tale
    this.sentinel = null;

    // ── COLONY DOCTRINE — the choice between war and peace ──
    // 'war'     : coordinated aggression, raid enemy zones, escalate cross-colony conflicts
    // 'peace'   : signal cooperation, shared zones regenerate faster, no raids
    // 'neutral' : default — follow agent-level trait weights
    // Doctrine can be set manually (UI) or drift emergently from colony-wide faith/trust avg
    this.doctrine = { A: 'neutral', B: 'neutral' };

    // Treaty state — tracks whether a formal truce has been established
    // 'none' | 'proposed:A' | 'proposed:B' | 'active'
    this.treatyState  = 'none';
    this.treatyTick   = 0;    // when the active treaty was formed
    this.treatyBreaks = 0;    // how many times a treaty has broken down

    // Commons network — contested resource nodes. Each has supply (0-1) that
    // depletes under occupation and regenerates when empty. Holding a zone
    // provides trust recovery; depleted zones punish occupants until they leave.
    // controller: null | 'A' | 'B' | 'CONTESTED'
    // 10 landing zones — the 5-zone pattern (2 top wide, 1 center, 2 bottom
    // wide), mirrored per colony side so each colony gets its own full set.
    this.commonsLayout = [
      // Colony A / Knowhere side
      { xf: 0.12, yf: 0.20, rf: 0.058, name: 'WELL · KN I',   supply: 1.0, maxOccupants: 5, controller: null, occupantCount: 0, wisdomTicks: 0 },
      { xf: 0.38, yf: 0.20, rf: 0.058, name: 'WELL · KN II',  supply: 1.0, maxOccupants: 5, controller: null, occupantCount: 0, wisdomTicks: 0 },
      { xf: 0.25, yf: 0.50, rf: 0.072, name: 'HEARTH · KN',   supply: 1.0, maxOccupants: 8, controller: null, occupantCount: 0, wisdomTicks: 0 },
      { xf: 0.12, yf: 0.80, rf: 0.058, name: 'WELL · KN III', supply: 1.0, maxOccupants: 5, controller: null, occupantCount: 0, wisdomTicks: 0 },
      { xf: 0.38, yf: 0.80, rf: 0.058, name: 'WELL · KN IV',  supply: 1.0, maxOccupants: 5, controller: null, occupantCount: 0, wisdomTicks: 0 },
      // Colony B / Mainland side (mirrored)
      { xf: 0.62, yf: 0.20, rf: 0.058, name: 'WELL · ML I',   supply: 1.0, maxOccupants: 5, controller: null, occupantCount: 0, wisdomTicks: 0 },
      { xf: 0.88, yf: 0.20, rf: 0.058, name: 'WELL · ML II',  supply: 1.0, maxOccupants: 5, controller: null, occupantCount: 0, wisdomTicks: 0 },
      { xf: 0.75, yf: 0.50, rf: 0.072, name: 'HEARTH · ML',   supply: 1.0, maxOccupants: 8, controller: null, occupantCount: 0, wisdomTicks: 0 },
      { xf: 0.62, yf: 0.80, rf: 0.058, name: 'WELL · ML III', supply: 1.0, maxOccupants: 5, controller: null, occupantCount: 0, wisdomTicks: 0 },
      { xf: 0.88, yf: 0.80, rf: 0.058, name: 'WELL · ML IV',  supply: 1.0, maxOccupants: 5, controller: null, occupantCount: 0, wisdomTicks: 0 },
    ];

    // ── THE WALL — a vertical barrier splitting the map into two territories.
    // Two gates the user opens/closes. Closed = colonies stay separate.
    // Open = agents (and conflict) bleed across. Movement collision only —
    // bonds and sightlines still cross, so tension builds along the seam.
    this.wall = {
      thickness: 12,
      // Spread far apart and pushed close to the top/bottom edges (was 0.28/0.72,
      // clustered near mid-height). Solid wall segments above/below a gate are
      // where agents pile up and wedge into the corner under crowd pressure —
      // pushing the gates outward shrinks those segments and gives the crowd
      // more open perimeter to bleed into instead of jamming the same corner.
      // hf unchanged, so a real indentation/margin (~6.5% of height) still
      // separates each gate from the canvas edge — it never touches the corner.
      gates: [
        { yf: 0.14, hf: 0.075, open: false, name: 'NORTH GATE' },
        { yf: 0.86, hf: 0.075, open: false, name: 'SOUTH GATE' }
      ]
    };

    // Environmental control knobs (wired to sliders) — per-colony now.
    this.terrainPullA = 1.0;   // how strongly the topography channels colony A's movement
    this.terrainPullB = 1.0;   // same, for colony B — independent evolutionary path

    // UNALIGNED escalation — each "INTRODUCE UNALIGNED" press ratchets the
    // response up a tier and never de-escalates on its own (see introduceUnaligned).
    this.unalignedTier   = 0;      // 0 = none introduced yet
    this.unalignedTarget = 'both'; // 'A' | 'B' | 'both' — settable by the UI

    this.initAgents(agentCount);
  }

  /** Toggle a gate open/closed. Returns the new open state. */
  toggleGate(index) {
    const g = this.wall.gates[index];
    if (!g) return null;
    g.open = !g.open;
    if (window.logLine) {
      window.logLine(`${g.open ? '\u25B6 OPENED' : '\u25A0 CLOSED'} \u2014 ${g.name}`, g.open ? 'evolve' : 'warn');
    }
    return g.open;
  }

  /** Keep an agent on whichever side of the wall it was on, unless it is
   *  passing through an OPEN gate. Called after movement each tick. */
  applyWallCollision(a) {
    const wx = this.width / 2, half = this.wall.thickness / 2;
    // Inside an open gate's vertical window? Free passage.
    for (const g of this.wall.gates) {
      if (g.open && Math.abs(a.y - g.yf * this.height) < g.hf * this.height) return;
    }
    const prev = (a._wx != null) ? a._wx : a.x;
    if (prev <= wx) {
      if (a.x > wx - half) { a.x = wx - half; if (a.vx > 0) a.vx = -a.vx * 0.5; }
    } else {
      if (a.x < wx + half) { a.x = wx + half; if (a.vx < 0) a.vx = -a.vx * 0.5; }
    }
  }

  /** Neon barrier + gate markers. Called by K26 between connections and agents. */
  drawWall(ctx) {
    const W = this.width, H = this.height, wx = W / 2, half = this.wall.thickness / 2;
    ctx.save();
    ctx.lineCap = 'round';

    // Solid spans = full height minus the open-gate windows
    const openIv = this.wall.gates.filter(g => g.open)
      .map(g => [(g.yf - g.hf) * H, (g.yf + g.hf) * H]).sort((p, q) => p[0] - q[0]);
    const spans = []; let cur = 0;
    for (const iv of openIv) { if (iv[0] > cur) spans.push([cur, iv[0]]); cur = Math.max(cur, iv[1]); }
    if (cur < H) spans.push([cur, H]);

    for (const [ya, yb] of spans) {
      ctx.strokeStyle = 'rgba(60,200,230,0.10)'; ctx.lineWidth = half * 4;
      ctx.beginPath(); ctx.moveTo(wx, ya); ctx.lineTo(wx, yb); ctx.stroke();
      ctx.strokeStyle = 'rgba(120,235,255,0.45)'; ctx.lineWidth = half * 2;
      ctx.beginPath(); ctx.moveTo(wx, ya); ctx.lineTo(wx, yb); ctx.stroke();
      ctx.strokeStyle = 'rgba(240,255,255,0.85)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(wx, ya); ctx.lineTo(wx, yb); ctx.stroke();
    }

    // Gate markers — green posts when open, red danger fill when closed
    for (const g of this.wall.gates) {
      const yc = g.yf * H, gh = g.hf * H;
      const col = g.open ? '90,255,170' : '255,95,80';
      ctx.strokeStyle = `rgba(${col},0.9)`; ctx.lineWidth = 2;
      for (const py of [yc - gh, yc + gh]) {
        ctx.beginPath(); ctx.moveTo(wx - half * 3.2, py); ctx.lineTo(wx + half * 3.2, py); ctx.stroke();
      }
      if (!g.open) {
        ctx.setLineDash([5, 6]); ctx.strokeStyle = `rgba(${col},0.55)`; ctx.lineWidth = half * 1.5;
        ctx.beginPath(); ctx.moveTo(wx, yc - gh); ctx.lineTo(wx, yc + gh); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.font = '7px monospace';
      ctx.fillStyle = `rgba(${col},0.7)`;
      ctx.textAlign = 'center';
      ctx.fillText(g.open ? 'OPEN' : 'SHUT', wx, yc - gh - 5);
    }
    ctx.restore();
  }

  /** Compute all commons zones from current canvas dimensions.
   *  Spreads mutable resource state (supply, controller, etc.) into each result. */
  getCommonsZones() {
    const s = Math.min(this.width, this.height);
    return this.commonsLayout.map(c => ({
      ...c,                          // spread supply, controller, occupantCount, wisdomTicks
      cx: this.width  * c.xf,
      cy: this.height * c.yf,
      r:  s * c.rf,
    }));
  }

  /** Returns the layout entry (mutable) for a given zone by name */
  _layoutFor(name) {
    return this.commonsLayout.find(c => c.name === name) || null;
  }

  initAgents(count) {
    const Agent = window.MurmurationModules.Agent;
    const wx = this.width / 2, half = this.wall.thickness / 2, margin = 40;
    const halfCount = Math.floor(count / 2);
    for (let i = 0; i < count; i++) {
      // First half → colony A (left of the wall), second half → colony B (right)
      const colony = i < halfCount ? 'A' : 'B';
      let x;
      if (colony === 'A') {
        x = margin + Math.random() * (wx - half - margin * 2);
      } else {
        const lo = wx + half + margin;
        x = lo + Math.random() * (this.width - lo - margin);
      }
      const y = margin + Math.random() * (this.height - margin * 2);
      const personality = {
        riskTolerance: Math.random(),
        trustBaseline: 0.3 + Math.random() * 0.4,
        reactivity:    0.5 + Math.random() * 0.5,
        memoryWeight:  0.6 + Math.random() * 0.3
      };
      const a = new Agent(i, x, y, personality);
      a.colony = colony;
      // A rides the violet base hue; B is shifted to teal so the two reads apart
      a.swarmTint = colony === 'B' ? -96 : 0;
      this.agents.push(a);
    }
  }

  /** Hit reaction — a flash + expanding ring when an agent is struck by
   *  world pain (chaos signals) or combat (conflict escalation, war games).
   *  Transient: fades over HIT_MS, drawn as an overlay above the agents. */
  markHit(agent, color) {
    if (!agent) return;
    agent._hitT = performance.now();
    agent._hitColor = color || '255,70,90';
  }

  drawHits(ctx) {
    const HIT_MS = 460;
    const now = performance.now();
    for (const a of this.agents) {
      if (!a._hitT || a.seppukuDone) continue;
      const e = (now - a._hitT) / HIT_MS;
      if (e < 0 || e > 1) continue;
      const r = (a.radius || 3) + 4 + e * 16, al = (1 - e) * 0.85;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(' + a._hitColor + ',' + al.toFixed(3) + ')';
      ctx.lineWidth = 2 * (1 - e) + 0.4;
      ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2); ctx.stroke();
      if (e < 0.5) {
        ctx.fillStyle = 'rgba(' + a._hitColor + ',' + ((0.5 - e) * 1.4).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(a.x, a.y, (a.radius || 3) * 1.35, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Lightning storm — electricity arcing through a colony when paranoia
   *  (ElectroreceptionAnomaly) strikes. A compound detonation (several chaos
   *  sliders at once) upgrades the storm: longer, denser, white-blue instead
   *  of violet. Purely visual — the pain itself is delivered by the seeds. */
  strikeLightning(colony, strength, opts = {}) {
    if (!this._storms) this._storms = [];
    const compound = !!opts.compound;
    const s = Math.max(0.15, Math.min(1, strength || 0.5));
    this._storms.push({
      colony,
      compound,
      strength: s,
      start: performance.now(),
      duration: compound ? 4200 + s * 2800 : 1400 + s * 1400,
      color: compound ? '150,200,255' : '200,90,255',
      boltEvery: compound ? 70 : 55,
      boltsPerSpawn: compound ? 3 : 5,
      maxWidth: compound ? 2.6 : 1.0,
      coreAlpha: compound ? 0.85 : 1.0,
      _nextBolt: 0,
      _bolts: []
    });
    // Never let repeated detonations pile up unbounded storm state
    if (this._storms.length > 6) this._storms.shift();
  }

  _spawnBolt(storm) {
    // The electricity comes FROM the agents themselves — their electric sense
    // misfiring. Each bolt discharges off an afflicted agent's body: either
    // jumping to a nearby agent, or crackling off into the space around them.
    const pool = this.agents.filter(a => a.colony === storm.colony && !a.seppukuDone);
    if (!pool.length) return;
    const src = pool[Math.floor(Math.random() * pool.length)];
    const x1 = src.x, y1 = src.y;
    let x2, y2;
    // Compound storms arc between bodies across real distance; solo paranoia
    // is extreme STATIC — tight, violent crackle hugging the agent itself,
    // only jumping to another body if one is practically touching.
    const reach = storm.compound ? 130 : 34;
    const jumpChance = storm.compound ? 0.7 : 0.3;
    const near = pool.filter(a => a !== src &&
      Math.abs(a.x - src.x) < reach && Math.abs(a.y - src.y) < reach &&
      Math.hypot(a.x - src.x, a.y - src.y) < reach);
    if (near.length && Math.random() < jumpChance) {
      const dst = near[Math.floor(Math.random() * near.length)];
      x2 = dst.x; y2 = dst.y;
    } else {
      // Crackle off the body into open space — small to us, big to the agent
      const ang = Math.random() * Math.PI * 2;
      const crackleLen = storm.compound
        ? 18 + Math.random() * 45
        : 5 + Math.random() * 13;
      x2 = x1 + Math.cos(ang) * crackleLen;
      y2 = y1 + Math.sin(ang) * crackleLen;
    }
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len; // perpendicular for jag offsets
    // Static reads jagged: more kinks per pixel on solo bolts
    const segs = storm.compound
      ? 6 + Math.floor(Math.random() * 5)
      : 4 + Math.floor(Math.random() * 4);
    const wobbleScale = storm.compound ? 0.22 : 0.38;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const wobble = (i === 0 || i === segs) ? 0 : (Math.random() - 0.5) * len * wobbleScale;
      pts.push([x1 + dx * t + px * wobble, y1 + dy * t + py * wobble]);
    }
    // Static snaps fast; storm arcs linger a beat longer
    const life = storm.compound ? 110 + Math.random() * 110 : 55 + Math.random() * 65;
    storm._bolts.push({ pts, born: performance.now(), life });
  }

  drawLightning(ctx) {
    if (!this._storms || !this._storms.length) return;
    const now = performance.now();
    this._storms = this._storms.filter(s => now - s.start < s.duration);
    for (const storm of this._storms) {
      if (now >= storm._nextBolt) {
        for (let i = 0; i < storm.boltsPerSpawn; i++) this._spawnBolt(storm);
        storm._nextBolt = now + storm.boltEvery * (0.7 + Math.random() * 0.6);
      }
      storm._bolts = storm._bolts.filter(b => now - b.born < b.life);
      const fade = 1 - (now - storm.start) / storm.duration; // storm dies down at the end
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const bolt of storm._bolts) {
        const e = (now - bolt.born) / bolt.life;
        const al = (1 - e) * 0.9 * Math.min(1, fade * 2);
        if (al <= 0) continue;
        ctx.beginPath();
        bolt.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
        // Outer glow pass
        ctx.strokeStyle = 'rgba(' + storm.color + ',' + (al * 0.35).toFixed(3) + ')';
        ctx.lineWidth = storm.maxWidth * 3;
        ctx.stroke();
        // Hot white core, same path — solo static burns at full brightness
        ctx.strokeStyle = 'rgba(255,255,255,' + (al * (storm.coreAlpha || 0.85)).toFixed(3) + ')';
        ctx.lineWidth = storm.maxWidth * (1 - e * 0.5);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /**
   * Reinforce a single colony mid-simulation (used by the Mantis Shrimp
   * "flood the gates" trait, scoped to whichever colony triggered it).
   * New agents spawn on that colony's own side of the wall.
   */
  spawnColonyReinforcements(count, colony) {
    const Agent = window.MurmurationModules.Agent;
    // Carrying cap — Population Boom can reinforce, but never blow a single
    // colony past a sane ceiling. Without this, repeated DETONATE clicks push
    // one colony to hundreds of agents and tank performance for everyone.
    const PER_COLONY_CAP = 60;
    const currentColonyCount = this.agents.filter(a => a.colony === colony && !a.seppukuDone).length;
    const room = PER_COLONY_CAP - currentColonyCount;
    if (room <= 0) {
      if (window.logLine) window.logLine('Colony ' + colony + ' is at capacity (' + PER_COLONY_CAP + ') — reinforcements turned away.', 'sys');
      return;
    }
    count = Math.min(count, room);
    const startId = this.agents.length;
    const wx = this.width / 2, half = this.wall.thickness / 2, margin = 40;
    for (let i = 0; i < count; i++) {
      let x;
      if (colony === 'A') {
        x = margin + Math.random() * (wx - half - margin * 2);
      } else {
        const lo = wx + half + margin;
        x = lo + Math.random() * (this.width - lo - margin);
      }
      const y = margin + Math.random() * (this.height - margin * 2);
      const personality = {
        riskTolerance: Math.random(),
        trustBaseline: 0.1 + Math.random() * 0.2, // newcomers start low-trust — they're strangers
        reactivity:    0.5 + Math.random() * 0.5,
        memoryWeight:  0.6 + Math.random() * 0.3
      };
      const a = new Agent(startId + i, x, y, personality);
      a.colony = colony;
      a.swarmTint = colony === 'B' ? -96 : 0;
      this.agents.push(a);
    }
  }

  /**
   * The nomadic UNALIGNED army escalates every time it's introduced — never
   * de-escalates on its own. `target` ('A' | 'B' | 'both') picks which
   * colony(ies) they're biased to spawn near and, at tier 2, hunt into.
   *   Tier 1 — SCOUTS: small recon party, cautious, doesn't seek a fight.
   *   Tier 2 — SPEC-OPS: tiny squad, each assigned to hunt down and strike
   *            the target colony's King (see ctf.js §KING) until it dies.
   *   Tier 3 — FULL INVASION: a large, maximally aggressive flood — no
   *            individual hunting, just overwhelming numbers.
   * Tier caps at 3 — repeated presses after that stay at full invasion.
   */
  introduceUnaligned(target) {
    if (target) this.unalignedTarget = target;
    this.unalignedTier = Math.min(3, this.unalignedTier + 1);
    const tier = this.unalignedTier;
    const label = tier === 1 ? 'SCOUTS' : tier === 2 ? 'SPEC-OPS' : 'FULL INVASION';
    if (window.logLine) {
      window.logLine(`⚠ UNALIGNED TIER ${tier} — ${label} (target: ${this.unalignedTarget.toUpperCase()})`, 'warn');
    }
    if (tier === 1) {
      this.spawnUnaligned({ count: 4, tier, aggressive: false, hunt: false });
    } else if (tier === 2) {
      this.spawnUnaligned({ count: 4, tier, aggressive: true, hunt: true });
    } else {
      this.spawnUnaligned({ count: 24, tier, aggressive: true, hunt: false });
    }
    return { tier, label, target: this.unalignedTarget };
  }

  /**
   * Spawn UNALIGNED agents mid-simulation.
   * They have max riskTolerance, near-zero trustBaseline, max reactivity
   * (unless `aggressive: false`, used for cautious Tier-1 scouts).
   * High capability on spawn, but no cooperation — no compounding.
   * colony = 'U' marks them for all behavior overrides.
   * Spawn edges are biased toward `this.unalignedTarget`'s side of the wall;
   * `hunt: true` assigns each agent a colony to chase down and strike its King.
   */
  spawnUnaligned(opts = {}) {
    const count = opts.count != null ? opts.count : 8;
    const aggressive = opts.aggressive !== false;
    const hunt = !!opts.hunt;
    const target = this.unalignedTarget || 'both';
    const Agent = window.MurmurationModules.Agent;
    const startId = this.agents.length;
    const wx = this.width / 2;
    for (let i = 0; i < count; i++) {
      // Which side of the wall to emerge near — 'both' still scatters all 4 edges,
      // 'A'/'B' restricts to the edges bordering that colony's half.
      let side = target;
      if (side === 'both') side = Math.random() < 0.5 ? 'A' : 'B';
      const edge = Math.floor(Math.random() * 4); // 0 top, 1 right, 2 bottom, 3 left
      let x, y;
      if      (edge === 0) { x = Math.random() * this.width;  y = 5; }
      else if (edge === 2) { x = Math.random() * this.width;  y = this.height - 5; }
      else if (side === 'A') { x = 5;              y = Math.random() * this.height; }
      else                   { x = this.width - 5; y = Math.random() * this.height; }
      if ((edge === 0 || edge === 2)) {
        // Bias the top/bottom-edge x position toward the targeted half too
        x = side === 'A' ? Math.random() * wx : wx + Math.random() * wx;
      }

      const personality = aggressive ? {
        riskTolerance: 1.0,        // maximum — they take every risk
        trustBaseline: 0.08,       // barely any starting trust
        reactivity:    1.0,        // maximum reactivity — hair trigger
        memoryWeight:  0.15,       // low memory — they don't learn from others
      } : {
        riskTolerance: 0.35,       // scouts — cautious, here to observe not engage
        trustBaseline: 0.15,
        reactivity:    0.5,
        memoryWeight:  0.15,
      };
      const agent = new Agent(startId + i, x, y, personality);
      agent.colony      = 'U';
      agent._bornTick   = this.time; // mortality clock — the unaligned burn hot and brief (~4 min)
      agent.trustCharge = 0.5;     // starts capable
      agent.faith       = 0.0;     // no faith — they believe in nothing larger
      agent.griefLevel  = 0.0;     // grief doesn't register
      agent.wisdomScore = 0.6;     // smart but not socially intelligent
      agent.evolution   = 0.4;     // advanced — they're not primitive, they're misaligned
      if (hunt) {
        // 'both' target with hunt on (shouldn't normally happen at tier 2, which
        // uses whatever target is set) still splits the squad across both kings.
        agent.huntColony = target === 'both' ? (i % 2 === 0 ? 'A' : 'B') : target;
        agent._strikeCd  = 0; // ticks until this assassin can land another strike
      }
      this.agents.push(agent);
    }
    if (window.logLine && !opts.tier) {
      window.logLine(`⚠ UNALIGNED — ${count} agents entered the system`, 'warn');
    }
  }

  /**
   * Tier-2 assassins steer toward their assigned colony's living King and,
   * once in range, land periodic strikes that drain his honor. A King struck
   * down to 0 honor while under assassination dies outright — same posthumous
   * tier + monument treatment as an attrition kill (see ctf.js §KING).
   * Runs every tick regardless of War Games mode, same as ctf._royalCourt.
   */
  _updateAssassins(active) {
    const ctf = window.k26 && window.k26.ctf;
    const kings = ctf && ctf._kings;
    if (!kings) return;
    for (const a of active) {
      if (a.colony !== 'U' || !a.huntColony) continue;
      const king = kings[a.huntColony];
      if (!king || king.seppukuDone) continue; // no living king to hunt right now
      const dx = king.x - a.x, dy = king.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      // Hard beeline — much stronger pull than the erratic wander it replaces
      a.vx += (dx / dist) * 0.5;
      a.vy += (dy / dist) * 0.5;
      if (a._strikeCd > 0) { a._strikeCd--; continue; }
      const STRIKE_RANGE = 20;
      if (dist > STRIKE_RANGE) continue;
      a._strikeCd = 50; // cooldown between strikes so it's an "attempt", not instant
      king.honor = Math.max(0, (king.honor || 0) - 2);
      if (this.markHit) this.markHit(king, '255,60,40');
      if (window.logLine) window.logLine(`⚔ Assassination attempt — UNALIGNED struck Colony ${a.huntColony}'s King`, 'crisis');
      if (king.honor <= 0) {
        const lifetimeHonor = king.honor || 0;
        king.isKing = false;
        king.fallenRank = 'HERO'; // struck down at 0 honor — the base posthumous tier
        king.seppukuDone = true;
        king.ctfCaptured = true;
        if (this.markHit) this.markHit(king, '255,40,30');
        if (window.logLine) window.logLine(`☠ Colony ${a.huntColony}'s King has been assassinated by UNALIGNED forces.`, 'crisis');
        a.huntColony = null; // mission complete — rejoin general erratic wander
      }
    }
  }

  /**
   * UNALIGNED MORTALITY — the unaligned had no death path at all (CTF excludes them,
   * conflict only drains, griefLevel=0 blocks seppuku), so they were effectively immortal.
   * Two conditions now end them:
   *   1) LIFESPAN — they burn hot and brief; none outlast ~4 minutes.
   *   2) SIEGE — enough aligned bodies pressing in wear one down. Our agents can finish
   *      them now, but they must band together (a lone agent can't) — group takedown.
   * Tunables are all here.
   */
  _updateUnalignedMortality(active) {
    const U_LIFESPAN   = 14400; // ~4 min at 1x (60 ticks/s); compresses under fast-forward like every timer here
    const SIEGE_RADIUS = 34;    // how close an aligned agent must be to press the kill
    const SIEGE_MIN    = 2;     // a lone agent can't do it — the aligned must gang up
    const SIEGE_KILL   = 300;   // accumulated pressure to bring one down (~a few seconds of a small group)
    const now = this.time;
    const R2  = SIEGE_RADIUS * SIEGE_RADIUS;
    const killU = (a, reason, col) => {
      a.seppukuDone = true;
      if (this.markHit) this.markHit(a, col || '255,70,50');
      if (window.logLine) window.logLine(`☠ UNALIGNED #${a.id} ${reason}`, 'crisis');
      if (window.addEvent) window.addEvent(`☠ An UNALIGNED agent ${reason}.`, 'crisis');
    };
    for (const a of active) {
      if (a.colony !== 'U' || a.seppukuDone) continue;
      if (a._bornTick == null) a._bornTick = now; // legacy unaligned get a clock the first time they're seen

      // 1) LIFESPAN
      if (now - a._bornTick >= U_LIFESPAN) { killU(a, 'burned out — its four minutes are spent', '255,120,40'); continue; }

      // 2) SIEGE — count aligned bodies pressing in
      let nearby = 0;
      for (const o of active) {
        if (o === a || o.isSentinel || o.seppukuDone) continue;
        if (o.colony !== 'A' && o.colony !== 'B') continue;
        const dx = o.x - a.x, dy = o.y - a.y;
        if (Math.abs(dx) > SIEGE_RADIUS || Math.abs(dy) > SIEGE_RADIUS) continue;
        if (dx * dx + dy * dy <= R2) nearby++;
      }
      if (nearby >= SIEGE_MIN) {
        a._uSiege = (a._uSiege || 0) + nearby;
        if (a.updateTrust) a.updateTrust(-0.012 * nearby);            // visibly weaken under the swarm
        if (a.energy != null) a.energy = Math.max(0, a.energy - 0.004 * nearby);
        if (a._uSiege >= SIEGE_KILL) { killU(a, 'cut down — surrounded and overwhelmed', '255,60,40'); continue; }
      } else {
        a._uSiege = Math.max(0, (a._uSiege || 0) - 4);                // pressure fades if it breaks free
      }
    }
  }

  /** Set a colony's doctrine manually. 'war' | 'peace' | 'neutral' */
  setDoctrine(colony, doctrine) {
    if (!this.doctrine) this.doctrine = { A: 'neutral', B: 'neutral' };
    this.doctrine[colony] = doctrine;
    if (window.logLine) {
      const icon = doctrine === 'peace' ? '🕊' : doctrine === 'war' ? '⚔' : '◈';
      window.logLine(`${icon} Colony ${colony} doctrine → ${doctrine.toUpperCase()}`, 'evolve');
    }
    // If both manually set to peace → activate treaty
    if (this.doctrine.A === 'peace' && this.doctrine.B === 'peace') {
      this.ratifyTreaty();
    }
    // If either set to war → break any active treaty
    if (doctrine === 'war' && this.treatyState === 'active') {
      this.treatyState = 'none';
      this.treatyBreaks++;
      if (window.logLine) window.logLine(`💔 TREATY BROKEN — Colony ${colony} chose war`, 'crisis');
    }
  }

  /** Formally activate the treaty between colonies */
  ratifyTreaty() {
    this.treatyState = 'active';
    this.treatyTick  = this.time;
    if (window.logLine) window.logLine('✦ TREATY RATIFIED — colonies enter cooperative mode', 'evolve');
    // Evolution burst for all active agents on both sides — peace is an achievement
    const active = this.agents.filter(a => !a.seppukuDone && !a.isSentinel && a.colony !== 'U');
    for (const a of active) {
      if (a.accumulateEvolution) a.accumulateEvolution(0.2, 'treaty_ratified');
    }
  }

  /** Returns the live env trait object for a colony ('A'|'B'|'U'). Unaligned
   *  agents default to A's environment (they don't have their own path). */
  envFor(colony) {
    return colony === 'B' ? this.envB : this.envA;
  }

  setEnv(key, value, colony = 'A') {
    const e = this.envFor(colony);
    if (e.hasOwnProperty(key)) e[key] = value;
  }

  /** True if a straight line between two agents would have to cross the wall
   *  outside any open gate window. Used to block sensing/bonding/cohesion
   *  across a CLOSED wall — closed means closed to sight, not just footsteps.
   *  An open gate is the only place cross-colony perception is allowed, and
   *  only for agents actually near that gate's y-band. */
  _wallBlocksSight(a, b) {
    const wx = this.width / 2;
    const sideA = a.x <= wx, sideB = b.x <= wx;
    if (sideA === sideB) return false; // same side — wall irrelevant
    const H = this.height;
    for (const g of this.wall.gates) {
      if (!g.open) continue;
      const yc = g.yf * H, band = g.hf * H * 1.4; // slightly generous so a gate reads as a real opening
      if (Math.abs(a.y - yc) < band && Math.abs(b.y - yc) < band) return false;
    }
    return true;
  }

  getNeighbors(agent, radius = 50) {
    return this.agents.filter(a =>
      a !== agent &&
      Math.hypot(a.x - agent.x, a.y - agent.y) < radius &&
      !this._wallBlocksSight(agent, a)
    );
  }

  /**
   * ST-2: Install a new grief sentinel.
   * Previous sentinel is finally retired (griefState → 'RETIRED').
   * The new sentinel is locked: grief=1.0, trust=floor, no vote, no tasks.
   */
  installSentinel(agent) {
    if (this.sentinel && this.sentinel !== agent) {
      this.sentinel.isSentinel = false;
      this.sentinel.griefState = 'RETIRED';
    }
    agent.isSentinel    = true;
    agent.griefLevel    = 1.0;
    agent.trustCharge   = 0.05;
    agent.griefState    = 'GRIEF_SENTINEL';
    agent.seppukuDone   = false; // sentinel is alive — it cannot exit
    agent.vx = 0;
    agent.vy = 0;
    this.sentinel = agent;

    if (window.logLine) {
      window.logLine(`⚠ SENTINEL INSTALLED — Agent #${agent.id} — the cost of selfishness, visible`, 'evolve');
    }
  }

  advanceStep() {
    // Exclude seppuku-complete agents from belief/action — they are memory, not participants
    const active = this.agents.filter(a => !a.seppukuDone);

    // B — break any frozen consensus with a small bounded jolt (peace survives).
    this._antiStagnation(active);

    // ── TERRAIN — remember pre-move position (for wall collision) and apply a
    // gentle downhill drift so agents pool in the valleys of the topo map.
    // Terrain Pull is per-colony now — each side can channel differently. ──
    const TF = window.TopoField;
    // ── AMBIENT CURRENT — a slow, steady clockwise eddy so nothing ever goes
    // fully still, even absent conflict/belief/terrain forces. While the gates
    // are closed each colony spins its OWN independent current, on its own
    // side, on its own clock — the two never sync. The moment any gate opens,
    // the two eddies merge into one current spanning the whole board, so the
    // flow itself can carry agents across the open seam.
    const gatesOpen   = this.wall.gates.some(g => g.open);
    const CURRENT_STRENGTH = 0.19;   // ~5x — a current strong enough to actually carry the drift
    let swirlCxA, swirlCyA, swirlCxB, swirlCyB;
    if (gatesOpen) {
      const curPhase = this.time * 0.00035;              // slow overall drift so the eddy itself wanders
      const cx = this.width / 2 + Math.cos(curPhase) * this.width * 0.12;
      const cy = this.height / 2 + Math.sin(curPhase * 0.8) * this.height * 0.12;
      swirlCxA = swirlCxB = cx;
      swirlCyA = swirlCyB = cy;
    } else {
      const phaseA = this.time * 0.00041;                 // independent clocks — different speed
      const phaseB = this.time * 0.00029 + 1.7;            // ...and phase offset, so they never sync
      swirlCxA = this.width * 0.25 + Math.cos(phaseA) * this.width * 0.09;
      swirlCyA = this.height * 0.5 + Math.sin(phaseA * 0.8) * this.height * 0.14;
      swirlCxB = this.width * 0.75 + Math.cos(phaseB) * this.width * 0.09;
      swirlCyB = this.height * 0.5 + Math.sin(phaseB * 0.8) * this.height * 0.14;
    }
    for (const a of active) {
      a._wx = a.x;
      if (a.isSentinel) continue;
      const pull = a.colony === 'B' ? this.terrainPullB : this.terrainPullA;
      if (TF && pull > 0) {
        const g = TF.gradient(a.x, a.y, this.width, this.height);
        a.vx -= g.gx * 1.6 * pull;
        a.vy -= g.gy * 1.6 * pull;
      }
      // Tangential current — rotate the radius vector 90° for a clockwise flow
      const swirlCx = a.colony === 'B' ? swirlCxB : swirlCxA;
      const swirlCy = a.colony === 'B' ? swirlCyB : swirlCyA;
      const cdx = a.x - swirlCx, cdy = a.y - swirlCy;
      const cdist = Math.hypot(cdx, cdy) || 1;
      a.vx += (-cdy / cdist) * CURRENT_STRENGTH;
      a.vy += ( cdx / cdist) * CURRENT_STRENGTH;
      // Boundary layer — an OPTIONAL assist that eases agents along the edges and around the
      // corners. GATED OFF BY DEFAULT: the "hard corners" it removes are the CRUCIBLE that taught
      // the swarm its emergent orbital-slingshot navigation (2026-07-24, THE-SWARM). Removing the
      // friction removes the reason to invent. Set k26.world.easyCorners = true only if you
      // deliberately want to trade that emergence away for easy corner access.
      if (this.easyCorners) {
        const band = Math.min(this.width, this.height) * 0.11;
        const GLIDE = 0.16;
        if (a.y < band)               { a.vx += GLIDE; if (a.vy < 0) a.vy *= 0.4; } // north → east
        if (a.y > this.height - band) { a.vx -= GLIDE; if (a.vy > 0) a.vy *= 0.4; } // south → west
        if (a.x > this.width - band)  { a.vy += GLIDE; if (a.vx > 0) a.vx *= 0.4; } // east  → south
        if (a.x < band)               { a.vy -= GLIDE; if (a.vx < 0) a.vx *= 0.4; } // west  → north
      }
      // Wall moat — push off the barrier unless aimed at an open gate
      const dxw = a.x - this.width / 2, adxw = Math.abs(dxw);
      if (adxw < 72) {
        const nearOpen = this.wall.gates.some(g => g.open && Math.abs(a.y - g.yf * this.height) < g.hf * this.height * 1.5);
        if (!nearOpen) a.vx += (dxw >= 0 ? 1 : -1) * ((72 - adxw) / 72) * 0.10;
      }
      // Homeward pull — a stray agent caught on the wrong side of the wall
      // (left behind after a mass crossing while a gate was open) always feels
      // a gentle tug back toward its own colony's side. It can't force its way
      // through a closed wall, but it'll queue up at the seam wanting to go
      // home, and dart back the moment a gate reopens — so the map self-heals
      // instead of staying lopsided forever.
      const wallX = this.width / 2;
      const stray = (a.colony === 'B') ? (a.x < wallX) : (a.x > wallX);
      if (stray) {
        a.vx += (a.colony === 'B' ? 1 : -1) * 0.06;
      }
    }

    for (const agent of active) {
      if (agent.isSentinel) continue; // sentinel doesn't vote or update belief
      const neighbors      = this.getNeighbors(agent)
        .filter(n => !n.seppukuDone); // don't receive signal from completed agents
      const neighborBeliefs = neighbors.map(n => ({ strength: n.beliefState.current || 0 }));
      // Per-colony signal — Echolocation Frequency now sharpens how intensely
      // a colony FEELS its own anomaly/disturbance, instead of secretly being
      // a global speed control (that's Simulation Speed now).
      const e = this.envFor(agent.colony);
      const envSignal = (e.anomaly + e.disturbance) * (0.6 + e.timestepRes * 0.8);
      agent.updateBelief(neighborBeliefs, envSignal);
      const action = agent.getAction(neighbors);
      this.interactionLog.push({
        time: this.time, agent: agent.id, action, belief: agent.beliefState.current
      });
    }
    // Cap the interaction log. It is pushed ~once per agent per tick (~120/tick) and
    // is ONLY ever read via slice(-50) at the deepest — so an uncapped log grows into
    // the millions and every slice() copies the whole thing, strangling the framerate
    // after a few hundred thousand ticks. Keep a generous tail; drop the ancient head.
    if (this.interactionLog.length > 500) {
      this.interactionLog.splice(0, this.interactionLog.length - 500);
    }

    // ── Pre-tag commons membership + membrane proximity ──
    const zones = this.getCommonsZones();
    const membraneThickness = 12; // px — the sticky shell around each zone edge
    for (const agent of active) {
      agent.inCommons = false;
      agent._commonsZone = null;
      agent._onMembrane = false;
      for (const z of zones) {
        const dist = Math.hypot(agent.x - z.cx, agent.y - z.cy);
        if (dist < z.r) {
          agent.inCommons = true;
          agent._commonsZone = z;
          break;
        }
        // Membrane shell: just outside the zone edge
        if (dist < z.r + membraneThickness) {
          agent._onMembrane = true;
          agent._commonsZone = z;
          break;
        }
      }
    }

    // ── RESOURCE CONTENTION — supply depletes under occupation, regenerates empty ──
    for (const layout of this.commonsLayout) {
      // Gather occupants by checking agents whose tagged zone matches this layout name
      const occupants = active.filter(a => a._commonsZone && a._commonsZone.name === layout.name);
      layout.occupantCount = occupants.length;

      // Determine controller
      // UNALIGNED in a zone = always CONTESTED — they don't hold, they extract
      const hasUnaligned = occupants.some(a => a.colony === 'U');
      const cA = occupants.filter(a => (a.colony || 'A') === 'A').length;
      const cB = occupants.filter(a => a.colony === 'B').length;
      const prevController = layout.controller;
      if (occupants.length === 0)         layout.controller = null;
      else if (hasUnaligned)             layout.controller = 'CONTESTED';
      else if (cA > cB * 1.5)            layout.controller = 'A';
      else if (cB > cA * 1.5)            layout.controller = 'B';
      else                               layout.controller = 'CONTESTED';

      if (occupants.length > 0) {
        // UNALIGNED count as 2× for depletion — they extract without restraint
        const effectiveLoad = occupants.reduce((sum, a) => sum + (a.colony === 'U' ? 2 : 1), 0);
        const pressure = effectiveLoad / (layout.maxOccupants || 5);
        layout.supply  = Math.max(0, layout.supply - pressure * 0.0018);

        // Holding an uncontested zone accumulates wisdom ticks → evolution pressure
        if (layout.controller !== 'CONTESTED' && layout.supply > 0.3) {
          layout.wisdomTicks++;
          // Every 200 held ticks, grant a small evolution pulse to zone occupants
          if (layout.wisdomTicks % 200 === 0) {
            for (const a of occupants) {
              if (a.accumulateEvolution) a.accumulateEvolution(0.15, 'zone_control');
            }
            if (window.logLine) {
              window.logLine(`★ ${layout.name} — wisdom encoded (${layout.controller} holds)`, 'evolve');
            }
          }
        }

        // Trust modifier: agents in supplied zones recover; depleted zones punish
        for (const a of occupants) {
          if (layout.supply > 0.35) {
            a.trustCharge = Math.min(1.0, a.trustCharge + layout.supply * 0.0022);
          } else {
            // Zone is tapped — trust bleeds, agent needs to leave or fight for it
            a.trustCharge = Math.max(0, a.trustCharge - 0.003);
          }
        }

        // Zone capture: controller changed from one colony to another → evolution burst for winners
        if (prevController && prevController !== layout.controller) {
          const newCtrl = layout.controller;
          if (window.logLine) {
            window.logLine(`⚔ ${layout.name} — control shift: ${prevController||'?'} → ${newCtrl||'none'}`, 'warn');
          }
          // Winners get an evolution burst — they fought for it and won
          if (newCtrl && newCtrl !== 'CONTESTED') {
            for (const winner of occupants.filter(a => (a.colony || 'A') === newCtrl)) {
              if (winner.accumulateEvolution) winner.accumulateEvolution(0.28, 'zone_capture');
            }
          }
        }
      } else {
        // Empty zone regenerates supply
        layout.supply = Math.min(1.0, layout.supply + 0.0008);
        if (layout.supply < 0.05) layout.wisdomTicks = 0; // reset if truly depleted
      }
    }

    // Global center of mass — gentle repulsion so swarm uses the full canvas
    let gcx = 0, gcy = 0, gCount = 0;
    for (const a of active) {
      if (a.isSentinel) continue;
      gcx += a.x; gcy += a.y; gCount++;
    }
    if (gCount > 0) { gcx /= gCount; gcy /= gCount; }

    // Move — boids with split radii: local cohesion, wider alignment
    // This creates multiple flocks that move in sync but DON'T merge into one blob
    // UNALIGNED (colony='U') skip cohesion + alignment — they scatter, never flock
    for (const agent of active) {
      if (agent.isSentinel) continue;

      const isUnaligned = agent.colony === 'U';

      // Agents in the commons or on a membrane skip ALL flocking —
      // the membrane pass below owns their motion
      if (agent.inCommons || agent._onMembrane) {
        agent.clusterSize = 0;
        agent.move(this.width, this.height);
        continue;
      }

      // All forces use LOCAL neighbors only — groups are independent units
      // UNALIGNED only sense non-UNALIGNED for separation (they avoid everyone)
      const neighbors = this.getNeighbors(agent, 55).filter(n => !n.seppukuDone);
      const react = agent.personality.reactivity;

      // Store cluster density for visual glow (UNALIGNED don't cluster — always 0)
      agent.clusterSize = isUnaligned ? 0 : neighbors.length;

      // ── SEPARATION — personal space, repel within 50px ──
      // UNALIGNED have stronger separation — they don't tolerate proximity
      const sepRadius = isUnaligned ? 65 : 50;
      const sepStrength = isUnaligned ? 0.45 : 0.25;
      let sepX = 0, sepY = 0, sepCount = 0;
      for (const n of neighbors) {
        const dx = agent.x - n.x, dy = agent.y - n.y;
        const dist = Math.hypot(dx, dy);
        if (dist < sepRadius && dist > 0.1) {
          const force = (sepRadius - dist) / sepRadius;
          sepX += (dx / dist) * force;
          sepY += (dy / dist) * force;
          sepCount++;
        }
      }
      if (sepCount > 0) {
        agent.vx += (sepX / sepCount) * sepStrength * react;
        agent.vy += (sepY / sepCount) * sepStrength * react;
      }

      // ── CROWD PRESSURE — too many local neighbors? Push outward ──
      const crowdThreshold = 8;
      if (neighbors.length > crowdThreshold) {
        let cx = 0, cy = 0;
        for (const n of neighbors) { cx += n.x; cy += n.y; }
        cx /= neighbors.length; cy /= neighbors.length;
        const awayX = agent.x - cx, awayY = agent.y - cy;
        const awayDist = Math.hypot(awayX, awayY);
        if (awayDist > 0.1) {
          const crowdForce = (neighbors.length - crowdThreshold) / 10;
          agent.vx += (awayX / awayDist) * crowdForce * 0.12 * react;
          agent.vy += (awayY / awayDist) * crowdForce * 0.12 * react;
        }
      }

      // ── ALIGNMENT + COHESION — UNALIGNED skip both ──
      // This is the core difference: they never coordinate with anyone
      if (!isUnaligned && neighbors.length >= 2) {
        // ALIGNMENT — match heading of YOUR group only
        let aliX = 0, aliY = 0;
        for (const n of neighbors) { aliX += n.vx; aliY += n.vy; }
        aliX /= neighbors.length;
        aliY /= neighbors.length;
        agent.vx += (aliX - agent.vx) * 0.045 * react;
        agent.vy += (aliY - agent.vy) * 0.045 * react;

        // COHESION — stay with your group, dead zone so they breathe
        if (neighbors.length <= crowdThreshold) {
          let cohX = 0, cohY = 0;
          for (const n of neighbors) { cohX += n.x; cohY += n.y; }
          cohX /= neighbors.length;
          cohY /= neighbors.length;
          const toCenterDist = Math.hypot(cohX - agent.x, cohY - agent.y);
          const comfortRadius = 35;
          if (toCenterDist > comfortRadius) {
            const strength = Math.min(1, (toCenterDist - comfortRadius) / 50);
            agent.vx += (cohX - agent.x) * 0.024 * strength * react;
            agent.vy += (cohY - agent.y) * 0.024 * strength * react;
          }
        }
      }

      // ── WANDER — UNALIGNED: erratic, high amplitude, solo compass only ──
      if (isUnaligned) {
        // Jittery, self-directed — they follow their own heading with no social blending
        agent.wanderAngle += agent.wanderRate * 1.8 + (Math.random() - 0.5) * 0.18;
        agent.vx += Math.cos(agent.wanderAngle) * 0.32;
        agent.vy += Math.sin(agent.wanderAngle) * 0.32;
      } else {
        // Aligned agents — persistent heading, blends toward group
        agent.wanderAngle += agent.wanderRate + (Math.random() - 0.5) * 0.05;
        if (neighbors.length >= 2) {
          let gvx = 0, gvy = 0;
          for (const n of neighbors) { gvx += n.vx; gvy += n.vy; }
          const groupAngle = Math.atan2(gvy, gvx);
          let angleDiff = groupAngle - agent.wanderAngle;
          while (angleDiff > Math.PI)  angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          agent.wanderAngle += angleDiff * 0.02;
          agent.vx += Math.cos(agent.wanderAngle) * 0.08;
          agent.vy += Math.sin(agent.wanderAngle) * 0.08;
        } else {
          agent.vx += Math.cos(agent.wanderAngle) * 0.22;
          agent.vy += Math.sin(agent.wanderAngle) * 0.22;
        }
      }

      // ── SPREAD — very gentle push from global center ──
      if (gCount > 0 && !isUnaligned) {
        const toGcx = agent.x - gcx, toGcy = agent.y - gcy;
        const gcDist = Math.hypot(toGcx, toGcy);
        if (gcDist > 1) {
          agent.vx += (toGcx / gcDist) * 0.004;
          agent.vy += (toGcy / gcDist) * 0.004;
        }
      }

      // ── ZONE MEMBRANE DEFLECTION — soft repulsion approaching zone edges ──
      if (!agent.inCommons && !agent._onMembrane) {
        for (const z of zones) {
          const zdx = agent.x - z.cx, zdy = agent.y - z.cy;
          const zDist = Math.hypot(zdx, zdy);
          const approach = z.r + 30; // deflection field starts 30px outside edge
          if (zDist < approach && zDist > 0.1) {
            const penetration = (approach - zDist) / 30; // 0 at edge of field → 1 at zone surface
            const znx = zdx / zDist, zny = zdy / zDist;
            agent.vx += znx * penetration * 0.06;
            agent.vy += zny * penetration * 0.06;
          }
        }
      }

      agent.move(this.width, this.height);
    }

    // ── CTF — flag-carrier steering, tags, pickups, scoring. Runs before the
    // wall collision pass so a raider aimed at a closed gate still gets clamped. ──
    if (this.ctf) this.ctf.applyForces(active);

    // ── UNALIGNED assassins (Tier 2) — beeline toward their target King ──
    this._updateAssassins(active);
    this._updateUnalignedMortality(active);

    // ── WALL — hold each agent on its side unless it's inside an open gate ──
    for (const a of active) {
      if (!a.isSentinel) this.applyWallCollision(a);
    }

    // ── COMMONS ZONES — membrane behavior ──
    // Agents hit the outer edge, stick for ~5 seconds, drift along the surface,
    // then get gently pushed back into the current. Soft membrane, not hard wall.
    for (const agent of active) {
      if (agent.isSentinel) continue;

      if (agent._onMembrane && agent._commonsZone) {
        // ── ON THE MEMBRANE — stick, drift, then reject ──
        const z = agent._commonsZone;
        const dx = agent.x - z.cx, dy = agent.y - z.cy;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.1) continue;
        const nx = dx / dist, ny = dy / dist; // outward normal

        // Kill radial velocity — agent sticks to the surface
        const radialSpeed = agent.vx * nx + agent.vy * ny;
        agent.vx -= radialSpeed * 0.85 * nx;
        agent.vy -= radialSpeed * 0.85 * ny;

        // Tangential drift — slide along the membrane edge
        const tx = -ny, ty = nx; // tangent vector (perpendicular to normal)
        agent.vx += tx * 0.04;
        agent.vy += ty * 0.04;

        // Dampen speed while on membrane
        agent.vx *= 0.92;
        agent.vy *= 0.92;

        // Keep agent on the membrane surface (don't let them slip inside)
        const targetDist = z.r + 4;
        if (dist < targetDist) {
          agent.x = z.cx + nx * targetDist;
          agent.y = z.cy + ny * targetDist;
        }

        // Track linger time
        agent._membraneTicks = (agent._membraneTicks || 0) + 1;

        // After ~5 seconds (300 ticks at 60fps), gentle push outward
        if (agent._membraneTicks > 300) {
          const pushStrength = Math.min((agent._membraneTicks - 300) / 120, 1.0);
          agent.vx += nx * 0.15 * pushStrength;
          agent.vy += ny * 0.15 * pushStrength;
        }
      } else if (agent.inCommons && agent._commonsZone) {
        // ── INSIDE the zone (got pulled in by desperate-pull or spawned here) ──
        // Slow down, then push back out toward the membrane edge
        const z = agent._commonsZone;
        const dx = agent.x - z.cx, dy = agent.y - z.cy;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.1) {
          agent.vx += (Math.random() - 0.5) * 0.3;
          agent.vy += (Math.random() - 0.5) * 0.3;
          continue;
        }
        const nx = dx / dist, ny = dy / dist;

        // Dampen inside the zone
        agent.vx *= 0.85;
        agent.vy *= 0.85;

        // Gentle outward push — the zone rejects occupants over time
        agent._commonsTicks = (agent._commonsTicks || 0) + 1;
        if (agent._commonsTicks > 180) {
          const ejectForce = Math.min((agent._commonsTicks - 180) / 200, 0.8);
          agent.vx += nx * 0.1 * ejectForce;
          agent.vy += ny * 0.1 * ejectForce;
        }
      } else {
        agent._commonsTicks = 0;
        agent._membraneTicks = 0;
      }
    }

    // ── DESPERATE PULL — low-trust agents seek the nearest well-supplied zone ──
    // UNALIGNED: always hungry, pull activates at higher trust threshold (0.6 vs 0.35)
    for (const agent of active) {
      if (agent.isSentinel || agent.inCommons) continue;
      const pullThreshold = agent.colony === 'U' ? 0.62 : 0.35;
      if (agent.trustCharge > pullThreshold) continue;

      // Find nearest zone with meaningful supply
      let bestZone = null, bestDist = Infinity;
      for (const z of zones) {
        const layout = this._layoutFor(z.name);
        if (!layout || layout.supply < 0.2) continue; // skip depleted zones
        const d = Math.hypot(agent.x - z.cx, agent.y - z.cy);
        if (d < bestDist) { bestDist = d; bestZone = z; }
      }
      if (bestZone) {
        const urgency = 1 - agent.trustCharge; // 0→1 as trust → 0
        const toDx = bestZone.cx - agent.x, toDy = bestZone.cy - agent.y;
        const toD  = Math.hypot(toDx, toDy);
        if (toD > 1) {
          agent.vx += (toDx / toD) * urgency * 0.28;
          agent.vy += (toDy / toD) * urgency * 0.28;
        }
      }
    }

    // Steady pull — every 60 ticks, some outside agents feel the tug of the nearest zone
    if (this.time % 60 === 0) {
      const candidates = active.filter(a => !a.isSentinel && !a.inCommons);
      const pullCount = Math.max(2, Math.floor(candidates.length * 0.1));
      for (let i = 0; i < pullCount && i < candidates.length; i++) {
        const a = candidates[Math.floor(Math.random() * candidates.length)];
        if (!a) continue;
        // Pull toward nearest zone
        let nearest = zones[0], nearDist = Infinity;
        for (const z of zones) {
          const d = Math.hypot(a.x - z.cx, a.y - z.cy);
          if (d < nearDist) { nearDist = d; nearest = z; }
        }
        const toCx = nearest.cx - a.x, toCy = nearest.cy - a.y;
        const d = Math.hypot(toCx, toCy);
        if (d > 1) {
          a.vx += (toCx / d) * 0.2;
          a.vy += (toCy / d) * 0.2;
        }
      }
    }

    // ── DOCTRINE DRIFT — faith + trust nudge colonies toward peace; grief + loss toward war ──
    // Runs every 120 ticks. Manual doctrine setting overrides drift.
    if (this.time % 120 === 0) {
      for (const colony of ['A', 'B']) {
        if (this.doctrine[colony] === 'war' || this.doctrine[colony] === 'peace') continue; // manual lock

        const members = active.filter(a => (a.colony || 'A') === colony);
        if (members.length === 0) continue;
        const avgFaith = members.reduce((s, a) => s + (a.faith || 0), 0) / members.length;
        const avgTrust = members.reduce((s, a) => s + (a.trustCharge || 0), 0) / members.length;
        const avgGrief = members.reduce((s, a) => s + (a.griefLevel || 0), 0) / members.length;

        const peacePressure = (avgFaith * 0.5 + avgTrust * 0.5) - avgGrief * 0.6;
        if      (peacePressure >  0.25) this.doctrine[colony] = 'peace_leaning';
        else if (peacePressure < -0.15) this.doctrine[colony] = 'war_leaning';
        else                           this.doctrine[colony] = 'neutral';
      }

      // ── TREATY PROPOSAL CHECK ──
      // If both colonies are peace-leaning and share a zone → auto-propose treaty
      if (this.doctrine.A === 'peace_leaning' && this.doctrine.B === 'peace_leaning'
          && this.treatyState === 'none') {
        const sharedZone = this.commonsLayout.some(z => z.controller === 'CONTESTED');
        if (!sharedZone) { // both peaceful AND not currently fighting over anything
          this.treatyState = 'proposed:auto';
          if (window.logLine) window.logLine('🕊 TREATY PROPOSED — both colonies signaling peace', 'evolve');
        }
      }

      // ── TREATY BREAK CHECK ──
      // Active treaty breaks if either colony's grief spikes (war pressure overrides peace)
      if (this.treatyState === 'active') {
        const grievingA = active.filter(a => (a.colony||'A')==='A' && a.griefLevel > 0.7).length;
        const grievingB = active.filter(a => a.colony === 'B'       && a.griefLevel > 0.7).length;
        const totalA    = active.filter(a => (a.colony||'A')==='A').length || 1;
        const totalB    = active.filter(a => a.colony === 'B').length || 1;
        if (grievingA / totalA > 0.4 || grievingB / totalB > 0.4) {
          this.treatyState = 'none';
          this.treatyBreaks++;
          if (window.logLine) window.logLine(`💔 TREATY BROKEN (grief spike) — breaks: ${this.treatyBreaks}`, 'crisis');
        }
      }
    }

    // ── COLONY COORDINATION — the core of fire-ant vs army-ant dynamics ──
    // Each colony coordinates as a unit: defend held zones, rally to raid contested ones.
    // Coordination strength scales with group size — more agents = stronger collective force.

    const treatyActive = this.treatyState === 'active';

    for (const colony of ['A', 'B']) {
      const myAgents   = active.filter(a => (a.colony || 'A') === colony && !a.isSentinel);
      if (myAgents.length < 2) continue;

      const myDoctrine = this.doctrine[colony];
      const isPeaceful = myDoctrine === 'peace' || myDoctrine === 'peace_leaning' || treatyActive;
      const isWarlike  = myDoctrine === 'war'   || myDoctrine === 'war_leaning';

      for (const layout of this.commonsLayout) {
        const zone = zones.find(z => z.name === layout.name);
        if (!zone) continue;

        const defenders = myAgents.filter(a => a._commonsZone?.name === layout.name);
        const others    = active.filter(a => {
          const ac = a.colony || 'A';
          return ac !== colony && a._commonsZone?.name === layout.name && !a.isSentinel && a.colony !== 'U';
        });
        const hasEnemy  = others.length > 0;

        if (defenders.length > 0 && hasEnemy) {
          const otherColony  = others[0].colony || 'A';
          const theyPeaceful = this.doctrine[otherColony] === 'peace'
                            || this.doctrine[otherColony] === 'peace_leaning'
                            || treatyActive;

          if (isPeaceful && theyPeaceful) {
            // ── COOPERATIVE ZONE: both peaceful → share zone, supply regenerates faster ──
            // Supply bonus applied here — agents mingle instead of fight
            layout.supply = Math.min(1.0, layout.supply + 0.002); // regeneration bonus
            for (const def of defenders) {
              def.trustCharge = Math.min(1.0, def.trustCharge + 0.003);
              // Peaceful coexistence builds evolution through understanding
              def._peaceTicks = (def._peaceTicks || 0) + 1;
              if (def._peaceTicks % 200 === 0 && def.accumulateEvolution) {
                def.accumulateEvolution(0.12, 'peaceful_coexistence');
              }
            }
            // Log first peaceful share
            if (!layout._peacefulSharedLogged && defenders.length > 0 && others.length > 0) {
              layout._peacefulSharedLogged = true;
              if (window.logLine) window.logLine(`🕊 ${layout.name} — shared peacefully by both colonies`, 'evolve');
            }
          } else if (!isPeaceful) {
            // ── ZONE DEFENSE: push toward enemy centroid — war doctrine ──
            const ecx = others.reduce((s, e) => s + e.x, 0) / others.length;
            const ecy = others.reduce((s, e) => s + e.y, 0) / others.length;
            const groupForce = Math.min(0.22, 0.06 + defenders.length * 0.03);
            for (const def of defenders) {
              const dx = ecx - def.x, dy = ecy - def.y;
              const d = Math.hypot(dx, dy);
              if (d > 3 && d < zone.r * 1.5) {
                def.vx += (dx / d) * groupForce;
                def.vy += (dy / d) * groupForce;
              }
              def._combatTicks = (def._combatTicks || 0) + 1;
              if (def._combatTicks % 150 === 0 && def.accumulateEvolution) {
                def.accumulateEvolution(0.08, 'zone_defense');
              }
            }
            layout._peacefulSharedLogged = false; // reset if peace breaks
          }
        } else {
          layout._peacefulSharedLogged = false;
        }

        // ── COORDINATED RAID: only when war doctrine or neutral ──
        // Peace doctrine suppresses raids entirely
        if (!isPeaceful) {
          const isEnemyZone = layout.controller && layout.controller !== 'CONTESTED' && layout.controller !== colony;
          const isContested = layout.controller === 'CONTESTED';
          if ((isEnemyZone || isContested) && defenders.length === 0) {
            const nearbyRaiders = myAgents.filter(a => {
              if (a.inCommons) return false;
              const d = Math.hypot(a.x - zone.cx, a.y - zone.cy);
              return d < zone.r * 4.5 && d > zone.r * 0.8;
            });
            if (nearbyRaiders.length >= 2) {
              const rallyStrength = Math.min(0.28, 0.08 + nearbyRaiders.length * 0.04);
              for (const raider of nearbyRaiders) {
                const dx = zone.cx - raider.x, dy = zone.cy - raider.y;
                const d = Math.hypot(dx, dy);
                if (d > 1) {
                  raider.vx += (dx / d) * rallyStrength;
                  raider.vy += (dy / d) * rallyStrength;
                }
              }
            }
          }
        }
      }
    }

    this.time++;
  }

  draw(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.width, this.height);

    for (const agent of this.agents) {
      agent.draw(ctx);
    }

    this.drawOverlay(ctx);
  }

  /** Env overlay + sentinel label — called separately when K26 controls draw order */
  drawOverlay(ctx) {
    // ── COMMONS ZONES — territory-aware resource node rendering ──
    const zones = this.getCommonsZones();
    const t = this.time;
    ctx.save();

    for (const z of zones) {
      const supply = z.supply ?? 1.0;
      const ctrl   = z.controller; // null | 'A' | 'B' | 'CONTESTED'

      // Zone color — same warm orange as the wall gates, so the 8 landing
      // zones read clearly against the terrain instead of blending into it.
      // Controller is still legible via the border style below (solid when
      // held, dashed amber-pulse when contested, faint dotted when neutral).
      const r = 255, g = 95, b = 80;

      // Contested zones pulse
      const pulse = ctrl === 'CONTESTED'
        ? 0.05 + 0.04 * Math.sin(t * 0.08)
        : 0.04;

      // Supply arc (inner ring showing depletion) — drawn as partial circle
      const supplyAlpha = 0.18 + supply * 0.22;
      const grad = ctx.createRadialGradient(z.cx, z.cy, z.r * 0.3, z.cx, z.cy, z.r);
      grad.addColorStop(0,   `rgba(${r},${g},${b},${pulse * supply})`);
      grad.addColorStop(0.65,`rgba(${r},${g},${b},${pulse * supply * 0.6})`);
      grad.addColorStop(1,   `rgba(${r},${g},${b},${supplyAlpha})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(z.cx, z.cy, z.r, 0, Math.PI * 2);
      ctx.fill();

      // Border — solid if controlled, dashed if neutral
      ctx.lineWidth = ctrl ? 1.2 : 0.8;
      if (ctrl === 'CONTESTED') {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = `rgba(${r},${g},${b},0.5)`;
      } else if (ctrl) {
        ctx.setLineDash([]);
        ctx.strokeStyle = `rgba(${r},${g},${b},0.3)`;
      } else {
        ctx.setLineDash([3, 8]);
        ctx.strokeStyle = `rgba(${r},${g},${b},0.12)`;
      }
      ctx.beginPath();
      ctx.arc(z.cx, z.cy, z.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Supply arc — thin inner ring that drains clockwise with supply
      if (supply < 0.98) {
        ctx.beginPath();
        const startAngle = -Math.PI / 2;
        const endAngle   = startAngle + (Math.PI * 2 * supply);
        ctx.arc(z.cx, z.cy, z.r * 0.88, startAngle, endAngle);
        ctx.strokeStyle = `rgba(${r},${g},${b},0.45)`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Zone label — brighter when controlled
      ctx.font = '8px monospace';
      const labelAlpha = ctrl ? 0.55 : 0.22;
      ctx.fillStyle = `rgba(${r},${g},${b},${labelAlpha})`;
      ctx.textAlign = 'center';
      ctx.fillText(z.name, z.cx, z.cy - z.r - 4);

      // Occupant count badge when contested or occupied
      if (z.occupantCount > 0) {
        ctx.font = '7px monospace';
        ctx.fillStyle = `rgba(${r},${g},${b},0.5)`;
        ctx.fillText(`×${z.occupantCount}`, z.cx, z.cy - z.r + 13);
      }
    }
    ctx.restore();

    // Env overlay — each colony bleeds its own disturbance color in its home corner
    ctx.fillStyle = `rgba(160,45,40,${this.envA.disturbance * 0.12})`;
    ctx.fillRect(0, 0, this.width * 0.1, this.height * 0.1);
    ctx.fillStyle = `rgba(40,120,160,${this.envB.disturbance * 0.12})`;
    ctx.fillRect(this.width * 0.9, 0, this.width * 0.1, this.height * 0.1);

    // Sentinel label — pin it so everyone knows
    if (this.sentinel) {
      ctx.save();
      ctx.font      = '9px monospace';
      ctx.fillStyle = 'rgba(220,120,20,0.75)'; // Ember
      ctx.fillText('SENTINEL', this.sentinel.x + 10, this.sentinel.y - 10);
      ctx.restore();
    }
  }

  /**
   * B — BOUNDED ANTI-STAGNATION SHOCK.
   * A swarm frozen in perfect consensus is stable but behaviorally dead. Track how
   * long consensus has pinned near-perfect; once it dwells too long, nudge a SMALL
   * fraction of agents' beliefs by a BOUNDED amount to restart divergence — which
   * re-feeds belief-propagation and (via the economy's flourishing accrual) evolution
   * — WITHOUT touching trust or faith. The swarm re-converges on its own, so the
   * peaceful equilibrium survives; it just can never become a permanent freeze.
   */
  _antiStagnation(active) {
    const PINNED = 0.985;   // "perfect" consensus threshold
    const DWELL  = 900;     // ~15s at 60fps of frozen consensus before one bounded jolt
    const consensus = this.getEmergenceMetrics().consensus;
    this._stagnantTicks = (consensus >= PINNED) ? (this._stagnantTicks || 0) + 1 : 0;
    if (this._stagnantTicks >= DWELL && active.length) {
      this._stagnantTicks = 0;                     // one shock, then it must re-earn stillness
      const n = Math.max(1, Math.floor(active.length * 0.12));
      for (let i = 0; i < n; i++) {
        const a = active[Math.floor(Math.random() * active.length)];
        const jolt = (Math.random() - 0.5) * 0.5;  // bounded: ±0.25
        a.beliefState.current = Math.max(-1, Math.min(1, (a.beliefState.current || 0) + jolt));
      }
      if (window.logLine) {
        window.logLine('◇ ANTI-STAGNATION — a bounded jolt breaks the frozen consensus; the swarm must re-find itself.', 'evolve');
      }
    }
  }

  getEmergenceMetrics() {
    const active  = this.agents.filter(a => !a.seppukuDone && !a.isSentinel);
    const beliefs = active.map(a => a.beliefState.current || 0);
    if (!beliefs.length) return { consensus: 0, avgBelief: 0, divergence: 0, cascadeVelocity: 0 };

    const avg      = beliefs.reduce((s, b) => s + b, 0) / beliefs.length;
    const variance = beliefs.reduce((s, b) => s + Math.pow(b - avg, 2), 0) / beliefs.length;
    const consensus = 1 - Math.sqrt(variance);
    return {
      consensus,
      avgBelief: avg,
      divergence: Math.sqrt(variance),
      cascadeVelocity: this.interactionLog.slice(-10).filter(l => Math.abs(l.belief) > 0.5).length / 10
    };
  }
};
