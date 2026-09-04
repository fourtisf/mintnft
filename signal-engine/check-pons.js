/**
 * Point the Robinhood desk at the real chain and print what came back.
 *
 * Everything about this desk being Robinhood-only is proved by tests: the gate
 * refuses other chains, the watchers for other chains are not built, the feeds
 * are narrowed before pricing. None of that is evidence that anything is being
 * *found*. A filter that refuses everything and a filter that is working look
 * identical from the outside, and both of them print a quiet log.
 *
 * So this asks the four questions the tests cannot, against the real network:
 *
 *   1. Does the Robinhood RPC answer at all, and at what head?
 *   2. Does the Pons factory emit TokenLaunched in the range we scan? If the
 *      window is empty the watcher is correct and idle, which is a different
 *      fault from the watcher being wrong.
 *   3. Does Dexscreener price a Robinhood token? The whole pipeline downstream
 *      of discovery is Dexscreener's `robinhood` chain id. If it returns
 *      nothing the desk cannot fire whatever the factory says.
 *   4. What do the real gates do with what came back, one line per candidate?
 *
 * It also asks the register what it actually holds, because that is the only
 * answer to "is it Robinhood only" that is not a claim about intent.
 *
 * Nothing here writes. It is the same shape as check-chain.js: not a test, a
 * first run to be watched.
 *
 *   ROBINHOOD_RPC=https://rpc.mainnet.chain.robinhood.com node check-pons.js
 *   node check-pons.js --blocks 5000 --all
 */
import { PONS_V1_FACTORY, PONS_TOKEN_LAUNCHED } from "./sources.js";
import { Dexscreener } from "./dexscreener.js";
import { evaluate, CONFIG } from "./rules.js";
import { Engine } from "./engine.js";
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const at = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const BLOCKS = Number(at("--blocks") ?? 2000);
const ALL = args.includes("--all");
const RPC = process.env.ROBINHOOD_RPC?.trim();

const say = (...a) => console.log(...a);
const head = t => say(`\n\x1b[1m${t}\x1b[0m`);
const bad = t => say(`  \x1b[31m${t}\x1b[0m`);
const good = t => say(`  \x1b[32m${t}\x1b[0m`);

/* Errors are the output here, not an exception. An RPC that answers "range too
   wide" is telling us something we need to print, and a helper that swallows it
   into null would turn it into "no launches found". */
async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const body = await r.json();
  if (body.error) throw new Error(body.error.message ?? JSON.stringify(body.error));
  return body.result;
}

say("\nWhat this box can actually see on Robinhood Chain. Nothing is written.\n");

head("0 · what the running config says");
say(`  CHAINS      ${CONFIG.chains.length ? CONFIG.chains.join(", ") : "(empty) — every chain"}`);
const sources = new Engine({ client: {}, log: () => {} }).source.sources.map(s => s.name);
say(`  discovery   ${sources.join(", ")}`);
if (!CONFIG.chains.includes("robinhood") && CONFIG.chains.length)
  bad("robinhood is not in CHAINS — this desk cannot fire there at all");
if (!sources.includes("pons-launchpad"))
  bad("pons-launchpad is not in the list — ROBINHOOD_RPC is unset in this shell");

/* The gate, demonstrated rather than asserted. A test file passing on a laptop
   is not the same claim as the config on this box refusing this token now. */
head("0b · the gate, on this box, with this config");
for (const chain of ["robinhood", "solana", "base"]) {
  const pair = {
    chainId: chain, pairAddress: "P", priceUsd: "0.001",
    baseToken: { address: "T", symbol: "T" }, quoteToken: { symbol: "WETH" },
    liquidity: { usd: 50000 }, fdv: 500000, marketCap: 500000,
    pairCreatedAt: Date.now() - 3600e3, txns: { h1: { buys: 80, sells: 20 } },
    volume: { h1: 40000, m5: 4000 }, priceChange: { m5: 2, h1: 8 },
    info: { socials: [{ url: "https://x.com/x" }] },
  };
  const ev = evaluate(pair, CONFIG, new Map());
  const why = ev.vetoIds?.includes("tracked_chain") ? "refused for its chain" : "not refused for its chain";
  say(`  ${chain.padEnd(10)} ${why}`);
}

if (!RPC) {
  bad("\nROBINHOOD_RPC is not set in this shell, so steps 1-4 cannot run.");
  say("  systemd has its own environment — set it here too to check the node:");
  say("    ROBINHOOD_RPC=https://rpc.mainnet.chain.robinhood.com node check-pons.js");
  // The register needs no node, and it is the one answer that is not a claim.
  registerReadout();
  process.exit(2);
}

head("1 · the node");
let to;
try {
  to = parseInt(await rpc("eth_blockNumber", []), 16);
  good(`answering — head is block ${to}`);
} catch (e) {
  bad(`${new URL(RPC).host} did not answer: ${e.message}`);
  say("  Steps 2-4 depend on this. Fix the RPC before reading them.");
  registerReadout();
  process.exit(1);
}

