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
  attach(world) {
    this.adversary = new window.MurmurationModules.AttritionAdversary(world);
    return this.adversary;
  },
};
