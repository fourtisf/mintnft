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
import { callCard, toCsv } from "./og.js";
import { filterForTier, visibleTo, TIER_DELAY_S } from "./gating.js";
import { proofFor } from "./anchor.js";
import { NonceStore, issueSession, readSession, verifySiwe, StaticTierSource } from "./auth.js";

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
  triage = null,
  cfg = null,
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

    /* ── register, all tier-filtered ── */
    const tier = tierOf(req);
    // What the default rule would have returned on this call, computed here so
    // a card and the simulation on Hindsight can never disagree about it.
    const rows = filterForTier(store.register(), tier, Date.now(), delays)
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

    if (p.startsWith("/og/call/")) {
      const seq = Number(p.split("/").pop().replace(".svg", ""));
      const row = rows.find(r => r.seq === seq);
      if (!row) return notFound(res);
      res.writeHead(200, { "content-type": "image/svg+xml",
        "cache-control": row.state === "settled" ? "public, max-age=31536000" : "public, max-age=300",
        "access-control-allow-origin": "*" });
      return res.end(callCard(row));
    }

    /* ── integrity ── */
    if (p === "/api/verify") {
      const v = store.verify();
      const published = store.anchors().filter(a => a.txHash);
      const latest = published[published.length - 1] ?? null;
      return json(res, v.ok ? 200 : 409, {
        ...v, head: store.head(),
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
      const proof = proofFor(store, seq);
      return proof ? json(res, 200, proof)
                   : json(res, 202, { seq, anchored: false, note: "not yet covered by a published anchor" });
    }

    if (p.startsWith("/api/call/")) {
      const seq = Number(p.split("/").pop());
      const row = rows.find(r => r.seq === seq);
      if (!row) return notFound(res);
      // The whole observed series here, not the thinned one on the list route:
      // this is where someone checks that peakMc is a mark we actually saw.
      return json(res, 200, { ...row, samples: store.samples ? store.samples(seq) : [] });
    }

    notFound(res);
  });

  srv.listen(port);
  return Object.assign(srv, { feed, tierOf, secret });
}
