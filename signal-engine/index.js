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
import { Triage } from "./triage.js";
import { FileStore } from "./store.js";
import { applyObservation } from "./scorer.js";
import { linksOf } from "./rules.js";
import { serve } from "./api.js";
import { attachFeed } from "./ws.js";
import { publishAnchor } from "./anchor.js";
import { readSession, StaticTierSource, ChainTierSource } from "./auth.js";
import { TIER_DELAY_S } from "./gating.js";
import { Telegram, formatSignal, formatOutcome } from "./notify.js";

const HOT = 20_000, WARM = 300_000, DISCOVER = 60_000, ANCHOR = 86_400_000;

export function start({ store = new FileStore(), api = new Dexscreener(), port = 8787,
                        log = console.log,
                        callerId = Number(process.env.CALLER_ID ?? 1),
                        secret = process.env.SESSION_SECRET,
                        domain = process.env.AUTH_DOMAIN ?? "localhost",
                        // No key contract configured means nobody is above public.
                        tierSource = process.env.KEYS_CONTRACT && process.env.BASE_RPC
                          ? new ChainTierSource({ rpcUrl: process.env.BASE_RPC,
                                                  contract: process.env.KEYS_CONTRACT, log })
                          : new StaticTierSource(),
                        // The paid ladder is the promise and stays where it is: Tier III as
                        // it fires, II at +5s, I at +10s. The public delay is the one number
                        // here that is a product decision rather than a commitment — with no
                        // keys minted, an hour of it means the public page shows nothing at
                        // all — so it is settable, in one place, on the server.
                        publicDelayS = Number(process.env.PUBLIC_DELAY_S ?? TIER_DELAY_S[0]),
                        // Anchoring is off until a publisher is wired. It is never faked.
                        publishAnchorTx = null,
                        telegram = new Telegram({ token: process.env.TG_TOKEN,
                                                  chatId: process.env.TG_CHAT, log }) } = {}) {
  const delays = { ...TIER_DELAY_S,
    0: Number.isFinite(publicDelayS) && publicDelayS >= 0 ? Math.floor(publicDelayS) : TIER_DELAY_S[0] };
  const triage = new Triage();
  const engine = new Engine({
    client: api,
    callerId,
    onScan(n) { triage.scanned(n); },
    onReject(pair, ev) { triage.rejected(pair, ev); },
    onSignal(sig) {
      if (store.hasToken(sig.chain, sig.tokenAddress, 24 * 3600e3)) return;
      const call = store.insertCall(sig);
      // The row, not the bare call: a feed message that arrives in a different
      // shape than /api/register is a second format to keep in step, and the
      // client would have to invent the mark fields it is missing.
      feed.publish({ ...call, ...store.mark(call.seq) });
      triage.fired();
      log(`[FIRED] #${call.seq} ${sig.symbol} score ${sig.score} — ${sig.reasons[0]}`);
      telegram.send(formatSignal(sig, call.seq));
    },
  });

  async function refresh(calls) {
    const byChain = {};
    for (const c of calls) (byChain[c.chain] ??= []).push(c);
    for (const [chain, list] of Object.entries(byChain)) {
      const pairs = await api.tokensBatch(chain, list.map(c => c.tokenAddress));
      const best = {}, byPair = {};
      for (const p of pairs) {
        const a = p.baseToken?.address;
        if (!a) continue;
        if (p.pairAddress) byPair[p.pairAddress] = p;
        if (!best[a] || (p.liquidity?.usd ?? 0) > (best[a].liquidity?.usd ?? 0)) best[a] = p;
      }
      for (const c of list) {
        // The mark has to come off the market the call was fired on. Taking the
        // token's deepest pair instead prices entry in one pool and every later
        // mark in another, and a token quoted differently across two pools is
        // then settled dead within seconds of firing with no trade behind it —
        // a wrong verdict written onto a record that cannot be edited.
        //
        // A pair that has actually gone is the one exception: a bonding curve
        // that migrated leaves an empty pool behind, and the token's deepest
        // pair is the honest continuation rather than a different market.
        const own = byPair[c.pairAddress];
        const p = own && (own.liquidity?.usd ?? 0) > 0 ? own : best[c.tokenAddress];
        if (!p) continue;
        // Same supply the call was frozen at, so peakX is a pure price ratio and
        // a provider redefining its cap cannot move a verdict already published.
        const price = Number(p.priceUsd ?? 0);
        if (!(price > 0) || !(c.entrySupply > 0)) continue;
        const mc = price * c.entrySupply;
        const before = store.mark(c.seq);
        const after = applyObservation(c, before, mc);
        // A token's socials are a property of the token now, not of the call as
        // it was fired, so they ride on the mark — the mutable half — and reach
        // calls written before we recorded any. Kept when the provider stops
        // sending them: a missing field is not a project deleting its Twitter.
        const links = linksOf(p);
        store.setMark(c.seq, links.length ? { ...after, links } : after);
        feed.publishMark(c, after);
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
      publishAnchor(store, publishAnchorTx ?? (() => null), log)
        .catch(e => log("anchor failed", String(e)));
    }, ANCHOR),
  ];

  const server = serve(store, { port, secret, domain, tierSource, delays, triage, cfg: engine.cfg, log });
  const feed = attachFeed(server, {
    log, delays,
    // The tier comes from the signed session and nothing else the client sends.
    resolveTier: (req, url) => readSession(url.searchParams.get("token"), server.secret)?.tier ?? 0,
  });

  log(`register api on :${port}  ·  discovery ${DISCOVER/1000}s  hot ${HOT/1000}s  warm ${WARM/1000}s`);
  log(`tier latency  III ${delays[3]}s · II ${delays[2]}s · I ${delays[1]}s · public ${delays[0]}s`);
  if (!publishAnchorTx) log("anchoring is not wired — /api/verify will report the register as unanchored");
  return { stop() { timers.forEach(clearInterval); feed.close(); server.close(); },
           store, engine, triage, feed, server, refresh };
}

if (import.meta.url === `file://${process.argv[1]}`) start();
