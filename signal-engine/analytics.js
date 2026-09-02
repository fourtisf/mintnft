/**
 * Reason attribution — the feature that makes the screener improvable.
 *
 * Every call stores which rules fired it. Once a few hundred calls have
 * settled, this asks the only question that matters: which reasons actually
 * produce winners, and which ones are noise we have been paying attention to
 * for no reason.
 *
 * Lift is the number to read. 1.0 means the reason tells you nothing beyond
 * the base rate. Below 1.0 means calls carrying it do worse than average.
 */
export function reasonPerformance(rows, { minSample = 5 } = {}) {
  const settled = rows.filter(r => r.state === "settled");
  if (!settled.length) return { base: 0, total: 0, reasons: [] };

  const base = settled.filter(r => r.verdict === "win").length / settled.length;
  const bucket = {};

  for (const r of settled) {
    for (const id of r.reasonIds ?? []) {
      const b = (bucket[id] ??= { id, n: 0, wins: 0, peaks: [], dead: 0 });
      b.n++;
      if (r.verdict === "win") b.wins++;
      if (r.isDead) b.dead++;
      b.peaks.push(r.peakX);
    }
  }

  const reasons = Object.values(bucket)
    .filter(b => b.n >= minSample)
    .map(b => {
      const sorted = b.peaks.sort((x, y) => x - y);
      const median = sorted.length % 2
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
      const hit = b.wins / b.n;
      return { id: b.id, n: b.n, hitRate: hit, lift: base ? hit / base : 0,
               medianPeak: median, deadRate: b.dead / b.n };
    })
    .sort((a, b) => b.lift - a.lift);

  return { base, total: settled.length, reasons };
}

/** Same question asked of the score bands, to check the threshold is set right. */
export function scoreBands(rows, width = 10) {
  const settled = rows.filter(r => r.state === "settled");
  const bands = {};
  for (const r of settled) {
    const lo = Math.floor((r.score ?? 0) / width) * width;
    const b = (bands[lo] ??= { lo, hi: lo + width, n: 0, wins: 0 });
    b.n++;
    if (r.verdict === "win") b.wins++;
  }
  return Object.values(bands).sort((a, b) => a.lo - b.lo)
    .map(b => ({ ...b, hitRate: b.n ? b.wins / b.n : 0 }));
}

/** Per-chain breakdown. Misses stay in the denominator, as everywhere else. */
/**
 * Per desk. The register is multi-caller from day one and this is what ranks
 * them; misses stay in the denominator here as everywhere else.
 */
/**
 * What an exit rule would actually have returned.
 *
 * Peak is a ceiling nobody sells at: a register can show a 56% hit rate on
 * peaks while the calls behind it are worth a tenth of entry today. This is
 * the other number — the one a reader is really asking for — and it lived only
 * in the browser, computed over whatever rows the page happened to hold.
 *
 * Costs are a round trip: slippage and fees both ways on a memecoin pair are
 * not a rounding error at this size.
 */
export const ROUND_TRIP_COST = 0.05;

export const TRAIL_DROP = 0.25;

/**
 * A trailing stop, walked forward over the prices that were actually observed.
 *
 * It used to return max(now, peak * 0.75): three quarters of the highest value
 * ever seen, credited on every call whether or not the price ever passed
 * through that level on the way down. On a register whose average peak is 7x
 * that turned a losing set of calls into +426%, on the page whose own subtitle
 * says peak is a ceiling nobody sold at.
 *
 * The peak is now only known as it happens. The stop starts at entry, follows
 * the running high, and fills at the first observed sample at or below it —
 * which also means losers are stopped out near -25% instead of running to zero,
 * because that is what a trailing stop does.
 *
 * Two honest limits. The series is sampled, not continuous, so a token that
 * spiked and collapsed between two polls offers an exit here that nobody could
 * have taken; and the fill is the sample we saw, with no slippage, on pairs
 * where the exit itself moves the price. This is an upper bound on a trailing
 * stop, not a backtest of one.
 */
export function trailExit(row, drop = TRAIL_DROP) {
  const now = row.nowX ?? 1;
  const entry = row.entryMc;
  const path = Array.isArray(row.spark) ? row.spark : null;
  // No series, no simulation. An exit we cannot evidence is never credited.
  if (!entry || !path || path.length < 2) return { x: now, simulated: false };

  let high = 1;
  for (const mc of path) {
    const x = mc / entry;
    if (x > high) high = x;
    if (x <= high * (1 - drop)) return { x, simulated: true };
  }
  return { x: now, simulated: true };            // never stopped out; still held
}

