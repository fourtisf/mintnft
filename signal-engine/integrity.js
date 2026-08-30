/**
 * Append-only integrity chain.
 *
 * Every call is hashed at insert over its immutable fields only. Each hash is
 * chained onto the previous one, so removing or editing any past call breaks
 * every hash after it. Publish the head daily and the claim "nothing gets
 * deleted" stops being a promise and becomes something anyone can check.
 */
import { createHash } from "node:crypto";

const sha256 = b => createHash("sha256").update(b).digest("hex");

/** Fields that are frozen at insert. Anything mutable must stay out. */
const IMMUTABLE = [
  "chain", "tokenAddress", "pairAddress", "symbol",
  "firedAt", "entryPriceUsd", "entryMc", "liquidityUsd",
  "score", "reasonIds", "sourceKind",
];

/** Deterministic serialisation: sorted keys, numbers as strings, no spaces. */
export function canonical(call) {
  const o = {};
  for (const k of [...IMMUTABLE].sort()) {
    const v = call[k];
    o[k] = Array.isArray(v) ? v.map(String)
         : typeof v === "number" ? String(v)
         : v == null ? null : String(v);
  }
  return JSON.stringify(o);
}

export const recordHash = call => sha256(canonical(call));
export const linkHash = (prevChainHash, recHash) =>
  sha256(Buffer.from((prevChainHash ?? "".padStart(64, "0")) + recHash, "hex"));

export const GENESIS = "".padStart(64, "0");

/** Recompute the whole chain and report the first divergence. */
export function verifyChain(calls) {
  let prev = GENESIS;
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    const rec = recordHash(c);
    if (rec !== c.recordHash)
      return { ok: false, at: i, seq: c.seq, why: "record hash mismatch — a stored field was edited" };
    const link = linkHash(prev, rec);
    if (link !== c.chainHash)
      return { ok: false, at: i, seq: c.seq, why: "chain hash mismatch — a call was removed or reordered" };
    prev = link;
  }
  return { ok: true, count: calls.length, head: prev };
}
