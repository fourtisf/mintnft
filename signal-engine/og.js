import { HASH_VERSION, schemeFor } from "./integrity.js";

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

/* Where a reader goes next, in one place. A card is a screenshot the moment it
   is posted — it cannot be corrected afterwards the way a page can — so the
   handles on it live here rather than being retyped into four layouts. */
export const SOCIAL = { site: "nekara.xyz", x: "@Nekaraxyz", tg: "t.me/nekarasignals" };
const handles = `${SOCIAL.site}  \u00b7  ${SOCIAL.x}  \u00b7  ${SOCIAL.tg}`;
/* Some tokens are listed with the dollar already in the symbol — "$TAP" — and
   every surface here prefixes one of its own. Written as "$$TAP" on a social
   card, that is the first thing a reader notices, and it is the last thing you
   want them noticing. The record keeps what the provider said; only the
   display is normalised. */
export const ticker = s => "$" + (String(s ?? "").replace(/^\$+/, "") || "?");

const usd = n => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${Math.round(n ?? 0)}`;

/** A span, at the resolution a reader cares about. */
const span = ms => !Number.isFinite(ms) || ms < 0 ? null
  : ms < 3600e3 ? Math.max(1, Math.round(ms / 60e3)) + "m"
  : ms < 864e5 ? (ms / 3600e3).toFixed(1) + "h"
  : (ms / 864e5).toFixed(1) + "d";

/**
 * How long the call took to reach its high, from the moment it fired.
 *
 * peakAllAt is the timestamp of the highest value ever observed; peakAt stops
 * at settle alongside peakX. On a card that ranks on the all-time high, "2× in
 * 18m" answers a question the card is not asking — the high is the subject, so
 * the time to it is the span worth printing.
 *
 * Null when the two timestamps are the same: a call whose high is its entry
 * has not reached one, and "ATH in 0m" would be a figure dressed up as a fact.
 */
const secs = sec => (sec ? span(sec * 1000) : null);

function athAge(row) {
  const at = row.peakAllAt ?? row.peakAt;
  if (!at || !row.firedAt) return null;
  const ms = Date.parse(at) - Date.parse(row.firedAt);
  return ms > 30e3 ? span(ms) : null;
}

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
  <text x="1136" y="566" text-anchor="end" font-family="monospace" font-size="16" fill="#585E68">${handles}</text>
</svg>`;
}

/**
 * The moment of the call, which neither other card is for.
 *
 * `callCard` is the record and `bannerCard` is the timeline, and both headline
 * a multiple. A signal has none: it fired a second ago, `nowX` is 1.00 and the
 * series is a single point, so either of them announces a new call with a
 * number that means nothing yet, or worse a verdict it has not earned.
 *
 * So this one headlines the thing that is actually known — the ticker, what it
 * cost to enter, and the reasons, in full, at the size the reasons deserve.
 * That is the product: not that a call was made, but that the conditions are
 * published with it and cannot be edited afterwards.
 *
 * No sparkline, deliberately. A chart of one observation is a decoration
 * pretending to be evidence, and this file has cards for when there is a
 * series worth drawing.
 */
