/**
 * The mint panel, against a stubbed wallet and a real ABI.
 *
 * Two things are being proved. First, that the panel never renders a state it
 * does not have: nothing deployed, a chain it cannot reach, and a mint that is
 * open and empty must each read differently, because a reader cannot tell them
 * apart and one of them ends in a transaction that cannot succeed. Second,
 * that the bytes the page hands a wallet are bytes the contract accepts — the
 * calldata is compared against ethers encoding the same call from the compiled
 * ABI, not against a second copy of my own encoder.
 *
 * The wallet is a stub. What it cannot prove is how a real wallet behaves on a
 * rejected chain switch or a dropped transaction; that is Base Sepolia's job.
 */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ethers } = require("ethers");
const { compile, artifact } = require("../contracts/build.js");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "ok   " : "GAGAL"}  ${msg}`); if (!cond) failures++; };
const head = t => console.log(`\n${t}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const CONTRACT = "0x" + "ab".repeat(20);
const WALLET = "0x" + "11".repeat(20);
const PRICE = "1700000000000000";   // 0.0017 ETH, ~$5 — phase 2
const P1 = "700000000000000";       // 0.0007, ~$2
const P3 = "3300000000000000";      // 0.0033, ~$10
const CHAIN = 4663;                      // Robinhood Chain

/* The selectors the page is given come from the engine, which derives them. */
const { MINT_SELECTORS } = await import("../signal-engine/keys.js");

/* And the reference encoding comes from the compiled contract's own ABI. */
const iface = new ethers.utils.Interface(
  artifact(compile(["ProofKeys.sol", "ProofParts.sol", "ProofRenderer.sol"]),
    "ProofKeys.sol", "ProofKeys").abi);

const IDENTITY = { configured: true, contract: CONTRACT, chainId: CHAIN,
                   explorer: "https://robinhoodchain.blockscout.com", selectors: MINT_SELECTORS };

const baseState = over => ({
  phase: 2, phaseName: "two", price: PRICE, priceOne: P1, priceTwo: PRICE, priceThree: P3,
  totalMinted: 12, seasonCap: 666, maxPerWallet: 5, revealed: false, recommitCount: 0,
  address: WALLET, mintedBy: 0, remaining: 5,
  canMint: true, method: "public", unitPrice: PRICE,
  nextPrices: Array(5).fill(PRICE), ...over,
});

/**
 * Boots the page with a stubbed engine and a stubbed wallet.
 * Returns handles plus everything the wallet was asked to do.
 */
async function boot({ identity = IDENTITY, state = baseState(), chainId = CHAIN,
                      wallet = true, sendFails = null, switchFails = false } = {}) {
  const dom = new JSDOM(readFileSync(join(ROOT, "site", "index.html"), "utf8"),
    { url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true });
  const win = dom.window, doc = win.document;

  win.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {},
                            addListener() {}, removeListener() {} });
  win.scrollTo = () => {};
  win.WebSocket = class { constructor() { setTimeout(() => this.onerror?.({}), 0); } close() {} };

  win.fetch = async u => {
    const p = String(u);
    if (p.includes("/api/keys/state")) return { ok: true, json: async () => ({ ...identity, state }) };
    if (p.includes("/api/keys")) return { ok: true, json: async () => identity };
    throw new Error("offline");     // every other route is out of scope here
  };

  const sent = [], asked = [];
  let current = chainId;
  if (wallet) {
    win.ethereum = {
      async request({ method, params }) {
        asked.push(method);
        if (method === "eth_requestAccounts") return [WALLET];
        if (method === "eth_chainId") return "0x" + current.toString(16);
        if (method === "wallet_switchEthereumChain") {
          if (switchFails) throw new Error("User rejected the request.");
          current = Number(params[0].chainId);
          return null;
        }
        if (method === "eth_sendTransaction") {
          if (sendFails) throw new Error(sendFails);
          sent.push(params[0]);
          return "0x" + "de".repeat(32);
        }
        throw new Error("unsupported: " + method);
      },
    };
  }

  win.eval(readFileSync(join(ROOT, "site", "assets", "app.js"), "utf8"));
  doc.querySelector('#navLinks a[data-v="mint"]')
    ?.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  await sleep(60);

  const el = id => doc.getElementById(id);
  const txt = id => (el(id)?.textContent ?? "").trim();
  return {
    win, doc, el, txt, sent, asked,
    btn: () => el("mintBtn"),
    msg: () => txt("mintMsg"),
    click: async id => { el(id).dispatchEvent(new win.MouseEvent("click", { bubbles: true })); await sleep(40); },
    mint: async () => { el("mintBtn").dispatchEvent(new win.MouseEvent("click", { bubbles: true })); await sleep(120); },
  };
}

/* ═══════════════ nothing deployed ═══════════════ */
head("belum ada kontrak");
{
  const p = await boot({ identity: { configured: false, why: "no contract address configured" }, state: null });
  ok(p.btn().disabled === true, "tombol mati");
  ok(p.txt("mintBtn") === "Minting is not open", "dan mengatakan mint belum buka");
  ok(p.txt("supTxt") === "0 / 666 minted", "0 dari 666 — belum ada yang bisa dicetak, dan itu fakta");
  ok(/No contract is deployed/.test(p.msg()), "alasannya ditulis, bukan dibiarkan ditebak");
}

