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
                   explorer: "https://robinhoodchain.blockscout.com",
                   marketplace: "https://opensea.io/assets/robinhood/" + CONTRACT,
                   selectors: MINT_SELECTORS };

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
                      wallet = true, sendFails = null, switchFails = false,
                      url = "http://localhost/", navigate = true, announce = [] } = {}) {
  const dom = new JSDOM(readFileSync(join(ROOT, "site", "index.html"), "utf8"),
    { url, runScripts: "outside-only", pretendToBeVisual: true });
  const win = dom.window, doc = win.document;

  win.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {},
                            addListener() {}, removeListener() {} });
  win.scrollTo = () => {};
  // jsdom implements no scrolling at all; a page that scrolls is not a defect.
  win.Element.prototype.scrollIntoView = function () {};
  win.WebSocket = class { constructor() { setTimeout(() => this.onerror?.({}), 0); } close() {} };

  win.fetch = async u => {
    const p = String(u);
    if (p.includes("/api/keys/state")) return { ok: true, json: async () => ({ ...identity, state }) };
    if (p.includes("/api/keys")) return { ok: true, json: async () => identity };
    throw new Error("offline");     // every other route is out of scope here
  };

  const sent = [], asked = [];
  let current = chainId;
  const makeProvider = (tag, account = WALLET) => ({
    async request({ method, params }) {
      asked.push(tag ? `${tag}:${method}` : method);
      if (method === "eth_requestAccounts") {
        if (account === null) throw new Error("Unable to find any account for 60");
        return [account];
      }
      if (method === "eth_chainId") return "0x" + current.toString(16);
      if (method === "wallet_switchEthereumChain") {
        if (switchFails) throw new Error("User rejected the request.");
        current = Number(params[0].chainId);
        return null;
      }
      if (method === "eth_sendTransaction") {
        if (sendFails) throw new Error(sendFails);
        sent.push({ ...params[0], via: tag });
        return "0x" + "de".repeat(32);
      }
      throw new Error("unsupported: " + method);
    },
  });
  if (wallet) win.ethereum = makeProvider(null);

  win.eval(readFileSync(join(ROOT, "site", "assets", "app.js"), "utf8"));
  // Extensions answer the page's eip6963:requestProvider after it is listening,
  // which is exactly here.
  for (const a of announce) {
    win.dispatchEvent(Object.assign(new win.Event("eip6963:announceProvider"), {
      detail: { info: a.info, provider: a.provider ?? makeProvider(a.info.rdns, a.account) },
    }));
  }
  // Every case but the routing one wants the mint panel however it gets there.
  // The routing case must not be handed the answer it is meant to prove.
  if (navigate) {
    doc.querySelector('#navLinks a[data-v="mint"]')
      ?.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  }
  await sleep(60);

  const el = id => doc.getElementById(id);
  const txt = id => (el(id)?.textContent ?? "").trim();
  return {
    win, doc, el, txt, sent, asked,
    pick: () => el("walletPick"),
    options: () => [...doc.querySelectorAll("#wpickList .wopt")],
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

head("kunci milik dompet ini");
{
  const mine = p => ({
    empty: () => !p.el("mineEmpty").hidden,
    msg: () => p.txt("mineMsg"),
    cta: () => (p.el("mineCta").hidden ? null : p.txt("mineCta")),
    tiles: () => [...p.doc.querySelectorAll("#mineGrid [data-mine]")].map(b => b.dataset.mine),
    count: () => p.txt("mineCount"),
  });

  const held = mine(await boot({ state: baseState({ tokens: [7, 144] }) }));
  ok(held.tiles().join() === "7,144", "kunci yang dipegang digambar satu per satu");
  ok(held.count() === "2 keys", "beserta jumlahnya");
  ok(!held.empty(), "dan tidak ada ajakan mint di atas dompet yang sudah punya");

  // mintedBy is the per-wallet limit and never falls; tokens is what is held
  // now. A wallet that minted five and sold three holds two.
  const sold = mine(await boot({ state: baseState({ mintedBy: 5, remaining: 0, tokens: [3, 9] }) }));
  ok(sold.tiles().length === 2, "yang dihitung apa yang dipegang sekarang, bukan yang pernah dicetak");

  const none = mine(await boot({ state: baseState({ tokens: [] }) }));
  ok(none.empty() && /holds no keys yet/.test(none.msg()), "dompet kosong dikatakan kosong");
  ok(none.cta() === "Mint your first key", "dan diarahkan untuk mint lebih dulu");

  const shut = mine(await boot({ state: baseState({ tokens: [], canMint: false, why: "minting is closed" }) }));
  ok(shut.cta() === null, "tapi tidak diajak mint saat mint memang tertutup");

  // Three different silences that must not read alike.
  const dead = mine(await boot({ state: null }));
  ok(/Cannot reach the chain/.test(dead.msg()) && dead.tiles().length === 0,
    "RPC mati dibaca sebagai tidak tahu, bukan sebagai dompet kosong");
  ok(dead.cta() === null, "dan tidak mengajak mint berdasarkan sesuatu yang tidak terbaca");
}

head("alamat kontrak dan jalan keluar ke pasar");
{
  // The address is the only thing on this page a reader can check against
  // something that is not this page.
  const p = await boot({ state: baseState({ tokens: [5] }) });
  const links = () => [...p.doc.querySelectorAll("#ctrLinks a")].map(a => a.getAttribute("href"));
  ok(links().some(h => h === `https://robinhoodchain.blockscout.com/address/${CONTRACT}`),
    "alamat kontrak ditautkan ke explorer, bukan hanya dicetak");
  ok(p.txt("ctrLinks").includes(CONTRACT.slice(0, 6)), "dan potongannya terbaca");
  ok(links().some(h => h === `https://opensea.io/assets/robinhood/${CONTRACT}`),
    "koleksinya ditautkan ke OpenSea");
  ok(p.doc.querySelector(`#mineGrid [data-mine="5"] .mk-out`)?.getAttribute("href")
     === `https://opensea.io/assets/robinhood/${CONTRACT}/5`,
    "dan tiap kunci yang dipegang punya tautan ke itemnya sendiri");

  // A chain OpenSea does not list gets no link, not a link that 404s.
  const noMarket = await boot({
    identity: { ...IDENTITY, marketplace: null },
    state: baseState({ tokens: [5] }) });
  ok(noMarket.doc.querySelector("#ctrLinks a.mk") === null
     && noMarket.doc.querySelector("#mineGrid .mk-out") === null,
    "chain yang tidak terdaftar di OpenSea tidak diberi tautan karangan");
  ok(noMarket.doc.querySelector("#ctrLinks a") !== null,
    "explorer-nya tetap ada — itu tidak bergantung pada pasar mana pun");
}

head("kunci yang dipegang punya ukirannya sejak menit pertama");
{
  const tile = (p, id) => p.doc.querySelector(`#mineGrid [data-mine="${id}"]`);

  // The whole point of the redeploy: a key is not a grey circle for however
  // long the season runs. The engraving comes from the token number, so it is
  // there the moment the key exists.
  const held = await boot({ state: baseState({ tokens: [5] }) });
  const art = tile(held, 5).querySelector(".gk-art svg").innerHTML;
  ok(art.length > 200 && !/SEALED/.test(art), "kartunya menggambar ukiran, bukan lingkaran tersegel");
  ok(tile(held, 5).querySelector(".gk-meta b").textContent === "—",
    "tier-nya satu setrip — undiannya memang belum dijalankan");

  // Only the tier moves at reveal. The engraving a holder was shown all season
  // is the engraving they keep.
  const drawn = await boot({ state: baseState({ revealed: true, tokens: [5],
    seed: "0x" + "7f".repeat(32) }) });
  ok(/^T(I|II|III)$/.test(tile(drawn, 5).querySelector(".gk-meta b").textContent),
    "setelah reveal tier-nya terisi");
  ok(tile(drawn, 5).querySelector(".gk-art svg").innerHTML === art,
    "dan ukirannya sama persis dengan yang ditampilkan sebelum reveal");
}

head("contoh dan milik sendiri dipisah");
{
  // The rule is not "hide the art". It is "never claim a token is something
  // the draw has not decided". The stage, the marquee and the collection are
  // drawn from a placeholder seed and say so; only a key somebody owns is
  // sealed. Sealing the showcase too left a live sale as 666 grey circles.
  const before = await boot({ state: baseState({ tokens: [5] }) });
  ok(before.txt("keyTier") !== "Sealed until reveal",
    "panggung contoh tetap memperlihatkan ukiran — bukan lingkaran kosong");
  ok([...before.doc.querySelectorAll("[data-sample-note]")].every(el => !el.hidden),
    "dengan keterangan bahwa pembagiannya belum dilakukan");
  ok(before.doc.querySelector('#mineGrid [data-mine="5"] .gk-meta b').textContent === "—",
    "sementara kunci yang dipegang punya ukirannya tapi belum punya tier");

  // The preview control still shows what a sealed key looks like.
  before.doc.querySelector('#revealSeg button[data-r="0"]')
    .dispatchEvent(new before.win.MouseEvent("click", { bubbles: true }));
  await sleep(60);
  ok(before.txt("keyTier") === "Sealed until reveal", "dan pratinjau tersegel masih bisa dilihat");
}

head("memilih dompet");
{
  const FOX = { info: { uuid: "u1", name: "MetaMask", rdns: "io.metamask",
                        icon: "data:image/svg+xml;utf8,<svg/>" } };
  // The wallet that produced the real failure: it answers, and has no
  // Ethereum account behind it.
  const SOL = { info: { uuid: "u2", name: "Phantom", rdns: "app.phantom",
                        icon: "data:image/svg+xml;utf8,<svg/>" }, account: null };

  const one = await boot({ announce: [FOX] });
  await one.mint();
  ok(one.pick().getAttribute("aria-hidden") === "true",
    "satu dompet: tidak ada yang perlu dipilih, tidak ada dialog");
  ok(one.sent.length === 1 && one.sent[0].via === "io.metamask",
    "dan yang dipakai dompet yang mengumumkan diri, bukan window.ethereum");

  const two = await boot({ announce: [SOL, FOX] });
  const minting = two.mint();
  await sleep(40);
  ok(two.pick().classList.contains("on"), "dua dompet: pembaca ditanya lebih dulu");
  ok(two.options().length === 2, "keduanya terdaftar");
  ok(two.options().map(b => b.textContent).join(" ").includes("Phantom")
     && two.options().map(b => b.textContent).join(" ").includes("MetaMask"),
    "dengan namanya masing-masing, jadi yang salah bisa dihindari");

  two.options().find(b => b.textContent.includes("MetaMask"))
    .dispatchEvent(new two.win.MouseEvent("click", { bubbles: true }));
  await minting;
  await sleep(40);
  ok(two.sent.length === 1 && two.sent[0].via === "io.metamask",
    "transaksinya pergi ke yang dipilih");
  ok(!two.asked.some(m => m.startsWith("app.phantom:")),
    "dan yang tidak dipilih tidak pernah ditanya apa-apa");

  const off = await boot({ announce: [SOL, FOX] });
  const pending = off.mint();
  await sleep(40);
  off.el("wpickCancel").dispatchEvent(new off.win.MouseEvent("click", { bubbles: true }));
  await pending;
  ok(off.sent.length === 0, "membatalkan pilihan tidak mengirim apa pun");
  ok(/No wallet chosen/.test(off.msg()), "dan dikatakan tidak ada yang dipilih, bukan tidak ada dompet");

  // info.name and info.icon are written by a browser extension.
  const EVIL = { info: { uuid: "u3", name: "<img src=x onerror=alert(1)>",
                         rdns: "x.evil", icon: "https://tracker.example/px.png" } };
  const hostile = await boot({ announce: [EVIL, FOX] });
  hostile.mint();
  await sleep(40);
  const row = hostile.options().find(b => b.dataset.uuid === "u3");
  ok(row.querySelector("img[src^='https://tracker']") === null,
    "ikon yang bukan data URI tidak dimuat — nama dompet bukan izin memanggil host lain");
  ok(row.textContent.includes("<img src=x onerror=alert(1)>"),
    "dan nama bermuatan markup dibaca sebagai teks, bukan dieksekusi");
}

head("alamat halaman");
{
  // contractURI() shipped https://nekara.xyz/keys on-chain, in a contract with
  // no setter for it. The page moved to /mint; the old address did not, and
  // cannot. Every marketplace reading the collection follows that link.
  const shown = d => [...d.querySelectorAll('[id^="v-"]')]
    .filter(el => !el.classList.contains("hide")).map(el => el.id);

  const moved = await boot({ url: "http://localhost/mint", navigate: false });
  ok(shown(moved.doc).join() === "v-mint", "/mint sendiri membuka halaman mint");

  const published = await boot({ url: "http://localhost/keys", navigate: false });
  ok(shown(published.doc).join() === "v-mint",
    "/keys yang sudah terbit di dalam kontrak sampai ke halaman yang sama");

  const other = await boot({ url: "http://localhost/custody", navigate: false });
  ok(shown(other.doc).join() === "v-vault",
    "dan alamat lain tetap ke halamannya sendiri — bukan mint karena kebetulan");
}

console.log(`\n${failures ? failures + " GAGAL" : "semua lolos"}`);
process.exit(failures ? 1 : 0);
