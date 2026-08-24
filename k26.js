/**
 * K3.0 Integration Layer for Murmuration
 * Local orchestration: seed → sim → emergence → Gnosquam output.
 * LLM at edges only (future hook).
 *
 * ── K2.6 → K3.0 ──────────────────────────────────────────────────────────────
 * Ghost, 2026-08-09: "k 3.0 has been released now i do believe 😁"
 *
 * The bump is not for the feature count. It is for the change in how this layer
 * is built. K2.6 constructed its subsystems inline, and a second construction
 * site in restoreCivilization() copied that list by hand — so the two drifted
 * three separate times, and each time a whole system was silently absent for
 * anyone who LOADED a civilization rather than starting a fresh one. That is
 * the default path. Predators and CTF went missing, then relics and gauntlet,
 * then weather and lineage.
 *
 * K3.0 has ONE construction site: attachWorldSystems(). Both paths call it.
 *
 * Also new in 3.0:
 *   - WEATHER as a pressure source — six disaster kinds, random paths, a death
 *     budget, denied ground, and monuments for the greatest taken by it.
 *   - LINEAGE — descent and influence overlaid on one bounded graph, which is
 *     what NEMESIS needs to trace carriers at the time of corruption.
 *   - Storms render as OCCLUSION on their own layer above the swarm, because
 *     additive light under the bond web is invisible no matter how bright.
 */

window.MurmurationModules = window.MurmurationModules || {};

// STORM PALETTE — Ghost, 2026-08-09: "make the storm a grayish deep purple and
// green mix."
//
// One palette for every kind, not a hue per type. That is the point: a storm
// should read as WEATHER first and as its particular type second, and the type
// is already named on the label. It also fixes the legibility failure directly
// — the swarm's own palette is cyan and magenta, so the first version's blues
// (200/215/185) were competing with the bond web in the bond web's own colour.
// Desaturated purple and green sit outside that range entirely.
const STORM_PURPLE = { h: 279, s: 22 };   // grayish deep purple — the body
const STORM_GREEN  = { h: 142, s: 46 };   // the rim, the sweep, the heading
// Slight per-type shift so a tornado is not literally the same object as a
// flood, kept small enough that all six still read as one weather system.
const STORM_SHIFT = { TORNADO: -6, HURRICANE: 0, FLOOD: 4, FIRE: -12, EARTHQUAKE: 8, HAIL: 2 };

