/* ══════════════════════════════════════════════════════════════════════════
   ATTRITION — the blue-team range
   ──────────────────────────────────────────────────────────────────────────
   A branch of the Murmuration engine, the defensive counterpart to the pentest
   engine (murmuration-pentest.html, the red team). The pentest engine builds
   the weapon; Attrition is the defended system you test it against — the other
   half of the Batman Paradigm already named in pentest/ARCHITECTURE.md.

   This is a TRAINING RANGE, not the sim. Murmuration's claim is "behaviours no
   one wrote"; a training range has the opposite requirement — the scenario must
   be authored, repeatable, and operator-driven, or you cannot train against it.
   So authored roles, timers and unlocks are correct here where they would be
   wrong there.

   Ghost's spec, 2026-08-18:
     1. Unaligned = outside adversary: invade, occupy, harbor resources, starve.
     2. Kings stationary, guarded by a small detail — capture-the-king.
     3. King capture -> honor bleed that must be mitigated immediately.
     4. Colonies react biologically to being attacked.
     5. One new defensive/offensive reaction unlocks per evolution cycle.
     6. Escalation is user-controlled — any tier, any number of times.
     7. A slider sets the force / determination the unaligned apply.

     "yes it branches, they will need to share knowledge later"
     "yes, they will draw from the traits until the traits are outgrown"

   Built in verified passes. This file is the FOUNDATION: the shared-knowledge
   seam (§1) and the adversary core — items 1, 6, 7 (§2). Kings/honor/reactions/
   unlocks land in later passes, each against a living, checked colony.
   ══════════════════════════════════════════════════════════════════════════ */
window.MurmurationModules = window.MurmurationModules || {};

/* ── §1 · THE SHARED-KNOWLEDGE SEAM ─────────────────────────────────────────
   "they will need to share knowledge later." The two ranges must exchange what
   they learn: red-team findings (which attack paths worked) harden the blue
   team, and blue-team reactions (which defenses fired) inform the next probe.

   The seam is a VERSIONED LEDGER with a clean import/export contract, defined
   now even though the pentest engine does not consume it yet — because a seam
   retrofitted later is a seam that leaks. Same discipline as the readout
   contract: name the schema, and never let it drift silently. */
window.MurmurationModules.AttritionKnowledge = {
  SCHEMA: 'attrition.knowledge/1',
  ledger: { attacks: [], defenses: [], outcomes: [] },

  /** Record one adversary action and its result. */
  recordAttack(entry) {
    this.ledger.attacks.push({ t: Date.now(), ...entry });
  },
  /** Record one defensive reaction the colony mounted. */
  recordDefense(entry) {
    this.ledger.defenses.push({ t: Date.now(), ...entry });
  },
  recordOutcome(entry) {
    this.ledger.outcomes.push({ t: Date.now(), ...entry });
  },

  /** Serialize for the red team. The ONLY sanctioned way knowledge leaves. */
  export() {
    return { schema: this.SCHEMA, ...structuredCloneSafe(this.ledger) };
  },
  /** Absorb knowledge from the red team. Schema-gated: a mismatch is refused,
      not coerced — the same rule the cockpit binder lives by. */
  import(k) {
    if (!k || k.schema !== this.SCHEMA) {
      return { ok: false, reason: 'schema mismatch: ' + (k && k.schema) };
    }
    for (const key of ['attacks', 'defenses', 'outcomes']) {
      if (Array.isArray(k[key])) this.ledger[key].push(...k[key]);
    }
    return { ok: true, absorbed: (k.attacks || []).length };
  },
  reset() { this.ledger = { attacks: [], defenses: [], outcomes: [] }; },
};

function structuredCloneSafe(o) {
  try { return structuredClone(o); } catch (_) { return JSON.parse(JSON.stringify(o)); }
}

/* ── §2 · THE ADVERSARY — items 1, 6, 7 ─────────────────────────────────────
   The unaligned stop being an escalating nuisance that caps at tier 3 and
   become an OUTSIDE FORCE with an objective: invade, occupy a colony's commons
   zones, harbor their resources, and starve the colony out.

   Escalation is fully operator-controlled (item 6): any tier, any number of
   times, no ratchet, no cap. And a FORCE dial (item 7) sets how hard they push
   — the difference between a probing scout and a nation-state that will not
   leave. Force is a continuous multiplier the operator holds, distinct from
   tier, which is the KIND of wave sent. */
