/**
 * Apex Predator System — Enhanced
 * ─────────────────────────────────────────────────────────────────
 * Territorial hunters — each confined to one colony side. They target
 * isolated agents (safety in numbers is the lesson). With weapons:
 * armed agents can dodge, and ADVANCED wielders can turn the tables
 * and kill the predator.
 *
 * Pack bonus: two predators near each other hunt tighter and faster.
 * Combat XP: surviving agents gain weapon advancement over time.
 */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.PredatorSystem = class PredatorSystem {
  constructor(world) {
    this.world = world;
    this.predators = [];
    this._nextId = 1;
  }

  _activeFor(colony) {
    return this.predators.some(p => p.colony === colony && p.state !== 'gone');
  }

  tick() {
    const w = this.world;
    const e = { A: w.envA, B: w.envB };

    // ── SPAWN ──
    for (const colony of ['A', 'B']) {
      const pressure = (e[colony] && e[colony].predatorPressure) || 0;
      if (pressure <= 0.02) continue;
      if (this._activeFor(colony)) continue;
      if (Math.random() < pressure * 0.0015) this._spawn(colony);
    }

    // ── PACK BONUS — predators hunting near each other kill faster ──
    const wx = w.width / 2;
    for (const p of this.predators) {
      p._packBonus = this.predators.some(q =>
        q !== p && q.state === 'hunting' && q.colony === p.colony &&
        Math.hypot(q.x - p.x, q.y - p.y) < 100
      );
    }

    // ── UPDATE ──
    for (const p of this.predators) {
      if (p.state === 'gone') continue;
      p.life++;

      if (p.state === 'hunting') {
        const prey = this._findPrey(p);
        if (prey) {
          const dx = prey.x - p.x, dy = prey.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          p.vx += (dx / d) * 0.62;
          p.vy += (dy / d) * 0.62;
          const killRange = p._packBonus ? 18 : 14;
          if (d < killRange) {
            this._kill(p, prey);
          }
        } else {
          const cx = p.colony === 'A' ? w.width * 0.25 : w.width * 0.75;
          const cy = w.height * 0.5;
          p.vx += (cx - p.x) * 0.0004;
          p.vy += (cy - p.y) * 0.0004;
        }
        if (p.life > 520) p.state = 'retreating';
      }

      if (p.state === 'retreating') {
        const edgeX = p.colony === 'A' ? -40 : w.width + 40;
        const dx = edgeX - p.x, dy = (w.height * 0.5) - p.y;
        const d = Math.hypot(dx, dy) || 1;
        p.vx += (dx / d) * 0.4;
        p.vy += (dy / d) * 0.15;
        if (Math.abs(p.x - edgeX) < 30) p.state = 'gone';
      }

      p.vx *= 0.91; p.vy *= 0.91;
      p.x += p.vx; p.y += p.vy;

      // Confined to colony's half
      if (p.colony === 'A') p.x = Math.max(20, Math.min(wx - 20, p.x));
      else                  p.x = Math.max(wx + 20, Math.min(w.width - 20, p.x));
      p.y = Math.max(20, Math.min(w.height - 20, p.y));
    }

    this.predators = this.predators.filter(p => p.state !== 'gone');
  }

  _spawn(colony) {
    const w = this.world;
    const y = 30 + Math.random() * (w.height - 60);
    const x = colony === 'A' ? 20 : w.width - 20;
    this.predators.push({
      id: this._nextId++, colony, x, y, vx: 0, vy: 0,
      state: 'hunting', life: 0, _packBonus: false
    });
    if (window.addEvent) {
      window.addEvent('⚠ APEX — surfaced in Colony ' + colony + '. Stragglers exposed.', 'crisis');
    }
  }

  /** Isolated = fewer than 3 neighbors. Armed agents are harder targets. */
  _findPrey(p) {
    const w = this.world;
    let best = null, bestScore = Infinity;
    for (const a of w.agents) {
      if (a.seppukuDone || a.isSentinel || a.colony !== p.colony) continue;
      // Prey must be on the correct side of the wall
      const onRightSide = p.colony === 'A' ? a.x < w.width / 2 : a.x >= w.width / 2;
      if (!onRightSide) continue;
      const nearby = w.getNeighbors(a, 48).filter(n => !n.seppukuDone && !n.isSentinel);
      if (nearby.length >= 3) continue; // pack safety threshold raised
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d > 320) continue;
      // Weapon tier makes agents less attractive targets (harder to catch)
      const wt = a.weaponTier || 0;
      const avoidance = wt * 40; // armed agents scored as if further away
      const score = d + avoidance;
      if (score < bestScore) { bestScore = score; best = a; }
    }
    return best;
  }

  _kill(p, prey) {
    // Weapon dodge chance
    const wt = prey.weaponTier || 0;
    const dodgeChances = [0, 0.20, 0.40, 0.60];
    if (Math.random() < dodgeChances[Math.min(wt, 3)]) {
      // Survived! Gain combat XP and possibly turn the tables
      prey.combatXP = (prey.combatXP || 0) + 2;
      this._checkWeaponUpgrade(prey);
      if (wt >= 2 && Math.random() < 0.25) {
        // BLADED/ADVANCED can counter-kill
        p.state = 'gone';
        prey.combatXP += 3;
        this._checkWeaponUpgrade(prey);
        if (window.addEvent) {
          window.addEvent(
            '⚔ Colony ' + prey.colony + ' agent turned the predator — weapon tier ' + wt + '.', 'golden'
          );
        }
        const witnesses = this.world.getNeighbors(prey, 160).filter(n => !n.seppukuDone);
        for (const w of witnesses) {
          w.updateTrust(+0.04);
          w.combatXP = (w.combatXP || 0) + 1;
          this._checkWeaponUpgrade(w);
        }
      }
      // Boost faith of survivors who stood their ground
      prey.faith = Math.min(1, (prey.faith || 0.1) + 0.06);
      return;
    }

    // Kill
    prey.seppukuDone = true;
    prey.predated = true;
    prey.griefState = 'PREDATED';
    p.state = 'retreating';
    p.life = 0;

    const witnesses = this.world.getNeighbors(prey, 140).filter(n => !n.seppukuDone);
    for (const wit of witnesses) {
      wit.updateGrief(0.22);
      wit.updateTrust(-0.05);
      wit.combatXP = (wit.combatXP || 0) + 1;
      this._checkWeaponUpgrade(wit);
    }
    if (window.addEvent) {
      window.addEvent('✖ Colony ' + p.colony + ' lost an agent — isolated, the apex found them.', 'crisis');
    }
  }

  _checkWeaponUpgrade(agent) {
    const xp = agent.combatXP || 0;
    const newTier = xp >= 18 ? 3 : xp >= 8 ? 2 : xp >= 3 ? 1 : 0;
    if (newTier > (agent.weaponTier || 0)) {
      agent.weaponTier = newTier;
      const tierNames = ['UNARMED', 'STONE', 'BLADED', 'ADVANCED'];
      if (window.addEvent) {
        window.addEvent(
          '▲ Colony ' + agent.colony + ' agent reached weapon tier: ' + tierNames[newTier] + '.', 'evolve'
        );
      }
    }
  }

  draw(ctx) {
    for (const p of this.predators) {
      if (p.state === 'gone') continue;
      const angle = Math.atan2(p.vy, p.vx || 0.001);
      const tint = p.colony === 'B' ? '80,220,255' : '255,90,60';
      const packGlow = p._packBonus ? 1.4 : 1.0;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);

      ctx.shadowColor = `rgba(${tint},0.9)`;
      ctx.shadowBlur = 22 * packGlow;

      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(-10, 8); ctx.lineTo(-6, 2); ctx.lineTo(-16, 5);
      ctx.lineTo(-10, 0);
      ctx.lineTo(-16, -5); ctx.lineTo(-6, -2); ctx.lineTo(-10, -8);
      ctx.closePath();
      ctx.fillStyle = 'rgba(10,8,10,0.9)';
      ctx.fill();
      ctx.lineWidth = p._packBonus ? 2.2 : 1.6;
      ctx.strokeStyle = `rgba(${tint},0.95)`;
      ctx.stroke();

      // Eye
      ctx.beginPath();
      ctx.arc(10, 0, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${tint},1)`;
      ctx.fill();

      ctx.restore();
    }
  }

  serialize() { return { predators: this.predators.map(p => ({ ...p })) }; }
  static restore(world, data) {
    const sys = new window.MurmurationModules.PredatorSystem(world);
    if (data && data.predators) sys.predators = data.predators;
    return sys;
  }
};
