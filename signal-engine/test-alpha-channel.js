/**
 * The second channel, and the one thing it must never become.
 *
 * A Telegram channel cannot ask who is reading it. Post to one early and
 * everybody holding the invite link is ahead of every key holder who paid for
 * seconds — the ladder handed to whoever forwards a link, which is the same
 * failure as gating latency in the browser with a longer fuse. So what makes
 * the alpha channel different is *what* goes in it, never *when*, and the first
 * assertions here are about the clock.
 *
 * The rest is the filter itself: which calls it carries, that a call it never
 * got cannot receive that call's milestones, and that a channel staying quiet
 * says so in the log — a working filter and a broken deploy look identical from
 * the outside, and only the log tells them apart.
 */
import { rmSync } from "node:fs";
import { FileStore } from "./store.js";
import { start } from "./index.js";
import { Telegram } from "./notify.js";

const DATA = "./data/alpha-chan-test.json";
let failures = 0;
const ok = (c, m) => { console.log(`  ${c ? "ok   " : "GAGAL"}  ${m}`); if (!c) failures++; };
const head = t => console.log(`\n${t}`);

const SUPPLY = 1e9, ENTRY = 0.00005, ENTRY_MC = ENTRY * SUPPLY;
const pair = x => ({
  chainId: "solana", dexId: "meteora", pairAddress: "FIRED",
  baseToken: { address: "TOK", symbol: "BRASS", name: "Brass Monkey" },
  priceUsd: String(ENTRY * x), liquidity: { usd: 60_000 },
});
let pairs = [];
const api = { latestProfiles: async () => [], latestBoosts: async () => [], topBoosts: async () => [],
              pairsForToken: async () => [], tokensBatch: async () => pairs };

const recorder = () => { const sent = []; return { sent,
  tg: { configured: true, send: async t => { sent.push(t); return true; } } }; };

const newCall = (store, score, firedAt = new Date().toISOString()) => store.insertCall({
  callerId: 1, chain: "solana", tokenAddress: "TOK", pairAddress: "FIRED",
  symbol: "BRASS", name: "Brass Monkey", dex: "meteora", firedAt,
  entryPriceUsd: ENTRY, entrySupply: SUPPLY, entryMc: ENTRY_MC,
  entryLiquidityUsd: 60_000, score, reasons: ["Volume running 5.7× the hourly pace"],
});

const run = async (label, { score, min = 60, publicDelayS = 0, port, firedAt }, fn) => {
  rmSync(DATA, { force: true });
  const store = new FileStore(DATA);
  const call = newCall(store, score, firedAt);
  const pub = recorder(), alp = recorder();
  const eng = start({ store, api, port, log: () => {}, publicDelayS,
                      telegram: pub.tg, alphaChat: alp.tg, alphaMinScore: min });
  head(label);
  try { await fn({ eng, store, call, pub, alp }); } finally { eng.stop(); }
};

/* ═══════ the clock ═══════ */
await run("alpha tidak pernah mendahului siapa pun", { score: 90, port: 8801, publicDelayS: 3600 },
  async ({ eng, store, pub, alp }) => {
    pairs = [pair(4)];
    await eng.refresh(store.liveCalls());
    ok(alp.sent.length === 0,
      "jendela publik belum terbuka, jadi channel alpha juga belum dapat apa-apa");
    ok(pub.sent.length === 0, "begitu juga channel publik — satu jam yang sama");
    ok(store.mark(1).peakX >= 4,
      "yang ditahan siarannya, bukan pengamatannya — mark-nya tetap berjalan");
  });

/* ═══════ the filter ═══════ */
await run("skor di atas ambang masuk", { score: 90, min: 60, port: 8802 },
  async ({ eng, store, pub, alp }) => {
    pairs = [pair(4)];
    await eng.refresh(store.liveCalls());
    ok(alp.sent.length > 0, "call yang skornya cukup masuk ke alpha");
    ok(pub.sent.length > 0, "dan tetap masuk ke channel publik — alpha menambah, tidak menggantikan");
    ok(alp.sent.length === pub.sent.length, "keduanya dapat pesan yang sama banyaknya");
  });

await run("skor di bawah ambang tidak", { score: 44, min: 60, port: 8803 },
  async ({ eng, store, pub, alp }) => {
    pairs = [pair(4)];
    await eng.refresh(store.liveCalls());
    ok(alp.sent.length === 0, "call yang skornya kurang tidak masuk alpha sama sekali");
    ok(pub.sent.length > 0, "sementara channel publik tetap dapat");
    /* The half that is easy to get wrong: a channel that never received the
       call must not receive that call's milestones either, or the alpha
       channel reads as a feed of numbers with no calls attached. */
    ok(!alp.sent.some(t => /📈/.test(t)),
      "dan tonggak kemajuannya pun tidak — channel yang tidak dapat call-nya tidak dapat kabarnya");
  });

await run("tepat di ambang masuk", { score: 60, min: 60, port: 8804 },
  async ({ eng, store, alp }) => {
    pairs = [pair(4)];
    await eng.refresh(store.liveCalls());
    ok(alp.sent.length > 0, "ambangnya inklusif — 60 dengan syarat 60 lolos");
  });

/* ═══════ the log, because silence has to be explainable ═══════ */
head("channel yang diam mengatakan kenapa");
{
  rmSync(DATA, { force: true });
  const store = new FileStore(DATA);
  const lines = [];
  const alp = recorder();
  const eng = start({ store, api, port: 8805, log: (...a) => lines.push(a.join(" ")),
                      telegram: recorder().tg, alphaChat: alp.tg, alphaMinScore: 60 });
  ok(lines.some(l => /\[alpha\] channel on, carrying calls scoring 60/.test(l)),
    "saat start ia menyebut ambangnya, jadi tidak perlu ditebak dari diamnya");
  eng.stop();

  const off = [];
  const eng2 = start({ store: new FileStore(DATA), api, port: 8806, log: (...a) => off.push(a.join(" ")),
                       telegram: recorder().tg,
                       alphaChat: new Telegram({ token: "t", chatId: null, log: () => {} }) });
  ok(off.some(l => /\[alpha\] channel off/.test(l)),
    "dan tanpa TG_ALPHA_CHAT ia mengatakan mati, bukan diam saja");
  eng2.stop();
}

rmSync(DATA, { force: true });
console.log(failures ? `\n${failures} GAGAL` : "\nsemua lolos");
process.exit(failures ? 1 : 0);
