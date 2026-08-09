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

**None of the three exist in this build.** Verified: every `isSentinel` reference
outside `installSentinel` is an exclusion — `continue`, `filter(!isSentinel)`,
`return` — across `interaction · evolution · economy · wealth · feed · ctf ·
predator · terrain · seasons · extractor · world` (voting, belief, wall collision,
commons) and `k26` (connection strings). Plus `world.js:622-623` sets
`vx = 0; vy = 0`.

No code approaches, nourishes, avoids, or removes a sentinel. **Not tracked in
this build — recorded so it is not mistaken for a weather task.**

---

## 5. BUILD ORDER

1. Disaster deaths + region targeting (`economy.js`)
2. Nebula → hazard map (`k26.js`)
3. Seasons → real-time clock (`seasons.js`)
4. Season pressure asymmetry (`seasons.js` + `economy.js`)
5. Topo gradient by season (`terrain.js`)
6. Slider replacement (UI + wiring)

Each step lands as its own commit and appends to §6.

---

## 6. CONSTRUCTION LOG

*Appended as built. Date · what changed · file:line · how it was verified.*

_(nothing built yet)_
