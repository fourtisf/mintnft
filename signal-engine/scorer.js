/**
 * The scorer. Turns price observations into verdicts.
 *
 * IMPORTANT, and it changes what the methodology page may claim:
 * the Dexscreener API returns no OHLCV candles — only current price and
 * percentage changes. So peak cannot be "the highest 1-minute candle high".
 * It can only be the highest value this service actually observed.
 *
 * That is recorded honestly as peakSource:"observed", and the poll interval
 * bounds the error: at 20s polling a spike lasting under 20s can be missed.
 * Plug a CandleSource in (GeckoTerminal publishes free OHLCV) to upgrade to
 * peakSource:"candle" and a peak anyone can independently recompute.
 */
export const RULES = {
  winMultiple: 2.0,
  deadFraction: 0.10,
  liveHours: 24,
};

export function applyObservation(call, mark, nowMc, at = Date.now(), rules = RULES) {
  const m = { ...mark };
  const iso = new Date(at).toISOString();

  m.nowMc = nowMc;
  m.nowX = nowMc / call.entryMc;
  m.samples = (m.samples ?? 0) + 1;
  m.updatedAt = iso;

  const settled = at - Date.parse(call.firedAt) > rules.liveHours * 3600e3;

  // Two peaks, deliberately.
  //
  //   peakMc     highest inside the 24h scoring window. The verdict uses this,
  //              so a call is judged on whether it worked while it was live.
  //   peakAllMc  highest ever seen. Kept for the record, never scored — a
  //              token that 10x'd on day nine was not a tradeable signal.
  //
  // Without the split, "now" could sit above "peak" on a settled call that
  // kept climbing, which reads as a bug even though both numbers are true.
  if (nowMc > (m.peakAllMc ?? 0)) {
    m.peakAllMc = nowMc;
    m.peakAllX = nowMc / call.entryMc;
    m.peakAllAt = iso;
  }
  if (!settled && nowMc > m.peakMc) {
    m.peakMc = nowMc;
    m.peakAt = iso;
    m.peakX = nowMc / call.entryMc;
    if (m.peakX >= rules.winMultiple && !m.firstTwoXAt) {
      m.firstTwoXAt = iso;
      m.secondsTo2x = Math.round((at - Date.parse(call.firedAt)) / 1000);
    }
  }

  // Dead is orthogonal to the verdict. A win can go dead later and the
  // register shows both marks rather than replacing one with the other.
  if (!m.isDead && nowMc < call.entryMc * rules.deadFraction) {
    m.isDead = true;
    m.deadAt = iso;
  }

  m.state = settled ? "settled" : "live";
  if (settled && !m.settledAt) m.settledAt = iso;
  m.verdict = m.peakX >= rules.winMultiple ? "win" : (m.state === "live" ? "open" : "miss");
  return m;
}

/** Every published number comes from here. Misses never leave the denominator. */
export function stats(rows, windowDays = 7) {
  const cut = Date.now() - windowDays * 864e5;
  const w = rows.filter(r => Date.parse(r.firedAt) > cut);
  if (!w.length) return { calls: 0, wins: 0, hitRate: 0, medianPeak: 0, bestPeak: 0, dead: 0, live: 0 };
  const xs = w.map(r => r.peakX).sort((a, b) => a - b);
  const mid = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
  const wins = w.filter(r => r.verdict === "win").length;
  return {
    calls: w.length, wins, hitRate: wins / w.length,
    medianPeak: mid, bestPeak: xs[xs.length - 1],
    dead: w.filter(r => r.isDead).length,
    live: w.filter(r => r.state === "live").length,
  };
}
