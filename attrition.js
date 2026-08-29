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
  tic: null,
  mortality: null,
  attach(world) {
    this.adversary = new window.MurmurationModules.AttritionAdversary(world);
    this.kings = new window.MurmurationModules.AttritionKings(world).install();
    this.reactions = new window.MurmurationModules.AttritionReactions(world, this.kings);
    this.lobo = new window.MurmurationModules.AttritionLobo(world, this.kings, this.adversary);
    this.bleed = new window.MurmurationModules.AttritionBleed(world, this.kings);
    this.tic = new window.MurmurationModules.AttritionTIC(world, this.kings, this.reactions, this.lobo);
    this.bleed.tic = this.tic;   // §6 honor drains in proportion to §7 disrespect
    this.mortality = new window.MurmurationModules.AttritionMortality(world, this.kings);
    // LOBO ADAPTATION — the adversary is a subject of the test too, so it
    // evolves from what actually beat it rather than from a ladder we wrote.
    // HEAT — where the map is hot, shown in place. Replaces the screen cut.
    if (window.MurmurationModules.HeatMap) {
      this.heat = new window.MurmurationModules.HeatMap(world);
    }
    // MENTAL STRESS — biases thresholds, never adds behaviour.
    if (window.MurmurationModules.ColonyStress) {
      this.stress = new window.MurmurationModules.ColonyStress(world);
    }
    if (window.MurmurationModules.LoboEvolve) {
      this.loboEvolve = new window.MurmurationModules.LoboEvolve(world);
    }
    // WASP ALARM — the colony's own nervous system. Colony-only in both
    // directions: LOBO neither releases it nor senses it (Ghost's ruling).
    if (window.MurmurationModules.AlarmField) {
      // Starts LOCKED — the reactions ladder owns whether the colony has this
      // sense yet, so the baseline is real rather than a setting someone
      // remembered to switch off.
      this.alarm = new window.MurmurationModules.AlarmField(world, { enabled: false });
    }
    // ADAPTIVE IMMUNITY — the fifth founding word. Starts LOCKED; the ladder
    // owns whether the colony has learned to learn yet.
    if (window.MurmurationModules.AdaptiveImmunity) {
      this.immunity = new window.MurmurationModules.AdaptiveImmunity(world, { enabled: false });
      // LOBO drifts an antigen whenever it re-adopts a trait — the arms race.
      if (this.loboEvolve) this.loboEvolve.onDrift = (k) => this.immunity.drift(k);
    }
    // ONE KEEP PER CROWN — the king's last line of defence. Centre is sampled
    // live from the kings system, so a re-crowned king brings his walls with
    // him rather than leaving them standing around an empty floor.
    if (window.MurmurationModules.Keep) {
      this.keeps = ['A', 'B'].map(c => new window.MurmurationModules.Keep(world, {
        colony: c,
        centre: () => {
          const k = this.kings && this.kings.kings[c];
          return k ? { x: k.x, y: k.y } : this.kings.home(c);
        }
      }).enable());
    }
    return { adversary: this.adversary, kings: this.kings, reactions: this.reactions, lobo: this.lobo, bleed: this.bleed, tic: this.tic, mortality: this.mortality, keeps: this.keeps, alarm: this.alarm, loboEvolve: this.loboEvolve, stress: this.stress, heat: this.heat, immunity: this.immunity };
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
    const _g = opts.guardCount || 5;            // a small detail, as specced
    this.guardCount = { A: _g, B: _g };         // per-colony — each king rings its own
    this.ringR = opts.ringR || 42;              // guard orbit radius
    this.captureR = opts.captureR || 50;        // how close is "at the king"
    this.kings = { A: null, B: null };
    this.captured = { A: false, B: false };
    this.onCapture = opts.onCapture || null;    // hook for the honor-bleed pass
  }

  home(colony) {
    const W = this.world.width, H = this.world.height;
    // The king stands on the floor of his colony's basin. Read the landmark
    // from the terrain itself rather than repeating the numbers here — the
    // crown and the contours around it must never be able to disagree.
    const L = window.TopoLandmarks && window.TopoLandmarks.BASIN;
    const b = L ? L[colony] : null;
    if (b) return { x: W * b.x, y: H * b.y };
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
        .slice(0, this.guardCount[c]);
      /* DECOY (Plover) — "draw the detail off the crown before committing".
         LOBO's counter to GUARDED, and inert until now. A feigned threat away
         from the crown peels the outermost guards off the shell, thinning it
         where the real approach comes. It takes the OUTERMOST first — the ones
         already furthest from the king are the ones a distraction reaches — and
         it can never strip the detail entirely: a crown left with no guard at
         all would make DECOY a win condition rather than a tactic. */
      for (const _a of this._living(c)) _a._decoyed = false;   // per-tick, not a brand
      const _e2 = window.MurmurationModules.Attrition && window.MurmurationModules.Attrition.loboEvolve;
      const _i2 = window.MurmurationModules.Attrition && window.MurmurationModules.Attrition.immunity;
      if (_e2 && _e2.has && _e2.has('DECOY') && detail.length > 2) {
        const pot = _i2 ? _i2.potency(c, 'DECOY') : 1;
        const pull = Math.min(detail.length - 2, Math.round(detail.length * 0.4 * pot));
        for (let i = 0; i < pull; i++) {
          const g = detail.pop();          // outermost first
          if (g) { g.a._decoyed = true; g.a._attritionGuard = false; }
        }
      }
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
      /* AN ENCOUNTER, NOT A SIGNAL. The alarm may have brought them here;
         being here is what teaches. Reached through the module singleton — this
         class does not own the reaction ladder, and a `this.reactions` guard
         here would be a no-op that never fires and never complains. */
      if (attackers >= 1 && (this.world.time % 60 === 0)) {
        const _A = window.MurmurationModules.Attrition;
        if (_A && _A.reactions) _A.reactions.recordEncounter(c, 'assault', { at: this.world.time });
      }
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
        unlocked:{A:true,B:true}, _innate:true,
        desc:'consensus threshold — nothing fires until a quorum independently confirms the threat' },
      { id:'biofilmShield', trait:'Biofilm Shield (P. aeruginosa)', kind:'defense',
        unlocked:{A:false,B:false}, dur:180, cd:120,   // shared UNLOCKABLE now — the turtle shell is neither archetype's birthright; either can learn it
        desc:'the colony tightens into a collective shell around the king — protection is emergent, no one cell makes it' },
      // WASP ALARM — the first UNLOCKABLE rung, and deliberately so. It changes
      // colony behaviour globally, so if it were innate there would be no run in
      // which the colony is observed WITHOUT it and the control condition would
      // not exist. Locked at open, every session carries its own baseline and
      // the unlock is a known tick where behaviour visibly changes — which is
      // also what makes a deviation legible instead of just surprising.
      // It sits AFTER quorum on purpose: the signal needs a threshold already in
      // place, or a call to arms is just a stampede.
      { id:'waspAlarm', trait:'Wasp Alarm Pheromone (Vespula)', kind:'signal',
        unlocked:{A:false,B:false},
        desc:'guards and the wounded release a call to arms that spreads outward — distance becomes delay, and the gradient says which way' },
      /* GEA — Ghost, 2026-08-25: "the next unlockable i want... and this may seem
         incorrect at first, but it should be GEA."

         It seems incorrect because it is not a combat trait. Camouflage, the
         bombardier and the wolf pack are all tactics; GEA is structure. And it
         is the most important rung on this ladder for one reason: LOBO was given
         memory across campaigns, and the colonies were not. The adversary
         compounds forever while the defence starts naive every run, so a colony
         must eventually lose — not for being worse, but because only one side
         was allowed to remember.

         GEA is the only entry in the catalog that answers that. It bundles #13
         Crow Tool, #14 Epigenetic Memory ("new agent instances inherit learned
         biases from all predecessors"), #43 Horizontal Gene Transfer and #50
         Collective Memory ("knowledge transcends individual agent lifespan").

         It also lands squarely on Population Boom: every replacement agent is
         currently born naive, so a colony that replenishes under pressure keeps
         diluting what it has learned. With GEA the replacements inherit.

         Ordered after the alarm deliberately. First a colony can CALL for help;
         then it can REMEMBER what happened. That is the order a nervous system
         actually develops in, and the reverse would be memory with nothing yet
         worth recording. */
      { id:'gea', trait:'GEA — Genetic Evolution Architecture', kind:'inheritance',
        unlocked:{A:false,B:false},
        desc:'the colony stops starting over: what it LEARNED carries between campaigns. Abilities do not travel (SR-011) — every unlock is earned again' },
      { id:'adaptiveImmunity', trait:'Adaptive Immunity (human immune system)', kind:'inheritance',
        unlocked:{A:false,B:false},
        desc:"the fifth founding word — the only one that LEARNS. Meets a LOBO tactic, builds a specific counter to THAT tactic, and remembers it. The first use always lands; the second is met. Never total, wanes unused, and refuses to bind self" },
      { id:'cephalopodCamouflage', trait:'Cephalopod Camouflage (Sepia)', kind:'defense',
        unlocked:{A:true,B:false}, _innate:true, dur:120, cd:200,   // KNOWHERE innate — the watcher hides its crown
        desc:'the king pattern-breaks — attackers lose their target lock for a beat' },
      { id:'bombardierBeetle', trait:'Bombardier Beetle (Brachinus)', kind:'offense',
        unlocked:{A:false,B:true}, _innate:true, dur:1, cd:260,   // MAINLAND innate — the brawler's coordinated burst (with Wolf Pack = pure aggression, no turtling)
        desc:'multi-signal convergence fires a coordinated burst at the crown — structurally cannot misfire' },
      { id:'wolfPack', trait:'Wolf Pack (Canis lupus)', kind:'offense',
        unlocked:{A:false,B:true}, _innate:true, dur:220, cd:180,   // MAINLAND innate — the striker hunts attackers down
        desc:'a hunting party breaks off under a tactician and runs the attackers down' },
      // #28 FLASH EXPANSION (Clupea harengus) — the school explodes outward as the
      // strike commits, so it lands in empty water; the coherent target the
      // attackers locked onto is gone, and they reform after.
      { id:'flashExpansion', trait:'Flash Expansion Evasion (Clupea harengus)', kind:'defense',
        unlocked:{A:false,B:false}, dur:36, cd:240,
        desc:'the crown-guard bursts apart the instant the strike commits — it lands in empty water, and the attackers lose the coherent target they locked onto' },
      // #8 PLANARIAN REGENERATION (Schmidtea) — a founding-word lineage. Any
      // fragment reconstructs the whole: the colony regrows lost defenders at the
      // crown. The structural answer to attrition, not a tactic.
      { id:'planarianRegeneration', trait:'Planarian Regeneration (Schmidtea mediterranea)', kind:'regen',
        unlocked:{A:false,B:false}, dur:1, cd:320,
        desc:'any fragment reconstructs the whole — the colony regrows fallen defenders at the crown. attrition is answered with tissue, not just tactics' },
      // #45 ELECTRIC ORGAN DISCHARGE (Electrophorus) — the high-voltage face of
      // the multi-voltage organ: an emergency override that empties the water of
      // motion. Attackers at the crown are STUNNED, not ejected — held for a beat.
      { id:'electricDischarge', trait:'Electric Organ Discharge (Electrophorus electricus)', kind:'offense',
        unlocked:{A:true,B:false}, _innate:true, dur:24, cd:240,   // KNOWHERE innate — close-quarters shock, the watcher's only deterrent (buy time, don't kill)
        desc:'a high-voltage discharge stuns everything hostile at the crown — their charge frozen for a beat, buying the window a strike would not' },
      // AFRICANIZED HONEY BEE — thermal balling. The colony can't out-sting the wasp, so it
      // ENGULFS a hostile cluster in a living ball and vibrates it HOT until the trapped COOK.
      // Self/not-self by heat: the colony tolerates its own; a light toll bites only under
      // sustained use. Needs a pheromone call (the quorum confirm) + a ball of ≥15 that actually
      // closes on the knot. KNOWHERE-innate for now (the tactician's first DENY tool); shared later.
      { id:'thermalBalling', trait:'Thermal Balling (Apis mellifera scutellata)', kind:'defense',
        unlocked:{A:true,B:false}, _innate:true, dur:60, cd:300,   // KNOWHERE innate — collective deny-by-heat
        desc:'the colony engulfs a hostile cluster in a living ball and vibrates it red-hot — the trapped cook while the colony tolerates its own heat. needs a pheromone call and a ball of ≥15' },
    ];
  }

  /* ── GEA: THE COLONY STOPS STARTING OVER ────────────────────────────────
     The mirror of LOBO's persistence, and deliberately NOT the same shape.
     LOBO remembers COUNTERS — what it learned to do. A colony remembers what it
     UNLOCKED and what its dead knew, which is inheritance rather than tactics.

     Gated on the GEA rung itself: until it is unlocked, none of this runs and
     the colony genuinely does start naive. That keeps the baseline honest —
     memory has to be EARNED before it can be relied on. */
  /* ── GEA CARRIES KNOWLEDGE, NOT ABILITIES ────────────────────────────────
     Ghost, 2026-08-25: "compartmentalization! THATS the key. gea only effects
     knowledge not abilities per say. meaning pheromones arent teaching anything
     new. the encounter that it leads to does. and the only knowledge that
     crosses both colonies happens off map."

     This corrects a category error in the first version, which inherited the
     UNLOCK LIST — so a colony was born already holding the alarm. That is an
     ability, and an ability has to be earned in the campaign that uses it.
     Otherwise the ladder decays into a save file and no run starts honest.

     What survives is what was LEARNED. And the pheromone teaches nothing: it is
     transport, not instruction. Alarm to convergence to ENCOUNTER — the meeting
     is where anything is learned, and only encounters are written down.

     THREE COMPARTMENTS, and knowledge only moves the way each allows:
       within a colony ..... encounters accumulate as they happen
       across campaigns .... one colony's own encounters, if it earned GEA
       across colonies ..... NEVER on the map. Only through the
                             AttritionKnowledge seam, which is off-map, versioned
                             and explicit. Two colonies standing in the same
                             field learn nothing from each other. */
  _geaKey(colony){ return 'attrition.colony.knowledge.v3.' + colony; }

  geaActive(colony){ const r = this.byId('gea'); return !!(r && r.unlocked[colony]); }

  /** An ENCOUNTER — the only thing that counts as learning. Called when a colony
      actually meets something, never when it merely signals. */
  recordEncounter(colony, kind, detail) {
    this.encounters = this.encounters || { A:{}, B:{} };
    const e = this.encounters[colony] || (this.encounters[colony] = {});
    e[kind] = (e[kind] || 0) + 1;
    if (detail) { e._last = e._last || {}; e._last[kind] = detail; }
    return e[kind];
  }

  /** What a colony KNOWS: how often it has met each thing before. */
  knowledgeOf(colony) { return (this.encounters && this.encounters[colony]) || {}; }

  /** Familiarity with one kind of encounter, 0..1. Knowledge SHORTENS
      recognition; it never hands over a capability. A colony that has met this
      before confirms it faster — it still needs the sense to notice at all. */
  familiarity(colony, kind) {
    const n = this.knowledgeOf(colony)[kind] || 0;
    return Math.min(1, n / 8);
  }

  saveInheritance(colony){
    if (!this.geaActive(colony)) return null;
    try {
      const enc = { ...this.knowledgeOf(colony) };
      /* Immune MEMORY is knowledge and travels. Circulating antibody (titre) is
         a present capability and does not — a colony inherits knowing how to
         build the response, never the response already built (SR-011). */
      const _IM = window.MurmurationModules.Attrition && window.MurmurationModules.Attrition.immunity;
      const imm = _IM ? _IM.knowledgeFor(colony) : null;
      // Deliberately NOT the unlock list. Abilities do not travel.
      window.localStorage.setItem(this._geaKey(colony), JSON.stringify({
        encounters: enc, immune: imm, savedAt: Date.now()
      }));
      return { encounters: enc, immune: imm };
    } catch(e){ return null; }
  }

  restoreInheritance(colony){
    try {
      const raw = window.localStorage.getItem(this._geaKey(colony));
      if (!raw) return null;
      const d = JSON.parse(raw);
      this.encounters = this.encounters || { A:{}, B:{} };
      this.encounters[colony] = { ...(d.encounters || {}) };
      this._inheritedImmune = d.immune || null;
      // The colony wakes KNOWING things and ABLE to do nothing extra. Every
      // unlock, including GEA itself, must be earned again this campaign.
      return { encounters: this.encounters[colony], immune: d.immune || null };
    } catch(e){ return null; }
  }

  /** OFF-MAP ONLY. The single sanctioned route by which one colony's knowledge
      can reach the other — through the versioned seam, never through the field.
      Two colonies standing in the same pheromone still learn nothing from each
      other; this is a debrief, and it happens somewhere else. */
  shareOffMap(fromColony, toColony) {
    const src = this.knowledgeOf(fromColony);
    if (!Object.keys(src).length) return null;
    window.MurmurationModules.AttritionKnowledge.recordOutcome({
      event: 'off_map_debrief', from: fromColony, to: toColony,
      encounters: { ...src }
    });
    this.encounters = this.encounters || { A:{}, B:{} };
    const dst = this.encounters[toColony] || (this.encounters[toColony] = {});
    for (const k in src) {
      if (k === '_last') continue;
      // Second-hand knowledge is worth less than having been there.
      dst[k] = (dst[k] || 0) + Math.floor(src[k] * 0.5);
    }
    return { from: fromColony, to: toColony, shared: Object.keys(src).length };
  }

  forgetInheritance(colony){
    for (const c of (colony ? [colony] : ['A','B'])) {
      try { window.localStorage.removeItem(this._geaKey(c)); } catch(e){}
      if (this.encounters) this.encounters[c] = {};
      for (const r of this.reactions) if (!r._innate) r.unlocked[c] = false;
    }
    return true;
  }

  byId(id){ return this.reactions.find(r=>r.id===id); }
  unlockedList(colony){ return this.reactions.filter(r=>r.unlocked[colony]); }
  lockedList(colony){ return this.reactions.filter(r=>!r.unlocked[colony]); }

  /** Reveal the next locked reaction — called once per evolution cycle (item 5). */
  unlockNext(colony){
    const next = this.reactions.find(r=>!r.unlocked[colony]);
    if(next){ next.unlocked[colony] = true;
      this.fireLog.unshift({ t:this.world.time, id:next.id, colony,
        msg:'UNLOCKED ' + next.trait + ' — colony ' + colony }); }
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
    /* FEINT (Anglerfish) — "split into probes too small to confirm". LOBO's
       counter to QUORUM, and until now it was ADOPTED BUT INERT: LOBO could
       adapt into a trait that did nothing at all.

       It works by shrinking the window in which two defenders count as having
       seen the SAME thing, so the same bodies no longer add up to a consensus.
       Scaled by potency, so a colony that has learned this tactic sees through
       it — which is the first place neutralisation blunts a tactic IN PLAY
       rather than merely deciding whether LOBO should drop it. */
    let _sr = this.threatR * 0.6;
    const _ev = window.MurmurationModules.Attrition && window.MurmurationModules.Attrition.loboEvolve;
    const _im = window.MurmurationModules.Attrition && window.MurmurationModules.Attrition.immunity;
    if (_ev && _ev.has && _ev.has('FEINT')) {
      const pot = _im ? _im.potency(colony, 'FEINT') : 1;
      _sr *= (1 - 0.45 * pot);
    }
    const sensing = this.world.agents.filter(a=>a.colony===colony && !a.seppukuDone &&
      threat.some(u=>Math.hypot(a.x-u.x,a.y-u.y) < _sr)).length;
    // §7 TIC muster lowers the confirmation bar — the colony fires on a hair-trigger under alarm
    const bonus = (this.musterBonus && this.musterBonus[colony]) || 0;
    /* THE COLONY'S STATE OF MIND DECIDES THE THRESHOLD, not us.
       Stress never tells anyone what to do — it moves THIS number, and every
       behaviour downstream changes without a new rule. Paranoia pulls it down
       (act on less), fatigue pushes it up (demand more), and where it lands is
       the running argument between how often this colony has been wrong and how
       often it has been tired. */
    const _st = window.MurmurationModules.Attrition &&
                window.MurmurationModules.Attrition.stress;
    const q = _st ? _st.quorumFor(colony, this.quorum) : this.quorum;
    /* FAMILIARITY IS KNOWLEDGE DOING ITS ONLY JOB. A colony that has met this
       before confirms it faster — at most one fewer confirmation. It does not
       gain a sense, cannot notice what it has no sense for, and a colony without
       the alarm is exactly as deaf as before no matter how much it knows. */
    const fam = this.familiarity(colony, 'assault');
    return sensing >= Math.max(1, q - bonus - Math.round(fam));
  }

  step(){
    const t = this.world.time;
    // Thermal-balling heat COOLS when no longer engulfed — an escapee cools off (only the ones
    // held in the ball cook), and a baller's own heat fades once it leaves (only sustained/extreme
    // balling keeps it high enough to glow white and take real harm). No permanent brand.
    for(const a of this.world.agents){
      if(a._beeHeat>0)  a._beeHeat =Math.max(0, a._beeHeat -0.02);   // trapped hostile cools if it escapes
      if(a._ballHeat>0) a._ballHeat=Math.max(0, a._ballHeat-0.015);  // baller cools once out of the ball
    }
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
      for(const r of this.unlockedList(colony)){
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
        // THERMAL BALLING needs a real cluster to swallow AND the bodies to swallow it — as few
        // as 15 free members can answer the pheromone call, but they MUST be there to muster.
        if(r.id==='thermalBalling'){
          const avail = this.world.agents.filter(a=>a.colony===colony && !a.seppukuDone && !a.isKing && !a._attritionGuard).length;
          if(avail < 15 || threat.length < 3) continue;
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
        const _B=window.MurmurationModules.Attrition.bleed; if(_B) _B.rewardKill(colony, cleared);
      }
    } else if(r.id==='wolfPack'){
      // A pack breaks off and runs the nearest attackers down. Tactician = the
      // highest-trust free member; the pack pursues; on contact a strike, and
      // enough strikes eject the invader.
      const pack = this.world.agents
        .filter(a=>a.colony===colony && !a.seppukuDone && !a.isKing && !a._attritionGuard)
        .sort((a,b)=>(b.trustCharge||0)-(a.trustCharge||0)).slice(0,4);
      let kills=0;
      for(const h of pack){
        let tgt=null, best=1e9;
        for(const u of threat){ const d=Math.hypot(u.x-h.x,u.y-h.y); if(d<best){best=d;tgt=u;} }
        if(!tgt) continue;
        const d=best||1;
        h.vx += ((tgt.x-h.x)/d)*0.16; h.vy += ((tgt.y-h.y)/d)*0.16;
        if(d < 14){ tgt._attritionStruck=(tgt._attritionStruck||0)+1;
          if(tgt._attritionStruck>=3){ tgt.seppukuDone=true; tgt._attritionEjected=true; kills++;
            window.MurmurationModules.AttritionKnowledge.recordOutcome({
              event:'attacker_eliminated', colony, by:'wolfPack' }); } }
      }
      if(kills){ const _B=window.MurmurationModules.Attrition.bleed; if(_B) _B.rewardKill(colony, kills); }
    } else if(r.id==='flashExpansion'){
      // The school explodes: crown-near defenders burst radially outward, and the
      // attackers' lock on the (now-gone) coherent target is damped for the beat.
      for(const a of this.world.agents){
        if(a.colony!==colony || a.seppukuDone || a.isKing) continue;
        const d=Math.hypot(a.x-home.x,a.y-home.y)||1;
        if(d < this.threatR){ a.vx += ((a.x-home.x)/d)*0.16; a.vy += ((a.y-home.y)/d)*0.16; }
      }
      for(const u of threat){
        const d=Math.hypot(u.x-home.x,u.y-home.y)||1;
        u.vx -= ((home.x-u.x)/d)*0.06; u.vy -= ((home.y-u.y)/d)*0.06;
      }
    } else if(r.id==='planarianRegeneration'){
      // Any fragment reconstructs the whole — regrow a few fallen defenders at the
      // crown through the same reinforcement path Population Boom uses (caps at 100).
      if(this.world.spawnColonyReinforcements){
        this.world.spawnColonyReinforcements(3, colony);
        window.MurmurationModules.AttritionKnowledge.recordDefense({
          event:'regenerated', colony, added:3, gene:'planarianRegeneration' });
      }
    } else if(r.id==='electricDischarge'){
      // High-voltage override: freeze the charge of everything hostile at the crown.
      // Held, not ejected (the beetle ejects) — a stun window the defenders can use.
      let stunned=0;
      for(const u of threat){
        const d=Math.hypot(u.x-home.x,u.y-home.y)||1;
        if(d < this.kings.captureR*2.2){ u.vx*=0.05; u.vy*=0.05; u._attritionStunned=this.world.time+30; stunned++; }
      }
      if(stunned) window.MurmurationModules.AttritionKnowledge.recordDefense({
        event:'discharge_stun', colony, stunned, gene:'electricDischarge' });
    } else if(r.id==='thermalBalling'){
      // AFRICANIZED HONEY BEE — call the ball, engulf the knot, COOK it. The quorum confirm that
      // fired this IS the pheromone call; free members answer and close on the densest hostile
      // knot, and where ≥15 actually engulf it, heat builds on the trapped until they cook.
      // Self/not-self by heat: the trapped glow RED-HOT and die; the ballers take only a light
      // toll, and only a big/sustained ball heats THEM enough to matter (white-with-blue-core).
      if(!threat.length) return;
      let knot=null, bestNear=-1;
      for(const u of threat){ let n=0; for(const v of threat){ if(Math.hypot(u.x-v.x,u.y-v.y)<55) n++; } if(n>bestNear){bestNear=n;knot=u;} }
      if(!knot) return;
      const ballR=60;
      const ballers=this.world.agents.filter(a=>a.colony===colony && !a.seppukuDone && !a.isKing);
      let engulfing=0;
      for(const a of ballers){
        const d=Math.hypot(a.x-knot.x,a.y-knot.y)||1;
        if(d<ballR*2.2){ a.vx+=((knot.x-a.x)/d)*0.10; a.vy+=((knot.y-a.y)/d)*0.10; }   // answer the call, close in
        if(d<ballR) engulfing++;
      }
      if(engulfing<15) return;   // the call went out but the ball hasn't closed — no cook this beat
      const hot=0.06*Math.min(2, engulfing/15);
      let cooked=0;
      for(const u of threat){
        if(Math.hypot(u.x-knot.x,u.y-knot.y)<ballR){
          u._beeHeat=(u._beeHeat||0)+hot;                                    // glows red-hot (agent.js draw)
          if(u._beeHeat>=1){ u.seppukuDone=true; u._attritionEjected=true; cooked++; }
        }
      }
      // the ballers' OWN heat CLIMBS only when the ball is big/sustained — a minimal 15-ball stays
      // cool (the step-decay wins); a big one drives it past the white-glow line (0.8) and, past
      // that, starts to actually cost energy. Extreme use is felt; ordinary use is nearly free.
      const selfHeat=0.05*Math.max(0, engulfing/15-1);
      for(const a of ballers){
        if(Math.hypot(a.x-knot.x,a.y-knot.y)<ballR){
          a._ballHeat=Math.min(2, (a._ballHeat||0)+selfHeat);
          if(a.energy!=null) a.energy=Math.max(0, a.energy-(0.0015+0.05*Math.max(0,(a._ballHeat||0)-0.6)));
        }
      }
      const H=window.MurmurationModules.Attrition.heat;
      if(H && H.add) H.add('BREACH', knot.x, knot.y, 0.5);                    // paint the heat wash where it cooks
      if(cooked){ window.MurmurationModules.AttritionKnowledge.recordOutcome({
        event:'attacker_cooked', colony, cooked, ball:engulfing, gene:'thermalBalling' });
        const _B=window.MurmurationModules.Attrition.bleed; if(_B) _B.rewardKill(colony, cooked); }
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

      /* ── THE ADVANCE ON THE CROWN ──────────────────────────────────────
         Found by Ghost's first full campaign, 2026-08-25: the colonies beat
         LOBO without unlocking a single trait. Measuring it showed the
         adversary was not being killed — 22 sent, 17 alive after 400 ticks,
         colony casualties ZERO — it was milling at 213-228 units from a crown
         it never approached. Only 3 of 22 ever entered the keep's zone.

         The reason was not balance. NOTHING DROVE THEM AT THE CROWN. An
         OCCUPATION wave targets commons zones, and no drive existed to press a
         king, so the keep was never assaulted — it was walked past. Every
         defensive number I measured was answering a question nobody asked.

         Scaled against the world's ambient current (0.19), because this engine
         has already been caught by that once: the circuit drive shipped 8x
         weaker than the current and only 2 of 108 agents ever advanced. Below
         half determination the advance is genuinely drowned and the unaligned
         drift as before; at full determination it clearly dominates. That is
         what makes the dial mean something rather than merely count bodies. */
      /* H2O DECIDES HOW THIS WAVE MOVES, before it moves.
         A silent approach is only attempted when the gate says the silence is
         credible; refused, LOBO presses honestly instead. Structural, not a
         gamble — the same discipline the pentest engine applies to a finding. */
      const _ev = window.MurmurationModules.Attrition.loboEvolve;
      let stealth = null;
      if (_ev && _ev.h2oStealthGate) {
        const al = window.MurmurationModules.Attrition.alarm;
        const guards = this.world.agents.filter(a => a._attritionGuard && !a.seppukuDone &&
          Math.hypot(a.x - home.x, a.y - home.y) < this.threatR).length;
        stealth = _ev.h2oStealthGate({
          alarmLevel: al && al.enabled ? (al.stats()[colony] || 0) : 0,
          committed: pawns.length,
          defendersNear: 0,
          guardsAtCrown: guards,
          insideKeep: false
        });
        if (stealth.allowed && !this._silentAnnounced) {
          this._silentAnnounced = true;
          if (window.logLine) window.logLine(
            `◐ LOBO GOES QUIET — H2O passed at ${stealth.confidence}: ${stealth.reason}`, 'crisis');
        }
      }
      // A silent approach moves SLOWER — speed is noise. Refused, it presses.
      const adv = (stealth && stealth.allowed ? 0.05 + force * 0.10
                                              : 0.08 + force * 0.22);
      for (const p of pawns) {
        const dx = home.x - p.x, dy = home.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 12) continue;                  // already on the crown
        p.vx += (dx / d) * adv;
        p.vy += (dy / d) * adv;
      }
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
    // ── §6 · CONSERVED HONOR ECONOMY (2026-08-28, Ghost) ──────────────────────
    // Honor is a FIXED POOL — "all there is" — split THREE ways at max and only ever
    // TRANSFERRED, never created or destroyed. The old §6 drained honor into the void;
    // this MOVES it: whoever disrespects a crown TAKES that honor off the possessed.
    // Three parties: A (Knowhere) · B (Mainland) · U (LOBO). Sum(honor) is invariant.
    // The prize (Ghost): the party holding the MOST at the end passes its knowledge
    // WITHOUT seppuku — it survives AND propagates; the losers pay the old price.
    this.START = 1.0;                    // per-party max at kickoff — "every colony at max" (tunable)
    this.honor = { A: this.START, B: this.START, U: this.START };
    this.pool  = this.honor.A + this.honor.B + this.honor.U;   // conserved invariant (= 3·START)
    // The transfer rate reuses the sweep-derived bleed value — SAME disrespect engine
    // as before (§7 TIC), new destination. "transfers through battle the same as it
    // does now with disrespect."
    this.bleedRate = 0.004;
    // BREAK-POSSESSION RECLAIM — the containment fight now takes honor BACK off the
    // possessor (conserved), MTTR-scaled: a swift break reclaims the most.
    this.staunchWindow = 300;
    this.staunchReward = 0.12;
    // OFFENSIVE HONOR (2026-08-29, Ghost: "an even playing field... recover just as fast") — a
    // colony that ELIMINATES a LOBO unit TAKES honor off it, the mirror of possession. LOBO gains
    // by sitting on a crown; the colony gains by DESTROYING the threat. This is how a defender wins
    // the pool or claws back from a drain — kills answer possession, so turtling loses but fighting
    // recovers. Drain LOBO to zero and it cascades out ("defeat the threat altogether").
    this.killReward = 0.008;             // honor taken from LOBO per unit eliminated (tunable)
    // DOMINANCE ENDS IT (Ghost ②a): first party to hold this fraction of the WHOLE pool
    // wins — >0.5 means it holds more than the other two combined. Tunable.
    this.winThreshold = 0.5;
    // CONTINUOUS MODE — after a victory, hold it a beat (so the gold banner is seen), then
    // re-even the pool and open a fresh round. autoReset=false = the match ends for good.
    this.autoReset = true;
    this.victoryHold = 600;              // ticks the win holds before the next round opens
    this.round = 1;
    this.wins = { A: 0, B: 0, U: 0 };    // round championships, tallied across the session
    this._resolvedAt = null;
    this.cascaded = { A: false, B: false, U: false };
    this.resolved = null;                // winner id once the tally fires; halts the economy
    this.events = [];                    // transfer / staunch / cascade / victory, with ticks
    this._captureStart = {};
  }

  setBleedRate(r) { this.bleedRate = Math.max(0, r); return this.bleedRate; }
  /** Re-seed the pool at a new per-party max (tuning hook). */
  setStart(s) {
    this.START = Math.max(0.01, s);
    this.honor = { A: this.START, B: this.START, U: this.START };
    this.pool = this.START * 3;
    this.cascaded = { A: false, B: false, U: false };
    this.resolved = null; this._captureStart = {};
    return this.START;
  }
  setWinThreshold(f) { this.winThreshold = Math.min(1, Math.max(0.34, f)); return this.winThreshold; }
  setAutoReset(b) { this.autoReset = !!b; return this.autoReset; }
  setKillReward(r) { this.killReward = Math.max(0, r); return this.killReward; }

  /** A colony that ELIMINATES n LOBO units TAKES honor off it — the offensive mirror of
      possession, and how a defender wins or recovers. Conserved and clamped to LOBO's holdings. */
  rewardKill(colony, n) {
    if (this.resolved || this.cascaded[colony] || !(n > 0)) return 0;
    const got = this._transfer('U', colony, this.killReward * n);
    if (got > 0) this.events.push({ t: this.world.time, colony, event: 'kill_honor', from: 'U', amt: +got.toFixed(4), kills: n });
    return got;
  }

  /** Move honor from -> to, CONSERVED and clamped to what `from` actually holds. */
  _transfer(from, to, amt) {
    amt = Math.min(amt, this.honor[from]);
    if (amt <= 0) return 0;
    this.honor[from] -= amt;
    this.honor[to]   += amt;
    return amt;
  }

  step() {
    const t = this.world.time;
    if (this.resolved) {                        // the match is decided — honor holds a beat
      if (this.autoReset && this._resolvedAt != null && t - this._resolvedAt >= this.victoryHold) {
        // OPEN A FRESH ROUND — re-even the pool, lift the cascade flags (survivors fight on;
        // auto-replenish refills the bodies). The win is already tallied in this.wins.
        this.round++;
        this.honor = { A: this.START, B: this.START, U: this.START };
        this.cascaded = { A: false, B: false, U: false };
        this._captureStart = {}; this.resolved = null; this._resolvedAt = null;
        this.events.push({ t, event: 'NEW_ROUND', round: this.round });
        window.MurmurationModules.AttritionKnowledge.recordOutcome({ event: 'new_round', round: this.round, wins: { ...this.wins } });
      }
      return;
    }
    for (const colony of ['A', 'B']) {
      if (this.cascaded[colony]) continue;      // a cascaded colony is out of the fight
      const captured = this.kings.captured[colony];

      if (captured) {
        if (!this._captureStart[colony]) {
          this._captureStart[colony] = t;
          this.events.push({ t, colony, event: 'captured' });
          window.MurmurationModules.AttritionKnowledge.recordOutcome({ event: 'bleed_start', colony });
        }
        // §7: the transfer is EARNED — it scales with how badly the crown is being
        // disrespected right now. LOBO (U) is the possessor: honor moves colony -> U.
        const insult = this.tic ? Math.max(0.5, this.tic.disrespect[colony] / 0.85) : 1;
        const moved = this._transfer(colony, 'U', this.bleedRate * insult);
        if (moved > 0) this.events.push({ t, colony, event: 'transfer', to: 'U', amt: +moved.toFixed(4) });
        if (this.honor[colony] <= 1e-9) {
          this._transfer(colony, 'U', this.honor[colony]);   // hand over the residue — stay exactly conserved
          this.honor[colony] = 0;
          this.cascaded[colony] = true;
          const held = t - this._captureStart[colony];
          this.events.push({ t, colony, event: 'CASCADE', heldTicks: held });
          window.MurmurationModules.AttritionKnowledge.recordOutcome({ event: 'cascade', colony, heldTicks: held });
          this._cascade(colony);
        }
      } else {
        if (this._captureStart[colony]) {
          // MITIGATED — the colony broke the possession and RECLAIMS honor FROM the
          // possessor (conserved: it takes it back off U, MTTR-scaled). A relentless
          // defender can drain U past its own start and grow toward dominance.
          const mttr = t - this._captureStart[colony];
          const swift  = Math.max(0, 1 - mttr / this.staunchWindow);
          const reward = this.staunchReward * swift;
          const got = this._transfer('U', colony, reward);
          this.events.push({ t, colony, event: 'staunched', mttr, reclaimed: +got.toFixed(3), honorLeft: +this.honor[colony].toFixed(3) });
          window.MurmurationModules.AttritionKnowledge.recordDefense({ event: 'staunched', colony, mttr, reward: got, honorLeft: this.honor[colony] });
          this._captureStart[colony] = null;
        }
        // NO passive recovery — honor is conserved. A colony heals ONLY by taking it back.
      }
    }
    // LOBO is out if the colonies strip it to nothing.
    if (!this.cascaded.U && this.honor.U <= 1e-9) {
      this.honor.U = 0; this.cascaded.U = true;
      this.events.push({ t, colony: 'U', event: 'CASCADE' });
      window.MurmurationModules.AttritionKnowledge.recordOutcome({ event: 'cascade', colony: 'U' });
    }
    // ── DOMINANCE TALLY (Ghost ②a) — first to hold the winning share takes the pool.
    for (const p of ['A', 'B', 'U']) {
      if (this.honor[p] >= this.pool * this.winThreshold) { this._resolve(p, t); break; }
    }
  }

  /** RESOLUTION — the party with the most honor passes its knowledge WITHOUT seppuku
      (survives + propagates); the losers pay the old price (cascade -> seppuku, Ghost ③b).
      The knowledge-passing distinction is recorded for the GEA/inheritance layer. */
  _resolve(winner, t) {
    this.resolved = winner;
    this._resolvedAt = t;
    this.wins[winner] = (this.wins[winner] || 0) + 1;
    const losers = ['A', 'B', 'U'].filter(p => p !== winner);
    this.events.push({ t, event: 'HONOR_VICTORY', winner, honor: +this.honor[winner].toFixed(3), losers });
    window.MurmurationModules.AttritionKnowledge.recordOutcome({
      event: 'honor_victory', winner, losers,
      winnerPassesWithoutSeppuku: true, losersPassViaSeppuku: true,
      honor: { A: +this.honor.A.toFixed(3), B: +this.honor.B.toFixed(3), U: +this.honor.U.toFixed(3) },
    });
    for (const l of losers) if (l === 'A' || l === 'B') { this.cascaded[l] = true; this._cascade(l); }
  }

  /** The cascade — a colony's collapse. It IS cascade-seeking, so the failure is
      expressed in its own physics: grief propagates through the survivors. */
  _cascade(colony) {
    for (const a of this.world.agents) {
      if (a.colony !== colony || a.seppukuDone) continue;
      a.griefLevel = Math.min(1, (a.griefLevel || 0) + 0.6);
      if (a.griefState === 'ACTIVE') a.griefState = 'GRIEVING';
    }
  }

  /** Total honor in play — must equal `this.pool` every tick (conservation check). */
  totalHonor() { return this.honor.A + this.honor.B + this.honor.U; }

  status(colony) {
    return {
      honor: +this.honor[colony].toFixed(3),
      bleeding: !!this._captureStart[colony] && !this.cascaded[colony],
      cascaded: this.cascaded[colony],
      resolved: this.resolved,
    };
  }
};