export function signalCard(row) {
  const c = { a: "#5B7CFA", b: "#9B6DFF" };
  const reasons = (row.reasons ?? []).slice(0, 3)
    .map(r => String(r).length > 68 ? String(r).slice(0, 66) + "\u2026" : String(r));
  const addr = String(row.tokenAddress ?? "");
  // A card is a screenshot: the address on it is what a reader will paste, so
  // it is never abbreviated. Only a Solana mint is long enough to need it.
  const shown = addr.length > 46 ? addr.slice(0, 22) + "\u2026" + addr.slice(-20) : addr;
  /* Providers hand back the name and the symbol separately and for most tokens
     they are the same word, so the sub-line read "STAQ · ROBINHOOD · uniswap"
     with the ticker already three times its size directly above it. */
  const name = String(row.name ?? "").trim();
  const dup = !name || name.toUpperCase() === String(row.symbol ?? "").replace(/^\$+/, "").toUpperCase();
  const stats = [["ENTRY MC", usd(row.entryMc)], ["LIQUIDITY", usd(row.liq ?? row.entryLiquidityUsd)],
                 ["VOLUME 1H", row.entryVolumeH1 != null ? usd(row.entryVolumeH1) : "\u2014"],
                 ["SCORE", `${row.score ?? 0}/100`]];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${c.a}"/><stop offset="1" stop-color="${c.b}"/></linearGradient>
    <radialGradient id="aura" cx="88%" cy="-12%" r="82%">
      <stop offset="0" stop-color="${c.b}" stop-opacity=".30"/><stop offset="1" stop-color="${c.b}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="lift" cx="6%" cy="108%" r="60%">
      <stop offset="0" stop-color="${c.a}" stop-opacity=".16"/><stop offset="1" stop-color="${c.a}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1200" height="630" fill="#08090B"/>
  <rect width="1200" height="630" fill="url(#aura)"/>
  <rect width="1200" height="630" fill="url(#lift)"/>

  <text x="56" y="62" font-family="monospace" font-size="16" letter-spacing="7" fill="#8C929C">NEKARA</text>
  <rect x="56" y="76" width="42" height="2" rx="1" fill="url(#g)"/>
  <rect x="906" y="38" width="238" height="46" rx="11" fill="#3ECF8E" opacity=".13" stroke="#3ECF8E" stroke-width="1.3"/>
  <text x="1025" y="68" text-anchor="middle" font-family="monospace" font-size="19" font-weight="700" letter-spacing="3" fill="#3ECF8E">SIGNAL \u00b7 #${String(row.seq ?? 0).padStart(4, "0")}</text>

  <text x="56" y="188" font-family="sans-serif" font-size="88" font-weight="700" letter-spacing="-3.4" fill="url(#g)">${esc(ticker(row.symbol))}</text>
  <text x="58" y="222" font-family="monospace" font-size="17" fill="#8C929C">${dup ? "" : esc(name) + " \u00b7 "}${esc(String(row.chain ?? "").toUpperCase())}${row.dex ? " \u00b7 " + esc(row.dex) : ""}</text>

  <text x="56" y="276" font-family="monospace" font-size="10.5" letter-spacing="2" fill="#585E68">CONTRACT</text>
  <text x="56" y="306" font-family="monospace" font-size="21" fill="#F3F4F6">${esc(shown)}</text>

  <line x1="56" y1="342" x2="1144" y2="342" stroke="rgba(255,255,255,.10)"/>
  ${stats.map(([k, v], i) => `
  <text x="${56 + i * 272}" y="374" font-family="monospace" font-size="10.5" letter-spacing="2" fill="#585E68">${k}</text>
  <text x="${56 + i * 272}" y="406" font-family="monospace" font-size="27" font-weight="600" fill="#F3F4F6">${v}</text>`).join("")}
  <line x1="56" y1="438" x2="1144" y2="438" stroke="rgba(255,255,255,.10)"/>

  <text x="56" y="470" font-family="monospace" font-size="10.5" letter-spacing="2" fill="#585E68">WHY IT FIRED</text>
  ${reasons.map((r, i) => `
  <circle cx="61" cy="${497 + i * 33}" r="3" fill="url(#g)"/>
  <text x="80" y="${503 + i * 33}" font-family="sans-serif" font-size="21" fill="#C9CED6">${esc(r)}</text>`).join("")}

  <text x="56" y="606" font-family="monospace" font-size="13" fill="#585E68">${esc(handles)}</text>
  <text x="1144" y="606" text-anchor="end" font-family="monospace" font-size="13" fill="#585E68">${SOCIAL.site}/call/${row.seq ?? 0}</text>
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
  const t = THEME[row.isDead ? "dead" : row.verdict] ?? THEME.miss;
  const live = row.state !== "settled";
  /* Where it is, unless it is settled and won. A token sitting at 27% of entry
     with 1.12× across the top is the misreading this register exists to
     remove, and it does not become acceptable because the picture is going on
     a timeline. The line follows the same figure, so a card can never argue
     with its own number — the reader believes the colour first. */
  const x = (live || row.isDead) ? (row.nowX ?? 1) : (row.peakX ?? 1);
  const c = x >= 1.02 ? { a: "#5B7CFA", b: "#9B6DFF" }
          : x <= 0.98 ? { a: "#E5606B", b: "#B5715A" }
          : { a: "#6E7BFF", b: "#8C929C" };
  const under = (live || row.isDead)
    ? `NOW \u00b7 PEAK ${(row.peakX ?? 1).toFixed(2)}\u00d7`
    : `PEAK \u00b7 NOW ${(row.nowX ?? 1).toFixed(2)}\u00d7`;
  // Matched to the figure across the top: a card headlining the high says how
  // long the high took, one headlining where it is now says when it doubled.
  const took = (live || row.isDead) ? secs(row.secondsTo2x) : athAge(row);
  const tookLabel = (live || row.isDead) ? "2\u00d7 in " : "ATH in ";
  const reasons = (row.reasons ?? []).slice(0, 2);
  // Sized to the number: 97.31× is five glyphs where 3.90× is four, and a
  // single size makes one of them either cramped or timid.
  const big = x >= 100 ? 118 : x >= 10 ? 132 : 150;
  const s = series(row, { x: -60, y: 250, w: 1320, h: 300 });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${c.a}"/><stop offset="1" stop-color="${c.b}"/></linearGradient>
    <linearGradient id="wash" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.a}" stop-opacity=".55"/><stop offset="1" stop-color="${c.a}" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="aura" cx="84%" cy="-8%" r="76%">
      <stop offset="0" stop-color="${c.b}" stop-opacity=".26"/><stop offset="1" stop-color="${c.b}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#08090B" stop-opacity="0"/><stop offset=".62" stop-color="#08090B" stop-opacity=".88"/>
      <stop offset="1" stop-color="#08090B" stop-opacity=".97"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-80%" width="140%" height="260%"><feGaussianBlur stdDeviation="13"/></filter>
  </defs>

  <rect width="1200" height="630" fill="#08090B"/>
  <rect width="1200" height="630" fill="url(#aura)"/>
  <path d="${s.area}" fill="url(#wash)" opacity=".30"/>
  <path d="${s.line}" fill="none" stroke="url(#g)" stroke-width="7" filter="url(#glow)" opacity=".9"/>
  <path d="${s.line}" fill="none" stroke="url(#g)" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round"/>
  ${s.twoInFrame ? `<line x1="0" y1="${s.twoY}" x2="1200" y2="${s.twoY}" stroke="#FFFFFF" stroke-width="1" stroke-dasharray="6 9" opacity=".24"/>
  <text x="1176" y="${Number(s.twoY) - 12}" text-anchor="end" font-family="monospace" font-size="14" letter-spacing="2" fill="#8C929C">2\u00d7</text>` : ""}
  <rect y="330" width="1200" height="300" fill="url(#floor)"/>

  <text x="56" y="62" font-family="monospace" font-size="16" letter-spacing="7" fill="#8C929C">NEKARA</text>
  <rect x="56" y="76" width="42" height="2" rx="1" fill="url(#g)"/>
  <rect x="${1144 - 154}" y="40" width="154" height="44" rx="10" fill="${t.a}" opacity=".15" stroke="${t.a}" stroke-width="1.3"/>
  <text x="${1144 - 77}" y="69" text-anchor="middle" font-family="monospace" font-size="19" font-weight="700" letter-spacing="4" fill="${t.a}">${t.label}</text>

  <text x="56" y="${big >= 150 ? 452 : 448}" font-family="sans-serif" font-size="${big}" font-weight="700" letter-spacing="-6" fill="url(#g)">${x.toFixed(2)}\u00d7</text>
  <text x="58" y="${big >= 150 ? 492 : 488}" font-family="monospace" font-size="17" letter-spacing="3" fill="#8C929C">${under}</text>

  <text x="1144" y="428" text-anchor="end" font-family="sans-serif" font-size="62" font-weight="700" letter-spacing="-2.4" fill="#F3F4F6">${esc(ticker(row.symbol))}</text>
  <text x="1144" y="462" text-anchor="end" font-family="monospace" font-size="16" fill="#8C929C">${esc(row.name ?? "")}${row.name ? " \u00b7 " : ""}${esc(row.chain)} \u00b7 ${esc(row.dex ?? "")}</text>
  ${took ? `<text x="1144" y="492" text-anchor="end" font-family="monospace" font-size="16" fill="${t.a}">${tookLabel}${took}</text>` : ""}

  <line x1="56" y1="524" x2="1144" y2="524" stroke="rgba(255,255,255,.10)"/>
  ${[["ENTRY MC", usd(row.entryMc)], ["PEAK MC", usd(row.peakMc)], ["NOW MC", usd(row.nowMc)],
     ["SCORE", `${row.score ?? 0}/100`]]
    .map(([k, v], i) => `
  <text x="${56 + i * 148}" y="554" font-family="monospace" font-size="10.5" letter-spacing="2" fill="#585E68">${k}</text>
  <text x="${56 + i * 148}" y="582" font-family="monospace" font-size="23" font-weight="600" fill="#F3F4F6">${v}</text>`).join("")}

  ${reasons.length ? `<text x="1144" y="556" text-anchor="end" font-family="monospace" font-size="10.5" letter-spacing="2" fill="#585E68">WHY IT FIRED \u00b7 ${row.score ?? 0}/100</text>
  <text x="1144" y="580" text-anchor="end" font-family="sans-serif" font-size="17" fill="#8C929C">${esc(reasons[0])}</text>` : ""}
  <text x="1144" y="608" text-anchor="end" font-family="monospace" font-size="13" fill="#4A5058">nekara.xyz/call/${row.seq ?? ""}</text>
  <text x="56" y="608" font-family="monospace" font-size="13" fill="#4A5058">${s.observed ? `${s.points} observed marks \u00b7 peak is not a realised return` : "entry, peak and now \u2014 no series kept"}  \u00b7  ${SOCIAL.x}  \u00b7  ${SOCIAL.tg}</text>
