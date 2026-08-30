/**
 * Backtest harness.
 *
 * The weights in rules.js are reasoned guesses, not measured ones. This is how
 * they stop being guesses: replay a dataset of pair snapshots with known
 * outcomes, sweep the threshold, and read which setting actually pays.
 *
 * `node backtest.js`            demo on a synthetic set with a planted truth
 * `node backtest.js data.json`  your own recorded snapshots
 *
 * Dataset format: [{ pair: <Dexscreener Pair>, peakX: <number reached> }, ...]
 * Record `pair` at signal time and `peakX` 24h later; that is all it needs.
 */
import { evaluate, CONFIG } from "./rules.js";
import { reasonPerformance, scoreBands } from "./analytics.js";
import { readFileSync } from "node:fs";

export function backtest(dataset, cfg = CONFIG) {
  const rows = [];
  for (const { pair, peakX } of dataset) {
    const ev = evaluate(pair, cfg, new Map());
    if (ev.vetoes.length || !ev.fire) continue;
    rows.push({
      chain: pair.chainId, score: ev.score,
      reasonIds: ev.reasons.map(r => r.id),
      peakX, verdict: peakX >= 2 ? "win" : "miss",
      isDead: peakX < 0.1, state: "settled",
    });
  }
  const wins = rows.filter(r => r.verdict === "win").length;
  return { fired: rows.length, of: dataset.length,
           hitRate: rows.length ? wins / rows.length : 0, rows };
}

/** Sweep the firing threshold. More signals is not better if they are worse. */
export function sweep(dataset, from = 30, to = 110, step = 5) {
  const out = [];
  for (let t = from; t <= to; t += step) {
    const r = backtest(dataset, { ...CONFIG, scoreToFire: t });
    out.push({ threshold: t, fired: r.fired, hitRate: r.hitRate,
               // signals x hit rate — raw hit rate alone rewards firing once
               expectedWins: r.fired * r.hitRate });
  }
  return out;
}

/* ── demo dataset with a planted truth ────────────────────────────────
   Volume acceleration and buy pressure genuinely predict here.
   Boosts are pure noise. If the analytics recovers that, the loop works. */
function synthetic(n = 600) {
  const now = Date.now(), out = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < n; i++) {
    const realVol = Math.random(), realBuy = Math.random(),
          realSize = Math.random(), noise = Math.random(), badFlow = Math.random();

    // Average clip size is the planted stand-in for "real money is in here".
    // It is not smart-money data — no wallets exist in this schema — but it is
    // the same quantity the live rules read, so the harness exercises them.
    const avgTrade = 25 + realSize * 600;
    const h1Vol = rnd(30000, 90000);
    const h1Trades = Math.max(20, Math.round(h1Vol / avgTrade));
    const h1Buy = 0.45 + realBuy * 0.35;
    const h6Buy = Math.min(0.95, Math.max(0.2, h1Buy + rnd(-0.12, 0.08)));
    const m5Vol = 3000 + realVol * 30000;
    // clip size is a property of the token, so it has to hold across windows —
    // deriving m5 trades any other way hides realSize from the rule that reads it
    const m5Trades = Math.max(6, Math.round(m5Vol / avgTrade));

    // drawn independently of `noise`, or boosts stop being the control they are
    // here to be: vetoing the losers would leave boosted rows looking predictive
    const dusty = badFlow > 0.90;                    // flow that is all dust
    const washed = badFlow > 0.80 && badFlow <= 0.90; // volume that goes nowhere

    const pair = {
      chainId: ["solana", "base", "bsc"][i % 3], dexId: "raydium",
      pairAddress: "P" + i,
      baseToken: { address: "T" + i, name: "T" + i, symbol: "TK" + i },
      quoteToken: { symbol: "SOL" },
      priceUsd: "0.0001",
      volume: { m5: dusty ? 900 : m5Vol, h1: washed ? h1Vol * 4 : h1Vol, h6: h1Vol * 4 },
      txns: {
        m5: { buys: Math.round(m5Trades * (0.4 + realBuy * 0.5)),
              sells: Math.round(m5Trades * (0.6 - realBuy * 0.5)) },
        h1: { buys: Math.round((dusty ? 900 : washed ? 900 : h1Trades) * h1Buy),
              sells: Math.round((dusty ? 900 : washed ? 900 : h1Trades) * (1 - h1Buy)) },
        h6: { buys: Math.round(4000 * h6Buy), sells: Math.round(4000 * (1 - h6Buy)) },
      },
      priceChange: { m5: rnd(1, 20), h1: washed ? rnd(-1, 1) : rnd(5, 60), h6: rnd(5, 90) },
      liquidity: { usd: rnd(20000, 160000) },
      marketCap: rnd(60000, 900000), fdv: 300000,
      pairCreatedAt: now - rnd(1, 20) * 3600e3,
      info: { socials: [{ platform: "twitter", handle: "a" }] },
      boosts: { active: noise > 0.6 ? Math.round(rnd(1, 6)) : 0 },
    };
    pair.fdv = pair.marketCap;

    // planted truth: volume, buy pressure and clip size all pay. boosts do not.
    // dust and wash rows are planted as losers, which is what the new gates
    // are there to keep out of the register in the first place.
    const edge = realVol * 0.45 + realBuy * 0.28 + realSize * 0.27;
    const peakX = dusty || washed
      ? Math.max(0.03, rnd(0.05, 1.4))
      : Math.max(0.03, edge > 0.6
          ? rnd(1.6, 2.2) + (edge - 0.6) * rnd(3, 12)
          : rnd(0.05, 2.1));
    out.push({ pair, peakX });
  }
  return out;
}


if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  const data = file ? JSON.parse(readFileSync(file, "utf8")) : synthetic();
  console.log(`BACKTEST  ${data.length} snapshot${file ? " dari " + file : " sintetis"}\n`);

  const base = backtest(data);
  console.log(`ambang default ${CONFIG.scoreToFire}: ${base.fired} tembak dari ${base.of}, hit ${(base.hitRate * 100).toFixed(1)}%\n`);

  console.log("SAPUAN AMBANG");
  console.log("  ambang  tembak  hit-rate  perkiraan menang");
  for (const s of sweep(data))
    console.log("  " + String(s.threshold).padStart(6) + String(s.fired).padStart(8) +
      (s.hitRate * 100).toFixed(1).padStart(9) + "%" + s.expectedWins.toFixed(1).padStart(16));

  const perf = reasonPerformance(base.rows, { minSample: 8 });
  console.log(`\nKINERJA ALASAN   (base rate ${(perf.base * 100).toFixed(1)}%, ${perf.total} call settle)`);
  console.log("  alasan                  n    hit-rate   lift   median peak");
  for (const r of perf.reasons)
    console.log("  " + r.id.padEnd(22) + String(r.n).padStart(4) +
      (r.hitRate * 100).toFixed(1).padStart(10) + "%" +
      r.lift.toFixed(2).padStart(7) + r.medianPeak.toFixed(2).padStart(13));

  console.log("\n  lift 1.00 = alasan itu tidak memberi tahu apa-apa di luar base rate");

  console.log("\nPITA SKOR");
  for (const b of scoreBands(base.rows))
    console.log("  " + `${b.lo}-${b.hi}`.padEnd(8) + String(b.n).padStart(5) +
      (b.hitRate * 100).toFixed(1).padStart(9) + "%");
}
