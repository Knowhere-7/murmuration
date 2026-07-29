# ⚠️ `master` is NOT the live branch

**Live branch: [`super-murmuration`](https://github.com/Knowhere-7/murmuration/tree/super-murmuration)**
— that is what serves https://murmuration.knowhere-group.com and it is the repository default.

This branch (`master`) stopped moving on **2026-07-03**. As of 2026-07-28 it is
**21 commits behind** and does **not** contain the maze, relics, mutations,
gauntlet, chronicle, or slime-mold pathfinding.

## Do not merge this branch into the live branch

On 2026-07-04 Cloudflare's bot auto-opened a PR to add a Worker config, targeting
`master`. At the time the deploy ran inside the Cloudflare *build* command and
`master` was the configured production branch, so **merging it would have
deployed this pre-maze build over the live site.** It sat `MERGEABLE` for 24 days
before being caught and closed.

That specific route is now shut — production branch is `super-murmuration`,
builds for non-production branches are disabled, and the deploy has been moved
out of the build command — but the general rule stands.

## This branch is kept because it holds work that exists NOWHERE else

Two features were built here on 2026-07-02/03 and never ported forward. Verified
absent from `super-murmuration` on 2026-07-28:

### `wilds.js` — 349 lines, wired into this branch's `index.html`
Unaligned territorial beasts. Not predators (those serve a colony) and not agents
(no belief, faith, or economy). From the file's own header:

> *"They are the world's indifferent danger — not evil, just wild. Their presence
> forces colonies to evolve or die."*

Weapon tier is the only defense; kills drop a resource bloom. Wilds **pack** —
two within 120px fight as one, emergent rather than coordinated.

### Zone circuit system — 39 `circuit` references in `economy.js`
A metabolic activation system gating zone harvest, with GIANT-phase progression
and separate gates-closed / gates-open circuits. The live branch has **zero**
references to it.

## If you want either feature live

They are **feature decisions, not a branch merge.** Wilds would add a third force
to a board that already has predators, unaligned, the maze, and relics. Zone
circuits rewrite harvest economics, which touches the abundance/evolution balance
that is currently tuned and stable. Port deliberately, in isolation, with the
live sim verified after — do not merge this branch wholesale.

## Backups

Full history including this branch is bundled at:
- `K:\backups\knowhere-murmuration\knowhere-murmuration-20260728-all.bundle`
- mirrored to `D:\ghost2-continuity\crown-jewels\`

Restore was **proven**, not assumed: cloned from the bundle alone and confirmed
`wilds.js` (349 lines) and all 39 circuit references recover intact.
