/**
 * Storage. Two drivers behind one interface so the pipeline runs today on a
 * file and moves to Postgres without touching the workers.
 *
 * Calls are append-only in both drivers, matching the RULE ... DO INSTEAD
 * NOTHING guard in schema.sql. Marks are the only mutable table.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { recordHash, linkHash, GENESIS, verifyChain, HASH_VERSION } from "./integrity.js";

/**
 * Observed marks kept per call, so a chart can plot points the poller actually
 * saw rather than a curve drawn between entry, peak and now. Twenty-four hours
 * at a 20s poll is 4,320 of them — more than any shape needs and more than an
 * API should carry — so the series halves itself when full by dropping every
 * second interior point. That keeps the span and the shape; it loses
 * resolution, which is the right thing to lose. First and last always survive.
 */
const SAMPLE_CAP = 96;
function decimate(series) {
  if (series.length <= SAMPLE_CAP) return series;
  const kept = [series[0]];
  for (let i = 1; i < series.length - 1; i += 2) kept.push(series[i]);
  kept.push(series[series.length - 1]);
  return kept;
}
/** Evenly spaced subset, for the small chart on a card. */
function thin(series, n) {
  if (series.length <= n) return series;
  const out = [];
  for (let i = 0; i < n - 1; i++) out.push(series[Math.floor(i * (series.length - 1) / (n - 1))]);
  out.push(series[series.length - 1]);
  return out;
}

export class FileStore {
  constructor(path = "./data/register.json") {
    this.path = path;
    this.db = existsSync(path)
      ? JSON.parse(readFileSync(path, "utf8"))
      : { calls: [], marks: {}, anchors: [], head: GENESIS, seq: 0 };
  }
  #flush() {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.db, null, 2));
  }

  /** Insert is the only write path for calls. It also extends the hash chain. */
  insertCall(signal) {
    const call = {
      ...signal,
      seq: ++this.db.seq,
      hashVersion: signal.hashVersion ?? HASH_VERSION,
      callerId: signal.callerId ?? 1,
      sourceKind: signal.sourceKind ?? "screener",
      sourceRef: signal.sourceRef ?? null,
    };
    call.recordHash = recordHash(call);
    call.chainHash = linkHash(this.db.head, call.recordHash);
    this.db.head = call.chainHash;
    this.db.calls.push(call);
    (this.db.samples ??= {})[call.seq] = [[Math.round(Date.parse(call.firedAt) / 1000), call.entryMc]];
    this.db.marks[call.seq] = {
      seq: call.seq,
      peakMc: call.entryMc, peakAt: call.firedAt, peakX: 1,
      peakAllMc: call.entryMc, peakAllX: 1, peakAllAt: call.firedAt,
      nowMc: call.entryMc, nowX: 1,
      firstTwoXAt: null, secondsTo2x: null, observedLive: true,
      state: "live", verdict: "open", isDead: false, deadAt: null, settledAt: null,
      peakSource: "observed", samples: 1, updatedAt: call.firedAt,
    };
    this.#flush();
    return call;
  }

  liveCalls() { return this.db.calls.filter(c => this.db.marks[c.seq].state === "live"); }
  allCalls()  { return this.db.calls; }
  mark(seq)   { return this.db.marks[seq]; }
  setMark(seq, m) {
    this.db.marks[seq] = m;
    // Every mark is a sample. Recording it here rather than in the worker keeps
    // the two from drifting apart, and costs the same single flush.
    const s = ((this.db.samples ??= {})[seq] ??= []);
    s.push([Math.round(Date.parse(m.updatedAt ?? new Date().toISOString()) / 1000), m.nowMc]);
    this.db.samples[seq] = decimate(s);
    this.#flush();
  }
  samples(seq) { return this.db.samples?.[seq] ?? []; }
  register()  {
    return this.db.calls.map(c => ({
      ...c, ...this.db.marks[c.seq],
      // Values only, and few of them: the card draws a 24-point line and the
      // full series is a call away at /api/call/:seq for anyone recomputing.
      spark: thin(this.samples(c.seq), 24).map(([, mc]) => mc),
    }));
  }
  head()      { return this.db.head; }
  verify()    { return verifyChain(this.db.calls); }
  anchors()   { return this.db.anchors; }
  addAnchor(a){ this.db.anchors.push(a); this.#flush(); }
  /** Latest anchor that already covers this call, if one has been published. */
  anchorFor(seq) {
    return this.db.anchors.filter(a => a.seqTo >= seq && a.txHash)
      .sort((x, y) => x.seqTo - y.seqTo)[0] ?? null;
  }
  /* ── telegram subscribers ──
   *
   * Operational state, not evidence: nothing here is hashed and a subscriber
   * may be edited or removed, which is the opposite of a call. It lives beside
   * the register rather than inside it so that distinction stays visible.
   *
   * No tier is stored. A key can be sold between the moment its holder links a
   * chat and the moment a signal fires, and a stored tier would keep sending
   * the seller their old latency and leave the buyer on the public leg. The
   * tier is read from the chain at send time, every time.
   */
  #subs() { return (this.db.subs ??= {}); }
  addSubscriber(chatId) {
    const s = this.#subs();
    const now = new Date().toISOString();
    s[chatId] = { ...(s[chatId] ?? { chatId, address: null, filters: {}, createdAt: now }),
                  active: true, seenAt: now };
    this.#flush();
    return s[chatId];
  }
  subscriber(chatId) { return this.#subs()[chatId] ?? null; }
  subscriberByAddress(address) {
    const a = String(address).toLowerCase();
    return Object.values(this.#subs()).find(x => x.address === a) ?? null;
  }
  /** One address, one chat. Linking again moves it rather than fanning out. */
  linkSubscriber(chatId, address) {
    const s = this.#subs(), a = String(address).toLowerCase();
    for (const row of Object.values(s)) if (row.address === a && row.chatId !== chatId) row.address = null;
    const row = s[chatId] ?? this.addSubscriber(chatId);
    row.address = a;
    row.linkedAt = new Date().toISOString();
    row.active = true;
    this.#flush();
    return row;
  }
  unlinkSubscriber(chatId) {
    const row = this.#subs()[chatId];
    if (!row) return null;
    row.address = null; row.linkedAt = null;
    this.#flush();
    return row;
  }
  setSubscriberFilters(chatId, filters) {
    const row = this.#subs()[chatId];
    if (!row) return null;
    row.filters = filters;
    this.#flush();
    return row;
  }
  /** A blocked bot is not an error to retry for ever; it is a subscriber gone. */
  deactivateSubscriber(chatId) {
    const row = this.#subs()[chatId];
    if (!row) return null;
    row.active = false;
    this.#flush();
    return row;
  }
  subscribers() { return Object.values(this.#subs()).filter(x => x.active); }

  hasToken(chain, addr, withinMs) {
    const cut = Date.now() - withinMs;
    return this.db.calls.some(c =>
      c.chain === chain && c.tokenAddress === addr && Date.parse(c.firedAt) > cut);
  }
}
