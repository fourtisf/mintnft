/**
 * The Postgres driver, against a real Postgres.
 *
 * Two questions only this file can answer.
 *
 * First, does a call survive the round trip byte for byte? The chain hashes
 * String(entryPriceUsd), and Postgres hands numeric back as a string with the
 * column's full scale — "0.000433500000000000" for a price the app holds as
 * 0.0004335. Anything that changes a hashed value on the way through produces
 * a row that can never verify, on a table that cannot correct it.
 *
 * Second, does append-only mean anything? In the file driver it is a promise
 * the application keeps. Here `RULE ... DO INSTEAD NOTHING` is supposed to make
 * the database refuse the edit even when the application asks for it, and that
 * claim is worth exactly as much as a test that tries the edit.
 *
 * Needs a database. Without TEST_DATABASE_URL it skips and says so — a skipped
 * test that prints nothing is how a suite comes to look green over a driver
 * nobody has run.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { PgStore } from "./pgstore.js";
import { recordHash, verifyChain, GENESIS } from "./integrity.js";
import { applyObservation } from "./scorer.js";

const DB_URL = process.env.TEST_DATABASE_URL;
if (!DB_URL) {
  console.log("\nDILEWATI: set TEST_DATABASE_URL untuk menjalankan driver Postgres.");
  console.log("  createdb nekara_test && TEST_DATABASE_URL=postgres://…/nekara_test node test-pg.js\n");
  process.exit(0);
}

let failures = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "ok   " : "GAGAL"}  ${msg}`); if (!cond) failures++; };

const pool = new pg.Pool({ connectionString: DB_URL, max: 8 });
await pool.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
await pool.query(readFileSync(new URL("../schema.sql", import.meta.url).pathname, "utf8"));

const store = await new PgStore({ pool, log: () => {} }).init();

/* A price with more decimals than a double prints, on a supply big enough that
   entryMc is not a round number either. If anything is going to be reformatted
   on the way through, it is this row. */
const SIGNAL = {
  callerId: 1, chain: "solana", tokenAddress: "So1111", pairAddress: "PAIR1",
  symbol: "APEC", name: "Ape & Closed AI", dex: "meteora",
  firedAt: new Date(Date.now() - 6 * 3600e3).toISOString(),
  entryPriceUsd: 0.00043352718, entrySupply: 999_999_999, entryMc: 433527.17956647283,
  entrySupplySource: "derived", liquidityUsd: 55_000.25, score: 82,
  reasons: ["Volume running 5.7× the hourly pace"], reasonIds: ["volume_acceleration"],
  entryVolumeH1: 52_000.5, entryVolumeM5: 9_000.25,
  links: [{ kind: "twitter", url: "https://x.com/apec" }],
  chainChecks: { source: "solana-rpc", have: ["mintAuthority"], mintAuthority: null },
};

console.log("\nBOLAK-BALIK TANPA BERUBAH");
const call = await store.insertCall(SIGNAL);
ok(call.seq === 1, "the first call takes seq 1");
ok(call.entryPriceUsd === SIGNAL.entryPriceUsd,
  `the price comes back as the same double (${call.entryPriceUsd})`);
ok(call.entryMc === SIGNAL.entryMc, `and so does the market cap (${call.entryMc})`);
ok(call.entryVolumeH1 === SIGNAL.entryVolumeH1, "and the volume, which v3 hashes");
ok(recordHash(call) === call.recordHash,
  "so the stored row hashes to the hash stored beside it");

const read = (await store.allCalls())[0];
ok(recordHash(read) === call.recordHash,
  "and re-reading it in a fresh query gives the same hash again");
ok(read.chainHash === call.chainHash, "with the same link onto the genesis head");
ok((await store.head()) === call.chainHash, "which is the head of the chain");
ok(read.chainChecks?.source === "solana-rpc" && read.chainChecks.mintAuthority === null
   && read.chainChecks.have.join() === "mintAuthority",
  "the on-chain reading survives, null authority included — jsonb reorders keys, it does not lose them");

console.log("\nHARGA YANG TIDAK MUAT DITOLAK");
// The columns are wide, not infinite. A value past 40 decimal places rounds,
// and a rounded hashed value is a row that can never verify on a table that
// cannot delete it — so the guard has to refuse it at insert. This is the
// failure that widening the columns hides rather than removes.
let refused = null;
try {
  await store.insertCall({ ...SIGNAL, tokenAddress: "So2222", pairAddress: "PAIR_TINY",
    firedAt: new Date(Date.now() - 5 * 3600e3).toISOString(),
    entryPriceUsd: 1.2345e-45, entryMc: 1.2345e-36 });
} catch (e) { refused = e; }
ok(refused !== null && /did not survive the round trip/.test(refused.message),
  "a price the column cannot hold is refused at insert, not written and discovered later");
ok((await store.allCalls()).length === 1, "and no row is left behind by the refusal");

console.log("\nRANTAI LINTAS BANYAK CALL");
for (let i = 2; i <= 5; i++)
  await store.insertCall({ ...SIGNAL, tokenAddress: "So" + i, pairAddress: "PAIR" + i,
    symbol: "TK" + i, firedAt: new Date(Date.now() - i * 3600e3).toISOString() });
