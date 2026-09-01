/**
 * A register written under an older scheme has to keep verifying, for ever.
 *
 * The hash field list could not grow. `canonical()` closed over one array, so
 * appending to it changed the canonical form of every row already written and
 * broke verification of the whole chain — on a product whose entire claim is
 * that its past cannot be rewritten. The way out is not to freeze the list; it
 * is to version it, and to prove every older version still verifies byte for
 * byte on every change.
 *
 * That proof is this file. The v2 hashes below are literals on purpose: they
 * were computed by the v2 code and are pasted here, so if a future edit
 * changes what v2 hashes to, this test fails rather than agreeing with itself.
 *
 * Adding a version: append to SCHEMES in integrity.js, then add its row here.
 * Never edit an existing expectation.
 */
import { rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { canonical, recordHash, verifyChain, schemeFor, HASH_VERSION } from "./integrity.js";
import { FileStore } from "./store.js";

let failures = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "ok   " : "GAGAL"}  ${msg}`); if (!cond) failures++; };

/* A call as the v2 engine wrote it, with the volume fields it published but
   did not hash. */
const V2_CALL = {
  seq: 1, hashVersion: 2, callerId: 1,
  chain: "solana", tokenAddress: "TOK", pairAddress: "PAIR", symbol: "APEC",
  firedAt: "2026-08-01T12:00:00.000Z",
  entryPriceUsd: 0.0004335, entrySupply: 1e9, entryMc: 433500, entrySupplySource: "derived",
  liquidityUsd: 55000, score: 82, reasonIds: ["volume_acceleration", "buy_pressure"],
  sourceKind: "screener", sourceRef: null,
  entryVolumeH1: 52000, entryVolumeM5: 9000,
};

/* What the v2 code produced for it, pasted rather than recomputed. A test that
   derives its own expectation from the same field list it is checking agrees
   with itself no matter what that list becomes, which is worth nothing here. */
const V2_CANONICAL = '{"callerId":"1","chain":"solana","entryMc":"433500","entryPriceUsd":"0.0004335","entrySupply":"1000000000","entrySupplySource":"derived","firedAt":"2026-08-01T12:00:00.000Z","hashVersion":"2","liquidityUsd":"55000","pairAddress":"PAIR","reasonIds":["volume_acceleration","buy_pressure"],"score":"82","sourceKind":"screener","sourceRef":null,"symbol":"APEC","tokenAddress":"TOK"}';
const V2_HASH = "d46bb733a3b7f42b4b58ef07a1772912de68a766706361cbc71128f4aed52eaa";

// The paste has to be a real sha256 of the string above it, or the two
// literals could drift apart and both still look convincing.
if (createHash("sha256").update(V2_CANONICAL).digest("hex") !== V2_HASH)
  throw new Error("the pasted v2 canonical form and digest do not agree with each other");

console.log("\nBARIS LAMA TETAP TERVERIFIKASI");
ok(canonical(V2_CALL) === V2_CANONICAL,
  "a v2 row still serialises to exactly the 16 fields v2 hashed");
ok(!canonical(V2_CALL).includes("entryVolumeH1"),
  "the volume it carried but never hashed stays out of its canonical form");
ok(recordHash(V2_CALL) === V2_HASH,
  `and hashes to the same digest — ${V2_HASH.slice(0, 16)}…`);

// The failure this whole design exists to prevent: a new field silently
// rewriting what an old row hashes to.
const asV3 = { ...V2_CALL, hashVersion: 3 };
ok(recordHash(asV3) !== V2_HASH,
  "the same row under v3 hashes differently — the version is inside the hash");
ok(canonical(asV3).includes("entryVolumeH1"), "because v3 freezes the volume");

console.log("\nVERSI YANG TIDAK DIKENAL");
let threw = null;
try { schemeFor(99); } catch (e) { threw = e; }
ok(threw !== null, "a version this engine has never heard of is refused, not guessed at");
const future = verifyChain([{ ...V2_CALL, hashVersion: 99, recordHash: "x", chainHash: "y" }]);
ok(!future.ok && /unknown hash version/.test(future.why),
  "and the chain reports it as unverifiable here, not as a row that was edited");

console.log("\nRANTAI CAMPURAN");
// The real migration case: a register that already holds v2 rows keeps taking
// v3 rows, and verifies end to end across the join.
const DATA = "./data/hashversion-test.json";
rmSync(DATA, { force: true });
const store = new FileStore(DATA);
const base = { chain: "solana", tokenAddress: "T", pairAddress: "P", symbol: "OLD",
  entryPriceUsd: 0.001, entrySupply: 1e9, entryMc: 1e6, entrySupplySource: "derived",
  liquidityUsd: 40000, score: 80, reasonIds: ["depth"], entryVolumeH1: 1000, entryVolumeM5: 100 };

store.insertCall({ ...base, hashVersion: 2, firedAt: "2026-08-01T00:00:00.000Z" });
store.insertCall({ ...base, hashVersion: 2, firedAt: "2026-08-02T00:00:00.000Z", symbol: "OLD2" });
const fresh = store.insertCall({ ...base, firedAt: "2026-08-03T00:00:00.000Z", symbol: "NEW" });

ok(fresh.hashVersion === HASH_VERSION, `a new call is written under v${HASH_VERSION}`);
const v = store.verify();
ok(v.ok, `a register holding both schemes verifies end to end (${v.count} calls)`);
ok(store.allCalls().map(c => c.hashVersion).join(",") === `2,2,${HASH_VERSION}`,
  "each row keeps the version it was written under");

// And the chain still catches a real edit, on a row of either version.
const calls = store.allCalls().map(c => ({ ...c }));
calls[0].entryMc = 999;
ok(!verifyChain(calls).ok, "editing a v2 row is still caught");
const calls2 = store.allCalls().map(c => ({ ...c }));
calls2[2].entryVolumeH1 = 999;
const caught = verifyChain(calls2);
ok(!caught.ok && caught.seq === 3,
  "and editing the volume on a v3 row is caught too — which it would not have been under v2");

rmSync(DATA, { force: true });
console.log(failures ? `\n${failures} GAGAL\n` : "\nsemua lolos\n");
process.exit(failures ? 1 : 0);
