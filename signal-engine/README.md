# Signal engine

Automated screener over the Dexscreener public API. Produces signals with the
reasoning attached, ready to be written to the `calls` table in `schema.sql`.

## Running it

```bash
node --version          # 20+
node test.js            # rules against fixtures, no network needed
node run.js --once      # one live pass
node run.js --watch     # every 60s
```

**This sandbox cannot reach api.dexscreener.com** (`x-deny-reason: host_not_allowed`),
so the rules are verified against fixtures shaped from the official OpenAPI
schema, not against live data. First live run needs a machine with open egress.

## API facts

No API key. Base `https://api.dexscreener.com`. Two rate limits, so two buckets:

| Endpoint | Limit | Used for |
|---|---|---|
| `/token-profiles/latest/v1` | 60/min | discovery |
| `/token-pairs/v1/{chain}/{token}` | 300/min | enrich |
| `/tokens/v1/{chain}/{addresses}` | 300/min | batch refresh, 30 at a time |
| `/latest/dex/search` | 300/min | lookup |

## The honest limitation

**Dexscreener has no new-pool firehose.** `/token-profiles/latest/v1` only
surfaces tokens whose team filled in a profile. That is a weak quality filter
but it also means real coverage is missing — plenty of good pools never get a
profile, and the ones that do are on a delay.

For proper coverage, feed candidates in from a pool-creation watcher
(Helius webhooks or Geyser on Solana, factory logs on EVM) and let this engine
do the judging. The `Engine.candidates()` method is the only thing that needs
replacing; the rules stay as they are.

Same reason GMGN is not used here: no documented public API. What circulates
are endpoints reverse-engineered from the site, which can change without notice
and carry terms-of-service risk. Not a foundation to build a product on.

## The rules

Eight hard vetoes, then a weighted score out of 100 that must clear 60.

Gates exist to avoid losses, not to find winners. Any single failure kills the
signal no matter how good the rest looks:

| Gate | Default | Why |
|---|---|---|
| liquidity floor | $15K | below this, exit slippage eats the win |
| age window | 20m – 72h | first minutes belong to snipers |
| cap window | $30K – $2M | above $2M our own group can't move it |
| liquidity / cap | ≥ 4% | thin liquidity on a big cap is an exit trap |
| sell pressure | sells ≤ 2.2× buys (1h) | don't catch a distribution |
| not vertical | 5m ≤ +60% | never buy something already parabolic |
| has identity | socials or site | filters pure bot spam |
| sane quote | SOL/ETH/BNB/USDC/USDT | odd quote pairs are usually traps |

Score components, all of which write a plain-language sentence:

| Signal | Max | Reads |
|---|---|---|
| volume acceleration | 26 | 5m pace vs the hour's pace |
| buy pressure | 22 | share of last trades that were buys |
| trader growth | 18 | trade count accelerating |
| steady climb | 14 | rising but not spiking |
| depth | 12 | liquidity headroom |
| sweet spot age | 8 | 1–10h old |
| paid attention | 6 | active boosts |

## Why publish the reasons

Every signal carries the sentences that produced it. Three things follow:

1. A reader judges the reasoning instead of being asked to trust a ticker.
2. Reason ids are stored per call, so after a few hundred signals you can query
   which reasons actually correlate with a win and retune the weights on
   evidence. A screener can be improved; a gut feeling cannot.
3. Losing calls become publishable. A card reading "we fired on this, here is
   exactly why, it went -80%, it is still on the register" is stronger
   marketing than another green screenshot — and nobody else will post it.

## Tuning

All thresholds live in `CONFIG` in `rules.js`. Change them there, rerun
`node test.js`, and check the fixture verdicts still make sense before
touching live.

Backtest before trusting any weight: replay historical pairs through
`evaluate()` and score the outcome. The weights in this file are reasoned
starting points, **not** measured ones.