export function exitMultiple(row, rule = "2x") {
  const peak = row.peakX ?? 1, now = row.nowX ?? 1;
  if (rule === "hold") return now;
  if (rule === "2x") return peak >= 2 ? 2 : now;
  if (rule === "1.5x") return peak >= 1.5 ? 1.5 : now;
  return trailExit(row).x;
}

/** One call, one unit staked, after costs. Negative is a loss and says so. */
export const realised = (row, rule = "2x", cost = ROUND_TRIP_COST) =>
  exitMultiple(row, rule) * (1 - cost) - 1;

export function exitSimulation(rows, { rule = "2x", size = 100, cost = ROUND_TRIP_COST } = {}) {
  const order = [...rows].sort((a, b) => Date.parse(a.firedAt) - Date.parse(b.firedAt));
  let eq = 0, high = 0, drawdown = 0, wins = 0, simulated = 0;
  const curve = [0];
  for (const r of order) {
    // The trailing stop is the only rule that needs a price series, and it is
    // the only one that can fail to have one. Counted, so the page can say on
    // how many calls the exit was actually walked rather than assumed.
    if (rule === "trail" && trailExit(r).simulated) simulated++;
    const net = size * realised(r, rule, cost);
    if (net > 0) wins++;
    eq += net;
    curve.push(eq);
    if (eq > high) high = eq;
    if (high - eq > drawdown) drawdown = high - eq;
  }
  const invested = size * order.length;
  return {
    rule, size, cost, n: order.length, wins, invested,
    // For every other rule the question does not arise, so it is not answered.
    simulated: rule === "trail" ? simulated : null,
    result: eq, drawdown, returnPct: invested ? eq / invested : 0,
    avgPeak: order.length ? order.reduce((a, r) => a + (r.peakX ?? 1), 0) / order.length : 0,
    curve,
  };
}

const median = xs => {
  const s = xs.slice().sort((x, y) => x - y);
  if (!s.length) return 0;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export function callerPerformance(rows, { rule = "2x" } = {}) {
  const now = Date.now(), g = {};
  for (const r of rows) {
    const id = r.callerId ?? 1;
    const b = (g[id] ??= { callerId: id, n: 0, wins: 0, d7: 0, d30: 0,
                           peaks: [], nows: [], rets: [], chains: {}, rows: [] });
    const age = now - Date.parse(r.firedAt);
    b.n++;
    if (r.verdict === "win") b.wins++;
    if (age <= 7 * 864e5) b.d7++;
    if (age <= 30 * 864e5) b.d30++;
    b.peaks.push(r.peakX ?? 1);
    b.nows.push(r.nowX ?? 1);
    b.rets.push(realised(r, rule));
    b.chains[r.chain] = (b.chains[r.chain] ?? 0) + 1;
    b.rows.push(r);
  }
  return Object.values(g).map(b => ({
    callerId: b.callerId, n: b.n, wins: b.wins, hitRate: b.wins / b.n,
    d7: b.d7, d30: b.d30,
    medianPeak: median(b.peaks), medianNow: median(b.nows),
    returnPct: b.rets.reduce((x, y) => x + y, 0) / b.rets.length,
    topChain: Object.entries(b.chains).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null,
    // The last five, so a table can show a form line without shipping the rows.
    last: b.rows.sort((x, y) => Date.parse(y.firedAt) - Date.parse(x.firedAt)).slice(0, 5)
      .map(r => ({ verdict: r.verdict, isDead: !!r.isDead })),
  })).sort((x, y) => y.hitRate - x.hitRate || y.returnPct - x.returnPct);
}

export function chainPerformance(rows) {
  const g = {};
  for (const r of rows) {
    const b = (g[r.chain] ??= { chain: r.chain, n: 0, wins: 0, peaks: [] });
    b.n++; if (r.verdict === "win") b.wins++; b.peaks.push(r.peakX);
  }
  return Object.values(g).map(b => ({
    chain: b.chain, n: b.n, hitRate: b.wins / b.n,
    avgPeak: b.peaks.reduce((a, c) => a + c, 0) / b.peaks.length,
  })).sort((a, b) => b.hitRate - a.hitRate);
}
