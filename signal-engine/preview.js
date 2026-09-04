/**
 * A live signal, end to end, without writing a row.
 *
 * There is no such thing as a test call. The register is append-only — a signal
 * fired to see whether the plumbing works is a real call, published with its
 * conditions, tracked to win or miss, and there for ever. So the only honest
 * way to test the path is to run the real one and stop before the insert.
 *
 * This does exactly that: the real discovery sources, the real gates, the real
 * scorer, the real on-chain inspector, and the real message the channel would
 * receive. What it never does is call store.insertCall.
 *
 *   node preview.js                      one live pass, best candidate rendered
 *   node preview.js --all                every candidate, and why each died
 *   node preview.js --send <chatId>      also deliver it, so you see it rendered
 *   node preview.js --sweep              what the size band costs, on real pairs
 *
 * Rejections are the useful output when nothing fires, which is most of the
 * time and is not a fault: the thresholds in rules.js were reasoned, not
 * measured, and the gate that kills everything is the one worth reading.
 */
import { Engine } from "./engine.js";
import { evaluate, CONFIG, SIGNALS } from "./rules.js";
import { formatSignal } from "./notify.js";
import { Telegram } from "./notify.js";
import { existsSync, readFileSync } from "node:fs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ALL = process.argv.includes("--all");
const SEND = arg("--send", null);
const SWEEP = process.argv.includes("--sweep");

/* The number this call would carry, read from the register rather than made up.
   A preview that prints #0001 while the register is at #0042 teaches the
   operator to distrust the number, which is the opposite of the point. */
function nextSeq() {
  const path = process.env.REGISTER_PATH ?? "./data/register.json";
  if (!existsSync(path)) return null;
  try { return (JSON.parse(readFileSync(path, "utf8")).seq ?? 0) + 1; }
  catch { return null; }
}

const fired = [], rejected = [];
let scanned = 0;

const engine = new Engine({
  onSignal: s => fired.push(s),
  onReject: (pair, ev) => rejected.push({ pair, ev }),
  onScan: n => { scanned += n; },
  log: (...a) => console.log(...a),
});

console.log("\nOne live discovery pass. Nothing here is written to the register.\n");
await engine.tick();

console.log(`\nscanned ${scanned} · passed the gates ${fired.length} · refused ${rejected.length}\n`);

