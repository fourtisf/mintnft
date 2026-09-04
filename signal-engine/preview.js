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
 *
 * Rejections are the useful output when nothing fires, which is most of the
 * time and is not a fault: the thresholds in rules.js were reasoned, not
 * measured, and the gate that kills everything is the one worth reading.
 */
import { Engine } from "./engine.js";
import { formatSignal } from "./notify.js";
import { Telegram } from "./notify.js";
import { existsSync, readFileSync } from "node:fs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ALL = process.argv.includes("--all");
const SEND = arg("--send", null);

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
