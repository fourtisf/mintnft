/**
 * Orchestrator. One process, four schedules, no manual step anywhere.
 *
 *   discovery   60s   screen candidates, write signals that clear the bar
 *   hot scorer  20s   refresh every live call, move peak / now / verdict
 *   warm scorer  5m   settled calls, only to catch a later death
 *   anchor      24h   publish the chain head
 *
 * Poll interval is the accuracy bound on peak — see the note in scorer.js.
 */
import { Dexscreener } from "./dexscreener.js";
import { Engine } from "./engine.js";
import { FileStore } from "./store.js";
import { applyObservation } from "./scorer.js";
import { serve } from "./api.js";
import { Telegram, formatSignal, formatOutcome } from "./notify.js";

const HOT = 20_000, WARM = 300_000, DISCOVER = 60_000, ANCHOR = 86_400_000;

export function start({ store = new FileStore(), api = new Dexscreener(), port = 8787,
                        log = console.log,
                        telegram = new Telegram({ token: process.env.TG_TOKEN,
                                                  chatId: process.env.TG_CHAT, log }) } = {}) {
  const engine = new Engine({
    client: api,
    onSignal(sig) {
      if (store.hasToken(sig.chain, sig.tokenAddress, 24 * 3600e3)) return;
      const call = store.insertCall(sig);
      log(`[FIRED] #${call.seq} $${sig.symbol} score ${sig.score} — ${sig.reasons[0]}`);
      telegram.send(formatSignal(sig, call.seq));
    },
  });

  async function refresh(calls) {
    const byChain = {};
    for (const c of calls) (byChain[c.chain] ??= []).push(c);
    for (const [chain, list] of Object.entries(byChain)) {
      const pairs = await api.tokensBatch(chain, list.map(c => c.tokenAddress));
      const best = {};
      for (const p of pairs) {
        const a = p.baseToken?.address;
        if (!a) continue;
        if (!best[a] || (p.liquidity?.usd ?? 0) > (best[a].liquidity?.usd ?? 0)) best[a] = p;
      }
      for (const c of list) {
        const p = best[c.tokenAddress];
        if (!p) continue;
        const mc = p.marketCap ?? p.fdv;
        if (!mc) continue;
        const before = store.mark(c.seq);
        const after = applyObservation(c, before, mc);
        store.setMark(c.seq, after);
        if (before.verdict !== "win" && after.verdict === "win")
          log(`[WIN] #${c.seq} $${c.symbol} hit ${after.peakX.toFixed(2)}x in ${after.secondsTo2x}s`);
        if (!before.isDead && after.isDead)
          log(`[DEAD] #${c.seq} $${c.symbol} fell to ${(after.nowX * 100).toFixed(0)}% of entry`);
        // Post the outcome when a call settles — wins and losses alike.
        if (before.state === "live" && after.state === "settled")
          telegram.send(formatOutcome({ ...c, ...after }));
      }
    }
  }

  const timers = [
    setInterval(() => engine.tick().catch(e => log("discovery failed", String(e))), DISCOVER),
    setInterval(() => refresh(store.liveCalls()).catch(e => log("hot failed", String(e))), HOT),
    setInterval(() => refresh(store.allCalls().filter(c => store.mark(c.seq).state === "settled"))
      .catch(e => log("warm failed", String(e))), WARM),
    setInterval(() => {
      const v = store.verify();
      if (!v.ok) return log("INTEGRITY BROKEN", v);
      store.addAnchor({ head: v.head, count: v.count, at: new Date().toISOString(), txHash: null });
      log(`[ANCHOR] ${v.count} calls, head ${v.head.slice(0, 16)}… — publish this on-chain`);
    }, ANCHOR),
  ];

  const server = serve(store, port);
  log(`register api on :${port}  ·  discovery ${DISCOVER/1000}s  hot ${HOT/1000}s  warm ${WARM/1000}s`);
  return { stop() { timers.forEach(clearInterval); server.close(); }, store, engine };
}

if (import.meta.url === `file://${process.argv[1]}`) start();
