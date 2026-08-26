/* ══════════════════════════════════════════════════════════════════════════
   ADAPTIVE IMMUNITY — the fifth founding word.

   Ghost, 2026-08-25: "one last trait to be unlocked to go well with gea... is
   human immune system. that closes any gap lobo may gain, this way it wont ever
   be a lasting effect."

   The founding five are tardigrade, planarian, Turritopsis, Hydra, and the human
   immune system. The first four ENDURE. This one LEARNS — it is the only one of
   the five that is different after an injury than it was before, and that is
   exactly why it belongs beside GEA. GEA moves knowledge between campaigns;
   THIS is what produces knowledge in the first place. An antibody is a memory of
   an encounter, written in protein.

   WHAT IT CLOSES. LOBO adapts: it reads what killed it and adopts a counter
   (INFILTRATION, SAPPER, FEINT, FORAGE, DECOY). Before this, every adopted
   counter was permanent — a one-way ratchet, and a range whose adversary only
   ever gets stronger stops being a test and becomes a countdown. Adaptive
   immunity makes LOBO's gains PROVISIONAL without making them worthless.

   THE SHAPE OF THE ANSWER, and every part of it is real immunology:

     NOTHING WITHOUT EXPOSURE ... an antigen never met raises no response. The
       first use of any new tactic lands clean, always. This is not a handicap
       granted to LOBO; it is what an immune system IS.

     THE PRIMARY RESPONSE IS SLOW ... first exposure buys days, not minutes.
       LOBO's opening use of a tactic works, and works again while the response
       is still being built. Only then does titre rise.

     THE SECONDARY RESPONSE IS FAST ... this is the whole point. Once memory
       exists, re-exposure spikes almost at once. THIS is "it wont ever be a
       lasting effect": the same trick does not work twice.

     AFFINITY MATURES ... repeated exposure sharpens the match. Knowledge of an
       enemy improves by meeting it, not by thinking about it.

     TITRE WANES, MEMORY DOES NOT ... circulating antibody decays without
       re-exposure; the memory that can rebuild it persists far longer. A colony
       left alone becomes vulnerable again while still knowing how not to be.

     ANTIGENIC DRIFT ... and this is the part that keeps the range a range. LOBO
       can shed a trait and re-adopt it changed, and the antibody's match
       degrades. Neither side ever finishes. Influenza does this every year, and
       it is the reason immunity is an arms race rather than a victory.

     NEVER TOTAL ... neutralisation is capped below 1. A perfect block would be
       the same one-way ratchet pointed the other way.

   SELF-TOLERANCE IS THE LOAD-BEARING PART. From the founding-words canon: four
   immortalities without self/not-self discrimination is a CANCER — the reason
   NEMESIS and the Devil Gene exist at all. So this module STRUCTURALLY REFUSES
   to raise a response against its own colony's markers, and it refuses before
   acting rather than checking afterward. An immune system that cannot decline
   to bind self is not a defence; it is autoimmunity with extra steps.

   SCOPE. Ghost, 2026-08-25: "my thought process was focused on the learning
   aspect only." So this is the learning organ and nothing else. An autoimmune
   cross-reaction cost was built and CUT — it computed a number nothing consumed,
   which is cruft, not balance. What remains is exposure, response, memory, and
   the self/not-self refusal the founding-words canon requires of anything in
   this genome that can act on its own behalf.
   ══════════════════════════════════════════════════════════════════════════ */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.AdaptiveImmunity = class AdaptiveImmunity {
  constructor(world, opts = {}) {
    this.world = world;

    /* Granted per colony, like every other reaction — one colony may hold this
       while the other does not (SR-011 compartmentalization). */
    this.granted = { A: opts.enabled === true, B: opts.enabled === true };

    this.PRIMARY_LATENCY = opts.primaryLatency ?? 900;  // ticks before ANY titre
    this.PRIMARY_RATE    = opts.primaryRate    ?? 0.0016;
    this.SECONDARY_RATE  = opts.secondaryRate  ?? 0.020; // ~12x — the memory response
    this.MEMORY_FROM     = opts.memoryFrom     ?? 0.30;  // titre before memory forms
    this.WANE            = opts.wane           ?? 0.99955;
    this.MEMORY_WANE     = opts.memoryWane     ?? 0.99995; // memory outlives antibody
    this.MAX_NEUTRALISE  = opts.maxNeutralise  ?? 0.72;  // never total
    this.DRIFT_LOSS      = opts.driftLoss      ?? 0.55;  // affinity kept after drift

    this.antigens = { A: {}, B: {} };
    this.selfRefusals = { A: 0, B: 0 };   // counted, never silent
    this.log = [];
  }

  grantTo(colony) {
    if (colony === 'A' || colony === 'B') this.granted[colony] = true;
    return this.granted;
  }
  has(colony) { return !!this.granted[colony]; }

  _rec(colony, key) {
    const a = this.antigens[colony] || (this.antigens[colony] = {});
    return a[key] || (a[key] = {
      exposures: 0, titre: 0, affinity: 0, memory: 0,
      firstSeen: null, lastSeen: null, drifts: 0
    });
  }

  /* ── SELF-TOLERANCE ─────────────────────────────────────────────────────
     Asked before anything is raised, never audited after. A marker belonging
     to a colony — its own or the other one — is SELF at the level that matters
     here: both are the organism. Only the unaligned adversary is not-self. */
  isNotSelf(marker) {
    return marker === 'U' || marker === 'LOBO';
  }

  /** Present an antigen. Returns false if the response was REFUSED. */
  present(colony, traitKey, marker) {
    if (marker === undefined) marker = 'U';
    if (!this.has(colony)) return false;
    if (!this.isNotSelf(marker)) {
      this.selfRefusals[colony]++;
      this.log.push({ t: this.world.time, colony, refused: traitKey,
                      why: 'self-tolerance' });
      return false;                     // structural refusal, before acting
    }
    const r = this._rec(colony, traitKey);
    r.exposures++;
    if (r.firstSeen === null) r.firstSeen = this.world.time;
    r.lastSeen = this.world.time;
    r.affinity = Math.min(1, r.affinity + 0.12 * (1 - r.affinity));  // maturation
    return true;
  }

  /** LOBO shed and re-adopted this trait, changed. The match degrades — neither
      side ever finishes, which is the only honest end state for a range. */
  drift(traitKey) {
    for (const c of ['A', 'B']) {
      const r = this.antigens[c] && this.antigens[c][traitKey];
      if (!r) continue;
      r.affinity *= this.DRIFT_LOSS;
      r.titre    *= this.DRIFT_LOSS;
      r.drifts++;
      this.log.push({ t: this.world.time, colony: c, drift: traitKey,
                      affinity: +r.affinity.toFixed(3) });
    }
  }

  /* ── PRESENTATION HAPPENS AT CONTACT ────────────────────────────────────
     First version presented antigens at the crown only. But SAPPER is exercised
     at the KEEP WALL, so attackers pinned on a ring used the tactic and never
     reached the king — the antigen was presented somewhere the encounter was
     not happening, and 9,000 ticks of assault raised a response of exactly zero.

     An encounter is CONTACT. This finds it directly, and stays gated on
     expression: a tactic LOBO merely carries is still never presented. */
  _presentAtContact() {
    const ev = window.MurmurationModules.Attrition &&
               window.MurmurationModules.Attrition.loboEvolve;
    if (!ev || !ev.expressedList) return;
    const used = ev.expressedList();
    if (!used.length) return;
    const agents = this.world.agents;
    const U = agents.filter(a => a.colony === 'U' && !a.seppukuDone);
    if (!U.length) return;
    const met = { A: false, B: false };
    for (const d of agents) {
      if (d.colony !== 'A' && d.colony !== 'B') continue;
      if (d.seppukuDone || met[d.colony]) continue;
      for (const u of U) {
        if (Math.hypot(u.x - d.x, u.y - d.y) < 46) { met[d.colony] = true; break; }
      }
    }
    for (const c of ['A', 'B']) {
      if (!met[c] || !this.has(c)) continue;
      for (const k of used) this.present(c, k, 'U');   // 'U' explicit: self-tolerance runs
    }
  }

  step() {
    const now = this.world.time;
    if (now % 20 === 0) this._presentAtContact();
    for (const c of ['A', 'B']) {
      if (!this.has(c)) continue;
      const ag = this.antigens[c];
      for (const k in ag) {
        const r = ag[k];
        const seen = r.firstSeen !== null;
        const ready = seen && (now - r.firstSeen) >= this.PRIMARY_LATENCY;
        const recent = seen && (now - r.lastSeen) < 240;
        if (recent && ready) {
          // memory turns a slow build into a spike — the secondary response
          const rate = r.memory > 0 ? this.SECONDARY_RATE * r.memory : this.PRIMARY_RATE;
          r.titre = Math.min(1, r.titre + rate);
          /* MEMORY FORMS AFTER THE PRIMARY RESPONSE, NEVER DURING IT. Laying it
             down on exposure COUNT instead put memory in place before the
             latency gate ever opened, so the fast secondary rate applied from
             the first moment and there was no slow primary response at all —
             the distinction the whole trait rests on, collapsed. Germinal
             centres form in response to the reaction, not to the antigen. */
          if (r.titre >= this.MEMORY_FROM) r.memory = Math.min(1, r.memory + 0.0022);
        } else {
          r.titre *= this.WANE;          // antibody fades without re-exposure
        }
        r.memory *= this.MEMORY_WANE;    // ...memory fades far more slowly
      }
    }
  }

  /** How much this specific LOBO trait is blunted for this colony, 0..MAX.
      Specific by construction: an antibody to one trait does nothing to another. */
  neutralisation(colony, traitKey) {
    if (!this.has(colony)) return 0;
    const r = this.antigens[colony] && this.antigens[colony][traitKey];
    if (!r) return 0;                     // never met it — it works in full
    return Math.min(this.MAX_NEUTRALISE, r.titre * r.affinity);
  }

  /** How well a tactic still WORKS against this colony, 1 down to 1-MAX.
      Until now neutralisation only decided whether LOBO should shed something;
      the tactic itself kept working at full strength right up to the moment it
      was dropped. This is what lets learning blunt a tactic IN PLAY, which is
      what "closes any gap lobo may gain" actually requires. */
  potency(colony, traitKey) { return 1 - this.neutralisation(colony, traitKey); }

  /** Worst-case potency across both colonies — for effects that are not aimed
      at one colony in particular. */
  potencyAny(traitKey) {
    return Math.min(this.potency('A', traitKey), this.potency('B', traitKey));
  }

  /* ── WHAT GEA MAY CARRY (SR-011) ─────────────────────────────────────────
     Memory and affinity are KNOWLEDGE: what this colony learned by meeting the
     thing. Titre is a circulating antibody — a present capability — and does NOT
     travel. A colony inherits knowing how to build the response, never the
     response already built. Maternal antibody wanes; memory cells persist. */
  knowledgeFor(colony) {
    const out = {};
    const ag = this.antigens[colony] || {};
    for (const k in ag) {
      if (ag[k].memory <= 0.01 && ag[k].affinity <= 0.01) continue;
      out[k] = { affinity: +ag[k].affinity.toFixed(3),
                 memory:   +ag[k].memory.toFixed(3),
                 exposures: ag[k].exposures };
    }
    return out;
  }

  seedKnowledge(colony, known) {
    for (const k in (known || {})) {
      const r = this._rec(colony, k);
      r.affinity  = Math.max(r.affinity, known[k].affinity || 0);
      r.memory    = Math.max(r.memory,   known[k].memory   || 0);
      r.exposures = Math.max(r.exposures, known[k].exposures || 0);
      r.titre = 0;                      // born knowing, not born armed
    }
  }

  stats(colony) {
    const ag = this.antigens[colony] || {};
    const rows = Object.keys(ag).map(k => ({
      antigen: k,
      exposures: ag[k].exposures,
      titre: +ag[k].titre.toFixed(3),
      affinity: +ag[k].affinity.toFixed(3),
      memory: +ag[k].memory.toFixed(3),
      neutralises: +this.neutralisation(colony, k).toFixed(3),
      drifts: ag[k].drifts
    }));
    return { colony, granted: this.has(colony), rows,
             selfRefusals: this.selfRefusals[colony] };
  }
};