window.MurmurationModules.AttritionAdversary = class AttritionAdversary {
  constructor(world) {
    this.world = world;
    this.force = 0.5;          // item 7 — 0..1 determination dial, operator-held
    this.wavesSent = 0;
    this.TIER = {
      1: { label: 'RECON',        count: 4,  aggressive: false, hunt: false, occupy: false },
      2: { label: 'STRIKE TEAM',  count: 6,  aggressive: true,  hunt: true,  occupy: false },
      3: { label: 'OCCUPATION',   count: 18, aggressive: true,  hunt: false, occupy: true  },
    };
  }

  setForce(f) { this.force = Math.max(0, Math.min(1, f)); return this.force; }

  /** Send one wave of the chosen tier. Item 6: callable any number of times,
      no de-escalation, no cap — the operator owns the campaign. Force scales
      the wave's size and persistence without changing its tier. */
  sendWave(tier, target) {
    const spec = this.TIER[tier];
    if (!spec) return { error: 'unknown tier ' + tier };
    this.wavesSent++;
    // Force widens the wave: at 1.0 a wave is ~1.8x its base count.
    const count = Math.max(1, Math.round(spec.count * (0.6 + this.force * 1.2)));

    window.MurmurationModules.AttritionKnowledge.recordAttack({
      wave: this.wavesSent, tier, label: spec.label, target, force: this.force, count,
    });

    if (this.world.spawnUnaligned) {
      this.world.spawnUnaligned({
        count, tier, aggressive: spec.aggressive, hunt: spec.hunt, target,
        force: this.force, occupy: spec.occupy,
      });
    }
    return { wave: this.wavesSent, tier, label: spec.label, count, force: this.force, target };
  }
};

/* Attrition owns its instances on the module registry, same as MazeSystem, so a
   later bridge to the pentest engine has one known place to reach. */
window.MurmurationModules.Attrition = {
  version: '0.1.0-foundation',
  adversary: null,
  kings: null,
  reactions: null,
  attach(world) {
    this.adversary = new window.MurmurationModules.AttritionAdversary(world);
    this.kings = new window.MurmurationModules.AttritionKings(world).install();
    this.reactions = new window.MurmurationModules.AttritionReactions(world, this.kings);
    return { adversary: this.adversary, kings: this.kings, reactions: this.reactions };
  },
};

/* ── §3 · THE KINGS — item 2 ────────────────────────────────────────────────
   Ghost, 2026-08-18: "the stationary kings will replace the flags from capture
   the flag... the purpose and use will be a little different."

   CTF's king is the highest-honor agent, dynamically crowned, and it AMBLES
   within its lands. Attrition's king is the opposite: PLANTED where the flag
   used to sit, immobile, ringed by a small guard detail. The flag objective is
   gone; reaching and overwhelming the king IS the objective — capture-the-king.

   This pass builds the stationary king, the guard detail, and CAPTURE DETECTION.
   The honor bleed that a capture triggers is the next pass, and its rate is to
   be found by measurement, not guessed (Ghost: "crunch numbers and run tests").
   A hook — onCapture — is left for it so this layer never has to be reopened. */
