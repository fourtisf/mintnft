/**
 * The rules.
 *
 * Two stages, on purpose:
 *
 *   GATES   hard vetoes. Any single failure kills the signal, no matter how
 *           good everything else looks. These exist to avoid losses, not to
 *           find winners.
 *
 *   SCORE   weighted evidence. Needs to clear a threshold to fire.
 *
 * Every rule returns a sentence in plain language. Those sentences get
 * published next to the call, so a reader can judge the reasoning instead of
 * being asked to trust it — and so we can later measure which reasons
 * actually correlate with a win.
 */

export const CONFIG = {
  minLiquidityUsd: 15_000,
  minAgeMinutes: 20,          // the first minutes belong to snipers
  maxAgeHours: 72,
  minMarketCap: 30_000,
  maxMarketCap: 2_000_000,    // above this our own group can't move it, and won't
  minLiqToMcRatio: 0.04,      // thin liquidity against a big cap is an exit trap
  maxSellPressure: 2.2,       // h1 sells vs buys
  maxRecentPumpPct: 60,       // never buy something already vertical on 5m
  scoreToFire: 60,
  cooldownHours: 24,          // one signal per token per day
  quoteWhitelist: ["SOL", "WETH", "ETH", "WBNB", "BNB", "USDC", "USDT"],
};

const pct = n => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const usd = n => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M`
              : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${Math.round(n)}`;

/* ─────────────────────────── gates ─────────────────────────── */

export const GATES = [
  {
    id: "liquidity_floor",
    check: (p, c) => (p.liquidity?.usd ?? 0) >= c.minLiquidityUsd,
    fail: (p, c) => `Liquidity ${usd(p.liquidity?.usd ?? 0)} is under the ${usd(c.minLiquidityUsd)} floor`,
  },
  {
    id: "age_window",
    check: (p, c) => {
      const min = (Date.now() - (p.pairCreatedAt ?? 0)) / 60000;
      return min >= c.minAgeMinutes && min <= c.maxAgeHours * 60;
    },
    fail: (p, c) => {
      const min = (Date.now() - (p.pairCreatedAt ?? 0)) / 60000;
      return min < c.minAgeMinutes
        ? `Only ${min.toFixed(0)}m old — inside the sniper window`
        : `${(min / 60).toFixed(0)}h old — past the window we track`;
    },
  },
  {
    id: "cap_window",
    check: (p, c) => {
      const mc = p.marketCap ?? p.fdv ?? 0;
      return mc >= c.minMarketCap && mc <= c.maxMarketCap;
    },
    fail: (p, c) => {
      const mc = p.marketCap ?? p.fdv ?? 0;
      return mc < c.minMarketCap
        ? `Market cap ${usd(mc)} is below ${usd(c.minMarketCap)}`
        : `Market cap ${usd(mc)} is above the ${usd(c.maxMarketCap)} ceiling`;
    },
  },
  {
    id: "liquidity_ratio",
    check: (p, c) => {
      const mc = p.marketCap ?? p.fdv ?? 0;
      return mc > 0 && (p.liquidity?.usd ?? 0) / mc >= c.minLiqToMcRatio;
    },
    fail: (p, c) => {
      const mc = p.marketCap ?? p.fdv ?? 1;
      return `Liquidity is only ${(((p.liquidity?.usd ?? 0) / mc) * 100).toFixed(1)}% of cap — too thin to exit`;
    },
  },
  {
    id: "sell_pressure",
    check: (p, c) => {
      const t = p.txns?.h1;
      if (!t) return false;
      return t.buys > 0 && t.sells / Math.max(t.buys, 1) <= c.maxSellPressure;
    },
    fail: p => {
      const t = p.txns?.h1 ?? { buys: 0, sells: 0 };
      return `Selling into it — ${t.sells} sells against ${t.buys} buys in the last hour`;
    },
  },
  {
    id: "not_vertical",
    check: (p, c) => (p.priceChange?.m5 ?? 0) <= c.maxRecentPumpPct,
    fail: p => `Already ${pct(p.priceChange?.m5 ?? 0)} in five minutes — this is the top, not the entry`,
  },
  {
    id: "has_identity",
    check: p => (p.info?.socials?.length ?? 0) > 0 || (p.info?.websites?.length ?? 0) > 0,
    fail: () => `No socials and no site — nothing behind the ticker`,
  },
  {
    id: "sane_quote",
    check: (p, c) => c.quoteWhitelist.includes((p.quoteToken?.symbol ?? "").toUpperCase()),
    fail: p => `Quoted in ${p.quoteToken?.symbol ?? "an unknown token"}, not a major`,
  },
];

/* ─────────────────────────── score ─────────────────────────── */

