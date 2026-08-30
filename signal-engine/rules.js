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

import { HASH_VERSION } from "./integrity.js";

/**
 * Env overrides. .env.example has documented SCORE_TO_FIRE and friends since
 * the beginning and nothing read them, so setting one changed nothing — the
 * worst kind of knob. An empty variable falls back rather than reading as 0.
 */
const num = (name, dflt) => {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return dflt;
  const v = Number(raw);
  return Number.isFinite(v) ? v : dflt;
};

export const CONFIG = {
  minLiquidityUsd: num("MIN_LIQUIDITY_USD", 15_000),
  minAgeMinutes: 20,          // the first minutes belong to snipers
  maxAgeHours: 72,
  minMarketCap: 30_000,
  maxMarketCap: num("MAX_MARKET_CAP", 2_000_000), // above this our own group can't move it
  minLiqToMcRatio: 0.04,      // thin liquidity against a big cap is an exit trap
  maxSellPressure: 2.2,       // h1 sells vs buys
  maxRecentPumpPct: 60,       // never buy something already vertical on 5m
  // 76 of a 134 maximum. The flow rules below added 28 points of headroom, and
  // leaving the threshold at its old 60 would have quietly dropped the bar from
  // 57% of maximum to 45% — a looser filter dressed up as a stricter one.
  scoreToFire: num("SCORE_TO_FIRE", 76),
  cooldownHours: 24,          // one signal per token per day

  // ── flow shape ────────────────────────────────────────────────────────
  // Dexscreener publishes no wallet addresses, so none of this is smart-money
  // tracking. It is the closest thing the data supports: how big the average
  // clip is, and whether the bid is building or fading. Reasoned, not measured
  // — same caveat as every weight below. analytics.js is what settles them.
  minAvgTradeUsd: num("MIN_AVG_TRADE_USD", 50), // under this the flow is dust
  minTradesToJudgeSize: 20,   // do not call a quiet token dusty on 4 trades
  washMinTrades: 400,         // manufactured volume: heavy activity ...
  washMinTurnover: 1.5,       //   ... turning over more than the pool holds ...
  washMaxPricePct: 3,         //   ... and the price does not move
  maxBidFadePct: 18,          // m5 buy share this far under h1 = the bid is leaving
  sizeFloorUsd: num("SIZE_FLOOR_USD", 250), // a $250 average clip on a sub-$2M cap is size
  minSustainedBuyShare: 0.55, // buying that holds across h1 and h6
  quoteWhitelist: ["SOL", "WETH", "ETH", "WBNB", "BNB", "USDC", "USDT"],
};

const pct = n => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const usd = n => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M`
              : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${Math.round(n)}`;

/* ───────────────────── market cap, computed not trusted ─────────────────────

   Never store a provider's marketCap field. Providers disagree on what it
   means and change the definition without notice, which makes every verdict
   built on it unreproducible.

   Dexscreener publishes no supply, so supply is derived once from the figures
   it does publish and then frozen on the call. Every later observation is
   price x that frozen supply, so peakX is a pure price ratio and a provider
   redefining its cap mid-flight cannot move a verdict that is already on the
   register.

   marketCap is preferred over fdv because the gates below were tuned against
   circulating cap; switching the basis would silently retune every threshold.
   Whichever is used is recorded in entrySupplySource, so a reader can see
   exactly how the denominator was arrived at. Wire a real totalSupply source
   and this derivation goes away without the stored records changing meaning.
*/

export function deriveSupply(pair) {
  const price = Number(pair.priceUsd ?? 0);
  if (!(price > 0) || !Number.isFinite(price)) return null;
  for (const [field, source] of [["marketCap", "dexscreener:marketCap/priceUsd"],
                                 ["fdv", "dexscreener:fdv/priceUsd"]]) {
    const cap = Number(pair[field] ?? 0);
    if (cap > 0 && Number.isFinite(cap)) {
      const supply = Math.round(cap / price);
      if (supply > 0 && Number.isFinite(supply)) return { price, supply, source };
    }
  }
  return null;
}

/** Market cap for screening, on the same basis the call will be frozen at. */
export function marketCapOf(pair) {
  const d = deriveSupply(pair);
  return d ? d.price * d.supply : 0;
}

/* ───────────────────── flow shape ─────────────────────

   There is no such thing as smart-money filtering on this data. Dexscreener
   returns aggregates — counts, volume, price change — and not one wallet
   address, so who is buying is simply not in the response.

   What is in the response is the size of the average clip. A token doing
   $40,000 across 400 trades is being traded by something quite different from
   one doing $40,000 across 25, and that difference is the honest proxy for
   whether real size is involved. It was going unused entirely.
*/

export function flow(pair, window = "h1") {
  const t = pair.txns?.[window];
  const vol = Number(pair.volume?.[window] ?? 0);
  if (!t) return null;
  const buys = Number(t.buys ?? 0), sells = Number(t.sells ?? 0);
  const trades = buys + sells;
  if (!trades) return null;
  return {
    trades, buys, sells, volume: vol,
    avgTradeUsd: vol / trades,
    buyShare: buys / trades,
  };
}

/* ─────────────────────────── gates ─────────────────────────── */

