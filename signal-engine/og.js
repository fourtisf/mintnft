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
  const dur = sec => !sec ? null
    : sec < 3600 ? Math.round(sec / 60) + "m" : (sec / 3600).toFixed(1) + "h";
  const took = dur(row.secondsTo2x);
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
  ${took ? `<text x="1144" y="492" text-anchor="end" font-family="monospace" font-size="16" fill="${t.a}">2\u00d7 in ${took}</text>` : ""}

  <line x1="56" y1="524" x2="1144" y2="524" stroke="rgba(255,255,255,.10)"/>
  ${[["ENTRY MC", usd(row.entryMc)], ["PEAK MC", usd(row.peakMc)], ["NOW MC", usd(row.nowMc)],
     ["SCORE", `${row.score ?? 0}/100`]]
    .map(([k, v], i) => `
  <text x="${56 + i * 148}" y="554" font-family="monospace" font-size="10.5" letter-spacing="2" fill="#585E68">${k}</text>
  <text x="${56 + i * 148}" y="582" font-family="monospace" font-size="23" font-weight="600" fill="#F3F4F6">${v}</text>`).join("")}

  ${reasons.length ? `<text x="1144" y="556" text-anchor="end" font-family="monospace" font-size="10.5" letter-spacing="2" fill="#585E68">WHY IT FIRED \u00b7 ${row.score ?? 0}/100</text>
  <text x="1144" y="580" text-anchor="end" font-family="sans-serif" font-size="17" fill="#8C929C">${esc(reasons[0])}</text>` : ""}
  <text x="1144" y="608" text-anchor="end" font-family="monospace" font-size="13" fill="#4A5058">nekara.xyz/call/${row.seq ?? ""}</text>
  <text x="56" y="608" font-family="monospace" font-size="13" fill="#4A5058">${s.observed ? `${s.points} observed marks \u00b7 peak is not a realised return` : "entry, peak and now \u2014 no series kept"}</text>
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
  <text x="1144" y="612" text-anchor="end" font-family="monospace" font-size="15" fill="#8C929C">nekara.xyz</text>
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
 */
