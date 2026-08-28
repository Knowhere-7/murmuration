/* ============================================================================
   GEA WRITER — the first writer on the trunk (GEA_PROPAGATION_CONTRACT §5/§8.5)
   ----------------------------------------------------------------------------
   Forwards a murmuration lesson to the GEA transport as an Experience. This is
   the ONE writer wired end to end (the contract's rule: prove one, don't attach
   six at once).

   Fail-safe by construction: fire-and-forget, never awaited by the sim, and it
   CIRCUIT-BREAKS after a few failures so an absent/unreachable GEA service can
   never slow or break the running world. GEA being down is not the sim's problem.

   Enable/point it from the page:
     window.GEA_ENDPOINT = 'http://localhost:8474';   // default
     window.GEA_WRITER_ENABLED = true;                // default true
   ============================================================================ */
(function () {
  const cfg = () => (typeof window !== 'undefined' ? window : {});
  const ENDPOINT = () => cfg().GEA_ENDPOINT || 'http://localhost:8474';
  // Default ON only on localhost (where a GEA service actually runs). Public
  // visitors don't spam a service that isn't theirs. Force with GEA_WRITER_ENABLED.
  const ENABLED = () => {
    const w = cfg();
    if (w.GEA_WRITER_ENABLED === true)  return true;
    if (w.GEA_WRITER_ENABLED === false) return false;
    const h = (w.location && w.location.hostname) || '';
    return h === 'localhost' || h === '127.0.0.1';
  };

  let failures = 0;                 // consecutive transport failures
  const MAX_FAILURES = 4;           // then stop trying until re-enabled
  let sent = 0, dropped = 0;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Normalise a lesson into the Experience shape the contract fixes (§2).
  function shape(l) {
    const p = l.pressure || {};
    return {
      agentId:  String(l.agentId != null ? l.agentId : 'agent'),
      role:     l.role   || 'agent',
      domain:   l.domain || 'murmuration',
      taskType: l.taskType || l.event || 'live',
      event:    l.event,                                   // one of the 10 EvolutionEvent values
      context:  l.context || {},
      action:   l.action  || {},
      outcome:  l.outcome || {},
      pressure: {
        performance: clamp(+p.performance || 0, -1, 1),
        survival:    clamp(+p.survival    || 0,  0, 1),
        efficiency:  clamp(+p.efficiency  || 0, -1, 1),
        knowledge:   clamp(+p.knowledge   || 0,  0, 1)
      },
      timestamp: Date.now()
    };
  }

  function forward(lesson) {
    if (!ENABLED() || failures >= MAX_FAILURES) { dropped++; return; }
    if (typeof fetch !== 'function') { dropped++; return; }
    let body;
    try { body = JSON.stringify(shape(lesson)); } catch (_) { dropped++; return; }
    // fire-and-forget; keepalive lets it survive a page transition
    fetch(ENDPOINT() + '/gea/experience', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true
    }).then(r => { if (r && r.ok) { failures = 0; sent++; } else { failures++; } })
      .catch(() => { failures++; });
  }

  window.GEAWriter = {
    record: forward,
    get stats() { return { sent, dropped, failures, live: ENABLED() && failures < MAX_FAILURES }; },
    reset() { failures = 0; }                              // call after the service comes back
  };
})();
