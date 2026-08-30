/**
 * End-to-end proof with no network: a fake market that emits pairs, moves
 * prices, and lets the whole pipeline run at 1000x speed. Verifies that the
 * register comes out correct and that the hash chain still checks.
 */
import { evaluate, toSignal, CONFIG } from "./rules.js";
import { FileStore } from "./store.js";
import { applyObservation, stats, RULES } from "./scorer.js";
import { verifyChain } from "./integrity.js";
import { rmSync } from "node:fs";

rmSync("./data/sim.json", { force: true });
const store = new FileStore("./data/sim.json");
let clock = Date.now() - 30 * 3600e3;   // start 30h ago

const pair = (i, o = {}) => ({
  chainId: "solana", dexId: "raydium", pairAddress: "P" + i,
  baseToken: { address: "T" + i, name: "Token " + i, symbol: "TK" + i },
  quoteToken: { symbol: "SOL" },
  priceUsd: "0.0001",
  txns: { m5: { buys: 52, sells: 11 }, h1: { buys: 300, sells: 160 },
          h6: { buys: 1500, sells: 800 }, h24: { buys: 4000, sells: 3100 } },
  volume: { m5: 24000, h1: 52000, h6: 210000, h24: 480000 },
  priceChange: { m5: 9, h1: 28, h6: 55, h24: 40 },
  liquidity: { usd: 70000 }, marketCap: 240000, fdv: 240000,
  pairCreatedAt: clock - 3 * 3600e3,
  info: { socials: [{ platform: "twitter", handle: "a" }] }, boosts: { active: 1 },
  ...o,
});

/* 10 candidates: 6 should pass the gates, 4 should be vetoed */
const candidates = [
  pair(1), pair(2), pair(3), pair(4), pair(5), pair(6),
  pair(7, { liquidity: { usd: 4000 } }),
  pair(8, { priceChange: { m5: 220, h1: 900 } }),
  pair(9, { info: { socials: [] } }),
  pair(10, { marketCap: 9e6, fdv: 9e6 }),
];

let fired = 0, vetoed = 0;
for (const p of candidates) {
  const ev = evaluate(p, CONFIG, new Map());
  if (ev.vetoes.length) { vetoed++; continue; }
  if (!ev.fire) continue;
  const sig = toSignal(p, ev);
  sig.firedAt = new Date(clock).toISOString();
  store.insertCall(sig);
  fired++;
}
console.log(`DISCOVERY   ${fired} sinyal ditulis, ${vetoed} diveto\n`);

/* Scripted outcomes: 2 winners, 1 that wins then dies, 1 miss, 2 rugs */
const script = {
  1: t => 1 + t * 2.6,                       // steady 3.6x
  2: t => 1 + Math.sin(t * Math.PI) * 4.2,   // spikes to 5.2x then round-trips
  3: t => t < .3 ? 1 + t * 9 : 0.04,         // 3.7x then rug to 4%
  4: t => 1 + t * 0.6,                       // 1.6x — a miss
  5: t => Math.max(0.02, 1 - t * 1.1),       // straight rug
  6: t => 1 + t * 0.25,                      // flat miss
};

const calls = store.allCalls();
const STEP = 20_000;                          // same 20s as the hot scorer
let samples = 0;
for (let t = 0; t <= 1.0001; t += STEP / (30 * 3600e3)) {
  clock += STEP;
  for (const c of calls) {
    const f = script[Number(c.tokenAddress.slice(1))];
    if (!f) continue;
    const mc = Math.max(c.entryMc * f(Math.min(t, 1)), 100);
    store.setMark(c.seq, applyObservation(c, store.mark(c.seq), mc, clock));
    samples++;
  }
}
console.log(`SCORING     ${samples.toLocaleString()} observasi diproses (interval 20 detik)\n`);

const rows = store.register();
console.log("REGISTER");
console.log("  seq  token   entry     peak24h   now       24h-x  ever-x  verdict  dead  2x in");
for (const r of rows) {
  console.log("  " + String(r.seq).padStart(3) + "  " + r.symbol.padEnd(7) +
    ("$" + Math.round(r.entryMc / 1000) + "K").padEnd(10) +
    ("$" + Math.round(r.peakMc / 1000) + "K").padEnd(10) +
    ("$" + Math.round(r.nowMc / 1000) + "K").padEnd(10) +
    r.peakX.toFixed(2).padStart(5) + "  " + r.peakAllX.toFixed(2).padStart(6) + "  " + r.verdict.padEnd(9) +
    (r.isDead ? "ya " : "-  ").padEnd(6) +
    (r.secondsTo2x ? Math.round(r.secondsTo2x / 60) + "m" : "-"));
}

const s = stats(rows, 30);
console.log(`\nSTATISTIK   ${s.calls} call · hit ${(s.hitRate * 100).toFixed(0)}% · median peak ${s.medianPeak.toFixed(2)}x · best ${s.bestPeak.toFixed(2)}x · mati ${s.dead}`);

const v = store.verify();
console.log(`\nINTEGRITAS  ${v.ok ? "utuh" : "RUSAK"} — ${v.count} call, head ${v.head.slice(0, 20)}…`);

/* Tamper test: edit a stored entry and confirm the chain catches it */
const tampered = JSON.parse(JSON.stringify(store.allCalls()));
tampered[1].entryMc = 1;                     // pretend a bad entry was "corrected"
const t2 = verifyChain(tampered);
console.log(`ANTI-EDIT   ubah satu entry MC → ${t2.ok ? "TIDAK TERDETEKSI (gagal)" : "terdeteksi di seq " + t2.seq + " (" + t2.why + ")"}`);

const removed = store.allCalls().filter(c => c.seq !== 3);
const t3 = verifyChain(removed);
console.log(`ANTI-HAPUS  hapus satu call → ${t3.ok ? "TIDAK TERDETEKSI (gagal)" : "terdeteksi di seq " + t3.seq + " (" + t3.why + ")"}`);
