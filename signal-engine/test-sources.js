/**
 * Which source found a call, and whether it earned its key.
 *
 * The profile feed only ever sees tokens whose team filed a profile, which the
 * pools worth catching have not. A pool watcher fixes that — and turning one
 * on is an act of faith unless the counts are kept per source, because the
 * candidate total goes up either way. A source that doubles the candidates and
 * never produces one that clears a gate is a source costing a key for nothing,
 * and only scanned-and-fired together can say so.
 *
 * The attribution is frozen on the call, in a hashed field, so a source cannot
 * be credited afterwards with a winner it did not find.
 */
import { MergedSource, ProfileSource, PonsSource, PONS_V1_FACTORY, PONS_TOKEN_LAUNCHED } from "./sources.js";
import { Triage } from "./triage.js";
import { Engine } from "./engine.js";
import { CONFIG } from "./rules.js";

/* Fikstur di sini pool Solana, dan gate rantai defaultnya robinhood saja.
   Yang diuji berkas ini adalah atribusi sumber, bukan rantai mana yang
   ditembak — kecuali di blok terakhir, yang justru menguji penyaringan itu. */
const ANY = { ...CONFIG, chains: [] };
import { FIXTURES } from "./fixtures.js";
import { recordHash } from "./integrity.js";
import { FileStore } from "./store.js";
import { rmSync } from "node:fs";

