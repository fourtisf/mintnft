/**
 * The Postgres driver, behind the same interface as FileStore.
 *
 * The file driver is correct and will not scale past one process. This one is
 * the store of record: schema.sql's `RULE ... DO INSTEAD NOTHING` makes `calls`
 * refuse UPDATE and DELETE at the database, so append-only stops being a
 * convention the application keeps and becomes something the database enforces
 * against the application.
 *
 * Two things this driver has to get right that the file driver got for free:
 *
 *   The hash is computed in the app, not in SQL. A digest computed by the
 *   database is a digest verified by trusting the database, and the whole point
 *   of the chain is that a reader does not have to.
 *
 *   A number has to survive the round trip exactly. `entry_price` is
 *   numeric(40,18) and comes back as the string "0.000433500000000000", while
 *   canonical() hashes String(0.0004335). Number() on the way back restores the
 *   double — but only while the column can hold it, and a token priced below
 *   1e-18 would be silently rounded into a row whose hash can never verify.
 *   So every insert reads its own row back and re-hashes it before committing.
 *   One extra SELECT per call, on a table that takes a few rows an hour, buys
 *   the guarantee that nothing unverifiable can ever be written.
 *
 * Reads are async here and sync in FileStore. Every call site awaits, which is
 * a no-op on the file driver, so both run through the same code.
 */
import pg from "pg";
import { recordHash, linkHash, GENESIS, verifyChain, HASH_VERSION } from "./integrity.js";

/* Postgres returns numeric as a string to avoid silently losing precision.
   Every numeric in this schema is a value the app holds as a double, and the
   canonical form hashes String(thatDouble) — so it has to come back as a
   double, not as the string the driver prefers. The alternative is a hash that
   depends on how a driver felt like formatting a number. */
const NUMERIC_OIDS = [1700, 700, 701];  // numeric, float4, float8
for (const oid of NUMERIC_OIDS) pg.types.setTypeParser(oid, v => (v === null ? null : Number(v)));
pg.types.setTypeParser(20, v => (v === null ? null : Number(v)));   // int8/bigint

const SAMPLE_CAP = 96;
function decimate(series) {
  if (series.length <= SAMPLE_CAP) return series;
  const kept = [series[0]];
  for (let i = 1; i < series.length - 1; i += 2) kept.push(series[i]);
  kept.push(series[series.length - 1]);
  return kept;
}
function thin(series, n) {
  if (series.length <= n) return series;
  const out = [];
  for (let i = 0; i < n - 1; i++) out.push(series[Math.floor(i * (series.length - 1) / (n - 1))]);
  out.push(series[series.length - 1]);
  return out;
}

const iso = v => (v == null ? null : new Date(v).toISOString());
const hex = buf => (buf == null ? null : Buffer.from(buf).toString("hex"));

/** One advisory lock id, so two writers cannot read the same chain head. */
const CHAIN_LOCK = 0x6e656b61;

export class PgStore {
  constructor({ url = process.env.DATABASE_URL, pool, callerId = 1, log = console.log } = {}) {
    if (!pool && !url) throw new Error("PgStore needs DATABASE_URL or a pool");
    this.pool = pool ?? new pg.Pool({ connectionString: url, max: 8 });
    this.callerId = callerId;
    this.log = log;
  }

  /** Seeds the house desk if it is not there. callers.id = 1 is the desk; the
   *  register is multi-caller from day one and this is just caller one. */
  async init() {
    await this.pool.query(
      `INSERT INTO callers (id, handle, display_name, kind)
       VALUES ($1, 'desk', 'The desk', 'house')
       ON CONFLICT (id) DO NOTHING`, [this.callerId]);
    await this.pool.query(
      `SELECT setval('callers_id_seq', GREATEST((SELECT max(id) FROM callers), 1))`);
    return this;
  }

  async close() { await this.pool.end(); }

  /* ─────────────────────────── writes ─────────────────────────── */

  /**
   * The only write path for calls, and it extends the chain.
   *
   * All of it in one transaction under an advisory lock: the chain head read
   * here has to still be the head when the row lands, or two calls written at
   * once both link onto the same predecessor and the chain forks silently.
   */
  async insertCall(signal) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock($1)", [CHAIN_LOCK]);

      const head = (await c.query(
        "SELECT chain_hash FROM calls ORDER BY seq DESC LIMIT 1")).rows[0];
      const prev = head ? hex(head.chain_hash) : GENESIS;

