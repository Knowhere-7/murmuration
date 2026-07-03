/**
 * Capture the Flag — War Games for Murmuration
 * ────────────────────────────────────────────────────────────────
 * Two colonies, one wall, two gates. Turn CTF on and each flag sits deep in
 * its own colony's home territory. Carrying the ENEMY flag back to your own
 * base scores a point — and you can be intercepted en route, dropping the
 * flag wherever you're tagged.
 *
 * Squads are never assigned by the user — they emerge every tick from each
 * agent's own personality (risk tolerance, trust baseline, reactivity) plus
 * the live situation (is my colony already carrying? is a raid detected?).
 * That's the point: two army-ant colonies developing their own tactics.
 *
 *   RAIDER   — high risk, low trust baseline. Pushes toward the enemy flag.
 *   DEFENDER — high trust baseline. Orbits/guards its own base and gates.
 *   ESCORT   — forms once a teammate is carrying; swarms the carrier home.
 *   SCOUT    — high reactivity. Patrols the wall/gates; a scout spotting an
 *              enemy raider nearby raises a short alarm that pulls extra
 *              teammates into DEFENDER — an alarm-pheromone recruit signal,
 *              same trick real army ants use.
 *
 * Modes:
 *   skirmish  — running score, no end, no eliminations. Built for full,
 *               ongoing 100/100 colonies.
 *   attrition — first to 3 captures wins, OR last colony standing. Raiders
 *               surrounded deep in enemy territory can be captured (removed)
 *               — real stakes, real "war of attrition."
 */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.CTFSystem = class CTFSystem {
  constructor(world) {
    this.world = world;
    this.enabled = false;
    this.mode = 'skirmish'; // 'skirmish' | 'attrition'
    this.score = { A: 0, B: 0 };
    this.matchOver = false;
    this.winner = null;
    this.ATTRITION_TARGET = 3;

    const W = world.width, H = world.height;
    this.flags = {
      A: this._freshFlag('A', W * 0.08, H * 0.5),
      B: this._freshFlag('B', W * 0.92, H * 0.5)
    };
    this._alarmTicks = { A: 0, B: 0 }; // scout-raised alarm window, per defending colony
  }

  _freshFlag(owner, hx, hy) {
    return { owner, homeX: hx, homeY: hy, x: hx, y: hy, state: 'home', carrier: null, dropTimer: 0 };
  }

  /** Call once when the user flips CTF on. Auto-opens both gates — the
   *  border opens for war — but the user retains full manual control after. */
  start(mode) {
    this.enabled = true;
    this.mode = mode || this.mode;
    this.matchOver = false;
    this.winner = null;
    this.score = { A: 0, B: 0 };
    const W = this.world.width, H = this.world.height;
    this.flags.A = this._freshFlag('A', W * 0.08, H * 0.5);
    this.flags.B = this._freshFlag('B', W * 0.92, H * 0.5);
    this.world.wall.gates.forEach(g => g.open = true);
    if (window.addEvent) window.addEvent('⚔ WAR GAMES BEGIN — ' + this.mode.toUpperCase() + '. Both gates thrown open.', 'crisis');
  }

  stop() {
    this.enabled = false;
    this.matchOver = false;
    for (const a of this.world.agents) a._ctfRole = null;
  }

  otherColony(c) { return c === 'A' ? 'B' : 'A'; }

  /** Emergent role assignment — recomputed every tick, cheap (O(n), no allocation churn). */
  _assignRoles() {
    const w = this.world;
    const hasCarrier = { A: false, B: false };
    for (const c of ['A', 'B']) {
      const f = this.flags[this.otherColony(c)];
      if (f.state === 'carried' && f.carrier && f.carrier.colony === c) hasCarrier[c] = true;
    }

    for (const a of w.agents) {
      if (a.seppukuDone || a.isSentinel || a.colony !== 'A' && a.colony !== 'B') continue;
      if (a.isKing) { a._ctfRole = 'king'; continue; } // kings hold court, never raid/defend/scout
      const c = a.colony;
      const isCarrier = this.flags.A.carrier === a || this.flags.B.carrier === a;
      if (isCarrier) { a._ctfRole = 'carrier'; continue; }
      const p = a.personality;
      // Natural role from personality first — defenders ALWAYS hold the line,
      // even mid-raid. Only offense-oriented roles (raider/scout) pivot to
      // escort once a carrier exists, so home is never left undefended.
      // Low-rank agents crave the fastest path to honor in the whole sim —
      // combat — so they lean toward raiding a little more eagerly than a
      // pure personality read would suggest. The higher you've already
      // climbed, the less you need to prove.
      const gloryHunger = (a.rank === 'GRUNT' || a.rank === 'DECORATED') ? 0.15 : (a.rank === 'VETERAN' ? 0.06 : 0);
      let natural;
      if (p.reactivity > 0.85 && Math.random() < 0.4) natural = 'scout';
      else if (p.riskTolerance + gloryHunger > 0.55 && p.trustBaseline < 0.55) natural = 'raider';
      else natural = 'defender';
      if (hasCarrier[c] && natural !== 'defender') { a._ctfRole = 'escort'; continue; }
      a._ctfRole = natural;
    }
  }

  /** Scouts near the wall/gates who spot an enemy raider raise a short alarm
   *  that recruits extra defenders for their colony — an alarm-pheromone. */
  _scoutAlarm() {
    const w = this.world;
    for (const c of ['A', 'B']) this._alarmTicks[c] = Math.max(0, this._alarmTicks[c] - 1);
    for (const a of w.agents) {
      if (a._ctfRole !== 'scout' || a.seppukuDone) continue;
      const enemies = w.agents.filter(o =>
        !o.seppukuDone && o.colony === this.otherColony(a.colony) &&
        o._ctfRole === 'raider' && Math.hypot(o.x - a.x, o.y - a.y) < 90);
      if (enemies.length > 0) this._alarmTicks[a.colony] = 120;
    }
  }

  /** The crown changes how an agent moves. Kings don't raid, defend, or scout —
   *  they hold court. They amble slowly within their own colony's territory
   *  (their "lands") and only really travel when pulled home from wandering
   *  too far — never chasing a flag, never crossing the wall looking for a
   *  fight. Subjects, in turn, drift gently toward their living king — a loyal
   *  gravity layered on top of whatever role they're already playing. Runs
   *  every tick regardless of whether War Games is currently toggled on. */
  _royalCourt(activeAgents) {
    const w = this.world;
    const kings = {
      A: w.agents.find(a => a.colony === 'A' && a.isKing && !a.seppukuDone) || null,
      B: w.agents.find(a => a.colony === 'B' && a.isKing && !a.seppukuDone) || null
    };
    this._kings = kings;
    if (!kings.A && !kings.B) return;

    for (const colony of ['A', 'B']) {
      const king = kings[colony];
      if (!king) continue;
      king._ctfRole = 'king';
      const home = this.flags[colony];
      const dx = home.homeX - king.x, dy = home.homeY - king.y;
      const d = Math.hypot(dx, dy) || 1;
      const lands = Math.min(w.width, w.height) * 0.32; // his own territory's radius
      if (d > lands) {
        // Wandered past his own lands — head home, firmly but unhurried
        king.vx += (dx / d) * 0.12;
        king.vy += (dy / d) * 0.12;
      } else {
        // Ambling patrol inside his lands — slow, regal, no urgency.
        // Damp out anything that would make him dart like a raider.
        king.vx *= 0.9;
        king.vy *= 0.9;
        king.wanderAngle += king.wanderRate * 0.4;
        king.vx += Math.cos(king.wanderAngle) * 0.035;
        king.vy += Math.sin(king.wanderAngle) * 0.035;
      }
    }

    // Subjects gravitate toward their own colony's king — a loyal pull, not a stampede
    for (const a of activeAgents) {
      if (a.isKing || a.isSentinel) continue;
      const king = kings[a.colony];
      if (!king) continue;
      const dx = king.x - a.x, dy = king.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > 70) {
        a.vx += (dx / d) * 0.018;
        a.vy += (dy / d) * 0.018;
      }
    }
  }

  /** Steering forces — called from World.advanceStep(), before the wall
   *  collision pass, same slot the zone-raid forces use. */
  applyForces(activeAgents) {
    this._royalCourt(activeAgents);
    if (!this.enabled || this.matchOver) return;
    this._assignRoles();
    this._scoutAlarm();

    const w = this.world;
    for (const a of activeAgents) {
      if (a.isSentinel || (a.colony !== 'A' && a.colony !== 'B')) continue;
      const role = a._ctfRole;
      if (!role) continue;

      if (role === 'carrier') {
        // Head home — hard toward own base, this is the whole point of a raid
        const home = this.flags[a.colony];
        const dx = home.homeX - a.x, dy = home.homeY - a.y;
        const d = Math.hypot(dx, dy) || 1;
        a.vx += (dx / d) * 0.30;
        a.vy += (dy / d) * 0.30;
      } else if (role === 'raider') {
        const targetFlag = this.flags[this.otherColony(a.colony)];
        if (targetFlag.state !== 'carried') {
          const dx = targetFlag.x - a.x, dy = targetFlag.y - a.y;
          const d = Math.hypot(dx, dy) || 1;
          a.vx += (dx / d) * 0.16;
          a.vy += (dy / d) * 0.16;
        }
      } else if (role === 'defender') {
        // Loose orbit around own base, tightened if a scout raised the alarm
        const home = this.flags[a.colony];
        const dx = home.x - a.x, dy = home.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const guardR = this._alarmTicks[a.colony] > 0 ? 55 : 110;
        if (d > guardR) { a.vx += (dx / d) * 0.10; a.vy += (dy / d) * 0.10; }
        else { a.vx += (-dy / d) * 0.05; a.vy += (dx / d) * 0.05; } // orbit tangent

        // Converge on an enemy intruder found near our own base
        const intruder = w.agents.find(o => !o.seppukuDone && o.colony === this.otherColony(a.colony)
          && Math.hypot(o.x - home.x, o.y - home.y) < 140);
        if (intruder) {
          const idx = intruder.x - a.x, idy = intruder.y - a.y;
          const idd = Math.hypot(idx, idy) || 1;
          a.vx += (idx / idd) * 0.14;
          a.vy += (idy / idd) * 0.14;
        }
      } else if (role === 'escort') {
        // Swarm around whichever teammate is currently carrying
        const f = this.flags.A.carrier && this.flags.A.carrier.colony === a.colony ? this.flags.A
                : this.flags.B.carrier && this.flags.B.carrier.colony === a.colony ? this.flags.B : null;
        if (f && f.carrier) {
          const dx = f.carrier.x - a.x, dy = f.carrier.y - a.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d > 34) { a.vx += (dx / d) * 0.13; a.vy += (dy / d) * 0.13; }
        }
      } else if (role === 'scout') {
        // Range along the wall seam, own side only
        const wx = w.width / 2;
        const targetX = a.colony === 'A' ? wx - 60 : wx + 60;
        a.vx += (targetX - a.x) * 0.0009;
      }
    }

    this._resolvePickupsAndTags();
    this._checkAttritionCaptures(activeAgents);
    this._checkMatchEnd();
  }

  _resolvePickupsAndTags() {
    const w = this.world;
    for (const owner of ['A', 'B']) {
      const f = this.flags[owner];

      if (f.state === 'carried' && f.carrier) {
        // Flag rides its carrier
        f.x = f.carrier.x; f.y = f.carrier.y;
        if (f.carrier.seppukuDone) { f.state = 'dropped'; f.carrier = null; continue; }

        // Tagged by the flag's own colony (defenders reclaiming) → drop
        const tagger = w.agents.find(o => !o.seppukuDone && o.colony === owner &&
          Math.hypot(o.x - f.x, o.y - f.y) < 16);
        if (tagger) {
          f.state = 'dropped'; f.carrier = null; f.dropTimer = 0;
          if (window.addEvent) window.addEvent('🏳 Colony ' + owner + ' intercepted their flag carrier — dropped in the field.', 'crisis');
          continue;
        }

        // Reached own home base of the CARRYING colony → score
        const home = this.flags[f.carrier.colony];
        if (Math.hypot(f.x - home.homeX, f.y - home.homeY) < 24) {
          this.score[f.carrier.colony]++;
          if (window.addEvent) window.addEvent('🚩 CAPTURE — Colony ' + f.carrier.colony + ' brought the flag home. Score ' + this.score.A + '–' + this.score.B, 'emerge');
          // Reset the captured flag back to its own home, unheld
          f.state = 'home'; f.carrier = null; f.dropTimer = 0;
          f.x = f.homeX; f.y = f.homeY;
        }
        continue;
      }

      if (f.state === 'dropped') {
        f.dropTimer++;
        // Owner colony recovers instantly on touch
        const recoverer = w.agents.find(o => !o.seppukuDone && o.colony === owner &&
          Math.hypot(o.x - f.x, o.y - f.y) < 16);
        if (recoverer) {
          f.state = 'home'; f.x = f.homeX; f.y = f.homeY;
          if (window.addEvent) window.addEvent('Colony ' + owner + ' recovered their flag.', 'trust');
          continue;
        }
        // Enemy raider can pick it back up and keep running (unaligned agents don't play)
        const raider = w.agents.find(o => !o.seppukuDone && o.colony !== owner && (o.colony === 'A' || o.colony === 'B') &&
          Math.hypot(o.x - f.x, o.y - f.y) < 16);
        if (raider) { f.state = 'carried'; f.carrier = raider; f.dropTimer = 0; continue; }
        // Unclaimed too long → resets home on its own
        if (f.dropTimer > 500) { f.state = 'home'; f.x = f.homeX; f.y = f.homeY; }
        continue;
      }

      // state === 'home' — any enemy colony agent reaching it captures it (unaligned agents don't play)
      const raider = w.agents.find(o => !o.seppukuDone && o.colony !== owner && (o.colony === 'A' || o.colony === 'B') &&
        Math.hypot(o.x - f.x, o.y - f.y) < 16);
      if (raider) {
        f.state = 'carried'; f.carrier = raider;
        if (window.addEvent) window.addEvent('🏴 Colony ' + raider.colony + ' seized Colony ' + owner + "'s flag from their home base!", 'crisis');
      }
    }
  }

  _checkAttritionCaptures(activeAgents) {
    if (this.mode !== 'attrition') return;
    const w = this.world;
    const isCommonRank = (a) => a.rank !== 'GENERAL' && a.rank !== 'HERO';
    for (const a of activeAgents) {
      if (a.seppukuDone || (a.colony !== 'A' && a.colony !== 'B') || a._ctfRole !== 'raider') continue;
      const home = this.flags[this.otherColony(a.colony)];
      const deepInEnemyTerritory = Math.hypot(a.x - home.x, a.y - home.y) < 150;
      if (!deepInEnemyTerritory) { a._surroundTicks = 0; continue; }
      const guards = w.agents.filter(o => !o.seppukuDone && o.colony === this.otherColony(a.colony) && o._ctfRole === 'defender' &&
        Math.hypot(o.x - a.x, o.y - a.y) < 26);

      // ── FIGHTING HARD — the rank-and-file's fastest path to honor. Anyone
      // below GENERAL earns a steady trickle just for standing in a real
      // fight, on both sides of it — combat pays better than any other task
      // in the sim, so the common soldiers have every reason to want it. ──
      if (guards.length > 0) {
        if (isCommonRank(a)) a.honor = (a.honor || 0) + 0.01;
        for (const g of guards) if (isCommonRank(g)) g.honor = (g.honor || 0) + 0.01;
      }

      if (guards.length >= 3) {
        a._surroundTicks = (a._surroundTicks || 0) + 1;
        if (a._surroundTicks > 240) {
          // ── HONOR — the guards who made the kill earn it, permanently ──
          for (const g of guards) {
            g.honor = (g.honor || 0) + 1;
            if (this.world.markHit) this.world.markHit(g, '255,150,60');
          }

          // ── The crown always vacates on death, win or lose ──
          if (a.isKing) a.isKing = false;

          // ── POSTHUMOUS TIER — not from title, from the actual effort and
          // honor brought to the clan. Everyone who falls in battle earns at
          // least HERO; enough lifetime honor earns LEGEND, and the very
          // greatest contributors earn GOD. Seppuku can never buy any of it. ──
          const lifetimeHonor = a.honor || 0;
          a.fallenRank = lifetimeHonor >= 20 ? 'GOD' : lifetimeHonor >= 10 ? 'LEGEND' : 'HERO';
          const tierIcon = a.fallenRank === 'GOD' ? '☀' : a.fallenRank === 'LEGEND' ? '⚔' : '★';
          if (window.addEvent) window.addEvent(tierIcon + ' Colony ' + a.colony + ' #' + a.id + ' has fallen in battle — ' + a.fallenRank + ', forever (' + lifetimeHonor.toFixed(2) + ' honor earned).', 'emerge');

          a.seppukuDone = true;
          a.ctfCaptured = true;
          if (this.world.markHit) this.world.markHit(a, '255,40,30');
          if (window.addEvent) window.addEvent('⚔ Colony ' + a.colony + ' raider captured deep in enemy territory — attrition claims another.', 'crisis');
        }
      } else {
        a._surroundTicks = 0;
      }
    }
    this._updateRanksAndCrown();
  }

  /** Living rank from accumulated honor — shared by rank recompute and by
   *  anything else that needs to know where an agent stands right now. */
  _rankFor(honor) {
    const LADDER = [[10, 'HERO'], [6, 'GENERAL'], [3, 'VETERAN'], [1, 'DECORATED']];
    for (const [t, n] of LADDER) if (honor >= t) return n;
    return 'GRUNT';
  }

  /** Recompute each living agent's rank from honor, and hand the crown to
   *  whichever living agent per colony holds the most honor. Succession by
   *  being outranked or by an ordinary death is silent — no posthumous tier,
   *  just the crown moving on (that only comes from falling in battle). */
  _updateRanksAndCrown() {
    const w = this.world;
    for (const colony of ['A', 'B']) {
      let best = null;
      for (const a of w.agents) {
        if (a.colony !== colony) continue;
        if (a.seppukuDone) continue;
        a.rank = this._rankFor(a.honor || 0);
        if ((a.honor || 0) > 0 && (!best || a.honor > best.honor)) best = a;
      }
      for (const a of w.agents) {
        if (a.colony !== colony) continue;
        const shouldBeKing = !!best && a === best;
        if (a.isKing && !shouldBeKing) a.isKing = false;
        if (shouldBeKing && !a.isKing) {
          a.isKing = true;
          if (window.addEvent) window.addEvent('♛ Colony ' + colony + ' crowns a new KING — #' + a.id + ' (' + a.honor + ' kills).', 'evolve');
        }
      }
    }
  }

  /** Top living-honor agent, and fallen-tier counts, per colony — for the HUD. */
  honorSummary(colony) {
    const agents = this.world.agents.filter(a => a.colony === colony);
    const king = agents.find(a => a.isKing) || null;
    const gods = agents.filter(a => a.fallenRank === 'GOD').length;
    const legends = agents.filter(a => a.fallenRank === 'LEGEND').length;
    const heroes = agents.filter(a => a.fallenRank === 'HERO').length;
    const topAlive = agents.filter(a => !a.seppukuDone).sort((a, b) => (b.honor || 0) - (a.honor || 0))[0] || null;
    return { king, gods, legends, heroes, topAlive };
  }

  _checkMatchEnd() {
    if (this.mode !== 'attrition' || this.matchOver) return;
    const w = this.world;
    const aliveA = w.agents.filter(a => !a.seppukuDone && a.colony === 'A').length;
    const aliveB = w.agents.filter(a => !a.seppukuDone && a.colony === 'B').length;
    let winner = null;
    if (this.score.A >= this.ATTRITION_TARGET) winner = 'A';
    else if (this.score.B >= this.ATTRITION_TARGET) winner = 'B';
    else if (aliveA === 0 && aliveB > 0) winner = 'B';
    else if (aliveB === 0 && aliveA > 0) winner = 'A';
    if (winner) {
      this.matchOver = true;
      this.winner = winner;
      if (window.addEvent) window.addEvent('🏆 WAR OVER — Colony ' + winner + ' wins the attrition match. ' + this.score.A + '–' + this.score.B, 'emerge');
    }
  }

  roleCounts(colony) {
    const counts = { raider: 0, defender: 0, escort: 0, scout: 0, carrier: 0 };
    for (const a of this.world.agents) {
      if (a.seppukuDone || a.colony !== colony || !a._ctfRole) continue;
      counts[a._ctfRole] = (counts[a._ctfRole] || 0) + 1;
    }
    return counts;
  }

  /** Honor overlay — always drawn (kills earned in a past match still matter),
   *  regardless of whether CTF is currently enabled. GRUNT has no glow at all;
   *  each living rank above it burns a little brighter gold. KING gets a
   *  crown ring. Falling in battle leaves a permanent monument — drawn even
   *  though the agent is dead, sized and lit by which tier they earned:
   *  HERO (★, modest), LEGEND (⚔, brighter), GOD (☀, the biggest and
   *  brightest thing on the field). */
  drawHonor(ctx) {
    const RANK_GLOW = { GRUNT: 0, DECORATED: 0.16, VETERAN: 0.32, GENERAL: 0.52, HERO: 0.78 };
    const MONUMENT = {
      HERO:   { scale: 1.5, glyph: '★', color: '255,220,140' },
      LEGEND: { scale: 2.2, glyph: '⚔', color: '255,205,90' },
      GOD:    { scale: 3.2, glyph: '☀', color: '255,245,190' }
    };
    const now = Date.now();
    for (const a of this.world.agents) {
      if (a.fallenRank) {
        const m = MONUMENT[a.fallenRank];
        const pulse = 0.6 + 0.4 * Math.sin(now / 500 + a.id);
        const r = (a.radius + 8) * m.scale;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const grad = ctx.createRadialGradient(a.x, a.y, 1, a.x, a.y, r);
        grad.addColorStop(0, `rgba(${m.color},${0.5 * pulse})`);
        grad.addColorStop(0.5, `rgba(${m.color},${0.18 * pulse})`);
        grad.addColorStop(1, `rgba(${m.color},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.font = Math.round((a.radius + 6) * Math.min(1.6, m.scale)) + 'px serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = `rgba(${m.color},0.95)`;
        ctx.fillText(m.glyph, a.x, a.y - a.radius - 5);
        ctx.restore();
        continue;
      }
      if (a.seppukuDone) continue;
      if (a.isKing) {
        const pulse = 0.6 + 0.4 * Math.sin(now / 450);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const r = a.radius + 9;
        const grad = ctx.createRadialGradient(a.x, a.y, a.radius * 0.5, a.x, a.y, r * 1.8);
        grad.addColorStop(0, `rgba(255,210,70,${0.35 + 0.25 * pulse})`);
        grad.addColorStop(1, 'rgba(255,210,70,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(a.x, a.y, r * 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(255,215,0,${0.6 + 0.35 * pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(a.x, a.y, a.radius + 7, 0, Math.PI * 2); ctx.stroke();
        ctx.font = Math.round(a.radius + 7) + 'px serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(255,225,140,0.95)';
        ctx.fillText('♛', a.x, a.y - a.radius - 8);
        ctx.restore();
        continue;
      }
      const glow = RANK_GLOW[a.rank] || 0;
      if (glow <= 0) continue;
      const pulse = 0.6 + 0.4 * Math.sin(now / 600 + a.id);
      const r = a.radius + 4 + glow * 11;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const grad = ctx.createRadialGradient(a.x, a.y, a.radius * 0.4, a.x, a.y, r);
      grad.addColorStop(0, `rgba(255,205,60,${glow * 0.5 * pulse})`);
      grad.addColorStop(1, 'rgba(255,205,60,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  draw(ctx) {
    if (!this.enabled) return;
    for (const owner of ['A', 'B']) {
      const f = this.flags[owner];
      const tint = owner === 'B' ? '80,220,255' : '190,140,255';

      // Tether from carrier back to the flag's home, so a raid in progress reads at a glance
      if (f.state === 'carried' && f.carrier) {
        ctx.save();
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = `rgba(${tint},0.35)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(this.flags[f.carrier.colony].homeX, this.flags[f.carrier.colony].homeY);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.shadowColor = `rgba(${tint},0.9)`;
      ctx.shadowBlur = f.state === 'carried' ? 18 : 10;
      // Pole
      ctx.strokeStyle = `rgba(${tint},0.9)`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -14); ctx.stroke();
      // Pennant
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(12, -9);
      ctx.lineTo(0, -4);
      ctx.closePath();
      ctx.fillStyle = f.state === 'dropped' ? `rgba(${tint},0.35)` : `rgba(${tint},0.85)`;
      ctx.fill();
      ctx.restore();
    }
  }
};
