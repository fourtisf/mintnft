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
