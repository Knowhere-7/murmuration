/**
 * Crypto Sensory Organ for Murmuration
 * ────────────────────────────────────────────────────────────────
 * Wires the swarm to a real market. Each agent mirrors one crypto
 * asset; its belief / trust / grief are anchored to live measurements.
 *
 *   belief  ← price momentum     (which way the asset leans)
 *   trust   ← stability / calm   (volatile markets erode trust)
 *   grief   ← realized drawdown  (loss already absorbed)
 *
 * The swarm's own rules (contagion, grief cascade, sentinel) then run
 * ON TOP of that anchor — that is where the predictive signal comes
 * from. The feed anchors; the swarm reasons.
 *
 * Data: Binance public REST API. No key. No cost. Host fallback for
 * geo-blocked regions (.com → .us).
 */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.CryptoFeed = class CryptoFeed {
  constructor() {
    // Candidate API hosts — tried in order until one answers
    this.hosts = [
      'https://api.binance.com',
      'https://api.binance.us'
    ];
    this.activeHost = null;

    // The swarm universe — liquid USDT pairs. Agent i ↔ UNIVERSE[i].
    this.universe = [
      'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT',
      'DOGEUSDT','AVAXUSDT','DOTUSDT','LINKUSDT','LTCUSDT','TRXUSDT',
      'MATICUSDT','UNIUSDT','ATOMUSDT','ETCUSDT','XLMUSDT','NEARUSDT',
      'APTUSDT','FILUSDT','ARBUSDT','OPUSDT','INJUSDT','AAVEUSDT'
    ];
  }

  // ── HOST DISCOVERY ──────────────────────────────────────────────
  async _resolveHost() {
    if (this.activeHost) return this.activeHost;
    for (const host of this.hosts) {
      try {
        const r = await fetch(`${host}/api/v3/ping`, { signal: AbortSignal.timeout(6000) });
        if (r.ok) { this.activeHost = host; return host; }
      } catch (e) { /* try next */ }
    }
    throw new Error('No Binance host reachable. Region may be geo-blocked — try a VPN or swap the data source.');
  }

  // ── HISTORICAL CANDLES (backtest) ───────────────────────────────
  /**
   * Fetch OHLCV klines for one symbol.
   * Binance kline row: [openTime,open,high,low,close,volume,closeTime,...]
   * Returns: [{ t, o, h, l, c, v }]
   */
  async fetchKlines(symbol, interval = '4h', limit = 500) {
    const host = await this._resolveHost();
    const url  = `${host}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`${symbol}: HTTP ${r.status}`);
    const rows = await r.json();
    return rows.map(k => ({
      t: k[0],
      o: parseFloat(k[1]),
      h: parseFloat(k[2]),
      l: parseFloat(k[3]),
      c: parseFloat(k[4]),
      v: parseFloat(k[5])
    }));
  }

  /**
   * Fetch the full universe. Returns { symbol → candles[] }.
   * Symbols that fail are dropped (and reported via onLog).
   */
  async fetchAllHistory(interval, limit, onLog) {
    const out = {};
    for (const sym of this.universe) {
      try {
        out[sym] = await this.fetchKlines(sym, interval, limit);
        if (onLog) onLog(`✓ ${sym}  ${out[sym].length} candles`);
      } catch (e) {
        if (onLog) onLog(`✗ ${sym}  ${e.message}`);
      }
    }
    return out;
  }

  /**
   * Fetch a live 24h snapshot for the universe (for live mode).
   * Returns { symbol → { priceChangePct, lastPrice, volume, highPrice, lowPrice } }
   */
  async fetchLive() {
    const host = await this._resolveHost();
    const r = await fetch(`${host}/api/v3/ticker/24hr`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`live ticker: HTTP ${r.status}`);
    const all = await r.json();
    const want = new Set(this.universe);
    const out = {};
    for (const row of all) {
      if (!want.has(row.symbol)) continue;
      out[row.symbol] = {
        priceChangePct: parseFloat(row.priceChangePercent),
        lastPrice:      parseFloat(row.lastPrice),
        volume:         parseFloat(row.quoteVolume),
        highPrice:      parseFloat(row.highPrice),
        lowPrice:       parseFloat(row.lowPrice)
      };
    }
    return out;
  }

  // ── MEASUREMENT → SIGNAL ────────────────────────────────────────
  /**
   * Translate a window of candles ending at index `idx` into the three
   * swarm signals. This is the core mapping — markets → biology.
   *
   *   momentum  : tanh-scaled return over lookback        → belief target
   *   volatility: mean candle range over lookback         → trust target
   *   drawdown  : drop from rolling high over lookback     → grief
   */
  static buildMeasurement(candles, idx, lookback = 6) {
    const lo = Math.max(0, idx - lookback);
    const cur = candles[idx];
    const past = candles[lo];

    // Momentum — directional lean, -1..1. Gain tuned so beliefs use the
    // full range: a ~10% move over the window pushes belief past 0.8,
    // which is what the swarm's cascade metrics are calibrated against.
    const ret = past.c > 0 ? (cur.c - past.c) / past.c : 0;
    const momentum = Math.tanh(ret * 14);

    // Volatility — average intracandle range over the window
    let volSum = 0, n = 0;
    for (let i = lo; i <= idx; i++) {
      if (candles[i].c > 0) { volSum += (candles[i].h - candles[i].l) / candles[i].c; n++; }
    }
    const volatility = n ? volSum / n : 0;

    // Drawdown — how far below the window's high we are
    let hi = 0;
    for (let i = lo; i <= idx; i++) hi = Math.max(hi, candles[i].h);
    const drawdown = hi > 0 ? Math.max(0, (hi - cur.c) / hi) : 0;

    return { momentum, volatility, drawdown };
  }

  /**
   * Re-anchor agent BELIEF toward real momentum.
   *
   * This must run AFTER every advanceStep — the engine's updateBelief()
   * recomputes belief from neighbours each tick, so a one-shot anchor is
   * immediately washed out. Reality has to tug continuously: the engine
   * does the contagion, this pulls the result back toward the market.
   */
  static anchorBelief(world, symbols, measurements, strength = 0.6) {
    for (let i = 0; i < world.agents.length; i++) {
      const agent = world.agents[i];
      if (agent.seppukuDone || agent.isSentinel) continue;
      const m = measurements[symbols[i]];
      if (!m) continue;
      const cur = agent.beliefState.current || 0;
      agent.beliefState.current = Math.max(-1, Math.min(1,
        cur + (m.momentum - cur) * strength
      ));
    }
  }

  /**
   * Apply a full measurement to the swarm — once per real candle.
   * Agent i mirrors universe symbol i.
   *
   *   belief ← momentum     (seed; kept alive by anchorBelief each tick)
   *   trust  ← stability    (volatile markets erode earned authority)
   *   grief  ← drawdown     (realized loss — persists, cascades via ST-2)
   *
   * Grief and trust are the load-bearing signals: they survive the tick
   * loop and the swarm AMPLIFIES them (grief ripple, crisis, sentinel).
   * That amplification is the emergent edge over raw price data.
   */
  static applyToWorld(world, symbols, measurements, anchor = 0.55) {
    let negMomentum = 0, live = 0;

    for (let i = 0; i < world.agents.length; i++) {
      const agent = world.agents[i];
      if (agent.seppukuDone || agent.isSentinel) continue;
      const m = measurements[symbols[i]];
      if (!m) continue;
      live++;

      // ── belief ← momentum (seed) ──
      const cur = agent.beliefState.current || 0;
      agent.beliefState.current = Math.max(-1, Math.min(1,
        cur + (m.momentum - cur) * anchor
      ));

      // ── trust ← stability (gentle slope, floor 0.2) ──
      const trustTarget = Math.max(0.2, Math.min(1, 1 - m.volatility * 3));
      agent.updateTrust((trustTarget - agent.trustCharge) * anchor);

      // ── grief ← rising drawdown ──
      const prev = agent._prevDrawdown || 0;
      const dDraw = m.drawdown - prev;
      if (dDraw > 0) agent.updateGrief(dDraw * 1.4);     // losing ground hurts
      else           agent.updateGrief(dDraw * 0.3);     // recovering heals slow
      agent._prevDrawdown = m.drawdown;

      if (m.momentum < 0) negMomentum++;
    }

    // ── market-wide bear event → collective grief pulse ──
    // When most of the market is falling at once, everyone feels it —
    // a shared shock the swarm then amplifies through the grief ripple.
    if (live > 0) {
      const bearShare = negMomentum / live;
      if (bearShare > 0.65) {
        const pulse = (bearShare - 0.65) * 0.12;
        for (const agent of world.agents) {
          if (!agent.seppukuDone && !agent.isSentinel) agent.updateGrief(pulse);
        }
      }
    }
  }
};
