/**
 * The live feed: four rooms, each with its own clock.
 *
 * A socket joins exactly one room, decided here from the verified session and
 * never from anything the client says about itself. The call is not sent to
 * the other rooms and held — it is not sent at all until that room's timer
 * fires, because anything delivered to a browser is delivered to whoever is
 * reading the socket.
 *
 * Small enough to speak RFC 6455 directly rather than take a dependency: we
 * only ever send unmasked text frames and close.
 */
import { createHash } from "node:crypto";
import { TIER_DELAY_S } from "./gating.js";

// RFC 6455 §1.3, exactly. The hand-rolled client in test-gating.js used to
// accept any 101 without checking the digest, so a transposed character here
// passed every test we had while no browser on earth could open the feed.
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const TIERS = [3, 2, 1, 0];

function frame(text) {
  const body = Buffer.from(text);
  const n = body.length;
  let head;
  if (n < 126) { head = Buffer.from([0x81, n]); }
  else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(n, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([head, body]);
}

export function attachFeed(server, { resolveTier, delays = TIER_DELAY_S, path = "/feed", log = console.log }) {
  const rooms = { 0: new Set(), 1: new Set(), 2: new Set(), 3: new Set() };
  const timers = new Set();

  server.on("upgrade", async (req, socket) => {
    const url = new URL(req.url, "http://x");
    const key = req.headers["sec-websocket-key"];
    if (url.pathname !== path || !key) return socket.destroy();

    let tier = 0;
    try { tier = await resolveTier(req, url); } catch { tier = 0; }
    if (!TIERS.includes(tier)) tier = 0;

    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${createHash("sha1").update(key + GUID).digest("base64")}\r\n\r\n`);

    rooms[tier].add(socket);
    // Its own delay, not anyone else's: a reader has to be able to tell an
    // empty register apart from one it is not allowed to see yet.
    socket.write(frame(JSON.stringify({ type: "joined", tier, delaySeconds: delays[tier] })));

    const drop = () => rooms[tier].delete(socket);
    socket.on("close", drop);
    socket.on("error", drop);
    socket.on("end", drop);
  });

  const emit = (tier, msg) => {
    const f = frame(JSON.stringify(msg));
    for (const s of rooms[tier]) { try { s.write(f); } catch { rooms[tier].delete(s); } }
  };

  return {
    rooms,
    /** One timer per tier, measured from fired_at so a restart cannot re-leak. */
    publish(call) {
      const fired = Date.parse(call.firedAt);
      for (const tier of TIERS) {
        const due = fired + delays[tier] * 1000 - Date.now();
        if (due <= 0) { emit(tier, { type: "call", call }); continue; }
        const t = setTimeout(() => { timers.delete(t); emit(tier, { type: "call", call }); }, due);
        if (t.unref) t.unref();
        timers.add(t);
      }
    },
    /** Marks are only ever pushed to rooms that already have the call. */
    publishMark(call, mark) {
      const fired = Date.parse(call.firedAt);
      for (const tier of TIERS)
        if (Date.now() >= fired + delays[tier] * 1000) emit(tier, { type: "mark", seq: call.seq, mark });
    },
    close() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      for (const tier of TIERS) { for (const s of rooms[tier]) { try { s.destroy(); } catch {} } rooms[tier].clear(); }
    },
  };
}
