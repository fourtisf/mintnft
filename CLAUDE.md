# CLAUDE.md

Read this before touching anything. It is the contract for how this project
gets built, not a summary of it.

## What this is

A public register of automated trading signals. A screener reads liquidity,
buy pressure and volume acceleration across Solana, Base, BNB and Ethereum;
every signal it fires is published **with the exact conditions that triggered
it**, then tracked to win, miss or dead. Failed calls are never removed.

The tracking is commodity. The product is the **inability to quietly delete**.
Every design decision below follows from that one sentence, and any change that
weakens it is wrong even if it ships faster.

## Non-negotiables

These are not style preferences. Each one is a place where the product quietly
becomes the thing it was built to replace.

1. **Never update or delete a row in `calls`.** The schema enforces it with
   `RULE ... DO INSTEAD NOTHING`. Revoke UPDATE/DELETE from the app role too.
   Corrections are new rows, never edits.
2. **Never compute a stat that excludes misses.** If you find yourself writing
   `WHERE verdict != 'miss'`, stop. Hit rate is wins over *all* calls.
3. **Never resolve tier gating in the browser.** Latency is the product. Send
   the call to a client that should not have it yet and the business model is
   gone the moment someone opens devtools.
4. **Never trust a provider's `marketCap` field.** Providers disagree and
   change definitions. Store price and supply separately, compute MC yourself.
5. **Never backfill `seconds_to_2x`.** Only record it for calls watched live;
   otherwise leave `observed_live = false` and omit the field from the API.
6. **Re-run the parity test after any artwork change.** The site and the
   contract diverge the moment either moves. A buyer receiving different art
   from what was displayed is mis-selling, not a rough edge.

## Stack

Node 20 + TypeScript, Fastify, Postgres 15, Redis, BullMQ, Next.js 14, viem.
Contracts: Solidity 0.8.24, **`viaIR: true` is required** (stack depth), OZ 5.x.
Deploy on a small VPS; Postgres and Redis in Docker.

## What exists

| Path | State |
|---|---|
| `signal-engine/` | Working JS. Screener, scorer, integrity chain, API, analytics, notifier. Tested against fixtures and a simulated market. **Never run against live data.** |
| `contracts/` | Compile clean. 666/666 trait parity with the prototype, 1.61M gas worst case. |
| `schema.sql` | Postgres DDL, runs as-is. Structurally verified. |
| `prototype/proof.html` | Design reference. Single file, mock data, seven pages. |

## How to verify your work

```bash
cd signal-engine
node test.js         # rules against fixtures
node simulate.js     # full pipeline + integrity tamper test
node backtest.js     # threshold sweep and reason attribution

cd ..
node parity.js       # contracts vs prototype, must print 666 / 666
```

If `parity.js` prints anything other than 666/666, stop and fix it before
continuing. Everything else is recoverable; that one is not.

## Conventions

- The prototype is a **design reference, not code to port line by line.** It is
  one file with mock data and browser-side hashing. Take the layout, the design
  tokens, the copy and the interaction model. Rewrite the logic properly.
- Comments explain *why*, never *what*. If a line needs a comment to say what it
  does, rename something instead.
- Every published number comes from `scorer.js` `stats()` or the SQL views in
  `schema.sql`. Do not compute statistics ad hoc in a route handler.
- Errors from external APIs are expected, not exceptional. A provider being
  down must never stop scoring or lose a call.

## Known gaps, in priority order

1. **The engine has never seen real market data.** Everything is fixture-tested.
   This is the first thing to fix and it unblocks every other judgement.
2. **Discovery is weak.** `/token-profiles` only surfaces tokens whose team
   filled in a profile; the best signals come from pools too fresh to have one.
   `sources.js` has Helius and EVM factory sources ready — they need keys.
3. **Peak is observed, not candle-derived.** Dexscreener publishes no OHLCV, so
   peak is the highest value the poller actually saw. Recorded honestly as
   `peakSource:"observed"`. GeckoTerminal has free candles and would upgrade
   this to a peak anyone can recompute.
4. **Score weights are reasoned, not measured.** Do not tune them on a handful
   of calls. Read `/api/analytics/bands` after ~100 settled calls.
5. **Tier latency is an unresolved product problem.** Several hundred holders
   acting on a $25K token move it themselves, and Tier III entering 10s before
   Tier I means Tier I buys Tier III's exit. Flag it; do not design around it
   silently.

## Things that are decided, do not relitigate

- Multi-caller schema from day one. The house desk is `callers.id = 1`. This is
  what lets the product run as one desk today and as a referee later with no
  migration.
- Tier distribution is **probabilistic with published odds** (9.91 / 30.03 /
  60.06), not fixed counts. Site copy must say odds. Fixed counts would need a
  shuffle and the two claims together are a contradiction.
- The season seed mixes the committed secret with `blockhash(revealBlock)`.
  Commit-reveal alone lets a deployer grind outcomes offline before committing.
- Head position is fixed at x=300 in the artwork. The old per-token nudge was
  invisible and forced every shape to be arithmetic instead of a constant
  string, which matters enormously inside a contract.