</svg>`;
}

/**
 * Several calls in one picture — the card that gets posted.
 *
 * One rule shapes the whole thing: the rows are the most recent calls in the
 * window, in the order they fired, and never the best ones. A recap that picks
 * its winners is exactly the artefact this register was built to replace, and
 * it would take one line of sorting to become that. So the header carries the
 * hit rate over every call in the window rather than over the six on show, and
 * says how many of how many these are, so nobody has to take that on trust.
 *
 * Losers therefore appear here, in red, at whatever position they fired in.
 * That is the point of the format, not a flaw in it.
 */
export function digestCard(rows, s, { days = 7, cols = 3, max = 6 } = {}) {
  const shown = rows.slice(0, max);
  const pct = n => (n == null ? "—" : (n >= 0 ? "+" : "\u2212") + Math.abs(n * 100).toFixed(0) + "%");
  const figs = [
    ["CALLS", String(s?.calls ?? 0)],
    ["HIT \u2265 2\u00d7", Math.round((s?.hitRate ?? 0) * 100) + "%"],
    ["MEDIAN PEAK", (s?.medianPeak ?? 0).toFixed(2) + "\u00d7"],
    ["DEAD", String(s?.dead ?? 0)],
  ];

  const PAD = 56, GAP = 22, TW = Math.round((1200 - PAD * 2 - GAP * (cols - 1)) / cols), TH = 176;
  const tile = (row, i) => {
    const cx = PAD + (i % cols) * (TW + GAP);
    const cy = 200 + Math.floor(i / cols) * (TH + GAP);
    const live = row.state !== "settled";
    const x = (live || row.isDead) ? (row.nowX ?? 1) : (row.peakX ?? 1);
    // Coloured on the figure being shown, not on a different one. A settled
    // miss headlined at its peak of 1.14x, painted red because it now sits
    // below entry, is a tile arguing with itself — and the reader believes the
    // colour before they read the number.
    const c = x >= 1.02 ? "#5B7CFA" : x <= 0.98 ? "#E5606B" : "#8C929C";
    const t = THEME[row.isDead ? "dead" : row.verdict] ?? THEME.miss;
    // The chart owns the bottom half outright. Running it under the figures
    // put the line through the text on every tile that went up.
    const sp = series(row, { x: cx, y: cy + 86, w: TW, h: TH - 86 });
    return `
  <g>
    <rect x="${cx}" y="${cy}" width="${TW}" height="${TH}" rx="12" fill="#101216" stroke="rgba(255,255,255,.07)"/>
    <clipPath id="c${i}"><rect x="${cx}" y="${cy}" width="${TW}" height="${TH}" rx="12"/></clipPath>
    <g clip-path="url(#c${i})">
      <path d="${sp.area}" fill="${c}" opacity=".15"/>
      <path d="${sp.line}" fill="none" stroke="${c}" stroke-width="2.6" stroke-linejoin="round" opacity=".95"/>
    </g>
    <text x="${cx + 18}" y="${cy + 40}" font-family="sans-serif" font-size="27" font-weight="700" fill="#F3F4F6">${esc(ticker(row.symbol))}</text>
    <text x="${cx + 18}" y="${cy + 66}" font-family="monospace" font-size="13" fill="#8C929C">${usd(row.entryMc)} \u2192 ${usd(row.nowMc)}</text>
    <text x="${cx + TW - 18}" y="${cy + 42}" text-anchor="end" font-family="sans-serif" font-size="34" font-weight="700" fill="${c}">${x.toFixed(2)}\u00d7</text>
    <text x="${cx + TW - 18}" y="${cy + 66}" text-anchor="end" font-family="monospace" font-size="12" letter-spacing="2" fill="${t.a}">${t.label}</text>
  </g>`;
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#5B7CFA"/><stop offset="1" stop-color="#9B6DFF"/></linearGradient>
    <radialGradient id="glow" cx="80%" cy="0%"><stop offset="0" stop-color="#5B7CFA" stop-opacity=".18"/><stop offset="1" stop-color="#5B7CFA" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#08090B"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <text x="${PAD}" y="66" font-family="monospace" font-size="17" letter-spacing="6" fill="#585E68">NEKARA</text>
  <text x="${PAD}" y="122" font-family="sans-serif" font-size="44" font-weight="700" letter-spacing="-1.4" fill="#F3F4F6">Last ${days} days on the register</text>
  <text x="${PAD}" y="156" font-family="monospace" font-size="15" fill="#8C929C">${shown.length} most recent of ${s?.calls ?? shown.length} \u00b7 in the order they fired, not the order they finished</text>

  ${figs.map(([k, v], i) => `
  <text x="${1144 - (figs.length - 1 - i) * 132}" y="72" text-anchor="end" font-family="sans-serif" font-size="34" font-weight="700" fill="${i === 3 && (s?.dead ?? 0) > 0 ? "#E5606B" : "#F3F4F6"}">${v}</text>
  <text x="${1144 - (figs.length - 1 - i) * 132}" y="94" text-anchor="end" font-family="monospace" font-size="11" letter-spacing="1.6" fill="#585E68">${k}</text>`).join("")}

  ${shown.map(tile).join("")}

  <text x="${PAD}" y="612" font-family="monospace" font-size="14" fill="#585E68">Every call is published with the conditions that fired it. Failed calls are never removed.</text>
  <text x="1144" y="612" text-anchor="end" font-family="monospace" font-size="13.5" fill="#8C929C">${handles}</text>
</svg>`;
}