/* ── §7 · DISRESPECT + TIC TRAIL — the muster ───────────────────────────────
   Ghost, 2026-08-20. Honor was missing its EMOTION. Grief was the wrong one:
   grief withdraws — it damps reactivity ("the grieving move more slowly") — and
   an alarm must MOBILISE. The honor-emotion is DISRESPECT: an enemy on your
   throne, a guard shoved aside, a stranger in your sacred ground. Disrespect
   drives honor down AND sounds the alarm.

   The alarm is a NEW GENE: TIC TRAIL — the hornet/bee ALARM PHEROMONE. A
   defender in contact (TIC = Troops In Contact) releases a signal that
   PROPAGATES and turns one cell's distress into the whole colony's CALL TO ARMS.
   It is a pheromone TRAIL, not a global switch: it releases at the breach and
   ripples outward — the guards nearest the throne muster first, the far edge
   arrives last. What it musters is the QRF (Quick Reaction Force): AROUSAL +
   RALLY + a HAIR-TRIGGER on the §4 reactions (a lower quorum under alarm).

   One gene, two faces (the genome's law):
     DEFENCE — the colony's QRF rallies to the king.
     OFFENCE — LOBO's twin: a downed pawn's distress recalls the pack toward the
               loss. "Kill one, more rise" becomes a pheromone, not a spawn rule.

   Emotional arc: disrespect -> answer it (honor heals) OR -> honor bleeds out ->
   cascade -> grief (§6). Fight first; mourn only if you lose.

   ⚠️ The weights/dynamics below are TUNABLE PLACEHOLDERS, not decrees — set them
   from a sweep the way §6's bleed rate was. */
