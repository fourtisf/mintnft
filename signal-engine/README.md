# Signal engine

Automated screener over the Dexscreener public API. Produces signals with the
reasoning attached, ready to be written to the `calls` table in `schema.sql`.

## Running it

```bash
node --version          # 20+
npm i                   # ethereumjs-util, for SIWE signature recovery
node test.js            # rules against fixtures, no network needed
node test-gating.js     # tier gating, no network needed
node run.js --once      # one live pass
node run.js --watch     # every 60s
```

## What is in here

| File | What it does |
|---|---|
| `rules.js` | Gates and score. Market cap is computed from a frozen supply, never taken from a provider's field |
| `scorer.js` | Observations to verdicts. Misses never leave a denominator |
| `integrity.js` | Canonical form and the hash chain. `callerId` and `entrySupply` are inside the hash |
| `merkle.js` | sha256 tree over record hashes, sorted pairs, verifiable by `ProofAnchor` |
| `anchor.js` | Builds and publishes an anchor; produces a proof for one call |
| `verify.js` | Standalone. Recomputes the register from the public CSV and diffs it against the chain |
| `gating.js` | Which tier may see which call, and when |
| `auth.js` | SIWE, sessions, and reading a tier off `ProofKeys` |
| `ws.js` | Four feed rooms, one timer each |
| `api.js` | Read API. Every route that can return a call is gated |

## Anchoring

The hash chain proves the register agrees with itself. That is not the claim.
Anyone who can write the register can recompute the chain and agree with
themselves — what they cannot do is change a value already published on-chain.

`start()` takes a `publishAnchorTx` callback; pass one that sends the
transaction and returns its hash. Until it is passed, `/api/verify` reports the
register as unanchored, and the site must repeat that rather than round it up
to "verifiable". Proved end to end against a real EVM in `../test-anchor.js`.

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

## There is no smart-money filter here, and there cannot be

Dexscreener returns aggregates — trade counts, volume, price change, liquidity
— and **not one wallet address**. Who is buying is simply not in the response,
so wallet PnL, insider clusters and holder concentration are all out of reach
from this provider at any amount of effort. Anything claiming otherwise on this
data is guessing.

What the data does support is the size of the average clip. A token doing
$40,000 across 400 trades is being traded by something quite different from one
doing $40,000 across 25, and that is the honest proxy for whether real money is
involved. `flow()` computes it per window; `dust_flow`, `wash_pattern` and
`size_conviction` read it.

For actual smart money, the data has to come from somewhere else: Helius or a
Solana RPC for wallet-level fills, Birdeye for holder movement, a labelled
dataset for wallet reputation. `sources.js` is where that would attach.

## The rules

Twelve hard vetoes, then a weighted score out of 134 that must clear 76.

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
| dust flow | avg trade ≥ $50 (1h) | hundreds of $15 trades is bots, not demand |
| wash pattern | not 400+ trades turning over 1.5× the pool on a flat price | volume bought to look like interest |
| fading bid | 5m buy share ≥ 1h buy share − 18pp | the bid is leaving while we look |
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
