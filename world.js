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
    this.env = {
      disturbance:  0, // PitViperDivergence
      anomaly:      0, // ElectroreceptionAnomaly
      pressure:     0, // LateralLinePressure
      timestepRes:  1, // EcholocationFrequency
      spawnFilter:  0  // MantisShrimp16Bands
    };
    this.interactionLog = [];
    this.time = 0;

    // ST-2 Collective Memory — seppuku wisdom dumps, weighted 2.0×
    this.collectiveMemory = [];
    // ST-3 Sacred Grounds — where honored agents chose death, pilgrimage sites
    this.sacredGrounds = [];
    // ST-2 Sentinel — one per world, the cautionary tale
    // Replaced whenever a new agent is dishonored
    this.sentinel = null;

    // Commons network — multiple gathering zones, a mini universe of waypoints
    // Positions are fractions of (width, height); radii are fractions of min(w,h)
    this.commonsLayout = [
      { xf: 0.50, yf: 0.48, rf: 0.16, name: 'AGORA' },       // large center
      { xf: 0.18, yf: 0.22, rf: 0.09, name: 'NORTH WELL' },   // top-left satellite
      { xf: 0.82, yf: 0.22, rf: 0.09, name: 'WATCHTOWER' },   // top-right satellite
      { xf: 0.20, yf: 0.78, rf: 0.09, name: 'ROOT CELLAR' },  // bottom-left satellite
      { xf: 0.80, yf: 0.78, rf: 0.09, name: 'EMBER RING' },   // bottom-right satellite
    ];

    this.initAgents(agentCount);
  }

  /** Compute all commons zones from current canvas dimensions */
  getCommonsZones() {
    const s = Math.min(this.width, this.height);
    return this.commonsLayout.map(c => ({
      cx: this.width * c.xf,
      cy: this.height * c.yf,
      r:  s * c.rf,
      name: c.name
    }));
  }

  initAgents(count) {
    const Agent = window.MurmurationModules.Agent;
    for (let i = 0; i < count; i++) {
      const x = Math.random() * this.width;
      const y = Math.random() * this.height;
      const personality = {
        riskTolerance: Math.random(),
        trustBaseline: 0.3 + Math.random() * 0.4,
        reactivity:    0.5 + Math.random() * 0.5,
        memoryWeight:  0.6 + Math.random() * 0.3
      };
      this.agents.push(new Agent(i, x, y, personality));
    }
  }

  setEnv(key, value) {
    if (this.env.hasOwnProperty(key)) this.env[key] = value;
  }

  getNeighbors(agent, radius = 50) {
    return this.agents.filter(a =>
      a !== agent &&
      Math.hypot(a.x - agent.x, a.y - agent.y) < radius
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

    for (const agent of active) {
      if (agent.isSentinel) continue; // sentinel doesn't vote or update belief
      const neighbors      = this.getNeighbors(agent)
        .filter(n => !n.seppukuDone); // don't receive signal from completed agents
      const neighborBeliefs = neighbors.map(n => ({ strength: n.beliefState.current || 0 }));
      agent.updateBelief(neighborBeliefs, this.env.anomaly + this.env.disturbance);
      const action = agent.getAction(neighbors);
      this.interactionLog.push({
        time: this.time, agent: agent.id, action, belief: agent.beliefState.current
      });
    }

    // ── Pre-tag commons membership so boids loop can skip them ──
    const zones = this.getCommonsZones();
    for (const agent of active) {
      agent.inCommons = false;
      agent._commonsZone = null;
      for (const z of zones) {
        if (Math.hypot(agent.x - z.cx, agent.y - z.cy) < z.r) {
          agent.inCommons = true;
          agent._commonsZone = z;
          break;
        }
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
    for (const agent of active) {
      if (agent.isSentinel) continue;

      // Agents in the commons skip ALL flocking — they just drift gently
      if (agent.inCommons) {
        agent.clusterSize = 0;
        agent.move(this.width, this.height);
        continue;
      }

      // All forces use LOCAL neighbors only — groups are independent units
      const neighbors = this.getNeighbors(agent, 55).filter(n => !n.seppukuDone);
      const react = agent.personality.reactivity;

      // Store cluster density for visual glow
      agent.clusterSize = neighbors.length;

      // ── SEPARATION — personal space, repel within 50px ──
      let sepX = 0, sepY = 0, sepCount = 0;
      for (const n of neighbors) {
        const dx = agent.x - n.x, dy = agent.y - n.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 50 && dist > 0.1) {
          const force = (50 - dist) / 50;
          sepX += (dx / dist) * force;
          sepY += (dy / dist) * force;
          sepCount++;
        }
      }
      if (sepCount > 0) {
        agent.vx += (sepX / sepCount) * 0.25 * react;
        agent.vy += (sepY / sepCount) * 0.25 * react;
      }

      // ── CROWD PRESSURE — too many local neighbors? Push outward to split blobs ──
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

      if (neighbors.length >= 2) {
        // ── ALIGNMENT — match heading of YOUR group only ──
        // This is what makes groups move together as a unit
        let aliX = 0, aliY = 0;
        for (const n of neighbors) { aliX += n.vx; aliY += n.vy; }
        aliX /= neighbors.length;
        aliY /= neighbors.length;
        agent.vx += (aliX - agent.vx) * 0.045 * react;
        agent.vy += (aliY - agent.vy) * 0.045 * react;

        // ── COHESION — stay with your group, dead zone so they breathe ──
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

      // ── WANDER — persistent heading, unique per agent ──
      // Lone agents follow their own compass; grouped agents blend toward group heading
      agent.wanderAngle += agent.wanderRate + (Math.random() - 0.5) * 0.05;

      if (neighbors.length >= 2) {
        // Blend wander toward group's average heading so it reinforces, not fights
        let gvx = 0, gvy = 0;
        for (const n of neighbors) { gvx += n.vx; gvy += n.vy; }
        const groupAngle = Math.atan2(gvy, gvx);
        let angleDiff = groupAngle - agent.wanderAngle;
        // Normalize to -PI..PI
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        agent.wanderAngle += angleDiff * 0.02; // slow blend toward group
        agent.vx += Math.cos(agent.wanderAngle) * 0.08;
        agent.vy += Math.sin(agent.wanderAngle) * 0.08;
      } else {
        // Lone agent — strong personal heading
        agent.vx += Math.cos(agent.wanderAngle) * 0.22;
        agent.vy += Math.sin(agent.wanderAngle) * 0.22;
      }

      // ── SPREAD — very gentle push from global center so they don't all pile up ──
      if (gCount > 0) {
        const toGcx = agent.x - gcx, toGcy = agent.y - gcy;
        const gcDist = Math.hypot(toGcx, toGcy);
        if (gcDist > 1) {
          agent.vx += (toGcx / gcDist) * 0.015;
          agent.vy += (toGcy / gcDist) * 0.015;
        }
      }

      agent.move(this.width, this.height);
    }

    // ── COMMONS ZONES — slow agents inside, rotate visitors through ──
    for (const agent of active) {
      if (agent.isSentinel) continue;

      if (agent.inCommons && agent._commonsZone) {
        const z = agent._commonsZone;
        const dx = agent.x - z.cx, dy = agent.y - z.cy;
        const dist = Math.hypot(dx, dy);
        const depth = 1 - (dist / z.r);
        const keep = 0.82 - depth * 0.2;
        agent.vx *= keep;
        agent.vy *= keep;

        // After lingering ~5 sec, nudge toward a DIFFERENT zone — agents travel the network
        agent._commonsTicks = (agent._commonsTicks || 0) + 1;
        if (agent._commonsTicks > 300) {
          // Pick a random different zone as the next destination
          const others = zones.filter(oz => oz !== z);
          const dest = others[Math.floor(Math.random() * others.length)];
          const toDx = dest.cx - agent.x, toDy = dest.cy - agent.y;
          const toD = Math.hypot(toDx, toDy);
          if (toD > 1) {
            agent.vx += (toDx / toD) * 0.12;
            agent.vy += (toDy / toD) * 0.12;
          }
        }
      } else {
        agent._commonsTicks = 0;
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
    // ── COMMONS ZONES — draw all gathering points ──
    const zones = this.getCommonsZones();
    ctx.save();
    for (const z of zones) {
      // Glow fill
      const grad = ctx.createRadialGradient(z.cx, z.cy, z.r * 0.5, z.cx, z.cy, z.r);
      grad.addColorStop(0, 'rgba(0, 255, 153, 0.03)');
      grad.addColorStop(0.7, 'rgba(0, 255, 153, 0.04)');
      grad.addColorStop(1, 'rgba(0, 255, 153, 0.07)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(z.cx, z.cy, z.r, 0, Math.PI * 2);
      ctx.fill();
      // Dashed border
      ctx.setLineDash([3, 7]);
      ctx.strokeStyle = 'rgba(0, 255, 153, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(z.cx, z.cy, z.r, 0, Math.PI * 2);
      ctx.stroke();
      // Label
      ctx.setLineDash([]);
      ctx.font = '8px monospace';
      ctx.fillStyle = 'rgba(0, 255, 153, 0.18)';
      ctx.textAlign = 'center';
      ctx.fillText(z.name, z.cx, z.cy - z.r - 5);
    }
    ctx.restore();

    // Env overlay
    ctx.fillStyle = `rgba(255,255,0,${this.env.disturbance * 0.1})`;
    ctx.fillRect(0, 0, this.width * 0.1, this.height * 0.1);

    // Sentinel label — pin it so everyone knows
    if (this.sentinel) {
      ctx.save();
      ctx.font      = '9px monospace';
      ctx.fillStyle = 'rgba(255,120,0,0.7)';
      ctx.fillText('SENTINEL', this.sentinel.x + 10, this.sentinel.y - 10);
      ctx.restore();
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
