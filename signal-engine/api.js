/** Read-only API over the register. No framework, no build step. */
import { createServer } from "node:http";
import { stats } from "./scorer.js";
import { reasonPerformance, scoreBands, chainPerformance } from "./analytics.js";
import { callCard, toCsv } from "./og.js";

export function serve(store, port = 8787) {
  const json = (res, code, body) => {
    res.writeHead(code, { "content-type": "application/json",
      "access-control-allow-origin": "*", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const srv = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const rows = store.register();
    if (url.pathname === "/api/register") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
      return json(res, 200, rows.sort((a,b)=>Date.parse(b.firedAt)-Date.parse(a.firedAt)).slice(0, limit));
    }
    if (url.pathname === "/api/stats") return json(res, 200, stats(rows));

    // Which reasons actually produce winners. The loop that makes the
    // screener improvable instead of a fixed guess.
    if (url.pathname === "/api/analytics/reasons")
      return json(res, 200, reasonPerformance(rows));
    if (url.pathname === "/api/analytics/bands")
      return json(res, 200, scoreBands(rows));
    if (url.pathname === "/api/analytics/chains")
      return json(res, 200, chainPerformance(rows));

    // Full history, so anyone can check our numbers against their own maths.
    if (url.pathname === "/api/export.csv") {
      res.writeHead(200, { "content-type": "text/csv",
        "content-disposition": "attachment; filename=proof-register.csv",
        "access-control-allow-origin": "*" });
      return res.end(toCsv(rows));
    }

    // Social card. Losses get one too.
    if (url.pathname.startsWith("/og/call/")) {
      const seq = Number(url.pathname.split("/").pop().replace(".svg", ""));
      const row = rows.find(r => r.seq === seq);
      if (!row) return json(res, 404, { error: "not found" });
      res.writeHead(200, { "content-type": "image/svg+xml",
        "cache-control": row.state === "settled" ? "public, max-age=31536000" : "public, max-age=300",
        "access-control-allow-origin": "*" });
      return res.end(callCard(row));
    }
    if (url.pathname === "/api/verify") {
      const v = store.verify();
      return json(res, v.ok ? 200 : 409, { ...v, head: store.head() });
    }
    if (url.pathname.startsWith("/api/call/")) {
      const seq = Number(url.pathname.split("/").pop());
      const row = rows.find(r => r.seq === seq);
      return row ? json(res, 200, row) : json(res, 404, { error: "not found" });
    }
    json(res, 404, { error: "not found" });
  });
  srv.listen(port);
  return srv;
}
