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
import { reasonPerformance, scoreBands, chainPerformance } from "./analytics.js";
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

  const json = (res, code, body) => {
    res.writeHead(code, { "content-type": "application/json",
      "access-control-allow-origin": "*", "cache-control": "no-store" });
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
    const rows = filterForTier(store.register(), tier, Date.now(), delays);

    if (p === "/api/register") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
      return json(res, 200, rows.sort((a, b) => Date.parse(b.firedAt) - Date.parse(a.firedAt)).slice(0, limit));
    }
    if (p === "/api/stats") return json(res, 200, stats(rows));

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
        minAvgTradeUsd: cfg.minAvgTradeUsd, quoteWhitelist: cfg.quoteWhitelist,
        scoreToFire: cfg.scoreToFire,
      } } : s);
    }
    if (p === "/api/analytics/reasons") return json(res, 200, reasonPerformance(rows));
    if (p === "/api/analytics/bands") return json(res, 200, scoreBands(rows));
    if (p === "/api/analytics/chains") return json(res, 200, chainPerformance(rows));

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
      return row ? json(res, 200, row) : notFound(res);
    }

    notFound(res);
  });

  srv.listen(port);
  return Object.assign(srv, { feed, tierOf, secret });
}
