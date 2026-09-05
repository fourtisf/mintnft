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

const DATA = "./data/alpha-invite-test.json";
const SECRET = "test-secret";
const ADDR = "0x" + "22".repeat(20);
const CHAT = 4242;

let failures = 0;
const ok = (c, m) => { console.log(`  ${c ? "ok   " : "GAGAL"}  ${m}`); if (!c) failures++; };
const head = t => console.log(`\n${t}`);

const chanStub = () => {
  const issued = [], removed = [];
  return { issued, removed, tg: { configured: true,
    createInvite: async o => { issued.push(o); return "https://t.me/+abc123"; },
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
  });
}

/* ═══════ the half that makes the other half honest ═══════ */
head("penyapu mengambil kembali tempatnya");
{
  rmSync(DATA, { force: true });
  const store = new FileStore(DATA);
  store.addSubscriber(CHAT); store.linkSubscriber(CHAT, ADDR); store.markAlphaInvited(CHAT);
  const c = chanStub();
  const eng = start({ store, port: 8815, log: () => {}, alphaChat: c.tg,
                      holdings: holdStub([0, 0]),   // asked twice, sold both times
                      api: { latestProfiles: async () => [], latestBoosts: async () => [],
                             topBoosts: async () => [], pairsForToken: async () => [], tokensBatch: async () => [] } });
  await eng.sweepAlpha();
  ok(c.removed[0] === CHAT, "dompet yang menjual key-nya dikeluarkan");
  ok(store.subscriber(CHAT).alphaInvitedAt === null,
    "dan catatannya dibersihkan, jadi penyapu berikutnya tidak mengeluarkan orang yang sama lagi");
  eng.stop();
}

head("rantai yang tidak terbaca tidak mengeluarkan siapa pun");
{
  rmSync(DATA, { force: true });
  const store = new FileStore(DATA);
  store.addSubscriber(CHAT); store.linkSubscriber(CHAT, ADDR); store.markAlphaInvited(CHAT);
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
  store.addSubscriber(CHAT); store.linkSubscriber(CHAT, ADDR); store.markAlphaInvited(CHAT);
  const c = chanStub();
  const eng = start({ store, port: 8817, log: () => {}, alphaChat: c.tg,
                      holdings: holdStub([4]),
                      api: { latestProfiles: async () => [], latestBoosts: async () => [],
                             topBoosts: async () => [], pairsForToken: async () => [], tokensBatch: async () => [] } });
  await eng.sweepAlpha();
  ok(c.removed.length === 0, "empat key masih di atas Premium, jadi tidak disentuh");
  eng.stop();
}

rmSync(DATA, { force: true });
console.log(failures ? `\n${failures} GAGAL` : "\nsemua lolos");
process.exit(failures ? 1 : 0);
