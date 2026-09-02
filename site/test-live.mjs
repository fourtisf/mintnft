/**
 * The live feed, end to end: the real engine, the real page, no mock between.
 *
 * The site is a single script with no build step and had no test at all, which
 * is how it ended up printing "synced 1s" over an engine it had never reached.
 * So this boots the engine's own API and websocket, loads site/index.html in a
 * DOM, and reads the page back — the states a reader can actually be in:
 *
 *   offline   nothing is answering, and the page says so instead of showing 0
 *   live      the socket is up and the register is empty, which is not the same
 *   fired     a call arrives over the socket, well inside the 20s poll
 *   marked    its numbers move without the list re-rendering underneath
 *   died      a win that later went to zero keeps both marks, as the engine
 *             records it — this is the shape the live register produces most
 *

 * Gating is not what this proves — test-gating.js owns that, and the delays
 * here are zeroed so delivery is the only variable.
 */
import { JSDOM } from "jsdom";
import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FileStore } from "../signal-engine/store.js";
import { serve } from "../signal-engine/api.js";
import { attachFeed } from "../signal-engine/ws.js";
import { readSession } from "../signal-engine/auth.js";
import { ecsign, hashPersonalMessage, privateToAddress, toRpcSig, bufferToHex } from "ethereumjs-util";
import { applyObservation } from "../signal-engine/scorer.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8795, HOST = "127.0.0.1", BASE = `http://${HOST}:${PORT}`;
const DELAYS = { 3: 0, 2: 0, 1: 0, 0: 0 };
const DATA = join(ROOT, "signal-engine", "data", "site-live-test.json");

