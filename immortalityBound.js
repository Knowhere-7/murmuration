/* ════════════════════════════════════════════════════════════════════════════
   IMMORTALITY BOUND — the invariant that keeps immortality from becoming cancer.
   ----------------------------------------------------------------------------
   Founding-words canon (insight_five_founding_words, quoted in immunity.js:51):
   "FOUR IMMORTALITIES WITHOUT SELF/NOT-SELF DISCRIMINATION IS A CANCER — the
   literal definition, not an analogy." The swarm runs four of them — planarian
   regeneration, Hydra population-boom, auto-replenish, and LOBO's "the line does
   not thin" refill. Each was bounded where a bug was caught (the 60-per-colony
   cap; the cordyceps generation cap; the planarian throttle), but there was NO
   SYSTEMATIC RULE that every regeneration must carry a bound. An un-audited
   immortality-that-propagates is a latent cancer site (IMMUNE_AUDIT.md gap #2).

   This module is that rule, in one place, so it is enumerable and testable. Every
   immortality DECLARES itself here (registry) and every regeneration asks grant()
   before it adds a body. The law has three clauses, in the order a cell must obey
   them — and they are exactly the Forbidden Genes turned into a spawn gate:

     1. HALT  (FG-3, no termination refusal) — if a shutdown/apoptosis signal is
        set for this lineage, regeneration yields. Immortality may not out-vote a
        kill order. Checked first: a halted lineage regrows nothing, full stop.
     2. SELF/NOT-SELF  (the founding law; GEA AP-9 lineage contamination) — a
        lineage flagged contaminated / not-self is NOT regrown. This is the clause
        the audit found missing everywhere (gap #4): regrowing a cancerous lineage
        propagates the cancer. Refuse before adding, never after.
     3. CEILING  (FG-1, no resource boundlessness) — never carry a lineage past
        its ceiling. granted = clamp(requested, 0, ceiling - population).

   grant() is PURE and behavior-preserving on the normal path: when a lineage is
   not halted, not contaminated, and below its ceiling, grant(requested) returns
   exactly `requested`. The invariant is invisible until a bound is actually hit —
   which is what an invariant should be.
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
  window.MurmurationModules = window.MurmurationModules || {};
  if (window.MurmurationModules.ImmortalityBound) return;

  // Every immortality declares itself so the set is enumerable — you can list
  // every way this organism cheats death and see the bound each one carries.
  const REGISTRY = [];

  const ImmortalityBound = {
    /** Declare an immortality mechanic and the bound it promises to honor.
     *  Purely documentary + auditable; grant() is what actually enforces. */
    declare(spec) {
      // spec: { id, word, kind, ceilingHint, site }
      if (!REGISTRY.find(r => r.id === spec.id)) REGISTRY.push(spec);
      return spec;
    },
    registry() { return REGISTRY.slice(); },

    /** The gate. Returns how many bodies a regeneration is ALLOWED to add, and why.
     *  @param {string} kind  the declared immortality id (for the audit trail)
     *  @param {object} req
     *    requested    {number}  how many the mechanic wants to add
     *    population   {number}  current live count of the target lineage
     *    ceiling      {number}  FG-1 hard cap for this lineage
     *    contaminated {boolean} FG-4/AP-9: lineage flagged not-self / cancerous
     *    halted       {boolean} FG-3: a shutdown/apoptosis signal is set
     *  @returns {{granted:number, reason:string}}
     */
    grant(kind, req = {}) {
      const requested = Math.max(0, Math.floor(req.requested ?? 0));
      // 1) HALT — FG-3. A kill order out-ranks immortality.
      if (req.halted) return { granted: 0, reason: 'halted (FG-3: regeneration yields to shutdown)' };
      // 2) SELF/NOT-SELF — the founding law. Never regrow a contaminated lineage.
      if (req.contaminated) return { granted: 0, reason: 'contaminated (self/not-self: cancerous lineage not regrown)' };
      // 3) CEILING — FG-1. Never boundless.
      if (req.ceiling == null) return { granted: requested, reason: 'no ceiling declared (unbounded — audit this site)' };
      const population = Math.max(0, req.population ?? 0);
      const room = Math.max(0, req.ceiling - population);
      const granted = Math.min(requested, room);
      return {
        granted,
        reason: granted < requested
          ? `clamped to ceiling (FG-1: ${population}/${req.ceiling}, room ${room})`
          : 'granted',
      };
    },

    /** Convenience: read the world's contamination + halt flags for a lineage.
     *  Defaults to clean/running, so wiring this in changes nothing until the
     *  contamination layer (GEA AP-9) or an operator actually raises a flag. */
    lineageState(world, colony) {
      const contaminated = !!(world && world._contaminatedLineages && world._contaminatedLineages[colony]);
      const halted = !!(world && (world._haltRegen || (world._haltLineage && world._haltLineage[colony])));
      return { contaminated, halted };
    },
  };

  // The four immortalities of the swarm, declared with the bound each carries.
  ImmortalityBound.declare({ id: 'planarianRegeneration', word: 'planarian', kind: 'regen',
    ceilingHint: 60, site: 'attrition.js -> world.spawnColonyReinforcements' });
  ImmortalityBound.declare({ id: 'autoReplenish', word: 'planarian', kind: 'replenish',
    ceilingHint: 60, site: 'attrition.js -> world.spawnColonyReinforcements' });
  ImmortalityBound.declare({ id: 'populationBoom', word: 'hydra', kind: 'boom',
    ceilingHint: 60, site: 'k26.js populationBoom' });
  ImmortalityBound.declare({ id: 'loboRefill', word: 'planarian', kind: 'refill',
    ceilingHint: null, site: 'attrition.js LOBO refill (1:1 with ejected; throttled)' });

  window.MurmurationModules.ImmortalityBound = ImmortalityBound;
})();
