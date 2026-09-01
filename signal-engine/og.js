/**
 * Social cards, 1200x630, drawn as SVG.
 *
 * Losing calls get a card too. A post reading "we fired on this, here is
 * exactly why, it went to 6% of entry, it is still on the register" is
 * stronger than another green screenshot, and no competitor will publish one.
 *
 * Convert to PNG with resvg-js if the platform needs a raster.
 */
const esc = s => String(s ?? "").replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
/* Some tokens are listed with the dollar already in the symbol — "$TAP" — and
   every surface here prefixes one of its own. Written as "$$TAP" on a social
   card, that is the first thing a reader notices, and it is the last thing you
   want them noticing. The record keeps what the provider said; only the
   display is normalised. */
export const ticker = s => "$" + (String(s ?? "").replace(/^\$+/, "") || "?");

const usd = n => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${Math.round(n ?? 0)}`;

const THEME = {
  win:  { a: "#5B7CFA", b: "#9B6DFF", label: "WIN" },
  miss: { a: "#6E757E", b: "#8C929C", label: "MISS" },
  open: { a: "#3ECF8E", b: "#6FD8FF", label: "LIVE" },
  dead: { a: "#E5606B", b: "#B5715A", label: "DEAD" },
};

/**
 * The card for the site itself, so a link to the front page has a preview too.
 *
 * Four numbers, and the fourth is the one that matters: peak is a ceiling
 * nobody sold at, and a card that showed only the hit rate would be selling
 * the same misunderstanding this register exists to remove.
 */
export function siteCard(s, returnPct) {
  const pct = n => (n >= 0 ? "+" : "\u2212") + Math.abs(n * 100).toFixed(0) + "%";
  const figs = [
    ["CALLS, 7 DAYS", String(s.calls ?? 0)],
    ["HIT \u2265 2\u00d7", Math.round((s.hitRate ?? 0) * 100) + "%"],
    ["MEDIAN PEAK", (s.medianPeak ?? 0).toFixed(2) + "\u00d7"],
    ["SOLD AT 2\u00d7", returnPct == null ? "\u2014" : pct(returnPct)],
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#5B7CFA"/><stop offset="1" stop-color="#9B6DFF"/></linearGradient>
    <radialGradient id="glow" cx="78%" cy="10%"><stop offset="0" stop-color="#5B7CFA" stop-opacity=".24"/><stop offset="1" stop-color="#5B7CFA" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#08090B"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <text x="64" y="86" font-family="monospace" font-size="19" letter-spacing="5" fill="#585E68">NEKARA \u00b7 THE REGISTER</text>
  <text x="64" y="238" font-family="sans-serif" font-size="72" font-weight="700" fill="#F3F4F6">Signals with their</text>
  <text x="64" y="322" font-family="sans-serif" font-size="72" font-weight="700" fill="url(#g)">reasons attached.</text>
  <text x="64" y="386" font-family="monospace" font-size="24" fill="#8C929C">Every call is published with the conditions that fired it, then tracked</text>
  <text x="64" y="422" font-family="monospace" font-size="24" fill="#8C929C">to win, miss or dead. Failed calls are never removed.</text>
  ${figs.map(([k, v], i) => `
  <text x="${64 + i * 272}" y="530" font-family="sans-serif" font-size="52" font-weight="700" fill="#F3F4F6">${esc(v)}</text>
  <text x="${64 + i * 272}" y="566" font-family="monospace" font-size="16" letter-spacing="2" fill="#585E68">${esc(k)}</text>`).join("")}
  <text x="1136" y="566" text-anchor="end" font-family="monospace" font-size="18" fill="#585E68">nekara.xyz</text>
</svg>`;
}

