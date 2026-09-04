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
import { linksOf, SIGNALS } from "./rules.js";
import { serve } from "./api.js";
import { attachFeed } from "./ws.js";
import { publishAnchor } from "./anchor.js";
import { readSession, StaticTierSource, ChainTierSource } from "./auth.js";
import { KeysReader } from "./keys.js";
import { TIER_DELAY_S } from "./gating.js";
import { Telegram, formatSignal, formatOutcome, formatProgress,
         milestoneOf } from "./notify.js";
import { TelegramBot, LinkCodes } from "./tgbot.js";

const HOT = 20_000, WARM = 300_000, DISCOVER = 60_000, ANCHOR = 86_400_000;

/**
 * Postgres when DATABASE_URL is set, the file otherwise.
 *
 * The Postgres driver is the store of record: `calls` refuses UPDATE and DELETE
 * at the database, so append-only stops being a convention this process keeps
 * and becomes something the database enforces against it. The file driver is
 * correct and single-process, which is what it is still for.
 *
 * Loaded lazily so a box without a database never has to have `pg` installed.
 */
export async function openStore({ url = process.env.DATABASE_URL, log = console.log } = {}) {
  if (!url) { log("[store] no DATABASE_URL — using the file register"); return new FileStore(); }
  const { PgStore } = await import("./pgstore.js");
  const store = await new PgStore({ url, log }).init();
  const v = await store.verify();
  // Refusing to serve a broken chain is not an option here — the register is
  // what it is and hiding it would be the lie. Saying so at boot is.
  log(v.ok ? `[store] Postgres — ${v.count} calls, chain intact`
           : `[store] Postgres — CHAIN BROKEN at seq ${v.seq}: ${v.why}`);
  return store;
}