let failures = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "ok   " : "GAGAL"}  ${msg}`); if (!cond) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Polls rather than sleeps, so a pass is fast and a failure says what it saw. */
async function waitFor(what, fn, ms = 8000) {
  const t0 = Date.now();
  for (;;) {
    let v;
    try { v = fn(); } catch { v = null; }
    if (v) return Date.now() - t0;
    if (Date.now() - t0 > ms) { ok(false, `${what} (timed out after ${ms}ms)`); return null; }
    await sleep(50);
  }
}

/* ── the page, with the four things jsdom does not have ──────────────────── */
const dom = new JSDOM(readFileSync(join(ROOT, "site", "index.html"), "utf8"),
  { url: BASE + "/", runScripts: "outside-only", pretendToBeVisual: true });
const win = dom.window, doc = win.document;

win.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {},
                          addListener() {}, removeListener() {} });
win.fetch = (u, o) => fetch(String(u).startsWith("http") ? String(u) : BASE + u, o);
win.scrollTo = () => {};                 // jsdom has no layout; the page scrolls on nav

const text = id => (doc.getElementById(id)?.textContent ?? "").trim();
const feedText = () => doc.getElementById("feed").textContent.trim();
const cards = () => [...doc.querySelectorAll("#feed .rec")];

win.eval(readFileSync(join(ROOT, "site", "assets", "app.js"), "utf8"));

/* ── 1. the rename, so it cannot quietly come back ───────────────────────── */
console.log("\nNAMA HALAMAN");
const nav = doc.getElementById("navLinks").textContent;
ok(nav.includes("Signals"), "nav says Signals");
ok(!nav.includes("Register"), "nav no longer says Register");
ok(doc.querySelector("#v-reg h1").textContent.trim() === "Signals", "the page heading is Signals");

/* ── 2. nothing is running: the page has to say that, not print zeroes ───── */
console.log("\nENGINE MATI");
await waitFor("the page notices there is no engine", () => text("syncTxt").startsWith("engine offline"));
ok(text("syncTxt").startsWith("engine offline"), `header reads "${text("syncTxt")}"`);
ok(/not answering/.test(feedText()), "the empty list says the engine is not answering");
ok(text("rCalls") === "—" && text("rHit") === "—",
  "no statistics are published when there are none to publish");
ok(!doc.getElementById("tkrIn").textContent.includes("BTC"),
  "no invented reference prices on a live page");

/* ── 3. the engine comes up: connected, and empty is its own answer ──────── */
console.log("\nENGINE HIDUP, REGISTER KOSONG");
rmSync(DATA, { force: true });
const store = new FileStore(DATA);
// A wallet that really signs, and a key contract that says this address holds
// Tier III. Nothing else in the flow is stubbed.
const PK = Buffer.alloc(32, 7);
const ADDR = bufferToHex(privateToAddress(PK));
win.ethereum = {
  request: async ({ method, params }) => {
    if (method === "eth_requestAccounts") return [ADDR];
    if (method === "personal_sign") {
      const { v, r, s } = ecsign(hashPersonalMessage(Buffer.from(params[0], "utf8")), PK);
      return toRpcSig(v, r, s);
    }
    throw new Error("unexpected " + method);
  },
};
const srv = serve(store, { port: PORT, secret: "site-live-test", domain: "test",
  tierSource: { bestTierOf: async a => a.toLowerCase() === ADDR.toLowerCase() ? 3 : 0 },
  delays: DELAYS, log: () => {} });
// The same resolver index.js uses: the room comes from the signed token and
// from nothing the client says about itself.
const feed = attachFeed(srv, { delays: DELAYS, log: () => {},
  resolveTier: (req, url) => readSession(url.searchParams.get("token"), "site-live-test")?.tier ?? 0 });

await waitFor("the socket connects", () => text("syncTxt") === "live");
ok(text("syncTxt") === "live", "header reads live once the engine's own joined frame lands");
ok(/Nothing on the register yet/.test(feedText()),
  `empty register reads as empty, not as broken: "${feedText()}"`);
ok(/reading the desk as it fires/i.test(feedText()),
  "and it says how far behind the desk this reader is");
await waitFor("statistics arrive", () => text("rCalls") === "0");
ok(text("rCalls") === "0", "0 calls is now a number the engine gave us, not one we assumed");

/* ── 4. a signal fires: it has to arrive on the socket, not on the poll ──── */
console.log("\nSINYAL MASUK");
const call = store.insertCall({
  callerId: 1, chain: "solana", tokenAddress: "So1111111111111111111111111111111111111111",
  pairAddress: "P1", symbol: "LIVE", name: "Live Wire", dex: "pump.fun",
  firedAt: new Date().toISOString(), entryMc: 240_000, entryPrice: 0.00024, entrySupply: 1e9,
  liquidityUsd: 40_000, entryVolumeH1: 52_000, entryVolumeM5: 9_000,
  links: [{ kind: "twitter", url: "https://x.com/livewire" }, { kind: "site", url: "https://livewire.example" }],
  // A partial reading on purpose: the node answered on the authorities and not
  // on concentration. Both renderings have to appear on the same page, because
  // the failure this panel exists to prevent is an unread line reading clean.
  chainChecks: { source: "solana-rpc", checkedAt: new Date().toISOString(),
                 have: ["freezeAuthority", "mintAuthority"],
                 mintAuthority: null, freezeAuthority: null },
  score: 88, reasons: ["Volume running 3.4× the hourly pace"],
});
feed.publish({ ...call, ...store.mark(call.seq) });

const took = await waitFor("the call reaches the page", () => cards().length === 1, 4000);
ok(cards().length === 1, "the signal is on the page");
// The poll is 20s away, so anything this fast can only have come off the socket.
ok(took !== null && took < 3000, `it arrived in ${took}ms, well inside the 20s poll`);
ok(cards()[0].textContent.includes("LIVE"), "with its ticker");
ok(cards()[0].textContent.includes("Volume running"), "and the reason it fired");

/* ── 5. it moves: marks patch the numbers where they stand ───────────────── */
console.log("\nHARGA BERGERAK");
const before = store.mark(call.seq);
const after = applyObservation(call, before, 600_000);   // 2.5× of entry
store.setMark(call.seq, after);
feed.publishMark(call, after);

await waitFor("the multiple updates", () =>
  (doc.querySelector(`[data-mx="r${call.seq}"]`)?.textContent ?? "").startsWith("2.50"));
ok((doc.querySelector(`[data-mx="r${call.seq}"]`)?.textContent ?? "").startsWith("2.50"),
  "the multiple moved to 2.50× on the mark");
ok((doc.querySelector(`[data-now="r${call.seq}"]`)?.textContent ?? "") === "600.0K",
  "and now MC with it");
ok(doc.querySelector(`.rec[data-id="r${call.seq}"] .badge`).textContent.trim() === "WIN",
  "the verdict flipped to WIN");
ok(cards().length === 1, "still one card — a mark does not duplicate the call");

/* ── 6. the shape the live register actually produces: 2×, then to zero ──── */
console.log("\nNAIK 2× LALU MATI");
const died = applyObservation(call, store.mark(call.seq), 1_700);   // 0.7% of entry
store.setMark(call.seq, died);
feed.publishMark(call, died);
ok(died.verdict === "win" && died.isDead, "the engine calls it a win that died");

const rec = () => doc.querySelector(`#feed .rec[data-id="r${call.seq}"]`);
await waitFor("the death reaches the card", () => rec()?.classList.contains("dead"));
ok(rec().querySelector(".badge").textContent.trim() === "WIN",
  "the page agrees: it stays a win, because /api/stats counts it as one");
