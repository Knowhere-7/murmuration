/**
 * LINEAGE — descent and influence, overlaid on one node set.
 *
 * Ghost, 2026-08-09: "we also need to create a live lineage tree" — and, on which
 * kind: "both and they need to be overlapping/overlaying."
 *
 * TWO EDGE TYPES, ONE GRAPH.
 *   DESCENT    who came from whom. A tree. One parent per agent, permanent.
 *   INFLUENCE  who learned from whom, and WHEN. A directed graph, many-to-many.
 *
 * An agent is shaped by dozens it never descended from, so these are genuinely
 * different structures — but they share nodes, which is what makes overlaying
 * them worth doing. Descent is the spine; influence is what actually moved.
 *
 * WHY THIS IS LOAD-BEARING, NOT A VISUALISATION:
 *
 *  1. MONUMENT ELIGIBILITY. `weather.js` ranks by "longest lineage" for deaths
 *     that earn a monument. `generation` was a bare integer with no record of who
 *     descended from whom — depth had nothing behind it.
 *
 *  2. NEMESIS. Ghost's spec: "wipes them and the surrounding agents closest,
 *     tracing them back by connection strings... any agent gaining knowledge from
 *     that agent AT THE TIME OF CORRUPTION has to go." That is `carriers()` —
 *     influence edges, filtered by tick. Nothing in the build stored it: bonds
 *     were computed in `k26.drawConnections` at render time and discarded, and
 *     the sentinel is excluded from them anyway, so the evidence was erased at
 *     the exact moment it mattered.
 *
 * MEMORY IS THE DESIGN CONSTRAINT, NOT AN AFTERTHOUGHT.
 * This repo has already lost a 26M-entry interactionLog and a 25M event log to
 * unbounded accumulation. Influence fires many times per tick per agent; kept
 * whole it is the same leak wearing a new name.
 *
 * So: descent is O(agents) and permanent — one parent reference each. Influence
 * is capped at MAX_EDGES per agent, evicting the weakest-and-oldest first. The
 * graph stays bounded at agents x MAX_EDGES regardless of runtime. At 200 agents
 * that is 2,400 edges after four hundred thousand ticks.
 *
 * The cap costs deep history, and that is the right trade: NEMESIS asks who was
 * touched *at the time of corruption*, not who was ever touched.
 */

const MAX_EDGES = 12;      // influence edges retained per agent
const MIN_WEIGHT = 0.002;  // below this an influence is noise, not contact