if (rejected.length && (ALL || !fired.length)) {
  /* Which gate, and how many times. One gate accounting for every rejection is
     the thing worth knowing, and it does not show up in a list of tickers. */
  const byGate = {};
  for (const { ev } of rejected) {
    const why = ev?.vetoes?.[0] ?? ev?.why ?? (ev?.score != null ? `scored ${ev.score}, below threshold` : "no reason given");
    byGate[why] = (byGate[why] ?? 0) + 1;
  }
  console.log("why they were refused:");
  for (const [why, n] of Object.entries(byGate).sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(4)}  ${why}`);
  console.log("");
}

/* What the size band is costing, over the candidates this pass actually saw.
 *
 * The desk moved to a chain whose pools are smaller than the ones the floor was
 * reasoned on, and the symptom is a thousand candidates and no calls. "Lower it
 * a bit" is not an answer anybody can check; this is the same real pairs put
 * through the same real gates at other settings, so the trade is a number.
 *
 * Two things it is not. It is one discovery pass, not a sample of the market —
 * run it a few times before believing any single cell. And clearing the gates
 * is not being a good call: the cell counts what would reach the scorer, and
 * the figure in brackets is what would actually have fired.
 */
if (SWEEP) {
  const seen = [...fired, ...rejected.map(r => r.pair)].filter(Boolean);
  const LIQ = [15000, 12000, 10000, 8000, 6000, 4000];
  const CAP = [30000, 25000, 20000, 15000, 10000];
  console.log(`\nWhat the size band costs, over the ${seen.length} candidates this pass saw.`);
  console.log("cleared every gate (would have fired), by floor:\n");
  console.log("  liq \\ cap  " + CAP.map(c => `$${c / 1000}K`.padStart(9)).join(""));
  for (const liq of LIQ) {
    const row = [];
    for (const cap of CAP) {
      const cfg = { ...CONFIG, minLiquidityUsd: liq, minMarketCap: cap };
      let cleared = 0, would = 0;
      for (const p of seen) {
        const ev = evaluate(p, cfg, new Map());
        if (ev.vetoes.length) continue;
        cleared++;
        if (ev.fire) would++;
      }
      row.push(`${cleared} (${would})`.padStart(9));
    }
    console.log(`  $${String(liq / 1000).padStart(2)}K` + " ".repeat(7) + row.join(""));
  }
  /* The grid says how many reach the scorer. This says what happens to them
     there, which is the half the rejection table cannot show: a candidate that
     clears every gate and then scores 32 is not refused by any threshold you
     can move in an env file, and widening the band to find more of them buys
     nothing. Which rules never pay out at all is the question underneath. */
  const cleared = seen.map(p => ({ p, ev: evaluate(p, CONFIG, new Map()) }))
                      .filter(x => !x.ev.vetoes.length);
  if (cleared.length) {
    const scores = cleared.map(x => x.ev.score).sort((a, b) => a - b);
    const med = scores[Math.floor(scores.length / 2)];
    console.log(`\n${cleared.length} cleared every gate. Scores ${scores[0]}–${scores.at(-1)}, median ${med}, against ${CONFIG.scoreToFire} to fire.`);
    const paid = {};
    for (const { ev } of cleared)
      for (const r of ev.reasons) {
        const e = (paid[r.id] ??= { n: 0, pts: 0 });
        e.n++; e.pts += r.pts;
      }
    console.log("\n  rule                      paid  of      avg   max");
    for (const sig of SIGNALS) {
      const e = paid[sig.id] ?? { n: 0, pts: 0 };
      const avg = e.n ? (e.pts / e.n).toFixed(1) : "—";
      const flag = e.n === 0 ? "   never paid on this chain" : "";
      console.log(`  ${sig.id.padEnd(24)} ${String(e.n).padStart(4)}  ${String(cleared.length).padStart(3)}  ${String(avg).padStart(6)}  ${String(sig.max).padStart(4)}${flag}`);
    }
    const best = cleared.reduce((a, b) => (b.ev.score > a.ev.score ? b : a));
    console.log(`\n  best was $${best.p.baseToken?.symbol} at ${best.ev.score}, ${CONFIG.scoreToFire - best.ev.score} short. It earned:`);
    for (const r of best.ev.reasons) console.log(`    ${String(r.pts).padStart(3)}  ${r.why}`);
    const missed = SIGNALS.filter(s => !best.ev.reasons.some(r => r.id === s.id));
    if (missed.length) console.log(`    and earned nothing from: ${missed.map(s => `${s.id} (${s.max})`).join(", ")}`);
  }

  console.log(`\n  now: $${CONFIG.minLiquidityUsd / 1000}K liquidity, $${CONFIG.minMarketCap / 1000}K cap.`);
  console.log("  One pass is not the market. Run it a few times before moving anything,");
  console.log("  and read gap 5 in CLAUDE.md before lowering the liquidity floor —");
  console.log("  a few hundred holders acting on a thin pool are the market themselves.\n");
}

if (!fired.length) {
  console.log("Nothing cleared the gates this pass. That is a normal result, not a fault —");
  console.log("run it again, or read the table above and decide whether a gate is wrong.\n");
  process.exit(0);
}

const seq = nextSeq();
const best = fired.sort((a, b) => b.score - a.score)[0];
const text = formatSignal(best, seq ?? 0);

console.log("─".repeat(64));
console.log(`This is what the channel would have received${seq ? ` as #${String(seq).padStart(4, "0")}` : ""}.`);
console.log("It was NOT sent and NOT written. The next real call takes this number.");
console.log("─".repeat(64));
console.log(text.replace(/\\(.)/g, "$1"));      // unescaped, for a terminal
console.log("─".repeat(64));

if (SEND) {
  const tg = new Telegram({ token: process.env.TG_TOKEN, chatId: SEND });
  if (!tg.configured) {
    console.log("\nTG_TOKEN is not set, so there is nothing to send it with.");
    process.exit(1);
  }
  console.log(`\nsending to ${SEND} …`);
  const ok = await tg.send(text);
  console.log(ok ? "delivered — check Telegram" : "the send failed; the line above says why");
  process.exit(ok ? 0 : 1);
}

console.log("\nAdd --send <your chat id> to have it delivered, so you see it rendered");
console.log("in Telegram rather than in a terminal. Your chat id is in data/register.json");
console.log("under subs, after you have sent the bot /start.\n");