ok([...rec().querySelectorAll(".badge")].map(b => b.textContent.trim()).join(" ") === "WIN DEAD",
  "and wears both marks at once — a win at 8% of entry may not read as just a win");
ok(rec().classList.contains("dead"), "and the card carries the death");
ok(/Died/.test(rec().textContent), "which the footer says in words");
ok((doc.querySelector(`#feed [data-mx="r${call.seq}"]`)?.textContent ?? "").startsWith("0.01"),
  "and the headline is where it ended, not the peak it once touched");

// The box promises contracts, and a contract is 44 characters nobody abbreviates.
const q = doc.getElementById("q");
const type = v => { q.value = v; q.dispatchEvent(new win.Event("input", { bubbles: true })); };
type("So1111111111111111111111111111111111111111");
ok(cards().length === 1, "searching the full contract address finds the call");
type("wire");                       // the call is "Live Wire"
ok(cards().length === 1, "and so does part of the name");
type("nothinglikethis");
ok(cards().length === 0, "and something that matches nothing finds nothing");
type("");

// Size filters, over the figures the engine recorded when it fired.
const pickSel = (id, v) => { const s = doc.getElementById(id); s.value = String(v);
  s.dispatchEvent(new win.Event("change", { bubbles: true })); };
pickSel("mcSel", 100000);                        // the call entered at $240K
ok(cards().length === 1, "MC ≥ $100K keeps a call that entered at $240K");
pickSel("mcSel", 500000);
ok(cards().length === 0, "MC ≥ $500K drops it");
pickSel("mcSel", 0);
pickSel("volSel", 10000);                        // it fired with $52K on the hour
ok(cards().length === 1, "Vol ≥ $10K keeps a call that fired on $52K of hourly volume");
pickSel("volSel", 100000);
ok(cards().length === 0, "Vol ≥ $100K drops it");
pickSel("volSel", 0);

ok(/Died after/.test(rec().textContent), "the card says how long it lasted");

// The chart has to be marks we saw, not a curve drawn between three numbers.
ok(store.samples(call.seq).length === 3, "the engine kept a sample per mark, entry included");
const row = (await (await fetch(`${BASE}/api/register?limit=1`)).json())[0];
ok(Array.isArray(row.spark) && row.spark.length === 3, "and sends them with the row");
const drawn = (rec().querySelector(".spark path")?.getAttribute("d") ?? "").split("L").length;
ok(drawn >= 3, `the sparkline is drawn from ${drawn} observed points, not a straight line`);
const chart = rec().querySelector("a.lnk");
ok(!!chart && chart.getAttribute("href") === "https://dexscreener.com/solana/P1",
  "and links out to the pair it was fired on, so the claim can be checked");

/* ── the integrity pages, which used to print an anchor nobody published ─── */
console.log("\nINTEGRITAS");
rec().dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
await waitFor("the detail view opens", () => !doc.getElementById("v-call").classList.contains("hide"));
const stored = store.allCalls()[0].recordHash;
ok(doc.getElementById("cdHash").textContent === stored, "the detail shows the record hash as stored");
ok(doc.getElementById("cdCalc").textContent === "matches",
  "and recomputing it in the browser over the engine's own field list agrees");
ok(/never been published/.test(doc.getElementById("cdAnchor").textContent),
  "and it claims no anchor, because there is none");
ok(doc.querySelectorAll(".cd-chart .ax:not(.bot)").length === 3,
  "the chart labels the three lines it draws, so the scale is readable");
// It reached 2× and then went to nothing: the rule sold at 2×, the peak did not.
ok(/Sold at 2×/.test(doc.getElementById("cdBody").textContent),
  "the detail says what the exit rule actually returned");
ok(/\+90%/.test(doc.getElementById("cdBody").textContent),
  "and the number is the engine's: 2× less 5% round-trip");
ok(win.location.pathname === `/call/${call.seq}`,
  "the call has its own address — the one every share post points at");
const keys = doc.querySelector(".cd-keys")?.textContent ?? "";
ok(/First call MC/.test(keys) && /Now MC/.test(keys) && /× from entry/.test(keys),
  "the header carries first-call MC, now MC and the multiple between them");
ok(doc.querySelector('.cd-links a[href="https://x.com/livewire"]')?.textContent === "X",
  "and the token's own links, as the provider gave them");

const gates = [...doc.querySelectorAll("#cdBody .gate")]
  .map(g => [g.querySelector(".g")?.textContent ?? "", g.querySelector(".t")?.textContent ?? "",
             g.classList.contains("unread")]);
