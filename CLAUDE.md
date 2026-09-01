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

## The design is already decided — do not invent one

**`prototype/proof.html` defines what this looks like. Open it in a browser
before writing a single line of UI.**

This document contains a lot of prose about the product. That prose is context
for *you*, not copy for the website. Do not build a page out of it. The site's
copy, layout, spacing, components and interaction model all come from the
prototype, which has already been reviewed and approved through many rounds.

If what you build does not look like the prototype, it is wrong, however good
it looks on its own.

### Tokens, so there is no room to drift

```css
--bg:#08090B  --bg-2:#0B0C0F  --art:#090B0D
--surface:#101216  --surface-2:#14171C  --surface-3:#1A1E24
--border:rgba(255,255,255,.07)  --border-hi:rgba(255,255,255,.13)
--tx:#F3F4F6  --tx-2:#8C929C  --tx-3:#585E68
--blue:#5B7CFA  --violet:#9B6DFF  --accent:#6E7BFF
--grad:linear-gradient(120deg,#5B7CFA,#9B6DFF)
--win:#3ECF8E  --dead:#E5606B  --r:11px
```

Type: **Inter Tight** for headings (weight 600, letter-spacing −0.032em),
**Inter** for body, **JetBrains Mono** with tabular figures for every number.

**No serif anywhere.** A serif editorial treatment was tried early and
rejected. If a heading renders in a serif, something has gone wrong.

Surfaces carry a top-edge highlight (`inset 0 1px 0 rgba(255,255,255,.045)`),
elevation comes from shadow rather than coloured glow, and `--art` must match
the SVG backdrop exactly so artwork shows no seam against its container.

### Seven pages, these names

`Home · Signals · Hindsight · Triage · Custody · Keys · Method`, plus the call
detail view. Do not rename them — Hindsight, Triage and Custody were chosen
specifically to avoid copying a competitor's Quant Desk, Ops Room and Vault.

Register became **Signals** on the owner's instruction. Only the page changed:
the append-only *record* is still the register everywhere it is a record — the
API paths, the CSV export, `schema.sql`, the verifier and the Custody copy —
because renaming that breaks every published link and the standalone verifier
with it.

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
node test-marks.js   # marks come off the call's own pair
node test-og.js      # shared links preview the call, not the site

cd ..
node parity.js       # contracts vs prototype, must print 666 / 666
node site/test-live.mjs   # the site against a real engine: offline, connected,
                          # a signal arriving on the socket, its marks moving
```

If `parity.js` prints anything other than 666/666, stop and fix it before
continuing. Everything else is recoverable; that one is not.

## Conventions

- Take the prototype's **layout, tokens, copy and interactions exactly.**
  Rewrite only its *logic*: mock data becomes API calls, browser-side SHA-256
  becomes a server route, inline styles become real modules. Those three things
  exist only because the prototype had to run from a `file://` URL.
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
   silently. The public leg is `PUBLIC_DELAY_S` (default 3600) and is the only
   one that is settable — with no keys minted it is an hour nobody has paid to
   skip. The paid ladder is the promise and does not move.
6. **Nothing is anchored.** The chain is internally consistent and has never
   been published, so it is not independently verifiable — `/api/verify` says
   exactly that and the site now repeats it rather than printing an anchor date
   it invented. What is missing is a publisher with a funded key; `anchor.js`
   and `test-anchor.js` are ready for one.
7. **Volume is recorded but not hashed.** `entryVolumeH1` sits outside
   `IMMUTABLE` because `canonical()` has no per-version field list, so adding a
   field there would change the canonical form of every row already written and
   break verification of the whole chain. The comment in `integrity.js` says to
   bump `HASH_VERSION` when the list changes; doing that today fails every old
   row. Fix the versioning first, with a migration test, then move the field
   inside. It will never be cheaper than while the register is small.

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
