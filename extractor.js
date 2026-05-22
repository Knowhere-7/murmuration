/**
 * Emergence Extractor for Murmuration
 * Reads collective behavior → emergent prediction + confidence.
 * ST-1 Trust Battery metrics
 * ST-2 Grief Variable metrics
 */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.EmergenceExtractor = class EmergenceExtractor {
  extract(world) {
    const metrics = world.getEmergenceMetrics();

    // Active agents only (not seppuku-complete, not sentinel)
    const active = world.agents.filter(a => !a.seppukuDone && !a.isSentinel);
    const beliefs = active.map(a => a.beliefState.current || 0);

    // Clustering
    const highBelief = beliefs.filter(b => b >  0.3).length / Math.max(1, active.length);
    const lowBelief  = beliefs.filter(b => b < -0.3).length / Math.max(1, active.length);
    const clusters   = highBelief > 0.4 || lowBelief > 0.4 ? 'polarized' : 'diffuse';

    const recentCascades = world.interactionLog
      .slice(-20).filter(l => Math.abs(l.belief || 0) > 0.6).length / 20;

    const prediction  = metrics.avgBelief * metrics.consensus;
    const confidence  = metrics.consensus * (1 - metrics.divergence);
    const cascadeAgents = new Set(
      world.interactionLog.slice(-10).map(l => l.agent).filter(id => id !== undefined)
    );

    // ── ST-1 Trust Battery ───────────────────────────────────────────────
    const trustLevels    = active.map(a => a.trustCharge);
    const avgTrust       = trustLevels.length
      ? trustLevels.reduce((s, t) => s + t, 0) / trustLevels.length : 0;
    const highTrustCount = trustLevels.filter(t => t > 0.75).length;
    const lowTrustCount  = trustLevels.filter(t => t < 0.25).length;

    // ── ST-2 Grief Variable ──────────────────────────────────────────────
    const all = world.agents;
    const grievingCount   = all.filter(a => a.griefState === 'GRIEVING').length;
    const crisisCount     = all.filter(a => a.griefState === 'CRISIS').length;
    const seppukuCount    = all.filter(a => a.griefState === 'SEPPUKU_COMPLETE').length;
    const dishonoredCount = all.filter(a => a.griefState === 'DISHONORED').length;
    const hasSentinel     = !!world.sentinel;
    const sentinelId      = world.sentinel ? world.sentinel.id : null;

    const avgGrief = active.length
      ? active.reduce((s, a) => s + a.griefLevel, 0) / active.length : 0;

    // Collective memory size (seppuku wisdom dumps)
    const wisdomCount = world.collectiveMemory.length;

    return {
      prediction,
      confidence: Math.max(0, confidence),
      clusters,
      cascadeVelocity: recentCascades,
      cascadeMap: Array.from(cascadeAgents),
      stability: 1 - metrics.divergence,
      // ST-1
      avgTrust,
      highTrustCount,
      lowTrustCount,
      // ST-2
      avgGrief,
      grievingCount,
      crisisCount,
      seppukuCount,
      dishonoredCount,
      hasSentinel,
      sentinelId,
      wisdomCount,
      ...metrics
    };
  }
};
