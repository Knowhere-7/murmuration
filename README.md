# Handoff: Murmuration — Swarm Colony Simulation

## Overview
Murmuration is a live, self-contained browser simulation: two agent colonies (**Knowhere** and **Mainland**) live on either side of a wall with two gates, competing for shared resource zones. Agents run on emergent behavior rules (belief, trust, honor, grief, evolution, kings) — there is no server and no AI/LLM in the loop, it's deterministic JS physics + rules running in `requestAnimationFrame`.

## About These Files — this is NOT a design mockup
Unlike a typical Claude Code handoff, **these files are the actual working, production-ready front-end** — not a visual reference to be reimplemented. `index.html` runs exactly as-is in any browser with zero build step, zero npm install, zero bundler. Claude Code's job here is most likely:
- **Deployment** — get this static site hosted (Netlify, Vercel static, GitHub Pages all work with zero config — just point at `index.html`).
- **Optional integration** — if you want this embedded inside a larger app/framework, treat the JS files as a self-contained engine: they attach everything to `window` (globals + `window.MurmurationModules`), so they can be dropped into any page that loads them in the same `<script src>` order shown below.
- **Optional refactor** — if asked to modernize into modules/a framework, preserve the exact behavior described below; it's tuned by feel (magic numbers everywhere), not spec, so wholesale rewrites risk silently changing how the sim plays.

There is nothing to "pixel match" — there's no separate production target this needs to look like. The current `index.html` **is** the target.

## Entry Point & Load Order
`index.html` loads these engine files via plain `<script src>` tags, in this exact order (order matters — later files assume earlier globals exist):

```html
<script src="topomap.js"></script>
<script src="agent.js"></script>
<script src="world.js"></script>
<script src="seed.js"></script>
<script src="interaction.js"></script>
<script src="evolution.js"></script>
<script src="extractor.js"></script>
<script src="k26.js"></script>
<script src="economy.js"></script>
<script src="wealth.js"></script>
<script src="predator.js"></script>
<script src="ctf.js"></script>
<script src="warninglog.js"></script>
<script src="murmuration.js"></script>
```

No other assets are required. One external dependency: a Google Fonts `@import` in `index.html`'s `<style>` block (Cormorant Garamond, Newsreader, JetBrains Mono) — the page needs internet access to fetch those at runtime, or they should be self-hosted/inlined for a fully offline build.

## File Manifest
- **topomap.js** — bakes a static elevation/terrain field (glowing iso-line contours) and exposes `TopoField.gradient()`/`height()`, sampled by `world.js` so agents drift downhill and pool into valleys. One continuous field spans the whole board (not mirrored/symmetric left-right by design — the two colonies pool into different valley shapes as a result).
- **agent.js** — the `Agent` class: position/velocity, belief state, trust, honor/rank, grief, evolution, faith, and `draw()` (all agent visual rendering — hue, glow, rings — lives here).
- **world.js** — the `World` class: the wall + gates, the 10 landing/resource zones (`commonsLayout`), the ambient current/vortex physics, terrain pull, neighbor queries, wall collision, and `advanceStep()` (the main per-tick update).
- **k26.js** — the `K26` simulation driver: owns the render loop, draws connection strings (the neural-web bond lines between agents), the wall, and orchestrates all the subsystems below each tick.
- **economy.js** — the `Economy` class: resource zones (harvest/richness/depletion), births/population cap, serialization (save/restore).
- **evolution.js** / **extractor.js** — belief/evolution scoring and "emergence" signal extraction (used for the on-page stat panels).
- **wealth.js** — wealth/social-class simulation layered on top of the economy.
- **predator.js** — predator/threat mechanics.
- **ctf.js** — the honor/king/capture-the-flag-style contest system: honor scoring, rank tiers, king crowning per colony (`isKing`), subjects gravitating to their king, and the crown vacating on death.
- **warninglog.js** — collapse/drawdown warning signal logging (compares predicted vs. actual outcomes).
- **seed.js** / **interaction.js** — the "Seed Injector" panel (manual perturbation controls: earthquake, paranoia, cascade, etc.) and general UI interaction wiring.
- **murmuration.js** — top-level module registry (`window.MurmurationModules`) tying the above together.