let failures = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "ok   " : "GAGAL"}  ${msg}`); if (!cond) failures++; };

const src = (name, pairs) => ({ name, candidates: async () => pairs });
const tok = (a, o = {}) => ({ ...FIXTURES.fires, chainId: "solana",
  pairAddress: "P" + a, baseToken: { ...FIXTURES.fires.baseToken, address: a, symbol: a }, ...o });

console.log("\nSIAPA YANG MENEMUKAN");
{
  const merged = new MergedSource([
    src("dexscreener-profiles", [tok("A"), tok("SHARED")]),
    src("helius-pools", [tok("SHARED"), tok("B")]),
  ]);
  const got = await merged.candidates();
  ok(got.length === 3, `three tokens after the duplicate is dropped (${got.length})`);
  const by = Object.fromEntries(got.map(p => [p.baseToken.address, p.discoveredBy]));
  ok(by.A === "dexscreener-profiles" && by.B === "helius-pools", "each carries the source that produced it");
  ok(by.SHARED === "dexscreener-profiles",
    "a token both sources see is credited to the one that saw it first — the only comparison worth making");

  const broken = new MergedSource([
    { name: "throws", candidates: async () => { throw new Error("rpc down"); } },
    src("helius-pools", [tok("C")]),
  ]);
  ok((await broken.candidates()).length === 1,
    "a source that throws does not take the others down with it");
  const run = broken.lastRun.find(r => r.name === "throws");
  ok(run && run.error === "rpc down",
    "and does not vanish either — the failure is recorded against it by name");
  ok(broken.lastRun.find(r => r.name === "helius-pools").error === null,
    "while the one that worked is recorded as having worked");
}

console.log("\nSUMBER YANG RUSAK TIDAK TERBACA SEPERTI SUMBER YANG SEPI");
{
  // The failure this exists for: an engine that scanned zero candidates for six
  // hours because every call to the provider was failing, and every one of
  // those failures was swallowed into an empty array.
  const t = new Triage();
  const merged = new MergedSource([
    { name: "dexscreener-profiles", candidates: async () => { throw new Error("ENOTFOUND"); } },
    src("helius-pools", []),
  ]);
  for (let i = 0; i < 3; i++) {
    const pairs = await merged.candidates();
    t.scanned(pairs.length, pairs, merged.lastRun);
  }
  const s = t.snapshot();
  const of = id => s.sources.find(x => x.id === id);
  ok(s.scanned === 0, "nothing was scanned, which is true either way");
  ok(of("dexscreener-profiles").errors === 3 && of("dexscreener-profiles").runs === 3,
    "the failing source shows three runs and three failures — it is not absent");
  ok(of("dexscreener-profiles").lastError === "ENOTFOUND",
    `and carries the reason: "${of("dexscreener-profiles").lastError}"`);
  ok(of("helius-pools").errors === 0 && of("helius-pools").runs === 3,
    "the source that ran and honestly found nothing is told apart from it");
}

console.log("\nHITUNGAN PER SUMBER");
{
  const t = new Triage();
  t.scanned(3, [tok("A", { discoveredBy: "dexscreener-profiles" }),
                tok("B", { discoveredBy: "helius-pools" }),
                tok("C", { discoveredBy: "helius-pools" })]);
  t.fired("helius-pools");
  const s = t.snapshot();
  const of = id => s.sources.find(x => x.id === id);
  ok(s.scanned === 3 && s.fired === 1, "the totals are unchanged");
  ok(of("helius-pools").scanned === 2 && of("helius-pools").fired === 1,
    "the watcher's two candidates and its one call are counted against it");
  ok(of("dexscreener-profiles").fired === 0 && of("dexscreener-profiles").passRate === 0,
    "a source that found nothing that fired reads 0, because it did scan");
  const empty = new Triage().snapshot();
  ok(empty.sources.length === 0, "and a source that scanned nothing is not invented");

  const un = new Triage();
  un.scanned(1, [tok("X")]);
  ok(un.snapshot().sources[0].id === "unattributed",
    "a candidate with no source is labelled, not silently dropped from the count");
}

console.log("\nATRIBUSI IKUT TERKUNCI DI HASH");
{
  const DATA = "./data/sources-test.json";
  rmSync(DATA, { force: true });
  const store = new FileStore(DATA);
  const fired = [];
  await new Engine({
    client: {}, log: () => {}, cfg: ANY,
    source: new MergedSource([src("helius-pools", [tok("A")])]),
    inspector: { configured: false, inspect: async () => null },
    onSignal: s => fired.push(store.insertCall(s)),
  }).tick();

  ok(fired.length === 1, "the call fired");
  ok(fired[0].sourceRef === "helius-pools", "and records which source found it");
  const hash = fired[0].recordHash;
  ok(recordHash({ ...fired[0], sourceRef: "dexscreener-profiles" }) !== hash,
    "reattributing it to another source breaks the record hash — the credit cannot move");
  rmSync(DATA, { force: true });
}

console.log("\nWATCHER HANYA IKUT KALAU ADA KUNCINYA");
{
  // An idle source logs its own absence on every tick, which is how a log
  // becomes unreadable. It is left out entirely rather than added and ignored.
  const names = () => new Engine({ client: {}, cfg: ANY, log: () => {} }).source.sources.map(s => s.name);
  const before = process.env.HELIUS_KEY;
  delete process.env.HELIUS_KEY;
  ok(!names().includes("helius-pools"), "with no key the pool watcher is not in the list at all");
  process.env.HELIUS_KEY = "  k  ";
  ok(names().includes("helius-pools"), "with one it is — and whitespace around it is still a key");
  process.env.HELIUS_KEY = "   ";
  ok(!names().includes("helius-pools"), "a key that is only whitespace is not a key here either");
  if (before == null) delete process.env.HELIUS_KEY; else process.env.HELIUS_KEY = before;
  ok(names().includes("dexscreener-profiles") && names().includes("dexscreener-boosts"),
    "the free sources are there either way — a watcher is added, never a replacement");
}

console.log("\nPONS, DARI LOG PABRIKNYA SENDIRI");
{
  /* Sumber ini tidak menunggu tim mengisi profil — peluncurannya sendiri yang
     memberi tahu, dan itu datang di dalam blok. Yang diuji di sini adalah hal
     yang tidak bisa dilihat dari luar sekali sudah jalan: alamat mana yang
     ditanyakan, topik mana, dan slot mana yang dianggap token. Salah satu saja
     meleset dan sumber ini mengembalikan nol selamanya — persis seperti sumber
     yang bekerja dan tidak menemukan apa-apa. */
  const DEPLOYER = "0x" + "d".repeat(40);
  const TOKEN = "0x" + "1".repeat(40);
  const pad = a => "0x" + a.slice(2).padStart(64, "0");

  const asked = [];
  const rpc = async (_url, init) => {
    const body = JSON.parse(init.body);
    asked.push(body);
    if (body.method === "eth_blockNumber") return { ok: true, json: async () => ({ result: "0x2710" }) };
    return { ok: true, json: async () => ({ result: [{ topics: [PONS_TOKEN_LAUNCHED, pad(TOKEN), pad(DEPLOYER), pad(DEPLOYER)] }] }) };
  };
  const priced = [];
  const api = { tokensBatch: async (chain, tokens) => { priced.push([chain, tokens]); return []; } };

  const pons = new PonsSource(api, { rpc: "http://rpc", fetchImpl: rpc, log: () => {} });
  await pons.candidates();

  const getLogs = asked.find(b => b.method === "eth_getLogs")?.params?.[0] ?? {};
  ok(pons.name === "pons-launchpad", "namanya sendiri, supaya Triage bisa memisahkan hasilnya");
  ok(getLogs.address === PONS_V1_FACTORY, "yang ditanya adalah pabrik Pons V1, bukan default Uniswap");
  ok(String(getLogs.topics?.[0]) === PONS_TOKEN_LAUNCHED, "dan topiknya TokenLaunched");
  ok(priced[0]?.[0] === "robinhood", "harganya dibaca di robinhood — nama rantai yang dipakai Dexscreener");
  ok(priced[0]?.[1].length === 1 && priced[0][1][0] === TOKEN,
    "hanya slot 1 yang token: deployer di slot 2 tidak ikut dihargai sebagai token");

  /* Sebuah node yang mati, membatasi laju, atau menolak rentang bloknya dulu
     mengembalikan array kosong — jadi sumber yang tidak bisa berjalan terbit
     sebagai sumber yang berjalan dan tidak menemukan apa-apa, dengan
     errors: 0 di halaman Triage. Itu satu hal yang tidak boleh dilakukan
     berkas mana pun di sini. */
  const failing = kind => new PonsSource(api, {
    rpc: "http://rpc", log: () => {},
    fetchImpl: async () => kind === "http"
      ? { ok: false, status: 429, json: async () => ({}) }
      : { ok: true, json: async () => ({ error: { message: "block range too wide" } }) },
  }).candidates();
  const threw = async p => { try { await p; return null; } catch (e) { return String(e.message ?? e); } };
  ok((await threw(failing("http")))?.includes("429"),
    "RPC yang menolak dengan HTTP melempar, tidak mengembalikan nol diam-diam");
  ok((await threw(failing("jsonrpc")))?.includes("block range too wide"),
    "galat JSON-RPC juga — 200 dengan error di badannya bukan hasil kosong");

  /* Dan yang dilempar itu harus sampai ke Triage sebagai galat, bukan hilang. */
  const merged2 = new MergedSource([new PonsSource(api, {
    rpc: "http://rpc", log: () => {},
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }),
  })]);
  await merged2.candidates();
  const t2 = new Triage();
  t2.scanned(0, [], merged2.lastRun);
  const s2 = t2.snapshot().sources.find(x => x.id === "pons-launchpad");
  ok(s2?.errors === 1 && /429/.test(s2?.lastError ?? ""),
    "dan /api/triage menghitungnya sebagai errors: 1 dengan pesannya, bukan scanned: 0");

  /* Jendela dingin. Di rantai Nitro 200 blok kurang dari satu menit sejarah,
     dan tick pertama setelah deploy melaporkan itu sebagai tidak ada apa-apa. */
  const cold = new PonsSource(api, { rpc: "http://rpc", fetchImpl: rpc, log: () => {} });
  ok(cold.lookback >= 5000, "jendela dingin Pons jauh lebih lebar dari default 200 blok");

  const names = (cfg = CONFIG) => new Engine({ client: {}, cfg, log: () => {} }).source.sources.map(s => s.name);
  const before = process.env.ROBINHOOD_RPC;
  delete process.env.ROBINHOOD_RPC;
  ok(!names().includes("pons-launchpad"), "tanpa ROBINHOOD_RPC sumbernya tidak ikut sama sekali");
  process.env.ROBINHOOD_RPC = " http://rpc ";
  ok(names().includes("pons-launchpad"), "dengan RPC-nya, ikut");
  if (before == null) delete process.env.ROBINHOOD_RPC; else process.env.ROBINHOOD_RPC = before;

  /* Pabrik per rantai. Dulu semua watcher memakai default konstruktor —
     Uniswap v3 di Base — jadi watcher ETH memindai alamat yang bukan pabrik di
     sana, mengembalikan nol selamanya, dan tetap mencetak namanya di baris
     discovery. Rantai yang alamatnya tidak dicatat sekarang ditinggalkan. */
  const bsc = process.env.BSC_RPC, eth = process.env.ETH_RPC;
  process.env.BSC_RPC = "http://rpc"; delete process.env.ETH_RPC;
  ok(!names(ANY).includes("evm-factory:bsc"), "RPC BSC tanpa alamat pabrik: watcher-nya tidak dibuat");
  process.env.ETH_RPC = "http://rpc";
  ok(names(ANY).includes("evm-factory:ethereum"), "ethereum punya alamatnya, jadi ikut");
  ok(!names().includes("evm-factory:ethereum"),
    "tapi di meja Robinhood ia ditinggalkan juga — watcher rantai yang tidak ditembak tidak dibuat");
  if (bsc == null) delete process.env.BSC_RPC; else process.env.BSC_RPC = bsc;
  if (eth == null) delete process.env.ETH_RPC; else process.env.ETH_RPC = eth;
}

console.log("\nUMPAN SEMUA RANTAI, DISARING SEBELUM DIHARGAI");
{
  /* Profil dan boost Dexscreener mengembalikan setiap rantai yang ia indeks.
     Di meja satu rantai, sembilan dari sepuluh kandidat adalah satu permintaan
     batch yang dibelanjakan untuk tidak mempelajari apa pun — jadi mereka
     dibuang sebelum dihargai, bukan di gate.

     Harganya nyata: kandidat itu tidak pernah menjadi penolakan yang bisa
     diperdebatkan siapa pun. Maka ia dihitung. "Umpan profil tidak menemukan
     apa-apa" dan "ia menemukan tiga puluh, semuanya di tempat lain" adalah dua
     fakta berbeda, dan hanya angka ini yang memisahkannya di halaman. */
  const batched = [];
  const api = {
    latestProfiles: async () => [
      { chainId: "solana", tokenAddress: "S1" }, { chainId: "base", tokenAddress: "B1" },
      { chainId: "robinhood", tokenAddress: "R1" }, { chainId: "ROBINHOOD", tokenAddress: "R2" },
    ],
    tokensBatch: async (chain, tokens) => { batched.push([chain, tokens]); return []; },
  };

  const wide = await new ProfileSource(api, {}).candidates();
  ok(batched.length === 3, "tanpa daftar rantai, ketiga rantai itu tetap dihargai");
  ok((wide.offChain ?? 0) === 0, "dan tidak ada yang dibuang");

  batched.length = 0;
  const narrow = await new ProfileSource(api, { chains: ["robinhood"] }).candidates();
  ok(batched.length === 1 && batched[0][0] === "robinhood",
    "dengan daftarnya, hanya satu permintaan batch dan hanya untuk rantai itu");
  ok(batched[0][1].length === 2, "nama rantai dicocokkan tanpa peduli huruf besar-kecil");
  ok(narrow.offChain === 2, "dan yang dibuang dihitung, bukan hilang diam-diam");

  const merged = new MergedSource([new ProfileSource(api, { chains: ["robinhood"] })]);
  await merged.candidates();
  ok(merged.lastRun[0]?.offChain === 2, "MergedSource membawa angka itu keluar dari sumbernya");

  const t = new Triage();
  t.scanned(0, [], merged.lastRun);
  const src0 = t.snapshot().sources.find(x => x.id === "dexscreener-profiles");
  ok(src0?.offChain === 2, "dan /api/triage menerbitkannya per sumber");
  ok(src0?.scanned === 0,
    "terpisah dari scanned: yang dibuang tidak pernah dipindai, dan tidak berpura-pura sudah");
}

console.log(failures ? `\n${failures} GAGAL\n` : "\nsemua lolos\n");
process.exit(failures ? 1 : 0);
