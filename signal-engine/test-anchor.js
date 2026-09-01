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
const a1 = buildAnchor(store);
ok(a1.seqFrom === 1 && a1.seqTo === 3 && a1.count === 3,
  `the first anchor covers everything written so far (seq ${a1.seqFrom}-${a1.seqTo})`);
ok(a1.chainHead === store.head(),
  "it pins the head of the whole chain, so the register's shape is fixed too");
ok(a1.merkleRoot === merkleRoot(store.allCalls().map(c => c.recordHash)),
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
const stillPending = pendingWindow(store);
ok(stillPending.seqFrom === 1 && stillPending.calls.length === 3,
  "the window stays pending — the next run re-covers those calls rather than skipping them");

console.log("\nPUBLISHER BERHASIL");
const sent = [];
const published = await publishAnchor(store, a => { sent.push(a); return "0xdeadbeef"; }, () => {});
ok(published.txHash === "0xdeadbeef", "a publisher that returns a hash has it recorded");
ok(sent[0].merkleRoot === published.merkleRoot && sent[0].chainHead === published.chainHead,
  "and what was published is what was recorded — not a second, later computation");
ok(pendingWindow(store).calls.length === 0, "nothing is pending once it is published");

add(4); add(5);
const a2 = buildAnchor(store);
ok(a2.seqFrom === 4 && a2.seqTo === 5,
  `the next anchor starts where the published one ended (seq ${a2.seqFrom}-${a2.seqTo})`);
ok(a2.merkleRoot !== published.merkleRoot, "over its own window, not the whole register again");

console.log("\nBUKTI UNTUK PIHAK KETIGA");
const p = proofFor(store, 2);
ok(p !== null, "a call inside a published window can be proved");
ok(p.verifiesLocally === true, "and the proof checks against the root that was published");
ok(verifyProof(p.recordHash, p.proof, p.merkleRoot),
  "recomputed here from the leaf and the siblings alone, without the rest of the register");
ok(p.anchorTx === "0xdeadbeef" && p.chainHead === published.chainHead,
  "carrying the transaction and the chain head a third party checks it against");
ok(!verifyProof("0".repeat(64), p.proof, p.merkleRoot),
  "and a different record hash does not verify against the same proof");

ok(proofFor(store, 4) === null,
  "a call written after the last publication has no proof yet — and is not given one");
ok(proofFor(store, 99) === null, "nor does a call that does not exist");

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
try { buildAnchor(store2); } catch (e) { refused = e; }
ok(refused !== null && /refusing to anchor a broken chain/.test(refused.message),
  "a chain that no longer verifies is refused, not published");

let published2 = "no";
try { await publishAnchor(store2, () => { published2 = "yes"; return "0xbad"; }, () => {}); }
catch { /* the throw is the point */ }
ok(published2 === "no", "and the publisher is never called — nothing reaches the chain");

rmSync(DATA, { force: true });
console.log(failures ? `\n${failures} GAGAL\n` : "\nsemua lolos\n");
process.exit(failures ? 1 : 0);
