# Attrition — Genome Trait Options

Organisms approved into the genome as **options available to all colonies** (Ghost,
2026-08-29: *"merely additions to the genome... new options for all"*). These are
**raw candidates**, not an implementation queue — each gets an in-engine `_express`
mechanic only when pure-need evolution (or a deliberate build) calls for it.

> **THE BAR (Ghost, 2026-08-29): every trait must be LOAD-BEARING — *"they must
> perform as the original 5."*** The founding words (tardigrade · planarian ·
> *Turritopsis* · Hydra · the human immune system) are the proof it's possible: each
> is a real, consequential mechanism that shapes the whole organism. That's the rule
> for the *entire* genome, not just these additions — **no cosmetic traits, ever.** A
> raw name below earns a live slot ONLY when translated into a mechanism that carries
> real weight: it changes outcomes, it costs something, it matters. Anything that
> can't meet the bar stays a suggestion. (Applies to the existing roster too — a trait
> that doesn't bear load doesn't belong.)

Roster shape they'll take when wired (see `attrition.js` §`AttritionReactions`):
`{ id, trait:'Common (Latin)', kind, unlocked:{A,B}, ... }` — `kind` ∈
gate · defense · signal · offense · regen · inheritance.

Status legend: **DOCTRINE** = part of the Knowhere-tactician build now in progress ·
**OPTION** = catalogued, unlocked by need later.

| id | trait | kind | correct translation (combat function) | status |
|---|---|---|---|---|
| `meerkatSentinel` | Sentinel Watch (*Suricata suricatta*) | signal | Lookouts on the approaches detect a wave forming and **classify its vector** before contact — early warning that feeds coordination. | DOCTRINE |
| `flashingComms` | Flashing Communication (*Dosidicus* chromatophores) | signal | Distributed command — mark the target, sync the strike; no commander to decapitate. | DOCTRINE |
| `mimicOctopus` | Mimic Octopus (*Thaumoctopus mimicus*) | defense | **Dynamic** deception — impersonate LOBO to infiltrate a wave, or impersonate what LOBO avoids. (Batesian mimicry's smarter successor.) | DOCTRINE |
| `pistolShrimp` | Pistol Shrimp (*Alpheus*) | offense | Contactless cavitation concussion on the marked vanguard at its commit-point. Decapitation at range. | DOCTRINE |
| `vampireSquid` | Vampire Squid (*Vampyroteuthis infernalis*) | offense | Bioluminescent dazzle cloud (blinds LOBO's targeting) + coordinated pack-hunt on the leaderless remnant. | OPTION |
| `elephantMemory` | Matriarchal Memory (*Loxodonta*) | inheritance | Retains LOBO's tactical signatures **across rounds & evolution**; infrasound = long-range coordination. | OPTION |
| `poisonDartFrog` | Aposematic Toxin (*Dendrobates*) | defense | Advertised contact toxin — striking a colony agent kills the attacker; LOBO **learns to avoid**. | OPTION |
| `ribbedNewt` | Rib-Spine Extrusion (*Pleurodeles waltl*) | defense | Reactive venomous spines — grapple/occupy an agent and it drives ribs through its own skin; the attacker impales itself. | OPTION |
| `trichomeField` | Trichome Field (glandular plant hairs) | defense | Barbed/sticky zone laid across a lane — snares and slows anything crossing. **Builds** the kill-zone. | OPTION |
| `hagfishSlime` | Slime Defense (*Myxini*) | defense | Instant area-choke — a burst that clogs a wave's momentum mid-advance. | OPTION |
| `muskOxRing` | Defensive Ring (*Ovibos moschatus*) | defense | Phalanx around the crown, horns out, vulnerable core protected. **Holds the objective.** | OPTION |
| `gullMobbing` | Mobbing (*Laridae*) | offense | Collective harass to **drive a unit off** — repel, not kill. | OPTION |
| `explodingAnt` | Autothysis (*Colobopsis explodens*) | offense | A surrounded/doomed agent ruptures, gluing & killing adjacent LOBO units — turns a loss into a kill (and honor, even in death). | OPTION |

## Notes

- **The five DOCTRINE rows** compose the Knowhere tactician now being wired:
  *perceive (meerkat) → coordinate (flash) → deceive (mimic octopus) → decapitate
  (pistol shrimp) → learn (`adaptiveImmunity`, already in roster).* Vampire squid's
  dazzle+pack is the intended kill/finisher and may join the doctrine or land as the
  first OPTION unlock.
- **Options are colony-agnostic.** Which colony grows into which is decided by
  pure-need evolution (`chooseNextTrait` / the `_need` accumulator), not by a
  hard innate assignment — that's what keeps the brawler/tactician split *emergent*.
- Contactless / advertised / sacrificial powers each carry a **toll** when wired
  (same discipline as `thermalBalling`'s `_ballHeat`): light standing cost, bites
  only under heavy/sustained use.

## ✅ BUILT — cordyceps v2 (realistic propagation) · Ghost's idea 2026-08-31, tuned 2026-09-02

Implemented in `attrition.js` cordyceps EXPRESS. Tuning knobs (balance, not assumed):
`CASCADE_MAXGEN=2` (chain depth: plant → 2nd → 3rd, then stops) · `FRUIT_INCUB=14` (the short
window — a fruited host pops soon after its parent) · reuses `spreadR=34`, `MAXNEW=3`. The infected
now walks toward its nearest clean neighbour (seek-own-kind steer). The gen cap + short window are
the farm-trap guard vs a planarian-reviving LOBO. ⏳ open tuning: the pair isn't literally
simultaneous ("both pop" is ~14 ticks apart); tighten FRUIT_INCUB if truer simultaneity is wanted.

Make cordyceps behave like the real *Ophiocordyceps* — a spreading outbreak, not a one-shot
fruiting. Keep the current effect (seize a frayed occupier, walk it off the crown, kill it), and
add TRUE propagation:
- The infected host **seeks its own kind**, reaches a **second** agent and infects it; then **both
  pop** (die together).
- Within a **very short window**, the freshly-infected second host can chain to a **third** — a
  fruiting cascade. The short window is the intended natural throttle (keeps it from becoming a
  whole-wave wipe).
- **Honor:** a chain/secondary kill **still pays the maze-kill premium (1.2)** — the second agent
  wasn't struck by the caster, it was killed by **infection** (fruiting), which is a cordyceps kill
  by definition. Conservation holds (LOBO→colony transfer).
- ⚠️ Balance watch: a cascade against a **reviving** LOBO (planarian) is exactly where honor could
  start minting — the [[project_immortal_lobo_sealed_test]] farm trap. The short window + a per-
  cascade cap keep it bounded; must be tuned, not assumed.
- Note: cordyceps is a **genome-shared** gene — the same propagation applies whoever expresses it
  (Knowhere turning LOBO's ranks into a self-consuming outbreak, or LOBO wielding it against a
  colony's own kind). "Get the most from that gene" = the spread IS the gene.
