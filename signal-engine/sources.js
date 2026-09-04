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

/**
 * A token trades in several pools; the deepest one is the market.
 *
 * Shared because every source needs it and each was doing it differently or,
 * worse, asking the provider once per token to find out.
 */
export const deepestPerToken = pairs => {
  const best = {};
  for (const p of pairs ?? []) {
    const a = p.baseToken?.address;
    if (!a) continue;
    if (!best[a] || (p.liquidity?.usd ?? 0) > (best[a].liquidity?.usd ?? 0)) best[a] = p;
  }
  return Object.values(best);
};

/**
 * Price a list of tokens in as few requests as the provider allows.
 *
 * One request per token is what this used to do, and thirty profiles meant
 * thirty requests fired back to back. Dexscreener answered them with 429s, so
 * every candidate came back empty and the engine scanned nothing at all while
 * looking, from the outside, like a market with nothing in it.
 *
 * /tokens/v1 takes thirty addresses at a time. Thirty requests become one.
 */
async function priceTokens(api, wanted, chains = null) {
  const byChain = {};
  let offChain = 0;
  for (const w of wanted) {
    if (!w?.chainId || !w?.tokenAddress) continue;
    // A token the chain gate is going to refuse still costs a batch request to
    // price, and these feeds are all-chain: narrowed to one chain, better than
    // nine in ten candidates are a request spent to learn nothing. Dropped
    // here rather than at the gate — and counted, because a candidate that
    // never reaches Triage is a candidate nobody can argue about later.
    // One spelling, for the filter and the batch alike. They disagreed: the
    // filter lower-cased and the grouping did not, so a provider that ever
    // wrote the chain differently would pass the filter and then be batched
    // twice under two names — two requests where the desk asked for one.
    const chain = String(w.chainId).toLowerCase();
    if (chains?.length && !chains.includes(chain)) { offChain++; continue; }
    (byChain[chain] ??= new Set()).add(w.tokenAddress);
  }
  const out = [];
  for (const [chain, set] of Object.entries(byChain))
    out.push(...deepestPerToken(await api.tokensBatch(chain, [...set])));
  out.offChain = offChain;
  return out;
}

/** Default. Works with no keys, misses a lot. */
export class ProfileSource {
  constructor(api, { chains = null } = {}) {
    this.api = api; this.chains = chains; this.name = "dexscreener-profiles";
  }
  /* null from the client means it could not be fetched — three attempts, then
     it gives up — and an empty array means the feed had nothing. Treating them
     the same is how a box with no DNS publishes `scanned: 0, errors: 0` and
     reads as a quiet market. They are not the same fact, so they no longer
     take the same path: MergedSource catches this, records it, and the other
     sources still run. */
  async candidates() {
    const list = await this.api.latestProfiles();
    if (list == null) throw new Error("dexscreener: the profile feed could not be reached");
    return priceTokens(this.api, Array.isArray(list) ? list : [], this.chains);
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
    // Named, not implied. Every watcher says which chain it watches so the
    // engine can leave one out that the desk does not fire on, and a source
    // whose chain is a fact buried in a string literal cannot be asked.
    this.chain = "solana";
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
    return deepestPerToken(await this.api.tokensBatch("solana", mints));
  }
}

/**
 * EVM factory logs. Set an RPC per chain.
 *
 * `tokenTopics` is which indexed slots hold a token address, and it is an
 * option rather than a constant because not every factory logs the same shape.
 * Uniswap's PoolCreated indexes token0 and token1, so both are taken and the
 * gates sort it out. A launchpad indexes the token it just minted and then the
 * deployer — reading slot 2 there would price a wallet as if it were a token,
 * spend a batch slot on it, and credit this source with a candidate that was
 * never one.
 */
export class EvmFactorySource {
  constructor(api, { chain = "base", rpc = process.env.BASE_RPC,
                     factory = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD", // Uniswap v3, Base
                     topic = "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118",
                     tokenTopics = [1, 2], name = null, lookback = 200,
                     fetchImpl = globalThis.fetch, log = console.log } = {}) {
    Object.assign(this, { api, chain, rpc, factory, topic, tokenTopics, lookback, fetch: fetchImpl, log });
    this.name = name ?? `evm-factory:${chain}`;
    this.from = null;
  }

  /**
   * Errors are not caught here, on purpose. They used to be: the RPC failing
   * returned an empty array, so a node that was down, rate-limiting or
   * refusing the block range produced `scanned: 0, errors: 0` — a source that
   * could not run, published as a source that ran and found nothing. That is
   * the one thing this codebase is not allowed to do. MergedSource already
   * catches per source, keeps the others running, and records the message, so
   * throwing is what makes the failure reach `/api/triage` at all.
   */
  async candidates() {
    if (!this.rpc) { this.log(`[${this.name}] no RPC configured, source idle`); return []; }
    const head = await this.#rpc("eth_blockNumber", []);
    const to = parseInt(head, 16);
    /* Only the first tick uses the lookback; after that it resumes from where
       it stopped, so the window is whatever elapsed and nothing is skipped.
       The default is sized for a chain with seconds-long blocks — on a Nitro
       chain 200 blocks is under a minute of history, which is a cold start
       that sees essentially nothing and reports it as nothing there. */
    const cold = this.from == null;
    const from = this.from ?? Math.max(0, to - this.lookback);
    this.from = to + 1;
    if (cold) this.log(`[${this.name}] first scan, blocks ${from}-${to}`);
    const logs = await this.#rpc("eth_getLogs", [{
      address: this.factory, topics: [this.topic],
      fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16),
    }]);
    const tokens = new Set();
    for (const l of logs ?? []) {
      for (const i of this.tokenTopics) {
        const t = l.topics?.[i];
        if (t) tokens.add("0x" + t.slice(26));
      }
    }
    if (!tokens.size) return [];
    const pairs = await this.api.tokensBatch(this.chain, [...tokens]);
    return pairs.filter(p => (p.liquidity?.usd ?? 0) > 0);
  }

  /* A JSON-RPC error is a 200 with an `error` member, so reading `.result` and
     moving on turned "range too wide" and "rate limited" into undefined, and
     undefined into an empty scan. Both are now what they are. */
  async #rpc(method, params) {
    const r = await this.fetch(this.rpc, { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    if (!r.ok) throw new Error(`${method}: HTTP ${r.status}`);
    const body = await r.json();
    if (body?.error) throw new Error(`${method}: ${body.error.message ?? JSON.stringify(body.error)}`);
    return body?.result;
  }
}

