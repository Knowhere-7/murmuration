/**
 * SLIME MOLD CORE — Physarum polycephalum network optimizer (trait #11), shared core.
 *
 * SINGLE SOURCE OF TRUTH for the genome's path-finding spine. The same algorithm solves:
 *   - the Murmuration maze (watchable instance),
 *   - the Pentest / H2O network topology (security instance),
 *   - a LOBO hunt (adversarial instance).
 * A maze, an attack graph, and a hunt are the same object: a graph with a source, a sink,
 * gated edges, dead-ends and traps. This file is that object's solver.
 *
 * FAITHFUL EXTRACT of juggernaut/traits/slimeMoldOptimizer.js — the graph logic
 * (updatePheromones → flowSignals → decayPaths → extractOptimalPaths → findOptimalPath),
 * stripped of the logger + async so it runs anywhere. Adds:
 *   - step()      : ONE relaxation (for live per-tick animation in the sim)
 *   - optimize()  : batch to convergence (offline use — pentest / LOBO)
 *   - buildFromGrid(): turn a maze grid into the node/edge graph
 *   - conductance(): edge strength for rendering tube thickness + agent steering
 *
 * CANONICAL HOME: H:\gnosquam-genome\juggernaut\traits\slimeMoldCore.js (promote after the
 * maze verifies). This copy is the synced mirror the browser sim loads. Keep them identical;
 * once juggernaut's SlimeMoldOptimizer delegates here, there is one behaviour, three surfaces.
 *
 * Dual-load (UMD): browser -> window.MurmurationModules.SlimeMoldCore ; Node -> module.exports.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;          // Node / CommonJS
  const g = (typeof globalThis !== 'undefined') ? globalThis : root;               // browser global
  if (g) { g.MurmurationModules = g.MurmurationModules || {}; g.MurmurationModules.SlimeMoldCore = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class SlimeMoldCore {
    constructor(config = {}) {
      this.nodes = new Map();            // id -> { id, pheromone, position }
      this.connections = new Map();      // id -> [{ target, flow, capacity, pheromone, distance }]
      this.chemoattractants = { sources: [], destinations: [] };
      this.config = {
        decayRate: 0.05,                 // tube/pheromone decay per relaxation
        flowRate: 0.1,                   // signal flow rate
        branchingFactor: 3,              // paths explored per source per relaxation
        convergenceThreshold: 0.01,      // flow change below this = settled
        maxIterations: 100,              // batch optimize() cap
        exploreSteps: 12,                // max hops on an exploratory walk
        ...config
      };
      this.iterations = 0;
    }

    // ── graph construction ────────────────────────────────────────────────
    addNode(id, data = {}) {
      this.nodes.set(id, {
        id,
        pheromone: data.pheromone != null ? data.pheromone : 0.5,
        position: data.position || { x: 0, y: 0 }
      });
      if (!this.connections.has(id)) this.connections.set(id, []);
      return this;
    }

    addEdge(a, b, weight = 1) {
      const mk = (target) => ({ target, flow: 0, capacity: weight * 10, pheromone: 0.5, distance: weight });
      this.connections.get(a).push(mk(b));
      this.connections.get(b).push(mk(a));   // bidirectional, like Physarum tubes
      return this;
    }

    setSourceSink(sources, destinations) {
      const S = Array.isArray(sources) ? sources : [sources];
      const D = Array.isArray(destinations) ? destinations : [destinations];
      this.chemoattractants = {
        sources: S.map(id => ({ id, strength: 1.0 })),
        destinations: D.map(id => ({ id, strength: 1.0 }))
      };
      for (const id of S.concat(D)) { const n = this.nodes.get(id); if (n) n.pheromone = 1.0; }
      return this;
    }

    /** Build the graph from a Murmuration maze grid (cell = node, open passage = edge). */
    buildFromGrid(cells, cols, rows, startCell, goalCell) {
      this.nodes.clear(); this.connections.clear();
      const id = (c, r) => `${c},${r}`;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) this.addNode(id(c, r), { position: { x: c, y: r } });
      // an OPEN edge exists where the shared wall between two cells is carved away
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = cells[r][c];
          if (!cell.E && c < cols - 1) this.addEdge(id(c, r), id(c + 1, r), 1);
          if (!cell.S && r < rows - 1) this.addEdge(id(c, r), id(c, r + 1), 1);
        }
      }
      this.setSourceSink(id(startCell.c, startCell.r), id(goalCell.c, goalCell.r));
      return this;
    }

    // ── one relaxation (faithful to slimeMoldOptimizer's optimize() body) ──
    step() {
      this._updatePheromones();
      const changed = this._flowSignals();
      this._decayPaths();
      this.iterations++;
      return changed;
    }

    /**
     * Agent-driven relaxation: process externally deposited flow (from real swarm traffic)
     * and evaporate — WITHOUT the core's own path exploration. This is the sim mode where the
     * colony IS the flow medium; the core is only the stigmergy substrate. (step()/optimize()
     * with self-exploration remain for the offline pentest/LOBO surfaces.)
     */
    settle() {
      this._updatePheromones();
      this._decayPaths();
      this.iterations++;
    }

    /** Batch: relax to convergence. Offline use (pentest / LOBO). */
    optimize(maxIterations) {
      const cap = maxIterations || this.config.maxIterations;
      let i = 0, converged = false;
      while (i < cap && !converged) { const changed = this.step(); converged = !changed && i > 10; i++; }
      return this.extractOptimalPaths();
    }

    _updatePheromones() {
      for (const [, conns] of this.connections) {
        for (const conn of conns) {
          const flowEfficiency = conn.flow / (conn.capacity || 1);
          conn.pheromone = Math.min(1.0, conn.pheromone + flowEfficiency * this.config.flowRate);
          const t = this.nodes.get(conn.target);
          if (t) conn.pheromone = Math.min(1.0, conn.pheromone + t.pheromone * 0.1);
        }
      }
    }

    _flowSignals() {
      let totalFlowChange = 0;
      for (const source of this.chemoattractants.sources) {
        if (!this.nodes.get(source.id)) continue;
        const paths = this._explorePaths(source.id, this.config.branchingFactor);
        for (const path of paths) {
          for (let i = 0; i < path.nodes.length - 1; i++) {
            const conns = this.connections.get(path.nodes[i]);
            const conn = conns && conns.find(c => c.target === path.nodes[i + 1]);
            if (conn) {
              const prev = conn.flow;
              conn.flow = Math.min(conn.flow + path.strength * this.config.flowRate, conn.capacity);
              totalFlowChange += Math.abs(conn.flow - prev);
            }
          }
        }
      }
      return totalFlowChange > this.config.convergenceThreshold;
    }

    _explorePaths(startNode, numPaths) {
      const paths = [];
      for (let i = 0; i < numPaths; i++) {
        const path = { nodes: [startNode], strength: 1.0 };
        const visited = new Set([startNode]);
        let current = startNode, steps = 0;
        while (steps < this.config.exploreSteps) {
          const conns = this.connections.get(current);
          if (!conns || !conns.length) break;
          const next = this._selectNextNode(conns, visited);
          if (!next) break;
          path.nodes.push(next.node); path.strength *= next.probability;
          visited.add(next.node); current = next.node;
          if (this.chemoattractants.destinations.find(d => d.id === current)) { path.strength *= 1.5; break; }
          steps++;
        }
        paths.push(path);
      }
      return paths;
    }

    _selectNextNode(connections, visited) {
      const available = connections.filter(c => !visited.has(c.target));
      if (!available.length) return null;
      const score = (c) => {
        const n = this.nodes.get(c.target);
        return (n ? n.pheromone : 0.5) * (1 / (c.distance || 1)) * (0.5 + c.pheromone);
      };
      const total = available.reduce((s, c) => s + score(c), 0) || 1;
      let rand = Math.random() * total;
      for (const conn of available) { const p = score(conn); rand -= p; if (rand <= 0) return { node: conn.target, probability: p / total }; }
      const last = available[available.length - 1];
      return { node: last.target, probability: 0.1 };
    }

    _decayPaths() {
      for (const [, conns] of this.connections) {
        for (const conn of conns) {
          conn.pheromone *= (1 - this.config.decayRate);
          conn.flow *= (1 - this.config.decayRate * 2);
          if (conn.pheromone < 0.01) conn.pheromone = 0;
        }
      }
    }

    // ── external flow injection: agents ARE the flow medium ───────────────
    /** An agent traversing edge a->b deposits flow (thickens the tube), Physarum-style. */
    deposit(a, b, amount = 1) {
      const conns = this.connections.get(a);
      if (!conns) return;
      const f = amount * this.config.flowRate;
      const fwd = conns.find(c => c.target === b);
      if (fwd) fwd.flow = Math.min(fwd.flow + f, fwd.capacity);
      const back = this.connections.get(b);
      const rev = back && back.find(c => c.target === a);
      if (rev) rev.flow = Math.min(rev.flow + f, rev.capacity);
    }

    /** Edge conductance (0..1) — tube thickness for rendering + agent steering weight. */
    conductance(a, b) {
      const conns = this.connections.get(a);
      const conn = conns && conns.find(c => c.target === b);
      if (!conn) return 0;
      return Math.min(1, 0.5 * conn.pheromone + 0.5 * (conn.flow / (conn.capacity || 1)));
    }

    /** Neighbours of a node with their conductance — for gradient-following steering. */
    neighbors(id) {
      const conns = this.connections.get(id) || [];
      return conns.map(c => ({ target: c.target, conductance: this.conductance(id, c.target) }));
    }

    // ── extract the answer (pheromone-weighted Dijkstra, faithful) ────────
    extractOptimalPaths() {
      const paths = [];
      for (const s of this.chemoattractants.sources)
        for (const d of this.chemoattractants.destinations) {
          const p = this.findOptimalPath(s.id, d.id);
          if (p) paths.push({ source: s.id, destination: d.id, nodes: p.nodes, totalDistance: p.distance, totalFlow: p.flow });
        }
      return { paths, stats: this.stats() };
    }

    findOptimalPath(start, end) {
      const dist = new Map([[start, 0]]), prev = new Map(), unvisited = new Set(this.nodes.keys());
      while (unvisited.size) {
        let cur = null, min = Infinity;
        for (const id of unvisited) { const d = dist.get(id); if (d != null && d < min) { min = d; cur = id; } }
        if (cur === null || cur === end || min === Infinity) break;
        unvisited.delete(cur);
        for (const conn of (this.connections.get(cur) || [])) {
          if (!unvisited.has(conn.target)) continue;
          const alt = min + conn.distance / (1 + conn.pheromone);   // stronger tube = cheaper
          if (alt < (dist.get(conn.target) != null ? dist.get(conn.target) : Infinity)) {
            dist.set(conn.target, alt); prev.set(conn.target, cur);
          }
        }
      }
      if (!prev.has(end) && start !== end) return null;
      const nodes = []; let cur = end;
      while (cur != null) { nodes.unshift(cur); cur = prev.get(cur); }
      let flow = 0, distance = 0;
      for (let i = 0; i < nodes.length - 1; i++) {
        const conn = (this.connections.get(nodes[i]) || []).find(c => c.target === nodes[i + 1]);
        if (conn) { flow += conn.flow; distance += conn.distance; }
      }
      return { nodes, distance, flow };
    }

    stats() {
      let pher = 0, flow = 0, active = 0, edges = 0;
      for (const [, conns] of this.connections)
        for (const conn of conns) { pher += conn.pheromone; flow += conn.flow; edges++; if (conn.pheromone > 0.1) active++; }
      return { nodes: this.nodes.size, edges: edges / 2, activeEdges: active / 2, totalFlow: flow, avgPheromone: pher / (edges || 1), iterations: this.iterations };
    }
  }

  return SlimeMoldCore;
});
