/**
 * Merkle tree over record hashes, so a single call can be proved against a
 * published anchor without handing anyone the whole register.
 *
 * sha256 throughout, matching integrity.js, and sorted pairs so a proof
 * carries no position bits. Solidity has sha256 as a precompile, so
 * ProofAnchor verifies the same proof on-chain for a few hundred gas.
 *
 * An odd node is promoted rather than duplicated. Duplicating the last leaf
 * lets someone present a two-leaf tree as a three-leaf one.
 */
import { createHash } from "node:crypto";

const sha256hex = buf => createHash("sha256").update(buf).digest("hex");
const bytes = hex => Buffer.from(hex, "hex");

/** Sorted so the verifier never needs to know which side a sibling sat on. */
export function hashPair(a, b) {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return sha256hex(Buffer.concat([bytes(lo), bytes(hi)]));
}

function levels(leaves) {
  if (!leaves.length) return [];
  const all = [leaves];
  let cur = leaves;
  while (cur.length > 1) {
    const next = [];
    for (let i = 0; i < cur.length; i += 2)
      next.push(i + 1 < cur.length ? hashPair(cur[i], cur[i + 1]) : cur[i]);
    all.push(next);
    cur = next;
  }
  return all;
}

export const EMPTY_ROOT = "".padStart(64, "0");

export function merkleRoot(leaves) {
  if (!leaves.length) return EMPTY_ROOT;
  const l = levels(leaves);
  return l[l.length - 1][0];
}

/** Siblings from leaf to root. Empty for a single-leaf tree, which is valid. */
export function merkleProof(leaves, index) {
  if (index < 0 || index >= leaves.length) throw new RangeError("leaf index out of range");
  const l = levels(leaves);
  const proof = [];
  let i = index;
  for (let d = 0; d < l.length - 1; d++) {
    const sib = i % 2 ? i - 1 : i + 1;
    if (sib < l[d].length) proof.push(l[d][sib]);
    i = Math.floor(i / 2);
  }
  return proof;
}

export function verifyProof(leaf, proof, root) {
  return proof.reduce(hashPair, leaf) === root;
}
