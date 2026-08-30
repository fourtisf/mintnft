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
  setMark(seq, m) { this.db.marks[seq] = m; this.#flush(); }
  register()  { return this.db.calls.map(c => ({ ...c, ...this.db.marks[c.seq] })); }
  head()      { return this.db.head; }
  verify()    { return verifyChain(this.db.calls); }
  anchors()   { return this.db.anchors; }
  addAnchor(a){ this.db.anchors.push(a); this.#flush(); }
  /** Latest anchor that already covers this call, if one has been published. */
  anchorFor(seq) {
    return this.db.anchors.filter(a => a.seqTo >= seq && a.txHash)
      .sort((x, y) => x.seqTo - y.seqTo)[0] ?? null;
  }
  hasToken(chain, addr, withinMs) {
    const cut = Date.now() - withinMs;
    return this.db.calls.some(c =>
      c.chain === chain && c.tokenAddress === addr && Date.parse(c.firedAt) > cut);
  }
}