      const call = {
        ...signal,
        hashVersion: signal.hashVersion ?? HASH_VERSION,
        callerId: signal.callerId ?? this.callerId,
        sourceKind: signal.sourceKind ?? "screener",
        sourceRef: signal.sourceRef ?? null,
        entryVolumeH1: signal.entryVolumeH1 ?? 0,
        entryVolumeM5: signal.entryVolumeM5 ?? 0,
      };
      const rec = recordHash(call);
      const link = linkHash(prev, rec);

      await c.query(
        `INSERT INTO tokens (chain, address, symbol, name, image_url)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (chain, address) DO NOTHING`,
        [call.chain, call.tokenAddress, call.symbol, call.name ?? null, call.imageUrl ?? null]);

      const ins = await c.query(
        `INSERT INTO calls (
           caller_id, chain, token_address, fired_at,
           entry_price, entry_supply, entry_mc,
           hash_version, pair_address, symbol, entry_supply_source, liquidity_usd,
           score, reason_ids, entry_volume_h1, entry_volume_m5,
           name, dex, image_url, reasons, links, chain_checks,
           source_kind, source_ref, record_hash, chain_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
                 $17,$18,$19,$20,$21,$22,$23,$24,decode($25,'hex'),decode($26,'hex'))
         RETURNING id, seq`,
        [call.callerId, call.chain, call.tokenAddress, call.firedAt,
         call.entryPriceUsd, call.entrySupply, call.entryMc,
         call.hashVersion, call.pairAddress, call.symbol, call.entrySupplySource ?? "derived",
         call.liquidityUsd ?? 0, call.score ?? 0, call.reasonIds ?? [],
         call.entryVolumeH1, call.entryVolumeM5,
         call.name ?? null, call.dex ?? null, call.imageUrl ?? null,
         call.reasons ?? null, call.links ? JSON.stringify(call.links) : null,
         call.chainChecks ? JSON.stringify(call.chainChecks) : null,
         call.sourceKind, call.sourceRef, rec, link]);

      const { id, seq } = ins.rows[0];

      // Read it back and re-hash before committing. A numeric column that
      // rounded a price, a timestamp that lost microseconds — anything that
      // changed a hashed value on the way in produces a row that can never
      // verify, and on an append-only table it could never be corrected.
      const stored = rowToCall((await c.query(
        `SELECT c.*, cl.display_name AS caller_name FROM calls c
         JOIN callers cl ON cl.id = c.caller_id WHERE c.id = $1`, [id])).rows[0]);
      if (recordHash(stored) !== rec) {
        await c.query("ROLLBACK");
        throw new Error(
          `refusing call #${seq} ${call.symbol}: the stored row does not hash to what was inserted — ` +
          `a hashed value did not survive the round trip`);
      }

      await c.query(
        `INSERT INTO call_marks (call_id, peak_mc, peak_at, peak_x,
           peak_all_mc, peak_all_x, peak_all_at, now_mc, now_x,
           observed_live, state, verdict, is_dead, updated_at)
         VALUES ($1,$2,$3,1,$2,1,$3,$2,1,true,'live','open',false,$3)`,
        [id, call.entryMc, call.firedAt]);
      await c.query(
        "INSERT INTO call_samples (call_id, ts, mc) VALUES ($1,$2,$3)",
        [id, call.firedAt, call.entryMc]);

