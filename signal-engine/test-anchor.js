/**
 * Anchoring, before a funded key is ever wired to it.
 *
 * The register's hash chain is internally consistent and that is all it is:
 * anyone who can write the file can recompute the whole thing. Anchoring is
 * what makes it hold against someone with write access, by publishing the head
 * somewhere we cannot reach. Until that happens the product's central claim is
 * unbacked, so the mechanism has to be right before it is trusted with money.
 *
 * There is no EVM in this environment, so the publisher is a function here
 * rather than a chain. That is the honest boundary of this file: it proves
 * what we build, what we record, what we refuse and what we can prove to a
 * third party. It does not prove a transaction lands. Wiring a real key is
 * still a first run to be watched, not a formality.
 *
 * The case that matters most is the failure: a publisher that throws must
 * leave its window pending, or the calls it covered are never anchored by
 * anyone and nobody finds out.
 */
import { rmSync } from "node:fs";
import { FileStore } from "./store.js";
import { buildAnchor, publishAnchor, pendingWindow, proofFor } from "./anchor.js";
import { verifyProof, merkleRoot } from "./merkle.js";
import { toCsv } from "./og.js";
import { verifyCsv } from "./verify.js";

const DATA = "./data/anchor-test.json";
let failures = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "ok   " : "GAGAL"}  ${msg}`); if (!cond) failures++; };

rmSync(DATA, { force: true });
const store = new FileStore(DATA);
const add = n => store.insertCall({
  callerId: 1, chain: "solana", tokenAddress: "T" + n, pairAddress: "P" + n, symbol: "S" + n,
  firedAt: new Date(Date.UTC(2026, 7, n, 12)).toISOString(),
  entryPriceUsd: 0.001, entrySupply: 1e9, entryMc: 1e6, entrySupplySource: "derived",
  liquidityUsd: 40_000, score: 80, reasonIds: ["depth"],
  entryVolumeH1: 1000 * n, entryVolumeM5: 100 * n,
});
[1, 2, 3].forEach(add);

console.log("\nAPA YANG DIBANGUN");
const a1 = await buildAnchor(store);
ok(a1.seqFrom === 1 && a1.seqTo === 3 && a1.count === 3,
  `the first anchor covers everything written so far (seq ${a1.seqFrom}-${a1.seqTo})`);
ok(a1.chainHead === await store.head(),
  "it pins the head of the whole chain, so the register's shape is fixed too");
ok(a1.merkleRoot === merkleRoot((await store.allCalls()).map(c => c.recordHash)),
  "and a merkle root over this window's record hashes, and nothing else");
ok(a1.merkleRoot !== a1.chainHead,
  "the two are different commitments — one proves the shape, the other proves a member");

console.log("\nPUBLISHER GAGAL");
// The failure that loses calls silently: the window must stay pending so the
// next run re-covers it, rather than being marked done and skipped for ever.
let logged = "";
const failed = await publishAnchor(store, () => { throw new Error("rpc down"); }, m => { logged += m; });
ok(failed.txHash === null, "a publisher that throws records the anchor with no transaction");
ok(/NOT published/.test(logged), "and says out loud that the register is still unanchored");
const stillPending = await pendingWindow(store);
ok(stillPending.seqFrom === 1 && stillPending.calls.length === 3,
  "the window stays pending — the next run re-covers those calls rather than skipping them");

console.log("\nPUBLISHER BERHASIL");
const sent = [];
const published = await publishAnchor(store, a => { sent.push(a); return "0xdeadbeef"; }, () => {});
ok(published.txHash === "0xdeadbeef", "a publisher that returns a hash has it recorded");
ok(sent[0].merkleRoot === published.merkleRoot && sent[0].chainHead === published.chainHead,
  "and what was published is what was recorded — not a second, later computation");
ok((await pendingWindow(store)).calls.length === 0, "nothing is pending once it is published");

add(4); add(5);
const a2 = await buildAnchor(store);
ok(a2.seqFrom === 4 && a2.seqTo === 5,
  `the next anchor starts where the published one ended (seq ${a2.seqFrom}-${a2.seqTo})`);
ok(a2.merkleRoot !== published.merkleRoot, "over its own window, not the whole register again");

console.log("\nBUKTI UNTUK PIHAK KETIGA");
const p = await proofFor(store, 2);
ok(p !== null, "a call inside a published window can be proved");
ok(p.verifiesLocally === true, "and the proof checks against the root that was published");
ok(verifyProof(p.recordHash, p.proof, p.merkleRoot),
  "recomputed here from the leaf and the siblings alone, without the rest of the register");
ok(p.anchorTx === "0xdeadbeef" && p.chainHead === published.chainHead,
  "carrying the transaction and the chain head a third party checks it against");
ok(!verifyProof("0".repeat(64), p.proof, p.merkleRoot),
  "and a different record hash does not verify against the same proof");

ok((await proofFor(store, 4)) === null,
  "a call written after the last publication has no proof yet — and is not given one");
ok((await proofFor(store, 99)) === null, "nor does a call that does not exist");

console.log("\nRANTAI RUSAK TIDAK DI-ANCHOR");
// Publishing the head of a chain that no longer verifies would put our name on
// a broken record, permanently and in public.
rmSync(DATA, { force: true });
const bad = new FileStore(DATA);
const store2 = bad;
[1, 2].forEach(n => store2.insertCall({
  callerId: 1, chain: "solana", tokenAddress: "T" + n, pairAddress: "P" + n, symbol: "S" + n,
  firedAt: new Date(Date.UTC(2026, 7, n, 12)).toISOString(),
  entryPriceUsd: 0.001, entrySupply: 1e9, entryMc: 1e6, entrySupplySource: "derived",
  liquidityUsd: 40_000, score: 80, reasonIds: ["depth"], entryVolumeH1: 1, entryVolumeM5: 1,
}));
store2.db.calls[0].entryMc = 999;          // the edit the whole product exists to catch
let refused = null;
try { await buildAnchor(store2); } catch (e) { refused = e; }
ok(refused !== null && /refusing to anchor a broken chain/.test(refused.message),
  "a chain that no longer verifies is refused, not published");

let published2 = "no";
try { await publishAnchor(store2, () => { published2 = "yes"; return "0xbad"; }, () => {}); }
catch { /* the throw is the point */ }
ok(published2 === "no", "and the publisher is never called — nothing reaches the chain");

rmSync(DATA, { force: true });

console.log("\nCSV PUBLIK BISA DIHITUNG ULANG");
// The CSV is the only artefact an outsider actually holds. Nothing tested the
// round trip until this block existed, and it did not survive it: a call whose
// provider reported no volume hashed entryVolumeH1 as null and exported it as
// an empty cell, which reads back as "" — so the register's own export failed
// to recompute its own chain, and the standalone verifier said "edited".
const csvStore = new FileStore(DATA);
csvStore.insertCall({
  callerId: 1, chain: "solana", tokenAddress: "TV", pairAddress: "PV", symbol: "VOL",
  firedAt: new Date(Date.UTC(2026, 7, 10, 12)).toISOString(),
  entryPriceUsd: 0.001, entrySupply: 1e9, entryMc: 1e6, entrySupplySource: "derived",
  liquidityUsd: 40_000, score: 80, reasonIds: ["depth", "accel"],
  sourceKind: "screener", sourceRef: "helius",
  entryVolumeH1: 52_000, entryVolumeM5: 4_100,
});
// The case that broke it: a provider that answered without volume at all.
csvStore.insertCall({
  callerId: 2, chain: "base", tokenAddress: "TQ", pairAddress: "PQ", symbol: "QUIET",
  firedAt: new Date(Date.UTC(2026, 7, 10, 13)).toISOString(),
  entryPriceUsd: 0.002, entrySupply: 5e8, entryMc: 1e6, entrySupplySource: "provider",
  liquidityUsd: 55_000, score: 82, reasonIds: [], sourceKind: "screener", sourceRef: null,
});

const csv = toCsv(csvStore.register());
const cols = csv.split("\n")[0].split(",");
const quiet = csv.split("\n")[2].split(",");
const cell = name => quiet[cols.indexOf(name)];
ok(cell("entryVolumeH1") === "\\N" && cell("entryVolumeM5") === "\\N",
  "volume the provider never sent exports as absent, not as an empty cell");
ok(cell("secondsTo2x") === "", "an unhashed field stays blank — the marker is only for what is hashed");
const back = verifyCsv(csv);
ok(back.ok, `the published CSV recomputes its own chain (${back.rows} calls)`
  + (back.ok ? "" : ` — ${back.problems.map(p => p.seq + ": " + p.why).join("; ")}`));
ok(back.head === await csvStore.head(), "and lands on the same head the register holds");

ok(!verifyCsv(csv.replace("52000", "99000")).ok, "one edited number breaks the recomputation");
const rows = csv.split("\n"); rows.splice(1, 1);
ok(!verifyCsv(rows.join("\n")).ok, "one removed row breaks it too");

rmSync(DATA, { force: true });
console.log(failures ? `\n${failures} GAGAL\n` : "\nsemua lolos\n");
process.exit(failures ? 1 : 0);
