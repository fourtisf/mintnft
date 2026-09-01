/**
 * The loop.
 *
 *   discover  -> candidate tokens from the profile feed
 *   enrich    -> deepest pair for each
 *   evaluate  -> gates, then score
 *   emit      -> anything that clears the threshold
 *
 * Discovery honesty: Dexscreener has no new-pool firehose. Profiles and boosts
 * together are what the free API offers, and both still miss the pools that are
 * minutes old — which is where the best signals are.
 * For real coverage, feed candidates in from a pool-creation watcher
 * (Helius/Geyser on Solana, logs on EVM) and let this engine do the judging.
 */
import { Dexscreener } from "./dexscreener.js";
import { evaluate, toSignal, CONFIG } from "./rules.js";
import { ProfileSource, BoostSource, MergedSource } from "./sources.js";
import { ChainInspector, chainVerdict } from "./chain.js";

export class Engine {
  constructor({ client, cfg = CONFIG, onSignal, onReject, onScan, source, callerId = 1,
                sourceKind = "screener", inspector, log = console.log } = {}) {
    this.api = client ?? new Dexscreener({ log });
    // Profiles alone are close to a fixed list; boosts turn over. Both are the
    // free API and neither needs a key. Real coverage still wants a pool-
    // creation watcher — Helius on Solana, factory logs on EVM, both in
    // sources.js waiting for keys.
    this.source = source ?? new MergedSource([
      new ProfileSource(this.api), new BoostSource(this.api),
    ]);
    this.cfg = cfg;
    this.attribution = { callerId, sourceKind };
    this.onSignal = onSignal ?? (s => log("SIGNAL", s));
    this.onReject = onReject ?? (() => {});
    this.onScan = onScan ?? (() => {});
    // Reads mint and freeze authority, holder concentration and LP burn. With
    // no RPC configured it returns null for every token and every chain gate
    // abstains, so the engine behaves exactly as it did before this existed.
    this.inspector = inspector ?? new ChainInspector({ log });
    // Logged either way. A line only on failure means a working key produces
    // no line at all, and nobody can read that out of a log — the four stale
    // "idle" lines from an earlier boot are still sitting there above it.
    log(this.inspector.summary
      ? `[chain] ${this.inspector.summary()}` + (this.inspector.configured ? "" : ", calls will record chainChecks: null")
      : "[chain] inspector supplied by the caller");
    this.seen = new Map();
    this.log = log;
    this.stats = { scanned: 0, vetoed: 0, scoredLow: 0, chainVetoed: 0, fired: 0 };
  }

  candidates() { return this.source.candidates(); }

  async tick() {
    const pairs = await this.candidates();
    // Reported once per tick rather than per candidate: the count is what the
    // pass rate needs, and a denominator nobody publishes is the thing this
    // whole page exists to avoid.
    this.onScan(pairs.length);
    for (const pair of pairs) {
      this.stats.scanned++;
      const ev = evaluate(pair, this.cfg, this.seen);
      if (ev.vetoes.length) { this.stats.vetoed++; this.onReject(pair, ev); continue; }
      if (!ev.fire) { this.stats.scoredLow++; this.onReject(pair, ev); continue; }

      // Last, and only for a candidate that already cleared everything free.
      // An RPC round trip per scanned token would burn the rate limit on the
      // hundreds we were always going to refuse.
      const report = await this.inspector.inspect(pair);
      const chain = chainVerdict(report, this.cfg);
      if (chain.vetoes.length) {
        this.stats.chainVetoed++;
        // Reported as a veto like any other so it lands in Triage with its
        // sentence attached: "refused, and here is the fact that refused it".
        this.onReject(pair, { ...ev, fire: false, vetoes: chain.vetoes, vetoIds: chain.vetoIds });
        continue;
      }

      this.seen.set(ev.key, Date.now());
      this.stats.fired++;
      // Awaited: the call has to be durably written before the next candidate
      // is judged, and before anything publishes it.
      await this.onSignal(toSignal(pair, ev, { ...this.attribution, chainChecks: report }));
    }
    return this.stats;
  }

  async watch(intervalMs = 60_000) {
    for (;;) {
      try { await this.tick(); }
      catch (e) { this.log("tick failed", String(e)); }
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }
}