export function start({ store = new FileStore(), port = 8787,
                        log = console.log,
                        // Built with the logger, not without one. `new Dexscreener()`
                        // defaults its own log to a no-op, so every network failure,
                        // every 429 and every non-200 this engine ever saw went
                        // nowhere — and an engine scanning zero candidates for hours
                        // looked exactly like a quiet market.
                        api = new Dexscreener({ log }),
                        callerId = Number(process.env.CALLER_ID ?? 1),
                        secret = process.env.SESSION_SECRET,
                        domain = process.env.AUTH_DOMAIN ?? "localhost",
                        // No key contract configured means nobody is above public.
                        tierSource = process.env.KEYS_CONTRACT
                                     && (process.env.KEYS_RPC || process.env.BASE_RPC)
                          ? new ChainTierSource({ rpcUrl: process.env.KEYS_RPC || process.env.BASE_RPC,
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

  /* The public channel is a tier, and it is the slowest one.
   *
   * A call went to Telegram the moment it fired, which put the free channel
   * ahead of every paid tier: Tier I pays for ten seconds and the broadcast was
   * already out. Everything bound for the channel now waits delays[0] measured
   * from fired_at — the same clock ws.js uses for its tier rooms, and the same
   * acceptance that a restart drops what was still queued rather than
   * re-sending it later out of order.
   *
   * With PUBLIC_DELAY_S=0 this is a straight send, which is what it should be
   * while no key has been sold and there is no one to be ahead of. */
  const queued = new Set();
  const channel = (call, text) => {
    if (!telegram.configured) return;
    const due = Date.parse(call.firedAt) + delays[0] * 1000 - Date.now();
    if (due <= 0) return void telegram.send(text);
    const t = setTimeout(() => { queued.delete(t); telegram.send(text); }, due);
    queued.add(t);
  };

  /* Two audiences, one clock.
   *
   * The channel is the shopfront: one public post per event, on the public leg,
   * for anyone who has not bought anything. The bot is the product: the same
   * event, to each subscriber, at the tier their wallet holds right now.
   *
   * Both read delays[0] from the same table, so there is no arrangement of
   * settings in which the free channel arrives before a paid subscriber. */
  const bot = new TelegramBot({ token: process.env.TG_TOKEN, store, tierSource,
                                codes: new LinkCodes(), delays, log,
                                site: domain ?? "nekara.xyz" });

  const broadcast = (call, text) => { channel(call, text); bot.fanout(call, text); };

  const engine = new Engine({
    client: api,
    callerId,
    onScan(n, pairs, runs) { triage.scanned(n, pairs, runs); },
    onReject(pair, ev) { triage.rejected(pair, ev); },
    async onSignal(sig) {
      if (await store.hasToken(sig.chain, sig.tokenAddress, 24 * 3600e3)) return;
      const call = await store.insertCall(sig);
      // The row, not the bare call: a feed message that arrives in a different
      // shape than /api/register is a second format to keep in step, and the
      // client would have to invent the mark fields it is missing.
      feed.publish({ ...call, ...await store.mark(call.seq) });
      // The call's own record of where it came from, so the count on the page
      // and the value frozen on the row cannot drift apart.
      triage.fired(sig.sourceRef);
      log(`[FIRED] #${call.seq} ${sig.symbol} score ${sig.score} — ${sig.reasons[0]}`);
      broadcast(call, formatSignal(sig, call.seq));
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
        const before = await store.mark(c.seq);
        const after = applyObservation(c, before, mc);
        // A token's socials are a property of the token now, not of the call as
        // it was fired, so they ride on the mark — the mutable half — and reach
        // calls written before we recorded any. Kept when the provider stops
        // sending them: a missing field is not a project deleting its Twitter.
        const links = linksOf(p);
        await store.setMark(c.seq, links.length ? { ...after, links } : after);
        feed.publishMark(c, after);
        if (before.verdict !== "win" && after.verdict === "win")
          log(`[WIN] #${c.seq} $${c.symbol} hit ${after.peakX.toFixed(2)}x in ${after.secondsTo2x}s`);
        if (!before.isDead && after.isDead)
          log(`[DEAD] #${c.seq} $${c.symbol} fell to ${(after.nowX * 100).toFixed(0)}% of entry`);
        // The stop is still walked and still recorded — the Hindsight table and
        // the call page both read it. It is no longer announced, on the owner's
        // instruction: the channel carries the call and how far it ran. Logged,
        // because an operator watching a fill is not the same as broadcasting
        // one, and removing the message must not quietly remove the rule.
        if (!before.exitAt && after.exitAt)
          log(`[EXIT] #${c.seq} $${c.symbol} stop filled at ${after.exitX.toFixed(2)}x `
            + `from a high of ${after.exitHighX.toFixed(2)}x`);
        // How far it has run since the call. On milestones, because the poller
        // runs every twenty seconds and a channel repeating 1.04x is a channel
        // nobody is reading when something finally moves. The transition is read
        // off the stored mark rather than held in memory, so a restart does not
        // announce a milestone the channel already has.
        if (milestoneOf(after.peakX) > milestoneOf(before.peakX)) {
          log(`[${milestoneOf(after.peakX)}X] #${c.seq} $${c.symbol} at ${after.nowX.toFixed(2)}x`);
          broadcast(c, formatProgress({ ...c, ...after }));
        }
        // Post the outcome when a call settles — wins and losses alike.
        if (before.state === "live" && after.state === "settled")
          broadcast(c, formatOutcome({ ...c, ...after }));
      }
    }
  }

  /* Every read of the store is awaited. The file driver answers synchronously
     and awaiting a value that is not a promise costs nothing, so the same code
     drives both drivers rather than each having its own copy of the loop. */
  const hot = async () => refresh(await store.liveCalls());
  const warm = async () => {
    const settled = [];
    for (const c of await store.allCalls())
      if ((await store.mark(c.seq)).state === "settled") settled.push(c);
    return refresh(settled);
  };
  /* Verifying is worth doing whether or not anything can be published, and
     publishing is not. With no publisher wired, publishAnchor used to record an
     anchor row carrying no transaction on every run — a row that proves nothing
     and accumulates for ever. The register says it is unanchored; it does not
     also need a pile of rows saying so. */
  const anchor = async () => {
    const v = await store.verify();
    if (!v.ok) return log("INTEGRITY BROKEN", v);
    if (!publishAnchorTx) return;
    return publishAnchor(store, publishAnchorTx, log);
  };

  const timers = [
    setInterval(() => engine.tick().catch(e => log("discovery failed", String(e))), DISCOVER),
    setInterval(() => hot().catch(e => log("hot failed", String(e))), HOT),
    setInterval(() => warm().catch(e => log("warm failed", String(e))), WARM),
    setInterval(() => anchor().catch(e => log("anchor failed", String(e))), ANCHOR),
  ];

  /* setInterval waits a whole period before its first run, so a restart cost a
     blind minute of discovery — and golive.sh restarts twice, and the watchdog
     restarts again on every stall. Nothing was scanned in that window, and on
     an append-only register a gap cannot be filled in afterwards. The first
     pass runs now instead of in sixty seconds. */
  engine.tick().catch(e => log("discovery failed", String(e)));

  const keys = new KeysReader({ log });
  const server = serve(store, { port, secret, domain, tierSource, delays, triage,
                                cfg: engine.cfg, keys, bot, log });
  const feed = attachFeed(server, {
    log, delays,
    // The tier comes from the signed session and nothing else the client sends.
    resolveTier: (req, url) => readSession(url.searchParams.get("token"), server.secret)?.tier ?? 0,
  });

  log(`register api on :${port}  ·  discovery ${DISCOVER/1000}s  hot ${HOT/1000}s  warm ${WARM/1000}s`);
  log(`tier latency  III ${delays[3]}s · II ${delays[2]}s · I ${delays[1]}s · public ${delays[0]}s`);
  // Which chains this desk claims, out loud. Discovery returns every chain a
  // team filed a profile for, so this restriction is the only thing keeping the
  // register inside what the site says it covers.
  /* The one number an operator changes most often, and until now the only way
     to confirm it had taken effect was to read systemd back rather than the
     process. A threshold nothing can reach and a quiet market produce the same
     silence, so the threshold in force belongs in the log beside the rest. */
  log(`[score] fires at ${engine.cfg.scoreToFire} of ${SIGNALS.reduce((a, s) => a + s.max, 0)} — SCORE_TO_FIRE moves it`);
  log(engine.cfg.chains?.length
    ? `[chains] firing on ${engine.cfg.chains.join(", ")} — set CHAINS= to lift it`
    : "[chains] no restriction — every chain discovery returns can fire");
  // Which one the channel is on, out loud: an operator who set PUBLIC_DELAY_S
  // and an operator who forgot to see the same silent bot for the first hour.
  if (telegram.configured)
    log(`[telegram] channel broadcasts on the public leg, ${delays[0]}s behind fired_at`);
  // Both states out loud. "No bot" and "a bot nobody has started" look the same
  // from the outside, and only one of them is something to fix.
  if (bot.configured) { bot.start(); log("[tg] alert bot polling — /start, /link, /status"); }
  else log("[tg] TG_TOKEN not set — no per-holder alerts; the tier ladder reaches the site only");
  // Both states, out loud. Reading the absence of a line is not something an
  // operator can do, and "no mint panel" and "mint panel reading a dead RPC"
  // look identical from the page.
  log(keys.configured
    ? `[keys] mint reads ${keys.contract} on chain ${keys.chainId}`
    : `[keys] mint not wired — ${keys.identity().why}; the panel will say so`);
  if (!publishAnchorTx) log("anchoring is not wired — /api/verify will report the register as unanchored");
  return { stop() { timers.forEach(clearInterval); queued.forEach(clearTimeout); queued.clear();
                    bot.stop(); feed.close(); server.close(); },
           store, engine, triage, feed, server, refresh, bot };
}

if (import.meta.url === `file://${process.argv[1]}`) start({ store: await openStore() });