export function boardCard(list, s, { days = 7, max = 10, title = "The ones that paid" } = {}) {
  const shown = list.slice(0, max);
  const PAD = 56, COLW = 520, GAP = 48;
  const per = Math.ceil(shown.length / 2) || 1;
  const RH = Math.min(80, 400 / Math.max(1, per));
  const dur = sec => !sec ? null
    : sec < 3600 ? Math.round(sec / 60) + "m" : (sec / 3600).toFixed(1) + "h";

  const line = (r, i) => {
    const col = i < per ? 0 : 1;
    const k = i - col * per;
    const x = PAD + col * (COLW + GAP);
    const y = 182 + k * RH;
    /* Ranked on peak, so peak is the figure printed. Showing the now multiple
       on a dead row instead put 0.04× at rank five above a 2.19× at rank six,
       which reads as a broken sort rather than as a warning. The warning has
       its own line underneath, carrying the multiple it fell to. */
    const mult = r.peakX ?? 1;
    const now = r.nowX ?? 1;
    const c = mult >= 1.02 ? "url(#g)" : mult <= 0.98 ? "#E5606B" : "#8C929C";
    const fell = r.isDead ? `DIED AFTER \u00b7 NOW ${now.toFixed(2)}\u00d7`
               : now < 1 ? `NOW ${now.toFixed(2)}\u00d7` : null;
    const sp = series(r, { x: x + COLW - 246, y: y + 8, w: 116, h: 34 });
    const took = dur(r.secondsTo2x);
    return `
  <g>
    <text x="${x}" y="${y + 30}" font-family="monospace" font-size="13" fill="#3E444C">${String(i + 1).padStart(2, "0")}</text>
    <text x="${x + 34}" y="${y + 26}" font-family="sans-serif" font-size="22" font-weight="700" letter-spacing="-.5" fill="#F3F4F6">${esc(ticker(r.symbol))}</text>
    <text x="${x + 34}" y="${y + 46}" font-family="monospace" font-size="11.5" fill="#6E747E">${usd(r.entryMc)} \u2192 ${usd(r.peakMc)}${took ? "  \u00b7  2\u00d7 in " + took : ""}</text>
    <path d="${sp.line}" fill="none" stroke="${c}" stroke-width="3.4" filter="url(#glow)" opacity=".7"/>
    <path d="${sp.line}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>
    <text x="${x + COLW}" y="${y + 34}" text-anchor="end" font-family="sans-serif" font-size="27" font-weight="700" letter-spacing="-.8" fill="${c}">${mult.toFixed(2)}\u00d7</text>
    ${fell ? `<text x="${x + COLW}" y="${y + 50}" text-anchor="end" font-family="monospace" font-size="9.5" letter-spacing="1.3" fill="${r.isDead ? "#E5606B" : "#8C929C"}">${fell}</text>` : ""}
    ${k < per - 1 && i !== shown.length - 1 ? `<line x1="${x}" y1="${y + RH - 8}" x2="${x + COLW}" y2="${y + RH - 8}" stroke="rgba(255,255,255,.055)"/>` : ""}
  </g>`;
  };

  const stats3 = [["HIT \u2265 2\u00d7", Math.round((s?.hitRate ?? 0) * 100) + "%", "#F3F4F6"],
                  ["ALL CALLS", String(s?.calls ?? 0), "#F3F4F6"],
                  ["DEAD", String(s?.dead ?? 0), (s?.dead ?? 0) > 0 ? "#E5606B" : "#F3F4F6"]];

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
  <text x="${PAD}" y="152" font-family="monospace" font-size="13.5" fill="#8C929C">Last ${days} days \u00b7 ${shown.length} of ${s?.calls ?? shown.length} calls \u00b7 the rest are on the register too${(s?.dead ?? 0) ? ", and " + s.dead + " died" : ""}</text>

  ${stats3.map(([k, v, c], i) => `
  <text x="${1144 - (2 - i) * 136}" y="70" text-anchor="end" font-family="sans-serif" font-size="35" font-weight="700" letter-spacing="-1" fill="${c}">${v}</text>
  <text x="${1144 - (2 - i) * 136}" y="92" text-anchor="end" font-family="monospace" font-size="10.5" letter-spacing="2" fill="#585E68">${k}</text>`).join("")}

  <line x1="${PAD}" y1="166" x2="1144" y2="166" stroke="rgba(255,255,255,.09)"/>
  <line x1="${PAD + COLW + GAP / 2}" y1="182" x2="${PAD + COLW + GAP / 2}" y2="${182 + per * RH - 24}" stroke="rgba(255,255,255,.06)"/>

  ${shown.map(line).join("")}

  <text x="${PAD}" y="606" font-family="monospace" font-size="12.5" fill="#4A5058">Ranked on peak \u00b7 sold at 2× is the published rule \u00b7 every failed call stays on the register</text>
  <text x="1144" y="606" text-anchor="end" font-family="monospace" font-size="14" fill="#8C929C">nekara.xyz</text>
</svg>`;
}

export function podiumCard(wins, s, { days = 7, max = 5 } = {}) {
  // Past five the runners-up become slivers; the board layout takes over.
  if (max > 5 || wins.length > 5) return boardCard(wins, s, { days, max });
  const shown = wins.slice(0, max);
  const hero = shown[0];
  const rest = shown.slice(1, 5);
  const pct = n => (n == null ? "\u2014" : (n >= 0 ? "+" : "\u2212") + Math.abs(n * 100).toFixed(0) + "%");
  const dur = sec => !sec ? null
    : sec < 3600 ? Math.round(sec / 60) + "m" : (sec / 3600).toFixed(1) + "h";
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
    const took = dur(r.secondsTo2x);
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

  const stat = (k, v, col, i, total) => {
    const x = 1144 - (total - 1 - i) * 136;
    return `
  <text x="${x}" y="${72}" text-anchor="end" font-family="sans-serif" font-size="35" font-weight="700" letter-spacing="-1" fill="${col}">${v}</text>
  <text x="${x}" y="${94}" text-anchor="end" font-family="monospace" font-size="10.5" letter-spacing="2" fill="#585E68">${k}</text>`;
  };
  const stats3 = [["HIT \u2265 2\u00d7", Math.round((s?.hitRate ?? 0) * 100) + "%", "#F3F4F6"],
                  ["ALL CALLS", String(s?.calls ?? 0), "#F3F4F6"],
                  ["DEAD", String(s?.dead ?? 0), (s?.dead ?? 0) > 0 ? "#E5606B" : "#F3F4F6"]];

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
  <text x="${HX + 30}" y="${HY + 152}" font-family="monospace" font-size="13.5" fill="#8C929C">${esc(hero.chain)} \u00b7 ${esc(hero.dex ?? "")}${dur(hero.secondsTo2x) ? " \u00b7 2\u00d7 in " + dur(hero.secondsTo2x) : ""}</text>
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
