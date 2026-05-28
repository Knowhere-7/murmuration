/**
 * K2.6 Integration Layer for Murmuration
 * Local orchestration: seed → sim → emergence → Gnosquam output.
 * LLM at edges only (future hook).
 */

window.MurmurationModules = window.MurmurationModules || {};

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

    // Phase 2 (redesigned): Living bonds — persistent connections that sever on grief
    // Map key: "minId-maxId", value: { a: agentId, b: agentId, formedAt: tick, severed: false }
    this._bonds = new Map();
    // Set of agent IDs whose bonds have been permanently severed
    this._severedAgents = new Set();
  }

  init(agentCount = 50) {
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

    // Warning Log — cascade risk tracking
    if (window.MurmurationModules.WarningLog) {
      this.warningLog = new window.MurmurationModules.WarningLog();
    }

    this.draw();
  }

  injectSeeds() {
    if (!this.world) return;
    const signals = window.MurmurationModules.SeedInjector.fromForm();
    this.seedInjector.inject(this.world, signals);
    if (!this.isRunning) { this.step(); this.draw(); this.updateUI(this.extract()); }
  }

  step() {
    // Orchestrate
    const interactions = this.interactionEngine.computeInteractions(this.world);
    this.world.advanceStep();
    this.evolutionEngine.evolve(this.world);

    // Economy tick — energy drain, harvesting, cooperation bonuses, phase cycle
    if (this.economy) this.economy.tick();

    // Wealth tick — surplus accumulation, class assignment, employment, revolution
    if (this.wealthEngine) this.wealthEngine.tick();

    // Phase 2: Living bonds — form, maintain, and sever connections
    this._updateBonds();
  }

  extract() {
    return this.extractor.extract(this.world);
  }

  start() {
    this.isRunning = true;
    const loop = () => {
      if (!this.isRunning) return;
      try {
        // Time warp: echolocation slider controls steps per frame
        // 0 = 1 step (normal), 1.0 = up to 8 steps per frame
        const warpVal = this.world ? (this.world.env.timestepRes || 0) : 0;
        const stepsPerFrame = Math.max(1, Math.round(1 + warpVal * 7));
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
    const W = this.world.width, H = this.world.height;

    // Layer 0: Dynamic ambient background — responds to swarm emotional state
    // Uses solid gradient (not alpha over black) for visible center glow
    const amb = this.world._ambientState;
    if (amb && amb.intensity > 0.005) {
      const cx = W * 0.5, cy = H * 0.5;
      const maxR = Math.max(W, H) * 0.72;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      // Scale RGB by intensity — at full intensity, center reaches the target color
      const i = amb.intensity;
      const ri = Math.round(amb.r * i), gi = Math.round(amb.g * i), bi = Math.round(amb.b * i);
      grad.addColorStop(0,   `rgb(${ri}, ${gi}, ${bi})`);
      grad.addColorStop(0.5, `rgb(${ri >> 1}, ${gi >> 1}, ${bi >> 1})`);
      grad.addColorStop(1,   'rgb(0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
    }

    // Layer 1.5: Ethereal connections — spirit realm lines between nearby agents
    this._drawEtherealConnections(ctx);

    // Layer 1.7: Cluster auras — bluish-white glow around large groupings
    this._drawClusterAuras(ctx);

    // Layer 2: resource zones UNDER agents (so agents stay crisp)
    if (this.economy) this.economy.draw(ctx);

    // Layer 3: agents on top
    for (const agent of this.world.agents) {
      agent.draw(ctx);
    }

    // Layer 4: class indicators (wealth rings, crowns)
    if (this.wealthEngine) this.wealthEngine.draw(ctx);

    // Layer 5: env overlay + sentinel label
    this.world.drawOverlay(ctx);
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

  /**
   * Phase 2 (redesigned): Update living bonds each tick.
   * - Form bonds when agents are within interaction radius
   * - Bonds persist regardless of distance (up to max tether)
   * - ALL bonds for an agent sever permanently when it enters grief crisis/exit states
   */
  _updateBonds() {
    if (!this.world) return;
    const agents = this.world.agents;
    const formRadius = 55;   // same as interaction radius — bond forms on first contact
    const maxTether = 250;   // bonds stretch but snap if agents drift too far apart

    // Phase A: Sever — check for newly grief-stricken agents
    for (const a of agents) {
      if (this._severedAgents.has(a.id)) continue;
      if (a.griefState === 'CRISIS' || a.seppukuDone ||
          a.griefState === 'DISHONORED' || a.isSentinel) {
        // Sever ALL bonds involving this agent
        this._severedAgents.add(a.id);
        for (const [key, bond] of this._bonds) {
          if (bond.a === a.id || bond.b === a.id) {
            bond.severed = true;
            bond.severedAt = this.world.time;
          }
        }
      }
    }

    // Phase B: Form new bonds between nearby active agents
    const active = agents.filter(a =>
      !a.seppukuDone && !a.isSentinel && !this._severedAgents.has(a.id)
    );
    for (let i = 0; i < active.length; i++) {
      const a = active[i];
      for (let j = i + 1; j < active.length; j++) {
        const b = active[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > formRadius) continue;

        const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
        if (this._bonds.has(key)) continue; // already bonded

        this._bonds.set(key, {
          a: a.id < b.id ? a.id : b.id,
          b: a.id < b.id ? b.id : a.id,
          formedAt: this.world.time,
          severed: false,
          severedAt: 0
        });
      }
    }

    // Phase C: Snap overstretched bonds (distance > maxTether)
    const agentMap = new Map();
    for (const a of agents) agentMap.set(a.id, a);

    for (const [key, bond] of this._bonds) {
      if (bond.severed) continue;
      const aa = agentMap.get(bond.a);
      const bb = agentMap.get(bond.b);
      if (!aa || !bb) { bond.severed = true; continue; }
      const dx = bb.x - aa.x, dy = bb.y - aa.y;
      if (dx * dx + dy * dy > maxTether * maxTether) {
        bond.severed = true;
        bond.severedAt = this.world.time;
      }
    }

    // Phase D: Garbage collect old severed bonds (fade-out complete after ~120 ticks)
    for (const [key, bond] of this._bonds) {
      if (bond.severed && this.world.time - bond.severedAt > 150) {
        this._bonds.delete(key);
      }
    }
  }

  /**
   * Phase 3: Cluster auras — barely visible bluish-white glow around large groupings.
   * Uses additive blending so overlapping agent glows merge naturally.
   */
  _drawClusterAuras(ctx) {
    if (!this.world) return;
    const agents = this.world.agents;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; // additive blend — overlapping glows stack

    for (const a of agents) {
      if (a.seppukuDone || a.isSentinel) continue;
      const cluster = a.clusterSize || 0;
      if (cluster < 4) continue; // only aura for groups of 5+

      // Scale intensity and radius with cluster density
      const density = Math.min(1, (cluster - 4) / 10); // ramps 4→14 neighbors
      const radius = 30 + density * 50; // 30px to 80px
      const alpha = density * 0.025; // very faint — additive stacking does the work

      const grad = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, radius);
      grad.addColorStop(0,   `rgba(180, 200, 255, ${alpha})`);   // bluish-white center
      grad.addColorStop(0.5, `rgba(140, 170, 240, ${alpha * 0.5})`);
      grad.addColorStop(1,   'rgba(100, 140, 220, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(a.x, a.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * Phase 2 (redesigned): Draw living bond lines between agents.
   * Persistent connections rendered as fluid bezier curves.
   * Color encodes stress: healthy=cyan, stressed=amber, grief=red.
   * Severed bonds fade out with a dying flicker.
   */
  _drawEtherealConnections(ctx) {
    if (!this.world) return;
    if (this._bonds.size === 0) return;

    const agents = this.world.agents;
    const agentMap = new Map();
    for (const a of agents) agentMap.set(a.id, a);

    const time = this.world.time;
    const now = Date.now(); // for smooth visual oscillation independent of sim tick

    ctx.save();

    for (const [key, bond] of this._bonds) {
      const aa = agentMap.get(bond.a);
      const bb = agentMap.get(bond.b);
      if (!aa || !bb) continue;

      const dx = bb.x - aa.x, dy = bb.y - aa.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue;

      // ── Stress metric: average grief of the two connected agents ──
      const avgGrief = (aa.griefLevel + bb.griefLevel) / 2;
      const avgTrust = (aa.trustCharge + bb.trustCharge) / 2;
      // stress runs 0 (peaceful) → 1 (crisis)
      const stress = Math.min(1, avgGrief * 1.5 + (1 - avgTrust) * 0.3);

      // ── Color: cyan (healthy) → amber (stressed) → red (grief) ──
      let r, g, b;
      if (stress < 0.4) {
        // Cyan to amber transition
        const t = stress / 0.4;
        r = Math.round(60 + t * 195);    // 60 → 255
        g = Math.round(220 - t * 55);    // 220 → 165
        b = Math.round(230 - t * 230);   // 230 → 0
      } else {
        // Amber to red transition
        const t = (stress - 0.4) / 0.6;
        r = 255;
        g = Math.round(165 - t * 125);   // 165 → 40
        b = Math.round(t * 15);          // 0 → 15
      }

      // ── Alpha and width ──
      let alpha, lineW;

      if (bond.severed) {
        // Dying bond — flicker and fade
        const age = time - bond.severedAt;
        const fade = Math.max(0, 1 - age / 120); // 120-tick fade
        const flicker = 0.5 + 0.5 * Math.sin(age * 0.8); // rapid flicker
        alpha = fade * flicker * 0.35;
        lineW = 1.0 * fade;
        // Override color to deep red for severed bonds
        r = 200; g = 30; b = 30;
      } else {
        // Living bond — bolder than the old version, slight distance fade
        const stretch = dist / 250; // 0 at touching, 1 at max tether
        alpha = 0.18 + (1 - stretch) * 0.22; // 0.18 to 0.40
        lineW = 1.5 + (1 - stretch) * 1.0;   // 1.5 to 2.5
      }

      if (alpha < 0.01) continue;

      // ── Bezier control point — organic breathing curve ──
      // Midpoint + perpendicular offset that oscillates over time
      // Each bond has a unique phase based on its key hash
      const mx = (aa.x + bb.x) / 2;
      const my = (aa.y + bb.y) / 2;

      // Perpendicular direction
      const nx = -dy / dist;
      const ny = dx / dist;

      // Unique oscillation per bond — uses agent IDs for stable phase offset
      const phase = (bond.a * 7 + bond.b * 13) % 100 / 100 * Math.PI * 2;
      const breathe = Math.sin(now / 1800 + phase) * (8 + dist * 0.06);

      const cpx = mx + nx * breathe;
      const cpy = my + ny * breathe;

      // ── Draw ──
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.lineWidth = lineW;
      ctx.beginPath();
      ctx.moveTo(aa.x, aa.y);
      ctx.quadraticCurveTo(cpx, cpy, bb.x, bb.y);
      ctx.stroke();
    }

    ctx.restore();
  }
};

// Global for UI
window.K26 = window.MurmurationModules.K26;
