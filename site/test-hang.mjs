/**
 * A request that hangs has to become "engine offline".
 *
 * test-live.mjs kills the engine by closing the server, which refuses the next
 * connection — the page learns immediately. A VPS whose network path goes away
 * does not refuse: it accepts the connection and never answers, and every fetch
 * the page makes sits there forever. The header kept saying "connecting…" and
 * the figures on screen kept looking current, which is the same failure as an
 * empty register reading like a quiet market. The page has to be able to tell
 * it is no longer being answered.
 *
 * So this boots the real page against a server that accepts and stays silent.
 * It costs ten seconds of wall clock and it is the only thing standing between
 * a blackholed host and a page that lies about being live.
 */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8799, BASE = `http://127.0.0.1:${PORT}`;
const BUDGET = 20_000;   // the page's own timeout is 10s; this is room, not a race

let failures = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "ok   " : "GAGAL"}  ${msg}`); if (!cond) failures++; };

const held = [];
const srv = createServer((req, res) => held.push(res));   // accepts, never answers
await new Promise(r => srv.listen(PORT, "127.0.0.1", r));

const dom = new JSDOM(readFileSync(join(ROOT, "site", "index.html"), "utf8"),
  { url: BASE + "/", runScripts: "outside-only", pretendToBeVisual: true });
const win = dom.window, doc = win.document;
win.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {},
                          addListener() {}, removeListener() {} });
win.fetch = (u, o) => fetch(String(u).startsWith("http") ? String(u) : BASE + u, o);
win.scrollTo = () => {};
win.eval(readFileSync(join(ROOT, "site", "assets", "app.js"), "utf8"));

console.log("\nHOST YANG DIAM");
const sync = () => (doc.getElementById("syncTxt")?.textContent ?? "").trim();
const t0 = Date.now();
while (!sync().startsWith("engine offline") && Date.now() - t0 < BUDGET)
  await new Promise(r => setTimeout(r, 200));
const took = (Date.now() - t0) / 1000;

ok(sync().startsWith("engine offline"),
  `a server that accepts and never answers reads as offline after ${took.toFixed(1)}s — header says "${sync()}"`);
ok(took < 15, "and it gets there on the page's own timeout, not on the reader giving up");
ok(held.length > 0, "the requests really were left hanging, not refused");
ok((doc.getElementById("rCalls")?.textContent ?? "").trim() === "—",
  "the statistics blank rather than sit at a figure nobody re-read");

win.close();
held.forEach(r => { try { r.destroy(); } catch {} });
srv.closeAllConnections(); srv.close();
console.log(failures ? `\n${failures} GAGAL\n` : "\nsemua lolos\n");
process.exit(failures ? 1 : 0);