export const GATES = [
  {
    id: "priceable",
    check: p => deriveSupply(p) !== null,
    fail: () => "No usable price or supply — market cap cannot be computed, so entry is unmeasurable",
  },
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
      const mc = marketCapOf(p);
      return mc >= c.minMarketCap && mc <= c.maxMarketCap;
    },
    fail: (p, c) => {
      const mc = marketCapOf(p);
      return mc < c.minMarketCap
        ? `Market cap ${usd(mc)} is below ${usd(c.minMarketCap)}`
        : `Market cap ${usd(mc)} is above the ${usd(c.maxMarketCap)} ceiling`;
    },
  },
  {
    id: "liquidity_ratio",
    check: (p, c) => {
      const mc = marketCapOf(p);
      return mc > 0 && (p.liquidity?.usd ?? 0) / mc >= c.minLiqToMcRatio;
    },
    fail: (p, c) => {
      const mc = marketCapOf(p) || 1;
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
  {
    id: "dust_flow",
    check: (p, c) => {
      const f = flow(p, "h1");
      if (!f || f.trades < c.minTradesToJudgeSize) return true;   // too few to judge
      return f.avgTradeUsd >= c.minAvgTradeUsd;
    },
    fail: (p, c) => {
      const f = flow(p, "h1");
      return `Average trade is $${(f?.avgTradeUsd ?? 0).toFixed(0)} across ${f?.trades ?? 0} trades — dust, not money`;
    },
  },
  {
    // Not a size test — dust_flow already covers small clips. This is the other
    // shape: real volume, plenty of it, and a price that refuses to move. Money
    // going in and straight back out is the fingerprint of volume bought to
    // look like interest.
    id: "wash_pattern",
    check: (p, c) => {
      const f = flow(p, "h1");
      const liq = p.liquidity?.usd ?? 0;
      if (!f || liq <= 0) return true;
      const flat = Math.abs(p.priceChange?.h1 ?? 0) < c.washMaxPricePct;
      const turnover = f.volume / liq;
      return !(f.trades >= c.washMinTrades && turnover >= c.washMinTurnover && flat);
    },
    fail: p => {
      const f = flow(p, "h1");
      const turnover = f.volume / (p.liquidity?.usd ?? 1);
      return `${f.trades} trades turned over ${turnover.toFixed(1)}× the pool and the price barely moved — manufactured volume`;
    },
  },
  {
    id: "fading_bid",
    check: (p, c) => {
      const m5 = flow(p, "m5"), h1 = flow(p, "h1");
      if (!m5 || !h1 || m5.trades < 8) return true;
      return m5.buyShare >= h1.buyShare - c.maxBidFadePct / 100;
    },
    fail: p => {
      const m5 = flow(p, "m5"), h1 = flow(p, "h1");
      return `Bid is fading — ${(m5.buyShare * 100).toFixed(0)}% buys on 5m against ${(h1.buyShare * 100).toFixed(0)}% on the hour`;
    },
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
  {
    id: "size_conviction",
    max: 16,
    run: (p, c) => {
      const f = flow(p, "m5") ?? flow(p, "h1");
      if (!f || f.trades < 6 || f.avgTradeUsd < c.sizeFloorUsd) return null;
      const pts = Math.min(16, Math.round(Math.log2(f.avgTradeUsd / c.sizeFloorUsd) * 9));
      if (pts <= 0) return null;
      return { pts, why: `Average buy is $${f.avgTradeUsd.toFixed(0)} — size, not retail dust` };
    },
  },
  {
    id: "sustained_accumulation",
    max: 12,
    run: (p, c) => {
      const h1 = flow(p, "h1"), h6 = flow(p, "h6");
      if (!h1 || !h6) return null;
      if (h1.buyShare < c.minSustainedBuyShare || h6.buyShare < c.minSustainedBuyShare) return null;
      const pts = Math.min(12, Math.round((Math.min(h1.buyShare, h6.buyShare) - c.minSustainedBuyShare) * 90));
      if (pts <= 0) return null;
      return { pts, why: `Buying has held for hours — ${(h6.buyShare * 100).toFixed(0)}% buys across 6h` };
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

/**
 * What actually gets written to the register.
 *
 * callerId is explicit rather than implied. The register is multi-caller from
 * day one — the house desk is just caller 1 — and a call with no author on it
 * is a call that can be reattributed later.
 */
export function toSignal(pair, ev, { callerId = 1, sourceKind = "screener", sourceRef = null } = {}) {
  const d = deriveSupply(pair);
  if (!d) throw new Error("toSignal called on a pair with no usable price or supply");
  return {
    hashVersion: HASH_VERSION,
    callerId,
    chain: pair.chainId,
    tokenAddress: pair.baseToken.address,
    pairAddress: pair.pairAddress,
    symbol: pair.baseToken.symbol,
    name: pair.baseToken.name,
    imageUrl: pair.info?.imageUrl ?? null,
    dex: pair.dexId,
    firedAt: new Date().toISOString(),
    entryPriceUsd: d.price,
    entrySupply: d.supply,
    entryMc: d.price * d.supply,
    entrySupplySource: d.source,
    liquidityUsd: pair.liquidity?.usd ?? 0,
    score: ev.score,
    reasons: ev.reasons.map(r => r.why),
    reasonIds: ev.reasons.map(r => r.id),
    sourceKind,
    sourceRef,
  };
}
