/**
 * Dexscreener client.
 *
 * Endpoints and rate limits taken from the official OpenAPI spec at
 * https://docs.dexscreener.com/api/reference — no API key needed.
 *
 *   /token-profiles/latest/v1              60 req/min
 *   /token-boosts/latest/v1                60 req/min
 *   /token-boosts/top/v1                   60 req/min
 *   /latest/dex/search?q=                 300 req/min
 *   /token-pairs/v1/{chain}/{token}       300 req/min
 *   /tokens/v1/{chain}/{addresses}        300 req/min   (up to 30, comma separated)
 *   /latest/dex/pairs/{chain}/{pairId}    300 req/min
 *
 * Two buckets, because the profile endpoint is five times stricter than the
 * pair endpoints and sharing one limiter would waste most of the budget.
 */

const BASE = "https://api.dexscreener.com";

class Bucket {
  constructor(perMinute, name) {
    this.cap = perMinute;
    this.tokens = perMinute;
    this.name = name;
    this.last = Date.now();
  }
  async take() {
    for (;;) {
      const now = Date.now();
      this.tokens = Math.min(this.cap, this.tokens + ((now - this.last) / 60000) * this.cap);
      this.last = now;
      if (this.tokens >= 1) { this.tokens -= 1; return; }
      await new Promise(r => setTimeout(r, Math.ceil((60000 / this.cap) * (1 - this.tokens))));
    }
  }
}

/**
 * No request may hang.
 *
 * A host that refuses a connection produces an error the loop can see. A host
 * that accepts and never answers produces nothing at all — and with no timeout
 * on the fetch, the discovery tick that made the request never returns. Every
 * later tick then piles up behind it, the engine scans zero candidates for
 * hours, and the log is silent because nothing failed. That is not a quiet
 * market; it is an engine that has stopped, and it must not look the same.
 *
 * Ten seconds is far past any honest response from this API and well inside
 * the 60s discovery interval, so a timed-out request is resolved before the
 * next pass starts.
 */
const TIMEOUT_MS = 10_000;

export class Dexscreener {
  constructor({ fetchImpl = globalThis.fetch, log = () => {}, timeoutMs = TIMEOUT_MS } = {}) {
    this.fetch = fetchImpl;
    this.log = log;
    this.timeoutMs = timeoutMs;
    this.slow = new Bucket(55, "profiles");   // 60/min, kept under
    this.fast = new Bucket(280, "pairs");     // 300/min, kept under
  }

  async #get(path, bucket) {
    await bucket.take();
    const url = BASE + path;
    const ATTEMPTS = 3;
    // Backing off after the final attempt delays the caller and retries
    // nothing. On a provider that is timing out, that was two and a half
    // seconds of pure waiting on top of every request already spent.
    const backoff = (attempt, ms) => attempt < ATTEMPTS - 1
      ? new Promise(r => setTimeout(r, ms)) : Promise.resolve();

    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      let res;
      try {
        res = await this.fetch(url, { headers: { accept: "application/json" },
                                      signal: AbortSignal.timeout(this.timeoutMs) });
      } catch (e) {
        this.log("network", { url, error: String(e) });
        await backoff(attempt, 800 * (attempt + 1));
        continue;
      }
      if (res.status === 429) {
        // Back off hard. Being throttled costs more than waiting.
        const wait = Number(res.headers.get("retry-after") || 0) * 1000 || 4000 * (attempt + 1);
        this.log("throttled", { url, wait });
        await backoff(attempt, wait);
        continue;
      }
      if (!res.ok) { this.log("http", { url, status: res.status }); return null; }
      return res.json();
    }
    return null;
  }

  /** Tokens that recently published a profile. Biased toward projects that
   *  bothered to fill one in — which is itself a weak quality filter. */
  latestProfiles() {
    return this.#get("/token-profiles/latest/v1", this.slow);
  }

  /** Tokens someone is paying to promote. A different slice of the market to
   *  the profile feed, on the same free API, and it turns over faster. */
  latestBoosts() { return this.#get("/token-boosts/latest/v1", this.slow); }
  topBoosts()    { return this.#get("/token-boosts/top/v1", this.slow); }

  /** Every pair for a token. Returns the deepest one first. */
  async pairsForToken(chainId, tokenAddress) {
    const r = await this.#get(`/token-pairs/v1/${chainId}/${tokenAddress}`, this.fast);
    const pairs = Array.isArray(r) ? r : r?.pairs ?? [];
    return pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  }

  /** Batch refresh, up to 30 addresses per call. Used by the scorer to keep
   *  entry/peak/now marks current without burning the budget. */
  async tokensBatch(chainId, addresses) {
    const out = [];
    for (let i = 0; i < addresses.length; i += 30) {
      const slice = addresses.slice(i, i + 30).join(",");
      const r = await this.#get(`/tokens/v1/${chainId}/${slice}`, this.fast);
      if (Array.isArray(r)) out.push(...r);
      else if (r?.pairs) out.push(...r.pairs);
    }
    return out;
  }

  search(query) {
    return this.#get(`/latest/dex/search?q=${encodeURIComponent(query)}`, this.fast);
  }
}
