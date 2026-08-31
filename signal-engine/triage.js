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
    this.startedAt = now();
  }

  #bucket() {
    const h = hourOf(this.now());
    let b = this.buckets.get(h);
    if (!b) {
      b = { scanned: 0, killed: 0, scoredLow: 0, fired: 0, gates: {} };
      this.buckets.set(h, b);
      // Drop anything that has aged out. Cheap: at most a handful per hour.
      for (const k of this.buckets.keys()) if (k <= h - HOURS) this.buckets.delete(k);
    }
    return b;
  }

  scanned(n = 1) { this.#bucket().scanned += n; }
  fired() { this.#bucket().fired += 1; }

  /** A candidate the screener refused, and the gate that refused it. */
  rejected(pair, ev) {
    const b = this.#bucket();
    const gate = ev.vetoIds?.[0] ?? null;
    if (ev.vetoes?.length) {
      b.killed += 1;
      if (gate) b.gates[gate] = (b.gates[gate] ?? 0) + 1;
    } else {
      b.scoredLow += 1;
      b.gates.score = (b.gates.score ?? 0) + 1;
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
    const gates = {};
    for (const [h, b] of this.buckets) {
      if (h <= cut) continue;
      t.scanned += b.scanned; t.killed += b.killed;
      t.scoredLow += b.scoredLow; t.fired += b.fired;
      for (const [g, n] of Object.entries(b.gates)) gates[g] = (gates[g] ?? 0) + n;
    }
    return {
      ...t,
      // Undefined rather than 0: a pass rate over nothing scanned is not zero,
      // it is unanswerable, and the page should say so rather than print 0.0%.
      passRate: t.scanned ? t.fired / t.scanned : null,
      gates: Object.entries(gates).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, n })),
      rejects: this.rejects,
      windowHours: HOURS,
      startedAt: this.startedAt,
    };
  }
}
