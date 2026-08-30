/**
 * The loop.
 *
 *   discover  -> candidate tokens from the profile feed
 *   enrich    -> deepest pair for each
 *   evaluate  -> gates, then score
 *   emit      -> anything that clears the threshold
 *
 * Discovery honesty: Dexscreener has no new-pool firehose. /token-profiles
 * only surfaces tokens whose team filled in a profile, so this misses plenty.
 * For real coverage, feed candidates in from a pool-creation watcher
 * (Helius/Geyser on Solana, logs on EVM) and let this engine do the judging.
 */
import { Dexscreener } from "./dexscreener.js";
import { evaluate, toSignal, CONFIG } from "./rules.js";
import { ProfileSource } from "./sources.js";

export class Engine {
  constructor({ client, cfg = CONFIG, onSignal, onReject, source, callerId = 1,
                sourceKind = "screener", log = console.log } = {}) {
    this.api = client ?? new Dexscreener({ log });
    this.source = source ?? new ProfileSource(this.api);
    this.cfg = cfg;
    this.attribution = { callerId, sourceKind };
    this.onSignal = onSignal ?? (s => log("SIGNAL", s));
    this.onReject = onReject ?? (() => {});
    this.seen = new Map();
    this.log = log;
    this.stats = { scanned: 0, vetoed: 0, scoredLow: 0, fired: 0 };
  }

  candidates() { return this.source.candidates(); }

  async tick() {
    const pairs = await this.candidates();
    for (const pair of pairs) {
      this.stats.scanned++;
      const ev = evaluate(pair, this.cfg, this.seen);
      if (ev.vetoes.length) { this.stats.vetoed++; this.onReject(pair, ev); continue; }
      if (!ev.fire) { this.stats.scoredLow++; this.onReject(pair, ev); continue; }
      this.seen.set(ev.key, Date.now());
      this.stats.fired++;
      this.onSignal(toSignal(pair, ev, this.attribution));
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
