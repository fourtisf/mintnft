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
 * The version a new call is written under. Every row carries its own, and a
 * row is always re-hashed under the version it was written with — see SCHEMES.
 */
export const HASH_VERSION = 3;

/**
 * Fields frozen at insert, per version. Anything mutable must stay out.
 *
 * The list is per-version because it has to be able to grow. `canonical()`
 * used to close over a single list, so adding one field silently changed the
 * canonical form of every row already written and broke verification of the
 * entire chain — which meant the list could never change, on a register whose
 * whole claim is that its past cannot be rewritten. A row now names the scheme
 * it was written under and is only ever re-hashed under that one, so old rows
 * keep verifying byte for byte and new rows can freeze more.
 *
 * Adding a version: copy the previous array, append, bump HASH_VERSION, and
 * add a case to test-hashversion.js proving rows under every older version
 * still verify. Never edit an existing array — that is the edit this file
 * exists to make impossible.
 *
 * callerId is in here because the register is multi-caller from day one:
 * without it a call could be reattributed to another desk and every hash would
 * still check out, which is the exact edit the product exists to prevent.
 *
 * entrySupply is in here because entryMc is price x supply. Freezing the price
 * without the supply leaves the denominator of every verdict unreproducible.
 */
const V2 = [
  "hashVersion", "callerId",
  "chain", "tokenAddress", "pairAddress", "symbol",
  "firedAt", "entryPriceUsd", "entrySupply", "entryMc", "entrySupplySource",
  "liquidityUsd", "score", "reasonIds", "sourceKind", "sourceRef",
];

/**
 * v3 freezes the volume the call fired on.
 *
 * It was published from the start and sat outside the hash only because the
 * hash could not grow, which made "$52K of volume in the hour" a number anyone
 * with write access could change afterwards while every hash still checked
 * out. Size is half of what a reader judges a call by; it belongs in the part
 * that cannot be edited.
 */
const V3 = [...V2, "entryVolumeH1", "entryVolumeM5"];

const SCHEMES = { 2: V2, 3: V3 };

/** The field list a row is hashed under. Unknown versions are refused rather
 *  than quietly hashed under the current one, which would report a row from a
 *  newer engine as tampered with. */
export function schemeFor(version) {
  const s = SCHEMES[version];
  if (!s) throw new Error(`unknown hash version ${version} — this engine cannot verify it`);
  return s;
}

/** Deterministic serialisation: sorted keys, numbers as strings, no spaces. */
export function canonical(call) {
  const version = call.hashVersion ?? HASH_VERSION;
  const o = {};
  for (const k of [...schemeFor(version)].sort()) {
    const v = k === "hashVersion" ? version : call[k];
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
    let rec;
    // A row written by a newer engine is unverifiable here, not invalid. Saying
    // "tampered with" would be a false accusation against our own record.
    try { rec = recordHash(c); }
    catch (e) { return { ok: false, at: i, seq: c.seq, why: String(e.message ?? e) }; }
    if (rec !== c.recordHash)
      return { ok: false, at: i, seq: c.seq, why: "record hash mismatch — a stored field was edited" };
    const link = linkHash(prev, rec);
    if (link !== c.chainHash)
      return { ok: false, at: i, seq: c.seq, why: "chain hash mismatch — a call was removed or reordered" };
    prev = link;
  }
  return { ok: true, count: calls.length, head: prev };
}
