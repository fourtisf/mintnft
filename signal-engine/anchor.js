/**
 * Turns the local hash chain into something an outsider can check.
 *
 * Each anchor covers the calls written since the last published one:
 *
 *   chainHead   head of the whole chain at seqTo — pins the register's shape
 *   merkleRoot  root over this window's record hashes — lets one call be
 *               proved without publishing the rest
 *
 * Publishing is injected rather than built in. The mechanism is proved against
 * a real EVM in test-anchor.js; on a box with a key and an RPC, pass a
 * publisher that sends the transaction and returns its hash.
 *
 * Until a publisher returns a txHash the register is unanchored, and the API
 * says so. An anchor sitting in the same file as the register it vouches for
 * proves nothing, so it is never reported as if it did.
 */
import { merkleRoot, merkleProof, verifyProof } from "./merkle.js";

/** Window of calls not yet covered by a published anchor. */
export function pendingWindow(store) {
  const published = store.anchors().filter(a => a.txHash);
  const from = published.length ? Math.max(...published.map(a => a.seqTo)) + 1 : 1;
  const calls = store.allCalls().filter(c => c.seq >= from);
  return { seqFrom: from, calls };
}

export function buildAnchor(store) {
  const v = store.verify();
  if (!v.ok) throw new Error(`refusing to anchor a broken chain: ${v.why} (seq ${v.seq})`);

  const { seqFrom, calls } = pendingWindow(store);
  if (!calls.length) return null;

  return {
    seqFrom,
    seqTo: calls[calls.length - 1].seq,
    chainHead: v.head,
    merkleRoot: merkleRoot(calls.map(c => c.recordHash)),
    count: calls.length,
    at: new Date().toISOString(),
  };
}

/**
 * Build, publish, record. A publisher that throws leaves the window pending,
 * so the next run re-covers it rather than skipping those calls forever.
 */
export async function publishAnchor(store, publish, log = console.log) {
  const a = buildAnchor(store);
  if (!a) return null;

  let txHash = null;
  try {
    txHash = (await publish(a)) ?? null;
  } catch (e) {
    log(`[ANCHOR] publish failed, window ${a.seqFrom}-${a.seqTo} stays pending — ${String(e)}`);
  }
  const record = { ...a, txHash };
  store.addAnchor(record);
  log(txHash
    ? `[ANCHOR] seq ${a.seqFrom}-${a.seqTo} published, tx ${txHash}`
    : `[ANCHOR] seq ${a.seqFrom}-${a.seqTo} recorded but NOT published — the register is unanchored`);
  return record;
}

/** Everything a third party needs to check one call against a published anchor. */
export function proofFor(store, seq) {
  const anchor = store.anchors().find(a => a.txHash && a.seqFrom <= seq && a.seqTo >= seq);
  if (!anchor) return null;

  const window = store.allCalls().filter(c => c.seq >= anchor.seqFrom && c.seq <= anchor.seqTo);
  const leaves = window.map(c => c.recordHash);
  const index = window.findIndex(c => c.seq === seq);
  if (index < 0) return null;

  const proof = merkleProof(leaves, index);
  return {
    seq,
    recordHash: leaves[index],
    proof,
    merkleRoot: anchor.merkleRoot,
    chainHead: anchor.chainHead,
    anchorTx: anchor.txHash,
    anchoredAt: anchor.at,
    verifiesLocally: verifyProof(leaves[index], proof, anchor.merkleRoot),
  };
}
