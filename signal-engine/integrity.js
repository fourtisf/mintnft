/**
 * Append-only integrity chain.
 *
 * Every call is hashed at insert over its immutable fields only. Each hash is
 * chained onto the previous one, so removing or editing any past call breaks
 * every hash after it.
 *
 * The chain alone only catches accidental corruption: anyone who can write the
 * register can recompute it end to end. anchor.js is what makes it hold against
 * someone with write access, by publishing the head where we cannot reach it.
 */
import { createHash } from "node:crypto";

const sha256 = b => createHash("sha256").update(b).digest("hex");

/**
 * Bump when IMMUTABLE changes. The version is inside the hash, so a register
 * written under one scheme can never be silently reinterpreted under another.
 */
export const HASH_VERSION = 2;

/**
 * Fields frozen at insert. Anything mutable must stay out.
 *
 * callerId is in here because the register is multi-caller from day one:
 * without it a call could be reattributed to another desk and every hash would
 * still check out, which is the exact edit the product exists to prevent.
 *
 * entrySupply is in here because entryMc is price x supply. Freezing the price
 * without the supply leaves the denominator of every verdict unreproducible.
 */
const IMMUTABLE = [
  "hashVersion", "callerId",
  "chain", "tokenAddress", "pairAddress", "symbol",
  "firedAt", "entryPriceUsd", "entrySupply", "entryMc", "entrySupplySource",
  "liquidityUsd", "score", "reasonIds", "sourceKind", "sourceRef",
];

/** Deterministic serialisation: sorted keys, numbers as strings, no spaces. */
export function canonical(call) {
  const o = {};
  for (const k of [...IMMUTABLE].sort()) {
    const v = k === "hashVersion" ? (call.hashVersion ?? HASH_VERSION) : call[k];
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
