/**
 * Point the on-chain gates at a real token and print what the chain said.
 *
 * The gates ship inert: with no key every call records `chainChecks: null` and
 * the site prints "not checked". Wiring a key is therefore a first run to be
 * watched, not a formality — and "the service restarted without complaining"
 * is not evidence that anything was read. This is the thing that is.
 *
 *   HELIUS_KEY=... node check-chain.js
 *   node check-chain.js --key <helius-key> [mint ...]
 *   SOLANA_RPC=https://... node check-chain.js       # any other node
 *
 * With no mints given it checks two well-known ones, chosen because they should
 * disagree: BONK has had its authorities revoked and passes; USDC has both
 * still live, and a screener that let USDC through would be a screener whose
 * gates do not refuse anything. A run where both pass means the gates are not
 * working, not that both tokens are safe.
 */
import { ChainInspector, CHAIN_GATES, chainVerdict } from "./chain.js";
import { CONFIG } from "./rules.js";

const args = process.argv.slice(2);
const keyAt = args.indexOf("--key");
const key = keyAt >= 0 ? args[keyAt + 1] : process.env.HELIUS_KEY;
const mints = args.filter((a, i) => !a.startsWith("--") && i !== keyAt + 1);

const DEFAULTS = [
  ["DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", "BONK — expect: passes"],
  ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "USDC — expect: refused, both authorities live"],
];

const inspector = new ChainInspector({ heliusKey: key, log: (...a) => console.log(" ", ...a) });
if (!inspector.configured) {
  console.error("\nno key. pass --key <helius-key>, or set HELIUS_KEY or SOLANA_RPC.\n");
  process.exit(2);
}

const pct = n => (n * 100).toFixed(1) + "%";
const show = {
  mintAuthority: v => (v == null ? "revoked" : `LIVE — ${v}`),
  freezeAuthority: v => (v == null ? "revoked" : `LIVE — ${v}`),
  topHolderPct: pct, top10Pct: pct, lpBurnedPct: pct,
  holdersSampled: String, decimals: String,
};

let readAnything = false;
for (const [mint, label] of mints.length ? mints.map(m => [m, ""]) : DEFAULTS) {
  console.log(`\n${mint}${label ? "  (" + label + ")" : ""}`);
  const t0 = Date.now();
  const report = await inspector.inspect({ chainId: "solana", baseToken: { address: mint } });
  const ms = Date.now() - t0;

  if (!report) { console.log("  nothing read — the inspector returned null"); continue; }
  if (!report.have.length) {
    console.log(`  nothing established in ${ms}ms — the node answered nothing usable.`);
    console.log("  this is the honest outcome, and it is also what a wrong key looks like.");
    continue;
  }
  readAnything = true;

  for (const f of report.have)
    console.log(`  ${f.padEnd(18)} ${(show[f] ?? String)(report[f])}`);

  const v = chainVerdict(report, CONFIG);
  const unread = CHAIN_GATES.map(g => g.id).filter(g => !v.checked.includes(g));
  console.log(`  ${"—".repeat(50)}`);
  console.log(`  ran ${v.checked.length}/${CHAIN_GATES.length} gates in ${ms}ms` +
    (unread.length ? `  ·  not checked: ${unread.join(", ")}` : ""));
  if (v.vetoes.length) v.vetoes.forEach(x => console.log(`  REFUSED  ${x}`));
  else console.log("  PASSED   nothing the gates could read refuses this token");
}

if (!readAnything) {
  console.error("\nnothing was established for any token. the key is wrong, out of credit,");
  console.error("or the node is unreachable from this box. the engine would record");
  console.error("chainChecks: null and the site would print \"not checked\" — honest, but");
  console.error("no protection at all.\n");
  process.exit(1);
}
console.log("\nthe gates are reading the chain. wire the key into the unit and restart.\n");
