/**
 * Wild Animal System for Murmuration
 * ─────────────────────────────────────────────────────────────────
 * Unaligned, territorial beasts — not predators (which serve a colony),
 * not agents (they have no belief, faith, or economy). They roam the
 * full board and attack any agent who enters their territory.
 *
 * They are the world's indifferent danger — not evil, just wild.
 * Their presence forces colonies to evolve or die.
 *
 * Weapon tier is the ONLY defense. An ADVANCED agent can kill a wild
 * and the kill drops a resource bloom that nearby agents can harvest.
 *
 * Wilds also pack: two wilds within 120px fight as one, boosting
 * their attack. This is emergent — they don't coordinate, they just
 * converge on the same territory.
 *
 * Colony 'U' (UNALIGNED) is already handled by world.js zone
 * controller logic — wilds feeding off a zone show up as CONTESTED.
 */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.WildSystem = class WildSystem {
  constructor(world) {
    this.world = world;
    this.wilds = [];
    this._nextId = 1;
    this._spawnCooldown = 0;
    this._resourceBlooms = []; // { x, y, energy, life }
  }

  tick() {
    const w = this.world;

    // ── SPAWN — up to 4 wilds at a time, spawning from map edges ──
    if (this._spawnCooldown > 0) {
      this._spawnCooldown--;
    } else if (this.wilds.length < 4) {
      if (Math.random() < 0.0012) {
        this._spawn();
        this._spawnCooldown = 300 + Math.floor(Math.random() * 400);
      }
    }

    // ── PACK DETECTION ──
    for (const wild of this.wilds) {
      wild._packNear = this.wilds.some(q =>
        q !== wild && q.state !== 'dead' &&
        Math.hypot(q.x - wild.x, q.y - wild.y) < 120
      );
    }

    // ── UPDATE ──
    for (const wild of this.wilds) {
      if (wild.state === 'dead') continue;
      wild.life++;

      // Drift: each wild has a home territory it orbits
      const tdx = wild.homeX - wild.x, tdy = wild.homeY - wild.y;
      const tdist = Math.hypot(tdx, tdy) || 1;

      if (wild.state === 'roaming') {
        // Slow drift toward home territory
        if (tdist > 80) {
          wild.vx += (tdx / tdist) * 0.08;
          wild.vy += (tdy / tdist) * 0.08;
        }
        // Wander offset so they don't just stand still
        wild.wanderAngle = (wild.wanderAngle || 0) + (Math.random() - 0.5) * 0.12;
        wild.vx += Math.cos(wild.wanderAngle) * 0.04;
        wild.vy += Math.sin(wild.wanderAngle) * 0.04;

        // Check for agents in territory
        const target = this._findTarget(wild);
        if (target) {
          wild.state = 'charging';
          wild._target = target.id;
        }

        // Age out after ~3 minutes and retreat off-edge
        if (wild.life > 10800) wild.state = 'retreating';

      } else if (wild.state === 'charging') {
        const target = w.agents.find(a => a.id === wild._target && !a.seppukuDone);
        if (!target) { wild.state = 'roaming'; wild._target = null; }
        else {
          const dx = target.x - wild.x, dy = target.y - wild.y;
          const d = Math.hypot(dx, dy) || 1;
          wild.vx += (dx / d) * 0.38;
          wild.vy += (dy / d) * 0.38;
          const strikeRange = wild._packNear ? 20 : 16;
          if (d < strikeRange) {
            this._strike(wild, target);
          }
          // Give up the charge if they get too far
          if (d > wild.territoryRadius * 2.5) { wild.state = 'roaming'; wild._target = null; }
        }

      } else if (wild.state === 'retreating') {
        // Head off the nearest edge
        const ex = wild.x < w.width / 2 ? -40 : w.width + 40;
        const ey = wild.y < w.height / 2 ? -40 : w.height + 40;
        wild.vx += (ex - wild.x) * 0.004;
        wild.vy += (ey - wild.y) * 0.004;
        if (wild.x < -30 || wild.x > w.width + 30 || wild.y < -30 || wild.y > w.height + 30) {
          wild.state = 'dead';
        }
      }

      wild.vx *= 0.90; wild.vy *= 0.90;
      wild.x += wild.vx; wild.y += wild.vy;
    }

    this.wilds = this.wilds.filter(w => w.state !== 'dead');

    // ── RESOURCE BLOOMS — short-lived energy hotspots from wild kills ──
    for (const bloom of this._resourceBlooms) {
      bloom.life++;
      // Nearby agents absorb energy from the bloom
      for (const a of w.agents) {
        if (a.seppukuDone || a.isSentinel) continue;
        if (Math.hypot(a.x - bloom.x, a.y - bloom.y) < 50) {
          a.energy = Math.min(1.0, (a.energy || 0.5) + 0.0015);
        }
      }
    }
    this._resourceBlooms = this._resourceBlooms.filter(b => b.life < 300);
    this._updateZoneContest();
  }

  _spawn() {
    const w = this.world;
    // Pick a random edge entry point
    const side = Math.floor(Math.random() * 4);
    let x, y;
    if (side === 0) { x = Math.random() * w.width; y = 0; }
    else if (side === 1) { x = w.width; y = Math.random() * w.height; }
    else if (side === 2) { x = Math.random() * w.width; y = w.height; }
    else { x = 0; y = Math.random() * w.height; }

    // Territory center somewhere in the interior
    const homeX = 80 + Math.random() * (w.width - 160);
    const homeY = 80 + Math.random() * (w.height - 160);

    this.wilds.push({
      id: this._nextId++,
      x, y, vx: 0, vy: 0,
      homeX, homeY,
      territoryRadius: 120 + Math.random() * 60,
      state: 'roaming',
      life: 0,
      wanderAngle: Math.random() * Math.PI * 2,
      _packNear: false,
      _target: null
    });
    if (window.addEvent) {
      window.addEvent('◈ A wild has entered the territory — territories are no longer safe.', 'crisis');
    }
  }

  _findTarget(wild) {
    for (const a of this.world.agents) {
      if (a.seppukuDone || a.isSentinel) continue;
      const d = Math.hypot(a.x - wild.homeX, a.y - wild.homeY);
      if (d < wild.territoryRadius) return a;
    }
    return null;
  }

  _strike(wild, agent) {
    const wt = agent.weaponTier || 0;
    // Dodge chance scales with weapon tier
    const dodgeChances = [0.05, 0.30, 0.55, 0.80];
    if (Math.random() < dodgeChances[Math.min(wt, 3)]) {
      // Survived — gain combat XP
      agent.combatXP = (agent.combatXP || 0) + 1;
      if (window.MurmurationModules.PredatorSystem) {
        const ps = { world: this.world };
        window.MurmurationModules.PredatorSystem.prototype._checkWeaponUpgrade.call(ps, agent);
      }
      // ADVANCED agents kill the wild and leave a resource bloom
      if (wt >= 3 && Math.random() < 0.55) {
        wild.state = 'dead';
        this._resourceBlooms.push({ x: wild.x, y: wild.y, energy: 0.3, life: 0 });
        this._awardZoneDominion(agent.colony, wild.x, wild.y);
        agent.combatXP += 3;
        agent.honor = (agent.honor || 0) + 2;
        if (window.addEvent) {
          window.addEvent(
            '◈ Colony ' + agent.colony + ' agent slew a wild — resources freed at the kill site.', 'golden'
          );
        }
      } else if (wt >= 2) {
        wild.state = 'roaming'; // chased off, not killed
        wild._target = null;
      }
      wild.state = wild.state === 'dead' ? 'dead' : 'roaming';
      return;
    }

    // Wound — grief + trust hit, but no seppuku (wilds don't kill like predators, they injure)
    agent.updateGrief(0.28);
    agent.updateTrust(-0.08);
    if (agent.energy != null) agent.energy = Math.max(0.08, agent.energy - 0.18);
    agent.combatXP = (agent.combatXP || 0) + 1;
    wild.state = 'roaming'; // strike and withdraw
    wild._target = null;

    const witnesses = this.world.getNeighbors(agent, 120).filter(n => !n.seppukuDone);
    for (const w of witnesses) {
      w.updateGrief(0.10);
      w.combatXP = (w.combatXP || 0) + 1;
    }
  }


  // ── ZONE CONTESTING — wilds near any zone type suppress its value ──
  _updateZoneContest() {
    const w = this.world;
    // Energy harvest zones (economy.zones use z.x / z.y)
    const energyZones = w.economy ? (w.economy.zones || []) : [];
    for (const z of energyZones) z._wildContested = false;
    // Territorial commons zones (commonsLayout use cx/cy resolved from xf/yf)
    const layoutZones = w.commonsLayout || [];
    for (const z of layoutZones) z._wildContested = false;
    for (const wild of this.wilds) {
      if (wild.state === 'dead') continue;
      for (const z of energyZones) {
        const d = Math.hypot(wild.x - z.x, wild.y - z.y);
        if (d < (z.radius || 60) + 40) z._wildContested = true;
      }
      for (const z of layoutZones) {
        const zx = z.xf * w.width, zy = z.yf * w.height;
        const r = z.rf * Math.min(w.width, w.height);
        const d = Math.hypot(wild.x - zx, wild.y - zy);
        if (d < r + 40) z._wildContested = true;
      }
    }
  }

  // ── KINGSHIP DOMINION — kills near zones boost zone capture for the killer's colony ──
  _awardZoneDominion(killerColony, wildX, wildY) {
    const w = this.world;
    const zones = w.economy ? (w.economy.zones || []) : [];
    let nearZone = false;
    for (const z of zones) {
      const d = Math.hypot(wildX - z.px * w.width, wildY - z.py * w.height);
      if (d < (z.radius || 60) + 80) {
        nearZone = true;
        // Clear the contest flag
        z._wildContested = false;
      }
    }
    // Accumulate colony-level dominion score (contributes to kingship)
    if (!w._wildDominion) w._wildDominion = { A: 0, B: 0 };
    w._wildDominion[killerColony] = (w._wildDominion[killerColony] || 0) + 1;
    const score = w._wildDominion[killerColony];
    // Milestone events
    if (score === 5 || score === 10 || score === 20 || score % 25 === 0) {
      if (window.addEvent) {
        window.addEvent(
          `◈ Colony ${killerColony} has cleared ${score} wilds — APEX HUNTERS. Their grip on the land tightens.`,
          score >= 20 ? 'golden' : 'emerge'
        );
      }
    }
    if (nearZone && window.addEvent) {
      window.addEvent(
        `◈ Colony ${killerColony} cleared a wild from their territory — zone opened, kingship advances.`,
        'golden'
      );
    }
  }
  draw(ctx) {
    // Draw resource blooms first (behind wilds)
    for (const bloom of this._resourceBlooms) {
      const alpha = Math.max(0, 1 - bloom.life / 300);
      const r = 20 + (bloom.life / 300) * 30;
      const grad = ctx.createRadialGradient(bloom.x, bloom.y, 2, bloom.x, bloom.y, r);
      grad.addColorStop(0, `rgba(255, 200, 80, ${alpha * 0.6})`);
      grad.addColorStop(1, `rgba(255, 140, 20, 0)`);
      ctx.beginPath();
      ctx.arc(bloom.x, bloom.y, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Draw wilds — amber circles, not the jagged predator shape
    for (const wild of this.wilds) {
      if (wild.state === 'dead') continue;
      ctx.save();

      const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.003 + wild.id);
      const isCharging = wild.state === 'charging';
      const amber = wild._packNear ? '255,120,0' : '255,160,30';
      const glow = isCharging ? 0.9 : 0.5 + pulse * 0.3;

      ctx.shadowColor = `rgba(${amber},${glow})`;
      ctx.shadowBlur = isCharging ? 28 : 14;

      // Outer ring — territory pulse when charging
      if (isCharging) {
        ctx.beginPath();
        ctx.arc(wild.x, wild.y, 10 + pulse * 3, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${amber},${0.3 + pulse * 0.3})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Body — amber oval
      ctx.beginPath();
      ctx.arc(wild.x, wild.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(20,10,0,0.9)`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${amber},0.95)`;
      ctx.lineWidth = wild._packNear ? 2.0 : 1.4;
      ctx.stroke();

      // Eye glints — two small dots at the front
      const angle = Math.atan2(wild.vy || 0.1, wild.vx || 0.1);
      for (const offset of [-1.5, 1.5]) {
        const ex = wild.x + Math.cos(angle) * 3.5 + Math.sin(angle) * offset;
        const ey = wild.y + Math.sin(angle) * 3.5 - Math.cos(angle) * offset;
        ctx.beginPath();
        ctx.arc(ex, ey, 1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${amber},0.9)`;
        ctx.fill();
      }

      ctx.restore();
    }
  }

  serialize() {
    return { wilds: this.wilds.map(w => ({ ...w })), blooms: this._resourceBlooms };
  }
  static restore(world, data) {
    const sys = new window.MurmurationModules.WildSystem(world);
    if (data) {
      if (data.wilds) sys.wilds = data.wilds;
      if (data.blooms) sys._resourceBlooms = data.blooms;
    }
    return sys;
  }
};



