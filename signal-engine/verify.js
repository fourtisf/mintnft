#!/usr/bin/env node
/**
 * Independent verifier. Recomputes the register from the public CSV export and
 * checks it against what was published on-chain.
 *
 *   node verify.js register.csv
 *   node verify.js register.csv --rpc https://... --anchor 0xCONTRACT
 *
 * Nothing here reads our database or trusts our API. That is the point: if this
 * script only agreed with us because it asked us, it would prove nothing. Run
 * it against a CSV you downloaded and an RPC you chose.
 */
import { readFileSync } from "node:fs";
import { recordHash, linkHash, GENESIS } from "./integrity.js";
import { verifyProof } from "./merkle.js";

/** RFC 4180 enough: quoted fields, doubled quotes, embedded commas. */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

/** Undo the two lossy encodings in the export. */
function rehydrate(r) {
  return {
    ...r,
    reasonIds: r.reasonIds ? r.reasonIds.split("|") : [],
    sourceRef: r.sourceRef === "\\N" ? null : r.sourceRef,
  };
}

export function verifyCsv(text) {
  const rows = parseCsv(text).map(rehydrate);
  const problems = [];
  let prev = GENESIS;

  for (const [i, r] of rows.entries()) {
    const rec = recordHash(r);
    if (rec !== r.recordHash)
      problems.push({ seq: r.seq, why: "record hash does not match the published fields — a value was edited" });
    const link = linkHash(prev, rec);
    if (link !== r.chainHash)
      problems.push({ seq: r.seq, why: "chain hash breaks here — a call was removed or reordered" });
    if (Number(r.seq) !== i + 1)
      problems.push({ seq: r.seq, why: `sequence jumps: expected ${i + 1}` });
    prev = link;
  }
  return { rows: rows.length, head: prev, ok: problems.length === 0, problems };
}

/* ─────────────────────────── on-chain comparison ─────────────────────────── */

/**
 * ProofAnchor.latest() -> (uint64 seqTo, uint64 publishedAt, bytes32 chainHead,
 * bytes32 merkleRoot). All members are static, so the return is four flat words.
 */
const LATEST = "0x52bfe789";

export function decodeAnchor(result) {
  const b = Buffer.from(String(result).replace(/^0x/, ""), "hex");
  if (b.length < 128) throw new Error("short return from latest() — is that a ProofAnchor?");
  return {
    seqTo: Number(BigInt("0x" + b.subarray(0, 32).toString("hex"))),
    publishedAt: Number(BigInt("0x" + b.subarray(32, 64).toString("hex"))),
    chainHead: b.subarray(64, 96).toString("hex"),
    merkleRoot: b.subarray(96, 128).toString("hex"),
  };
}

export async function latestAnchor(rpcUrl, contract, fetchImpl = fetch) {
  const res = await fetchImpl(rpcUrl, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call",
      params: [{ to: contract, data: LATEST }, "latest"] }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return decodeAnchor(j.result);
}

const args = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = args.find(a => !a.startsWith("--"));
  if (!file) { console.error("usage: node verify.js <register.csv> [--rpc URL --anchor 0x...]"); process.exit(2); }

  const out = verifyCsv(readFileSync(file, "utf8"));
  console.log(`${out.rows} call dibaca dari ${file}`);
  console.log(`chain head hasil hitung ulang: ${out.head}`);

  if (!out.ok) {
    console.log(`\nRUSAK — ${out.problems.length} masalah:`);
    for (const p of out.problems.slice(0, 20)) console.log(`  seq ${p.seq}: ${p.why}`);
    process.exit(1);
  }
  console.log("rantai konsisten dengan dirinya sendiri.");

  const rpc = args[args.indexOf("--rpc") + 1], anchorAddr = args[args.indexOf("--anchor") + 1];
  if (args.includes("--rpc") && args.includes("--anchor")) {
    console.log(`\nanchor on-chain di ${anchorAddr} …`);
    try {
      const a = await latestAnchor(rpc, anchorAddr);
      console.log(`  seq terakhir dijangkar : ${a.seqTo}`);
      console.log(`  chainHead on-chain     : ${a.chainHead}`);
      const rows = parseCsv(readFileSync(file, "utf8")).map(rehydrate);
      const atSeq = rows.filter(r => Number(r.seq) <= a.seqTo);
      let head = GENESIS;
      for (const r of atSeq) head = linkHash(head, recordHash(r));
      if (head === a.chainHead) {
        console.log(`  COCOK — CSV sampai seq ${a.seqTo} adalah yang dijangkar on-chain.`);
      } else {
        console.log(`  TIDAK COCOK — head CSV pada seq ${a.seqTo} adalah ${head}`);
        console.log("  CSV ini bukan riwayat yang dipublikasikan. Salah satunya ditulis ulang.");
        process.exit(1);
      }
      if (rows.length > a.seqTo)
        console.log(`  catatan: ${rows.length - a.seqTo} call terbaru belum dijangkar, jadi belum terbukti.`);
    } catch (e) {
      console.log(`  gagal membaca anchor: ${String(e)}`);
      process.exit(1);
    }
  } else {
    console.log("\nCatatan: tanpa --rpc/--anchor ini hanya membuktikan CSV konsisten");
    console.log("dengan dirinya sendiri, bukan bahwa CSV-nya belum ditulis ulang.");
  }
}
