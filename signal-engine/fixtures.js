/** Synthetic pairs shaped exactly like the Dexscreener OpenAPI Pair schema. */
const now = Date.now();
const mk = (o = {}) => ({
  chainId: "solana", dexId: "raydium", pairAddress: "PAIR" + Math.random().toString(36).slice(2, 8),
  baseToken: { address: "TOK" + Math.random().toString(36).slice(2, 8), name: "Test", symbol: "TEST" },
  quoteToken: { address: "So111", name: "Wrapped SOL", symbol: "SOL" },
  priceUsd: "0.000042",
  txns:  { m5: { buys: 40, sells: 12 }, h1: { buys: 260, sells: 150 } },
  volume:{ m5: 9000, h1: 42000 },
  priceChange: { m5: 8, h1: 34 },
  liquidity: { usd: 62000, base: 1, quote: 1 },
  marketCap: 210000, fdv: 210000,
  pairCreatedAt: now - 3.5 * 3600e3,
  info: { imageUrl: "x", socials: [{ platform: "twitter", handle: "t" }] },
  boosts: { active: 2 },
  ...o,
});

export const FIXTURES = {
  clean_signal: mk(),
  thin_liquidity: mk({ liquidity: { usd: 6000 }, marketCap: 180000 }),
  exit_trap:     mk({ liquidity: { usd: 20000 }, marketCap: 1500000 }),
  too_fresh:     mk({ pairCreatedAt: now - 6 * 60e3 }),
  too_old:       mk({ pairCreatedAt: now - 120 * 3600e3 }),
  already_pumped:mk({ priceChange: { m5: 140, h1: 900 } }),
  dumping:       mk({ txns: { m5: { buys: 5, sells: 30 }, h1: { buys: 90, sells: 320 } } }),
  no_identity:   mk({ info: { imageUrl: null, socials: [], websites: [] } }),
  weird_quote:   mk({ quoteToken: { symbol: "SHIBDOGE" } }),
  too_big:       mk({ marketCap: 8_000_000, fdv: 8_000_000, liquidity: { usd: 900000 } }),
  quiet:         mk({ volume: { m5: 300, h1: 30000 },
                      txns: { m5: { buys: 3, sells: 3 }, h1: { buys: 200, sells: 190 } },
                      priceChange: { m5: 0.2, h1: 1 }, boosts: { active: 0 } }),
  strong:        mk({ volume: { m5: 26000, h1: 60000 },
                      txns: { m5: { buys: 96, sells: 14 }, h1: { buys: 340, sells: 180 } },
                      priceChange: { m5: 16, h1: 52 },
                      liquidity: { usd: 120000 }, marketCap: 380000,
                      pairCreatedAt: now - 2.2 * 3600e3, boosts: { active: 4 } }),
};
