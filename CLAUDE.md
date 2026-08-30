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

**Intended:** Node 20 + TypeScript, Fastify, Postgres 15, Redis, BullMQ,
Next.js 14, viem.

**Actually built today:** plain ES modules on Node 20, `node:http`, one JSON
file. The engine's only runtime dependency is `ethereumjs-util`, for signature
recovery and nothing else. None of Fastify, Postgres, Redis or BullMQ is in
here yet — read the table below as the status, not this paragraph as one.

Contracts: Solidity 0.8.24, **`viaIR: true` is required** (stack depth), OZ 5.x.
Deploy on a small VPS; Postgres and Redis in Docker.

## What exists

| Path | State |
|---|---|
| `signal-engine/` | Working JS. Screener, scorer, integrity chain, Merkle anchoring, SIWE auth, server-side tier gating, websocket feed, API, analytics, notifier. Fixture- and simulation-tested. **Never run against live data.** |
| `signal-engine/verify.js` | Standalone verifier. Recomputes the chain from the public CSV and diffs it against the on-chain anchor. Takes no engine internals on trust. |
| `contracts/` | Compile clean. 666/666 trait parity, 1.61M gas worst case. `ProofAnchor` proved against a real EVM. |
| `schema.sql` | Postgres DDL, runs as-is. Structurally verified. **The engine does not use it yet** — storage is still `FileStore`. |
| `prototype/proof.html` | Design reference. Single file, mock data, seven pages. No Next.js port exists yet. |

## How to verify your work

```bash
cd signal-engine
node test.js               # rules against fixtures
node simulate.js           # full pipeline + integrity tamper test
node backtest.js           # threshold sweep and reason attribution
node test-gating.js        # Tier I cannot get a call inside 10s, by any route
node test-gating.js --nogate   # the same test failing, so you know it tests something

cd ..
node compile.js      # contracts build, all under 24KB
node parity.js       # contracts vs prototype, must print 666 / 666
node test-anchor.js  # anchor + Merkle proof on a real EVM, and the CSV path
node test-tier.js    # the tier read reaches the real ProofKeys function
```

`test-gating.js --nogate` is expected to report failures — that is the point of
it. Everything else must come out clean.

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

2. **Anchoring works but is not wired to a chain.** The Merkle root, the
   contract, the proof endpoint and the standalone verifier all exist and are
   proved against a real EVM by `test-anchor.js`. What is missing is a
   publisher: `start({ publishAnchorTx })` takes one, and until it is passed,
   `/api/verify` reports the register as unanchored. Do not soften that
   wording — an unanchored chain is one we could rewrite, and saying otherwise
   is the exact claim this project exists to disprove.

3. **`entrySupply` is derived, not read from the chain.** Dexscreener publishes
   no supply, so it is backed out of the cap and price it does publish, and the
   route is recorded in `entrySupplySource`. Market cap is at least ours and
   reproducible now, but the supply behind it still originates with a provider.
   An on-chain `totalSupply` read upgrades this without changing any stored
   record's meaning.

4. **Discovery is weak.** `/token-profiles` only surfaces tokens whose team
   filled in a profile; the best signals come from pools too fresh to have one.
   `sources.js` has Helius and EVM factory sources ready — they need keys.

5. **Peak is observed, not candle-derived.** Dexscreener publishes no OHLCV, so
   peak is the highest value the poller actually saw. Recorded honestly as
   `peakSource:"observed"`. GeckoTerminal has free candles and would upgrade
   this to a peak anyone can recompute.

6. **Score weights are reasoned, not measured.** Do not tune them on a handful
   of calls. Read `/api/analytics/bands` after ~100 settled calls.

7. **Tier latency is an unresolved product problem.** Several hundred holders
   acting on a $25K token move it themselves, and Tier III entering 10s before
   Tier I means Tier I buys Tier III's exit. Flag it; do not design around it
   silently. The gating is now enforced, which makes the problem measurable
   rather than solved: the register will show whether Tier I's fills are worse.

8. **Postgres and the Next.js port are not started.** `schema.sql` is verified
   but unused; storage is a JSON file behind the `Store` interface, which is
   what makes swapping it a contained job. The prototype has not been ported.

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
