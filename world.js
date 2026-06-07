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

    // Commons network — contested resource nodes. Each has supply (0-1) that
    // depletes under occupation and regenerates when empty. Holding a zone
    // provides trust recovery; depleted zones punish occupants until they leave.
    // controller: null | 'A' | 'B' | 'CONTESTED'
    this.commonsLayout = [
      { xf: 0.50, yf: 0.48, rf: 0.16, name: 'AGORA',       supply: 1.0, maxOccupants: 10, controller: null, occupantCount: 0, wisdomTicks: 0 },
      { xf: 0.18, yf: 0.22, rf: 0.09, name: 'NORTH WELL',  supply: 1.0, maxOccupants: 5,  controller: null, occupantCount: 0, wisdomTicks: 0 },
      { xf: 0.82, yf: 0.22, rf: 0.09, name: 'WATCHTOWER',  supply: 1.0, maxOccupants: 5,  controller: null, occupantCount: 0, wisdomTicks: 0 },
      { xf: 0.20, yf: 0.78, rf: 0.09, name: 'ROOT CELLAR', supply: 1.0, maxOccupants: 5,  controller: null, occupantCount: 0, wisdomTicks: 0 },
      { xf: 0.80, yf: 0.78, rf: 0.09, name: 'EMBER RING',  supply: 1.0, maxOccupants: 5,  controller: null, occupantCount: 0, wisdomTicks: 0 },
    ];

    this.initAgents(agentCount);
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

    // ── RESOURCE CONTENTION — supply depletes under occupation, regenerates empty ──
    for (const layout of this.commonsLayout) {
      // Gather occupants by checking agents whose tagged zone matches this layout name
      const occupants = active.filter(a => a._commonsZone && a._commonsZone.name === layout.name);
      layout.occupantCount = occupants.length;

      // Determine controller
      const cA = occupants.filter(a => (a.colony || 'A') === 'A').length;
      const cB = occupants.filter(a => a.colony === 'B').length;
      const prevController = layout.controller;
      if (occupants.length === 0)         layout.controller = null;
      else if (cA > cB * 1.5)            layout.controller = 'A';
      else if (cB > cA * 1.5)            layout.controller = 'B';
      else                               layout.controller = 'CONTESTED';

      if (occupants.length > 0) {
        // Supply drains — more occupants = faster drain; overcrowding accelerates it
        const pressure = occupants.length / (layout.maxOccupants || 5);
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

        // Log contested takeover events
        if (prevController && prevController !== 'CONTESTED' && layout.controller !== prevController) {
          if (window.logLine) {
            const newCtrl = layout.controller || 'none';
            window.logLine(`⚔ ${layout.name} — control shift → ${newCtrl}`, 'warn');
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

    // ── DESPERATE PULL — low-trust agents seek the nearest well-supplied zone ──
    // This creates goal-directed movement without explicit pathfinding
    for (const agent of active) {
      if (agent.isSentinel || agent.inCommons) continue;
      if (agent.trustCharge > 0.35) continue; // only desperate agents are driven

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

      // Pick zone color by controller
      // Colony A = violet/pink (270°), Colony B = teal (180°), contested = amber, neutral = canopy green
      let r, g, b;
      if      (ctrl === 'A')         { r=140; g=60;  b=220; } // violet
      else if (ctrl === 'B')         { r=20;  g=200; b=200; } // teal
      else if (ctrl === 'CONTESTED') { r=220; g=140; b=20;  } // amber
      else                           { r=70;  g=110; b=80;  } // neutral canopy

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

    // Env overlay — disturbance bleeds Rust Blood at the corner (not clinical yellow)
    ctx.fillStyle = `rgba(160,45,40,${this.env.disturbance * 0.12})`;
    ctx.fillRect(0, 0, this.width * 0.1, this.height * 0.1);

    // Sentinel label — pin it so everyone knows
    if (this.sentinel) {
      ctx.save();
      ctx.font      = '9px monospace';
      ctx.fillStyle = 'rgba(220,120,20,0.75)'; // Ember
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
