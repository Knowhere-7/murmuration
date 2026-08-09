# BUILD RECORD — WEATHER AS THE PRESSURE SOURCE

Ghost, 2026-08-09. Rebuild from this file alone. Facts only.

---

## 1. WHY

Pressure currently comes from sliders that name abstractions (Black Swan, Cascade,
Cognitive Sharpness). Ghost: *"there is no better source for applying pressure
than mother nature and the human condition."* Weather replaces most of them.
Market Instability stays — it is paranoia, which is the human condition, not the
environment.

---

## 2. CURRENT STATE — verified 2026-08-09

| Thing | File | Reality |
|---|---|---|
| Disasters | `economy.js:71,144,160` | `DISASTER` phase, 300 ticks, `drain 3.0 · harvest 0.15 · zoneShrink 0.3`. **No deaths. No location. No visual.** Survivors get `+0.3` evolution. |
| Seasons | `seasons.js:35` | 4 seasons, `seasonLength = 1800` ticks. **Tick-based, so speed multiplier changes real duration.** Winter applies `_winterStress`; spring rewards survivors `+0.15`. |
| Nebula | `k26.js:143,180,220` | Exists. Reacts to trust/faith/consensus/grief and **follows the centroid of live agents.** It is a mood glow, not a hazard map. |
| Topo map | `terrain.js` | Contour lines. Static appearance; no seasonal gradient. |

**Net:** a disaster is a number change. Nothing dies, nowhere is hit, nothing is
learned by watching.

---

## 3. WHAT CHANGES

### 3.1 Disasters kill and have a location
- **8–17% death toll per disaster hit**, varying.
- Disasters strike a **region**, not the whole map. Deaths concentrate there.
- Deaths are deaths — not seppuku, not dishonor. A fourth exit, environmental.

### 3.2 Nebula becomes the storm radar
- Repurpose from mood-glow to **environmental stress map**.
- Colour gradient = stress level of that area.
- Worst-hit zones read as **uninhabitable** at a glance.
- Follows the hazard, not the swarm.

### 3.3 Seasons run on real time, not ticks
- **72 hours real time per season.** Fixed. Not tied to sim speed.
- Rationale: difficulty stays honest at 16× — speeding the clock must not
  cheapen the year.
- Topo map runs a **gradient scale** across the season.

### 3.4 Season pressure is asymmetric
| Season | Scarcity | Grief | Death |
|---|---|---|---|
| Cold | **up** | **up** | — |
| Hot | unchanged — must NOT compound | slight tick up | ~3% |

Cold is the hard season: scarcity and grief together. Hot is miserable but does
not stack scarcity on top.

### 3.5 Sliders become weather controls
- Replace the abstraction sliders with weather.
- **Keep Market Instability**, renamed to what it is: **paranoia**.
- Fewer external pressure sources needed later.

---

## 4. SEPARATE FINDING — the sentinel is exiled and frozen, and that is not the design

Ghost: *"somehow the sentinel became completely exiled and motionless. this isnt
my earlier design."* In earlier builds he personally witnessed the swarm:
1. attempt to bring the sentinel back to normal,
2. ignore/avoid them **while still nourishing** them, or
3. attempt to remove them themselves.

**These were never code. They were swarm decisions.** Ghost: *"those arent
programmed behaviors so they wouldnt be kept anywhere... it seems as if the option
has been removed."*

So the behaviours are not missing — **the option space is.** Verified:

- The sentinel is still **perceived**. `getNeighbors` (`world.js:599`) does not
  filter it, and `interaction.js:37` strips only `seppukuDone` and `DISHONORED`.
  A sentinel's state is `GRIEF_SENTINEL`, so it appears in neighbour lists.
- But every action a neighbour could take **lands on nothing**:
  - approach → `world.js:622-623` sets `vx = 0; vy = 0`
  - nourish → `feed.js:160,187` skips it
  - restore → grief pinned at 1.0; `agent.js:90` returns early from `updateGrief`
  - remove → no mechanism exists
  - **avoid** → the only branch that still works, because avoidance asks nothing
    of the target

**The option space collapsed to one.** Not three behaviours deleted — the ability
to *choose between* them, because every branch except avoidance terminates in a
no-op. Exile is what remains when care has nowhere to land.

It was not one deletion. It is ~40 independent `continue` / `filter` guards across
`interaction · evolution · economy · wealth · feed · ctf · predator · terrain ·
seasons · extractor · world · k26`, each defensible alone — *don't let a frozen
agent vote, don't feed a dead thing* — that together removed a decision the swarm
used to make.

**Candidate experiment, not a defect:** relax only the guards that gate CARE
(nourishment, grief relief) and leave voting/evolution/economy gated. If the
option space is the cause, the swarm resumes choosing — and what it chooses is its
own answer. **Ghost's call:** it changes what the cautionary tale means.

---

## 5. THE PANEL — settled 2026-08-09

    INPUTS — act on the WORLD            OUTPUTS — read the SWARM
    ─────────────────────────            ────────────────────────
    heat        intensity                kindness        gauge
    cold        intensity                honesty         gauge
    flood       ┐                        loyalty         gauge
    fire        │                        aggression      gauge
    earthquake  │ localized              cunning         gauge
    hurricane   │ RANDOM PATH            giving / taking gauge
    tornado     │ temporary denial       selfish/selfless gauge
    hail        ┘                        antisocial      gauge
                                         mobs / cliques  gauge
    scarcity      ┐
    crowding      │ condition levers
    volatility    │ — set the PRICE
    visibility    │   of a disposition,
    reputation    │   never the
    mobility      ┘   disposition

    dispositions live PER AGENT — distributed, never dialled