export function callCard(row) {
  const key = row.isDead ? "dead" : row.verdict;
  const t = THEME[key] ?? THEME.miss;
  const reasons = (row.reasons ?? []).slice(0, 3);
  const spark = sparkPath(row);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${t.a}"/><stop offset="1" stop-color="${t.b}"/></linearGradient>
    <radialGradient id="glow" cx="78%" cy="12%"><stop offset="0" stop-color="${t.a}" stop-opacity=".26"/><stop offset="1" stop-color="${t.a}" stop-opacity="0"/></radialGradient>
    <pattern id="sl" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="2.2" fill="#9FB4C8"/></pattern>
  </defs>
  <rect width="1200" height="630" fill="#08090B"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect width="1200" height="630" fill="url(#sl)" opacity=".045"/>

  <text x="64" y="82" font-family="monospace" font-size="19" letter-spacing="5" fill="#585E68">PROOF · THE REGISTER</text>

  <rect x="960" y="52" width="176" height="46" rx="10" fill="${t.a}" opacity=".14" stroke="${t.a}" stroke-width="1.4"/>
  <text x="1048" y="83" text-anchor="middle" font-family="monospace" font-size="21" font-weight="700" letter-spacing="4" fill="${t.a}">${t.label}</text>

  <text x="64" y="186" font-family="sans-serif" font-size="66" font-weight="700" fill="#F3F4F6">${esc(ticker(row.symbol))}</text>
  <text x="64" y="232" font-family="monospace" font-size="22" fill="#8C929C">${esc(row.chain)} · ${esc(row.dex ?? "")} · fired ${esc((row.firedAt ?? "").slice(0, 16).replace("T", " "))} UTC</text>

  <text x="1136" y="196" text-anchor="end" font-family="sans-serif" font-size="92" font-weight="700" fill="url(#g)">${(row.peakX ?? 1).toFixed(2)}×</text>
  <text x="1136" y="232" text-anchor="end" font-family="monospace" font-size="19" fill="#585E68">PEAK · NOW ${(row.nowX ?? 1).toFixed(2)}×</text>

  <path d="${spark}" fill="none" stroke="url(#g)" stroke-width="3.5" stroke-linejoin="round" opacity=".9"/>
  <line x1="64" y1="300" x2="1136" y2="300" stroke="#FFFFFF" stroke-width="1" stroke-dasharray="5 7" opacity=".18"/>
  <text x="72" y="294" font-family="monospace" font-size="15" fill="#585E68">2× line</text>

  ${[["ENTRY MC", usd(row.entryMc)], ["PEAK MC", usd(row.peakMc)], ["NOW MC", usd(row.nowMc)],
     ["2× IN", row.secondsTo2x ? Math.round(row.secondsTo2x / 60) + "m" : "never"]]
    .map(([k, v], i) => `
  <text x="${64 + i * 262}" y="452" font-family="monospace" font-size="16" letter-spacing="2" fill="#585E68">${k}</text>
  <text x="${64 + i * 262}" y="490" font-family="monospace" font-size="34" font-weight="600" fill="#F3F4F6">${v}</text>`).join("")}

  <text x="64" y="546" font-family="monospace" font-size="16" letter-spacing="2" fill="#585E68">WHY IT FIRED · ${row.score ?? 0}/100</text>
  ${reasons.map((r, i) => `<text x="64" y="${578 + i * 26}" font-family="sans-serif" font-size="19" fill="#8C929C">· ${esc(r)}</text>`).join("")}

  <text x="1136" y="600" text-anchor="end" font-family="monospace" font-size="15" fill="#3E444C">peak is not a realized return · nothing removed from the record</text>
</svg>`;
}

function sparkPath(row) {
  const e = row.entryMc || 1, p = row.peakMc || e, n = row.nowMc || e;
  const two = e * 2, mn = Math.min(e, n, two * .7), mx = Math.max(p, two * 1.05);
  const Y = v => 380 - ((v - mn) / (mx - mn || 1)) * 130;
  const pk = 0.28 + Math.random() * 0.3;
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const v = t <= pk ? e + (p - e) * Math.pow(t / pk, .62)
                      : p + (n - p) * Math.pow((t - pk) / (1 - pk), .75);
    pts.push(`${(64 + t * 1072).toFixed(0)} ${Y(v).toFixed(0)}`);
  }
  return "M" + pts.join("L");
}

/**
 * The public export. Carries every field that goes into record_hash, so a
 * reader can recompute the whole chain themselves rather than take our word
 * that the hash in the last column belongs to the row in front of it.
 *
 * reasonIds is pipe-joined and sourceRef distinguishes empty from absent,
 * because both have to survive the round trip for the recomputation to agree.
 */
export const CSV_COLUMNS = [
  "seq", "hashVersion", "callerId", "chain", "tokenAddress", "pairAddress", "symbol",
  "firedAt", "entryPriceUsd", "entrySupply", "entryMc", "entrySupplySource",
  "liquidityUsd", "score", "reasonIds", "sourceKind", "sourceRef",
  // In the hash since version 3. A v2 row leaves them empty, which is what the
  // v2 scheme hashed — the export has to reproduce the row's own scheme or the
  // recomputation it exists to enable cannot agree.
  "entryVolumeH1", "entryVolumeM5",
  "peakMc", "nowMc", "peakX", "nowX", "verdict", "isDead", "secondsTo2x",
  "recordHash", "chainHash",
];

export function toCsv(rows, cols = CSV_COLUMNS) {
  const cell = (r, c) => {
    const v = c === "reasonIds" ? (r.reasonIds ?? []).join("|")
            : c === "sourceRef" ? (r.sourceRef == null ? "\\N" : r.sourceRef)
            : r[c];
    return v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  };
  return [cols.join(","), ...rows.map(r => cols.map(c => cell(r, c)).join(","))].join("\n");
}
