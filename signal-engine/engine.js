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
import { ProfileSource, BoostSource, HeliusSource, EvmFactorySource, PonsSource,
         MergedSource } from "./sources.js";

/* Only what is known. BSC is absent on purpose: PancakeSwap v3 is the pool
   that matters there and its factory is not Uniswap's, so writing a plausible
   address in would be the same bug in a new place. */
const UNISWAP_V3_FACTORY = {
  base: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
  ethereum: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
};
import { ChainInspector, chainVerdict } from "./chain.js";

export class Engine {
  constructor({ client, cfg = CONFIG, onSignal, onReject, onScan, source, callerId = 1,
                sourceKind = "screener", inspector, log = console.log } = {}) {
    this.api = client ?? new Dexscreener({ log });
    // Profiles alone are close to a fixed list; boosts turn over. Both are the
    // free API, and both only ever see tokens whose team filed a profile —
    // which the best signals, in pools minutes old, have not.
    //
    // A pool watcher is added when its key is there, and only then: an idle
    // source would log its own absence on every tick. It is additive, and that
    // is the whole safety argument for turning it on without measuring first —
    // the gates are untouched, so a wider net can only mean more candidates
    // refused, never a looser filter. Whether the extra ones are worth the key
    // is a question for /api/triage after a few hours, not for this comment.
    // The factory address is per chain, and it used to not be: every watcher
    // took the constructor default, which is Uniswap v3 on Base. So an
    // ETH_RPC or BSC_RPC watcher scanned an address that is not the factory
    // there, returned nothing for ever, and still printed its name in the
    // discovery line — a source that cannot work, reading exactly like a
    // source finding nothing. A chain whose factory is not written down here
    // is left out and says so, which is the same rule the RPCs already follow.
    const watchers = [];
    if (process.env.HELIUS_KEY?.trim()) watchers.push(new HeliusSource(this.api, { log }));
    for (const [chain, env] of [["base", "BASE_RPC"], ["ethereum", "ETH_RPC"], ["bsc", "BSC_RPC"]]) {
      if (!process.env[env]?.trim()) continue;
      const factory = UNISWAP_V3_FACTORY[chain];
      if (!factory) { log(`[discovery] ${env} is set but no factory address is recorded for ${chain} — watcher left out`); continue; }
      watchers.push(new EvmFactorySource(this.api, { chain, factory, rpc: process.env[env].trim(), log }));
    }
    if (process.env.ROBINHOOD_RPC?.trim()) watchers.push(new PonsSource(this.api, { log }));

    this.source = source ?? new MergedSource([
      new ProfileSource(this.api), new BoostSource(this.api), ...watchers,
    ]);
    if (!source)
      log(`[discovery] ${this.source.sources.map(s => s.name).join(", ")}`);
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
    // A pass that overran its interval must not have the next one stack behind
    // it: a provider answering slowly would otherwise turn into an unbounded
    // pile of in-flight passes, all of them scanning the same candidates.
    if (this.ticking) { this.log("[discovery] previous pass still running, skipping this one"); return this.stats; }
    this.ticking = true;
    try { return await this.#tick(); } finally { this.ticking = false; }
  }

  async #tick() {
    let pairs;
    // A discovery pass that throws still has to report that it ran. Reporting
    // nothing leaves the source absent from Triage, which reads as a quiet
    // market rather than as a source that failed.
    try { pairs = await this.candidates(); }
    catch (e) {
      this.onScan(0, [], [{ name: this.source.name ?? "source", got: 0, error: String(e?.message ?? e) }]);
      throw e;
    }
    // Reported once per tick rather than per candidate: the count is what the
    // pass rate needs, and a denominator nobody publishes is the thing this
    // whole page exists to avoid.
    this.onScan(pairs.length, pairs, this.source.lastRun ?? null);
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
      // sourceRef is inside the hash, so which source found a call cannot be
      // reattributed later — a source cannot be credited afterwards with a
      // winner it did not find.
      await this.onSignal(toSignal(pair, ev, {
        ...this.attribution, chainChecks: report,
        sourceRef: pair.discoveredBy ?? this.attribution.sourceRef ?? null,
      }));
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