window.MurmurationModules = window.MurmurationModules || {};
window.MurmurationModules.Lineage = class Lineage {
  constructor(opts = {}) {
    this.maxEdges = opts.maxEdges ?? MAX_EDGES;
    this.minWeight = opts.minWeight ?? MIN_WEIGHT;
    this.nodes = new Map();   // id -> node
    this.tick = 0;
  }

  _node(id) {
    let n = this.nodes.get(id);
    if (!n) {
      n = {
        id, colony: null, parent: null, children: [],
        birthTick: this.tick, deathTick: null, deathCause: null,
        depth: 0,
        inbound: [],   // {from, tick, weight}  — who shaped me
        outbound: [],  // {to,   tick, weight}  — who I shaped
      };
      this.nodes.set(id, n);
    }
    return n;
  }

  setTick(t) { this.tick = t; }

  /** DESCENT. parentId null = founder. Depth is derived, never assigned. */
  birth(childId, parentId = null, colony = null) {
    const c = this._node(childId);
    c.birthTick = this.tick;
    c.colony = colony ?? c.colony;
    if (parentId != null && parentId !== childId) {
      const p = this._node(parentId);
      c.parent = parentId;
      c.depth = p.depth + 1;
      if (!p.children.includes(childId)) p.children.push(childId);
    }
    return c;
  }

  death(id, cause = null) {
    const n = this.nodes.get(id);
    if (!n) return null;
    n.deathTick = this.tick;
    n.deathCause = cause;
    return n;
  }

  /**
   * INFLUENCE. Recorded on both ends so a trace can run either direction without
   * scanning the whole graph — NEMESIS needs outbound (who did this agent touch),
   * provenance needs inbound (who shaped this agent).
   */
  influence(fromId, toId, weight) {
    if (fromId === toId || weight < this.minWeight) return;
    const src = this._node(fromId), dst = this._node(toId);
    this._push(dst.inbound, { from: fromId, tick: this.tick, weight });
    this._push(src.outbound, { to: toId, tick: this.tick, weight });
  }

  /**
   * Bounded insert. An existing edge is reinforced rather than duplicated — a
   * pair that keeps influencing each other is ONE strengthening relationship, not
   * ten thousand events. That is what keeps this from becoming the old log.
   */
  _push(list, edge) {
    const key = edge.from ?? edge.to;
    const hit = list.find(e => (e.from ?? e.to) === key);
    if (hit) {
      hit.weight = hit.weight * 0.7 + edge.weight * 0.3;   // reinforce, decay old
      hit.tick = edge.tick;                                 // recency is the trace
      return;
    }
    list.push(edge);
    if (list.length > this.maxEdges) {
      // Evict weakest, tie-broken by oldest. Strong-and-recent survives.
      let worst = 0;
      for (let i = 1; i < list.length; i++) {
        if (list[i].weight < list[worst].weight ||
           (list[i].weight === list[worst].weight && list[i].tick < list[worst].tick)) worst = i;
      }
      list.splice(worst, 1);
    }
  }

  // ── DESCENT QUERIES ───────────────────────────────────────────────────────

  ancestors(id, limit = 64) {
    const out = [];
    let n = this.nodes.get(id);
    while (n && n.parent != null && out.length < limit) {
      out.push(n.parent);
      n = this.nodes.get(n.parent);
    }
    return out;
  }

  descendants(id, limit = 512) {
    const out = [], queue = [id];
    while (queue.length && out.length < limit) {
      const n = this.nodes.get(queue.shift());
      if (!n) continue;
      for (const c of n.children) { out.push(c); queue.push(c); }
    }
    return out;
  }

  /** Depth of descent. This is what "longest lineage" actually means. */
  depth(id) { return this.nodes.get(id)?.depth ?? 0; }

  // ── NEMESIS QUERIES ───────────────────────────────────────────────────────

  /**
   * CARRIERS — everyone who took knowledge from this agent since `sinceTick`.
   *
   * This is Ghost's excision set: "any agent gaining knowledge from that agent at
   * the time of corruption has to go." Exposure, not fault. `hops` follows the
   * chain outward, because knowledge does not stop at the first recipient.
   */
  carriers(id, sinceTick = 0, hops = 1) {
    const seen = new Set([id]), out = [];
    let frontier = [id];
    for (let h = 0; h < hops; h++) {
      const next = [];
      for (const cur of frontier) {
        const n = this.nodes.get(cur);
        if (!n) continue;
        for (const e of n.outbound) {
          if (e.tick < sinceTick || seen.has(e.to)) continue;
          seen.add(e.to);
          out.push({ id: e.to, weight: e.weight, tick: e.tick, hops: h + 1 });
          next.push(e.to);
        }
      }
      frontier = next;
      if (!frontier.length) break;
    }
    return out;
  }

  /** Who shaped this agent since `sinceTick`. Provenance, the mirror of carriers. */
  exposedTo(id, sinceTick = 0) {
    const n = this.nodes.get(id);
    return n ? n.inbound.filter(e => e.tick >= sinceTick) : [];
  }

  // ── RENDERING ─────────────────────────────────────────────────────────────

  /** Both layers, one node set. Descent and influence overlaid, as specified. */
  getGraph({ sinceTick = 0, includeDead = true } = {}) {
    const nodes = [], descent = [], influence = [];
    for (const n of this.nodes.values()) {
      if (!includeDead && n.deathTick != null) continue;
      nodes.push({
        id: n.id, colony: n.colony, depth: n.depth,
        birthTick: n.birthTick, deathTick: n.deathTick, deathCause: n.deathCause,
        alive: n.deathTick == null,
      });
      if (n.parent != null) descent.push({ from: n.parent, to: n.id });
      for (const e of n.outbound) {
        if (e.tick >= sinceTick) influence.push({ from: n.id, to: e.to, weight: e.weight, tick: e.tick });
      }
    }
    return { nodes, descent, influence };
  }

  getStatus() {
    let edges = 0, alive = 0, maxDepth = 0;
    for (const n of this.nodes.values()) {
      edges += n.outbound.length;
      if (n.deathTick == null) alive++;
      if (n.depth > maxDepth) maxDepth = n.depth;
    }
    return { nodes: this.nodes.size, alive, influenceEdges: edges,
             maxDepth, cap: this.nodes.size * this.maxEdges };
  }
}
