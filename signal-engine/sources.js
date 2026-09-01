/**
 * Candidate sources.
 *
 * The screener judges; these decide what it gets to look at. That matters more
 * than the rules do — a filter can only be as good as the pool it sees.
 *
 * Dexscreener's /token-profiles endpoint is the default and it is weak: it only
 * surfaces tokens whose team filled in a profile. The best signals come from
 * pools minutes old that have no profile at all, and those are invisible to it.
 *
 * PoolWatcher fixes that by listening for pool creation directly and handing
 * the addresses over. Same rules, far better coverage.
 */

/** Default. Works with no keys, misses a lot. */
export class ProfileSource {
  constructor(api) { this.api = api; this.name = "dexscreener-profiles"; }
  async candidates() {
    const list = await this.api.latestProfiles();
    const out = [];
    for (const p of Array.isArray(list) ? list : []) {
      if (!p.chainId || !p.tokenAddress) continue;
      const pairs = await this.api.pairsForToken(p.chainId, p.tokenAddress);
      if (pairs.length) out.push(pairs[0]);
    }
    return out;
  }
}

/**
 * Solana pool creation via Helius. Set HELIUS_KEY.
 *
 * Two ways to run it:
 *   webhook  — Helius posts to you. Lowest latency, needs a public URL.
 *   poll     — this class, using the enhanced transactions endpoint.
 *
 * The webhook is what you want in production; polling is here so the pipeline
 * works before any infrastructure exists.
 */
export class HeliusSource {
  constructor(api, { key = process.env.HELIUS_KEY, fetchImpl = globalThis.fetch,
                     programs = ["675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",  // Raydium AMM v4
                                 "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"], // pump.fun
                     log = console.log } = {}) {
    this.api = api; this.key = key; this.fetch = fetchImpl;
    this.programs = programs; this.log = log; this.name = "helius-pools";
    this.seen = new Set();
  }

  async newMints() {
    if (!this.key) { this.log("[helius] no HELIUS_KEY, source idle"); return []; }
    const mints = [];
    for (const program of this.programs) {
      const url = `https://api.helius.xyz/v0/addresses/${program}/transactions`
                + `?api-key=${this.key}&type=CREATE_POOL&limit=50`;
      try {
        const r = await this.fetch(url);
        if (!r.ok) { this.log("[helius]", r.status); continue; }
        for (const tx of await r.json()) {
          for (const t of tx.tokenTransfers ?? []) {
            const m = t.mint;
            if (m && !this.seen.has(m)) { this.seen.add(m); mints.push(m); }
          }
        }
      } catch (e) { this.log("[helius]", String(e)); }
    }
    if (this.seen.size > 8000) this.seen = new Set([...this.seen].slice(-4000));
    return mints;
  }

  /** New mints are worthless until they have a tradeable pool with numbers on
   *  it, so they still go through Dexscreener for pricing before scoring. */
  async candidates() {
    const mints = await this.newMints();
    if (!mints.length) return [];
    const pairs = await this.api.tokensBatch("solana", mints);
    const best = {};
    for (const p of pairs) {
      const a = p.baseToken?.address;
      if (!a) continue;
      if (!best[a] || (p.liquidity?.usd ?? 0) > (best[a].liquidity?.usd ?? 0)) best[a] = p;
    }
    return Object.values(best);
  }
}

/** EVM factory logs. Set an RPC per chain. Same shape as the others. */
export class EvmFactorySource {
  constructor(api, { chain = "base", rpc = process.env.BASE_RPC,
                     factory = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD", // Uniswap v3, Base
                     topic = "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118",
                     fetchImpl = globalThis.fetch, log = console.log } = {}) {
    Object.assign(this, { api, chain, rpc, factory, topic, fetch: fetchImpl, log });
    this.name = `evm-factory:${chain}`;
    this.from = null;
  }

  async candidates() {
    if (!this.rpc) { this.log(`[${this.name}] no RPC configured, source idle`); return []; }
    try {
      const head = await this.#rpc("eth_blockNumber", []);
      const to = parseInt(head, 16);
      const from = this.from ?? to - 200;
      this.from = to + 1;
      const logs = await this.#rpc("eth_getLogs", [{
        address: this.factory, topics: [this.topic],
        fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16),
      }]);
      const tokens = new Set();
      for (const l of logs ?? []) {
        // token0 and token1 are indexed; take both and let the gates sort it out
        for (const t of (l.topics ?? []).slice(1, 3))
          tokens.add("0x" + t.slice(26));
      }
      if (!tokens.size) return [];
      const pairs = await this.api.tokensBatch(this.chain, [...tokens]);
      return pairs.filter(p => (p.liquidity?.usd ?? 0) > 0);
    } catch (e) { this.log(`[${this.name}]`, String(e)); return []; }
  }

  async #rpc(method, params) {
    const r = await this.fetch(this.rpc, { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    return (await r.json()).result;
  }
}

/**
 * Boosted tokens, from the same free API as the profile feed.
 *
 * The profile feed returns the latest profiles, which is close to a fixed list
 * — the same thirty tokens on every poll until a team files a new one. An
 * engine reading only that scans the same candidates for hours and fires
 * nothing, which is indistinguishable from a broken filter.
 *
 * Boosts turn over faster and select differently: someone paid for attention
 * rather than filled in a form. Being paid for is not a quality signal and is
 * not treated as one — the gates are unchanged, this only widens what they get
 * to refuse.
 */
export class BoostSource {
  constructor(api) { this.api = api; this.name = "dexscreener-boosts"; }
  async candidates() {
    const seen = new Set(), out = [];
    for (const call of [() => this.api.latestBoosts(), () => this.api.topBoosts()]) {
      let list = [];
      try { list = await call(); } catch { continue; }
      for (const b of Array.isArray(list) ? list : []) {
        if (!b.chainId || !b.tokenAddress) continue;
        const key = `${b.chainId}:${b.tokenAddress}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const pairs = await this.api.pairsForToken(b.chainId, b.tokenAddress);
        if (pairs.length) out.push(pairs[0]);
      }
    }
    return out;
  }
}

/**
 * Runs several sources and merges, dropping duplicate tokens.
 *
 * Each candidate is tagged with the source that produced it, and the first
 * source to produce it wins the tag — so a token both the profile feed and a
 * pool watcher see is credited to whichever saw it first, which is the only
 * comparison worth making between them. Without this, adding a source is an
 * act of faith: candidate counts go up, and nobody can say whether the extra
 * ones ever cleared a gate.
 */
export class MergedSource {
  constructor(sources) { this.sources = sources; this.name = "merged"; }
  async candidates() {
    const seen = new Set(), out = [];
    for (const s of this.sources) {
      let got = [];
      try { got = await s.candidates(); } catch { got = []; }
      for (const p of got) {
        const k = `${p.chainId}:${p.baseToken?.address}`;
        if (!seen.has(k)) { seen.add(k); out.push({ ...p, discoveredBy: s.name }); }
      }
    }
    return out;
  }
}