window.MurmurationModules.AttritionKings = class AttritionKings {
  constructor(world, opts = {}) {
    this.world = world;
    this.guardCount = opts.guardCount || 5;     // a small detail, as specced
    this.ringR = opts.ringR || 42;              // guard orbit radius
    this.captureR = opts.captureR || 50;        // how close is "at the king"
    this.kings = { A: null, B: null };
    this.captured = { A: false, B: false };
    this.onCapture = opts.onCapture || null;    // hook for the honor-bleed pass
  }

  home(colony) {
    const W = this.world.width, H = this.world.height;
    return colony === 'A' ? { x: W * 0.10, y: H * 0.5 } : { x: W * 0.90, y: H * 0.5 };
  }

  _living(colony) {
    return this.world.agents.filter(a =>
      a.colony === colony && !a.seppukuDone && !a.isSentinel);
  }

  /** Crown the highest-trust living member and plant it. Idempotent — safe to
      call again to re-crown after a king falls. */
  install() {
    for (const c of ['A', 'B']) {
      if (this.kings[c] && !this.kings[c].seppukuDone) continue;
      const pool = this._living(c).filter(a => !a.isKing);
      if (!pool.length) { this.kings[c] = null; continue; }
      const king = pool.reduce((b, a) =>
        (a.trustCharge || 0) > (b ? (b.trustCharge || 0) : -1) ? a : b, null);
      king.isKing = true;
      king._attritionKing = true;
      this.kings[c] = king;
    }
    return this;
  }

  /** Called AFTER world.advanceStep each frame — Attrition owns the post-step
      correction, the same way the maze does. */
  step() {
    for (const c of ['A', 'B']) {
      let king = this.kings[c];
      if (!king || king.seppukuDone) { this.install(); king = this.kings[c]; }
      if (!king) continue;

      // PLANTED. The engine's current and boids push it every step; we override
      // right after, so the king holds its ground and reads as a fixed objective
      // rather than a wandering agent.
      const home = this.home(c);
      king.x = home.x; king.y = home.y; king.vx = 0; king.vy = 0;

      // GUARD DETAIL — the N nearest living non-king members, gently held on a
      // ring around the king. Reassigned each step so casualties are backfilled
      // from whoever is closest, which is what a real detail does under fire.
      const detail = this._living(c)
        .filter(a => !a.isKing)
        .map(a => ({ a, d: Math.hypot(a.x - home.x, a.y - home.y) }))
        .sort((p, q) => p.d - q.d)
        .slice(0, this.guardCount);
      const guardSet = new Set(detail.map(g => g.a));
      for (const a of this._living(c)) a._attritionGuard = guardSet.has(a);
      for (const { a, d } of detail) {
        // pull toward the ring: inward if outside it, outward if inside — so the
        // detail forms a shell, not a huddle on the crown.
        const off = d - this.ringR;
        const ux = (a.x - home.x) / (d || 1), uy = (a.y - home.y) / (d || 1);
        a.vx -= ux * off * 0.02;
        a.vy -= uy * off * 0.02;
      }

      // CAPTURE — the unaligned reach the king faster than the guard can hold.
      // Capture when attackers at the crown outnumber the guards there, and it
      // takes at least a squad (>=3) so a lone straggler cannot "capture" a king.
      const atKing = (pred) => this.world.agents.filter(a =>
        !a.seppukuDone && pred(a) &&
        Math.hypot(a.x - home.x, a.y - home.y) < this.captureR).length;
      const attackers = atKing(a => a.colony === 'U');
      const guardsHere = atKing(a => a._attritionGuard);
      if (attackers >= 3 && attackers > guardsHere) {
        if (!this.captured[c]) {
          this.captured[c] = true;
          window.MurmurationModules.AttritionKnowledge.recordOutcome({
            event: 'king_captured', colony: c, attackers, guards: guardsHere,
          });
          if (this.onCapture) this.onCapture(c, { attackers, guards: guardsHere });
        }
      } else if (attackers === 0) {
        this.captured[c] = false;   // the crown is relieved when the siege breaks
      }
    }
  }

  status(colony) {
    const k = this.kings[colony];
    return {
      home: this.home(colony),
      alive: !!(k && !k.seppukuDone),
      captured: this.captured[colony],
    };
  }
};

/* ── §4 · BIOLOGICAL REACTIONS — item 4, and Ghost's "LOBO" ──────────────────
   Ghost, 2026-08-18: "the colonies should have biological reactions to being
   attacked" · "LOBO" · "yes, they will draw from the traits until the traits
   are outgrown."

   The key LOBO gives us: LOBO is the same 50 genes activated toward ENFORCEMENT
   instead of construction — "identical twins, different lives"
   (LOBO_ADVERSARIAL_GENOME.md). So every gene has TWO faces:
     DEFENSE  = the trait's constructive activation (protect the colony)
     OFFENSE  = that same trait's LOBO activation (strike the attacker)
   which is exactly item 5's "one new defensive OR offensive reaction per cycle"
   — one gene, two faces, and the unlock picks a face. LOBO is not a bolt-on; it
   is the offensive half of the genome the colony already carries.

   Each reaction below is drawn from a REAL trait in juggernaut/traits/ (the
   registry has 52). The heavy Node trait modules can't run in the browser, so
   each reaction here is a faithful SWARM EXPRESSION of that gene's documented
   mechanism — "drawn from the traits until the traits are outgrown."

   QUORUM SENSING is the gate on all of them (Vibrio fischeri, trait file:
   "consensus quorum required... reduces false positives dramatically"). Nothing
   fires on one scout; the colony must independently confirm the threat — the
   same structural false-positive resistance the BombardierBeetle module is
   built around. Innate immunity (quorum + biofilm) is present from birth;
   the rest is adaptive, acquired one per evolution cycle (item 5). */
