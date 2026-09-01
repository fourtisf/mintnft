/**
 * What the screener did, and what it refused.
 *
 * The Triage page publishes this. Until it existed the page carried numbers
 * from the design prototype's seed — 412 scanned, 325 killed — beside a real
 * count of signals fired, which is the worst possible mix: invented telemetry
 * on a site whose whole claim is that its numbers can be checked.
 *
 * Counters are hourly buckets rather than an event log. A day at thirty
 * candidates a minute is forty thousand events; twenty-four buckets is the
 * same answer for a few hundred bytes, and it rolls without a sweep.
 */

const HOURS = 24;
const REJECTS_KEPT = 40;

const hourOf = t => Math.floor(t / 3600e3);

export class Triage {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.buckets = new Map();   // hour -> counts
    this.rejects = [];          // most recent first
    this.scores = [];           // scores of candidates that cleared every gate
    this.startedAt = now();
  }

  #bucket() {
    const h = hourOf(this.now());
    let b = this.buckets.get(h);
    if (!b) {
      b = { scanned: 0, killed: 0, scoredLow: 0, fired: 0, gates: {}, sources: {} };
      this.buckets.set(h, b);
      // Drop anything that has aged out. Cheap: at most a handful per hour.
      for (const k of this.buckets.keys()) if (k <= h - HOURS) this.buckets.delete(k);
    }
    return b;
  }

  /**
   * Candidates seen, and where they came from.
   *
   * Per-source counts exist so that turning on a pool watcher is answerable
   * rather than an act of faith: a source that doubles the candidates and
   * never produces one that clears a gate is a source that is costing a key
   * for nothing, and only these two numbers together can say so.
   */
  scanned(n = 1, pairs = null) {
    const b = this.#bucket();
    b.scanned += n;
    for (const p of pairs ?? []) {
      const k = p?.discoveredBy ?? "unattributed";
      (b.sources[k] ??= { scanned: 0, fired: 0 }).scanned++;
    }
  }
  fired(source = null) {
    const b = this.#bucket();
    b.fired += 1;
    (b.sources[source ?? "unattributed"] ??= { scanned: 0, fired: 0 }).fired++;
  }

  /** A candidate the screener refused, and the gate that refused it. */
  rejected(pair, ev) {
    const b = this.#bucket();
    let gate = ev.vetoIds?.[0] ?? null;
    // The liquidity gate reads a missing field as zero, so "too thin" and "the
    // provider sent no figure" land in the same bucket and look like the same
    // problem. They are not: one is a market judgement, the other is a hole in
    // the data, and only one of them is an argument for moving the threshold.
    if (gate === "liquidity_floor" && pair?.liquidity?.usd == null) gate = "liquidity_missing";
    if (ev.vetoes?.length) {
      b.killed += 1;
      if (gate) b.gates[gate] = (b.gates[gate] ?? 0) + 1;
    } else {
      b.scoredLow += 1;
      b.gates.score = (b.gates.score ?? 0) + 1;
      // How close the ones that cleared every gate actually came. Without this
      // a threshold argument is a guess: candidates clustered at 74 and
      // candidates clustered at 40 look identical from the counts alone.
      this.scores.push({ at: this.now(), score: ev.score });
      if (this.scores.length > 500) this.scores.shift();
    }
    this.rejects.unshift({
      at: this.now(),
      symbol: pair?.baseToken?.symbol ?? "?",
      chain: pair?.chainId ?? "?",
      // The gate's own sentence. Rewriting it here would let the page and the
      // filter drift apart, which is the failure this endpoint exists to stop.
      why: ev.vetoes?.[0] ?? `Cleared the gates but only scored ${ev.score}/100`,
      gate: gate ?? "score",
    });
    if (this.rejects.length > REJECTS_KEPT) this.rejects.length = REJECTS_KEPT;
  }

  /** Totals across the retained window, plus the gates doing the killing. */
  snapshot() {
    const cut = hourOf(this.now()) - HOURS;
    const t = { scanned: 0, killed: 0, scoredLow: 0, fired: 0 };
    const gates = {}, sources = {};
    for (const [h, b] of this.buckets) {
      if (h <= cut) continue;
      t.scanned += b.scanned; t.killed += b.killed;
      t.scoredLow += b.scoredLow; t.fired += b.fired;
      for (const [g, n] of Object.entries(b.gates)) gates[g] = (gates[g] ?? 0) + n;
      for (const [src, c] of Object.entries(b.sources ?? {})) {
        const to = (sources[src] ??= { scanned: 0, fired: 0 });
        to.scanned += c.scanned; to.fired += c.fired;
      }
    }
    const cutMs = this.now() - HOURS * 3600e3;
    const recent = this.scores.filter(s => s.at >= cutMs).map(s => s.score);
    const band = { "0-40": 0, "40-55": 0, "55-65": 0, "65-70": 0, "70-75": 0, "75+": 0 };
    for (const v of recent) {
      if (v < 40) band["0-40"]++;
      else if (v < 55) band["40-55"]++;
      else if (v < 65) band["55-65"]++;
      else if (v < 70) band["65-70"]++;
      else if (v < 75) band["70-75"]++;
      else band["75+"]++;
    }
    return {
      ...t,
      // Only for candidates that passed every gate — the population a
      // threshold decision is actually about.
      clearedScores: {
        n: recent.length,
        best: recent.length ? Math.max(...recent) : null,
        median: recent.length ? recent.slice().sort((a, b) => a - b)[Math.floor(recent.length / 2)] : null,
        bands: band,
      },
      // Undefined rather than 0: a pass rate over nothing scanned is not zero,
      // it is unanswerable, and the page should say so rather than print 0.0%.
      passRate: t.scanned ? t.fired / t.scanned : null,
      gates: Object.entries(gates).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, n })),
      // Which source is earning its keys. passRate is null rather than 0 for a
      // source that produced nothing: no candidates is not a pass rate of zero.
      sources: Object.entries(sources)
        .sort((a, b) => b[1].scanned - a[1].scanned)
        .map(([id, c]) => ({ id, ...c, passRate: c.scanned ? c.fired / c.scanned : null })),
      rejects: this.rejects,
      windowHours: HOURS,
      startedAt: this.startedAt,
    };
  }
}
