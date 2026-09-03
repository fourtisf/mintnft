/**
 * The alert bot, and the two things about it that are worth a test.
 *
 * A key can be sold between linking a chat and a call firing. If the tier were
 * stored on the subscriber, the seller would keep receiving Tier III latency
 * they no longer own and the buyer would sit on the public leg wondering what
 * they paid for. It is read from the chain on every send, and this asserts that
 * by changing the answer between two calls without touching the subscriber.
 *
 * And the binding needs both halves: a code proves control of the chat, a SIWE
 * session proves control of the wallet. Either alone would let anyone who can
 * read a chat id claim someone else's tier.
 */
import { rmSync } from "node:fs";
import { FileStore } from "./store.js";
import { TelegramBot, LinkCodes, makeCode, CHAIN_ALIAS } from "./tgbot.js";
import { start } from "./index.js";
import { issueSession } from "./auth.js";

const DATA = "./data/tgbot-test.json";
const PORT = 8801;

let failures = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "ok   " : "GAGAL"}  ${msg}`); if (!cond) failures++; };
const head = t => console.log(`\n${t}`);

/* A Telegram that answers instead of reaching the network. Every request is
   kept, because "the bot did nothing" and "the bot sent the wrong thing" have
   to be different failures. */
function fakeTg({ updates = [], fail = null } = {}) {
  const sent = [];
  const queue = [...updates];
  const fetchImpl = async (url, init) => {
    const method = url.split("/").pop();
    const body = JSON.parse(init.body);
    if (method === "getUpdates") {
      const batch = queue.splice(0, queue.length);
      return { json: async () => ({ ok: true, result: batch }) };
    }
    if (method === "sendMessage") {
      if (fail && fail(body)) return { json: async () => ({ ok: false, error_code: 403, description: "blocked" }) };
      sent.push(body);
      return { json: async () => ({ ok: true, result: { message_id: sent.length } }) };
    }
    return { json: async () => ({ ok: true, result: {} }) };
  };
  return { sent, queue, fetchImpl };
}

const msg = (chatId, text) => ({ update_id: Math.floor(Math.random() * 1e9), message: { chat: { id: chatId }, text } });
const textsTo = (sent, chatId) => sent.filter(m => m.chat_id === chatId).map(m => m.text);

const CALL = { seq: 7, firedAt: new Date().toISOString(), chain: "solana", score: 81, entryMc: 50_000 };

/* ═══════ codes ═══════ */
head("kode tautan");
{
  const codes = new LinkCodes({ ttlMs: 1000, now: () => 5_000 });
  const a = codes.issue(111);
  ok(/^[A-Z2-9]{6}$/.test(a), `enam karakter tanpa O/0 dan I/1 (${a})`);

  const b = codes.issue(111);
  ok(codes.redeem(a) === null, "kode kedua untuk chat yang sama mematikan yang pertama");
  ok(codes.redeem(b)?.chatId === 111, "dan yang baru berlaku");
  ok(codes.redeem(b) === null, "sekali pakai — penukaran kedua ditolak");

  const stale = new LinkCodes({ ttlMs: 1000, now: () => 0 });
  const c = stale.issue(222);
  stale.now = () => 2_000;
  ok(stale.redeem(c) === null, "dan yang kedaluwarsa ditolak walaupun belum pernah dipakai");

  const seen = new Set();
  const many = new LinkCodes();
  for (let i = 0; i < 200; i++) seen.add(many.issue(i));
  ok(seen.size === 200, `dua ratus kode, tidak ada yang bertabrakan (${seen.size})`);
  ok(makeCode(() => 0) === "AAAAAA", "generatornya deterministik terhadap sumber acaknya");
}

/* ═══════ commands ═══════ */
head("perintah");
{
  rmSync(DATA, { force: true });
  const store = new FileStore(DATA);
  const tg = fakeTg();
  const bot = new TelegramBot({ token: "T", store, tierSource: { bestTierOf: async () => 0 },
                                fetchImpl: tg.fetchImpl, log: () => {} });

  await bot.handle(msg(10, "/start").message);
  ok(store.subscriber(10)?.active, "/start membuat pelanggan aktif");
  ok(store.subscriber(10).address === null, "tanpa alamat — publik itu keadaan sah, bukan kesalahan");
  ok(/public leg/.test(textsTo(tg.sent, 10)[0] ?? ""), "dan pesannya bilang dia ada di kaki publik");

  await bot.handle(msg(10, "/link").message);
  const code = (textsTo(tg.sent, 10).at(-1).match(/`([A-Z2-9]{6})`/) ?? [])[1];
  ok(code, `/link memberi kode yang bisa dibaca orang (${code})`);
  ok(bot.codes.redeem(code)?.chatId === 10, "dan kode itu benar-benar menunjuk chat-nya");

  await bot.handle(msg(10, "/filters sol,base score 70 mc 200000").message);
  const f = store.subscriber(10).filters;
  ok(f.chains?.join(",") === "solana,base" && f.minScore === 70 && f.maxMc === 200_000,
    `filter dibaca dari urutan apa pun (${JSON.stringify(f)})`);

  await bot.handle(msg(10, "/filters pancake score tujuh").message);
  ok(/Could not read/.test(textsTo(tg.sent, 10).at(-1)),
    "kata yang tidak terbaca ditolak, bukan diabaikan diam-diam");
  ok(store.subscriber(10).filters.minScore === 70,
    "dan filter lama tidak ikut rusak karena satu kata salah");

  await bot.handle(msg(10, "/filters off").message);
  ok(Object.keys(store.subscriber(10).filters).length === 0, "/filters off mengosongkannya");

  await bot.handle(msg(10, "/stop").message);
  ok(store.subscriber(10).active === false, "/stop menonaktifkan tanpa menghapus");
  await bot.handle(msg(10, "/start").message);
  ok(store.subscriber(10).active === true, "dan /start menghidupkannya lagi, bukan membuat orang asing");

  ok(CHAIN_ALIAS.sol === "solana" && CHAIN_ALIAS.bnb === "bsc",
    "alias rantai memetakan yang diketik orang ke yang dipakai register");
}

/* ═══════ the thing this feature lives or dies on ═══════ */
head("tier dibaca saat kirim, bukan saat menautkan");
{
  rmSync(DATA, { force: true });
  const store = new FileStore(DATA);
  const tg = fakeTg();
  let tier = 3;
  const bot = new TelegramBot({ token: "T", store, tierSource: { bestTierOf: async () => tier },
                                fetchImpl: tg.fetchImpl, log: () => {},
                                delays: { 3: 0, 2: 5, 1: 10, 0: 3600 } });
  store.addSubscriber(20);
  store.linkSubscriber(20, "0xAbC0000000000000000000000000000000000001");
  ok(store.subscriber(20).address === "0xabc0000000000000000000000000000000000001",
    "alamat disimpan huruf kecil, jadi dua ejaan tidak jadi dua pelanggan");

  const n1 = await bot.fanout(CALL, "one");
  ok(n1 === 1 && textsTo(tg.sent, 20).length === 1, "Tier III menerima seketika");

  // The key is sold. Nothing about the subscriber changes.
  tier = 0;
  const before = JSON.stringify(store.subscriber(20));
  await bot.fanout({ ...CALL, firedAt: new Date().toISOString() }, "two");
  ok(textsTo(tg.sent, 20).length === 1,
    "setelah kuncinya dijual, kiriman berikutnya ditahan di kaki publik");
  ok(JSON.stringify(store.subscriber(20)) === before,
    "dan tidak ada tier tersimpan di baris pelanggan yang bisa jadi basi");

  tier = 2;
  await bot.fanout({ ...CALL, firedAt: new Date(Date.now() - 10_000).toISOString() }, "three");
  ok(textsTo(tg.sent, 20).length === 2,
    "membeli kunci lagi langsung mengembalikan latensinya, tanpa menautkan ulang");
  bot.stop();
}

head("chat tanpa kunci menunggu kaki publik");
{
  rmSync(DATA, { force: true });
  const store = new FileStore(DATA);
  const tg = fakeTg();
  const bot = new TelegramBot({ token: "T", store, tierSource: { bestTierOf: async () => 3 },
                                fetchImpl: tg.fetchImpl, log: () => {},
                                delays: { 3: 0, 2: 5, 1: 10, 0: 3600 } });
  store.addSubscriber(25);
  const n = await bot.fanout(CALL, "public");
  ok(n === 1, "dia tetap dihitung sebagai penerima");
  ok(textsTo(tg.sent, 25).length === 0,
    "tapi tidak menerima apa pun sampai jam publiknya lewat — /start itu channel gratis, bukan pintu belakang");
  bot.stop();
}

head("penyaringan dan pemblokiran");
{
  rmSync(DATA, { force: true });
  const store = new FileStore(DATA);
  const tg = fakeTg({ fail: b => b.chat_id === 32 });
  // PUBLIC_DELAY_S=0, seperti saat belum ada kunci terjual: semuanya seketika,
  // jadi yang diuji di sini benar-benar penyaring dan pemblokiran, bukan jadwal.
  const bot = new TelegramBot({ token: "T", store, tierSource: { bestTierOf: async () => 3 },
                                fetchImpl: tg.fetchImpl, log: () => {},
                                delays: { 3: 0, 2: 5, 1: 10, 0: 0 } });
  store.addSubscriber(30); store.setSubscriberFilters(30, { chains: ["base"] });
  store.addSubscriber(31); store.setSubscriberFilters(31, { minScore: 90 });
  store.addSubscriber(32);

  await bot.fanout(CALL, "sol call");
  ok(textsTo(tg.sent, 30).length === 0, "penyaring rantai menahan call yang bukan miliknya");
  ok(textsTo(tg.sent, 31).length === 0, "skor 81 tidak lolos ambang 90");
  ok(store.subscriber(32).active === false,
    "pelanggan yang memblokir bot dinonaktifkan, bukan dicoba ulang selamanya");

  const n = await bot.fanout(CALL, "again");
  ok(n === 0, "dan tidak ikut dihitung lagi di kiriman berikutnya");
  bot.stop();
}

/* ═══════ the binding, end to end through the route ═══════ */
head("menautkan lewat rute, dan apa yang tidak cukup");
{
  rmSync(DATA, { force: true });
  const store = new FileStore(DATA);
  const tg = fakeTg();
  const eng = start({ store, port: PORT, log: () => {},
                      api: { latestProfiles: async () => [], latestBoosts: async () => [],
                             topBoosts: async () => [], pairsForToken: async () => [],
                             tokensBatch: async () => [] } });
  // The engine builds its own bot from the environment; this test drives that
  // one so the route and the bot are the same objects in production.
  eng.bot.token = "T";
  eng.bot.fetch = tg.fetchImpl;
  eng.bot.tierSource = { bestTierOf: async () => 2 };

  await eng.bot.handle(msg(40, "/link").message);
  const code = (textsTo(tg.sent, 40).at(-1).match(/`([A-Z2-9]{6})`/) ?? [])[1];
  const base = `http://127.0.0.1:${PORT}`;
  const post = (body, token) => fetch(`${base}/api/tg/link`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

  let r = await post({ code });
  ok(r.status === 401, "kode saja tidak cukup — tanpa sesi, ditolak");
  ok(store.subscriber(40)?.address == null, "dan tidak ada yang terikat");

  const addr = "0xDeF0000000000000000000000000000000000002";
  const token = issueSession({ address: addr, tier: 2 }, eng.server.secret);
  r = await post({ code: "ZZZZZZ" }, token);
  ok(r.status === 400, "sesi saja tidak cukup — kode karangan ditolak");
  const why = (await r.json()).error;
  ok(/expired or not one of ours/.test(why),
    "dan alasannya tidak membedakan kedaluwarsa dari tidak pernah ada — bukan orakel kode hidup");

  r = await post({ code }, token);
  ok(r.status === 200, "kedua paruh bersama-sama mengikat");
  ok(store.subscriber(40).address === addr.toLowerCase(),
    "chat terikat ke dompet yang menandatangani, bukan ke yang diketik di badan permintaan");
  ok(/Linked to/.test(textsTo(tg.sent, 40).at(-1) ?? ""), "dan chat-nya diberi tahu");

  r = await post({ code }, token);
  ok(r.status === 400, "kode yang sama tidak bisa dipakai dua kali");

  // A second chat claims the same wallet: the binding moves, it does not fan out.
  await eng.bot.handle(msg(41, "/link").message);
  const code2 = (textsTo(tg.sent, 41).at(-1).match(/`([A-Z2-9]{6})`/) ?? [])[1];
  ok((await post({ code: code2 }, token)).status === 200, "chat kedua boleh mengklaim dompet yang sama");
  ok(store.subscriber(41).address === addr.toLowerCase() && store.subscriber(40).address === null,
    "dan ikatannya pindah — satu dompet, satu chat, bukan latensi yang menyebar");

  eng.stop();
}

rmSync(DATA, { force: true });
console.log(`\n${failures ? failures + " GAGAL" : "semua lolos"}`);
process.exit(failures ? 1 : 0);