/* ═══════════════ deployed, chain unreachable ═══════════════ */
head("chain tidak terjangkau");
{
  const p = await boot({ state: null });
  ok(p.btn().disabled === true && /reach the chain/.test(p.txt("mintBtn")), "tombol mati dengan sebab");
  ok(p.txt("supTxt") === "supply unknown",
    "suplai TIDAK dibaca 0 — RPC mati bukan mint yang buka dan belum laku");
  ok(p.txt("ksMinted") === "—", "kartu di beranda ikut mengaku tidak tahu");
}

/* ═══════════════ open, wallet not connected ═══════════════ */
head("terbuka, dompet belum tersambung");
{
  const p = await boot({ state: { ...baseState(), address: undefined, canMint: undefined } });
  ok(p.txt("supTxt") === "12 / 666 minted", "suplai sungguhan dari chain");
  ok(p.txt("mintBtn") === "Connect a wallet", "mengajak menyambungkan dompet, bukan menjanjikan mint");
  ok(p.btn().disabled === false, "dan tombolnya bisa ditekan");
}

/* ═══════════════ the public mint ═══════════════ */
head("mint publik");
{
  const p = await boot();
  ok(/Mint 1 · 0\.0017 ETH/.test(p.txt("mintBtn")), `tombol menyebut jumlah dan harga (${p.txt("mintBtn")})`);
  ok(p.txt("unitPrice") === "0.0017" && p.txt("total") === "0.0017 ETH", "harga satuan dan total dari chain");

  await p.mint();
  ok(p.sent.length === 1, "satu transaksi dikirim");
  const tx = p.sent[0];
  ok(tx.to === CONTRACT, "ke alamat kontrak dari /api/keys, bukan yang ditulis di halaman");
  ok(BigInt(tx.value) === BigInt(PRICE), "nilai = harga satuan");
  ok(tx.data === iface.encodeFunctionData("mintPublic", [1]).toLowerCase(),
    "calldata identik dengan encoder ABI kontrak yang dikompilasi");
  ok(/Sent —/.test(p.msg()) && /blockscout/.test(p.el("mintMsg").innerHTML),
    "hash-nya ditautkan ke explorer");
}

head("mint publik, tiga sekaligus");
{
  const p = await boot();
  await p.click("qPlus"); await p.click("qPlus");
  ok(p.txt("qVal") === "3" && p.txt("total") === "0.0051 ETH", "total ikut jumlah");
  await p.mint();
  const tx = p.sent[0];
  ok(BigInt(tx.value) === BigInt(PRICE) * 3n, "nilai = harga x 3");
  ok(tx.data === iface.encodeFunctionData("mintPublic", [3]).toLowerCase(), "calldata membawa qty 3");
}

/* ═══════════════ what a wallet may not do ═══════════════ */
head("harga per fase");
{
  // Phase 3 is dearer, and the panel prints whatever the contract says rather
  // than a figure the page keeps in step by hand.
  const p = await boot({ state: baseState({
    phase: 3, phaseName: "three", price: P3, unitPrice: P3, nextPrices: Array(5).fill(P3) }) });
  ok(p.txt("unitPrice") === "0.0033", "fase tiga: harga fase tiga");
  await p.click("qPlus");
  ok(p.txt("total") === "0.0066 ETH", "dan totalnya ikut");
  await p.mint();
  ok(BigInt(p.sent[0].value) === BigInt(P3) * 2n, "nilai yang dikirim memakai harga fase itu");
}

head("jatah dompet sudah habis");
{
  const p = await boot({ state: baseState({
    mintedBy: 5, remaining: 0, canMint: false, why: "this wallet already holds its 5" }) });
  ok(/already holds its 5/.test(p.msg()), "dikatakan sudah penuh, bukan tidak berhak");
  ok(p.el("qPlus").disabled === true, "tombol tambah jumlah ikut mati");
}

/* ═══════════════ the wrong network ═══════════════ */
head("jaringan salah");
{
  const p = await boot({ chainId: 1 });
  await p.mint();
  ok(p.asked.includes("wallet_switchEthereumChain"), "dompet diminta pindah ke chain yang benar");
  ok(p.sent.length === 1 && p.sent[0].to === CONTRACT, "setelah pindah, transaksinya jalan");
}

head("jaringan salah, pindahnya ditolak");
{
  const p = await boot({ chainId: 1, switchFails: true });
  await p.mint();
  ok(p.sent.length === 0, "tidak ada transaksi yang dikirim ke jaringan yang salah");
  ok(/Switch your wallet to chain 4663/.test(p.msg()), "dan pembacanya diberi tahu harus apa");
}

/* ═══════════════ the reader says no ═══════════════ */
head("dibatalkan di dompet");
{
  const p = await boot({ sendFails: "User denied transaction signature." });
  await p.mint();
  ok(p.msg() === "Cancelled.", "penolakan pembaca bukan error untuk diteriakkan");
  ok(p.sent.length === 0, "tidak ada yang tercetak");
}

head("tanpa dompet di browser");
{
  const p = await boot({ wallet: false });
  await p.mint();
  ok(/No wallet found/.test(p.msg()), "dikatakan tidak ada dompet");
}

console.log(`\n${failures ? failures + " GAGAL" : "semua lolos"}`);
process.exit(failures ? 1 : 0);
