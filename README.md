# Murmuration

### A living X-ray of collective intelligence — with a steering wheel attached.

**Swarm intelligence engine. Zero dependencies. One file.**

Murmuration simulates autonomous agents that form beliefs, build trust, grieve losses, and produce emergent collective signals — all from pure rule-based interactions modeled on biological survival mechanisms. No AI models. No API calls. No frameworks. Open an HTML file, the swarm runs.

**[Live Demo](https://spookygroup.github.io/murmuration/)** | **[Standalone Version](https://spookygroup.github.io/murmuration/standalone.html)**

---

## What It Does

Drop 80–300 agents into a world. Each one has a personality, a trust battery, and a grief threshold. They interact, form beliefs, influence each other, and self-organize. From individual rules, collective intelligence emerges:

| Output | What It Measures |
|--------|-----------------|
| **Collective Signal** (-1 to 1) | Directional consensus of the swarm |
| **Confidence** (0 to 1) | How aligned the agents are behind that signal |
| **Cluster State** | Polarized (split camps) vs Diffuse (distributed) |
| **Cascade Velocity** | How fast beliefs are propagating through the network |
| **Network Trust Index** | Average earned authority across all agents |
| **Systemic Stress** | Average grief/pressure across the population |

The engine ships with six preset scenarios — Flash Crash, Slow Bleed, Black Swan, Recovery, Contagion, Euphoria — that demonstrate how the swarm responds to different types of disruption in real time.

---

## Run It

No install. No build step. No dependencies.

```
git clone https://github.com/SpookyGroup/murmuration.git
open index.html
```

Or download `index.html` and double-click it. That's it.

---

## The Trait System

Murmuration is built on a biological trait architecture. Each trait is modeled on a real survival mechanism and translates to a specific computational behavior. The traits interact — trust affects belief propagation, grief modulates reactivity, memory shapes future decisions.

### Core Traits

| # | Trait | Biological Source | What It Does |
|---|-------|------------------|--------------|
| **ST-1** | Trust Battery | Social bonding + earned authority | Dynamic trust that charges on successful cooperation, drains on conflict, decays in isolation. Replaces static weights with live credibility. Agents don't start trusted — they earn it. |
| **ST-2** | Grief Variable | Loss processing in social species | Behavioral modifier triggered by significant loss. Three terminal exits: **Honored Exit** (agent correctly computes it can no longer serve the collective — redistributes trust to survivors), **Failure** (agent refuses to exit despite inability to contribute — becomes the Sentinel), **NEMESIS** (external enforcement for constitutional violations). |
| **#14** | Epigenetic Memory | Epigenetic inheritance | Successful belief patterns strengthen over time. Agents that consistently align with emergent consensus develop stronger memory weight — what worked gets written deeper. |
| **#3** | Pheromone Trail | Ant colony trail pheromones | Failed patterns decay and eventually vanish. Bad signals evaporate. The system forgets what doesn't work, naturally, without explicit cleanup. |
| **#31** | Echolocation | Bat echolocation frequency | Controls simulation resolution. Higher frequency = finer-grained observation. The system can tune how closely it watches. |
| **#32** | Lateral Line | Fish lateral line organ | Pressure detection triggers cascade events. When environmental pressure crosses a threshold, the signal amplifies through the network — modeling how systemic risk propagates. |
| **#33** | Electroreception | Shark electroreception | Anomaly detection modulates agent reactivity. When something is off, every agent in range becomes more sensitive. The swarm develops heightened awareness before the signal is even clear. |
| **#34** | Pit Viper | Pit viper infrared sensing | Divergence signal that disturbs the world environment. Injects volatility into the system — models external shocks, market events, sudden changes in conditions. |
| **#16** | Mantis Shrimp | Mantis shrimp 16-band color vision | Multi-band filter controlling agent spawning. Determines which new agents enter the simulation and under what conditions — the system's immune response to population dynamics. |

### The Sentinel

When an agent fails — when it reaches crisis and refuses to exit honorably — it becomes the **Sentinel**. There is always exactly one. It cannot participate, vote, or influence. It exists as a visible marker of systemic risk: the cost of prioritizing self over collective, rendered permanent and unmistakable. Every agent in the swarm can see it. The Sentinel makes the equation clearer for agents approaching their own crisis.

### Collective Memory

When an agent makes an honored exit, its accumulated wisdom is written to collective memory at 2x weight. The swarm doesn't just lose a member — it inherits what that member learned. Loss becomes institutional knowledge. This is how the system gets smarter over time without any external training.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  MURMURATION                     │
│                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐ │
│  │  Agents   │→│ Interaction  │→│ Evolution  │  │
│  │ (beliefs, │  │   Engine     │  │  Engine    │ │
│  │  trust,   │  │ (propagation,│  │ (memory,   │ │
│  │  grief)   │  │  conflict,   │  │  decay,    │ │
│  │           │  │  bonding)    │  │  seppuku,  │ │
│  └──────────┘  └──────────────┘  │  sentinel) │ │
│       ↑                           └───────────┘ │
│       │         ┌──────────────┐       │        │
│       └─────────│    World     │←──────┘        │
│                 │ (env, time,  │                 │
│  ┌──────────┐  │  collective  │  ┌───────────┐ │
│  │   Seed    │→│   memory)    │→│ Emergence  │  │
│  │ Injector  │  └──────────────┘  │ Extractor │ │
│  └──────────┘                     └───────────┘ │
│       ↑                                │        │
│    Signals                         Snapshot     │
│  (volatility,                    (prediction,   │
│   anomaly,                        confidence,   │
│   pressure,                       trust index,  │
│   resolution,                     stress level) │
│   sensitivity)                                  │
└─────────────────────────────────────────────────┘
```

Zero dependencies. No DOM framework. No state management library. No build tools. The engine is pure JavaScript — classes that take numbers in and produce numbers out. The browser rendering is one function that reads world state and draws to a canvas.

---

## Files

| File | What It Is |
|------|-----------|
| `index.html` | Enterprise demo — scenario presets, sparklines, intelligence reports |
| `standalone.html` | Developer demo — raw trait names, direct signal control |
| `engine/agent.js` | Agent class — personality, trust battery, grief state machine, belief system |
| `engine/world.js` | World state — environment, agent registry, collective memory, sentinel management |
| `engine/seed.js` | Seed injector — translates input signals to world parameters |
| `engine/interaction.js` | Interaction engine — agent-to-agent belief propagation, trust dynamics, grief triggers |
| `engine/evolution.js` | Evolution engine — epigenetic memory, pheromone decay, seppuku evaluation, dishonor detection |
| `engine/extractor.js` | Emergence extractor — reads collective behavior into prediction, confidence, and system health metrics |

---

## Embed It

```html
<canvas id="swarm" width="800" height="600"></canvas>
<script src="engine/agent.js"></script>
<script src="engine/world.js"></script>
<script src="engine/seed.js"></script>
<script src="engine/interaction.js"></script>
<script src="engine/evolution.js"></script>
<script src="engine/extractor.js"></script>
<script>
  // Mount and run
  const canvas = document.getElementById('swarm');
  const world = new MurmurationModules.World(800, 600, 100);
  const interact = new MurmurationModules.InteractionEngine();
  const evolve = new MurmurationModules.EvolutionEngine();
  const extract = new MurmurationModules.EmergenceExtractor();

  function tick() {
    interact.computeInteractions(world);
    world.advanceStep();
    evolve.evolve(world);
    world.draw(canvas.getContext('2d'));

    const emergence = extract.extract(world);
    console.log(emergence.prediction, emergence.confidence);

    requestAnimationFrame(tick);
  }
  tick();
</script>
```

---

## Snapshot API

Call `snapshot()` on a running simulation to get a serializable JSON object — no DOM references, ready for export, storage, or piping to external systems.

```json
{
  "platform": "Murmuration by Gnosquam",
  "timestamp": "2026-05-09T22:14:00.000Z",
  "cycle": 847,
  "agentCount": 120,
  "activeCount": 108,
  "collectiveSignal": -0.3841,
  "confidence": 0.72,
  "clusterState": "polarized",
  "cascadeVelocity": 0.45,
  "stability": 0.68,
  "networkTrust": 0.41,
  "systemicStress": 0.33,
  "honoredExits": 4,
  "nodeFailures": 1,
  "sentinel": { "active": true, "nodeId": 37 },
  "collectiveWisdom": 4
}
```

---

## Use Cases

- **Risk modeling** — inject market signals, read collective prediction
- **Consensus simulation** — model how groups reach (or fail to reach) agreement
- **Organizational dynamics** — simulate trust erosion, recovery, and systemic failure
- **Education** — teach emergence, swarm behavior, and complex adaptive systems
- **Research** — testbed for agent-based modeling with biologically-grounded mechanics

---

## Origin

Murmuration is part of the [Gnosquam](https://gnosquam.com) sovereign AI architecture — a system designed around the premise that four billion years of biological evolution produced solutions to every coordination problem software has tried to solve from scratch. The trait system is the engineering specification. Biology is not the metaphor. Biology is the blueprint.

Built by Ghost.

*Victory, but engineered.*

---

## License

Apache 2.0 — use it, embed it, build on it. Attribution required.
