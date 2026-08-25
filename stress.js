/* ══════════════════════════════════════════════════════════════════════════
   MENTAL STRESS — pressures that change how a colony DECIDES, never what it does.

   Ghost, 2026-08-25: "we need mental stress factors for the colonies that alter
   decision making without scripting like paranoia."

   THE WHOLE DESIGN IS IN "WITHOUT SCRIPTING." A stress factor that says "if
   frightened, retreat" is an authored behaviour wearing a psychological label,
   and it can only ever produce the reaction we imagined. So nothing here adds a
   behaviour. Each factor BIASES A THRESHOLD the colony already decides at, and
   the behaviour falls out of the same machinery running at a different setting.

   The threshold that matters most already exists: quorum — "nothing fires until
   a quorum independently confirms the threat." Move that number and everything
   downstream changes without a single new rule.

   THE FACTORS ARE OPPOSED ON PURPOSE:

     PARANOIA   rises when the colony answers an alarm and finds NOTHING there.
                It LOWERS the quorum — fewer confirmations needed — so a jumpy
                colony gets jumpier. Left alone it feeds itself.
     FATIGUE    rises when the alarm sustains WITHOUT contact. It RAISES the
                quorum — more confirmation demanded before anyone moves. This is
                alert fatigue, and it is the one every blue team actually lives:
                cry wolf often enough and the colony stops believing its own
                nervous system.
     DREAD      rises with losses AT THE CROWN. It does not touch quorum at all;
                it tightens cohesion, pulling the colony toward its king — which
                shrinks the foraging range and can starve a colony that is
                winning every fight.

   Because paranoia and fatigue push the SAME number in OPPOSITE directions, the
   colony's effective threshold is emergent: it is the running argument between
   how often it has been wrong and how often it has been tired. Neither of us
   sets it, and no run has to arrive at the same place as another.

   ⚠️ AN ATTACK SURFACE FALLS OUT OF THIS, AND IT WAS NOT DESIGNED IN. A LOBO
   that provokes responses without ever making contact drives fatigue up and the
   colony's own alarm becomes unreliable. Nothing here implements that — it is
   simply available, which is the difference between an emergent vector and an
   authored one.
   ══════════════════════════════════════════════════════════════════════════ */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.ColonyStress = class ColonyStress {
  constructor(world, opts = {}) {
    this.world = world;
    this.enabled = opts.enabled !== false;

    // 0..1 each, per colony. Nothing is ever set directly — only accumulated
    // from something that happened.
    this.state = {
      A: { paranoia: 0, fatigue: 0, dread: 0 },
      B: { paranoia: 0, fatigue: 0, dread: 0 }
    };

    this.RISE_PARANOIA = opts.riseParanoia ?? 0.055;  // per fruitless response
    this.RISE_FATIGUE  = opts.riseFatigue  ?? 0.0016; // per tick of alarm w/o contact
    this.RISE_DREAD    = opts.riseDread    ?? 0.09;   // per loss at the crown
    // Everything fades. A colony that has been calm for a long time forgets,
    // which is what stops any factor from being a one-way ratchet.
    this.DECAY = opts.decay ?? 0.9985;

    this.BASE_QUORUM = null;   // captured on first use — never assumed
  }

  /* ── THE OPERATOR'S FLOOR ────────────────────────────────────────────────
     Ghost, 2026-08-25: "stress as a slider ... i keep going back to that
     particular slider because it was the first and most frequent behavior
     modifier."

     Paranoia has lineage here. In murmuration it is the scenario name attached
     to ELECTRORECEPTION (#33, cross-correlation detection) — a sense that finds
     threats by correlating faint signals, which is what paranoia biologically
     IS. This is that dial, given its own hand.

     A floor rather than an override: the operator sets the state of mind a
     colony STARTS from, and lived events still accumulate above it. So "show me
     a paranoid colony under attack" is a setting, while what that colony then
     becomes is still earned. Authored entry, emergent outcome — which is the
     correct shape for a range, where a scenario must be repeatable but its
     result must not be. */
  setFloor(colony, factor, v) {
    this.floors = this.floors || { A:{}, B:{} };
    if (!this.floors[colony]) this.floors[colony] = {};
    this.floors[colony][factor] = Math.max(0, Math.min(1, v));
    return this.floors[colony][factor];
  }
  floorOf(colony, factor) {
    return (this.floors && this.floors[colony] && this.floors[colony][factor]) || 0;
  }

  // The LIVED state only. The operator's floor is added by effective(), never
  // written into it — so lowering a slider genuinely lowers the colony's mind
  // instead of leaving a permanent residue nothing can undo.
  _c(colony) { return this.state[colony] || this.state.A; }

  /** What the colony is ACTUALLY feeling: lived stress over the operator floor. */
  effective(colony, factor) {
    const s = this.state[colony] || this.state.A;
    return Math.max(0, Math.min(1, (s[factor] || 0) + this.floorOf(colony, factor)));
  }

  /** The colony answered an alarm and found nothing. */
  falseAlarm(colony) {
    if (!this.enabled) return;
    const s = this._c(colony);
    s.paranoia = Math.min(1, s.paranoia + this.RISE_PARANOIA);
  }

  /** The alarm is up and nobody has made contact this tick. */
  alarmWithoutContact(colony) {
    if (!this.enabled) return;
    const s = this._c(colony);
    s.fatigue = Math.min(1, s.fatigue + this.RISE_FATIGUE);
  }

  /** Someone was lost at the crown. */
  lossAtCrown(colony) {
    if (!this.enabled) return;
    const s = this._c(colony);
    s.dread = Math.min(1, s.dread + this.RISE_DREAD);
  }

  /** Contact happened — the alarm told the truth, so fatigue eases. */
  vindicated(colony) {
    if (!this.enabled) return;
    const s = this._c(colony);
    s.fatigue = Math.max(0, s.fatigue - 0.05);
    s.paranoia = Math.max(0, s.paranoia - 0.02);
  }

  /**
   * THE ONLY OUTPUT THAT TOUCHES DECISIONS. Returns the quorum this colony
   * should be deciding at right now — never a behaviour, just the number.
   *
   * Paranoia pulls it down, fatigue pushes it up, and the result is whichever
   * of the two the colony's history has earned more of. Clamped to 1..6 so no
   * amount of either can make the colony unable to act or unable to stop.
   */
  quorumFor(colony, baseQuorum) {
    if (this.BASE_QUORUM == null) this.BASE_QUORUM = baseQuorum;
    if (!this.enabled) return baseQuorum;
    const shift = (this.effective(colony,'fatigue') * 3.0)
                - (this.effective(colony,'paranoia') * 2.5);
    return Math.max(1, Math.min(6, Math.round(baseQuorum + shift)));
  }

  /** Dread's only effect: a tighter colony. Also never a behaviour. */
  cohesionBias(colony) {
    if (!this.enabled) return 0;
    return this.effective(colony,'dread') * 0.10;
  }

  step() {
    if (!this.enabled) return;
    for (const c of ['A', 'B']) {
      const s = this.state[c];
      s.paranoia *= this.DECAY;
      s.fatigue  *= this.DECAY;
      s.dread    *= this.DECAY;
    }
  }

  stats(colony) {
    return {
      paranoia: +this.effective(colony,'paranoia').toFixed(3),
      fatigue:  +this.effective(colony,'fatigue').toFixed(3),
      dread:    +this.effective(colony,'dread').toFixed(3),
      quorum:   this.quorumFor(colony, this.BASE_QUORUM ?? 3)
    };
  }
};
