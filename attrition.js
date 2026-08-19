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

    const before = new Set(this.world.agents.filter(a => a.colony === 'U'));
    if (this.world.spawnUnaligned) {
      this.world.spawnUnaligned({
        count, tier, aggressive: spec.aggressive, hunt: spec.hunt, target,
        force: this.force, occupy: spec.occupy,
      });
    }
    // Tag the freshly spawned hunters with THIS wave's contract target so LOBO
    // (§5) can lock each to the king the operator named — NO_SELF_APPOINTMENT.
    for (const a of this.world.agents) {
      if (a.colony === 'U' && !before.has(a)) a._loboTarget = target;
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
  lobo: null,
  bleed: null,
  attach(world) {
    this.adversary = new window.MurmurationModules.AttritionAdversary(world);
    this.kings = new window.MurmurationModules.AttritionKings(world).install();
    this.reactions = new window.MurmurationModules.AttritionReactions(world, this.kings);
    this.lobo = new window.MurmurationModules.AttritionLobo(world, this.kings, this.adversary);
    this.bleed = new window.MurmurationModules.AttritionBleed(world, this.kings);
    return { adversary: this.adversary, kings: this.kings, reactions: this.reactions, lobo: this.lobo, bleed: this.bleed };
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
      // RADIUS CLEAR (Ghost's mitigation ruling, 2026-08-18). The burst EMPTIES
      // the crown at once — every unaligned in the burst radius is ejected, not
      // merely shoved. This is what restores a real incident-response window:
      // the sweep showed the colony could almost never break a possession vs
      // LOBO's planarian refill, so a coordinated burst has to clear the crown
      // outright. It auto-staunches the bleed (crown clears -> captured flips
      // false) and starts the MTTR race; the planarian throttle (below) keeps
      // LOBO from instantly refilling, so the window is real.
      let cleared=0;
      for(const u of threat){
        const d=Math.hypot(u.x-home.x,u.y-home.y)||1;
        if(d < this.kings.captureR*1.6){
          u.seppukuDone=true; u._attritionEjected=true; cleared++;
        }
      }
      if(cleared){
        // open the throttle window LOBO reads — no instant restock of THIS crown
        this.kings._crownClearedUntil = this.kings._crownClearedUntil || {};
        this.kings._crownClearedUntil[colony] = this.world.time + 140;
        window.MurmurationModules.AttritionKnowledge.recordDefense({
          event:'crown_cleared', colony, ejected:cleared, gene:'bombardierBeetle' });
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

/* ── §5 · LOBO — THE ADVERSARY AS A GENE-EXPRESSING HUNTER ───────────────────
   Ghost, 2026-08-18: "lobo is also wired for adversarial and with the genes at
   its disposal it should make for a good show, and lobo should really benefit
   from its design language and structure."

   The unaligned stop being a dumb rush and become LOBO — the same genome the
   colony carries, activated toward the HUNT (LOBO_ADVERSARIAL_GENOME.md, the
   "identical twin, different life"). The colony's reactions (§4) are the genome
   defending; this is the genome attacking. Same genes, opposite face.

   The hunter loop, each gene faithful to the doc and each one visible on screen
   so the fight has rhythm rather than a trickle:

     MAGNETORECEPTION (#35) — "true north = the contract objective." Every hunter
       locks to the king the OPERATOR named. LOBO never picks its own target
       (NO_SELF_APPOINTMENT); the operator's target selector IS the contract.
     DEMOCRATIC QUORUM (#27/#30) — the pack masses at a staging ring and does
       NOT commit until a quorum has gathered. "The pack fires together or not
       at all." No premature trickle that the blue team mops up.
     WOLF PACK (#40) — LOBO's namesake and core. On quorum, a coordinated surge:
       the whole pack drives the crown at once, whoever is closest leads.
     FLASH EXPANSION / CRYPTOBIOSIS (#28/#6) — when the colony's reactions fire
       at the crown, the pack SCATTERS to safe distance and goes quiet, then
       reforms. Low and slow; survive the sweep, resume the hunt.
     PLANARIAN (#8) — "kill one, more rise." When a hunter is eliminated, LOBO
       regrows — adversity GROWS the pack, scaled by the force dial.

   LOBO's design language: rendered in the Main Man's register — crimson, and a
   pack-state readout, so the operator sees the hunter thinking, not just moving.
   The constitution is structure, not decoration: the contract is the scope, and
   it shows. */
window.MurmurationModules.AttritionLobo = class AttritionLobo {
  /* LOBO IS THE PLAYER, NOT THE SWARM.
     Ghost, 2026-08-18: "imagine the hierarchical structure of a chessboard, add
     water, a current and a derived biological framework.... lobo should be using
     its swarm as pawns. the murmuration is decentralized where lobo is goal
     oriented. its job is to find access and possess; their job is to look for a
     reason to cascade."

     So this is a REBUILD. The first LOBO made the swarm decide its own states —
     that was murmuration logic (decentralized) wearing a red coat. Wrong. LOBO
     is a single goal-oriented intelligence — the Main Man — that treats the
     unaligned as expendable PIECES it moves toward one end: possess the king.
     The colony stays decentralized and cascade-seeking (§4). LOBO does not
     flock; it COMMANDS.

     Its purpose is the thing it operates from, not a label on it:
       TAKE THE CONTRACT · FIND ACCESS · POSSESS THE MARK · DO NOT STOP.
     (LOBO_ADVERSARIAL_GENOME.md — "takes the contract, finds the mark, does not
     stop, does not get bored, does not wander off, delivers the body.")

     The genome is LOBO's TOOLKIT, wielded strategically, not expressed
     emergently: Magnetoreception fixes the mark, Slime Mold finds the access
     vector, Wolf Pack coordinates the piece that commits, Autotomy spends a
     burned pawn, Planarian regrows the line. */
  constructor(world, kings, adversary) {
    this.world = world;
    this.kings = kings;
    this.adversary = adversary;              // the force dial = LOBO's resolve
    this.purpose = 'TAKE THE CONTRACT · FIND ACCESS · POSSESS THE MARK · DO NOT STOP';
    this.plan = {};                          // colony -> current plan word
    this.access = {};                        // colony -> {angle, quality}
    this.regroupUntil = {};                  // colony -> tick (brief withdrawals only)
    this.sacrificed = 0;                     // pawns LOBO has spent to reach the mark
    this.regrowthCredit = 0;
    this.regrowthMult = 1;   // operator dial: LOBO's relentlessness (planarian scale)
  }

  _force() { return this.adversary ? this.adversary.force : 0.5; }
  _pawns() { return this.world.agents.filter(a => a.colony === 'U' && !a.seppukuDone); }

  /** LOBO reads the board and FINDS ACCESS: the softest approach to the king —
      the arc with the thinnest guard, biased toward an open gate if one gives a
      clean lane. Slime Mold #11: the shortest credible chain to the crown.

      A commander picks a LANE and holds it. Recomputing the softest angle every
      tick made the pawns chase a jumping target and never mass — so access is
      STICKY: chosen, then committed to for a campaign window, and only
      reassessed on a timer or when a withdrawal forces a rethink. Deliberate
      reassessment, not per-frame flinching. */
  _findAccess(colony, reassess) {
    const held = this.access[colony];
    if (held && !reassess && this.world.time < (held.until || 0)) return held;
    const home = this.kings.home(colony);
    // The access ring must live INSIDE the world, whatever its size. A fixed
    // captureR*2.2 put the point off-map on a small canvas (king at 0.9 width,
    // access 110px further out, past a 320px edge) and the pawns chased a point
    // in the void. Scale to the smaller world dimension.
    const R = Math.min(this.kings.captureR * 2.2, Math.min(this.world.width, this.world.height) * 0.16);
    const M = 18;  // keep the point off the very edge
    const guards = this.world.agents.filter(a =>
      a.colony === colony && !a.seppukuDone &&
      Math.hypot(a.x - home.x, a.y - home.y) < R * 1.4);
    let best = null;
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2;
      const px = home.x + Math.cos(ang) * R, py = home.y + Math.sin(ang) * R;
      // defenders guarding this arc
      let d = 0;
      for (const g of guards) {
        const ga = Math.atan2(g.y - home.y, g.x - home.x);
        let diff = Math.abs(ga - ang); if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < 0.6) d++;
      }
      // an open gate on this side offers a clean lane — score it softer
      let gateBonus = 0;
      const gates = (this.world.wall && this.world.wall.gates) || [];
      for (const gt of gates) {
        if (!gt.open) continue;
        const gy = gt.yf * this.world.height, gx = this.world.width / 2;
        const gAng = Math.atan2(gy - home.y, gx - home.x);
        let diff = Math.abs(gAng - ang); if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < 0.9) gateBonus += 2;
      }
      const softness = -d + gateBonus;
      if (!best || softness > best.softness) best = { angle: ang, softness, px, py };
    }
    // clamp the chosen lane inside the world so the pawns can actually reach it
    best.px = Math.max(M, Math.min(this.world.width - M, best.px));
    best.py = Math.max(M, Math.min(this.world.height - M, best.py));
    // hold this lane for a campaign window (~140 ticks) before reassessing
    best.until = this.world.time + 140;
    this.access[colony] = best;
    return best;
  }

  _contractColonies() {
    const set = new Set();
    for (const a of this._pawns()) {
      const t = a._loboTarget;
      if (t === 'A' || t === 'B') set.add(t);
      else { // nearest king
        const hA = this.kings.home('A'), hB = this.kings.home('B');
        set.add(Math.hypot(a.x - hA.x, a.y - hA.y) < Math.hypot(a.x - hB.x, a.y - hB.y) ? 'A' : 'B');
      }
    }
    return [...set];
  }

  _pawnsFor(colony) {
    return this._pawns().filter(a => {
      const t = a._loboTarget;
      if (t === 'A' || t === 'B') return t === colony;
      const hA = this.kings.home('A'), hB = this.kings.home('B');
      return (Math.hypot(a.x - hA.x, a.y - hA.y) < Math.hypot(a.x - hB.x, a.y - hB.y) ? 'A' : 'B') === colony;
    });
  }

  /** Is an OFFENSIVE reaction live at this crown — the grenade LOBO screens
      against and briefly withdraws from (never from a passive shield). */
  _underFire(colony) {
    const R = window.MurmurationModules.Attrition.reactions;
    if (!R) return false;
    return ['bombardierBeetle', 'wolfPack'].some(id => (R.active[colony + ':' + id] || 0) > 0);
  }

  step() {
    const t = this.world.time, force = this._force();
    const contracts = this._contractColonies();
    if (!contracts.length) { this.plan = {}; return; }

    for (const colony of contracts) {
      const pawns = this._pawnsFor(colony);
      if (!pawns.length) { this.plan[colony] = 'SPENT'; continue; }
      const home = this.kings.home(colony);
      const captured = this.kings.captured[colony];
      const underFire = this._underFire(colony);
      // reassess the lane only when a withdrawal forces a rethink; otherwise
      // hold the committed line so the pawns can actually mass on it.
      const access = this._findAccess(colony, this.plan[colony] === 'REGROUP');

      // ── LOBO DECIDES. Goal-oriented, always toward possession. ──
      // Massing is measured over a STAGING SECTOR, not a tight point — the
      // unaligned separate hard ("don't tolerate proximity"), so a commander
      // concentrates them into a region, never a huddle. A tight radius made
      // the commit condition unreachable no matter how well they gathered.
      const atAccess = pawns.filter(a => Math.hypot(a.x - access.px, a.y - access.py) < this.kings.captureR * 3).length;
      const massedFrac = atAccess / pawns.length;
      // Commit threshold sits BELOW what massing can physically reach — the
      // unaligned's hard separation caps a gathered pack near ~0.4, so a bar
      // above that can never trip. And an assault, once launched, holds for a
      // beat (commitUntil) rather than flickering back to MASS the instant the
      // vanguard peels off the access point toward the crown.
      this.commitUntil = this.commitUntil || {};
      let plan;
      if (captured) plan = 'POSSESS';                       // hold the crown — deliver the body
      else if (underFire && force < 0.9 && t >= (this.regroupUntil[colony] || 0)) {
        plan = 'REGROUP'; this.regroupUntil[colony] = t + Math.round(40 * (1.1 - force * 0.6));
        this.commitUntil[colony] = 0;
      } else if (t < (this.regroupUntil[colony] || 0)) plan = 'REGROUP';
      else if (t < (this.commitUntil[colony] || 0)) plan = 'COMMIT';          // assault in progress
      else if (massedFrac >= (0.26 * (1.2 - force * 0.4))) {                  // the line is set — strike
        plan = 'COMMIT'; this.commitUntil[colony] = t + 70;
      } else plan = 'MASS';                                 // position on the access vector
      this.plan[colony] = plan;

      // ── LOBO ASSIGNS ROLES — the chessboard hierarchy. Pawns do not choose;
      //    they are placed. Vanguard drives the crown along the access lane; a
      //    screen intercepts the offensive reaction; the reserve masses. ──
      const byNear = pawns.slice().sort((a, b) =>
        Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y));
      const vanguardN = Math.max(1, Math.round(pawns.length * (0.35 + force * 0.25)));
      const screenN = underFire ? Math.max(1, Math.round(pawns.length * 0.2)) : 0;

      // find the offensive threat to screen against (nearest colony hunter/pack)
      let threat = null;
      if (screenN) {
        let bd = 1e9;
        for (const g of this.world.agents) {
          if (g.colony !== colony || g.seppukuDone) continue;
          const d = Math.hypot(g.x - home.x, g.y - home.y);
          if (d < bd) { bd = d; threat = g; }
        }
      }

      // The march speed and OBEY factor — how hard the order overrides the
      // pawn's own drift. A weak impulse lost to the unaligned's separation and
      // wander, so the pack never concentrated. Pawns OBEY: LOBO steers their
      // velocity toward the ordered point, and the retained fraction (1-obey) is
      // where the water still flows through. The intelligence is LOBO's; the
      // pieces move where placed.
      const speed = 1.5 * (0.7 + force * 0.5);
      byNear.forEach((a, i) => {
        let role, tx, ty, obey;
        if (i < vanguardN) {
          role = 'VANGUARD';
          if (plan === 'COMMIT' || plan === 'POSSESS') {
            tx = home.x; ty = home.y; obey = 0.62;           // drive the crown, hard
          } else {
            tx = access.px; ty = access.py; obey = 0.5;      // form up on the vector
          }
        } else if (screenN && i < vanguardN + screenN && threat) {
          role = 'SCREEN';
          tx = threat.x; ty = threat.y; obey = 0.6;          // throw the body in the way
        } else {
          role = 'RESERVE';
          tx = access.px; ty = access.py; obey = 0.4;        // hold the access vector
        }
        // ORDER: steer the piece. Dominates separation/wander without freezing
        // the current out entirely — the water still flows through (1-obey).
        const d = Math.hypot(tx - a.x, ty - a.y) || 1;
        const dirx = (tx - a.x) / d, diry = (ty - a.y) / d;
        a.vx = a.vx * (1 - obey) + dirx * speed * obey;
        a.vy = a.vy * (1 - obey) + diry * speed * obey;
        a._loboRole = role;
        a._loboSacrifice = (role === 'SCREEN');
      });

      // ── PLANARIAN — the line does not thin. A spent pawn is replaced,
      //    scaled by resolve. "Kill one, more rise." ──
      //    THROTTLE (Ghost's option 2, 2026-08-18): LOBO reinforces the APPROACH
      //    but cannot instantly restock a CROWN a burst just cleared. During the
      //    clear window the refill is halved, so a radius clear buys a real MTTR
      //    window instead of being nullified on the next tick. LOBO stays
      //    relentless everywhere except the crown it was just blown off of.
      const clearedUntil = (this.kings._crownClearedUntil && this.kings._crownClearedUntil[colony]) || 0;
      const throttled = this.world.time < clearedUntil;
      const ejected = this.world.agents.filter(a => a.colony === 'U' && a._attritionEjected && !a._loboCounted);
      for (const e of ejected) { e._loboCounted = true; this.sacrificed++; }
      if (ejected.length) {
        const gain = ejected.length * (0.25 + force * 0.85) * (throttled ? 0.4 : 1) * this.regrowthMult;
        this.regrowthCredit += gain;
        while (this.regrowthCredit >= 1) {
          this.regrowthCredit -= 1;
          if (this.world.spawnUnaligned) {
            this.world.spawnUnaligned({ count: 1, tier: 3, aggressive: true, hunt: false, target: colony, force, occupy: true });
            window.MurmurationModules.AttritionKnowledge.recordAttack({ gene: 'planarian', event: throttled ? 'reinforced_throttled' : 'reinforced', colony, force });
          }
        }
      }
    }
  }

  /** LOBO's design language: the Main Man's crimson, and the commander's PLAN
      named over the pack so the operator watches the intelligence work — not a
      flock milling, a player moving. */
  draw(ctx) {
    const pawns = this._pawns();
    if (!pawns.length) return;
    ctx.save();
    for (const a of pawns) {
      const sac = a._loboSacrifice;
      ctx.beginPath(); ctx.arc(a.x, a.y, sac ? 2.6 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle = sac ? 'rgba(255,150,90,0.75)' : (a._loboRole === 'VANGUARD' ? '#ff2a3a' : 'rgba(255,60,80,0.72)');
      ctx.fill();
    }
    for (const colony of Object.keys(this.plan)) {
      const p = this._pawnsFor(colony); if (!p.length) continue;
      const cx = p.reduce((s, a) => s + a.x, 0) / p.length;
      const cy = p.reduce((s, a) => s + a.y, 0) / p.length;
      // access vector — the lane LOBO chose to the crown
      const acc = this.access[colony];
      const home = this.kings.home(colony);
      if (acc) {
        ctx.strokeStyle = 'rgba(255,60,80,0.35)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(acc.px, acc.py); ctx.lineTo(home.x, home.y); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = '#ff2a3a'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('LOBO · ' + (this.plan[colony] || 'IDLE'), cx, cy - 14);
    }
    ctx.restore();
  }

  status() {
    const plans = Object.values(this.plan);
    return {
      state: plans[0] || 'IDLE', plans: { ...this.plan },
      pawns: this._pawns().length, sacrificed: this.sacrificed,
      force: this._force(), purpose: this.purpose,
    };
  }
};

/* ── §6 · THE HONOR BLEED — item 3 ──────────────────────────────────────────
   Ghost, 2026-08-18: "the kings capture should cause an honor bleed that needs
   to be mitigated immediately" · and, reserving this one for evidence: "we will
   have to crunch numbers and run tests to figure out the correct amount."

   So the RATE is not chosen here. This builds the mechanism and instruments it;
   the number is picked from the sweep the range runs (crunch the numbers, then
   set bleedRate). It ships at a placeholder, clearly labelled as un-tuned.

   The mechanic is the incident-response clock. LOBO possessing a king drains the
   colony's honor. MITIGATION is the colony breaking the possession — its
   autonomous reactions (§4) clearing the unaligned off the crown, which flips
   the king's `captured` back to false and staunches the bleed. If honor reaches
   zero first, the colony CASCADES — and cascade is the colony's own nature
   ("their job is to look for a reason to cascade"); zero honor is the reason.

   The right rate is the one where MTTR MATTERS: a prepared colony can staunch it
   if it responds in time, an unprepared one cannot. Too slow and a captured king
   is a shrug; too fast and it is unrecoverable and teaches nothing. That window
   is exactly what a blue-team range exists to train, and it is empirical. */
window.MurmurationModules.AttritionBleed = class AttritionBleed {
  constructor(world, kings) {
    this.world = world;
    this.kings = kings;
    this.honor = { A: 1.0, B: 1.0 };     // colony honor, 0..1
    // SWEEP-DERIVED, 2026-08-18 — not chosen by feel. The rate sweep (with the
    // radius-clear mitigation live) put 0.004/tick at the sweet spot where MTTR
    // matters: a prepared colony (an offensive gene unlocked) can recover with
    // skill, a weak one (innate only) cannot, and an overwhelming rate (0.008)
    // cascades everyone regardless. Faster is pure punishment; slower makes a
    // captured king a shrug. Single-run variance is real, so this is the
    // indicated value, not a decree — a multi-run pass would tighten it.
    this.bleedRate = 0.004;
    this.recoverRate = 0.0006;           // honor heals slowly once the crown is safe
    this.cascaded = { A: false, B: false };
    this.events = [];                    // capture / staunch / cascade, with ticks
    this._captureStart = {};
  }

  setBleedRate(r) { this.bleedRate = Math.max(0, r); return this.bleedRate; }

  step() {
    const t = this.world.time;
    for (const colony of ['A', 'B']) {
      if (this.cascaded[colony]) continue;   // a cascaded colony is out of the fight
      const captured = this.kings.captured[colony];

      if (captured) {
        if (!this._captureStart[colony]) {
          this._captureStart[colony] = t;
          this.events.push({ t, colony, event: 'captured' });
          window.MurmurationModules.AttritionKnowledge.recordOutcome({ event: 'bleed_start', colony });
        }
        this.honor[colony] -= this.bleedRate;
        if (this.honor[colony] <= 0) {
          this.honor[colony] = 0;
          this.cascaded[colony] = true;
          const held = t - this._captureStart[colony];
          this.events.push({ t, colony, event: 'CASCADE', heldTicks: held });
          window.MurmurationModules.AttritionKnowledge.recordOutcome({ event: 'cascade', colony, heldTicks: held });
          this._cascade(colony);
        }
      } else {
        if (this._captureStart[colony]) {
          // MITIGATED — the colony broke the possession. This is the MTTR: how
          // long from capture to staunch, and how much honor survived.
          const mttr = t - this._captureStart[colony];
          this.events.push({ t, colony, event: 'staunched', mttr, honorLeft: +this.honor[colony].toFixed(3) });
          window.MurmurationModules.AttritionKnowledge.recordDefense({ event: 'staunched', colony, mttr, honorLeft: this.honor[colony] });
          this._captureStart[colony] = null;
        }
        this.honor[colony] = Math.min(1, this.honor[colony] + this.recoverRate);
      }
    }
  }

  /** The cascade — the colony's collapse. It IS cascade-seeking, so the failure
      is expressed in its own physics: grief propagates through the survivors.
      The range records it as the training failure. */
  _cascade(colony) {
    for (const a of this.world.agents) {
      if (a.colony !== colony || a.seppukuDone) continue;
      a.griefLevel = Math.min(1, (a.griefLevel || 0) + 0.6);
      if (a.griefState === 'ACTIVE') a.griefState = 'GRIEVING';
    }
  }

  status(colony) {
    return {
      honor: +this.honor[colony].toFixed(3),
      bleeding: !!this._captureStart[colony] && !this.cascaded[colony],
      cascaded: this.cascaded[colony],
    };
  }
};