head(`2 · Pons launches in the last ${BLOCKS} blocks`);
say(`  factory ${PONS_V1_FACTORY}`);
say(`  topic   ${PONS_TOKEN_LAUNCHED}  (TokenLaunched)`);
let logs = [];
let from = Math.max(0, to - BLOCKS), span = BLOCKS;
/* Public nodes cap the range and say so. Halving until it is accepted turns a
   provider limit into a smaller window rather than into "no launches". */
for (;;) {
  try {
    logs = await rpc("eth_getLogs", [{
      address: PONS_V1_FACTORY, topics: [PONS_TOKEN_LAUNCHED],
      fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16),
    }]) ?? [];
    break;
  } catch (e) {
    if (span <= 50) { bad(`eth_getLogs refused even over ${span} blocks: ${e.message}`); break; }
    say(`  ${span} blocks refused (${e.message}) — halving`);
    span = Math.floor(span / 2); from = to - span;
  }
}
const tokens = [...new Set(logs.map(l => "0x" + String(l.topics?.[1] ?? "").slice(26)).filter(a => a.length === 42))];
if (!logs.length) {
  say(`  none in blocks ${from}–${to}. The watcher is idle, not wrong —`);
  say("  widen it with --blocks, or read the launchpad and see whether it is quiet.");
} else {
  good(`${logs.length} launches, ${tokens.length} distinct tokens, blocks ${from}–${to}`);
  for (const t of tokens.slice(0, ALL ? tokens.length : 8)) say(`    ${t}`);
  if (!ALL && tokens.length > 8) say(`    … ${tokens.length - 8} more (--all)`);
}

head("3 · does Dexscreener price them");
const api = new Dexscreener({ log: () => {} });
let pairs = [];
if (!tokens.length) {
  say("  nothing to ask about — step 2 found no tokens.");
} else {
  try {
    pairs = await api.tokensBatch("robinhood", tokens);
  } catch (e) { bad(`Dexscreener refused: ${e.message}`); }
  if (!pairs.length) {
    bad(`0 of ${tokens.length} came back priced.`);
    say("  A brand new launch has no trading history, so some of this is normal.");
    say("  All of them, every run, means the pipeline stops here whatever the");
    say("  factory says — check that dexscreener.com/robinhood/<token> resolves.");
  } else {
    good(`${pairs.length} pairs for ${new Set(pairs.map(p => p.baseToken?.address)).size} tokens`);
    const wrong = pairs.filter(p => p.chainId !== "robinhood").length;
    if (wrong) bad(`${wrong} came back on a chain id other than "robinhood" — the id in CHAINS is wrong`);
  }
}

head("4 · what the real gates do with them");
if (!pairs.length) say("  nothing priced, so nothing to judge.");
else {
  const byGate = {};
  let fired = 0;
  for (const p of pairs) {
    const ev = evaluate(p, CONFIG, new Map());
    const why = ev.vetoes?.[0] ?? (ev.fire ? "WOULD FIRE" : `scored ${ev.score}, below ${CONFIG.scoreToFire}`);
    if (ev.fire) fired++;
    byGate[ev.vetoIds?.[0] ?? (ev.fire ? "fired" : "below threshold")] =
      (byGate[ev.vetoIds?.[0] ?? (ev.fire ? "fired" : "below threshold")] ?? 0) + 1;
    if (ALL || ev.fire) say(`  ${String(p.baseToken?.symbol ?? "?").padEnd(12)} ${why}`);
  }
  for (const [g, n] of Object.entries(byGate).sort((a, b) => b[1] - a[1]))
    say(`  ${String(n).padStart(4)}  ${g}`);
  say(`\n  ${fired} of ${pairs.length} would have fired. Most refused is the gates working,`);
  say("  not a fault — Pons mints far more tokens than graduate.");
}

function registerReadout() {
head("5 · what the register actually holds");
const path = process.env.REGISTER_PATH ?? process.env.DATA_FILE ?? "./data/register.json";
if (!existsSync(path)) say(`  ${path} does not exist here — run this on the box that holds it.`);
else {
  try {
    const calls = JSON.parse(readFileSync(path, "utf8")).calls ?? [];
    const byChain = {};
    for (const c of calls) byChain[c.chain ?? "?"] = (byChain[c.chain ?? "?"] ?? 0) + 1;
    say(`  ${calls.length} calls in ${path}`);
    for (const [c, n] of Object.entries(byChain).sort((a, b) => b[1] - a[1]))
      say(`  ${String(n).padStart(4)}  ${c}`);
    /* Rows written before the gate existed are still in here and always will
       be — the register cannot be edited. So the question is not whether the
       file is pure, it is whether anything landed off-chain after the change. */
    const last = calls.slice(-10).map(c => `#${c.seq} ${c.chain}`);
    if (last.length) say(`  last 10: ${last.join(", ")}`);
  } catch (e) { bad(`could not read the register: ${e.message}`); }
}
say("");
}

registerReadout();
