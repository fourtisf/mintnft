/**
 * A mark has to come from the market the call was fired on.
 *
 * The refresher used to take the token's deepest pair. A token quoted in two
 * pools at once — a bonding curve and the pool it is migrating to, the same
 * token against SOL and against USDC — then had its entry priced in one pool
 * and every later mark in the other. Nothing traded and the call was settled
 * dead, permanently, on a record that cannot be edited afterwards.
 *
 * The one case where the deepest pair is right is a pair that has actually
 * gone: a curve that migrated leaves an empty pool behind, and following the
 * token is honest where following an empty pool is not.
 */
import { rmSync } from "node:fs";
import { FileStore } from "./store.js";
import { start } from "./index.js";

const DATA = "./data/marks-test.json";
const PORT = 8796;

let failures = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "ok   " : "GAGAL"}  ${msg}`); if (!cond) failures++; };

const pair = (pairAddress, priceUsd, liquidityUsd, info) => ({
  chainId: "solana", dexId: "meteora", pairAddress,
  baseToken: { address: "TOK", symbol: "APEC", name: "Ape & Closed AI" },
  priceUsd: String(priceUsd), liquidity: { usd: liquidityUsd },
  ...(info ? { info } : {}),
});

// Shaped after call #9 on the live register: entry $0.0004335 on a $55K pool,
// and a deeper pool quoting the same token ten times lower.
const ENTRY_PRICE = 0.0004335, SUPPLY = 1e9;
let pairs = [];
const api = {
  latestProfiles: async () => [], latestBoosts: async () => [], topBoosts: async () => [],
  pairsForToken: async () => [],
  tokensBatch: async () => pairs,
};

rmSync(DATA, { force: true });
const store = new FileStore(DATA);
const call = store.insertCall({
  callerId: 1, chain: "solana", tokenAddress: "TOK", pairAddress: "FIRED",
  symbol: "APEC", name: "Ape & Closed AI", dex: "meteora",
  firedAt: new Date().toISOString(),
  entryPriceUsd: ENTRY_PRICE, entrySupply: SUPPLY, entryMc: ENTRY_PRICE * SUPPLY,
  entryLiquidityUsd: 55_000, score: 76, reasons: ["Volume running 5.7× the hourly pace"],
});

const engine = start({ store, api, port: PORT, log: () => {} });
const mark = () => store.mark(call.seq);

console.log("\nDUA POOL, SATU TOKEN");
pairs = [pair("FIRED", ENTRY_PRICE, 55_000), pair("DEEPER", ENTRY_PRICE * 0.0998, 90_000)];
await engine.refresh(store.liveCalls());
ok(Math.abs(mark().nowX - 1) < 0.001,
  `the mark is priced on the pair the call fired on (nowX ${mark().nowX.toFixed(3)})`);
ok(!mark().isDead, "so a deeper pool quoting ten times lower does not kill the call");

console.log("\nPOOL YANG DITINGGALKAN");
// The fired pair is drained — a migration, not a price. Follow the token.
pairs = [pair("FIRED", ENTRY_PRICE, 0), pair("DEEPER", ENTRY_PRICE * 2, 120_000)];
await engine.refresh(store.liveCalls());
ok(Math.abs(mark().nowX - 2) < 0.001,
  `an empty fired pair falls back to the token's deepest pool (nowX ${mark().nowX.toFixed(3)})`);
ok(mark().verdict === "win", "and the move it actually made is scored");

console.log("\nHARGA TURUN BENERAN");
pairs = [pair("FIRED", ENTRY_PRICE / 20, 40_000), pair("DEEPER", ENTRY_PRICE, 90_000)];
await engine.refresh(store.liveCalls());
ok(mark().isDead, "a real collapse on the call's own pair still reads as dead");
ok(mark().peakX >= 2, "and the peak it reached stays on the record");

console.log("\nSOCIALS MENYUSUL");
// The call was written before the engine recorded any links. They belong to the
// token, not to the moment it fired, so a later mark can carry them.
pairs = [pair("FIRED", ENTRY_PRICE, 55_000, {
  socials: [{ type: "twitter", url: "https://x.com/apec" },
            { type: "telegram", url: "javascript:alert(1)" }],
  websites: [{ label: "Website", url: "https://apec.example" }],
})];
await engine.refresh(store.liveCalls());
const links = store.mark(call.seq).links ?? [];
ok(links.length === 2, `a call fired without links picks them up on a later mark (${links.length})`);
ok(links.some(l => l.url === "https://x.com/apec") && links.some(l => l.kind === "site"),
  "the token's own site and socials, as the provider gave them");
ok(!links.some(l => /^javascript:/i.test(l.url)),
  "and nothing that is not an http link — a provider does not choose what we link to");

pairs = [pair("FIRED", ENTRY_PRICE, 55_000)];   // provider stops sending info
await engine.refresh(store.liveCalls());
ok((store.mark(call.seq).links ?? []).length === 2,
  "a missing field is not a project deleting its Twitter — they are kept");

engine.stop();
rmSync(DATA, { force: true });
console.log(failures ? `\n${failures} GAGAL\n` : "\nsemua lolos\n");
process.exit(failures ? 1 : 0);