### The rule that decides where a control belongs
**Controls on the WORLD are fine at any number. Controls on BEHAVIOUR collapse
the option space.** Weather is the former. A "kindness" slider would have been the
latter. This is what §6 is about.

### Nature — 8 dials, and why not 3
Ghost's pushback, and it corrects an error of mine. I proposed collapsing eight to
three (season + severity + type). Wrong:
- **Heat/cold are not redundant with seasons.** A season is a baseline; a heat
  wave is an event *inside* it. Both are needed to build a winter with a killing
  week in it.
- **The other six wreck TERRAIN, not numbers.** Region unusable, short duration,
  spun up any time. Six different **shapes** of denial, not six labels on one
  severity dial — tornado is a narrow path, hurricane a huge sustained field,
  flood slow and wide, fire *spreads*, quake instant and broad, hail brief damage
  without denial.

### THE PATH IS RANDOM
Ghost: *"the path of disaster is random."* You trigger it; you never aim it.

- Deliberate contrast with the **Unaligned**, which has `TARGET A / BOTH /
  TARGET B`. A nomadic force can be pointed. Weather cannot. The UI must say so.
- **"Path" means it MOVES** — disasters track across the map, they are not a
  struck circle.
- Therefore the storm radar (§3.2) is **required, not decorative**: with moving,
  random, terrain-denying events, the map is unplayable without seeing where the
  hazard is and where it is heading.

### Dispositions become gauges — Ghost's call
Ghost: *"then add kindness as a gauge."* You dial **scarcity** and watch
**kindness** fall. You drop **visibility** and watch **honesty** collapse — or
hold, which is the more interesting result.

Every named behaviour moves from the control side to the readout side. Same
eleven names, other end of the machine. *(Ghost named kindness; extending it to
the rest is Ghost²'s proposal, not his instruction.)*

This closes `DESIGN_INTENT` gap #3 — *"the observer needs instrumentation or
observation becomes investigation."* The gauges are that instrumentation.

### Temperament is SEEDING, not steering — and it is the point

Ghost: *"the purpose of the temperment sliders is to put the swarm in a mood
before anything begins... my goal is to make a swarm itself part of the pressure.
i dont intent to set and forget, im using a swarm to provoke a response. its by
far the best tool we could implement."*

Ghost²'s objection was to **steering** — riding a kindness dial mid-run so the
outcome belongs to the operator. That is not this. **Seeding sets the starting
population and then hands off**, which is how every experiment works: breed the
strain, then watch.

**This is what LOBO already is.** `loboSwarm.js:4-8` — *"not one adversary: a
POPULATION of divergently-activated attackers. Same genome, different activation
per agent — so their blind spots DO NOT CORRELATE."* Swarm-as-instrument was
built once, to attack the immune system. This generalises it: seed a temperament,
point it at something, the response is the finding.

**The swarm is a provocation instrument, not only a subject.** Recorded because it
changes what the whole thing is for and was written down nowhere.

### THREE TIERS — the boundary must be structural, not voluntary

| Tier | When | Acts on |
|---|---|---|
| **Temperament** | t=0 only, **locked after start** | the population you begin with |
| **Weather + conditions** | live | the world |
| **Gauges** | live | readout only |

**Seed controls and run controls must not share a panel.** If temperament dials
sit beside weather dials, someone rides them mid-run, the distinction collapses,
and it is steering again. A setup phase that locks on start is the only version
that holds — otherwise the design is correct and the discipline is voluntary,
which is the §4 failure exactly: individually reasonable, collectively fatal.

### Still open
The six **condition levers** have not been challenged the way the weather dials
were. Visibility and reputation are the ones Ghost² would defend hardest — honesty
and loyalty have no other honest handle — but they have not been ruled on.

---

## 6. PARKED — TOO MANY CONTROLLING VARIABLES

Ghost, 2026-08-09: *"we are giving them to many controlling variables. make note
and we will circle back."*

The sentinel case is the evidence: ~40 individually-reasonable guards removed a
swarm decision, and nobody decided that. Same shape as the slider surface — each
control was added for a reason, and the total is a swarm with less room to choose
than it had.

**Do not build weather until the whole control surface is mapped.** Ghost:
*"[we] want the entire package mapped out first so we dont fall down a rabbit hole
of drift."* Adding six weather variables to an already over-controlled system
without seeing the total is how the next §4 gets written.

**Next action: map every controlling variable. Then decide what weather replaces
rather than what it adds.**

---

## 7. BUILD ORDER — BLOCKED ON §6

1. Disaster deaths + region targeting (`economy.js`)
2. Nebula → hazard map (`k26.js`)
3. Seasons → real-time clock (`seasons.js`)
4. Season pressure asymmetry (`seasons.js` + `economy.js`)
5. Topo gradient by season (`terrain.js`)
6. Slider replacement (UI + wiring)

Each step lands as its own commit and appends to §8.

---

## 8. CONSTRUCTION LOG

*Appended as built. Date · what changed · file:line · how it was verified.*

_(nothing built yet)_