export const SIGNALS = [
  {
    id: "volume_acceleration",
    max: 26,
    run: p => {
      const m5 = p.volume?.m5 ?? 0, h1 = p.volume?.h1 ?? 0;
      if (h1 <= 0) return null;
      const ratio = (m5 * 12) / h1;              // 5m pace vs the hour's pace
      if (ratio < 1.4) return null;
      const pts = Math.min(26, Math.round((ratio - 1.4) * 18));
      return { pts, why: `Volume running ${ratio.toFixed(1)}× the hourly pace` };
    },
  },
  {
    id: "buy_pressure",
    max: 22,
    run: p => {
      const t = p.txns?.m5;
      if (!t || t.buys + t.sells < 8) return null;
      const share = t.buys / (t.buys + t.sells);
      if (share < 0.6) return null;
      return {
        pts: Math.min(22, Math.round((share - 0.6) * 70)),
        why: `${(share * 100).toFixed(0)}% of the last ${t.buys + t.sells} trades were buys`,
      };
    },
  },
  {
    id: "trader_growth",
    max: 18,
    run: p => {
      const m5 = (p.txns?.m5?.buys ?? 0) + (p.txns?.m5?.sells ?? 0);
      const h1 = (p.txns?.h1?.buys ?? 0) + (p.txns?.h1?.sells ?? 0);
      if (h1 < 12) return null;
      const ratio = (m5 * 12) / h1;
      if (ratio < 1.3) return null;
      return {
        pts: Math.min(18, Math.round((ratio - 1.3) * 14)),
        why: `Trade count accelerating ${ratio.toFixed(1)}× against the hour`,
      };
    },
  },
  {
    id: "steady_climb",
    max: 14,
    run: p => {
      const m5 = p.priceChange?.m5 ?? 0, h1 = p.priceChange?.h1 ?? 0;
      if (m5 <= 2 || h1 <= 0) return null;
      if (m5 > 35) return null;                  // a spike is not a climb
      return { pts: Math.min(14, Math.round(m5 * 0.5 + h1 * 0.12)),
               why: `Climbing steadily — ${pct(m5)} on 5m, ${pct(h1)} on the hour` };
    },
  },
  {
    id: "depth",
    max: 12,
    run: (p, c) => {
      const liq = p.liquidity?.usd ?? 0;
      if (liq < c.minLiquidityUsd * 2) return null;
      return { pts: Math.min(12, Math.round(Math.log10(liq / c.minLiquidityUsd) * 22)),
               why: `Liquidity ${usd(liq)} — deep enough to get back out` };
    },
  },
  {
    id: "sweet_spot_age",
    max: 8,
    run: p => {
      const h = (Date.now() - (p.pairCreatedAt ?? 0)) / 3600000;
      if (h < 1 || h > 10) return null;
      return { pts: 8, why: `${h.toFixed(1)}h old — past the snipers, before the crowd` };
    },
  },
  {
    id: "paid_attention",
    max: 6,
    run: p => {
      const b = p.boosts?.active ?? 0;
      if (!b) return null;
      return { pts: Math.min(6, b), why: `${b} active boosts — someone is paying for eyes on it` };
    },
  },
];

/* ─────────────────────────── evaluation ─────────────────────────── */

export function evaluate(pair, cfg = CONFIG, seen = new Map()) {
  const key = `${pair.chainId}:${pair.baseToken?.address}`;
  const last = seen.get(key);
  if (last && Date.now() - last < cfg.cooldownHours * 3600000) {
    return { fire: false, score: 0, reasons: [], vetoes: ["Already signalled in the last 24h"], key };
  }

  const vetoes = [];
  for (const g of GATES) {
    let ok = false;
    try { ok = g.check(pair, cfg); } catch { ok = false; }
    if (!ok) vetoes.push(g.fail(pair, cfg));
  }
  if (vetoes.length) return { fire: false, score: 0, reasons: [], vetoes, key };

  let score = 0;
  const reasons = [];
  for (const s of SIGNALS) {
    let r = null;
    try { r = s.run(pair, cfg); } catch { r = null; }
    if (r) { score += r.pts; reasons.push({ id: s.id, pts: r.pts, why: r.why }); }
  }

  reasons.sort((a, b) => b.pts - a.pts);
  return { fire: score >= cfg.scoreToFire, score, reasons, vetoes: [], key };
}

/** What actually gets written to the register. */
export function toSignal(pair, ev) {
  return {
    chain: pair.chainId,
    tokenAddress: pair.baseToken.address,
    pairAddress: pair.pairAddress,
    symbol: pair.baseToken.symbol,
    name: pair.baseToken.name,
    imageUrl: pair.info?.imageUrl ?? null,
    dex: pair.dexId,
    firedAt: new Date().toISOString(),
    entryPriceUsd: Number(pair.priceUsd ?? 0),
    entryMc: pair.marketCap ?? pair.fdv ?? 0,
    liquidityUsd: pair.liquidity?.usd ?? 0,
    score: ev.score,
    reasons: ev.reasons.map(r => r.why),
    reasonIds: ev.reasons.map(r => r.id),
  };
}