window.MurmurationModules.AttritionReactions = class AttritionReactions {
  constructor(world, kings) {
    this.world = world;
    this.kings = kings;
    this.quorum = 3;              // Vibrio threshold — independent confirmations
    this.threatR = 130;          // how near an unaligned must be to "sense"
    this.active = {};            // key -> ticksRemaining (a reaction expressing)
    this.lastFired = {};         // key -> tick, for cooldowns
    this.fireLog = [];

    // The repertoire. `unlocked` seeds INNATE immunity; adaptive ones start
    // locked and are revealed one per evolution cycle by the unlock pass.
    this.reactions = [
      { id:'quorumSensing', trait:'Quorum Sensing (Vibrio fischeri)', kind:'gate',
        unlocked:true,
        desc:'consensus threshold — nothing fires until a quorum independently confirms the threat' },
      { id:'biofilmShield', trait:'Biofilm Shield (P. aeruginosa)', kind:'defense',
        unlocked:true, dur:180, cd:120,
        desc:'the colony tightens into a collective shell around the king — protection is emergent, no one cell makes it' },
      { id:'cephalopodCamouflage', trait:'Cephalopod Camouflage (Sepia)', kind:'defense',
        unlocked:false, dur:120, cd:200,
        desc:'the king pattern-breaks — attackers lose their target lock for a beat' },
      { id:'bombardierBeetle', trait:'Bombardier Beetle (Brachinus)', kind:'offense',
        unlocked:false, dur:1, cd:260,
        desc:'multi-signal convergence fires a coordinated burst at the crown — structurally cannot misfire' },
      { id:'wolfPack', trait:'Wolf Pack (Canis lupus)', kind:'offense',
        unlocked:false, dur:220, cd:180,
        desc:'a hunting party breaks off under a tactician and runs the attackers down' },
    ];
  }

  byId(id){ return this.reactions.find(r=>r.id===id); }
  unlockedList(){ return this.reactions.filter(r=>r.unlocked); }
  lockedList(){ return this.reactions.filter(r=>!r.unlocked); }

  /** Reveal the next locked reaction — called once per evolution cycle (item 5). */
  unlockNext(){
    const next = this.reactions.find(r=>!r.unlocked);
    if(next){ next.unlocked = true;
      this.fireLog.unshift({ t:this.world.time, id:next.id, msg:'UNLOCKED ' + next.trait }); }
    return next || null;
  }

  _threatTo(colony){
    // unaligned near this colony's king = the attack signal
    const home = this.kings.home(colony);
    return this.world.agents.filter(a=>a.colony==='U' && !a.seppukuDone &&
      Math.hypot(a.x-home.x, a.y-home.y) < this.threatR);
  }
  _confirm(colony, threat){
    // QUORUM: count independent colony members who can also sense the threat.
    // Consensus, not a single alarm — the false-positive gate.
    if(threat.length===0) return false;
    const sensing = this.world.agents.filter(a=>a.colony===colony && !a.seppukuDone &&
      threat.some(u=>Math.hypot(a.x-u.x,a.y-u.y) < this.threatR*0.6)).length;
    return sensing >= this.quorum;
  }

  step(){
    const t = this.world.time;
    for(const colony of ['A','B']){
      const threat = this._threatTo(colony);
      const confirmed = this._confirm(colony, threat);

      // decay active reactions, keep expressing while live
      for(const r of this.reactions){
        const key = colony+':'+r.id;
        if(this.active[key]>0){ this.active[key]--; this._express(colony, r, threat); }
      }
      if(!confirmed) continue;

      // fire any unlocked, off-cooldown reaction whose face suits the moment.
      for(const r of this.unlockedList()){
        if(r.kind==='gate') continue;
        const key = colony+':'+r.id;
        if(this.active[key]>0) continue;
        if(t - (this.lastFired[key]||-9999) < (r.cd||120)) continue;
        // bombardier demands the structural multi-signal convergence (>=2 at the
        // crown) — it "cannot misfire".
        if(r.id==='bombardierBeetle'){
          const h=this.kings.home(colony);
          const atCrown = threat.filter(u=>Math.hypot(u.x-h.x,u.y-h.y) < this.kings.captureR*1.2).length;
          if(atCrown < 2) continue;
        }
        this.active[key] = r.dur||1;
        this.lastFired[key] = t;
        this.fireLog.unshift({ t, id:r.id, colony, msg:colony+' → '+r.trait });
        if(this.fireLog.length>40) this.fireLog.pop();
        window.MurmurationModules.AttritionKnowledge.recordDefense({
          colony, reaction:r.id, kind:r.kind, threat:threat.length });
        this._express(colony, r, threat);
      }
    }
  }

  /** Apply a reaction's swarm effect for this tick. Faithful to each gene. */
  _express(colony, r, threat){
    const home = this.kings.home(colony);
    if(r.id==='biofilmShield'){
      // Collectively emergent shell: colony members near the king pull inward to
      // a dense film; unaligned at the crown are pushed OUT — the EPS matrix
      // "physically impedes diffusion". Protection scales with contributors.
      const contributors = this.world.agents.filter(a=>a.colony===colony && !a.seppukuDone &&
        Math.hypot(a.x-home.x,a.y-home.y) < this.threatR);
      const strength = Math.min(1, contributors.length/12);
      for(const a of contributors){
        const d=Math.hypot(a.x-home.x,a.y-home.y)||1;
        a.vx += ((home.x-a.x)/d)*0.06*strength; a.vy += ((home.y-a.y)/d)*0.06*strength;
      }
      for(const u of threat){
        const d=Math.hypot(u.x-home.x,u.y-home.y)||1;
        u.vx += ((u.x-home.x)/d)*0.12*strength; u.vy += ((u.y-home.y)/d)*0.12*strength;
      }
    } else if(r.id==='cephalopodCamouflage'){
      // Pattern-break: the attackers lose lock — damp their pull toward the king
      // this beat (the king "disappears" against the pattern).
      for(const u of threat){
        const d=Math.hypot(u.x-home.x,u.y-home.y)||1;
        u.vx -= ((home.x-u.x)/d)*0.05; u.vy -= ((home.y-u.y)/d)*0.05;
      }
    } else if(r.id==='bombardierBeetle'){
      // The burst: a single hard exothermic pulse. Strong outward impulse on
      // everything unaligned within the burst radius at the crown.
      for(const u of threat){
        const d=Math.hypot(u.x-home.x,u.y-home.y)||1;
        if(d < this.kings.captureR*1.6){
          u.vx += ((u.x-home.x)/d)*1.4; u.vy += ((u.y-home.y)/d)*1.4;
          u._attritionStruck = (u._attritionStruck||0)+1;
        }
      }
    } else if(r.id==='wolfPack'){
      // A pack breaks off and runs the nearest attackers down. Tactician = the
      // highest-trust free member; the pack pursues; on contact a strike, and
      // enough strikes eject the invader.
      const pack = this.world.agents
        .filter(a=>a.colony===colony && !a.seppukuDone && !a.isKing && !a._attritionGuard)
        .sort((a,b)=>(b.trustCharge||0)-(a.trustCharge||0)).slice(0,4);
      for(const h of pack){
        let tgt=null, best=1e9;
        for(const u of threat){ const d=Math.hypot(u.x-h.x,u.y-h.y); if(d<best){best=d;tgt=u;} }
        if(!tgt) continue;
        const d=best||1;
        h.vx += ((tgt.x-h.x)/d)*0.16; h.vy += ((tgt.y-h.y)/d)*0.16;
        if(d < 14){ tgt._attritionStruck=(tgt._attritionStruck||0)+1;
          if(tgt._attritionStruck>=3){ tgt.seppukuDone=true; tgt._attritionEjected=true;
            window.MurmurationModules.AttritionKnowledge.recordOutcome({
              event:'attacker_eliminated', colony, by:'wolfPack' }); } }
      }
    }
  }
};
