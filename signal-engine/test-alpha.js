/**
 * The paid half, and the four ways a gate like this leaks.
 *
 * /api/alpha carries the reject tape and the near-miss list — the candidates
 * the desk looked at and did not call. It is the thing a key buys that is not
 * speed, so it is the first gate in this product that is about *content*
 * rather than about *when*, and the failures are different:
 *
 *   A body that is complete and marked "locked" is not a gate. The browser is
 *   not a place a rule can be enforced, and hiding a field in the UI lasts
 *   exactly as long as it takes someone to open devtools — the same reason
 *   latency is resolved on the server and nowhere else.
 *
 *   A count read from the session is a count that can go stale. A key sold
 *   after sign-in must stop opening the door on the next request, not when the
 *   JWT happens to expire, so the chain is asked every time.
 *
 *   An RPC that is down must read as the bottom rung. A read that failed open
 *   would be a hole anyone could make by taking the node offline.
 *
 *   A desk with no collection deployed cannot count anybody's keys, and that
 *   has to say so rather than refuse — a refusal reads to the holder as a
 *   verdict on their wallet, when it is a fact about ours.
 */
import { serve } from "./api.js";
import { issueSession } from "./auth.js";
import { levelFor, LADDER, ChainHoldings, NoHoldings, PUBLIC, MEMBER, PREMIUM, DESK } from "./holdings.js";
import { FileStore } from "./store.js";
import { rmSync } from "node:fs";

const DATA = "./data/alpha-test.json";
const PORT = 8791;
const SECRET = "test-secret";
const ADDR = "0x1111111111111111111111111111111111111111";

let failures = 0;
const ok = (c, m) => { console.log(`  ${c ? "ok   " : "GAGAL"}  ${m}`); if (!c) failures++; };
const head = t => console.log(`\n${t}`);

/* A triage that already holds something worth gating, so "empty" and "withheld"
   can never be confused for one another in these assertions. */
const triage = {
  rejects: [{ symbol: "FOO", gate: "liquidity_floor", why: "Pool $9.2K against a $15K floor" }],
  nearMiss: [{ symbol: "BAR", score: 38, short: 5, reachable: 130, noData: [], rules: [] }],
  snapshot: () => ({ scanned: 1, rejects: [] }),
};

const fakeHoldings = (count, configured = true) => ({
  configured,
  countOf: async () => count,
});

