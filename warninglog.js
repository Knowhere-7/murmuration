/**
 * Warning Log for Murmuration
 * ────────────────────────────────────────────────────────────────
 * The honesty layer. Watches the swarm's emergence metrics and
 * records a timestamped warning whenever cascade risk crosses a line.
 *
 * A warning is a CLAIM: "the collective is heading toward collapse."
 * Every claim is logged with its time and the evidence behind it, so
 * it can later be checked against what the market actually did.
 *
 * Logged warning → real drawdown      = the model saw it coming
 * Logged warning → nothing happened   = false alarm
 * Real drawdown  → no warning         = the model was blind
 *
 * That ledger is the entire difference between a demo and a tool.
 */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.WarningLog = class WarningLog {
  constructor(opts = {}) {
    this.threshold = opts.threshold != null ? opts.threshold : 0.45; // risk score to fire
    this.cooldown  = opts.cooldown  != null ? opts.cooldown  : 3;    // candles between warnings
    this.warnings  = [];
    this._lastFireIndex = -999;
  }

  /**
   * Composite cascade-risk score from emergence metrics, 0..1.
   * Each term is a symptom of a collective heading toward collapse.
   *
   * Built only from signals that genuinely propagate through the swarm:
   *  - grief / crisis : the ST-2 machinery — emergent, the swarm amplifies
   *    raw drawdown into a grief cascade. This is the real edge.
   *  - bearishness    : the swarm collectively believing DOWN.
   *  - trustCrush     : a sharp loss of earned authority across the swarm.
   *
   * cascadeVelocity and divergence were dropped — both are demo-calibrated
   * metrics that read the engine's pre-anchor belief and stay near zero
   * once real momentum drives the agents.
   */
  static riskScore(e) {
    const activeCount   = Math.max(1, (e.highTrustCount || 0) + (e.lowTrustCount || 0) + 1);
    const crisisFrac    = Math.min(1, (e.crisisCount || 0) / activeCount);
    const grief         = Math.min(1, e.avgGrief || 0);
    const bearishness   = Math.min(1, Math.max(0, -(e.prediction || 0)) * 2.2);
    const trustCrush    = Math.min(1, Math.max(0, (0.5 - (e.avgTrust || 0)) * 2.5));

    return (
      0.40 * grief      +
      0.27 * crisisFrac +
      0.20 * bearishness +
      0.13 * trustCrush
    );
  }

  /**
   * Evaluate one tick. If risk crosses threshold (and cooldown has
   * elapsed), record a warning. Returns the warning, or null.
   *
   * @param emergence  output of EmergenceExtractor.extract()
   * @param index      candle / tick index (the timestamp axis)
   * @param ctx        optional { time, price } real-world context
   */
  evaluate(emergence, index, ctx = {}) {
    const score = WarningLog.riskScore(emergence);

    if (score >= this.threshold && (index - this._lastFireIndex) >= this.cooldown) {
      this._lastFireIndex = index;
      const warning = {
        index,
        score,
        time:  ctx.time  != null ? ctx.time  : null,
        price: ctx.price != null ? ctx.price : null,
        evidence: {
          cascadeVelocity: emergence.cascadeVelocity || 0,
          avgGrief:        emergence.avgGrief || 0,
          crisisCount:     emergence.crisisCount || 0,
          divergence:      emergence.divergence || 0,
          avgTrust:        emergence.avgTrust || 0,
          prediction:      emergence.prediction || 0
        },
        validated: null,   // set by the backtest: 'hit' | 'false_alarm'
        outcome:   null     // forward drawdown observed, %
      };
      this.warnings.push(warning);
      return warning;
    }
    return null;
  }

  /** Latest risk score without firing — for live gauges. */
  peek(emergence) { return WarningLog.riskScore(emergence); }

  reset() {
    this.warnings = [];
    this._lastFireIndex = -999;
  }
};