const gate = label => gates.find(g => g[0] === label);
ok(gate("Mint authority")?.[1] === "revoked" && gate("Mint authority")[2] === false,
  "the on-chain panel prints what the node actually said: mint authority revoked");
ok(gate("Freeze authority")?.[1] === "revoked", "and the freeze authority with it");
ok(gate("Largest wallet")?.[1] === "not checked" && gate("Largest wallet")[2] === true,
  "a field the node did not answer reads \"not checked\", not clean");
ok(gate("LP burned")?.[1] === "not checked", "and so does a check that does not run on this chain");
ok(doc.getElementById("cdCalc").textContent === "matches",
  "and none of it moved the record hash — the reading is descriptive, not hashed");
ok(doc.querySelector(".cd-links .ca")?.dataset.ca === call.tokenAddress,
  "the copy button carries the whole address, not the shortened one");
await waitFor("the full series arrives", () => doc.querySelectorAll(".cd-chart .ax.bot").length === 2);
ok(doc.querySelectorAll(".cd-chart .ax.bot").length === 2,
  "and the chart names both ends of the time it covers");

doc.querySelector('#navLinks a[data-v="vault"]').dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
await waitFor("Custody re-reads the chain", () => text("vHead") === store.head());
ok(text("vHead") === store.head(), "Custody shows the head the engine reports, not one recomputed here");
ok(/unanchored/.test(doc.getElementById("vAnchors").textContent),
  "and the anchor table says nothing has been published");
doc.querySelector('#navLinks a[data-v="reg"]').dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
ok(win.location.pathname === "/", "and leaving it puts the list's own address back");

const seg = doc.getElementById("seg");
const pick = f => seg.querySelector(`[data-f="${f}"]`)
  .dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
pick("win");
ok(cards().length === 1, "it is under Wins");
pick("dead");
ok(cards().length === 1, "and under Dead — one call, both marks");
pick("all");

/* ── 7. more than one page of register, filtered where it should be ─────── */
console.log("\nLEBIH DARI SATU HALAMAN");
// "$BIG" carries its own dollar, the way pump.fun listings often do, and the
// last one is named the way someone eventually will name one.
const extra = [["SMALL", 50_000, "Small Coin"], ["$BIG", 500_000, "Big Coin"],
               ["HUGE", 1_000_000, "Huge Coin"], ["XSS", 60_000, '<img src=x onerror=alert(1)>']];
for (const [symbol, mc, name] of extra)
  store.insertCall({
    callerId: 1, chain: "solana", tokenAddress: "TOK" + symbol, pairAddress: "P" + symbol,
    symbol, name, dex: "raydium", firedAt: new Date().toISOString(),
    entryMc: mc, entryPriceUsd: mc / 1e9, entrySupply: 1e9, liquidityUsd: 30_000,
    entryVolumeH1: 20_000, score: 80, reasons: ["Volume running 2.0× the hourly pace"],
  });

pickSel("timeSel", 0);                      // any change re-asks the engine
await waitFor("the new calls arrive", () => cards().length === 5);
ok(cards().length === 5, "all five calls are on the page");
ok(doc.querySelectorAll("#feed img").length === 0,
  "a token named after an <img> tag is text on the page, not an element in it");
ok(/5 of 5/.test(text("cnt")), `the count says what the register holds: "${text("cnt")}"`);
await waitFor("the result arrives beside the peak", () => /%/.test(text("rReal")));
ok(/^[+−]\d+%$/.test(text("rReal")),
  `the header carries the result of the rule, not only the peak (reads "${text("rReal")}")`);

pickSel("mcSel", 500000);
// The local predicate narrows the list first; the count only settles once the
// engine has answered, which is the number worth asserting on.
await waitFor("the server filters by size", () => /2 of 2/.test(text("cnt")));
ok(cards().length === 2, "MC ≥ $500K leaves the two that entered above it");
ok(/2 of 2/.test(text("cnt")), "and the count follows the filter, not the page");
// The side panels publish hit rates. Under a Wins filter, arithmetic over the
// visible rows says 100% for every desk — a statistic with the misses removed.
const winsOnly = [...doc.querySelectorAll("#feed .rec")].length;
doc.querySelector('#seg [data-f="win"]').dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
await waitFor("the Wins filter settles", () => doc.querySelectorAll("#feed .rec").length <= winsOnly);
const pct = doc.querySelector("#callers .pct")?.textContent ?? "";
ok(pct !== "100%",
  `the caller panel keeps the misses under a Wins filter (reads "${pct}")`);
