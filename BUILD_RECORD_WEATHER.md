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

## 5. THE TWO AXES — Ghost, 2026-08-09

### Nature — APPLIED to them
heat · cold · flooding · fire · earthquakes · hurricanes · tornadoes · hail · etc

### The human condition — EXPRESSED by them
paranoia · grouping / clicking-up / mobs · honesty · loyalty · kindness · giving ·
taking · aggression · selfish vs selfless · cunning · antisocial

### These are not the same kind of thing, and that is the point

**Nature is a control surface.** External forces dialled at the world. These are
sliders. ~8 of them, replacing the current abstraction sliders.

**The human condition is not a control surface.** A slider that sets a colony's
"kindness" to 0.7 is not the human condition — it is a puppet string, and it makes
§6 worse. These are **dispositions agents hold and act from.**

Current agent model has **four** dimensions (`agent.js:19-23`):
`riskTolerance · trustBaseline · reactivity · memoryWeight`. Ghost's list names
eleven. Nine are absent.

**And the list contains two layers, not one:**
- **Held per agent** — honesty, loyalty, kindness, giving, taking, aggression,
  selfish/selfless, cunning, antisocial, paranoia
- **Emergent from those under pressure** — grouping, clicking-up, mobs. Nobody
  sets a mob. A mob is what a set of dispositions does when weather arrives.

### The structural consequence
Fewer controls, wider option space — the exact inverse of the current state
(§6: many controls, option space collapsed to one).

    weather        = what happens TO them        → dialled
    dispositions   = what they ARE               → distributed, not dialled
    mobs, cliques  = what they DO about it       → emergent, never set

**Open, Ghost's to rule:** paranoia. He said *"we should keep market instability
aka paranoia"* — which places it on the control surface. But it also reads as a
disposition. It may be both: a dialled global climate that individual paranoia
responds to. Not decided.

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