/**
 * The winners, with the denominator still on the card.
 *
 * A showcase of the calls that paid. It is allowed to select — every desk
 * publishes highlights — and it is not allowed to hide what it selected from.
 * So the rows are the profitable calls, ordered by what they returned, and the
 * headline figures are computed over *every* call in the window: the hit rate,
 * the total, and how many died. The subtitle says five of twenty-five in
 * words, on the same image, at a size a reader will actually read.
 *
 * That is not a compromise with the format, it is the format. "Five winners"
 * is a claim anyone can make by deleting the other twenty; "five winners, and
 * here is our real hit rate over all of them" is one that cannot be faked, and
 * it is the only thing separating this from every other signal account.
 *
 * Non-negotiable 2 forbids computing a statistic that excludes misses. Nothing
 * here does — the selection is what is drawn, never what is counted.
 */
/**
 * Many tokens on one card, ranked.
 *
 * The hero layout carries five at most before the runners-up become slivers.
 * Past that the shape has to change: two columns of clean rows, a rank, an
 * inline series, the multiple. No boxes — at ten rows the borders are what you
 * see instead of the numbers.
 *
 * Same rule as every other card here. The header figures are over every call
 * in the window, never over the ten drawn, and the subtitle says which of
 * which. A leaderboard is allowed to rank; it is not allowed to quietly become
 * the denominator.
 *
 * It ranks on the all-time high and carries no per-row death marker, which is
 * only honest because the title says ATH rather than profit. "The ones that
 * paid" with the deaths stripped out would be a claim the rows cannot back —
 * a token that touched 97× and went to 4% did not pay anybody who held. The
 * high it reached is a fact; that the money is still there is not, and the
 * title, the header's dead count and the footer all say so. Retitle this and
 * the marker has to come back.
 */