doc.querySelector('#seg [data-f="all"]').dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
ok(/mc=500000/.test(win.location.search), "the filter is in the URL and can be sent to someone");
const bigCard = cards().find(el => /BIG/.test(el.textContent))?.textContent ?? "";
ok(/\$BIG/.test(bigCard) && !/\$\$BIG/.test(bigCard),
  "a symbol that already carries its dollar is not printed with two");

// Paging, asked of the API directly: sixty rows is a page, not the register.
const page = await fetch(`${BASE}/api/register?limit=2&offset=2`);
ok(page.headers.get("x-total-count") === "5", "the register reports its true total in the header");
ok((await page.json()).length === 2, "and an offset returns the next page rather than the first");

pickSel("mcSel", 0);
await waitFor("clearing the filter restores the list", () => cards().length === 5);
ok(!/mc=/.test(win.location.search), "clearing it takes it back out of the URL");

/* ── 8. the door the paid product never had ─────────────────────────────── */
console.log("\nMASUK DENGAN KUNCI");
const btn = doc.getElementById("connectBtn");
ok(btn.textContent === "Connect", "the header offers a way in");
btn.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
await waitFor("the engine issues a session", () => /Tier III/.test(btn.textContent));
ok(/Tier III/.test(btn.textContent), `the header shows the tier the chain gave: "${btn.textContent}"`);

const kept = JSON.parse(win.sessionStorage.getItem("nekara.session") ?? "null");
const claims = readSession(kept?.token, "site-live-test");
ok(claims?.tier === 3, "the token carries Tier III, signed by the engine");
ok(claims?.addr === ADDR.toLowerCase(), "for the address that actually signed");

await waitFor("the socket rejoins on the tier's room", () => feed.rooms[3].size >= 1);
ok(feed.rooms[3].size >= 1 && feed.rooms[0].size === 0,
  "it left the public room — a tier is a room, not a label");

btn.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
await waitFor("signing out drops back to public", () => feed.rooms[0].size >= 1);
ok(feed.rooms[3].size === 0, "signing out gives the latency back");
ok(btn.textContent === "Connect", "and offers the way in again");

/* ── the brand links, which pointed at "#" on a live site ─────────────────── */
console.log("\nTAUTAN MEREK");
{
  const links = [...doc.querySelectorAll("[data-social]")];
  ok(links.length >= 2, `the header and footer carry social links (${links.length})`);
  const shown = links.filter(a => !a.classList.contains("hide"));
  ok(shown.length === links.length, "and none of them are hidden now the URLs are set");
  ok(shown.every(a => /^https:\/\//.test(a.href)),
    "each points at a real address rather than at \"#\", which teaches a reader the page is unfinished");
  ok(shown.every(a => a.rel.includes("noopener")),
    "opened without handing the destination a reference back to this window");
}

/* ── 9. the keys page may not sell what does not exist ──────────────────── */
console.log("\nKEYS BELUM DIBUKA");
doc.querySelector('#navLinks a[data-v="mint"]').dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
ok(text("supTxt") === "0 / 666 minted", `supply reads "${text("supTxt")}" — nothing is deployed`);
ok(text("ksMinted") === "0", "and the home tile agrees");
ok(doc.getElementById("mintBtn").disabled === true, "the claim button cannot be pressed");
ok(!/Claim key/.test(doc.getElementById("mintBtn").textContent), "and does not offer to sell one");
doc.querySelector('#navLinks a[data-v="reg"]').dispatchEvent(new win.MouseEvent("click", { bubbles: true }));

/* ── 10. and it survives the engine going away again ─────────────────────── */
console.log("\nENGINE MATI LAGI");
// close() alone stops the server accepting new connections and leaves the
// keep-alive sockets it already has wide open, so the page's next poll hangs
// on a connection to a server that is gone. A process that actually dies takes
// its sockets with it — this is what the test is meant to be simulating, and
// without it the harness was measuring the poll timeout instead of the page.
feed.close(); srv.closeAllConnections?.(); srv.close();
await waitFor("the page notices the engine went away", () => text("syncTxt").startsWith("engine offline"), 30000);
ok(text("syncTxt").startsWith("engine offline"), `header reads "${text("syncTxt")}"`);
ok(cards().length === 5, "the calls stay on the page — they are the record, not a cache");
ok(text("rCalls") === "—", "the statistics do not: those we no longer know");

win.close();
rmSync(DATA, { force: true });
console.log(failures ? `\n${failures} GAGAL\n` : "\nsemua lolos\n");
process.exit(failures ? 1 : 0);
