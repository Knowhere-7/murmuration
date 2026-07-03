# The Honor & War System — Bible

> A record of everything built into `index.html` during this session: the
> population fixes that stopped the lag, and the full honor/rank/kingship/
> posthumous-tier system layered onto War Games (Capture the Flag).

---

## 1. Population — why it kept lagging, and the fix

**Symptom:** the sim was set to spawn 200+ agents by default, and kept
drifting back up to 300 even after being lowered.

**Root causes found, in order:**
1. The default agent count (`index.html` AGENTS input) was 200 → total, split
   50/50 into Colony A / Colony B by `World.initAgents()`.
2. Economy births had no reasonable ceiling (`maxPopulation` defaulted to
   200–300 depending on file), so the population could regrow after being
   lowered.
3. **The real repeat offender:** the sim autosaves the *entire* running
   civilization to `localStorage` every 3 seconds, and restores it ~300ms
   after every page load — silently overwriting a fresh, correctly-sized
   start with whatever was saved before any of these fixes existed. This is
   why it would "start correct, then jump."
4. The "Population Boom" seed (Mantis Shrimp / Flood the Gates) injected
   agents directly with `world.agents.push()`, bypassing any cap entirely —
   repeated clicks could blow one colony up to 200+ on its own.

**Fixes applied:**
- Default agent count lowered to **130 total (65 per colony)**.
- `economy.js` `maxPopulation` lowered to **130** (birth ceiling).
- `world.spawnColonyReinforcements()` (Population Boom) now hard-caps each
  colony at **100** and logs a warning + refuses reinforcements past that.
- `restoreCivilization()` now **enforces the 100-per-colony cap on load**,
  even against an old/legacy save — it trims the newest/least-decorated
  agents down to the cap instead of resurrecting a runaway civilization.

---

## 2. War Games recap (pre-existing, for context)

`ctf.js` implements Capture-the-Flag between Colony A and Colony B:
- Roles emerge from personality every tick: **raider**, **defender**,
  **escort**, **scout** (plus **king**, added this session — see below).
- **Skirmish mode**: running score, no eliminations, built for indefinite
  play.
- **Attrition mode**: first to 3 captures wins, or last colony standing.
  Raiders caught deep in enemy territory and surrounded by 3+ defenders for
  240 ticks are captured (removed from play). **Kills — and therefore all
  honor — only happen in Attrition mode.**

---

## 3. Honor — the new system

### Earning honor (permanent, never decays)
- **The kill itself:** every defender involved in a successful attrition
  capture earns **+1 honor**, permanently.
- **"Fighting hard" trickle:** any agent ranked below GENERAL — on *either*
  side of an active standoff (a raider deep in enemy territory with at least
  one guard nearby) — earns a steady **+0.01 honor per tick** just for being
  in a real fight. Over a sustained siege this adds up to more than the flat
  kill bonus — combat is deliberately the fastest path to honor of any task
  in the sim.

### Living rank ladder (driven by accumulated honor)
```
GRUNT → DECORATED (1+) → VETERAN (3+) → GENERAL (6+) → HERO (10+)
```
Each rank above GRUNT gets a visibly brighter gold glow on the agent itself
(`ctf.js#drawHonor`), recomputed every attrition tick.

### KING — a position, not a threshold
Exactly one living agent per colony can be King: whichever agent alive holds
the most honor. It is re-evaluated every tick:
- Passes automatically and silently when someone else earns more honor.
- Passes automatically and silently if the King dies (any cause).
- **Behavior changes with the crown** (`ctf._royalCourt`, runs every tick
  regardless of whether War Games is toggled on):
  - Kings never raid, defend, escort, or scout — their role is locked to
    `'king'`.
  - They amble slowly inside their own colony's territory (a radius around
    their home flag — "his lands"). If they wander past it, a firm-but-
    unhurried pull brings them home; inside it, they just patrol.
  - **Subjects gravitate toward their living king** — every agent in his
    colony gets a gentle attraction force toward his position, a loyal
    "royal court" pull layered on top of whatever role they're already
    playing.
- A King who commits **seppuku** simply vacates the crown — no bonus, no
  posthumous tier. The crown cannot be given up gracefully and rewarded for
  it.

### Glory-seeking — "making them want to fight"
Role assignment (`ctf._assignRoles`) now gives low-rank agents a thumb on
the scale toward **raider**: GRUNT/DECORATED get +0.15 to their effective
risk tolerance, VETERAN gets +0.06, GENERAL/HERO get none. The higher you've
already climbed, the less you need to prove — so the common soldiers are the
ones actually pushing the raids that keep the honor economy running.

### Posthumous tiers — HERO / LEGEND / GOD
Dying in battle (an attrition capture — **never seppuku**) always earns a
permanent posthumous monument. The tier is decided **by the agent's total
accumulated honor at the moment of death — the actual effort and honor
brought to the clan — not by their title or whether they happened to be
King**:

| Honor at death | Posthumous tier | Glyph | Monument size |
|---|---|---|---|
| < 10           | **HERO**   | ★ | modest |
| ≥ 10           | **LEGEND** | ⚔ | bigger, brighter |
| ≥ 20           | **GOD**    | ☀ | the biggest, brightest thing on the field |

The King title always vacates on death regardless of tier earned — GOD is
usually a long-reigning King's outcome (they accumulate the most honor by
definition), but any agent who fought and contributed enough could die a
GOD without ever having worn the crown.

Fallen monuments are permanent: drawn every frame forever (even though the
agent is `seppukuDone`), and they persist through save/load.

---

## 4. Visual language added this session

- **Rank glow** — living agents above GRUNT get a soft gold radial glow,
  intensity scaled to rank (Decorated faint → Hero strong).
- **King** — gold crown ring + glow + a ♛ glyph floating above the agent.
- **Fallen monuments** — HERO/LEGEND/GOD get a scaled radial burst + glyph
  (★ / ⚔ / ☀) at their death location, permanently.
- **Hit reactions** (`world.markHit` / `world.drawHits`, ported from an
  earlier version of this tool) — a brief expanding ring + flash, color-coded
  per cause, fading over ~460ms:
  - Black Swan / earthquake: orange `255,96,40`
  - Market Instability / paranoia: purple `200,90,255`
  - Cascade / ticking bomb: red `255,60,40`
  - Belief-conflict escalation ("battle" outside War Games): orange-red
    `255,110,50`
  - An attrition kill: victim flashes hard red `255,40,30`, each guard who
    landed it flashes amber `255,150,60`

---

## 5. HUD additions

The War Games panel now shows, per colony, under the role breakdown:
```
♛ A — KING #12 (4.30 honor) · 1 LEGEND · 3 fallen HEROES
♛ B — no honor yet
```
Falls back to the top living agent's rank/honor if no King currently holds
the crown, and lists God/Legend/Hero fallen counts whenever any exist.

---

## 6. Persistence

All of the above is part of the Save Civilization schema (`v2`) now:
`honor`, `rank`, `isKing`, `fallenRank` are serialized per agent and restored
on load, alongside the population-cap enforcement described in §1.
