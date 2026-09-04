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

/**
 * A comma-separated env list. Empty on purpose means "no restriction", which is
 * a different answer from unset, so both have to be expressible.
 */
const list = (name, dflt) => {
  const raw = process.env[name];
  if (raw == null) return dflt;
  return String(raw).split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
};

export const CONFIG = {
  /* Which chains this desk fires on. Robinhood Chain, on the owner's
     instruction — this is a Robinhood desk, not a multi-chain desk that also
     looks there. It is a narrow filter and the cost is real: a chain refused
     here never appears in Triage, so nothing that was refused can be argued
     about afterwards. That is the trade being made deliberately, not a
     side effect. CHAINS= (empty) opens it back up to everything, a list
     narrows or widens it, and the startup log prints which is in force. */
  chains: list("CHAINS", ["robinhood"]),
  minLiquidityUsd: num("MIN_LIQUIDITY_USD", 15_000),
  minAgeMinutes: 20,          // the first minutes belong to snipers
  maxAgeHours: 72,
  // Settable, because its sibling always was and the pair of them decides the
  // whole size band. A desk moved to a younger chain finds its floor is the
  // gate refusing everything, and that must be answerable without a deploy.
  minMarketCap: num("MIN_MARKET_CAP", 30_000),
  maxMarketCap: num("MAX_MARKET_CAP", 2_000_000), // above this our own group can't move it
  minLiqToMcRatio: 0.04,      // thin liquidity against a big cap is an exit trap
  maxSellPressure: 2.2,       // h1 sells vs buys
  maxRecentPumpPct: 60,       // never buy something already vertical on 5m
  // The same question over the hour, which the 5m arm cannot see. A win here
  // is 2×. A token already up 100% on the hour has made that move without us,
  // and entering now asks the next buyer for a 4× from where the hour began.
  // $APEC fired at +4.5% on 5m with +126% on the hour and was dead inside it.
  maxHourPumpPct: num("MAX_HOUR_PUMP_PCT", 100),
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
  steadyHourCapPct: 30,       // past this an hour is a move, not a climb
  /* What a pair may be quoted in. This is a per-chain fact, not a threshold,
     and hardcoding it is what went wrong: the list was written for Solana,
     Base, BSC and Ethereum, so on Robinhood Chain it refused pairs quoted in
     USDG — the chain's own native stablecoin, 68% of the stablecoin supply
     there and the default dollar asset of every application on it. The gate
     was reading the most normal quote on the chain as an exotic one.
     Settable now, because the next chain will have its own. */
  quoteWhitelist: list("QUOTE_WHITELIST",
    ["SOL", "WETH", "ETH", "WBNB", "BNB", "USDC", "USDT", "USDG"]).map(s => s.toUpperCase()),

  /* What this desk refuses to *call*, as opposed to what it accepts as money.
     The two lists were the same idea pointed opposite ways and only one of them
     existed: quoteWhitelist says what a pair may be priced in, and nothing said
     what a pair may be priced *on*.

     That was harmless while the desk was on Solana and Base, where the feeds
     only ever surface memecoins. Robinhood Chain is not that: its flagship
     assets are tokenized US equities, deployed as ordinary ERC-20s with the
     literal ticker as the symbol — TSLA, NVDA, SPY, SPCX — trading in DEX pools
     against USDG, on the same chain, through the same feeds. To every rule in
     this file NVDA/USDG and a memecoin pair are the same shape. A register that
     called a 3% drift in NVDA a signal would be a different product, and a
     worse one.

     Three groups, and they are not equally strong:
       - Anything in quoteWhitelist, folded in below. If we call it money we do
         not also call it a bet. Complete and factual.
       - Stablecoins and wrapped natives. Complete enough: the set is small,
         well known, and does not turn over.
       - Tokenized equities. **Incomplete by construction** — Robinhood lists
         new tickers whenever it chooses, and no list written here stays right.
         Only the four confirmed live are shipped; DENY_BASE_SYMBOLS is how the
         rest get added, and gap 4c in CLAUDE.md says what would actually close
         it. A gate that catches TSLA and misses ORCL must not be read as a gate
         that catches stocks. */
  denyBaseSymbols: list("DENY_BASE_SYMBOLS", [
    // stablecoins
    "USDG", "USDC", "USDT", "DAI", "USDE", "USDS", "PYUSD", "FRAX", "TUSD",
    "BUSD", "USDP", "GUSD", "LUSD", "RLUSD", "USD1", "FDUSD", "CRVUSD", "GHO",
    // wrapped natives and staked derivatives — the denominator, not the bet
    "WETH", "ETH", "WBTC", "BTC", "CBBTC", "WSOL", "SOL", "WBNB", "BNB",
    "STETH", "WSTETH", "WEETH", "ARB",
    /* Robinhood Chain stock tokens. RBLX is here because a live pass refused a
       pair *quoted* in it — the stock tokens are deep enough on this chain to
       be used as the denominator, which is the strongest evidence yet that the
       set is larger than anything written here. See the note above: this part
       of the list is a floor, never a claim of coverage. */
    "TSLA", "NVDA", "SPY", "SPCX", "RBLX",
  ]).map(s => s.toUpperCase()),

  // ── on-chain, in chain.js ─────────────────────────────────────────────
  // These veto on facts the chain states rather than on trading data, and
  // they only run on a candidate the rules above already accepted — an RPC
  // call is not spent on a token the free gates were going to refuse anyway.
  // Every one of them abstains when the field did not arrive: see chain.js.
  maxTopHolderPct: num("MAX_TOP_HOLDER_PCT", 0.15),  // one wallet is the whole exit
  maxTop10Pct: num("MAX_TOP10_PCT", 0.40),
  minLpBurnedPct: num("MIN_LP_BURNED_PCT", 0.90),    // v2 pairs only; v3 abstains
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
    /* First, because a token on a chain we do not track was never a candidate,
       and a rejection table that blames its liquidity teaches the wrong lesson
       about the thresholds. */
    id: "tracked_chain",
    check: (p, c) => !c.chains?.length || c.chains.includes(String(p.chainId ?? "").toLowerCase()),
    fail: p => `On ${p.chainId ?? "an unnamed chain"}, which this desk does not track`,
  },
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
    check: (p, c) => (p.priceChange?.m5 ?? 0) <= c.maxRecentPumpPct
                  && (p.priceChange?.h1 ?? 0) <= c.maxHourPumpPct,
    // Two windows, and the veto says which one refused it. Checking only the
    // five minutes let a token that had already doubled on the hour through as
    // long as it paused on the way in — the top with a flat last candle.
    fail: (p, c) => (p.priceChange?.m5 ?? 0) > c.maxRecentPumpPct
      ? `Already ${pct(p.priceChange?.m5 ?? 0)} in five minutes — this is the top, not the entry`
      : `Already ${pct(p.priceChange?.h1 ?? 0)} in the last hour — the 2× we look for has happened without us`,
  },
  {
    id: "has_identity",
    check: p => (p.info?.socials?.length ?? 0) > 0 || (p.info?.websites?.length ?? 0) > 0,
    fail: () => `No socials and no site — nothing behind the ticker`,
  },
  {
    /* Early, next to tracked_chain and for the same reason: a stock token
       refused on its market cap teaches the reader that the cap band is the
       problem. It is not. We do not call stocks. */
    id: "sane_base",
    check: (p, c) => {
      const s = (p.baseToken?.symbol ?? "").toUpperCase();
      if (!s) return false;
      return !c.denyBaseSymbols.includes(s)
          && !c.quoteWhitelist.includes(s);
    },
    fail: p => {
      const s = (p.baseToken?.symbol ?? "").toUpperCase();
      return s
        ? `${s} is money or an instrument, not a bet — this desk calls memecoins`
        : `The provider gave no symbol, so what this pair is cannot be established`;
    },
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
    run: (p, c) => {
      const m5 = p.priceChange?.m5 ?? 0, h1 = p.priceChange?.h1 ?? 0;
      if (m5 <= 2 || h1 <= 0) return null;
      if (m5 > 35) return null;                  // a spike is not a climb
      // The hour needs the same ceiling, for the same reason. Uncapped, the
      // steeper the hour the more this paid — so the one reason that reads as
      // patience was quietly paying its maximum for the vertical move the gate
      // above exists to refuse, and carried $APEC to the threshold on the nose.
      const hour = Math.min(h1, c.steadyHourCapPct) * 0.12;
      return { pts: Math.min(14, Math.round(m5 * 0.5 + hour)),
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
    return { fire: false, score: 0, reasons: [], vetoes: ["Already signalled in the last 24h"],
             vetoIds: ["cooldown"], key };
  }

  const vetoes = [], vetoIds = [];
  for (const g of GATES) {
    let ok = false;
    try { ok = g.check(pair, cfg); } catch { ok = false; }
    if (!ok) { vetoes.push(g.fail(pair, cfg)); vetoIds.push(g.id); }
  }
  if (vetoes.length) return { fire: false, score: 0, reasons: [], vetoes, vetoIds, key };

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
/**
 * Where a token says it lives, as the provider reports it.
 *
 * Only entries carrying a real http(s) URL: a bare handle would mean guessing
 * which site it belongs to, and a third party must not get to choose what our
 * pages link to. Six at most — a token with thirty "socials" is not offering
 * information.
 */
export function linksOf(pair) {
  return [
    ...(pair?.info?.websites ?? []).map(w => ({ kind: "site", url: w?.url })),
    ...(pair?.info?.socials ?? []).map(s => ({
      kind: String(s?.type ?? s?.platform ?? "link").toLowerCase(), url: s?.url })),
  ].filter(l => typeof l.url === "string" && /^https?:\/\//i.test(l.url)).slice(0, 6);
}

export function toSignal(pair, ev, { callerId = 1, sourceKind = "screener", sourceRef = null,
                                     chainChecks = null } = {}) {
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
    // Where the token said it lived when we fired. has_identity already refuses
    // anything without one of these, so recording them costs nothing.
    links: linksOf(pair),
    dex: pair.dexId,
    firedAt: new Date().toISOString(),
    entryPriceUsd: d.price,
    entrySupply: d.supply,
    entryMc: d.price * d.supply,
    entrySupplySource: d.source,
    liquidityUsd: pair.liquidity?.usd ?? 0,
    // Volume at the moment it fired, so the register can be read by size
    // afterwards. Frozen at insert since hash version 3: size is half of what a
    // reader judges a call by, and until canonical() could carry a per-version
    // field list this was a published number anyone with write access could
    // change afterwards with every hash still checking out.
    entryVolumeH1: pair.volume?.h1 ?? 0,
    entryVolumeM5: pair.volume?.m5 ?? 0,
    // What the chain said at the moment it fired, or null when nothing could
    // be read. Null is published as "not checked" and never as clean — the
    // whole point of the field is that the two are distinguishable afterwards.
    // Descriptive, not hashed, for the reason entryVolumeH1 is not hashed.
    chainChecks: chainChecks ? (chainChecks.toJSON?.() ?? chainChecks) : null,
    score: ev.score,
    reasons: ev.reasons.map(r => r.why),
    reasonIds: ev.reasons.map(r => r.id),
    sourceKind,
    sourceRef,
  };
}