window.MurmurationModules.K26 = class K26 {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.world = null;
    this.economy = null;
    this.wealthEngine = null;
    this.warningLog = null;
    this.seedInjector = new window.MurmurationModules.SeedInjector();
    this.interactionEngine = new window.MurmurationModules.InteractionEngine();
    this.evolutionEngine = new window.MurmurationModules.EvolutionEngine();
    this.extractor = new window.MurmurationModules.EmergenceExtractor();
    this.isRunning = false;
    this.animationId = null;
  }

  init(agentCount = 130) {
    const width = this.canvas.width;
    const height = this.canvas.height;
    this.world = new window.MurmurationModules.World(width, height, agentCount);

    // Economy — energy, resources, disaster cycle
    if (window.MurmurationModules.Economy) {
      const scarcityEl = document.getElementById('scarcitySlider');
      this.economy = new window.MurmurationModules.Economy(this.world, {
        scarcityLevel: scarcityEl ? parseFloat(scarcityEl.value) : 0.5
      });
    }

    // Wealth & Social Class — inequality emerges from nothing
    if (window.MurmurationModules.WealthEngine && this.economy) {
      const taxEl = document.getElementById('taxSlider');
      this.wealthEngine = new window.MurmurationModules.WealthEngine(this.world, this.economy, {
        taxRate: taxEl ? parseFloat(taxEl.value) : 0
      });
    }

    this.attachWorldSystems();
    this.draw();
  }

  /**
   * EVERY SUBSYSTEM THAT IS JUST `new X(world)`, BUILT IN ONE PLACE.
   *
   * Ghost, 2026-08-09, after pressing all six storm buttons: "they arent
   * working... no death, not hurricane, no anything."
   *
   * The cause was structural, not a missing feature. Subsystems were being
   * constructed in TWO places — here in init(), and again by hand inside
   * restoreCivilization() in index.html, which builds a fresh K26 and
   * deliberately never calls init(). Weather and Lineage were added to init()
   * only, so anyone who LOADED a civilization had `k26.weather === undefined`.
   * Every control is guarded by `if (k26 && k26.weather)`, so all six buttons
   * were silent no-ops. The page auto-restores a saved colony on boot, so for
   * Ghost that was every single session — while I tested by pressing RESTART,
   * which runs init(). We were running two different programs.
   *
   * Nothing detected the drift, and nothing would have. So there is now one
   * construction site: add a system here and BOTH paths get it. Economy and
   * WealthEngine stay with their callers — they take snapshot state and
   * constructor options, and are genuinely different on the two paths.
   */
  attachWorldSystems() {
    const M = window.MurmurationModules, w = this.world;
    if (!w) return;

    // `bind` names the property the world exposes back to the subsystem, for
    // the ones that need to be reachable from inside the sim.
    const SYSTEMS = [
      { key: 'weather',        mod: 'Weather'         },
      { key: 'lineage',        mod: 'Lineage',        noWorld: true },
      { key: 'predatorSystem', mod: 'PredatorSystem'  },
      { key: 'ctf',            mod: 'CTFSystem',      bind: 'ctf' },
      { key: 'warningLog',     mod: 'WarningLog',     noWorld: true },
      { key: 'relicSystem',    mod: 'RelicSystem',    bind: 'relicSystem' },
      { key: 'gauntlet',       mod: 'GauntletSystem', bind: 'gauntlet' },
      { key: 'maze',           mod: 'MazeSystem',     bind: 'maze' },
      { key: 'mutations',      mod: 'MutationSystem', bind: 'mutations' },
      { key: 'chronicle',      mod: 'Chronicle',      bind: 'chronicle' },
    ];

    for (const s of SYSTEMS) {
      if (!M[s.mod]) continue;
      this[s.key] = s.noWorld ? new M[s.mod]() : new M[s.mod](w);
      if (s.bind) w[s.bind] = this[s.key];
    }

    // Founders. On a restored colony these are not genesis agents, but their
    // descent genuinely is unknown — the snapshot format carries no parent
    // links, so depth 0 is the honest value rather than an invented one.
    if (this.lineage) {
      for (const a of w.agents) this.lineage.birth(a.id, null, a.colony);
    }
  }

  injectSeeds() {
    if (!this.world) return;
    const signals = window.MurmurationModules.SeedInjector.fromForm();
    this.seedInjector.inject(this.world, signals);
    if (!this.isRunning) { this.step(); this.draw(); this.updateUI(this.extract()); }
  }

  step() {
    // Orchestrate
    if (this.lineage) this.lineage.setTick(this.world.tick || 0);
    this.interactionEngine.computeInteractions(this.world, this.lineage);
    this.world.advanceStep();
    this.evolutionEngine.evolve(this.world);
    if (this.weather) this.weather.update();

    // Economy tick — energy drain, harvesting, cooperation bonuses, phase cycle
    if (this.economy) this.economy.tick();

    // Wealth tick — surplus accumulation, class assignment, employment, revolution
    if (this.wealthEngine) this.wealthEngine.tick();

    // Apex predator tick — hunts stragglers, scoped to each colony's own pressure
    if (this.predatorSystem) this.predatorSystem.tick();

    // Relic tick — pull pilgrims to the far points, resolve claims, expire charges
    if (this.relicSystem) this.relicSystem.tick();

    // Gauntlet tick — pads, gate, barrier collision, reward
    if (this.gauntlet) this.gauntlet.tick();

    // Maze tick — confine agents to passages, score goal reaches.
    // `mazes` (plural) lets a host run one arena per colony side by side.
    if (this.mazes) { for (const m of this.mazes) m.tick(); }
    else if (this.maze) this.maze.tick();

    // Mutations tick — sample engagement, crystallize genes, apply effects
    if (this.mutations) this.mutations.tick();

    // Chronicle tick — sample macro-state, detect + record emergent events
    if (this.chronicle) this.chronicle.tick();
  }

  extract() {
    return this.extractor.extract(this.world);
  }

  start() {
    this.isRunning = true;
    const loop = () => {
      if (!this.isRunning) return;
      try {
        // Simulation Speed — dedicated 1x–20x fast-forward control.
        // Decoupled from Echolocation Frequency, which is now a real per-colony trait.
        const stepsPerFrame = Math.max(1, Math.min(20, Math.round(this.world ? (this.world.simSpeed || 1) : 1)));
        for (let i = 0; i < stepsPerFrame; i++) {
          this.step();
        }
        this.draw();
        const emergence = this.extract();
        this.updateUI(emergence);
      } catch(e) {
        console.error('[K26 loop error]', e);
      }
      this.animationId = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    this.isRunning = false;
    if (this.animationId) cancelAnimationFrame(this.animationId);
  }

  draw() {
    const ctx = this.canvas.getContext('2d');
    if (!this.world) return;

    // Keep the simulation world locked to the canvas — if the canvas resized
    // (preview pane, window, DPR shift), rescale agent positions to fill it so
    // the swarm never shrinks into a corner or a stale sub-rectangle.
    if (this.canvas.width > 0 && this.canvas.height > 0 &&
        (this.world.width !== this.canvas.width || this.world.height !== this.canvas.height)) {
      const ow = this.world.width || this.canvas.width;
      const oh = this.world.height || this.canvas.height;
      const sx = this.canvas.width / ow;
      const sy = this.canvas.height / oh;
      for (const a of this.world.agents) {
        if (typeof a.x === 'number') a.x *= sx;
        if (typeof a.y === 'number') a.y *= sy;
      }
      this.world.width = this.canvas.width;
      this.world.height = this.canvas.height;
      if (this.economy && this.economy.recomputeZonePositions) this.economy.recomputeZonePositions();
      if (this.world.onResize) this.world.onResize();
    }

    const W = this.world.width, H = this.world.height;

    // ── MAZE MODE ─────────────────────────────────────────────────────
    // The maze is a DIFFERENT EXPERIMENT, not an overlay on the open world.
    // Drawn on top of the ordinary sim it is unreadable: topographic contours,
    // ten commons zones, the wall, relic beacons and the bond web all compete
    // for the same pixels as 114x57 corridors, and the additive cluster bloom
    // of a packed swarm floods whichever corridor it occupies.
    //
    // While the maze is armed it OWNS the canvas. Everything belonging to the
    // open-world scenario is suppressed — nothing is deleted, nothing changes
    // state, it simply is not painted. Disarming restores the full view.
    const mazeMode = !!((this.maze && this.maze.active) ||
                        (this.mazes && this.mazes.some(m => m.active)));

    // Layer 1: vanta void + state-reactive nebula (see VISUAL-BIBLE.md)
    this.drawBackground(ctx, W, H);

    // Layer 2: resource zones UNDER agents (so agents stay crisp)
    if (this.economy && !mazeMode) this.economy.draw(ctx);

    // Layer 2.5: DENIED GROUND — where a storm has already been. This is
    // terrain, so it belongs under the bond web with the resource zones.
    // Ghost: "use the nebula cloud like a stormtracker radar map to show the
    // worst hit uninhabitable zones." Its own layer rather than a repurposing of
    // the mood nebula, which already relays swarm state and would have been
    // destroyed by reuse. The ACTIVE fronts are drawn much later — see
    // drawStormFronts for why they cannot live down here.
    if (this.weather) this.drawStormGround(ctx, W, H);

    // Layer 3: connection strings — persistent neural web (additive light)
    // In the maze this web is the single worst offender: 120 agents in close
    // quarters draw a near-solid sheet of light over the walls.
    if (!mazeMode) this.drawConnections(ctx);

    // Layer 3.5: the wall + gates — above bonds, below agents
    if (this.world.drawWall && !mazeMode) this.world.drawWall(ctx);

    // Layer 3.7: relic beacons at the far points — above the wall, under agents
    if (this.relicSystem && !mazeMode) this.relicSystem.draw(ctx);

    // Layer 3.8: gauntlet obstacle — barrier, gate, pads, reward
    if (this.gauntlet) this.gauntlet.draw(ctx);

    // Layer 3.9: maze walls, reward, markers
    if (this.mazes) { for (const m of this.mazes) m.draw(ctx); }
    else if (this.maze) this.maze.draw(ctx);

    // Layer 3.95: mutation genome readout (per-colony progress + earned genes)
    if (this.mutations) this.mutations.draw(ctx);

    // Chronicle badge — unreviewed emergent events
    if (this.chronicle) this.chronicle.draw(ctx);

    // Layer 4: agents on top
    for (const agent of this.world.agents) {
      agent.draw(ctx);
    }

    // Layer 4.2: hit reactions — strike flashes for chaos signals and combat, above the agents
    if (this.world) this.world.drawHits(ctx);

    // Layer 4.3: lightning storms — paranoia electricity, above the hit flashes
    if (this.world && this.world.drawLightning) this.world.drawLightning(ctx);

    // Layer 4.5: apex predators + CTF flags — above agents so they always read
    if (this.predatorSystem) this.predatorSystem.draw(ctx);
    if (this.ctf) this.ctf.draw(ctx);
    if (this.ctf) this.ctf.drawHonor(ctx);

    // Layer 5: class indicators (wealth rings, crowns)
    if (this.wealthEngine) this.wealthEngine.draw(ctx);

    // Layer 5.5: ACTIVE STORM FRONTS — above the bond web AND above the agents.
    // Weather is the one thing on this canvas that is physically ON TOP of the
    // world rather than in it. Drawn underneath, it was invisible.
    if (this.weather) this.drawStormFronts(ctx, W, H);

    // Layer 6: env overlay + sentinel label
    this.world.drawOverlay(ctx);
  }

  /**
   * Swarm mood, smoothed — 0 = stress, ~0.5 = normal, 1 = blissful.
   * Drives the reactive nebula. High trust/faith/consensus lift it; grief + disturbance drag it.
   */
  computeMood() {
    const live = this.world.agents.filter(a => !a.seppukuDone && !a.isSentinel);
    const n = live.length || 1;
    let trust = 0, faith = 0, grief = 0;
    for (const a of live) { trust += a.trustCharge; faith += a.faith; grief += a.griefLevel; }
    trust /= n; faith /= n; grief /= n;
    const m = this.world.getEmergenceMetrics ? this.world.getEmergenceMetrics() : { consensus: 0 };
    const consensus   = m.consensus || 0;
    const disturbance = (this.world.env && (this.world.envA.disturbance + this.world.envB.disturbance) / 2) || 0;
    let sat = trust * 0.35 + faith * 0.25 + consensus * 0.25 + 0.15 - grief * 0.5 - disturbance * 0.35;
    sat = Math.max(0, Math.min(1, sat));
    // breathe toward the target instead of snapping each frame
    this._mood = (this._mood == null) ? sat : this._mood + (sat - this._mood) * 0.04;
    return this._mood;
  }

  /**
   * Vanta-black void with a state-reactive nebula (see VISUAL-BIBLE.md).
   * Stress → amber/orange · normal → green · bliss → deep blue. Center colored, fading to black.
   */
  drawBackground(ctx, W, H) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // Neon topographic map — baked once, blitted behind everything.
    // Self-heal: build it here if it was never wired or the canvas resized,
    // wrapped so a topo failure can never abort the rest of the frame.
    if ((!this.topoLayer || this.topoLayer.width !== W || this.topoLayer.height !== H)
        && window.buildTopoMap && W > 0 && H > 0) {
      try { this.topoLayer = window.buildTopoMap(W, H); }
      catch (e) { console.warn('[topo build failed]', e); this.topoLayer = null; }
    }
    // Topographic contours are the open world's terrain. In maze mode they run
    // straight through the corridors and read as false passages, so the void
    // stays black and the only lines on screen are maze walls.
    const _mz = (this.maze && this.maze.active) ||
                (this.mazes && this.mazes.some(m => m.active));
    if (this.topoLayer && !_mz) {
      ctx.drawImage(this.topoLayer, 0, 0, W, H);
    }

    const sat = this.computeMood();
    const hue = sat < 0.5 ? 35 + (sat / 0.5) * 85
                          : 120 + ((sat - 0.5) / 0.5) * 100;

    // Nebula follows mass — centroid of live agents drifts the glow toward where life is
    const live = this.world ? this.world.agents.filter(a => !a.seppukuDone && !a.isSentinel) : [];
    let targetCx = W * 0.5, targetCy = H * 0.5;
    if (live.length > 0) {
      let sx = 0, sy = 0;
      for (const a of live) { sx += a.x; sy += a.y; }
      targetCx = sx / live.length;
      targetCy = sy / live.length;
    }
    // Smooth drift — atmosphere responds slowly, not instantly
    this._nebCx = this._nebCx == null ? targetCx : this._nebCx + (targetCx - this._nebCx) * 0.018;
    this._nebCy = this._nebCy == null ? targetCy : this._nebCy + (targetCy - this._nebCy) * 0.018;
    const cx = this._nebCx, cy = this._nebCy;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Edge gradient — void at center, color at perimeter; center tracks the mass
    // nebulaGain — a host may push the atmosphere harder without touching the
    // open sim. Attrition runs the range on near-black with topo contours over
    // it, where the stock alphas read as nothing; 1 keeps murmuration exactly
    // as it was. Clamped so no host can wash out the agents it sits behind.
    const NG = Math.max(0.2, Math.min(2.4, this.nebulaGain || 1));
    const A = (a) => Math.min(0.92, a * NG).toFixed(3);
    const edgeR = Math.max(W, H) * 0.88;
    const g0 = ctx.createRadialGradient(cx, cy, edgeR * 0.12, cx, cy, edgeR);
    g0.addColorStop(0,    'rgba(0,0,0,0)');
    g0.addColorStop(0.50, `hsla(${hue}, 55%, 20%, ${A(0.14)})`);
    g0.addColorStop(0.78, `hsla(${hue}, 68%, 32%, ${A(0.32)})`);
    g0.addColorStop(1,    `hsla(${hue}, 76%, 40%, ${A(0.50)})`);
    ctx.fillStyle = g0;
    ctx.fillRect(0, 0, W, H);

    // Mass glow — softer second gradient centered on the cluster, follows even tighter
    if (live.length > 10) {
      const density = Math.min(1, live.length / 150);
      const massR   = Math.min(W, H) * (0.28 + density * 0.18);
      const gm = ctx.createRadialGradient(cx, cy, 0, cx, cy, massR);
      gm.addColorStop(0,   `hsla(${hue}, 70%, 28%, ${A(0.06 + density * 0.08)})`);
      gm.addColorStop(0.6, `hsla(${hue}, 60%, 20%, ${A(0.03 + density * 0.04)})`);
      gm.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = gm;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
  }

  /**
   * Connection strings — the neural web. PERSISTENT: a bond stays fully visible until it is
   * SEVERED (the two agents move out of range). Bright neural cyan; only the last stretch warms
   * toward amber as it nears the break — a tendon going taut. Drawn ONCE per pair (n.id > a.id),
   * additive. See VISUAL-BIBLE.md §4.
   */
  /**
   * STORM RADAR — where the hazard is, where it has been, and where it is going.
   *
   * Ghost: "give it a color gradient to indicate the level of stress the
   * environment is experiencing... show the worst hit uninhabitable zones."
   *
   * Required, not decorative. Disaster paths are RANDOM and they MOVE, so without
   * a readout the player cannot see what is coming or which ground is dead — the
   * mechanic would be invisible, which is the state weather.js was built to end.
   *
   * SCARS FIRST, then fronts. Denied ground is the lasting consequence; the front
   * is the moment. Drawn under the connection strings so bonds stay readable
   * across a storm — you need to see whether the web survives the crossing.
   *
   * Colour is by TYPE, so six shapes are distinguishable at a glance, and alpha
   * carries intensity. Deliberately NOT the mood-nebula palette: this is the
   * environment's stress, not the swarm's.
   */
  /**
   * DENIED GROUND — the lasting consequence. Terrain-like, so it belongs down
   * here with the resource zones, under the bond web.
   */
  drawStormGround(ctx, W, H) {
    const hz = this.weather.getHazards();
    const P = STORM_PURPLE.h, G = STORM_GREEN.h;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const s of hz.scars) {
      const sh = STORM_SHIFT[s.type] ?? 0;

      // THE CORRIDOR — every point the storm passed through, so the damage maps
      // the path rather than the exit. This is the part that survives the storm:
      // at 4x sim speed a front is on screen for under four seconds, but the
      // ground it ruined stays for as long as its denial lasts.
      if (s.track && s.track.length > 1) {
        for (const p of s.track) {
          const r = p.r || s.radius;
          const gg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          gg.addColorStop(0,   `hsla(${STORM_PURPLE.h + sh}, 26%, 30%, ${0.10 * s.fade})`);
          gg.addColorStop(0.7, `hsla(${STORM_GREEN.h + sh}, 30%, 22%, ${0.05 * s.fade})`);
          gg.addColorStop(1,   'hsla(0,0%,0%,0)');
          ctx.fillStyle = gg;
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        }
        // Centre line of the corridor — makes the direction of travel readable
        // after the fact, which is the whole job of a tracker.
        ctx.strokeStyle = `hsla(${STORM_GREEN.h + sh}, 44%, 44%, ${0.34 * s.fade})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 6]);
        ctx.beginPath();
        s.track.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.radius);
      g.addColorStop(0,   `hsla(${P+sh}, 26%, 34%, ${0.26 * s.fade})`);
      g.addColorStop(0.7, `hsla(${G+sh}, 30%, 24%, ${0.13 * s.fade})`);
      g.addColorStop(1,   'hsla(0,0%,0%,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2); ctx.fill();

      // Hatched rim — reads as "ground", not as weather still happening
      ctx.setLineDash([5, 7]);
      ctx.strokeStyle = `hsla(${G+sh}, 48%, 46%, ${0.40 * s.fade})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.radius * 0.92, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  /**
   * ACTIVE FRONTS — the thing currently killing. Drawn ABOVE the bond web and
   * above the agents.
   *
   * Ghost, 2026-08-09: "there were zero visual indicators that anything
   * happened. the only reason i knew anyone died was because you told me."
   *
   * The first version failed three ways at once, and they compounded. It used
   * additive blending, at alpha 0.16-0.46, in hues (200/215/185) sitting in the
   * same cyan family as the bond web and the terrain contours — and it was
   * drawn UNDERNEATH that web. So it could only ever ADD light to the brightest
   * object on screen, in that object's own colour. A 190-radius hurricane
   * parked dead centre of a 720px canvas was invisible.
   *
   * A storm OCCLUDES. That is how weather reads in the world and it is what
   * makes it legible here: the interior is veiled dark so whatever is beneath
   * it dims, and the boundary is a hard bright rim. Something is covering the
   * swarm, and you can see exactly where its edge falls.
   */
  drawStormFronts(ctx, W, H) {
    const hz = this.weather.getHazards();
    if (!hz.fronts.length) return;

    ctx.save();
    for (const f of hz.fronts) {
      const sh = STORM_SHIFT[f.type] ?? 0;
      const P = STORM_PURPLE.h + sh, G = STORM_GREEN.h + sh;
      const R = f.radius;

      // `fade` runs 1 -> 0 across the storm's life, but a front at 90% of its
      // life still kills at full rate. Floored so a lethal storm can never
      // render as almost-gone — the visual must not lie about the danger.
      const vis = 0.55 + 0.45 * f.fade;

      // ── THE WAKE — where it has already been, drawn before the storm itself.
      // At 4x sim speed the front alone is on screen for 0.38s (EARTHQUAKE) to
      // 3.75s (HURRICANE); the wake gives it a shape you can catch in a glance
      // and shows the direction of travel without waiting for the next frame.
      ctx.globalCompositeOperation = 'source-over';
      if (f.track && f.track.length > 1) {
        f.track.forEach((p, i) => {
          const age = i / f.track.length;             // 0 = oldest, 1 = newest
          const rr = (p.r || R) * (0.55 + 0.45 * age);
          const gw = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
          gw.addColorStop(0, `hsla(${P}, ${STORM_PURPLE.s}%, 10%, ${0.30 * age * vis})`);
          gw.addColorStop(1, 'hsla(0,0%,0%,0)');
          ctx.fillStyle = gw;
          ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.fill();
        });
      }

      // ── THE VEIL — source-over, so it DARKENS instead of adding. This is the
      // single change that makes a storm visible over the bond web.
      ctx.globalCompositeOperation = 'source-over';
      const veil = ctx.createRadialGradient(f.x, f.y, R * 0.15, f.x, f.y, R);
      veil.addColorStop(0,    `hsla(${P}, ${STORM_PURPLE.s}%, 9%,  ${0.86 * vis})`);
      veil.addColorStop(0.62, `hsla(${P}, ${STORM_PURPLE.s+6}%, 14%, ${0.62 * vis})`);
      veil.addColorStop(0.88, `hsla(${G}, ${STORM_GREEN.s-18}%, 13%, ${0.34 * vis})`);
      veil.addColorStop(1,    'hsla(0,0%,0%,0)');
      ctx.fillStyle = veil;
      ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, Math.PI * 2); ctx.fill();

      // ── THE RIM — hard, bright, unambiguous. The edge is the information:
      // inside it you die, outside it you do not.
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `hsla(${G}, ${STORM_GREEN.s+22}%, 62%, ${0.95 * vis})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, Math.PI * 2); ctx.stroke();

      ctx.strokeStyle = `hsla(${G}, ${STORM_GREEN.s+10}%, 52%, ${0.32 * vis})`;
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, Math.PI * 2); ctx.stroke();

      // Eye
      ctx.fillStyle = `hsla(${G}, ${STORM_GREEN.s+30}%, 78%, ${0.92 * vis})`;
      ctx.beginPath(); ctx.arc(f.x, f.y, Math.max(4, R * 0.07), 0, Math.PI * 2); ctx.fill();

      // Sweep — a radar return, expanding out to the rim
      const sweep = ((this._radarPhase = (this._radarPhase || 0) + 0.006) % 1);
      ctx.strokeStyle = `hsla(${G}, ${STORM_GREEN.s+25}%, 68%, ${0.55 * (1 - sweep) * vis})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, R * (0.1 + sweep * 0.9), 0, Math.PI * 2); ctx.stroke();

      // HEADING — the path is random, so watching the vector is the only
      // warning anyone gets.
      if (f.dx || f.dy) {
        const L = R * 1.8;
        ctx.strokeStyle = `hsla(${G}, ${STORM_GREEN.s+20}%, 66%, ${0.78 * vis})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 7]);
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.x + f.dx * L, f.y + f.dy * L);
        ctx.stroke();
        ctx.setLineDash([]);

        // Arrowhead, so the vector reads as direction and not as a stray bond
        const hx = f.x + f.dx * L, hy = f.y + f.dy * L, ang = Math.atan2(f.dy, f.dx);
        ctx.fillStyle = `hsla(${G}, ${STORM_GREEN.s+25}%, 70%, ${0.88 * vis})`;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx - 11 * Math.cos(ang - 0.4), hy - 11 * Math.sin(ang - 0.4));
        ctx.lineTo(hx - 11 * Math.cos(ang + 0.4), hy - 11 * Math.sin(ang + 0.4));
        ctx.closePath(); ctx.fill();
      }

      // Label + running toll. Ghost knew agents died only because I told him;
      // the count belongs on the storm that is taking them.
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      const label = f.deaths ? `${f.type} — ${f.deaths} TAKEN` : f.type;
      ctx.strokeText(label, f.x, f.y - R - 10);
      ctx.fillStyle = `hsla(${G}, ${STORM_GREEN.s-6}%, 86%, 0.98)`;
      ctx.fillText(label, f.x, f.y - R - 10);
    }
    ctx.restore();
  }

  drawConnections(ctx) {
    const MAXLEN = 220;                                      // sever distance — spider silk, quarter-screen reach before snap
    const ok = a => a && !a.seppukuDone && !a.isSentinel && a.griefState !== 'DISHONORED';
    const now = Date.now() * 0.0003;                         // slow global drift clock
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';            // spiritual layer — not burning through agents
    ctx.lineCap = 'round';
    for (const a of this.world.agents) {
      if (!ok(a)) continue;
      const nb = this.world.getNeighbors(a, MAXLEN);
      for (const n of nb) {
        if (n.id <= a.id || !ok(n)) continue;
        const dist   = Math.hypot(n.x - a.x, n.y - a.y);
        const strain = dist / MAXLEN;                        // 0 touching → 1 about to sever
        const taut   = 1 - strain;
        const bond   = Math.min(a.trustCharge, n.trustCharge);

        // Royal purple at rest → orange → red → white-grey at the moment of snap
        let hue, sat, light;
        // Neon royal purple → neon orange → neon red → white-grey at snap
        let sh, ss, sl;
        if (strain < 0.55) {
          sh = 270; ss = 95; sl = 68 + strain * 8;            // neon purple
        } else if (strain < 0.82) {
          const u = (strain - 0.55) / 0.27;
          sh = 270 - u * 232;                                  // purple → orange (270→38)
          ss = 95 + u * 5;                                     // stays neon
          sl = 72 + u * 8;                                     // neon orange ~80%
        } else if (strain < 0.94) {
          const u = (strain - 0.82) / 0.12;
          sh = 38 - u * 38;                                    // orange → red
          ss = 100;
          sl = 76 - u * 15;                                    // neon red ~61%
        } else {
          // Grey hair — the last moment before it snaps
          const u = (strain - 0.94) / 0.06;
          sh = 0; ss = Math.max(0, 100 - u * 100);            // drains to white
          sl = 63 + u * 32;                                    // brightens to silver-white
        }

        // Bezier bow — computed first, used by both normal and gold paths
        const mx    = (a.x + n.x) * 0.5;
        const my    = (a.y + n.y) * 0.5;
        const bnx   = -(n.y - a.y) / dist;                  // perpendicular unit vector
        const bny   =  (n.x - a.x) / dist;
        const phase = (a.id * 1.3 + n.id * 0.7);            // unique phase per pair
        const bow   = Math.sin(now + phase) * dist * 0.06;  // gentle, proportional bow
        const cpx   = mx + bnx * bow;
        const cpy   = my + bny * bow;

        // ── CONFLICT SIGNAL — overrides strain gradient when agents are in active conflict ──
        // Level 1 domestic: amber pulse · Level 2 local: red · Level 3+ civil/revolutionary: white-hot
        const conflicted    = a._conflictWith === n.id || n._conflictWith === a.id;
        const conflictLevel = conflicted ? Math.max(a._conflictLevel || 0, n._conflictLevel || 0) : 0;

        // ── EVOLUTION SIGNAL — disabled: bonds keep their strain multicolor
        //    instead of flipping gold. (Lineage read may return elsewhere.) ──
        const evoReady = false;

        let lineW, strokeCol;
        if (conflicted && conflictLevel > 0) {
          const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.008 + a.id * 0.9); // faster pulse = tension
          if (conflictLevel === 1) {
            // Domestic — amber, barely visible, just below the surface
            lineW        = 0.5 + bond * 0.6 + pulse * 0.3;
            const cAlpha = (0.30 + bond * 0.25) * (0.5 + taut * 0.5) * (0.6 + pulse * 0.4);
            strokeCol    = `hsla(28, 85%, ${50 + pulse * 12}%, ${cAlpha})`;
            ctx.lineWidth   = lineW * 3;
            ctx.strokeStyle = `hsla(28, 80%, 45%, ${cAlpha * 0.12})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y);
            ctx.quadraticCurveTo(cpx, cpy, n.x, n.y); ctx.stroke();
          } else if (conflictLevel === 2) {
            // Local — red, more visible, spreading
            lineW        = 0.6 + bond * 0.7 + pulse * 0.4;
            const cAlpha = (0.35 + bond * 0.30) * (0.5 + taut * 0.5) * (0.7 + pulse * 0.3);
            strokeCol    = `hsla(5, 90%, ${48 + pulse * 10}%, ${cAlpha})`;
            ctx.lineWidth   = lineW * 4;
            ctx.strokeStyle = `hsla(5, 85%, 42%, ${cAlpha * 0.15})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y);
            ctx.quadraticCurveTo(cpx, cpy, n.x, n.y); ctx.stroke();
          } else {
            // Civil / Revolutionary — white-hot, unmistakable
            lineW        = 0.8 + bond * 0.8 + pulse * 0.5;
            const cAlpha = (0.45 + bond * 0.35) * (0.6 + taut * 0.4) * (0.8 + pulse * 0.2);
            const light  = conflictLevel >= 4 ? 88 : 70 + conflictLevel * 5;
            strokeCol    = `hsla(0, ${100 - conflictLevel * 8}%, ${light}%, ${cAlpha})`;
            ctx.lineWidth   = lineW * 5;
            ctx.strokeStyle = `hsla(0, 80%, 55%, ${cAlpha * 0.20})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y);
            ctx.quadraticCurveTo(cpx, cpy, n.x, n.y); ctx.stroke();
          }
        } else if (evoReady) {
                  // GOLD — oldest accumulated knowledge base; strings turn gold to track lineage of earned knowledge
                  const pulse  = 0.5 + 0.5 * Math.sin(Date.now() * 0.0018 + a.id * 0.5);
                  lineW        = 0.35 + bond * 0.55 + pulse * 0.25;
                  const gAlpha = (0.20 + bond * 0.20) * (0.45 + taut * 0.55) * (0.6 + pulse * 0.4);
                  strokeCol    = `hsla(45, 95%, ${52 + pulse * 12}%, ${gAlpha})`;  // gold, not blue
                  ctx.lineWidth   = lineW * 5;
                  ctx.strokeStyle = `hsla(45, 90%, 55%, ${gAlpha * 0.09})`;
                  ctx.beginPath(); ctx.moveTo(a.x, a.y);
                  ctx.quadraticCurveTo(cpx, cpy, n.x, n.y); ctx.stroke();
        } else {
          lineW         = 0.5 + bond * 0.75 * (0.5 + taut * 0.5);
          const alpha   = (0.34 + bond * 0.42) * (0.55 + taut * 0.45);
          strokeCol     = `hsla(${sh}, ${ss}%, ${sl}%, ${alpha})`;
        }

        ctx.lineWidth   = lineW;
        ctx.strokeStyle = strokeCol;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(cpx, cpy, n.x, n.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  populationBoom(count) {
    /**
     * Population boom — the Hydra trait.
     * Injects fresh agents into the colony after a seppuku cascade clears it.
     * New agents inherit the colony's doctrine but have no memory of what killed the previous generation.
     * They feel the proximity pressure immediately — without knowing why.
     *
     * @param {number} count - number of agents to inject
     * @returns {Agent[]} new agents
     */
    if (!this.world) return [];
    const Agent = window.MurmurationModules.Agent;
    const newAgents = [];
    const doctrine = this.world.doctrine || 'peace';
    const mode = this.world.mode || 'normal';

    for (let i = 0; i < count; i++) {
      // Place near the edges, heading inward — fresh arrivals from outside
      const edge = i % 2 === 0;
      const x = edge
        ? 30 + Math.random() * 60
        : this.world.width - 30 - Math.random() * 60;
      const y = 60 + Math.random() * (this.world.height - 120);

      const id = (this.economy && this.economy.nextAgentId)
        ? this.economy.nextAgentId++
        : this.world.agents.length + i + Math.floor(Math.random() * 1e6);

      const a = new Agent(id, x, y, this._randomPersonality());
      a.generation = 1;
      a._generation = 1;
      a._immigrant = false;
      a._boomSpawned = true;

      // Inherit doctrine
      a.doctrine = doctrine;
      a._doctrine = doctrine;

      // Start with slightly elevated energy — they're fresh
      a.energy = 0.65 + Math.random() * 0.25;

      // Track boom origin
      a._boomOrigin = true;

      this.world.agents.push(a);
      newAgents.push(a);
    }

    // Log the boom event
    const popNow = this.world.agents.filter(a => !a.seppukuDone && !a.isSentinel).length;
    if (window.logLine) {
      window.logLine(
        `T${this.world.time}  🌱 POPULATION BOOM — ${count} new agents injected (total: ${popNow})`,
        'green'
      );
    }

    return newAgents;
  }

  _randomPersonality() {
    return {
      riskTolerance:  0.3 + Math.random() * 0.4,
      trustBaseline: 0.5 + Math.random() * 0.3,
      reactivity:     0.4 + Math.random() * 0.4,
      memoryWeight:   0.2 + Math.random() * 0.5,
      optimism:       0.4 + Math.random() * 0.3,
    };
  }

  updateUI(emergence) {
    const pred     = emergence.prediction.toFixed(3);
    const conf     = emergence.confidence.toFixed(2);
    const vel      = emergence.cascadeVelocity.toFixed(2);
    const trust    = (emergence.avgTrust  || 0).toFixed(2);
    const grief    = (emergence.avgGrief  || 0).toFixed(2);
    const leaders  = emergence.highTrustCount  || 0;
    const depleted = emergence.lowTrustCount   || 0;
    const grieving = emergence.grievingCount   || 0;
    const crisis   = emergence.crisisCount     || 0;
    const seppuku  = emergence.seppukuCount    || 0;
    const dishonor = emergence.dishonoredCount || 0;
    const sentinel = emergence.hasSentinel
      ? `#${emergence.sentinelId}` : 'none';
    const wisdom   = emergence.wisdomCount || 0;

    const emergenceEl = document.getElementById('emergence');
    if (emergenceEl) {
      emergenceEl.innerText =
        `Prediction:  ${pred}\nConfidence:  ${conf}\nClusters:    ${emergence.clusters}\nCascade vel: ${vel}\nStability:   ${(emergence.stability||0).toFixed(2)}\n─────────────────────\nAvg Trust:   ${trust}  ▲${leaders}▼${depleted}\n─────────────────────\nAvg Grief:   ${grief}\nGrieving:    ${grieving}  Crisis: ${crisis}\nSeppuku:     ${seppuku}  Dishonor: ${dishonor}\nSentinel:    ${sentinel}  Wisdom: ${wisdom}`;
    }

    // Log every 30 ticks with color by emergence level
    if (this.world.time % 30 === 0) {
      if (window.logLine) {
        const type = Math.abs(emergence.prediction) > 0.4 ? 'emerge' :
                     Math.abs(emergence.prediction) > 0.1 ? 'evolve' : 'tick';
        window.logLine(
          `T${this.world.time}  pred=${pred}  conf=${conf}  [${emergence.clusters}]` +
          `  trust=${trust}▲${leaders}▼${depleted}` +
          `  grief=${grief}  ✦${seppuku}  ✗${dishonor}  ⚠${sentinel}`,
          type
        );
      }
    }
  }
};

// Global for UI
window.K26 = window.MurmurationModules.K26;
