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

/**
 * The premium banner: one call, its own chart behind it.
 *
 * callCard is the record — every figure, the reasons, the caveat. This is the
 * one that goes on a timeline, so the chart is the whole surface and the
 * numbers sit on top of it. Same tokens, same restraint: the gradient is the
 * only colour, elevation comes from the wash under the line rather than glow,
 * and there is no serif anywhere.
 *
 * A losing call gets the same treatment and reads in --dead. Publishing the
 * ones that died is the argument; a banner that only ever shows winners is
 * the thing this register was built to replace.
 */
export function bannerCard(row) {
  const key = row.isDead ? "dead" : row.verdict;
  const t = THEME[key] ?? THEME.miss;
  /* The badge says what the register calls it; the line says where the price
     actually is. A live call sitting at 27% of entry drawn in the win gradient
     is a picture that argues with its own number, and the number is the one
     that is true. Above entry it reads in the brand gradient, below it in
     --dead, and a win that later died keeps its badge either way. */
  const nx = row.nowX ?? 1;
  const line = nx >= 1.02 ? { a: "#5B7CFA", b: "#9B6DFF" }
             : nx <= 0.98 ? { a: "#E5606B", b: "#B5715A" }
             : { a: "#6E7BFF", b: "#8C929C" };
  const s = series(row, { x: -40, y: 170, w: 1280, h: 400 });
  // Where it is, unless it is settled and won. The site headlines a live or
  // dead call at now for a reason: a token sitting at 27% of entry with 1.12×
  // across the top is the misreading this register exists to remove, and it
  // does not become acceptable because the picture is going on a timeline.
  const live = row.state !== "settled";
  const x = (live || row.isDead) ? (row.nowX ?? 1) : (row.peakX ?? 1);
  const under = `${(live || row.isDead) ? "NOW" : "PEAK"} · ${(live || row.isDead) ? "PEAK " + (row.peakX ?? 1).toFixed(2) : "NOW " + (row.nowX ?? 1).toFixed(2)}×`;
  const reasons = (row.reasons ?? []).slice(0, 2);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${line.a}"/><stop offset="1" stop-color="${line.b}"/></linearGradient>
    <linearGradient id="wash" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${line.a}" stop-opacity=".40"/>
      <stop offset="1" stop-color="${line.a}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#08090B" stop-opacity=".88"/>
      <stop offset=".5" stop-color="#08090B" stop-opacity=".42"/>
      <stop offset="1" stop-color="#08090B" stop-opacity=".90"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="#08090B"/>
  <path d="${s.area}" fill="url(#wash)"/>
  <path d="${s.line}" fill="none" stroke="url(#g)" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
  ${s.twoInFrame ? `<line x1="0" y1="${s.twoY}" x2="1200" y2="${s.twoY}" stroke="#FFFFFF" stroke-width="1" stroke-dasharray="6 8" opacity=".26"/>
  <text x="1180" y="${Number(s.twoY) - 12}" text-anchor="end" font-family="monospace" font-size="15" letter-spacing="2" fill="#8C929C">2×</text>` : ""}
  <rect width="1200" height="630" fill="url(#veil)"/>
  <!-- Once more over the veil, so the line the card is built around survives
       the darkening that makes the text readable. -->
  <path d="${s.line}" fill="none" stroke="url(#g)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>

  <text x="64" y="82" font-family="monospace" font-size="18" letter-spacing="6" fill="#8C929C">NEKARA</text>
  <rect x="${1136 - 150}" y="52" width="150" height="42" rx="9" fill="${t.a}" opacity=".16" stroke="${t.a}" stroke-width="1.3"/>
  <text x="${1136 - 75}" y="80" text-anchor="middle" font-family="monospace" font-size="19" font-weight="700" letter-spacing="4" fill="${t.a}">${t.label}</text>

  <text x="64" y="330" font-family="sans-serif" font-size="112" font-weight="700" letter-spacing="-4" fill="#F3F4F6">${esc(ticker(row.symbol))}</text>
  <text x="64" y="380" font-family="monospace" font-size="21" fill="#8C929C">${esc(row.name ?? "")}${row.name ? " · " : ""}${esc(row.chain)} · ${esc(row.dex ?? "")}</text>

  <text x="1136" y="330" text-anchor="end" font-family="sans-serif" font-size="128" font-weight="700" letter-spacing="-5" fill="url(#g)">${x.toFixed(2)}×</text>
  <text x="1136" y="378" text-anchor="end" font-family="monospace" font-size="19" letter-spacing="2" fill="#8C929C">${under}</text>

  ${reasons.map((r, i) => `
  <rect x="64" y="${430 + i * 46}" width="${Math.min(1072, 26 + esc(r).length * 11)}" height="36" rx="8" fill="#FFFFFF" opacity=".05"/>
  <text x="80" y="${455 + i * 46}" font-family="sans-serif" font-size="19" fill="#C9CDD4">${esc(r)}</text>`).join("")}

  <line x1="64" y1="556" x2="1136" y2="556" stroke="#FFFFFF" opacity=".09"/>
  ${[["ENTRY MC", usd(row.entryMc)], ["NOW MC", usd(row.nowMc)],
     ["SCORE", `${row.score ?? 0}/100`],
     ["2× IN", row.secondsTo2x ? Math.round(row.secondsTo2x / 60) + "m" : "never"]]
    .map(([k, v], i) => `
  <text x="${64 + i * 190}" y="586" font-family="monospace" font-size="14" letter-spacing="2" fill="#585E68">${k}</text>
  <text x="${64 + i * 190}" y="612" font-family="monospace" font-size="25" font-weight="600" fill="#F3F4F6">${v}</text>`).join("")}

  <text x="1136" y="612" text-anchor="end" font-family="monospace" font-size="17" fill="#585E68">nekara.xyz/call/${row.seq ?? ""}</text>
  <text x="1136" y="586" text-anchor="end" font-family="monospace" font-size="13" letter-spacing="1" fill="#3E444C">${s.observed ? `${s.points} OBSERVED MARKS` : "ENTRY, PEAK AND NOW — NO SERIES KEPT"}</text>
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

/**
 * The marks the poller actually saw.
 *
 * The peak of a call is a value we observed, and a card that draws the route
 * to it as a curve invented between three points is publishing a shape nobody
 * recorded — with the top of the arc placed by Math.random(), so the same call
 * drew differently on every render. The register keeps a decimated series per
 * call and it is right here on the row.
 *
 * `observed` is false only for a row written before the series was kept, and
 * the caller is expected to say so rather than pass the fallback off as data.
 */
function series(row, { x, w, y, h }) {
  const e = row.entryMc || 1;
  const seen = Array.isArray(row.spark) && row.spark.length > 1 ? row.spark.slice() : null;
  const vals = seen ?? [e, row.peakMc || e, row.nowMc || e];

  // Scaled to what happened, not to what we were hoping for. Forcing the 2×
  // line into frame on a call that went to a tenth of entry flattens the whole
  // series into a stripe at the bottom — the shape a reader came for, thrown
  // away to make room for a threshold it never approached. The line is drawn
  // only when it lands inside the frame, and the caller checks that.
  const two = e * 2;
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo || hi || 1) * 0.12;
  const mn = lo - pad, mx = hi + pad;
  const X = i => x + (vals.length === 1 ? 0 : (i / (vals.length - 1)) * w);
  const Y = v => y + h - ((v - mn) / (mx - mn || 1)) * h;

  const pts = vals.map((v, i) => `${X(i).toFixed(1)} ${Y(v).toFixed(1)}`);
  return {
    observed: Boolean(seen),
    points: vals.length,
    line: "M" + pts.join("L"),
    // Closed back along the baseline, so the line can carry a wash under it.
    area: `M${X(0).toFixed(1)} ${(y + h).toFixed(1)}L` + pts.join("L") +
          `L${X(vals.length - 1).toFixed(1)} ${(y + h).toFixed(1)}Z`,
    twoY: Y(two).toFixed(1),
    twoInFrame: two >= mn && two <= mx,
    entryY: Y(e).toFixed(1),
  };
}

const sparkPath = row => series(row, { x: 64, y: 250, w: 1072, h: 130 }).line;

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