      await c.query("COMMIT");
      return { ...stored, seq, recordHash: rec, chainHash: link };
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally { c.release(); }
  }

  async setMark(seq, m) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const id = await this.#idOf(c, seq);
      if (!id) throw new Error(`no call at seq ${seq}`);
      const at = m.updatedAt ?? new Date().toISOString();
      await c.query(
        `UPDATE call_marks SET peak_mc=$2, peak_at=$3, peak_x=$4,
           peak_all_mc=$5, peak_all_x=$6, peak_all_at=$7, now_mc=$8, now_x=$9,
           first_2x_at=$10, seconds_to_2x=$11, observed_live=$12,
           state=$13, verdict=$14, is_dead=$15, dead_at=$16, settled_at=$17,
           links=$18, updated_at=$19
         WHERE call_id=$1`,
        [id, m.peakMc, m.peakAt, m.peakX,
         m.peakAllMc ?? m.peakMc, m.peakAllX ?? m.peakX, m.peakAllAt ?? m.peakAt,
         m.nowMc, m.nowX, m.firstTwoXAt ?? null, m.secondsTo2x ?? null,
         m.observedLive ?? true, m.state, m.verdict, m.isDead,
         m.deadAt ?? null, m.settledAt ?? null,
         m.links ? JSON.stringify(m.links) : null, at]);

      // Every mark is a sample, recorded here rather than in the worker so the
      // two cannot drift apart.
      await c.query(
        `INSERT INTO call_samples (call_id, ts, mc) VALUES ($1,$2,$3)
         ON CONFLICT (call_id, ts) DO UPDATE SET mc = EXCLUDED.mc`, [id, at, m.nowMc]);
      await this.#decimate(c, id);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally { c.release(); }
  }

  async #idOf(c, seq) {
    const { rows } = await c.query("SELECT id FROM calls WHERE seq = $1", [seq]);
    return rows[0]?.id ?? null;
  }

  /** Halve the series when it outgrows the cap, dropping every second interior
   *  point. Keeps the span and the shape and loses resolution, which is the
   *  right thing to lose. */
  async #decimate(c, id) {
    const { rows } = await c.query(
      "SELECT ts, mc FROM call_samples WHERE call_id=$1 ORDER BY ts", [id]);
    if (rows.length <= SAMPLE_CAP) return;
    const keep = new Set(decimate(rows).map(r => r.ts.toISOString()));
    const drop = rows.filter(r => !keep.has(r.ts.toISOString())).map(r => r.ts);
    if (drop.length) await c.query(
      "DELETE FROM call_samples WHERE call_id=$1 AND ts = ANY($2::timestamptz[])", [id, drop]);
  }

  async addAnchor(a) {
    await this.pool.query(
      `INSERT INTO anchors (seq_from, seq_to, chain_head, merkle_root, call_count,
                            tx_hash, built_at)
       VALUES ($1,$2,decode($3,'hex'),decode($4,'hex'),$5,$6,$7)`,
      [a.seqFrom, a.seqTo, a.chainHead, a.merkleRoot, a.count, a.txHash ?? null, a.at]);
  }

  /* ─────────────────────────── reads ─────────────────────────── */

  async allCalls() {
    const { rows } = await this.pool.query(
      `SELECT c.*, cl.display_name AS caller_name FROM calls c
       JOIN callers cl ON cl.id = c.caller_id ORDER BY c.seq`);
    return rows.map(rowToCall);
  }

  async liveCalls() {
    const { rows } = await this.pool.query(
      `SELECT c.*, cl.display_name AS caller_name FROM calls c
       JOIN call_marks m ON m.call_id = c.id
       JOIN callers cl ON cl.id = c.caller_id
       WHERE m.state = 'live' ORDER BY c.seq`);
    return rows.map(rowToCall);
  }

  async mark(seq) {
    const { rows } = await this.pool.query(
      `SELECT m.* FROM call_marks m JOIN calls c ON c.id = m.call_id WHERE c.seq = $1`, [seq]);
    return rows[0] ? rowToMark(rows[0], seq) : undefined;
  }

  async samples(seq) {
    const { rows } = await this.pool.query(
      `SELECT s.ts, s.mc FROM call_samples s JOIN calls c ON c.id = s.call_id
       WHERE c.seq = $1 ORDER BY s.ts`, [seq]);
    return rows.map(r => [Math.round(r.ts.getTime() / 1000), r.mc]);
  }

  /** The whole register in one round trip: one query for the rows, one for
   *  every sample. Per-call queries here turned a page load into N+1. */
  async register() {
    // Both tables carry `links`, and in `m.*` the mark's wins. That is right
    // when the mark has them and wrong when it does not: a call fired with its
    // socials recorded would come back with none. So the call's copy is aliased
    // out of the way and the mark only overrides when it actually has links.
    const { rows } = await this.pool.query(
      `SELECT c.*, m.*, c.links AS call_links, c.seq AS seq,
              cl.display_name AS caller_name
       FROM calls c
       JOIN call_marks m ON m.call_id = c.id
       JOIN callers cl ON cl.id = c.caller_id
       ORDER BY c.seq`);
    const series = await this.pool.query(
      `SELECT c.seq, s.ts, s.mc FROM call_samples s
       JOIN calls c ON c.id = s.call_id ORDER BY c.seq, s.ts`);
    const bySeq = {};
    for (const r of series.rows) (bySeq[r.seq] ??= []).push([Math.round(r.ts.getTime() / 1000), r.mc]);
    return rows.map(r => ({
      ...rowToCall(r), ...rowToMark(r, r.seq),
      spark: thin(bySeq[r.seq] ?? [], 24).map(([, mc]) => mc),
    }));
  }

  async head() {
    const { rows } = await this.pool.query(
      "SELECT chain_hash FROM calls ORDER BY seq DESC LIMIT 1");
    return rows[0] ? hex(rows[0].chain_hash) : GENESIS;
  }

  async verify() { return verifyChain(await this.allCalls()); }

  async anchors() {
    const { rows } = await this.pool.query("SELECT * FROM anchors ORDER BY id");
    return rows.map(r => ({
      seqFrom: r.seq_from, seqTo: r.seq_to,
      chainHead: hex(r.chain_head), merkleRoot: hex(r.merkle_root),
      count: r.call_count, at: iso(r.built_at), txHash: r.tx_hash,
    }));
  }

  async anchorFor(seq) {
    const { rows } = await this.pool.query(
      `SELECT * FROM anchors WHERE seq_to >= $1 AND tx_hash IS NOT NULL
       ORDER BY seq_to LIMIT 1`, [seq]);
    if (!rows[0]) return null;
    const r = rows[0];
    return { seqFrom: r.seq_from, seqTo: r.seq_to, chainHead: hex(r.chain_head),
             merkleRoot: hex(r.merkle_root), count: r.call_count,
             at: iso(r.built_at), txHash: r.tx_hash };
  }

  async hasToken(chain, addr, withinMs) {
    const { rows } = await this.pool.query(
      `SELECT 1 FROM calls WHERE chain = $1 AND token_address = $2
       AND fired_at > now() - ($3 || ' milliseconds')::interval LIMIT 1`,
      [chain, addr, String(withinMs)]);
    return rows.length > 0;
  }

  /* Published statistics come from the views in schema.sql, never from a query
     written next to the route that needs one. */
  async callerStats() { return (await this.pool.query("SELECT * FROM caller_stats")).rows; }
  async chainStats()  { return (await this.pool.query("SELECT * FROM chain_stats")).rows; }
}

