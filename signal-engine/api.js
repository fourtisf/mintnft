/**
 * Read-only API over the register. No framework, no build step.
 *
 * Every route that can return a call goes through the same filter, including
 * the CSV export and the social cards — a gate with a side door is not a gate.
 * A call that exists but is not yet due answers exactly like one that does not
 * exist, because a distinguishable 403 tells you a call was just fired, which
 * is most of what the latency is worth.
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { stats } from "./scorer.js";
import { reasonPerformance, scoreBands, chainPerformance, callerPerformance,
         exitSimulation, realised } from "./analytics.js";
import { callCard, bannerCard, signalCard, digestCard, podiumCard, siteCard, toCsv, ticker } from "./og.js";
import { readFileSync, statSync } from "node:fs";
import { filterForTier, visibleTo, TIER_DELAY_S } from "./gating.js";
import { proofFor } from "./anchor.js";
import { NonceStore, issueSession, readSession, verifySiwe, StaticTierSource } from "./auth.js";
import { NoHoldings, levelFor, LADDER, LEVEL_NAME, PUBLIC as L_PUBLIC, PREMIUM as L_PREMIUM } from "./holdings.js";
import { SIGNALS } from "./rules.js";
import { TIER_NAME } from "./tgbot.js";
import { KeysReader } from "./keys.js";

const readBody = req => new Promise((resolve, reject) => {
  let b = ""; let over = false;
  req.on("data", c => { b += c; if (b.length > 8192) { over = true; req.destroy(); } });
  req.on("end", () => over ? reject(new Error("body too large")) : resolve(b));
  req.on("error", reject);
});

export function serve(store, {
  port = 8787,
  secret = process.env.SESSION_SECRET,
  domain = process.env.AUTH_DOMAIN ?? "localhost",
  tierSource = new StaticTierSource(),
  delays = TIER_DELAY_S,
  nonces = new NonceStore(),
  feed = null,
  // Null until TG_TOKEN is set. The route says so rather than pretending.
  bot = null,
  triage = null,
  cfg = null,
  holdings = new NoHoldings(),
  keys = new KeysReader({ log: console.log }),
  log = console.log,
} = {}) {
  if (!secret) {
    // A default secret is a signing key everyone already has.
    secret = randomBytes(32).toString("hex");
    log("SESSION_SECRET unset — sessions will not survive a restart");
  }

  const json = (res, code, body, extra = {}) => {
    res.writeHead(code, { "content-type": "application/json",
      "access-control-allow-origin": "*", "cache-control": "no-store", ...extra });
    res.end(JSON.stringify(body));
  };
  const notFound = res => json(res, 404, { error: "not found" });

  /** The only place a tier is decided. Absent or unreadable token means public. */
  const tierOf = req => {
    const raw = (req.headers.authorization ?? "").replace(/^Bearer /i, "");
    return readSession(raw, secret)?.tier ?? 0;
  };

  /* The only place a holdings level is decided, and it asks the chain rather
     than the token. The session carries a tier because latency has to be
     resolved on a hot path; a level is read per request because it costs one
     eth_call and because a key sold mid-session must stop opening the door on
     the next request, not when the JWT happens to expire. */
  const levelOf = async req => {
    const raw = (req.headers.authorization ?? "").replace(/^Bearer /i, "");
    const claims = readSession(raw, secret);
    if (!claims) return { level: L_PUBLIC, address: null, keys: 0 };
    const count = await holdings.countOf(claims.addr);
    return { level: levelFor(count), address: claims.addr, keys: count };
  };

  /* Social platforms do not render SVG previews, so the card that exists to be
     seen in a timeline has to leave here as a raster. The dependency loads once
     and never again if it is missing: an engine without it still serves the
     register, it just cannot draw. */
  let Resvg = null, resvgTried = false;
  const png = async svg => {
    if (!resvgTried) {
      resvgTried = true;
      try { ({ Resvg } = await import("@resvg/resvg-js")); }
      catch { Resvg = null; log("resvg is not installed — /og/*.png will answer 503"); }
    }
    if (!Resvg) return null;
    try { return new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng(); }
    catch (e) { log("png render failed", String(e)); return null; }
  };

  /* One page, served per call with that call's own preview tags. A static file
     cannot vary them, so every shared link carried the site's card and none of
     the call's: the numbers in the post and the numbers in the preview were
     different by construction. */
  const indexPath = process.env.SITE_INDEX ?? "/var/www/nekara/index.html";
  let indexCache = { at: 0, html: null };
  const siteIndex = () => {
    try {
      const m = statSync(indexPath).mtimeMs;
      if (indexCache.at !== m) indexCache = { at: m, html: readFileSync(indexPath, "utf8") };
      return indexCache.html;
    } catch { return null; }
  };
  const esc = s => String(s ?? "").replace(/[&<>"]/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const callMeta = (row, origin) => {
    const state = (row.peakX ?? 1) >= 2 ? `WIN ${(row.peakX ?? 1).toFixed(2)}x`
      : row.isDead ? `DEAD, peaked ${(row.peakX ?? 1).toFixed(2)}x`
      : row.state === "settled" ? `MISS, peaked ${(row.peakX ?? 1).toFixed(2)}x`
      : `LIVE ${(row.nowX ?? 1).toFixed(2)}x`;
    const title = `${ticker(row.symbol)} - ${state} - Nekara`;
    const desc = `Called at $${Math.round(row.entryMc ?? 0).toLocaleString("en-US")} on ${row.chain}. `
      + (row.reasons?.[0] ?? "Published with the conditions that fired it.")
      + ". Wins, misses and the ones that died all stay on the register.";
    return [
      `<meta name="description" content="${esc(desc)}">`,
      `<meta property="og:type" content="article">`,
      `<meta property="og:url" content="${esc(origin)}/call/${row.seq}">`,
      `<meta property="og:title" content="${esc(title)}">`,
      `<meta property="og:description" content="${esc(desc)}">`,
      `<meta property="og:image" content="${esc(origin)}/og/call/${row.seq}.png">`,
      `<meta name="twitter:card" content="summary_large_image">`,
    ].join("\n");
  };

  const srv = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const p = url.pathname;

    if (req.method === "OPTIONS") {
      res.writeHead(204, { "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization,content-type",
        "access-control-allow-methods": "GET,POST,OPTIONS" });
      return res.end();
    }

    /* ── auth ── */
    if (p === "/auth/nonce") return json(res, 200, { nonce: nonces.create(), domain });

    if (p === "/auth/verify" && req.method === "POST") {
      let body;
      try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: "bad body" }); }
      const v = verifySiwe({ message: body.message, signature: body.signature, domain, nonces });
      if (!v.ok) return json(res, 401, { error: v.why });
      const tier = await tierSource.bestTierOf(v.address);
      return json(res, 200, { token: issueSession({ address: v.address, tier }, secret), tier, address: v.address });
    }

    // Refresh re-reads the chain. The session is the only bound on a stale tier.
    if (p === "/auth/refresh") {
      const claims = readSession((req.headers.authorization ?? "").replace(/^Bearer /i, ""), secret);
      if (!claims) return json(res, 401, { error: "no session" });
      const tier = await tierSource.bestTierOf(claims.addr);
      return json(res, 200, { token: issueSession({ address: claims.addr, tier }, secret), tier, address: claims.addr });
    }

    /* ── telegram ──
       The code proves control of the chat; the session proves control of the
       address. Neither alone is enough, and the binding needs both — a chat id
       posted in public would otherwise be enough to claim someone's tier. */
    // Whether there is anything to link to. The page asks before it offers a
    // form: an input wired to a bot that does not exist is a dead end wearing
    // the costume of a feature.
    if (p === "/api/tg")
      return json(res, 200, { configured: Boolean(bot?.configured), username: bot?.username ?? null });

    if (p === "/api/tg/link" && req.method === "POST") {
      const claims = readSession((req.headers.authorization ?? "").replace(/^Bearer /i, ""), secret);
      if (!claims) return json(res, 401, { error: "connect a wallet first" });
      if (!bot?.configured) return json(res, 503, { error: "the alert bot is not wired" });
      let body;
      try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: "bad body" }); }
      const v = bot.codes.redeem(body.code);
      // Expired and never-issued are one answer on purpose: telling them apart
      // turns this route into an oracle for which codes are live.
      if (!v) return json(res, 400, { error: "that code is expired or not one of ours" });
      await store.linkSubscriber(v.chatId, claims.addr);
      // Read now for the reply only. Delivery reads it again at send time.
      const tier = await tierSource.bestTierOf(claims.addr);
      bot.say(v.chatId, `Linked to \`${claims.addr}\`\\. You are on ${TIER_NAME[tier]}\\.`);
      return json(res, 200, { linked: true, tier });
    }

    /* ── the mint ──
       Reads only. Whether an address may mint is decided here rather than in
       the browser — but nothing about this is a gate: the contract refuses a
       wallet that is not entitled, and this route only saves the visitor from
       paying gas to find that out. */
    if (p === "/api/keys") return json(res, 200, keys.identity());

    if (p === "/api/keys/state") {
      const a = url.searchParams.get("address");
      if (a !== null && !/^0x[0-9a-fA-F]{40}$/.test(a))
        return json(res, 400, { error: "address must be 0x and 40 hex characters" });
      return json(res, 200, await keys.state(a));
    }

    /* ── register, all tier-filtered ── */
    const tier = tierOf(req);
    // What the default rule would have returned on this call, computed here so
    // a card and the simulation on Hindsight can never disagree about it.
    const rows = filterForTier(await store.register(), tier, Date.now(), delays)
      .map(r => ({ ...r, realised2x: realised(r, "2x") }));

    if (p === "/api/register") {
      // Filtering belongs here, not in the browser. A page holding the newest
      // sixty rows and filtering those answers "wins among the last sixty" while
      // showing the word Wins — right until the register outgrows a page, and
      // wrong quietly from then on.
      //
      // Every filter narrows what is returned and none of them touch /api/stats:
      // the published numbers stay over the whole register, misses included.
      const s = url.searchParams;
      const num = k => { const v = Number(s.get(k)); return Number.isFinite(v) && v > 0 ? v : 0; };
      const verdict = s.get("verdict"), chain = s.get("chain");
      const q = (s.get("q") ?? "").trim().toLowerCase();
      const cut = num("hours") ? Date.now() - num("hours") * 3600e3 : 0;
      const minMc = num("min_mc"), minVol = num("min_vol");

      const hit = r =>
           (!verdict || r.verdict === verdict)
        && (!chain || r.chain === chain)
        && (s.get("dead") !== "1" || !!r.isDead)
        && (s.get("live") !== "1" || r.state !== "settled")
        && (!cut || Date.parse(r.firedAt) >= cut)
        && (!minMc || (r.entryMc ?? 0) >= minMc)
        // A call written before the engine recorded volume cannot satisfy a
        // volume floor, and must not be counted as though it had.
        && (!minVol || (r.entryVolumeH1 ?? 0) >= minVol)
        && (!q || `${r.name ?? ""} ${r.symbol ?? ""} ${r.tokenAddress ?? ""}`.toLowerCase().includes(q));

      const sort = s.get("sort");
      const out = rows.filter(hit).sort(
        sort === "peak" ? (a, b) => (b.peakX ?? 0) - (a.peakX ?? 0)
        : sort === "now" ? (a, b) => (b.nowX ?? 0) - (a.nowX ?? 0)
        : (a, b) => Date.parse(b.firedAt) - Date.parse(a.firedAt));

      const limit = Math.min(Math.max(Number(s.get("limit") ?? 50), 1), 200);
      const offset = Math.max(Number(s.get("offset") ?? 0), 0);
      // The total is how a page can say "60 of 214" instead of implying 60 is
      // all there is. A header keeps the body an array, which every caller and
      // the gating test already expect.
      return json(res, 200, out.slice(offset, offset + limit), {
        "x-total-count": String(out.length),
        "access-control-expose-headers": "x-total-count",
      });
    }
    if (p === "/api/stats") {
      // Two windows, because the site asks two questions: the home page says
      // "on record" and the signals page says "7D". Same stats(), one
      // parameter, so neither heading is answered by a number computed
      // somewhere else.
      const raw = url.searchParams.get("days");
      const days = raw === "all" ? 36500
        : Math.min(Math.max(Math.floor(Number(raw)) || 7, 1), 36500);
      return json(res, 200, { ...stats(rows, days), windowDays: days });
    }

    // What the screener refused, and the thresholds it refused against. Public:
    // a filter nobody can inspect is a claim, not a filter.
    /* The paid half of triage. Public /api/triage answers what the desk did;
       this answers what it is doing, on the candidates it has not called.

       Nothing here is filtered in the browser. A reader below the rung gets a
       body with no tape and no near misses in it — not a full body they are
       asked not to look at, which is the same mistake as gating latency in the
       UI and lasts exactly as long as it takes to open devtools.

       It also says what it could not establish. A desk with no collection
       deployed cannot verify anyone's holdings, and that has to read as "we
       cannot check" rather than as a refusal the reader will take for a
       verdict on their wallet. */
    if (p === "/api/alpha") {
      if (!triage) return json(res, 503, { error: "triage is not wired on this instance" });
      const { level, address, keys: held } = await levelOf(req);
      const base = {
        level, levelName: LEVEL_NAME[level], keys: held, address,
        ladder: LADDER(),
        // Never null-as-zero: an unconfigured contract is not a holder of none.
        verified: holdings.configured,
        threshold: cfg?.scoreToFire ?? null,
        // The page draws a score against a track, and a track needs its own end.
        // Sent rather than assumed: a weight change moves it, and a bar drawn to
        // a stale maximum misreports every candidate on the page.
        maxScore: SIGNALS.reduce((n, r) => n + r.max, 0),
      };
      if (!holdings.configured)
        return json(res, 200, { ...base, locked: true,
          why: "The collection is not deployed on this instance, so no wallet's keys can be counted." });
      if (level < L_PREMIUM)
        return json(res, 200, { ...base, locked: true,
          why: `Alpha opens at ${LADDER()[L_PREMIUM]} keys. This wallet holds ${held}.` });
      return json(res, 200, { ...base, locked: false,
        tape: triage.rejects, nearMiss: triage.nearMiss });
    }

    if (p === "/api/triage") {
      if (!triage) return json(res, 503, { error: "triage is not wired on this instance" });
      const s = triage.snapshot();
      return json(res, 200, cfg ? { ...s, gateConfig: {
        minLiquidityUsd: cfg.minLiquidityUsd, minAgeMinutes: cfg.minAgeMinutes,
        maxAgeHours: cfg.maxAgeHours, minMarketCap: cfg.minMarketCap,
        maxMarketCap: cfg.maxMarketCap, minLiqToMcRatio: cfg.minLiqToMcRatio,
        maxSellPressure: cfg.maxSellPressure, maxRecentPumpPct: cfg.maxRecentPumpPct,
        maxHourPumpPct: cfg.maxHourPumpPct,
        minAvgTradeUsd: cfg.minAvgTradeUsd, quoteWhitelist: cfg.quoteWhitelist,
        scoreToFire: cfg.scoreToFire,
      } } : s);
    }
    // A window, so a page can label these honestly. Same rule as /api/stats:
    // whatever the window, every call inside it counts, misses included.
    const windowed = () => {
      const d = Math.min(Math.max(Math.floor(Number(url.searchParams.get("days")) || 0), 0), 36500);
      return d ? rows.filter(r => Date.parse(r.firedAt) > Date.now() - d * 864e5) : rows;
    };
    if (p === "/api/analytics/reasons") return json(res, 200, reasonPerformance(windowed()));
    if (p === "/api/analytics/bands") return json(res, 200, scoreBands(windowed()));
    if (p === "/api/analytics/chains") return json(res, 200, chainPerformance(windowed()));
    if (p === "/api/analytics/callers") {
      const rule = ["2x", "1.5x", "hold", "trail"].includes(url.searchParams.get("exit"))
        ? url.searchParams.get("exit") : "2x";
      return json(res, 200, callerPerformance(windowed(), { rule }));
    }
    // The result, as opposed to the peak. Same rules the Hindsight page offers,
    // computed here so the answer does not depend on which rows a browser holds.
    if (p === "/api/analytics/simulate") {
      const rule = ["2x", "1.5x", "hold", "trail"].includes(url.searchParams.get("exit"))
        ? url.searchParams.get("exit") : "2x";
      const size = Math.min(Math.max(Number(url.searchParams.get("size")) || 100, 1), 1e6);
      return json(res, 200, exitSimulation(windowed(), { rule, size }));
    }

    if (p === "/api/export.csv") {
      res.writeHead(200, { "content-type": "text/csv",
        "content-disposition": "attachment; filename=proof-register.csv",
        "access-control-allow-origin": "*" });
      return res.end(toCsv(rows));
    }

    /* The winners, with the denominator still on the card:
         /og/wins.png?days=7&n=5
       Selecting what to draw is allowed; hiding what it was selected from is
       not. The rows are the calls that hit 2x, best first, and the headline
       figures — hit rate, total, dead — are computed over every call in the
       window, so the number cannot be improved by choosing the picture.
       Non-negotiable 2 is about statistics that exclude misses, and none of
       these do: the selection is what is drawn, never what is counted. */
    if (p === "/og/wins.png" || p === "/og/wins.svg") {
      const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 7));
      // Up to five gets the hero layout; past that podiumCard hands over to the
      // board, because the runners-up become slivers long before ten.
      const n = Math.min(10, Math.max(1, Number(url.searchParams.get("n")) || 5));
      const cut = Date.now() - days * 864e5;
      const inWindow = rows.filter(r => Date.parse(r.firedAt) > cut);
      // Ranked on the all-time high, which is what the card prints. peakX stops
      // at settle; peakAllX is the highest value ever observed.
      const ath = r => r.peakAllX ?? r.peakX ?? 0;
      const wins = inWindow.filter(r => r.verdict === "win").sort((a, b) => ath(b) - ath(a));
      // The return per call rides on the same stats object, computed over every
      // call in the window rather than over the ones the card draws.
      const svg = podiumCard(wins,
        { ...stats(inWindow, days), returnPct: exitSimulation(inWindow).returnPct },
        { days, max: n });
      const cache = "public, max-age=300";
      if (p.endsWith(".png")) {
        const buf = await png(svg);
        if (!buf) return json(res, 503, { error: "png rendering is not available on this instance" });
        res.writeHead(200, { "content-type": "image/png", "cache-control": cache,
          "access-control-allow-origin": "*", "content-length": buf.length });
        return res.end(buf);
      }
      res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": cache,
        "access-control-allow-origin": "*" });
      return res.end(svg);
    }

    /* Several calls in one picture: /og/digest.png?days=7&n=6
       The rows are the most recent in the window and never the best ones —
       sorting them by multiple is one line away and would turn the register's
       own recap into the highlight reel it exists to replace. The headline
       figures are computed over every call in the window, not over the six on
       show, so the hit rate cannot be improved by choosing what to display. */
    if (p === "/og/digest.png" || p === "/og/digest.svg") {
      const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 7));
      const n = Math.min(9, Math.max(1, Number(url.searchParams.get("n")) || 6));
      const cut = Date.now() - days * 864e5;
      const inWindow = rows.filter(r => Date.parse(r.firedAt) > cut);
      const recent = inWindow.slice().sort((a, b) => b.seq - a.seq);
      const svg = digestCard(recent, stats(inWindow, days),
        { days, max: n, cols: n <= 4 ? 2 : 3 });
      const cache = "public, max-age=300";
      if (p.endsWith(".png")) {
        const buf = await png(svg);
        if (!buf) return json(res, 503, { error: "png rendering is not available on this instance" });
        res.writeHead(200, { "content-type": "image/png", "cache-control": cache,
          "access-control-allow-origin": "*", "content-length": buf.length });
        return res.end(buf);
      }
      res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": cache,
        "access-control-allow-origin": "*" });
      return res.end(svg);
    }

    // The front page's own card, over the same seven days the site's figures
    // cover, and carrying the result beside the hit rate.
    if (p === "/og/site.png" || p === "/og/site.svg") {
      const svg = siteCard(stats(rows), exitSimulation(rows.filter(
        r => Date.parse(r.firedAt) > Date.now() - 7 * 864e5)).returnPct);
      const cache = "public, max-age=300";
      if (p.endsWith(".png")) {
        const buf = await png(svg);
        if (!buf) return json(res, 503, { error: "png rendering is not available on this instance" });
        res.writeHead(200, { "content-type": "image/png", "cache-control": cache,
          "access-control-allow-origin": "*", "content-length": buf.length });
        return res.end(buf);
      }
      res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": cache,
        "access-control-allow-origin": "*" });
      return res.end(svg);
    }

    /* Two cards per call, on purpose. /og/call is the record — every figure,
       the reasons, and the line saying peak is not a realised return; it is
       what a shared link unfurls into. /og/banner is the one that goes on a
       timeline: the call's own observed series as the whole surface, with the
       numbers over it. Same data, same honesty about which multiple is being
       headlined, different amount of room. */
    if (p.startsWith("/og/call/") || p.startsWith("/og/banner/") || p.startsWith("/og/signal/")) {
      const file = p.split("/").pop();
      const seq = Number(file.replace(/\.(svg|png)$/, ""));
      const row = rows.find(r => r.seq === seq);
      if (!row) return notFound(res);
      /* Three cards, and which one is right depends on how much has happened.
         /og/signal is the announcement — no multiple, because there is not one
         yet; /og/call is the record a shared link unfurls into; /og/banner is
         the timeline picture once there is a series worth drawing. */
      const svg = p.startsWith("/og/banner/") ? bannerCard(row)
                : p.startsWith("/og/signal/") ? signalCard(row)
                : callCard(row);
      // A settled call's card can never change again; a live one is five minutes
      // stale at worst, the same bound its marks carry.
      const cache = row.state === "settled" ? "public, max-age=31536000" : "public, max-age=300";
      if (file.endsWith(".png")) {
        const buf = await png(svg);
        if (!buf) return json(res, 503, { error: "png rendering is not available on this instance" });
        res.writeHead(200, { "content-type": "image/png", "cache-control": cache,
          "access-control-allow-origin": "*", "content-length": buf.length });
        return res.end(buf);
      }
      res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": cache,
        "access-control-allow-origin": "*" });
      return res.end(svg);
    }

    /* The page for one call, carrying that call's preview tags. A call this
       reader may not see yet gets the page unchanged — not due is answered the
       same way as not there, here as everywhere else. */
    if (p.startsWith("/call/")) {
      const seq = Number(p.split("/")[2]);
      const html = siteIndex();
      if (!html) {
        res.writeHead(302, { location: `/?call=${Number.isFinite(seq) ? seq : ""}` });
        return res.end();
      }
      const row = rows.find(r => r.seq === seq);
      const proto = String(req.headers["x-forwarded-proto"] ?? "https").split(",")[0].trim();
      const origin = `${proto}://${req.headers.host ?? domain}`;
      const body = row
        ? html.replace(/<!-- og:start -->[\s\S]*?<!-- og:end -->/,
            `<!-- og:start -->\n${callMeta(row, origin)}\n<!-- og:end -->`)
        : html;
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
      return res.end(body);
    }

    /* ── integrity ── */
    if (p === "/api/verify") {
      const v = await store.verify();
      const published = (await store.anchors()).filter(a => a.txHash);
      const latest = published[published.length - 1] ?? null;
      return json(res, v.ok ? 200 : 409, {
        ...v, head: await store.head(),
        anchored: !!latest,
        anchoredThrough: latest?.seqTo ?? 0,
        latestAnchor: latest,
        // Said plainly: a chain nobody has published is a chain we could rewrite.
        note: latest ? undefined
          : "chain is internally consistent but has never been published on-chain — not independently verifiable",
      });
    }

    if (p.startsWith("/api/verify/")) {
      const seq = Number(p.split("/").pop());
      if (!rows.some(r => r.seq === seq)) return notFound(res);
      const proof = await proofFor(store, seq);
      return proof ? json(res, 200, proof)
                   : json(res, 202, { seq, anchored: false, note: "not yet covered by a published anchor" });
    }

    if (p.startsWith("/api/call/")) {
      const seq = Number(p.split("/").pop());
      const row = rows.find(r => r.seq === seq);
      if (!row) return notFound(res);
      // The whole observed series here, not the thinned one on the list route:
      // this is where someone checks that peakMc is a mark we actually saw.
      return json(res, 200, { ...row, samples: store.samples ? await store.samples(seq) : [] });
    }

    notFound(res);
  });

  srv.listen(port);
  return Object.assign(srv, { feed, tierOf, secret });
}
