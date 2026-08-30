/**
 * The business model, as a test.
 *
 * Tier I pays for a ten second delay. This proves it cannot get a call inside
 * those ten seconds through any route we expose — REST, the CSV export, the
 * social card, the verify endpoint, the websocket, or a forged token — and
 * that it does get the call once its ten seconds are up.
 *
 * Run with --nogate to remove the gating and watch the same assertions fail.
 * A test for something this load-bearing is worth nothing until it has been
 * seen to fail.
 */
import { createConnection } from "node:net";
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { FileStore } from "./store.js";
import { serve } from "./api.js";
import { attachFeed } from "./ws.js";
import { issueSession, StaticTierSource } from "./auth.js";
import { TIER_DELAY_S } from "./gating.js";

const NOGATE = process.argv.includes("--nogate");
const DELAYS = NOGATE ? { 3: 0, 2: 0, 1: 0, 0: 0 } : TIER_DELAY_S;
const PORT = 8793, SECRET = "test-secret", HOST = "127.0.0.1";

let failures = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "ok   " : "GAGAL"}  ${msg}`); if (!cond) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* minimal websocket client: handshake, then read unmasked server frames */
function wsConnect(token) {
  return new Promise((resolve, reject) => {
    const sock = createConnection(PORT, HOST, () => {
      sock.write(`GET /feed?token=${token} HTTP/1.1\r\nHost: ${HOST}\r\nUpgrade: websocket\r\n` +
        `Connection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString("base64")}\r\n` +
        `Sec-WebSocket-Version: 13\r\n\r\n`);
    });
    const messages = [];
    let buf = Buffer.alloc(0), upgraded = false;
    sock.on("data", chunk => {
      buf = Buffer.concat([buf, chunk]);
      if (!upgraded) {
        const end = buf.indexOf("\r\n\r\n");
        if (end < 0) return;
        if (!buf.slice(0, end).toString().includes("101")) return reject(new Error("no upgrade"));
        upgraded = true; buf = buf.slice(end + 4);
        resolve({ messages, close: () => sock.destroy() });
      }
      for (;;) {
        if (buf.length < 2) return;
        let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        messages.push(JSON.parse(buf.slice(off, off + len).toString()));
        buf = buf.slice(off + len);
      }
    });
    sock.on("error", reject);
  });
}

const get = (path, token) => fetch(`http://${HOST}:${PORT}${path}`,
  token ? { headers: { authorization: "Bearer " + token } } : undefined);

/* ───────────────────────────────── run ───────────────────────────────── */

rmSync("./data/gating-test.json", { force: true });
const store = new FileStore("./data/gating-test.json");
const srv = serve(store, { port: PORT, secret: SECRET, domain: "test",
  tierSource: new StaticTierSource(), delays: DELAYS, log: () => {} });

const feed = attachFeed(srv, {
  delays: DELAYS,
  resolveTier: async (req, url) => {
    const { readSession } = await import("./auth.js");
    return readSession(url.searchParams.get("token"), SECRET)?.tier ?? 0;
  },
});

const tok = t => issueSession({ address: "0x" + String(t).repeat(40), tier: t }, SECRET);
const [t3, t2, t1] = [tok(3), tok(2), tok(1)];

console.log(NOGATE ? "TANPA GATING (harus GAGAL)\n" : "DENGAN GATING (harus lolos)\n");

const sockets = { 3: await wsConnect(t3), 2: await wsConnect(t2), 1: await wsConnect(t1), 0: await wsConnect("") };
await sleep(50);

const call = store.insertCall({
  callerId: 1, chain: "solana", tokenAddress: "SECRET_TOKEN", pairAddress: "P1", symbol: "RAHASIA",
  firedAt: new Date().toISOString(), entryPriceUsd: 0.0001, entrySupply: 2_400_000_000,
  entryMc: 240000, entrySupplySource: "test", liquidityUsd: 70000, score: 88,
  reasonIds: ["depth"], sourceKind: "screener", sourceRef: null,
});
feed.publish(call);
const seq = call.seq;

/* t ≈ 0s — only Tier III may have it */
await sleep(300);
console.log("t = 0s");
ok((await (await get("/api/register", t1)).json()).length === 0, "Tier I: /api/register is empty");
ok((await get(`/api/call/${seq}`, t1)).status === 404, "Tier I: /api/call/:seq is 404, indistinguishable from absent");
ok(!(await (await get("/api/export.csv", t1)).text()).includes("RAHASIA"), "Tier I: CSV export does not contain it");
ok((await get(`/og/call/${seq}.svg`, t1)).status === 404, "Tier I: social card is 404");
ok((await get(`/api/verify/${seq}`, t1)).status === 404, "Tier I: verify endpoint does not confirm it exists");
ok(!sockets[1].messages.some(m => m.type === "call"), "Tier I: websocket received nothing");

ok((await (await get("/api/register")).json()).length === 0, "no token at all: nothing");
ok((await (await get("/api/register", t1 + "x")).json()).length === 0, "tampered token: nothing");
ok((await (await get("/api/register", issueSession({ address: "0x1", tier: 3 }, "wrong-secret"))).json()).length === 0,
   "token signed with another key claiming Tier III: nothing");
ok(!sockets[0].messages.some(m => m.type === "call"), "public websocket: nothing");

ok((await (await get("/api/register", t3)).json()).length === 1, "Tier III: has the call");
ok(sockets[3].messages.some(m => m.type === "call"), "Tier III: websocket delivered it");
ok((await (await get("/api/stats", t1)).json()).calls === 0, "Tier I: stats do not leak that a call exists");

/* t ≈ 6s — Tier II is in, Tier I still is not */
await sleep(5700);
console.log("\nt = 6s");
ok((await (await get("/api/register", t2)).json()).length === 1, "Tier II: has the call");
ok(sockets[2].messages.some(m => m.type === "call"), "Tier II: websocket delivered it");
ok((await (await get("/api/register", t1)).json()).length === 0, "Tier I: still empty");
ok(!sockets[1].messages.some(m => m.type === "call"), "Tier I: websocket still silent");

/* t ≈ 11s — Tier I gets what it paid for */
await sleep(5000);
console.log("\nt = 11s");
ok((await (await get("/api/register", t1)).json()).length === 1, "Tier I: now has the call");
ok(sockets[1].messages.some(m => m.type === "call"), "Tier I: websocket delivered it");
ok((await (await get("/api/register")).json()).length === 0, "public: still waiting on the hour");

for (const s of Object.values(sockets)) s.close();
feed.close(); srv.close();
rmSync("./data/gating-test.json", { force: true });

console.log(`\n${failures} gagal dari yang diuji`);
if (NOGATE) {
  console.log(failures > 0
    ? "BENAR: tanpa gating tes ini gagal, jadi tes ini memang menguji sesuatu"
    : "MASALAH: tes lolos tanpa gating — berarti tes tidak menguji apa pun");
  process.exit(failures > 0 ? 0 : 1);
}
process.exit(failures ? 1 : 0);
