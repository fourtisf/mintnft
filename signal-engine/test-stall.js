/**
 * A provider that never answers must not stop the engine.
 *
 * This is the failure that ran on the live box for six hours. Dexscreener was
 * reachable — curl returned 200 — and the engine had scanned nothing since
 * boot. There was no error in the log because nothing had failed: the fetch
 * carried no timeout, so a connection that was accepted and never answered
 * left the discovery pass suspended for ever. Every later pass stacked behind
 * it. Zero candidates, no error, indistinguishable from a quiet market.
 *
 * The site had already been fixed for exactly this (site/test-hang.mjs) and
 * the engine had not. So: a request that hangs has to end, a pass that overran
 * must not have the next one pile on top of it, and a pass that failed has to
 * say so where the failure can be read.
 */
import { Dexscreener } from "./dexscreener.js";
import { Engine } from "./engine.js";
import { Triage } from "./triage.js";
import { MergedSource } from "./sources.js";

let failures = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "ok   " : "GAGAL"}  ${msg}`); if (!cond) failures++; };

/* AbortSignal.timeout's timer is unref'd in Node: it does not by itself keep
   the event loop alive. The engine always has live intervals, so it fires
   there; a bare test process would exit first and prove nothing. */
const keepAlive = setInterval(() => {}, 1000);

/** Accepted, never answered — until the caller's own signal gives up. */
const never = (url, init) => new Promise((_, reject) =>
  init?.signal?.addEventListener("abort", () => reject(new Error("TimeoutError"))));

console.log("\nPERMINTAAN YANG MENGGANTUNG");
{
  // The abort has to come from the client. A fetch that honours only the
  // signal it is given is exactly what Node's fetch does.
  const api = new Dexscreener({ timeoutMs: 300, log: () => {}, fetchImpl: never });
  const t0 = Date.now();
  const out = await api.latestProfiles();
  const ms = Date.now() - t0;
  ok(out === null, "a request that is never answered ends in a null, not a hang");
  ok(ms < 4000, `and ends in ${ms}ms — three attempts with backoff, not for ever`);
  ok(ms >= 900, "having actually retried rather than given up on the first timeout");
}

console.log("\nSATU PASS TIDAK MENUMPUK DI ATAS YANG LAIN");
{
  let running = 0, peak = 0;
  const engine = new Engine({
    client: {}, log: () => {},
    inspector: { configured: false, inspect: async () => null },
    source: { name: "slow", candidates: async () => {
      peak = Math.max(peak, ++running);
      await new Promise(r => setTimeout(r, 200));
      running--; return [];
    } },
  });
  await Promise.all([engine.tick(), engine.tick(), engine.tick()]);
  ok(peak === 1, `three overlapping passes ran one at a time (peak ${peak})`);
}

console.log("\nPASS YANG GAGAL TETAP MELAPOR");
{
  const t = new Triage();
  const engine = new Engine({
    client: {}, log: () => {},
    inspector: { configured: false, inspect: async () => null },
    source: { name: "helius-pools", candidates: async () => { throw new Error("ECONNRESET"); } },
    onScan: (n, pairs, runs) => t.scanned(n, pairs, runs),
  });
  await engine.tick().catch(() => {});
  const s = t.snapshot().sources.find(x => x.id === "helius-pools");
  ok(s && s.errors === 1, "a pass that threw is still counted as a run against its source");
  ok(s?.lastError === "ECONNRESET", `carrying the reason: "${s?.lastError}"`);
}

console.log("\nENGINE TETAP HIDUP SETELAH PENYEDIA MATI");
{
  // The whole loop, against a provider that never answers: the pass has to
  // finish, report nothing found, and leave the engine able to run again.
  const t = new Triage();
  const api = new Dexscreener({ timeoutMs: 200, log: () => {}, fetchImpl: never });
  const engine = new Engine({ client: api, log: () => {},
    inspector: { configured: false, inspect: async () => null },
    onScan: (n, pairs, runs) => t.scanned(n, pairs, runs) });

  const t0 = Date.now();
  await engine.tick();
  // Slow is correct here: three endpoints, each retried, each waiting out its
  // own timeout. What matters is that it ends and the loop is not wedged.
  ok(Date.now() - t0 < 30000, `the pass finished in ${((Date.now() - t0) / 1000).toFixed(1)}s rather than never`);

  const s = t.snapshot();
  ok(s.scanned === 0, "nothing was scanned, which is the truth");
  ok(s.sources.length > 0, "but the sources are on the page, not absent from it");
  ok(s.sources.every(x => x.runs >= 1),
    `each one recorded as having run: ${s.sources.map(x => x.id + " " + x.runs).join(", ")}`);

  const again = await engine.tick();
  ok(again !== undefined, "and the engine can still run a second pass — it is not wedged");
}

console.log("\nSATU PERMINTAAN UNTUK TIGA PULUH TOKEN");
{
  // The failure this replaces: one request per profile. Thirty profiles meant
  // thirty requests back to back, Dexscreener answered them with 429s, and
  // every candidate came back empty — an engine scanning nothing while looking
  // like a market with nothing in it.
  const { ProfileSource, BoostSource } = await import("./sources.js");
  const profiles = Array.from({ length: 30 }, (_, i) => ({ chainId: "solana", tokenAddress: "T" + i }));
  const pair = a => ({ chainId: "solana", pairAddress: "P" + a, baseToken: { address: a, symbol: a },
                       liquidity: { usd: 50000 } });

  const urls = [];
  const api = new Dexscreener({ log: () => {}, fetchImpl: async url => {
    urls.push(url);
    const body = url.includes("token-profiles") ? profiles
      : url.includes("token-boosts") ? profiles.slice(0, 10)
      : url.includes("/tokens/v1/") ? url.split("/").pop().split(",").map(pair)
      : [];
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => body };
  } });

  const got = await new ProfileSource(api).candidates();
  ok(got.length === 30, `all thirty tokens are priced (${got.length})`);
  ok(urls.length === 2, `in two requests, not thirty-one (${urls.length})`);
  ok(urls.some(u => u.includes("/tokens/v1/")), "using the batch endpoint");

  urls.length = 0;
  const boosted = await new BoostSource(api).candidates();
  ok(boosted.length === 10, `both boost feeds priced together (${boosted.length})`);
  ok(urls.length === 3, `two feeds plus one batch, not twenty-one requests (${urls.length})`);

  // The deepest pool is the market: a token quoted in two, the deeper one wins.
  const two = { ...pair("X"), liquidity: { usd: 10 } };
  const deep = { ...pair("X"), pairAddress: "DEEP", liquidity: { usd: 90000 } };
  const { deepestPerToken } = await import("./sources.js");
  const best = deepestPerToken([two, deep]);
  ok(best.length === 1 && best[0].pairAddress === "DEEP",
    "and one pair per token comes back — the deepest");
}

clearInterval(keepAlive);
console.log(failures ? `\n${failures} GAGAL\n` : "\nsemua lolos\n");
process.exit(failures ? 1 : 0);