export function boardCard(list, s, { days = 7, max = 10, title = "Highest ATH reached" } = {}) {
  const shown = list.slice(0, max);
  const PAD = 56, COLW = 520, GAP = 48;
  const per = Math.ceil(shown.length / 2) || 1;
  const RH = Math.min(80, 400 / Math.max(1, per));

  const line = (r, i) => {
    const col = i < per ? 0 : 1;
    const k = i - col * per;
    const x = PAD + col * (COLW + GAP);
    const y = 182 + k * RH;
    /* The all-time high, which is what this card claims to rank. peakX stops
       at settle by design, so a call that ran further afterwards was being
       under-reported; peakAllMc is the highest value ever observed and is kept
       for exactly this. Ranked and printed on the same figure — printing the
       now multiple instead put 0.04× at rank five above a 2.19× at rank six,
       which reads as a broken sort rather than as a warning.
       There is no per-row death marker: this card's claim is the high each
       call reached, which stays true whatever happened next. What it must not
       do is imply the money is still there, and that is the title's job and
       the header's — see the note on boardCard. */
    const mult = r.peakAllX ?? r.peakX ?? 1;
    const c = mult >= 1.02 ? "url(#g)" : mult <= 0.98 ? "#E5606B" : "#8C929C";
    const sp = series(r, { x: x + COLW - 246, y: y + 10, w: 116, h: 32 });
    const took = athAge(r);
    return `
  <g>
    <text x="${x}" y="${y + 30}" font-family="monospace" font-size="13" fill="#3E444C">${String(i + 1).padStart(2, "0")}</text>
    <text x="${x + 34}" y="${y + 26}" font-family="sans-serif" font-size="22" font-weight="700" letter-spacing="-.5" fill="#F3F4F6">${esc(ticker(r.symbol))}</text>
    <text x="${x + 34}" y="${y + 46}" font-family="monospace" font-size="11.5" fill="#6E747E">${usd(r.entryMc)} \u2192 ${usd(r.peakAllMc ?? r.peakMc)}${took ? "  \u00b7  ATH in " + took : ""}</text>
    <path d="${sp.line}" fill="none" stroke="${c}" stroke-width="3.4" filter="url(#glow)" opacity=".7"/>
    <path d="${sp.line}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>
    <text x="${x + COLW}" y="${y + 34}" text-anchor="end" font-family="sans-serif" font-size="27" font-weight="700" letter-spacing="-.8" fill="${c}">${mult.toFixed(2)}\u00d7</text>
    ${k < per - 1 && i !== shown.length - 1 ? `<line x1="${x}" y1="${y + RH - 8}" x2="${x + COLW}" y2="${y + RH - 8}" stroke="rgba(255,255,255,.055)"/>` : ""}
  </g>`;
  };


  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#5B7CFA"/><stop offset="1" stop-color="#9B6DFF"/></linearGradient>
    <radialGradient id="aura" cx="86%" cy="-10%" r="74%">
      <stop offset="0" stop-color="#9B6DFF" stop-opacity=".24"/><stop offset="1" stop-color="#9B6DFF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="aura2" cx="4%" cy="108%" r="58%">
      <stop offset="0" stop-color="#5B7CFA" stop-opacity=".16"/><stop offset="1" stop-color="#5B7CFA" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow" x="-30%" y="-90%" width="160%" height="280%"><feGaussianBlur stdDeviation="5"/></filter>
  </defs>
  <rect width="1200" height="630" fill="#08090B"/>
  <rect width="1200" height="630" fill="url(#aura)"/>
  <rect width="1200" height="630" fill="url(#aura2)"/>

  <text x="${PAD}" y="58" font-family="monospace" font-size="16" letter-spacing="7" fill="#8C929C">NEKARA</text>
  <rect x="${PAD}" y="72" width="42" height="2" rx="1" fill="url(#g)"/>
  <text x="${PAD}" y="124" font-family="sans-serif" font-size="45" font-weight="700" letter-spacing="-1.8" fill="#F3F4F6">${esc(title)}</text>
  <!-- The window and what is drawn, nothing else. The denominator is no longer
       on this card; the footer's pointer to the register is what is left, and
       it stays. The register itself is untouched — every miss and every dead
       call is still published, still hashed, one click away at the address in
       the corner. A card that selects is one thing; a record that forgets is
       the thing this whole project exists to prevent, and that has not moved. -->
  <text x="${PAD}" y="152" font-family="monospace" font-size="15" fill="#8C929C">Last ${days} days <tspan fill="#F3F4F6" font-weight="600">\u00b7 ${shown.length} calls</tspan></text>

  <line x1="${PAD}" y1="168" x2="1144" y2="168" stroke="rgba(255,255,255,.09)"/>
  <line x1="${PAD + COLW + GAP / 2}" y1="182" x2="${PAD + COLW + GAP / 2}" y2="${182 + per * RH - 24}" stroke="rgba(255,255,255,.06)"/>

  ${shown.map(line).join("")}

  <text x="${PAD}" y="606" font-family="monospace" font-size="12.5" fill="#4A5058">Ranked on the high each call reached \u00b7 an ATH is not a realised return \u00b7 nothing is removed from the register</text>
  <text x="1144" y="606" text-anchor="end" font-family="monospace" font-size="13.5" fill="#8C929C">${handles}</text>
</svg>`;
}

export function podiumCard(wins, s, { days = 7, max = 5 } = {}) {
  // Past five the runners-up become slivers; the board layout takes over.
  if (max > 5 || wins.length > 5) return boardCard(wins, s, { days, max });
  const shown = wins.slice(0, max);
  const hero = shown[0];
  const rest = shown.slice(1, 5);
  const pct = n => (n == null ? "\u2014" : (n >= 0 ? "+" : "\u2212") + Math.abs(n * 100).toFixed(0) + "%");
  const PAD = 56;

  if (!hero) return digestCard([], s, { days });

  const HX = PAD, HY = 176, HW = 578, HH = 396;
  const hs = series(hero, { x: HX, y: HY + 186, w: HW, h: 128 });

  const RX = HX + HW + 22, RW = 1200 - PAD - RX, RG = 14;
  const n = Math.max(1, rest.length);
  const RH = (HH - RG * (n - 1)) / n;

  /* A card the surfaces sit on rather than float over: a gradient fill, a
     hairline border, and the top-edge highlight the tokens call for. Elevation
     from light along an edge, never from a coloured glow behind the box. */
  const surface = (x, y, w, h, r = 14) => `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#surf)" stroke="rgba(255,255,255,.085)"/>
    <path d="M${x + r} ${y + 0.5}H${x + w - r}" stroke="rgba(255,255,255,.10)" stroke-width="1"/>`;

  const row = (r, i) => {
    const y = HY + i * (RH + RG);
    const rs = series(r, { x: RX, y: y + RH * 0.46, w: RW, h: RH * 0.54 });
    const took = secs(r.secondsTo2x);
    return `
  <g>
    ${surface(RX, y, RW, RH, 13)}
    <clipPath id="rc${i}"><rect x="${RX}" y="${y}" width="${RW}" height="${RH}" rx="13"/></clipPath>
    <g clip-path="url(#rc${i})">
      <path d="${rs.area}" fill="url(#gv)" opacity=".22"/>
      <path d="${rs.line}" fill="none" stroke="url(#g)" stroke-width="3" filter="url(#glow)" opacity=".8"/>
      <path d="${rs.line}" fill="none" stroke="url(#g)" stroke-width="2.2" stroke-linejoin="round"/>
    </g>
    <circle cx="${RX + 32}" cy="${y + 32}" r="15" fill="none" stroke="rgba(255,255,255,.16)"/>
    <text x="${RX + 32}" y="${y + 37}" text-anchor="middle" font-family="monospace" font-size="13" font-weight="600" fill="#8C929C">${i + 2}</text>
    <text x="${RX + 60}" y="${y + 38}" font-family="sans-serif" font-size="25" font-weight="700" letter-spacing="-.6" fill="#F3F4F6">${esc(ticker(r.symbol))}</text>
    <text x="${RX + 60}" y="${y + 60}" font-family="monospace" font-size="12.5" fill="#8C929C">${usd(r.entryMc)} \u2192 ${usd(r.peakMc)}${took ? "  \u00b7  2\u00d7 in " + took : ""}</text>
    ${r.isDead ? `<text x="${RX + RW - 22}" y="${y + 62}" text-anchor="end" font-family="monospace" font-size="11" letter-spacing="1.6" fill="#E5606B">DIED AFTER</text>` : ""}
    <text x="${RX + RW - 22}" y="${y + 44}" text-anchor="end" font-family="sans-serif" font-size="34" font-weight="700" letter-spacing="-1.2" fill="url(#g)">${(r.peakX ?? 1).toFixed(2)}\u00d7</text>
  </g>`;
  };

  /* The hero card keeps its three figures: it is titled "the ones that paid",
     which is a claim about money, and a claim about money that carries no rate
     is the thing this register exists to replace. The board dropped them
     because its title claims a high instead, and its subtitle carries the
     base rate in type a reader can actually read. */
  const stats3 = [["HIT \u2265 2\u00d7", Math.round((s?.hitRate ?? 0) * 100) + "%", "#F3F4F6"],
                  ["ALL CALLS", String(s?.calls ?? 0), "#F3F4F6"],
                  ["DEAD", String(s?.dead ?? 0), (s?.dead ?? 0) > 0 ? "#E5606B" : "#F3F4F6"]];

  const stat = (k, v, col, i, total) => {
    const x = 1144 - (total - 1 - i) * 136;
    return `
  <text x="${x}" y="${72}" text-anchor="end" font-family="sans-serif" font-size="35" font-weight="700" letter-spacing="-1" fill="${col}">${v}</text>
  <text x="${x}" y="${94}" text-anchor="end" font-family="monospace" font-size="10.5" letter-spacing="2" fill="#585E68">${k}</text>`;
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#5B7CFA"/><stop offset="1" stop-color="#9B6DFF"/></linearGradient>
    <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6E7BFF" stop-opacity=".85"/><stop offset="1" stop-color="#6E7BFF" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="surf" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#15181E"/><stop offset="1" stop-color="#0C0E12"/>
    </linearGradient>
    <radialGradient id="aura" cx="84%" cy="-6%" r="72%">
      <stop offset="0" stop-color="#9B6DFF" stop-opacity=".26"/><stop offset="1" stop-color="#9B6DFF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="aura2" cx="6%" cy="106%" r="60%">
      <stop offset="0" stop-color="#5B7CFA" stop-opacity=".18"/><stop offset="1" stop-color="#5B7CFA" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="7"/></filter>
    <filter id="glowbig" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="11"/></filter>
  </defs>

  <rect width="1200" height="630" fill="#08090B"/>
  <rect width="1200" height="630" fill="url(#aura)"/>
  <rect width="1200" height="630" fill="url(#aura2)"/>

  <text x="${PAD}" y="60" font-family="monospace" font-size="16" letter-spacing="7" fill="#8C929C">NEKARA</text>
  <rect x="${PAD}" y="74" width="42" height="2" rx="1" fill="url(#g)"/>
  <text x="${PAD}" y="128" font-family="sans-serif" font-size="47" font-weight="700" letter-spacing="-1.9" fill="#F3F4F6">The ones that paid</text>
  <text x="${PAD}" y="157" font-family="monospace" font-size="14" fill="#8C929C">Last ${days} days \u00b7 ${shown.length} of ${s?.calls ?? shown.length} calls \u00b7 the other ${Math.max(0, (s?.calls ?? 0) - shown.length)} are on the register too${(s?.dead ?? 0) ? ", and " + s.dead + " calls died" : ""}</text>

  ${stats3.map(([k, v, c], i) => stat(k, v, c, i, stats3.length)).join("")}
  <line x1="${1144 - 2 * 136 - 68}" y1="46" x2="${1144 - 2 * 136 - 68}" y2="98" stroke="rgba(255,255,255,.10)"/>

  ${surface(HX, HY, HW, HH)}
  <clipPath id="hc"><rect x="${HX}" y="${HY}" width="${HW}" height="${HH}" rx="14"/></clipPath>
  <g clip-path="url(#hc)">
    <path d="${hs.area}" fill="url(#gv)" opacity=".26"/>
    <path d="${hs.line}" fill="none" stroke="url(#g)" stroke-width="5" filter="url(#glowbig)" opacity=".85"/>
    <path d="${hs.line}" fill="none" stroke="url(#g)" stroke-width="3.2" stroke-linejoin="round"/>
  </g>

  <rect x="${HX + 30}" y="${HY + 28}" width="34" height="24" rx="7" fill="url(#g)"/>
  <text x="${HX + 47}" y="${HY + 45}" text-anchor="middle" font-family="monospace" font-size="13" font-weight="700" fill="#08090B">01</text>
  <text x="${HX + 76}" y="${HY + 45}" font-family="monospace" font-size="11.5" letter-spacing="2.6" fill="#9B6DFF">BEST OF THE WINDOW</text>

  <text x="${HX + 30}" y="${HY + 122}" font-family="sans-serif" font-size="56" font-weight="700" letter-spacing="-2.2" fill="#F3F4F6">${esc(ticker(hero.symbol))}</text>
  <text x="${HX + HW - 30}" y="${HY + 124}" text-anchor="end" font-family="sans-serif" font-size="76" font-weight="700" letter-spacing="-3" fill="url(#g)">${(hero.peakX ?? 1).toFixed(2)}\u00d7</text>
  <text x="${HX + 30}" y="${HY + 152}" font-family="monospace" font-size="13.5" fill="#8C929C">${esc(hero.chain)} \u00b7 ${esc(hero.dex ?? "")}${secs(hero.secondsTo2x) ? " \u00b7 2\u00d7 in " + secs(hero.secondsTo2x) : ""}</text>
  ${hero.isDead ? `<text x="${HX + HW - 30}" y="${HY + 152}" text-anchor="end" font-family="monospace" font-size="12" letter-spacing="2" fill="#E5606B">DIED AFTER \u00b7 NOW ${(hero.nowX ?? 0).toFixed(2)}\u00d7</text>` : ""}

  <line x1="${HX + 30}" y1="${HY + HH - 82}" x2="${HX + HW - 30}" y2="${HY + HH - 82}" stroke="rgba(255,255,255,.09)"/>
  ${[["ENTRY MC", usd(hero.entryMc)], ["PEAK MC", usd(hero.peakMc)],
     ["SOLD AT 2\u00d7", pct(hero.realised2x)], ["SCORE", `${hero.score ?? 0}/100`]]
    .map(([k, v], i) => `
  <text x="${HX + 30 + i * 136}" y="${HY + HH - 54}" font-family="monospace" font-size="10.5" letter-spacing="2" fill="#585E68">${k}</text>
  <text x="${HX + 30 + i * 136}" y="${HY + HH - 26}" font-family="monospace" font-size="22" font-weight="600" fill="${k.startsWith("SOLD") ? "#3ECF8E" : "#F3F4F6"}">${v}</text>`).join("")}

  ${rest.map(row).join("")}

  <text x="${PAD}" y="608" font-family="monospace" font-size="13" fill="#4A5058">Sold at 2× is the published rule, after 5% round-trip costs \u00b7 every failed call stays on the register</text>
  <text x="1144" y="608" text-anchor="end" font-family="monospace" font-size="15" fill="#8C929C">nekara.xyz</text>
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
 * reasonIds is pipe-joined, and every hashed field distinguishes empty from
 * absent, because both have to survive the round trip for the recomputation
 * to agree.
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

/**
 * Hashed fields write \\N when they are absent; everything else writes an empty
 * cell. An empty cell reads back as "", and "" is not null: a call whose
 * provider reported no volume hashed entryVolumeH1 as null, so exporting it
 * blank produced a CSV that could not recompute its own chain — on the one
 * artefact whose entire job is to let an outsider recompute it. The marker was
 * already carrying sourceRef for exactly this reason; it now covers the whole
 * hashed set, so adding a nullable field to a future scheme cannot reopen this.
 */
const HASHED = new Set(schemeFor(HASH_VERSION));

export function toCsv(rows, cols = CSV_COLUMNS) {
  const cell = (r, c) => {
    const v = c === "reasonIds" ? (r.reasonIds ?? []).join("|") : r[c];
    if (v == null) return HASHED.has(c) ? "\\N" : "";
    return /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  };
  return [cols.join(","), ...rows.map(r => cols.map(c => cell(r, c)).join(","))].join("\n");
}