window.MurmurationModules.AttritionTIC = class AttritionTIC {
  constructor(world, kings, reactions, lobo) {
    this.world = world;
    this.kings = kings;
    this.reactions = reactions;
    this.lobo = lobo;
    this.disrespect = { A: 0, B: 0 };   // 0..1 colony disrespect — drives honor + alarm
    this.trail = [];                    // live pheromone: {x,y,colony,face,str,born}
    // TUNABLE placeholders
    this.wTrespass = 0.04;   // per unaligned inside the guard ring
    this.wCrown    = 0.85;   // an unaligned ON the crown — the throne insult (maximal)
    this.easeDown  = 0.978;  // disrespect eases only as the violation is answered
    this.fireAt    = 0.30;   // disrespect that sounds the alarm
    this.trailR    = 150;    // pheromone sense radius
    this.trailTTL  = 90;     // ticks a deposit stays potent
    this.musterMax = 2;      // max §4 quorum reduction under full alarm (hair-trigger)
    if (reactions && reactions.musterBonus == null) reactions.musterBonus = { A: 0, B: 0 };
  }

  /** Depth of violation -> colony disrespect. */
  _measure(colony) {
    const home = this.kings.home(colony);
    const R = this.kings.captureR;
    let d = 0;
    const intruders = this.world.agents.filter(a => a.colony === 'U' && !a.seppukuDone &&
      Math.hypot(a.x - home.x, a.y - home.y) < R * 2.4);
    d += intruders.length * this.wTrespass;
    if (this.kings.captured && this.kings.captured[colony]) d += this.wCrown; // possession
    return Math.min(1, d);
  }

  step() {
    for (const colony of ['A', 'B']) {
      const raw = this._measure(colony);
      // rises instantly to meet the violation; eases down only as it recedes (answered)
      this.disrespect[colony] = raw >= this.disrespect[colony]
        ? raw : this.disrespect[colony] * this.easeDown;

      const firing = this.disrespect[colony] >= this.fireAt;
      if (firing) {                                   // DEFENCE face — sound the alarm at the breach
        const home = this.kings.home(colony);
        this._release(home.x, home.y, colony, 'DEF', this.disrespect[colony]);
      }
      // hair-trigger: lower the §4 quorum in proportion to the alarm
      if (this.reactions && this.reactions.musterBonus) {
        this.reactions.musterBonus[colony] = firing
          ? Math.min(this.musterMax, Math.ceil(this.musterMax * this.disrespect[colony])) : 0;
      }
    }
    // OFFENCE face — a freshly downed pawn recalls the pack
    for (const a of this.world.agents) {
      if (a.colony === 'U' && a._attritionEjected && !a._ticEmitted) {
        a._ticEmitted = true;
        this._release(a.x, a.y, 'U', 'OFF', 0.8);
      }
    }
    this._propagate();
  }

  _release(x, y, colony, face, str) {
    this.trail.push({ x, y, colony, face, str, born: this.world.time });
    if (this.trail.length > 60) this.trail.shift();
  }

  /** The pheromone spreads and MUSTERS what it touches — arousal + rally. The
      sense-ring grows early then fades: that is the wave rippling out. */
  _propagate() {
    const t = this.world.time;
    this.trail = this.trail.filter(p => (t - p.born) < this.trailTTL);
    for (const p of this.trail) {
      const age = (t - p.born) / this.trailTTL;
      const potency = p.str * (1 - age);
      const senseR = this.trailR * (0.4 + 0.6 * (1 - age));   // the ripple
      for (const a of this.world.agents) {
        if (a.seppukuDone) continue;
        if (p.face === 'OFF' ? a.colony !== 'U' : a.colony !== p.colony) continue;
        const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy) || 1;
        if (d > senseR) continue;
        const pull = potency * (1 - d / senseR);
        a.vx += (dx / d) * 0.10 * pull;                       // RALLY — converge on the breach
        a.vy += (dy / d) * 0.10 * pull;
        a._muster = Math.max(a._muster || 0, pull);           // AROUSAL flag (speed/reactivity)
      }
    }
  }

  /** §6 reads this — honor bleeds by how disrespected the colony is RIGHT NOW. */
  drainFor(colony) { return this.disrespect[colony]; }

  status(colony) {
    return { disrespect: +this.disrespect[colony].toFixed(3),
             mustering: this.disrespect[colony] >= this.fireAt,
             deposits: this.trail.length };
  }
};

