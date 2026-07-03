/**
 * Apex Predator System for Murmuration
 * ────────────────────────────────────────────────────────────────
 * Each colony has its own "Predator Pressure" slider. Turn it up and a
 * large hostile entity spawns on THAT colony's side of the wall and hunts
 * — not randomly, but the most ISOLATED agent it can find (low local
 * neighbor count). Stay clustered and you're safe; drift off alone and
 * you're prey. This is the single biggest lever for forcing real flocking-
 * for-safety behavior instead of ambient wandering.
 *
 * A kill sends a grief pulse through nearby survivors (they saw it happen),
 * which is what should cascade into tighter formations afterward.
 */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.PredatorSystem = class PredatorSystem {
  constructor(world) {
    this.world = world;
    this.predators = []; // { colony, x, y, vx, vy, state, life, id }
    this._nextId = 1;
  }

  /** One predator hunting per colony at a time keeps it readable. */
  _activeFor(colony) {
    return this.predators.some(p => p.colony === colony && p.state !== 'gone');
  }

  tick() {
    const w = this.world;
    const e = { A: w.envA, B: w.envB };

    // ── SPAWN ROLL — chance scales with that colony's own pressure slider ──
    for (const colony of ['A', 'B']) {
      const pressure = (e[colony] && e[colony].predatorPressure) || 0;
      if (pressure <= 0.02) continue;
      if (this._activeFor(colony)) continue;
      if (Math.random() < pressure * 0.0009) this._spawn(colony);
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
          p.vx += (dx / d) * 0.55;
          p.vy += (dy / d) * 0.55;
          if (d < 14) {
            this._kill(p, prey);
          }
        } else {
          // Nothing to chase — drift toward the colony's own territory center
          const cx = p.colony === 'A' ? w.width * 0.25 : w.width * 0.75;
          const cy = w.height * 0.5;
          p.vx += (cx - p.x) * 0.0004;
          p.vy += (cy - p.y) * 0.0004;
        }
        if (p.life > 640) p.state = 'retreating'; // gave up — long hunt with no kill
      }

      if (p.state === 'retreating') {
        // Head back off the map edge on its own side, then despawn
        const edgeX = p.colony === 'A' ? -40 : w.width + 40;
        const dx = edgeX - p.x, dy = (w.height * 0.5) - p.y;
        const d = Math.hypot(dx, dy) || 1;
        p.vx += (dx / d) * 0.4;
        p.vy += (dy / d) * 0.15;
        if (Math.abs(p.x - edgeX) < 30) p.state = 'gone';
      }

      p.vx *= 0.92; p.vy *= 0.92;
      p.x += p.vx; p.y += p.vy;

      // Stay confined to the hunted colony's own half — it's a territorial
      // threat, not a free-roaming one.
      const wx = w.width / 2;
      const margin = 30;
      if (p.colony === 'A') p.x = Math.max(margin, Math.min(wx - margin, p.x));
      else                  p.x = Math.max(wx + margin, Math.min(w.width - margin, p.x));
      p.y = Math.max(margin, Math.min(w.height - margin, p.y));
    }

    // Drop fully-gone predators
    this.predators = this.predators.filter(p => p.state !== 'gone');
  }

  _spawn(colony) {
    const w = this.world;
    const y = 30 + Math.random() * (w.height - 60);
    const x = colony === 'A' ? 20 : w.width - 20;
    this.predators.push({
      id: this._nextId++, colony, x, y, vx: 0, vy: 0, state: 'hunting', life: 0
    });
    if (window.addEvent) {
      window.addEvent('⚠ APEX PREDATOR — surfaced in Colony ' + colony + "'s territory. Stragglers are exposed.", 'crisis');
    }
  }

  /** Isolated = fewer than 2 neighbors within a tight cohesion radius. */
  _findPrey(p) {
    const w = this.world;
    let best = null, bestD = Infinity;
    for (const a of w.agents) {
      if (a.seppukuDone || a.isSentinel || a.colony !== p.colony) continue;
      const nearby = w.getNeighbors(a, 42).filter(n => !n.seppukuDone && !n.isSentinel);
      if (nearby.length >= 2) continue; // safe in a group
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d < 260 && d < bestD) { bestD = d; best = a; }
    }
    return best;
  }

  _kill(p, prey) {
    prey.seppukuDone = true;
    prey.predated = true;
    prey.griefState = 'PREDATED';
    p.state = 'retreating';
    p.life = 0;

    // Grief pulse through anyone who witnessed it
    const witnesses = this.world.getNeighbors(prey, 140).filter(n => !n.seppukuDone);
    for (const wit of witnesses) {
      wit.updateGrief(0.22);
      wit.updateTrust(-0.05);
    }
    if (window.addEvent) {
      window.addEvent('✖ Colony ' + p.colony + ' lost an agent to the predator — isolated, and it found them.', 'crisis');
    }
  }

  draw(ctx) {
    for (const p of this.predators) {
      if (p.state === 'gone') continue;
      const angle = Math.atan2(p.vy, p.vx || 0.001);
      const tint = p.colony === 'B' ? '80,220,255' : '255,90,60';

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);

      // Motion-trail glow
      ctx.shadowColor = `rgba(${tint},0.9)`;
      ctx.shadowBlur = 22;

      // Jagged angular hunter silhouette — not an agent dot, reads as a threat
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(-10, 8);
      ctx.lineTo(-6, 2);
      ctx.lineTo(-16, 5);
      ctx.lineTo(-10, 0);
      ctx.lineTo(-16, -5);
      ctx.lineTo(-6, -2);
      ctx.lineTo(-10, -8);
      ctx.closePath();
      ctx.fillStyle = `rgba(10,8,10,0.9)`;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = `rgba(${tint},0.95)`;
      ctx.stroke();

      // Eye glint
      ctx.beginPath();
      ctx.arc(10, 0, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${tint},1)`;
      ctx.fill();

      ctx.restore();
    }
  }

  serialize() {
    return { predators: this.predators.map(p => ({ ...p })) };
  }
  static restore(world, data) {
    const sys = new window.MurmurationModules.PredatorSystem(world);
    if (data && data.predators) sys.predators = data.predators;
    return sys;
  }
};
