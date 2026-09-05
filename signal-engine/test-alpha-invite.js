/**
 * The invite, and the reason it is only half the feature.
 *
 * Every other permission in this system is read from the chain at the moment it
 * is used: `bestTierOf` on every send, `tokensOfOwner` on every request. Selling
 * a key stops paying the seller on the next message, which is non-negotiable 7.
 *
 * A Telegram channel cannot work that way. Telegram grants membership once and
 * keeps it until somebody revokes it, so an invite issued on a check made today
 * is a permanent grant unless something takes it back. That something is the
 * sweep, and without it this whole feature would be the stored tier the rule
 * forbids, wearing a different hat.
 *
 * So the assertions here are, in order: who is refused a link, why an unlinked
 * wallet is refused rather than served, that the sweep removes a wallet that
 * sold its keys — and the one that matters most, that a chain it could not read
 * removes nobody. Removal is the destructive direction, and an RPC outage
 * driving it would empty the channel on a bad afternoon.
 */
import { rmSync } from "node:fs";
import { FileStore } from "./store.js";
import { serve } from "./api.js";
import { issueSession } from "./auth.js";
import { start } from "./index.js";
import { TelegramBot, COMMANDS } from "./tgbot.js";

const DATA = "./data/alpha-invite-test.json";
const SECRET = "test-secret";
const ADDR = "0x" + "22".repeat(20);
const CHAT = 4242;
const JOINED = 99001;      // the Telegram account that actually walked in
const LINK = "https://t.me/+abc123";

let failures = 0;
const ok = (c, m) => { console.log(`  ${c ? "ok   " : "GAGAL"}  ${m}`); if (!c) failures++; };
const head = t => console.log(`\n${t}`);

const chanStub = () => {
  const issued = [], removed = [];
  return { issued, removed, tg: { configured: true,
    createInvite: async o => { issued.push(o); return LINK; },
    removeMember: async id => { removed.push(id); return true; },
    send: async () => true } };
};
const holdStub = counts => { const seq = [...counts]; return {
  configured: true, countOf: async () => (seq.length > 1 ? seq.shift() : seq[0]) }; };

