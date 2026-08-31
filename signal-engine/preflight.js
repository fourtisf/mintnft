/**
 * Run this on the VPS before starting the engine for real.
 *
 * It answers the three questions that decide whether a live run produces
 * anything, and answers them in about a minute without writing a single row:
 *
 *   1. can this box reach Dexscreener at all
 *   2. do live pairs actually carry the fields the rules read
 *   3. against real candidates, what would the filter do
 *
 * Question 3 is the one worth waiting for. The thresholds in rules.js were
 * reasoned, not measured — if every candidate dies at one gate, that gate is
 * wrong, and it is far cheaper to learn that here than after a week of silence.
 *
 *   node deploy/preflight.js            one discovery pass
 *   node deploy/preflight.js --rounds 5 five passes, a minute apart
 */
import { Dexscreener } from "./dexscreener.js";
import { ProfileSource } from "./sources.js";
import { evaluate, marketCapOf, deriveSupply, CONFIG } from "./rules.js";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ROUNDS = Number(arg("--rounds", 1));

/* Every field the rules read off a pair. A live pair missing one of these is
   not a crash — the gates treat it as absent — but it is a silent veto, so it
   has to be visible here. */
const NEEDED = [
  ["chainId", p => p.chainId], ["dexId", p => p.dexId], ["pairAddress", p => p.pairAddress],
  ["baseToken.address", p => p.baseToken?.address], ["baseToken.symbol", p => p.baseToken?.symbol],
  ["quoteToken.symbol", p => p.quoteToken?.symbol], ["priceUsd", p => p.priceUsd],
  ["liquidity.usd", p => p.liquidity?.usd], ["pairCreatedAt", p => p.pairCreatedAt],
  ["marketCap|fdv", p => p.marketCap ?? p.fdv],
  ["txns.m5", p => p.txns?.m5], ["txns.h1", p => p.txns?.h1],
  ["volume.m5", p => p.volume?.m5], ["volume.h1", p => p.volume?.h1], ["volume.h24", p => p.volume?.h24],
  ["priceChange.m5", p => p.priceChange?.m5], ["priceChange.h1", p => p.priceChange?.h1],
];

const usd = n => "$" + Math.round(n).toLocaleString();
const pct = (a, b) => b ? (a / b * 100).toFixed(0) + "%" : "—";

async function probe() {
  const url = "https://api.dexscreener.com/token-profiles/latest/v1";
  let res;
  try {
    res = await fetch(url, { headers: { accept: "application/json" } });
  } catch (e) {
    return { ok: false, why: "cannot connect — " + String(e.cause?.message ?? e.message ?? e) };
  }
  if (!res.ok) return { ok: false, why: `HTTP ${res.status} ${res.statusText}` };
  const body = await res.json().catch(() => null);
  if (!Array.isArray(body)) return { ok: false, why: "responded, but not with a list of profiles" };
  return { ok: true, n: body.length };
}

const reach = await probe();
if (!reach.ok) {
  console.log("UNREACHABLE  " + reach.why);
  console.log(`
Dexscreener is not reachable from this box, so nothing below would mean
anything. Note that the engine's own client swallows this — it retries, gives
up, and returns an empty candidate list, which is indistinguishable from a
quiet market. That is why this check runs before the rest.

Common causes: no outbound HTTPS, an egress proxy that denies the host, or DNS.
Try:  curl -sS -o /dev/null -w '%{http_code}\\n' https://api.dexscreener.com/token-profiles/latest/v1`);
  process.exit(1);
}
console.log(`reachable · ${reach.n} profiles in the latest feed\n`);

const api = new Dexscreener({ log: (k, d) => console.log("  ! " + k, JSON.stringify(d)) });
const source = new ProfileSource(api);
const seen = new Map();
const missing = {}, vetoes = {}, scores = [];
let scanned = 0, fired = 0, scoredLow = 0, noSupply = 0;

console.log("preflight · " + new Date().toISOString());
console.log("threshold to fire: " + CONFIG.scoreToFire + "/100\n");

for (let round = 1; round <= ROUNDS; round++) {
  const t0 = Date.now();
  let pairs;
  try {
    pairs = await source.candidates();
  } catch (e) {
    console.log("UNREACHABLE — " + String(e));
    console.log("\nDexscreener is not reachable from this box. Nothing else here matters until it is.");
    process.exit(1);
  }
  console.log(`round ${round}/${ROUNDS}: ${pairs.length} candidates in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  for (const p of pairs) {
    scanned++;
    for (const [name, get] of NEEDED) if (get(p) == null) missing[name] = (missing[name] ?? 0) + 1;
    if (!deriveSupply(p)) noSupply++;

    const ev = evaluate(p, CONFIG, seen);
    if (ev.vetoes.length) { for (const v of ev.vetoes) vetoes[v] = (vetoes[v] ?? 0) + 1; continue; }
    scores.push(ev.score);
    if (!ev.fire) { scoredLow++; continue; }
    fired++;
    seen.set(ev.key, Date.now());
    console.log(`\n  WOULD FIRE  $${p.baseToken.symbol}  ${p.chainId}  score ${ev.score}/100`);
    console.log(`    mc ${usd(marketCapOf(p))}  liq ${usd(p.liquidity?.usd ?? 0)}  ${p.baseToken.address}`);
    ev.reasons.forEach(r => console.log(`    · ${r}`));
  }
  if (round < ROUNDS) await new Promise(r => setTimeout(r, 60_000));
}

console.log("\n─── what the filter did ───");
console.log(`scanned ${scanned}   vetoed ${scanned - scores.length} (${pct(scanned - scores.length, scanned)})   scored low ${scoredLow}   would fire ${fired}`);
if (scores.length) {
  const s = [...scores].sort((a, b) => a - b);
  console.log(`scores: min ${s[0]}  median ${s[Math.floor(s.length / 2)]}  max ${s[s.length - 1]}  (threshold ${CONFIG.scoreToFire})`);
}

console.log("\n─── which gate killed what ───");
const rank = Object.entries(vetoes).sort((a, b) => b[1] - a[1]);
if (!rank.length) console.log("  nothing was vetoed");
for (const [v, n] of rank) console.log(`  ${String(n).padStart(4)}  ${pct(n, scanned).padStart(4)}  ${v}`);

console.log("\n─── fields live pairs did not carry ───");
const miss = Object.entries(missing).sort((a, b) => b[1] - a[1]);
if (!scanned) console.log("  nothing was scanned, so nothing was checked");
else if (!miss.length) console.log("  none — every pair carried every field the rules read");
for (const [f, n] of miss) console.log(`  ${String(n).padStart(4)}  ${pct(n, scanned).padStart(4)}  ${f}`);
if (noSupply) console.log(`  ${String(noSupply).padStart(4)}  ${pct(noSupply, scanned).padStart(4)}  no marketCap or fdv — supply not derivable, market cap unusable`);

console.log(`
─── read this before starting the engine ───
If "would fire" is 0 across several rounds, the engine will run silently and
you will not know whether it is working or broken. Look at which gate is doing
the killing above: one gate holding most of the count is a threshold to argue
with, not a filter doing its job.

Discovery here is /token-profiles only, which sees a token just once, when its
team files a profile. That is a fraction of what launches. sources.js already
has Helius and EVM factory watchers written for exactly this reason; they need
keys. Until then, expect thin candidate counts and do not read them as market
conditions.

Nothing was written. The register is untouched.`);