/** A database row back into the shape the rest of the engine passes around.
 *  Every hashed field has to come out identical to what went in. */
function rowToCall(r) {
  return {
    seq: r.seq,
    hashVersion: r.hash_version,
    callerId: r.caller_id,
    callerName: r.caller_name,
    chain: r.chain,
    tokenAddress: r.token_address,
    pairAddress: r.pair_address,
    symbol: r.symbol,
    name: r.name,
    dex: r.dex,
    imageUrl: r.image_url,
    links: r.call_links ?? r.links ?? [],
    firedAt: iso(r.fired_at),
    entryPriceUsd: r.entry_price,
    entrySupply: r.entry_supply,
    entryMc: r.entry_mc,
    entrySupplySource: r.entry_supply_source,
    liquidityUsd: r.liquidity_usd,
    entryVolumeH1: r.entry_volume_h1,
    entryVolumeM5: r.entry_volume_m5,
    chainChecks: r.chain_checks ?? null,
    score: r.score,
    reasons: r.reasons ?? [],
    reasonIds: r.reason_ids ?? [],
    sourceKind: r.source_kind,
    sourceRef: r.source_ref,
    recordHash: hex(r.record_hash),
    chainHash: hex(r.chain_hash),
  };
}

function rowToMark(r, seq) {
  const m = {
    seq,
    peakMc: r.peak_mc, peakAt: iso(r.peak_at), peakX: r.peak_x,
    peakAllMc: r.peak_all_mc, peakAllX: r.peak_all_x, peakAllAt: iso(r.peak_all_at),
    nowMc: r.now_mc, nowX: r.now_x,
    firstTwoXAt: iso(r.first_2x_at), secondsTo2x: r.seconds_to_2x,
    observedLive: r.observed_live,
    state: r.state, verdict: r.verdict, isDead: r.is_dead,
    deadAt: iso(r.dead_at), settledAt: iso(r.settled_at),
    peakSource: "observed",
    updatedAt: iso(r.updated_at),
  };
  // Only when the mark has them, so spreading a mark over a call never erases
  // links the call was fired with.
  if (r.links) m.links = r.links;
  return m;
}
