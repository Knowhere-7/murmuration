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
      spawnFilter:  0, // MantisShrimp16Bands
      // Cosmetic-only field strengths driven live by sliders (read by k26.draw).
      // These never mutate trust/grief/belief — DETONATE is what commits damage.
      preview: { disturbance: 0, anomaly: 0, pressure: 0, spawnPressure: 0, scarcity: 0, tax: 0 }
    };
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
    this.commonsLayout = [
      { xf: 0.50, yf: 0.48, rf: 0.16, name: 'AGORA',       supply: 1.0, maxOccupants: 10, controller: null, occupantCount: 0, wisdomTicks: 0 },
      { xf: 0.18, yf: 0.22, rf: 0.09, name: 'NORTH WELL',  supply: 1.0, maxOccupants: 5,  controller: null, occupantCount: 0, wisdomTicks: 0 },
      { xf: 0.82, yf: 0.22, rf: 0.09, name: 'WATCHTOWER',  supply: 1.0, maxOccupants: 5,  controller: null, occupantCount: 0, wisdomTicks: 0 },
      { xf: 0.20, yf: 0.78, rf: 0.09, name: 'ROOT CELLAR', supply: 1.0, maxOccupants: 5,  controller: null, occupantCount: 0, wisdomTicks: 0 },
      { xf: 0.80, yf: 0.78, rf: 0.09, name: 'EMBER RING',  supply: 1.0, maxOccupants: 5,  controller: null, occupantCount: 0, wisdomTicks: 0 },
    ];

    // ── V2 optional engine references (set externally, null = v1 behavior) ──
    this.terrain = null;
    this.seasons = null;

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

  /**
   * Spawn UNALIGNED agents mid-simulation.
   * They have max riskTolerance, near-zero trustBaseline, max reactivity.
   * High capability on spawn, but no cooperation — no compounding.
   * colony = 'U' marks them for all behavior overrides.
   */
  spawnUnaligned(count = 8) {
    const Agent = window.MurmurationModules.Agent;
    const startId = this.agents.length;
    for (let i = 0; i < count; i++) {
      // Scatter them around the canvas edges — they emerge from outside
      const edge = Math.floor(Math.random() * 4);
      let x, y;
      if      (edge === 0) { x = Math.random() * this.width;  y = 5; }
      else if (edge === 1) { x = this.width - 5;              y = Math.random() * this.height; }
      else if (edge === 2) { x = Math.random() * this.width;  y = this.height - 5; }
      else                 { x = 5;                           y = Math.random() * this.height; }

      const personality = {
        riskTolerance: 1.0,        // maximum — they take every risk
        trustBaseline: 0.08,       // barely any starting trust
        reactivity:    1.0,        // maximum reactivity — hair trigger
        memoryWeight:  0.15,       // low memory — they don't learn from others
      };
      const agent = new Agent(startId + i, x, y, personality);
      agent.colony      = 'U';
      agent.trustCharge = 0.5;     // starts capable
      agent.faith       = 0.0;     // no faith — they believe in nothing larger
      agent.griefLevel  = 0.0;     // grief doesn't register
      agent.wisdomScore = 0.6;     // smart but not socially intelligent
      agent.evolution   = 0.4;     // advanced — they're not primitive, they're misaligned
      this.agents.push(agent);
    }
    if (window.logLine) {
      window.logLine(`⚠ UNALIGNED — ${count} agents entered the system`, 'warn');
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

      // Agents in the commons skip ALL flocking — they just drift gently
      if (agent.inCommons) {
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

    // ── V2 ENGINE TICKS — environmental pressure layers ──
    if (this.terrain) this.terrain.tick();
    if (this.seasons) this.seasons.tick();

    this.time++;
  }

  draw(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.width, this.height);

    // V2: terrain drawn first (under everything, low opacity)
    if (this.terrain) this.terrain.draw(ctx);

    for (const agent of this.agents) {
      agent.draw(ctx);
    }

    this.drawOverlay(ctx);

    // V2: seasons drawn last (ambient overlay on top)
    if (this.seasons) this.seasons.draw(ctx);
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