const all = await store.allCalls();
ok(all.length === 5, "five calls on the register");
const v = await store.verify();
ok(v.ok, `the chain verifies end to end from the database (${v.count} calls)`);
ok(v.head === (await store.head()), "and the head it computes is the head stored");

console.log("\nAPPEND-ONLY DIJAGA DATABASE, BUKAN APLIKASI");
// The claim in CLAUDE.md non-negotiable 1, tested by asking the database to
// break it. A silent no-op is the correct answer here.
const before = (await store.allCalls())[0].entryMc;
await pool.query("UPDATE calls SET entry_mc = 1 WHERE seq = 1");
ok((await store.allCalls())[0].entryMc === before,
  "an UPDATE against calls changes nothing — the rule refuses it");
await pool.query("DELETE FROM calls WHERE seq = 1");
ok((await store.allCalls()).length === 5, "and a DELETE removes nothing");
ok((await store.verify()).ok, "so the chain is still intact after both attempts");

console.log("\nUJI TAMPER: EDIT DAN PENGHAPUSAN TETAP TERTANGKAP");
// The database refuses the edit, so tampering has to be simulated on the rows
// the way verifyChain sees them — which is what a reader recomputing the chain
// from an export would be doing anyway.
// Sequence numbers are not contiguous and are not meant to be: the refused
// insert above consumed one from the bigserial before rolling back. The chain
// links on order, not on arithmetic, so a gap is not a missing call.
const rows = await store.allCalls();
const target = rows[2].seq;
const edited = rows.map(c => ({ ...c }));
edited[2].entryMc = 999;
const e1 = verifyChain(edited);
ok(!e1.ok && e1.seq === target && /record hash/.test(e1.why),
  `an edited call is caught at seq ${e1.seq} — "${e1.why}"`);

const removed = rows.filter(c => c.seq !== target);
const e2 = verifyChain(removed);
ok(!e2.ok && /chain hash/.test(e2.why),
  `a removed call is caught at seq ${e2.seq} — "${e2.why}"`);
ok(rows.map(c => c.seq).join(",") !== "1,2,3,4,5",
  `and a gap left by a refused insert is not itself a break (seq ${rows.map(c => c.seq).join(", ")})`);

console.log("\nMARK, SAMPEL DAN ANCHOR");
const c1 = (await store.allCalls())[0];
let m = await store.mark(c1.seq);
ok(m.state === "live" && m.verdict === "open" && m.peakX === 1,
  "a fresh call is live and open at 1.00×");
for (const mc of [c1.entryMc * 1.4, c1.entryMc * 2.3, c1.entryMc * 0.05]) {
  m = applyObservation(c1, await store.mark(c1.seq), mc);
  await store.setMark(c1.seq, m);
}
const settled = await store.mark(c1.seq);
ok(settled.verdict === "win", "a call that touched 2× is a win");
ok(settled.isDead === true, "and dead, both on the same row — neither replaces the other");
ok((await store.samples(c1.seq)).length === 4,
  "every mark left a sample, the entry included");
/* The exit is read back out of this table on every poll to decide whether it
   has already been alerted. A column the driver forgets to write is not a
   missing display field — it is an exit rediscovered and re-broadcast on every
   pass, for ever. So it is asserted here rather than assumed. */
ok(settled.exitAt && Math.abs(settled.exitX - 0.05) < 1e-9,
  `the trailing stop that filled during those marks survives the round trip (${settled.exitX})`);
ok(Math.abs(settled.exitHighX - 2.3) < 1e-9 && settled.exitRule === "trail",
  "with the high it followed and the rule that named it");
const stillOpen = await store.mark((await store.allCalls())[1].seq);
ok(stillOpen.exitAt === undefined,
  "and a mark with no exit reads back with no exit, not with a null one");
const reg = await store.register();
ok(reg.length === 5 && reg[0].spark.length === 4,
  "the register carries the call, its mark and the observed series in one read");
ok(reg[0].links.length === 1, "and the token's links");

await store.addAnchor({ seqFrom: 1, seqTo: 5, chainHead: await store.head(),
  merkleRoot: "ab".repeat(32), count: 5, at: new Date().toISOString(), txHash: null });
ok((await store.anchors()).length === 1, "an anchor built but not published is recorded");
ok((await store.anchorFor(3)) === null,
  "and proves nothing — only a transaction makes an anchor an anchor");
await store.addAnchor({ seqFrom: 1, seqTo: 5, chainHead: await store.head(),
  merkleRoot: "cd".repeat(32), count: 5, at: new Date().toISOString(), txHash: "0xabc" });
ok((await store.anchorFor(3))?.txHash === "0xabc", "a published one does");

console.log("\nSTATISTIK DARI VIEW, BUKAN QUERY DADAKAN");
const cs = await store.callerStats();
ok(cs.length === 1 && Number(cs[0].calls) === 5,
  `caller_stats counts every call (${cs[0]?.calls})`);
ok(Number(cs[0].wins) === 1 && Number(cs[0].hit_rate) === 0.2,
  "and the hit rate is wins over all of them — 1 of 5, misses included");

await store.close();
console.log(failures ? `\n${failures} GAGAL\n` : "\nsemua lolos\n");
process.exit(failures ? 1 : 0);