/* Pons, on Robinhood Chain. Both factories are verified on chain and their
   source is public at github.com/ponsdotdev/ponsfamily; the topic below is
   keccak of the V1 event signature as that repository's abi.json states it, not
   a value copied off a block explorer.

   V1 only, deliberately. A V1 launch mints a fixed supply straight into a
   Uniswap V3 pool, so it is tradeable — and priceable by Dexscreener — in the
   same transaction that creates it. A V2 launch opens on a bonding curve and
   only becomes a pool when it graduates, which around one in a hundred do; the
   token has no pair to read until then, and the age and liquidity gates would
   refuse it anyway. Adding V2 means watching for the graduation, not the
   launch, and that is a different event and a second source. */
export const PONS_V1_FACTORY = "0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB";
export const PONS_V2_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
export const PONS_TOKEN_LAUNCHED =
  "0xdb51ea9ad51ab453a65a4cb7e60c3cb378c9501bb002609f8f97778fb6c4235a";

/**
 * Every token Pons launches, from the factory's own logs.
 *
 * This is the one source that does not wait for a team to file a profile or
 * pay for a boost — the launch itself is the notification, and it arrives in
 * the block. That is the whole reason to point a desk at a launchpad, and it
 * is also why the gates matter more here than anywhere else: Pons has minted
 * six figures of tokens and roughly one in a hundred graduates, so the honest
 * expectation is that almost everything this source produces gets refused.
 * Refused candidates are the product working. `/api/triage` is where that
 * shows, per source, and it is the number to read before deciding this earns
 * its RPC.
 *
 * `TokenLaunched` indexes the token first, then the deployer, then the DEX
 * factory — so only slot 1 is a token, and the other two are addresses that
 * would come back from Dexscreener as nothing while still costing a lookup.
 */
export class PonsSource extends EvmFactorySource {
  constructor(api, opts = {}) {
    super(api, {
      chain: "robinhood",
      rpc: process.env.ROBINHOOD_RPC?.trim() || null,
      factory: PONS_V1_FACTORY,
      topic: PONS_TOKEN_LAUNCHED,
      tokenTopics: [1],
      /* Robinhood Chain is Arbitrum Nitro and its blocks are sub-second, so
         the 200 that mean half an hour on Base mean under a minute here. A
         cold start on that window sees almost nothing and reports it as
         nothing happening, which is the wrong lesson to teach on the first
         run after a deploy. Roughly twenty minutes instead. */
      lookback: Number(process.env.PONS_LOOKBACK_BLOCKS ?? 5000),
      name: "pons-launchpad",
      ...opts,
    });
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
  constructor(api, { chains = null } = {}) {
    this.api = api; this.chains = chains; this.name = "dexscreener-boosts";
  }
  async candidates() {
    const seen = new Set(), wanted = [];
    /* Two feeds. One of them failing is a thinner scan; both of them failing is
       the provider or the network being gone, and that must not read as a
       market with nothing in it. */
    let reached = 0;
    for (const call of [() => this.api.latestBoosts(), () => this.api.topBoosts()]) {
      let list = null;
      try { list = await call(); } catch { list = null; }
      if (list == null) continue;
      reached++;
      for (const b of Array.isArray(list) ? list : []) {
        if (!b.chainId || !b.tokenAddress) continue;
        const key = `${b.chainId}:${b.tokenAddress}`;
        if (seen.has(key)) continue;
        seen.add(key);
        wanted.push(b);
      }
    }
    if (!reached) throw new Error("dexscreener: neither boost feed could be reached — both failed");
    // Both feeds priced in one batch rather than one request per token.
    return priceTokens(this.api, wanted, this.chains);
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
  constructor(sources) { this.sources = sources; this.name = "merged"; this.lastRun = []; }
  async candidates() {
    const seen = new Set(), out = [];
    this.lastRun = [];
    for (const s of this.sources) {
      let got = [], error = null;
      // A source that throws must not take the others down with it — and must
      // not vanish either. Swallowed into an empty array, a source failing on
      // every single call was indistinguishable from one that legitimately
      // found nothing, which is how an engine scans zero candidates for six
      // hours and reads like a quiet market.
      try { got = await s.candidates(); }
      catch (e) { got = []; error = String(e?.message ?? e); }
      this.lastRun.push({ name: s.name, got: got.length, error, offChain: got.offChain ?? 0 });
      for (const p of got) {
        const k = `${p.chainId}:${p.baseToken?.address}`;
        if (!seen.has(k)) { seen.add(k); out.push({ ...p, discoveredBy: s.name }); }
      }
    }
    return out;
  }
}