## Core Concepts / Glossary (read before touching behavior)
- **Colonies**: `A` = Knowhere (turquoise, hue ~176°), `B` = Mainland (pink, hue ~326°). Default population is 60/60 (120 total), enforced at spawn, on restore, and as a birth ceiling (`maxPopulation` in `economy.js`, `RESTORE_CAP_PER_COLONY` in `index.html`, `PER_COLONY_CAP` in `world.js` — keep these three in sync if you change the target population).
- **The Wall**: a vertical barrier (`world.wall`) splitting the board, with two gates (`NORTH GATE`, `SOUTH GATE`) the user toggles open/closed. Closed = agents/sightlines/bonds can't cross. `world.applyWallCollision()` enforces this every tick using each agent's pre-move side (`a._wx`), not colony identity directly.
- **Ambient Current**: a slow clockwise vortex (`world.js`, top of `advanceStep()`). While both gates are closed, each colony spins its own independent eddy (different speed + phase, never synced). The moment any gate opens, the two eddies merge into one board-spanning current. A "homeward pull" force nudges any agent stranded on the wrong side of the wall back toward its own colony (it can only actually cross back through an open gate — the pull just queues it at the seam).
- **Zones** (`world.commonsLayout` / `economy.zones`, kept in sync by name): 10 total, 5 per colony — `WELL · KN I–IV` + `HEARTH · KN` for Knowhere, mirrored `WELL · ML I–IV` + `HEARTH · ML` for Mainland. Zones have `supply`/`richness` that depletes under occupation and regenerates when empty, and a `controller` (`null` | `'A'` | `'B'` | `'CONTESTED'`).
- **Honor & Kings** (`ctf.js`): agents earn honor through conflict; each colony's top-honor agent is crowned king (`isKing`), holds court instead of raiding, and the crown vacates immediately on death (win or lose) or on seppuku (no honor tier earned that way).
- **Belief / Grief / Evolution / Faith**: per-agent state machines in `agent.js` driving color (hue), behavior (seppuku, sentinel installation), and the connection-string ("neural web") coloring between bonded agents in `k26.js`.
- **Save/restore**: the whole civilization autosaves to `localStorage` under key `murmuration.civ.v2` every 3s and on unload, and restores on load if the save is schema-current (`version >= 2`) — see `tryRestore()` in `index.html`. `economy.js`'s `Economy.restore()` reconciles saved zone state against the *current* zone layout by name (not a wholesale overwrite) specifically so a code change to the zone map doesn't get shadowed by a stale save — preserve that pattern if you touch zone restore logic.

## Deployment
This is a static site — no build step, no server-side code, no environment variables.
- **Netlify**: drag the folder (or a zip of it) onto Netlify's manual deploy page, or connect it via GitHub for auto-deploy on push.
- **GitHub**: there's already a matching repo, `Knowhere-7/murmuration` — that's the natural home for this code if you want push-to-deploy.
- **Anywhere else**: any static host (Vercel, GitHub Pages, S3+CloudFront, etc.) works — just serve the folder with `index.html` at the root.

## Known Non-Determinism / Things Not to "Fix"
- The terrain field intentionally is NOT mirrored left/right — the two colonies pool into visually different valley shapes on purpose (confirmed desired behavior, not a bug).
- Population counts, honor values, and king identity will drift/change every session — that's the simulation working, not a state bug.

## Assets
No image/icon assets — everything is rendered via Canvas 2D (`ctx.arc`, gradients, etc.) or inline SVG-free CSS. The only external asset is the Google Fonts import noted above.

## Further Reading
**`HONOR_WAR_BIBLE.md`** (included in this folder) is the canonical spec for the honor/rank/king/war system implemented in `ctf.js` and `agent.js` — read it before modifying any combat, honor, rank, or crown logic. It documents the full rank ladder, how honor is earned/lost, the king crowning/vacating rules, and the save-schema fields (`honor`, `rank`, `isKing`, `fallenRank`) that must stay in sync with `index.html`'s serialize/restore code.