/* ── §8 · ATTRITION — per-agent mortality (the name, made literal) ──────────
   Ghost, 2026-08-20: "they should be susceptible to all of the above if hit
   enough times, but NOTHING kills them." The bug: colony cells had exactly one
   death path — grief-seppuku, gated on a CRISIS the honor mechanics never
   reached. So nothing died.

   This organ is the fix and the name. Every cell carries INTEGRITY (1 -> 0).
   Everything that should hurt chips it — a blade in melee, an empty belly, the
   despair of deep grief. Integrity RECOVERS in peace, so a cell only falls to
   SUSTAINED assault: a thousand cuts, literally, at the cell. At zero it dies
   (seppukuDone) and §6's reaper carries it off.

   It also closes §7's loop: the muster's AROUSAL (a._muster) is spent here as a
   real speed boost — mustered cells move faster, not just rally.

   Decoupled by design: honor is the colony's morale (§6), grief is the aftermath
   of loss, INTEGRITY is the body. Grief now CONTRIBUTES to death instead of being
   the sole gate. Three organs, three jobs.

   ⚠️ TUNABLE placeholders — sweep them the way §6's bleed rate was. */
window.MurmurationModules.AttritionMortality = class AttritionMortality {
  constructor(world, kings) {
    this.world = world; this.kings = kings;
    this.contactR   = 18;      // melee range
    this.contactDmg = 0.011;   // integrity/tick in enemy melee
    this.starveAt   = 0.22;    // energy below this = starving
    this.starveDmg  = 0.004;   // integrity/tick while starving
    this.griefAt    = 0.75;    // grief above this despairs the body
    this.griefDmg   = 0.002;   // integrity/tick from deep grief
    this.regen      = 0.0016;  // integrity healed/tick in peace
    this.arousal    = 0.55;    // muster -> speed boost
    this.deaths     = 0;
  }

  _hostile(a, b) {
    if (b.seppukuDone) return false;
    return a.colony === 'U' ? (b.colony === 'A' || b.colony === 'B') : (b.colony === 'U');
  }

  step() {
    for (const a of this.world.agents) {
      if (a.seppukuDone || a.isSentinel) continue;
      if (a.integrity == null) a.integrity = 1;
      let harmed = false;

      // COMBAT — a hostile within blade range wears the cell down
      const near = this.world.getNeighbors ? this.world.getNeighbors(a, this.contactR) : [];
      for (const b of near) { if (this._hostile(a, b)) { a.integrity -= this.contactDmg; harmed = true; break; } }

      /* STARVATION — an empty belly is a wound.
         FORAGE (Locust) — "sustain in the field; a siege no longer runs out
         before the colony does". LOBO's counter to STARVED, and inert until
         now. The unaligned feed themselves, so hunger stops being the thing
         that lifts a siege. Blunted by whichever colony has learned it. */
      let _sd = this.starveDmg;
      if (a.colony === 'U') {
        const _e = window.MurmurationModules.Attrition && window.MurmurationModules.Attrition.loboEvolve;
        const _i = window.MurmurationModules.Attrition && window.MurmurationModules.Attrition.immunity;
        if (_e && _e.has && _e.has('FORAGE')) {
          _sd *= (1 - 0.80 * (_i ? _i.potencyAny('FORAGE') : 1));
        }
      }
      if (a.energy != null && a.energy < this.starveAt) { a.integrity -= _sd; harmed = true; }

      // DEEP GRIEF — despair wears the body (grief contributes, no longer gates)
      if ((a.griefLevel || 0) > this.griefAt) { a.integrity -= this.griefDmg; harmed = true; }

      // PEACE HEALS — so it takes SUSTAINED assault to fall
      if (!harmed) a.integrity = Math.min(1, a.integrity + this.regen);

      // AROUSAL — spend §7's muster as real speed (closes the loop)
      if (a._muster && a._muster > 0) {
        const boost = 1 + this.arousal * Math.min(1, a._muster);
        a.vx *= boost; a.vy *= boost; a._muster *= 0.85;
      }

      // DEATH — the cell falls; the reaper (§6) carries it off after its ghost window
      if (a.integrity <= 0) {
        a.integrity = 0;
        a.seppukuDone = true;
        a._killedInAction = true;
        if (a.colony === 'U') a._attritionEjected = true;   // a downed pawn LOBO can read/replace
        this.deaths++;
        window.MurmurationModules.AttritionKnowledge.recordOutcome({ event: 'killed_in_action', colony: a.colony, by: 'attrition' });
      }
    }
  }

  status() { return { deaths: this.deaths }; }
};