const post = async (port, token) => {
  const r = await fetch(`http://127.0.0.1:${port}/api/alpha/invite`,
    { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: r.status, body: await r.json() };
};

const withServer = async (port, { holdings, alphaChat, linked }, fn) => {
  rmSync(DATA, { force: true });
  const store = new FileStore(DATA);
  store.addSubscriber(CHAT);
  if (linked) store.linkSubscriber(CHAT, ADDR);
  const srv = serve(store, { port, secret: SECRET, triage: { rejects: [], nearMiss: [], snapshot: () => ({}) },
                             holdings, alphaChat, cfg: { scoreToFire: 43 }, log: () => {} });
  await new Promise(r => setTimeout(r, 60));
  try { await fn(store); } finally { srv.close(); }
};

const tok = () => issueSession({ address: ADDR, tier: 0 }, SECRET);

head("siapa yang tidak dapat link");
{
  const c = chanStub();
  await withServer(8811, { holdings: holdStub([0]), alphaChat: c.tg, linked: true }, async () => {
    const r = await post(8811, tok());
    ok(r.status === 403, "dompet tanpa key ditolak");
    ok(/holds 0/.test(r.body.error ?? ""), "dan diberi tahu berapa yang dipegangnya");
    ok(c.issued.length === 0, "tidak ada link yang pernah dibuat");
  });

  const c2 = chanStub();
  await withServer(8812, { holdings: holdStub([5]), alphaChat: c2.tg, linked: true }, async () => {
    const r = await post(8812, null);
    ok(r.status === 401, "tanpa sesi ditolak, walaupun dompet mana pun memenuhi syarat");
    ok(c2.issued.length === 0, "dan tetap tidak ada link");
  });
}

head("dompet yang memenuhi syarat tapi belum menautkan Telegram");
{
  const c = chanStub();
  await withServer(8813, { holdings: holdStub([5]), alphaChat: c.tg, linked: false }, async () => {
    const r = await post(8813, tok());
    /* The refusal that is really a design decision: a place that cannot be
       found again is a place that cannot be taken back. */
    ok(r.status === 409, "ditolak walaupun key-nya cukup");
    ok(r.body.need === "telegram", "dengan langkah yang kurang disebutkan, bukan sekadar 'tidak boleh'");
    ok(/take back/.test(r.body.message ?? ""), "dan alasannya: yang tidak bisa ditemukan tidak bisa dicabut");
    ok(c.issued.length === 0, "tidak ada undangan yang tidak bisa dicabut lagi");
  });
}

head("dompet yang memenuhi syarat dan sudah tertaut");
{
  const c = chanStub();
  await withServer(8814, { holdings: holdStub([5]), alphaChat: c.tg, linked: true }, async (store) => {
    const r = await post(8814, tok());
    ok(r.status === 200 && r.body.link, "dapat link");
    ok(r.body.expiresInS === 900, "yang kedaluwarsa, bukan berlaku selamanya");
    ok(store.subscriber(CHAT).alphaInvitedAt,
      "dan dicatat siapa yang dimasukkan — tanpa itu tidak ada yang bisa dikeluarkan");
    ok(store.subscriber(CHAT).alphaInviteLink === LINK,
      "berikut link-nya, karena link itu yang nanti mengaitkan siapa yang benar-benar masuk");
    ok(c.issued[0].name.includes("alpha"), "dan setiap permintaan membuat link barunya sendiri");
  });
}

/* ═══════ the half that makes the other half honest ═══════ */
head("penyapu mengambil kembali tempatnya");
{
  rmSync(DATA, { force: true });
  const store = new FileStore(DATA);
  store.addSubscriber(CHAT); store.linkSubscriber(CHAT, ADDR);
  store.markAlphaInvited(CHAT, LINK); store.bindAlphaMember(LINK, JOINED);
  const c = chanStub();
  const eng = start({ store, port: 8815, log: () => {}, alphaChat: c.tg,
                      holdings: holdStub([0, 0]),   // asked twice, sold both times
                      api: { latestProfiles: async () => [], latestBoosts: async () => [],
                             topBoosts: async () => [], pairsForToken: async () => [], tokensBatch: async () => [] } });
  await eng.sweepAlpha();
  ok(c.removed[0] === JOINED,
    "yang dikeluarkan akun yang benar-benar masuk, bukan chat yang dikirimi link-nya");
  ok(store.subscriber(CHAT).alphaInvitedAt === null,
    "dan catatannya dibersihkan, jadi penyapu berikutnya tidak mengeluarkan orang yang sama lagi");
  eng.stop();
}

head("rantai yang tidak terbaca tidak mengeluarkan siapa pun");
{
  rmSync(DATA, { force: true });
  const store = new FileStore(DATA);
  store.addSubscriber(CHAT); store.linkSubscriber(CHAT, ADDR);
  store.markAlphaInvited(CHAT, LINK); store.bindAlphaMember(LINK, JOINED);
  const c = chanStub();
  /* countOf answers 0 for a read it could not make, so the sweep asks twice.
     A node that is down once and up the next moment must not cost a place. */
  const eng = start({ store, port: 8816, log: () => {}, alphaChat: c.tg,
                      holdings: holdStub([0, 5]),
                      api: { latestProfiles: async () => [], latestBoosts: async () => [],
                             topBoosts: async () => [], pairsForToken: async () => [], tokensBatch: async () => [] } });
  await eng.sweepAlpha();
  ok(c.removed.length === 0,
    "nol yang tidak berulang dibaca sebagai tidak tahu, bukan sebagai sudah dijual");
  ok(store.subscriber(CHAT).alphaInvitedAt, "dan tempatnya tetap");
  eng.stop();
}

head("yang masih memenuhi syarat tidak diganggu");
{
  rmSync(DATA, { force: true });
  const store = new FileStore(DATA);
  store.addSubscriber(CHAT); store.linkSubscriber(CHAT, ADDR);
  store.markAlphaInvited(CHAT, LINK); store.bindAlphaMember(LINK, JOINED);
  const c = chanStub();
  const eng = start({ store, port: 8817, log: () => {}, alphaChat: c.tg,
                      holdings: holdStub([4]),
                      api: { latestProfiles: async () => [], latestBoosts: async () => [],
                             topBoosts: async () => [], pairsForToken: async () => [], tokensBatch: async () => [] } });
  await eng.sweepAlpha();
  ok(c.removed.length === 0, "empat key masih di atas Premium, jadi tidak disentuh");
  eng.stop();
}

/* The hole the join binding exists to close: `member_limit: 1` admits whoever
   clicks, so a forwarded link seats somebody the invite was not for. Banning
   the holder who never joined would remove the wrong person and leave the right
   one reading. */
head("link yang belum pernah dipakai tidak mengeluarkan siapa pun");
{
  rmSync(DATA, { force: true });
  const store = new FileStore(DATA);
  store.addSubscriber(CHAT); store.linkSubscriber(CHAT, ADDR);
  store.markAlphaInvited(CHAT, LINK);          // issued, never joined
  const c = chanStub();
  const eng = start({ store, port: 8818, log: () => {}, alphaChat: c.tg,
                      holdings: holdStub([0, 0]),
                      api: { latestProfiles: async () => [], latestBoosts: async () => [],
                             topBoosts: async () => [], pairsForToken: async () => [], tokensBatch: async () => [] } });
  await eng.sweepAlpha();
  ok(c.removed.length === 0,
    "tidak ada yang dibanned — chat yang dikirimi link bukan tentu yang masuk");
  ok(store.subscriber(CHAT).alphaInvitedAt === null,
    "undangannya dilepas, jadi ia tidak terus dilihat penyapu setiap sepuluh menit");
  eng.stop();
}

head("join lewat link itu mengaitkan akunnya");
{
  rmSync(DATA, { force: true });
  const store = new FileStore(DATA);
  store.addSubscriber(CHAT); store.linkSubscriber(CHAT, ADDR); store.markAlphaInvited(CHAT, LINK);
  ok(store.bindAlphaMember(LINK, JOINED)?.chatId === CHAT,
    "join dikaitkan lewat link-nya, bukan lewat tebakan siapa yang mengklik");
  ok(store.subscriber(CHAT).alphaUserId === JOINED, "dan akunnya tersimpan");
  ok(store.bindAlphaMember("https://t.me/+someoneelse", 5) === null,
    "link yang bukan kita terbitkan tidak mengaitkan apa pun");
}

/* ═══════ the same rules, asked for from inside Telegram ═══════ */
head("/alpha di DM menjawab dengan aturan yang sama");
{
  const say = [];
  const fetchImpl = async (url, init) => {
    const m = url.split("/").pop(), b = JSON.parse(init.body);
    if (m === "sendMessage") { say.push(b.text); return { json: async () => ({ ok: true, result: {} }) }; }
    return { json: async () => ({ ok: true, result: {} }) };
  };
  const mk = (store, { holdings, alphaChat }) => new TelegramBot({ token: "T", store,
    tierSource: { bestTierOf: async () => 0 }, holdings, alphaChat, alphaRung: 3,
    fetchImpl, log: () => {} });

  ok(COMMANDS.some(([c]) => c === "alpha"),
    "perintahnya terdaftar, jadi muncul di menu \"/\" dan bukan rahasia");

  rmSync(DATA, { force: true });
  let store = new FileStore(DATA);
  store.addSubscriber(CHAT);                       // subscribed, wallet not linked
  const c1 = chanStub();
  say.length = 0;
  await mk(store, { holdings: holdStub([5]), alphaChat: c1.tg }).alpha(CHAT);
  ok(/\/link/.test(say[0] ?? ""), "belum menautkan dompet: diarahkan ke /link");
  ok(c1.issued.length === 0, "dan tidak ada link yang terbit");

  rmSync(DATA, { force: true });
  store = new FileStore(DATA);
  store.addSubscriber(CHAT); store.linkSubscriber(CHAT, ADDR);
  const c2 = chanStub();
  say.length = 0;
  await mk(store, { holdings: holdStub([1]), alphaChat: c2.tg }).alpha(CHAT);
  ok(/opens at \*3\*/.test(say[0] ?? "") && /holds \*1\*/.test(say[0] ?? ""),
    "key kurang: disebutkan berapa syaratnya dan berapa yang dipegang");
  ok(c2.issued.length === 0, "dan tetap tidak ada link");

  rmSync(DATA, { force: true });
  store = new FileStore(DATA);
  store.addSubscriber(CHAT); store.linkSubscriber(CHAT, ADDR);
  const c3 = chanStub();
  say.length = 0;
  await mk(store, { holdings: holdStub([3]), alphaChat: c3.tg }).alpha(CHAT);
  /* MarkdownV2 rejects an unescaped "." or "+", and a rejected message is a
     holder who asked and got nothing. So the link goes out escaped and has to
     survive unescaping — asserting on the raw string would have passed only in
     the case Telegram refuses. */
  ok(!say[0]?.includes(LINK), "link mentah tidak dikirim — MarkdownV2 akan menolak seluruh pesannya");
  ok(say[0]?.replace(/\\(.)/g, "$1").includes(LINK),
    "key cukup: link-nya dikirim ke chat itu juga, ter-escape dan utuh");
  ok(/fifteen minutes/.test(say[0] ?? ""), "dengan umurnya dinyatakan");
  ok(store.subscriber(CHAT).alphaInviteLink === LINK,
    "dan dicatat sama seperti lewat situs — penyapunya satu, bukan dua");

  /* The desk with no collection deployed cannot count anybody, and that is a
     fact about the desk rather than a verdict on the reader's wallet. */
  rmSync(DATA, { force: true });
  store = new FileStore(DATA);
  store.addSubscriber(CHAT); store.linkSubscriber(CHAT, ADDR);
  const c4 = chanStub();
  say.length = 0;
  await mk(store, { holdings: { configured: false, countOf: async () => 0 }, alphaChat: c4.tg }).alpha(CHAT);
  ok(/not deployed/.test(say[0] ?? ""),
    "koleksi belum ada: dikatakan soal desk-nya, bukan soal dompet pembacanya");
  ok(c4.issued.length === 0, "dan tidak ada link");
}

/* ═══════ the message that follows a link ═══════
   `/alpha` only helps somebody who knows the command exists. Linking is the
   first moment the desk can count this chat's keys at all, so it is the moment
   the link is due — and a wallet short of the rung has to be told the number,
   because a silence there is indistinguishable from a bot that is broken. */
head("pesan setelah /link menyerahkan link alpha-nya sendiri");
{
  const say = [];
  const fetchImpl = async (url, init) => {
    const m = url.split("/").pop(), b = JSON.parse(init.body);
    if (m === "sendMessage") say.push(b.text);
    return { json: async () => ({ ok: true, result: {} }) };
  };
  const mkBot = (store, { holdings, alphaChat }) => new TelegramBot({ token: "T", store,
    tierSource: { bestTierOf: async () => 1 }, holdings, alphaChat, alphaRung: 3,
    fetchImpl, log: () => {} });

  /* Driven through the route rather than the method, because the wiring is the
     thing that was missing: `afterLink` existing and never being called reads
     exactly like the bug this closes. */
  const link = async (port, { counts, chan }) => {
    rmSync(DATA, { force: true });
    const store = new FileStore(DATA);
    store.addSubscriber(CHAT);
    const bot = mkBot(store, { holdings: holdStub(counts), alphaChat: chan.tg });
    const code = bot.codes.issue(CHAT);
    const srv = serve(store, { port, secret: SECRET, bot, log: () => {},
                               tierSource: { bestTierOf: async () => 1 },
                               holdings: holdStub(counts), alphaChat: chan.tg });
    await new Promise(r => setTimeout(r, 60));
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/tg/link`, {
        method: "POST", headers: { authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ code }),
      });
      const body = await r.json();
      // The reply is not awaited by the route, so give it a beat to land.
      await new Promise(r2 => setTimeout(r2, 60));
      return { status: r.status, body, store };
    } finally { srv.close(); }
  };

  const c1 = chanStub();
  say.length = 0;
  let r = await link(8815, { counts: [3], chan: c1 });
  ok(r.status === 200 && r.body.linked === true, "penautannya berhasil");
  ok(say.length === 1, "satu pesan, bukan dua — dua terbaca seperti yang kedua meralat yang pertama");
  ok(/Tier I/.test(say[0] ?? ""), "tier-nya tetap disebut");
  ok(say[0]?.replace(/\\(.)/g, "$1").includes(LINK),
    "dan link alpha-nya ikut, tanpa perlu tahu perintah /alpha");
  ok(c1.issued.length === 1, "satu link terbit");
  ok(r.store.subscriber(CHAT).alphaInviteLink === LINK,
    "dan tercatat, jadi penyapunya bisa mengambilnya kembali");

  const c2 = chanStub();
  say.length = 0;
  r = await link(8816, { counts: [1], chan: c2 });
  ok(say.length === 1 && /Tier I/.test(say[0] ?? ""), "kurang key: tier-nya tetap disebut");
  ok(/opens at \*3\*/.test(say[0] ?? "") && /holds \*1\*/.test(say[0] ?? ""),
    "dan angkanya dikatakan — diam di sini tidak bisa dibedakan dari bot yang rusak");
  ok(!say[0]?.replace(/\\(.)/g, "$1").includes(LINK), "tanpa link");
  ok(c2.issued.length === 0, "dan tidak ada yang terbit");

  /* A desk with no alpha channel says nothing about one, rather than telling a
     reader they fell short of a thing that does not exist. */
  const c3 = { issued: [], removed: [], tg: { configured: false,
    createInvite: async () => { throw new Error("must not be asked"); } } };
  say.length = 0;
  r = await link(8817, { counts: [9], chan: c3 });
  ok(say.length === 1 && /Tier I/.test(say[0] ?? ""), "channel alpha mati: tetap ada konfirmasi tautan");
  ok(!/alpha/i.test(say[0] ?? ""), "dan tidak menyebut channel yang tidak ada");
}

rmSync(DATA, { force: true });
console.log(failures ? `\n${failures} GAGAL` : "\nsemua lolos");
process.exit(failures ? 1 : 0);
