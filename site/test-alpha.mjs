/**
 * The Alpha page, against a stubbed route.
 *
 * The gate is in the engine — /api/alpha withholds by leaving the fields out —
 * and `signal-engine/test-alpha.js` is what proves that. This is the other
 * half: that the page draws only what it was handed, and never grows the
 * ability to hide something it already has.
 *
 * The failure it exists to catch is a rewrite that fetches everything and
 * hides it in the UI, which is the browser-side gating mistake wearing a new
 * shape and lasts exactly as long as it takes a reader to open devtools. So
 * the assertion is on the DOM, not on the request: after a locked response,
 * no candidate the desk saw may appear anywhere in the document.
 *
 * And the state that is easiest to get wrong: an engine nobody could reach is
 * not a wallet that failed to qualify, and a reader must never be told the
 * second when the first is true.
 */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const ok = (c, m) => { console.log(`  ${c ? "ok   " : "GAGAL"}  ${m}`); if (!c) failures++; };
const head = t => console.log(`\n${t}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const LADDER = { 1: 1, 2: 3, 3: 5 };
const SECRET_TICKER = "ZZTOPSECRET";      // appears only in a body that was sent
const SECRET_TAPE   = "QQTAPEONLY";       // $MOONX is on the home page, so it proves nothing

const UNLOCKED = {
  locked: false, level: 2, levelName: "Premium", keys: 3, verified: true, threshold: 43,
  ladder: LADDER,
  nearMiss: [{
    symbol: SECRET_TICKER, score: 30, threshold: 76, short: 46, reachable: 48,
    rules: [{ id: "depth", state: "paid", pts: 12 },
            { id: "steady_climb", state: "did not qualify", pts: 0 },
            { id: "volume_acceleration", state: "no data", pts: 0 }],
  }],
  tape: [{ symbol: SECRET_TAPE, why: "Pool $9.2K against a $15K floor", gate: "liquidity_floor" }],
};

async function boot({ alpha, fails = false, session = true } = {}) {
  const dom = new JSDOM(readFileSync(join(ROOT, "site", "index.html"), "utf8"),
    { url: "http://localhost/alpha", runScripts: "outside-only", pretendToBeVisual: true });
  const win = dom.window, doc = win.document;
  win.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {},
                            addListener() {}, removeListener() {} });
  win.scrollTo = () => {};
  win.Element.prototype.scrollIntoView = function () {};
  win.WebSocket = class { constructor() { setTimeout(() => this.onerror?.({}), 0); } close() {} };
  if (session) win.sessionStorage.setItem("nekara.session",
    JSON.stringify({ token: "t", tier: 0, address: "0x" + "11".repeat(20) }));

  const asked = [];
  win.fetch = async u => {
    const p = String(u);
    asked.push(p);
    if (p.includes("/api/alpha")) {
      if (fails) throw new Error("offline");
      return { ok: true, json: async () => alpha };
    }
    throw new Error("offline");
  };

  win.eval(readFileSync(join(ROOT, "site", "assets", "app.js"), "utf8"));
  await sleep(60);
  doc.querySelector('[data-v="alpha"]').click();
  await sleep(120);
  return { doc, win, asked, text: () => doc.body.textContent, html: () => doc.body.innerHTML };
}

head("terbuka");
{
  const a = await boot({ alpha: UNLOCKED });
  ok(a.text().includes(SECRET_TICKER), "kandidatnya digambar ketika rute mengirimnya");
  ok(a.text().includes("reachable 48"), "dengan berapa poin yang sebenarnya tersedia");
  ok(/out of reach/.test(a.text()),
    "dan diberi tahu bahwa ambangnya memang mustahil untuk kandidat itu");
  ok(a.html().includes("nodata"), "rule tanpa data ditandai berbeda dari rule yang tidak memenuhi");
  ok(a.text().includes(SECRET_TAPE), "tape-nya ikut tergambar");
}

head("terkunci — kunci kurang");
{
  const a = await boot({ alpha: {
    locked: true, level: 1, levelName: "Member", keys: 1, verified: true, ladder: LADDER,
    why: "Alpha opens at 3 keys. This wallet holds 1." } });
  /* The whole point. A locked body carries no candidates, so none may be in the
     document — not hidden in it, not in a data attribute, not in a script tag. */
  ok(!a.html().includes(SECRET_TICKER), "tidak ada kandidat di mana pun dalam dokumen");
  ok(!a.html().includes(SECRET_TAPE), "tape-nya juga tidak ada");
  ok(/Alpha opens at 3 keys/.test(a.text()), "alasannya dinyatakan dengan angkanya");
  ok(/Claim a key/.test(a.text()), "dan ada jalan keluarnya");
}

head("terkunci — koleksinya belum di-deploy");
{
  const a = await boot({ alpha: {
    locked: true, level: 0, levelName: "Public", keys: 0, verified: false, ladder: LADDER,
    why: "The collection is not deployed on this instance, so no wallet's keys can be counted." } });
  ok(/not deployed/.test(a.text()),
    "dikatakan soal desk-nya, bukan soal dompet pembacanya");
  ok(!a.html().includes(SECRET_TICKER), "dan tetap tidak ada data");
}

head("belum connect");
{
  const a = await boot({ alpha: UNLOCKED, session: false });
  ok(/Connect the wallet/.test(a.text()), "diminta connect dulu");
  ok(!a.asked.some(u => u.includes("/api/alpha")),
    "dan rutenya tidak dipanggil sama sekali tanpa sesi");
  ok(!a.html().includes(SECRET_TICKER), "jadi tidak mungkin ada data yang bocor");
}

head("engine tidak terjangkau");
{
  const a = await boot({ alpha: UNLOCKED, fails: true });
  ok(/Could not reach the desk/.test(a.text()),
    "dikatakan tidak terjangkau, bukan tidak memenuhi syarat");
  ok(!/opens at/.test(a.text()),
    "engine mati tidak pernah dibaca sebagai dompet yang kurang key");
  ok(!a.html().includes(SECRET_TICKER), "dan tidak ada sisa data dari muatan sebelumnya");
}

console.log(failures ? `\n${failures} GAGAL` : "\nsemua lolos");
process.exit(failures ? 1 : 0);