const get = async (path, token) => {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`,
    token ? { headers: { authorization: `Bearer ${token}` } } : undefined);
  return { status: res.status, body: await res.json() };
};

/* ═══════ the ladder, with no server around it ═══════ */
head("tangga kepemilikan");
{
  const l = { [MEMBER]: 1, [PREMIUM]: 3, [DESK]: 5 };
  ok(levelFor(0, l) === PUBLIC, "nol key tidak membuka apa pun");
  ok(levelFor(1, l) === MEMBER, "satu key jadi Member");
  ok(levelFor(2, l) === MEMBER, "dua belum cukup untuk Premium");
  ok(levelFor(3, l) === PREMIUM, "tiga jadi Premium");
  ok(levelFor(5, l) === DESK, "lima jadi Desk");
  ok(levelFor(999, l) === DESK, "dan di atasnya tetap Desk, bukan tingkat karangan");
  ok(levelFor(null, l) === PUBLIC && levelFor(NaN, l) === PUBLIC && levelFor(-3, l) === PUBLIC,
    "hitungan yang tidak masuk akal jatuh ke bawah, tidak ke atas");

  /* A ladder someone mis-set must not open a rung whose own requirement is not
     met. Desk at 2 with Premium at 9 has to mean Desk needs 9 too. */
  const bad = { [MEMBER]: 1, [PREMIUM]: 9, [DESK]: 2 };
  ok(levelFor(3, bad) === MEMBER, "tangga yang salah set tidak membuka Desk lewat pintu belakang");
  ok(levelFor(9, bad) === DESK, "dan tetap membuka ketika syarat tertingginya benar-benar dicapai");
}

/* ═══════ the read itself ═══════ */
head("membaca rantai");
{
  const rpc = body => new ChainHoldings({
    rpcUrl: "http://x", contract: "0xC", log: () => {},
    fetchImpl: async () => ({ json: async () => body }),
  });

  // offset, length 3, then three ids
  const three = "0x" + (32).toString(16).padStart(64, "0") + (3).toString(16).padStart(64, "0")
    + "01".padStart(64, "0") + "02".padStart(64, "0") + "03".padStart(64, "0");
  ok(await rpc({ result: three }).countOf(ADDR) === 3, "panjang array yang dibaca, bukan ditebak");
  ok(await rpc({ result: "0x" + "0".repeat(128) }).countOf(ADDR) === 0, "dompet kosong terbaca nol");

  /* A JSON-RPC error is a 200 with an `error` member. Reading `.result` past it
     turns "execution reverted" into undefined and undefined into zero, which is
     a failure wearing an answer's clothes. */
  ok(await rpc({ error: { message: "execution reverted" } }).countOf(ADDR) === 0,
    "error JSON-RPC dibaca sebagai gagal, bukan sebagai nol");

  const dead = new ChainHoldings({ rpcUrl: "http://x", contract: "0xC", log: () => {},
    fetchImpl: async () => { throw new Error("ECONNREFUSED"); } });
  ok(await dead.countOf(ADDR) === 0, "node mati tidak pernah mempromosikan siapa pun");

  ok(await new NoHoldings().countOf(ADDR) === 0, "tanpa kontrak, tidak ada yang bisa dihitung");
  ok(new NoHoldings().configured === false, "dan ia mengatakan begitu, bukan diam");
}

/* ═══════ the route ═══════ */
const run = async (holdings, label, fn) => {
  rmSync(DATA, { force: true });
  const srv = serve(new FileStore(DATA), { port: PORT, secret: SECRET, triage, holdings,
                                           cfg: { scoreToFire: 43 }, log: () => {} });
  await new Promise(r => setTimeout(r, 60));
  head(label);
  try { await fn(); } finally { srv.close(); }
};

await run(fakeHoldings(0), "dompet tanpa key", async () => {
  const { body } = await get("/api/alpha", issueSession({ address: ADDR, tier: 0 }, SECRET));
  ok(body.locked === true, "terkunci");
  ok(body.tape === undefined, "tape tidak ada di dalam body — bukan ada tapi disembunyikan");
  ok(body.nearMiss === undefined, "near-miss juga tidak");
  ok(/holds 0/.test(body.why ?? ""), "dan alasannya menyebut berapa yang dipegang");
});

await run(fakeHoldings(1), "satu key — Member, masih di bawah Alpha", async () => {
  const { body } = await get("/api/alpha", issueSession({ address: ADDR, tier: 3 }, SECRET));
  ok(body.levelName === "Member", "levelnya dari jumlah key, bukan dari tier di sesi");
  ok(body.locked === true, "tier III yang cuma pegang satu key tetap tidak dapat Alpha");
  ok(body.tape === undefined, "dan datanya tetap tidak dikirim");
});

await run(fakeHoldings(3), "tiga key — Premium", async () => {
  const { body } = await get("/api/alpha", issueSession({ address: ADDR, tier: 0 }, SECRET));
  ok(body.locked === false, "terbuka");
  ok(body.tape?.[0]?.symbol === "FOO", "tape-nya benar-benar ada isinya");
  ok(body.nearMiss?.[0]?.symbol === "BAR", "begitu juga near-miss-nya");
  ok(body.levelName === "Premium" && body.keys === 3, "dengan level dan jumlahnya dinyatakan");
  ok(body.verified === true, "dan ditandai bahwa hitungannya benar-benar diverifikasi");
});

await run(fakeHoldings(9, false), "kontraknya belum di-deploy", async () => {
  const { body } = await get("/api/alpha", issueSession({ address: ADDR, tier: 0 }, SECRET));
  ok(body.locked === true, "terkunci, karena tidak ada yang bisa dihitung");
  ok(body.verified === false, "dan dikatakan tidak terverifikasi, bukan didiamkan");
  ok(/not deployed/.test(body.why ?? ""),
    "alasannya soal desk-nya, bukan soal dompet pembacanya");
  ok(body.tape === undefined, "tetap tidak ada data yang keluar");
});

await run(fakeHoldings(9), "tanpa sesi sama sekali", async () => {
  const { body } = await get("/api/alpha");
  ok(body.locked === true, "terkunci walaupun dompet yang mana pun memegang sembilan key");
  ok(body.keys === 0 && body.address === null, "karena tidak ada dompet yang mengaku");
  ok(body.tape === undefined, "dan tidak ada data yang keluar");

  const forged = issueSession({ address: ADDR, tier: 3 }, "wrong-secret");
  const f = await get("/api/alpha", forged);
  ok(f.body.locked === true, "token yang ditandatangani kunci lain tidak membuka apa pun");
});

rmSync(DATA, { force: true });
console.log(failures ? `\n${failures} GAGAL` : "\nsemua lolos");
process.exit(failures ? 1 : 0);
