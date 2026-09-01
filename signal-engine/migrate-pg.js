/**
 * Move a FileStore register into Postgres without breaking a single hash.
 *
 * The hashes are not recomputed. Every call's record_hash and chain_hash go
 * across exactly as they were written, and the migration then verifies the
 * chain out of the database rather than out of the file — because the whole
 * question is whether the round trip changed a hashed value, and recomputing
 * the hash on the way in would answer it with itself.
 *
 * Anything that does not survive is a hard failure. A register that half
 * migrated is worse than one that did not: `calls` refuses DELETE, so the bad
 * rows cannot be taken out afterwards.
 *
 *   node migrate-pg.js --from ./data/register.json --to postgres://…
 *   node migrate-pg.js --dry            # verify only, write nothing
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { PgStore } from "./pgstore.js";
import { recordHash, verifyChain } from "./integrity.js";

const arg = (name, dflt) => {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1] : dflt;
};
const has = name => process.argv.includes("--" + name);

const FROM = arg("from", "./data/register.json");
const TO = arg("to", process.env.DATABASE_URL);
const DRY = has("dry");

if (!TO && !DRY) {
  console.error("need --to postgres://… or DATABASE_URL (or --dry to check only)");
  process.exit(2);
}

const db = JSON.parse(readFileSync(FROM, "utf8"));
const calls = db.calls ?? [];
console.log(`${FROM}: ${calls.length} calls, head ${String(db.head).slice(0, 16)}…`);

// Refuse to migrate a register that is already broken. Copying it into a table
// that cannot delete rows would make the damage permanent.
const before = verifyChain(calls);
if (!before.ok) {
  console.error(`REFUSING: the source register does not verify — ${before.why} (seq ${before.seq})`);
  process.exit(1);
}
console.log(`source verifies: ${before.count} calls, head ${before.head.slice(0, 16)}…`);
if (DRY) { console.log("--dry: nothing written"); process.exit(0); }

const pool = new pg.Pool({ connectionString: TO });
const store = await new PgStore({ pool, log: console.log }).init();

if ((await store.allCalls()).length) {
  console.error("REFUSING: the target already holds calls — migrate into an empty register");
  await store.close();
  process.exit(1);
}

/* Insert with the hashes the file already carries rather than letting the store
   compute new ones. seq is taken from the file too: it is not hashed, but the
   published /call/:seq links are built from it and they must not move. */
let n = 0;
const client = await pool.connect();
try {
  await client.query("BEGIN");
  for (const c of calls) {
    if (recordHash(c) !== c.recordHash)
      throw new Error(`call ${c.seq} does not hash to its own record_hash in the source file`);

    await client.query(
      `INSERT INTO tokens (chain, address, symbol, name, image_url)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (chain, address) DO NOTHING`,
      [c.chain, c.tokenAddress, c.symbol, c.name ?? null, c.imageUrl ?? null]);

    const ins = await client.query(
      `INSERT INTO calls (
         seq, caller_id, chain, token_address, fired_at,
         entry_price, entry_supply, entry_mc,
         hash_version, pair_address, symbol, entry_supply_source, liquidity_usd,
         score, reason_ids, entry_volume_h1, entry_volume_m5,
         name, dex, image_url, reasons, links, chain_checks,
         source_kind, source_ref, record_hash, chain_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
               $18,$19,$20,$21,$22,$23,$24,$25,decode($26,'hex'),decode($27,'hex'))
       RETURNING id`,
      [c.seq, c.callerId ?? 1, c.chain, c.tokenAddress, c.firedAt,
       c.entryPriceUsd, c.entrySupply, c.entryMc,
       c.hashVersion ?? 2, c.pairAddress, c.symbol, c.entrySupplySource ?? "derived",
       c.liquidityUsd ?? 0, c.score ?? 0, c.reasonIds ?? [],
       c.entryVolumeH1 ?? 0, c.entryVolumeM5 ?? 0,
       c.name ?? null, c.dex ?? null, c.imageUrl ?? null,
       c.reasons ?? null, c.links ? JSON.stringify(c.links) : null,
       c.chainChecks ? JSON.stringify(c.chainChecks) : null,
       c.sourceKind ?? "screener", c.sourceRef ?? null, c.recordHash, c.chainHash]);

    const id = ins.rows[0].id;
    const m = db.marks?.[c.seq] ?? {};
    await client.query(
      `INSERT INTO call_marks (call_id, peak_mc, peak_at, peak_x,
         peak_all_mc, peak_all_x, peak_all_at, now_mc, now_x,
         first_2x_at, seconds_to_2x, observed_live, state, verdict, is_dead,
         dead_at, settled_at, links, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [id, m.peakMc ?? c.entryMc, m.peakAt ?? c.firedAt, m.peakX ?? 1,
       m.peakAllMc ?? m.peakMc ?? c.entryMc, m.peakAllX ?? m.peakX ?? 1,
       m.peakAllAt ?? m.peakAt ?? c.firedAt,
       m.nowMc ?? c.entryMc, m.nowX ?? 1,
       m.firstTwoXAt ?? null, m.secondsTo2x ?? null, m.observedLive ?? true,
       m.state ?? "live", m.verdict ?? "open", m.isDead ?? false,
       m.deadAt ?? null, m.settledAt ?? null,
       m.links ? JSON.stringify(m.links) : null, m.updatedAt ?? c.firedAt]);

    for (const [ts, mc] of db.samples?.[c.seq] ?? [])
      await client.query(
        `INSERT INTO call_samples (call_id, ts, mc) VALUES ($1, to_timestamp($2), $3)
         ON CONFLICT (call_id, ts) DO NOTHING`, [id, ts, mc]);
    n++;
  }

  for (const a of db.anchors ?? [])
    await client.query(
      `INSERT INTO anchors (seq_from, seq_to, chain_head, merkle_root, call_count, tx_hash, built_at)
       VALUES ($1,$2,decode($3,'hex'),decode($4,'hex'),$5,$6,$7)`,
      [a.seqFrom, a.seqTo, a.chainHead, a.merkleRoot, a.count, a.txHash ?? null, a.at]);

  // The sequence has to continue past what was migrated, or the next call
  // written collides with a row that cannot be deleted.
  await client.query(
    "SELECT setval('calls_seq_seq', GREATEST((SELECT max(seq) FROM calls), 1))");
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`REFUSING: nothing was written — ${e.message}`);
  await store.close();
  process.exit(1);
} finally { client.release(); }

/* The only check that means anything: verify out of the database, over rows
   read back through the driver, against the hashes the file carried. */
const after = await store.verify();
const head = await store.head();
console.log(`migrated ${n} calls`);
if (!after.ok) {
  console.error(`BROKEN AFTER MIGRATION: ${after.why} (seq ${after.seq})`);
  await store.close();
  process.exit(1);
}
if (head !== db.head) {
  console.error(`BROKEN AFTER MIGRATION: head is ${head}, the file said ${db.head}`);
  await store.close();
  process.exit(1);
}
console.log(`verified from Postgres: ${after.count} calls, head ${head.slice(0, 16)}… — unchanged`);
await store.close();
