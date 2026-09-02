/**
 * What the mint panel is told, and what it is never told.
 *
 * The failures this file exists for are all the same shape: a panel that
 * renders "open, 0 of 666 minted" when nothing is deployed, or when the RPC is
 * down. Each of those looks to a
 * reader like a mint that has opened and sold nothing, and one of them would
 * have them signing a transaction that cannot succeed.
 *
 * The chain is stubbed here — an eth_call transport answering exactly what a
 * node answers. contracts/test-deploy.js is where the same reads run against a
 * real EVM.
 */
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KeysReader } from "./keys.js";
import { serve } from "./api.js";
import { FileStore } from "./store.js";

let failures = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "ok   " : "GAGAL"}  ${msg}`); if (!cond) failures++; };
const head = t => console.log(`\n${t}`);

const CONTRACT = "0x" + "ab".repeat(20);
const HOLDER = "0x" + "11".repeat(20);
const OUTSIDER = "0x" + "99".repeat(20);
const word = n => "0x" + BigInt(n).toString(16).padStart(64, "0");

/** A node that answers by selector. Anything unasked-for is a failure here,
 *  not a zero — a stub that quietly returns 0 hides a missing read. */
const node = (values, { fail = false } = {}) => async (_url, init) => {
  if (fail) throw new Error("connection refused");
  const { params } = JSON.parse(init.body);
  const selector = params[0].data.slice(0, 10);
  if (!(selector in values)) return { json: async () => ({ error: { message: "no stub for " + selector } }) };
  const v = values[selector];
  return { json: async () => ({ result: typeof v === "function" ? v(params[0].data) : v }) };
};

/* Derived, not typed: a stub holding a hand-copied selector would keep
   agreeing with a function that no longer exists. */
import { keccak256 } from "ethereumjs-util";
const sel = sig => "0x" + keccak256(Buffer.from(sig)).slice(0, 4).toString("hex");
const S = {
  phase: sel("phase()"), price: sel("currentPrice()"),
  priceOne: sel("priceOne()"), priceTwo: sel("priceTwo()"), priceThree: sel("priceThree()"),
  totalMinted: sel("totalMinted()"), seasonCap: sel("seasonCap()"),
  maxPerWallet: sel("MAX_PER_WALLET()"), revealed: sel("revealed()"),
  recommitCount: sel("recommitCount()"),
  mintedBy: sel("mintedBy(address)"),
};

const P1 = 700000000000000n, P2 = 1700000000000000n, P3 = 3300000000000000n;

const chain = ({ phase = 2, minted = 12, cap = 666, mintedBy = 0, revealed = 0,
                 now = P2 } = {}) => ({
  [S.phase]: word(phase),
  [S.price]: word(now),
  [S.priceOne]: word(P1),
  [S.priceTwo]: word(P2),
  [S.priceThree]: word(P3),
  [S.totalMinted]: word(minted),
  [S.seasonCap]: word(cap),
  [S.maxPerWallet]: word(5),
  [S.revealed]: word(revealed),
  [S.recommitCount]: word(0),
  [S.mintedBy]: word(mintedBy),
});

const reader = (opts = {}, values = chain(), fetchOpts = {}) => new KeysReader({
  contract: CONTRACT, rpcUrl: "http://node", log: () => {},
  fetchImpl: node(values, fetchOpts), ...opts,
});

/* ═══════════════ nothing deployed ═══════════════ */
head("belum ada kontrak");
{
  const k = new KeysReader({ contract: null, rpcUrl: "http://node", log: () => {} });
  ok(k.configured === false, "tanpa alamat kontrak, reader tahu dirinya belum siap");
  ok(k.identity().why === "no contract address configured", "dan menyebut yang mana yang hilang");
  const s = await k.state(HOLDER);
  ok(s.state === null, "state null — bukan nol yang terbaca seperti mint yang sudah buka");

  const k2 = new KeysReader({ contract: CONTRACT, rpcUrl: null, log: () => {} });
  ok(k2.identity().why === "no RPC configured",
    "tidak punya RPC dibedakan dari tidak punya kontrak — keduanya gagal beda cara");
}

/* ═══════════════ the node is down ═══════════════ */
head("RPC mati");
{
  const s = await reader({}, chain(), { fail: true }).state(HOLDER);
  ok(s.state === null && s.error === "chain unreachable",
    "node mati menghasilkan error, bukan mint panel berisi nol");
  ok(s.configured === true, "tetap mengaku terkonfigurasi — masalahnya di jaringan, bukan di setelan");
}

/* ═══════════════ reading the chain ═══════════════ */
head("membaca chain");
{
  const { state } = await reader().state(HOLDER);
  ok(state.phase === 2 && state.phaseName === "two", "fase terbaca");
  ok(state.totalMinted === 12 && state.seasonCap === 666, "suplai terbaca dari chain, bukan dari konstanta situs");
  ok(state.price === String(P2) && state.priceOne === String(P1) && state.priceThree === String(P3),
    "harga sekarang dan ketiga harga fase dikirim sebagai wei string");
  ok(state.remaining === 5, "sisa jatah dompet dihitung dari mintedBy on-chain");
  ok(state.canMint === true && state.method === "public" && state.unitPrice === state.price,
    "fase publik: boleh mint, dengan harga publik");
}

/* ═══════════════ price by phase ═══════════════ */
head("harga per fase");
{
  for (const [phase, name, price] of [[1, "satu", P1], [2, "dua", P2], [3, "tiga", P3]]) {
    const st = (await reader({}, chain({ phase, now: price })).state(HOLDER)).state;
    ok(st.price === String(price) && st.unitPrice === String(price),
      `fase ${name} memakai harganya sendiri`);
    ok(st.nextPrices.length === st.maxPerWallet && st.nextPrices.every(p => p === String(price)),
      `dan kelima key berikutnya rata di harga itu`);
  }
  const closed = (await reader({}, chain({ phase: 0, now: 0n })).state(HOLDER)).state;
  ok(closed.canMint === false, "tertutup berarti tidak ada yang bisa dibeli");
}

/* ═══════════════ the refusals, each with its own reason ═══════════════ */
head("penolakan dan alasannya");
{
  const closed = (await reader({}, chain({ phase: 0, now: 0n })).state(HOLDER)).state;
  ok(closed.canMint === false && closed.why === "minting is closed", "fase tertutup");

  const out = (await reader({}, chain({ minted: 666 })).state(HOLDER)).state;
  ok(out.canMint === false && out.why === "the season is sold out", "sudah habis");

  const full = (await reader({}, chain({ mintedBy: 5 })).state(HOLDER)).state;
  ok(full.canMint === false && /already holds its 5/.test(full.why),
    "dompet sudah penuh — alasannya bukan 'tidak berhak'");


}

/* ═══════════════ the routes ═══════════════ */
head("rute");
{
  const DATA = "./data/mint-route-test.json";
  rmSync(DATA, { force: true });
  const store = new FileStore(DATA);
  // serve() listens for itself; port 0 lets the OS pick one so the test can
  // run beside anything else.
  const srv = serve(store, { port: 0, secret: "x".repeat(32), domain: "test",
                             keys: reader(), log: () => {} });
  if (!srv.listening) await new Promise(r => srv.once("listening", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const get = async p => { const r = await fetch(base + p); return { status: r.status, body: await r.json() }; };

  const id = await get("/api/keys");
  ok(id.status === 200 && id.body.contract === CONTRACT && id.body.chainId === 4663,
    "/api/keys memberi alamat dan chain, supaya situs tidak menebaknya");
  ok(typeof id.body.selectors?.public === "string" && id.body.selectors.public.length === 10,
    "berikut selektor mint, diturunkan di sini dan tidak pernah diketik di browser");

  const st = await get(`/api/keys/state?address=${HOLDER}`);
  ok(st.status === 200 && st.body.state.canMint === true, "/api/keys/state menjawab untuk satu alamat");

  const anon = await get("/api/keys/state");
  ok(anon.status === 200 && anon.body.state.totalMinted === 12 && anon.body.state.canMint === undefined,
    "tanpa alamat, suplai tetap terbaca tapi tidak ada klaim soal siapa yang berhak");

  ok((await get("/api/keys/state?address=bukan-alamat")).status === 400,
    "alamat ngawur ditolak 400, tidak diteruskan ke RPC");

  await new Promise(r => srv.close(r));
  rmSync(DATA, { force: true });
}

console.log(`\n${failures ? failures + " GAGAL" : "semua lolos"}`);
process.exit(failures ? 1 : 0);
