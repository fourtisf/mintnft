# CLAUDE.md

Read this before touching anything. It is the contract for how this project
gets built, not a summary of it.

## What this is

A public register of automated trading signals. A screener reads liquidity,
buy pressure and volume acceleration on Robinhood Chain; every signal it fires
is published **with the exact conditions that triggered it**, then tracked to
win, miss or dead. Failed calls are never removed.

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

`Home · Signals · Hindsight · Triage · Custody · Mint · Method`, plus the call
detail view. Do not rename them — Hindsight, Triage and Custody were chosen
specifically to avoid copying a competitor's Quant Desk, Ops Room and Vault.

Register became **Signals** on the owner's instruction. Only the page changed:
the append-only *record* is still the register everywhere it is a record — the
API paths, the CSV export, `schema.sql`, the verifier and the Custody copy —
because renaming that breaks every published link and the standalone verifier
with it.

Keys became **Mint** the same way, and `/keys` did not go with it. `contractURI()`
published `https://nekara.xyz/keys` on-chain in a contract with no setter for it,
so every marketplace that reads the collection reads that address. It resolves to
the same page and always will; the nginx location and `PATH_VIEW` both carry it,
and `site/test-mint.mjs` fails if either stops. `/api/keys` is unchanged for the
same reason the register's paths are.

## Non-negotiables

These are not style preferences. Each one is a place where the product quietly
becomes the thing it was built to replace.

1. **Never update or delete a row in `calls`.** The schema enforces it with
   `RULE ... DO INSTEAD NOTHING`, and `test-pg.js` proves it by asking the
   database to break it. Revoke UPDATE/DELETE from the app role too.
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
7. **Never store a subscriber's tier.** A key can be sold between the moment
   its holder links a chat and the moment a call fires. A stored tier keeps
   paying the seller latency they no longer own and strands the buyer on the
   public leg — and the buyer would be right to call that a scam. `tgbot.js`
   reads `bestTierOf` on every send, and a provider being down reads as public,
   never as a promotion.
8. **The public channel is a tier, and it is the slowest one.** Anything that
   leaves for Telegram waits `PUBLIC_DELAY_S` measured from `fired_at`, the same
   clock `ws.js` uses. A call broadcast the moment it fired put the free channel
   ahead of every paid tier — Tier I pays for ten seconds and the message was
   already out — which is the business model given away on the side. Set
   `PUBLIC_DELAY_S=0` while no key has been sold; do not remove the gate.
9. **Never let a check that did not run read as a check that passed.** A dead
   RPC, a missing key, a field the provider omitted — all of them mean *we do
   not know*, and every one of them has to survive onto the page saying so.
   `chain.js` records which fields it actually established for exactly this
   reason. A panel that renders silence as a green tick is worse than no panel,
   because a reader trusts it.

## Stack

Node 20 + TypeScript, Fastify, Postgres 15, Redis, BullMQ, Next.js 14, viem.
Contracts: Solidity 0.8.24, **`viaIR: true` is required** (stack depth), OZ 5.x.
Deploy on a small VPS; Postgres and Redis in Docker.

## What exists

| Path | State |
|---|---|
| `signal-engine/` | Working JS. Screener, scorer, integrity chain, API, analytics, notifier. Tested against fixtures and a simulated market. **Never run against live data.** |
| `contracts/` | Compile clean. 666/666 trait parity with the prototype and 666/666 on the SVG itself, 2.44M gas worst case. `test-keys.js` is 111 assertions on a real EVM; `keys.js` is the deploy and admin CLI, and `test-deploy.js` drives it as a command against a JSON-RPC node over a real socket. **Nothing has been sent to a real network.** |
| `contracts/keys.js` | The only thing here that sends a transaction. Every subcommand is a dry run until `--confirm`. Key from the environment, never an argument. |
| Mint on the site | `/api/keys` and `/api/keys/state` read the chain; the page builds the calldata and the visitor's wallet signs it. This process never holds a key. |
| `schema.sql` | Postgres DDL. It now runs; it did not before — an index expression over a `timestamptz` is only STABLE and Postgres rejected the file outright, which is what "structurally verified" had been standing in for. |
| `signal-engine/tgbot.js` | The alert bot. Long-polls Telegram, so it needs no public URL and no nginx location. `/start` subscribes on the public leg; `/link` issues a code that only binds once a SIWE session on the site presents it. Tier read at send time, every time. |
| `signal-engine/pgstore.js` | The Postgres driver, behind the same interface as `FileStore`. `migrate-pg.js` moves a file register across without recomputing a hash. |
| `prototype/proof.html` | Design reference. Single file, mock data, seven pages. |

## How to verify your work

```bash
cd signal-engine
node test.js         # rules against fixtures
node simulate.js     # full pipeline + integrity tamper test
node backtest.js     # threshold sweep and reason attribution
node test-marks.js   # marks come off the call's own pair
node test-og.js      # shared links preview the call, not the site
node test-chain.js   # on-chain gates, and that an unread check never reads clean
node test-sources.js # which source found a call, and whether it earns its key
node test-stall.js   # a provider that accepts and never answers does not stop the engine
node check-chain.js  # not a test: points the gates at a real token with a real key,
                     # so wiring one is watched rather than assumed
node check-pons.js   # not a test either: the Robinhood RPC, the Pons factory's
                     # own logs, whether Dexscreener prices what they name, what
                     # the real gates then do with it, and what chains the
                     # register actually holds. A filter that refuses everything
                     # and a filter that works print the same quiet log; this is
                     # what tells them apart. Step 2b asks BOTH Pons factories
                     # for every log they emit, grouped by topic0 — a factory
                     # busy under a topic we do not watch is a bug, one that is
                     # silent means the launches went to the other generation
node preview.js --sweep   # one real discovery pass, then the same real pairs
                          # through the same real gates at other size bands, so
                          # "lower the floor a bit" becomes a number instead of
                          # a hunch. One pass is not the market
node test-hashversion.js  # rows written under an older hash scheme still verify
node test-anchor.js  # what is built, published, refused, and provable to a third party
node test-exits.js   # what an exit rule would really have returned, and that a
                     # trailing stop is walked over observed prices rather than
                     # handed 75% of a peak nobody sold at
node test-exit-alert.js   # the stop walked live and recorded and never
                          # announced, and the progress updates that replaced
                          # it: once per milestone, never before the public leg
node test-tgbot.js   # the alert bot: link codes, filters, and that a tier is
                     # read from the chain at send time rather than stored
node test-mint.js    # what the mint panel is told, and what it is never told
node test-pg.js      # the Postgres driver, if TEST_DATABASE_URL is set; skips loudly otherwise
node simulate.js --pg postgres://…/nekara   # the same simulation, over Postgres

cd ..
node parity.js       # contracts vs prototype: traits, the engraving before
                     # reveal, and the SVG byte for byte. All three must print 666
node compile.js      # every contract's deployed size against the 24KB limit
node contracts/test-keys.js  # the mint, the phases, the cap, the reveal, the
                             # money out — and that bestTierOf no longer costs
                             # more because the season got bigger
node test-tier.js    # the backend's tier read reaches the real function
node test-anchor.js  # the anchor and one proof, inside a deployed ProofAnchor
node contracts/test-deploy.js  # contracts/keys.js driven as the command it is,
                               # against a JSON-RPC node over a real socket
node site/test-live.mjs   # the site against a real engine: offline, connected,
                          # a signal arriving on the socket, its marks moving
node site/test-hang.mjs   # a host that accepts and never answers still reads
                          # offline — 10s of wall clock, and worth it
node site/test-mint.mjs   # the mint panel: nothing deployed, a chain it cannot
                          # reach and an open mint all read differently, and the
                          # calldata it hands a wallet matches the compiled ABI
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
2. **Discovery is wired but unmeasured.** `HeliusSource`, `EvmFactorySource`
   and `PonsSource` now join the merged source whenever their key is set, so
   the engine sees new pools rather than only tokens whose team filed a
   profile. Whether that earns the key is not yet known: `/api/triage` reports
   `scanned` and `fired` per source and the Triage page prints them, and
   **that is the number to read after a few hours** — not a threshold. Every
   call freezes its discovery source in `sourceRef`, which is inside the hash,
   so a source cannot be credited later with a winner it did not find. With no
   key at all a watcher is left out of the list entirely rather than added and
   idle, and `chainChecks` stays `null`, which the site prints as "not
   checked" — honest, and no protection.
   `PonsSource` is the one that does not wait to be told: it reads
   `TokenLaunched` out of the Pons V1 factory's own logs on Robinhood Chain, so
   a launch is discovered in the block that creates it rather than when someone
   files a profile. Pons has minted six figures of tokens and roughly one in a
   hundred graduates, so almost everything it produces should be refused — that
   is the gates working, and `/api/triage` is where to read it. Only V1: a V2
   launch opens on a bonding curve with no pair to price until it graduates, so
   catching those means watching the graduation, which is a different event and
   a second source. It needs `ROBINHOOD_RPC` and is left out entirely without
   one. The factory addresses and the topic come from the verified source at
   `github.com/ponsdotdev/ponsfamily`.

   `EvmFactorySource` **swallowed its own RPC failures** and returned an empty
   array, so a node that was down, rate-limiting, or refusing the block range
   published as `scanned: 0, errors: 0` — a source that could not run, reading
   exactly like a source that ran and found nothing. It throws now; MergedSource
   already catches per source, keeps the others running and records the message,
   so the failure reaches `/api/triage` as `errors` and `lastError`. A JSON-RPC
   error is a 200 with an `error` member, so `#rpc` checks for that too — reading
   `.result` past it turned "block range too wide" into `undefined` and
   `undefined` into an empty scan.

   The Dexscreener sources had the same shape of hole and a DNS outage on the
   VPS is what exposed it: the client tries three times and returns `null` for
   *could not be fetched*, while an empty feed returns `[]`. Both took the same
   path, so a box that could not resolve `api.dexscreener.com` published
   `scanned: 0, errors: 0` and read as a market with nothing in it. `null` now
   throws and `[]` does not — one boost feed failing is a thinner scan, both
   failing is an error.

   The cold-start window was **200 blocks for every chain**. That is half an hour
   on Base and **under a minute on Robinhood Chain**, whose Nitro blocks are
   sub-second — so the first tick after a deploy saw essentially no history and
   reported it as nothing happening. `lookback` is per source now and Pons uses
   `PONS_LOOKBACK_BLOCKS` (5000, ~20 minutes). Only the first tick uses it; after
   that the source resumes from where it stopped, so nothing is skipped.

   The EVM watchers were **all pointed at Base's Uniswap v3 factory**, because
   every one of them took the constructor default. An `ETH_RPC` or `BSC_RPC`
   watcher therefore scanned an address that is not the factory on its chain,
   returned nothing for ever, and still printed its name in the discovery line —
   a source that cannot work, reading exactly like a source finding nothing.
   `UNISWAP_V3_FACTORY` in `engine.js` now holds one address per chain and a
   chain missing from it is left out with a line saying so. **BSC is missing on
   purpose**: PancakeSwap v3 is the pool that matters there and its factory is
   not Uniswap's, so writing a plausible address in would be the same bug in a
   new place.

3. **Peak is observed, not candle-derived.** Dexscreener publishes no OHLCV, so
   peak is the highest value the poller actually saw. Recorded honestly as
   `peakSource:"observed"`. GeckoTerminal has free candles and would upgrade
   this to a peak anyone can recompute.
4b. **The gate list was written for the wrong chain, and one of them was a
   bug rather than a threshold.** `quoteWhitelist` held SOL, WETH, ETH, WBNB,
   BNB, USDC and USDT — a Solana/Base/BSC/Ethereum list — so on Robinhood Chain
   it refused every pair quoted in **USDG**, which is that chain's own native
   stablecoin, 68% of its stablecoin supply and the default dollar asset of
   every application on it. The veto read "Quoted in USDG, not a major": the
   right shape of refusal with the wrong content, and nothing anywhere said so.
   USDG is in the list now and `QUOTE_WHITELIST` makes it settable, because the
   next chain will have its own.

   The size band is the other half and it is **not** a bug, so it has not been
   moved: the first live window on Robinhood Chain refused 14 of ~26 candidates
   at `liquidity_floor` with pools of $2K–$12K against a $15K floor, and three
   more at `cap_window` on caps of $23K–$27K against a $30K minimum. Those
   numbers were reasoned on Solana memecoin markets. `MIN_MARKET_CAP` is settable
   now — it always should have been, since `MAX_MARKET_CAP` was — so the band can
   be answered without a deploy. **Lowering the floor is not free** and gap 5
   below is why: a few hundred holders acting on a $10K pool are the market.
   Read the `rejects` list in `/api/triage`, which carries the actual figure each
   candidate was refused on, before moving either end.

4c. **The desk had no rule about what it will not call.** `quoteWhitelist` says
   what a pair may be priced *in*; nothing said what a pair may be priced *on*.
   Harmless on Solana and Base, where the feeds only surface memecoins. Robinhood
   Chain is not that: its flagship assets are **tokenized US equities**, deployed
   as ordinary ERC-20s whose symbol is the literal ticker — TSLA, NVDA, SPY,
   SPCX — trading against USDG in DEX pools on the same chain, through the same
   feeds, with Chainlink feeds behind them. To every rule in `rules.js`,
   `NVDA/USDG` and a memecoin pair are the same shape, and a register calling a
   3% drift in NVDA a signal is a different product and a worse one.

   `sane_base` refuses them, early — a stock token refused on its market cap
   would teach the reader that the cap band is the problem, and it is not.
   `denyBaseSymbols` folds in the whole quote whitelist (if we call it money we
   do not also call it a bet), the stablecoins and the wrapped natives.

   **The stock half of that list is incomplete by construction** and must not be
   read as coverage: Robinhood lists new tickers whenever it chooses, and only
   the four confirmed live are shipped. `DENY_BASE_SYMBOLS` is how the rest get
   added today. What would actually close it is reading Robinhood's own
   published stock-token contract list rather than matching symbols at all —
   `docs.robinhood.com/chain/contracts` enumerates them, one contract per ticker,
   and an address match is a fact where a symbol match is a guess. A gate that
   catches TSLA and misses ORCL is not a gate that catches stocks.

4. **Score weights are reasoned, not measured.** Do not tune them on a handful
   of calls. Read `/api/analytics/bands` after ~100 settled calls.

   **The score, not the size band, is what is holding this desk shut**, and the
   first `preview.js --sweep` said so plainly: of 47 live candidates, 5 cleared
   every gate at the shipped $15K/$30K band and **0** reached the threshold;
   dropping the floor to $4K and the cap to $10K took that to 7 and still 0.

   The second run named the mechanism. Three rules paid **nothing at all** on
   Robinhood Chain — `volume_acceleration` (26), `trader_growth` (18) and
   `steady_climb` (14). That is 58 of a 134 maximum, against a threshold of 76,
   which leaves **exactly 76 reachable**: the desk could only fire on a
   mathematically perfect score of every remaining rule. Not a quiet market — a
   threshold nothing can reach. The best candidate seen, $HOODLIFE, scored 33.

   All three read the **five-minute** block, and so `SIGNALS` now declares a
   `needs` list per rule and `--sweep` splits a zero two ways: *no data* — the
   provider sent no such field, so the rule could not be computed — and *did not
   qualify* — it was computed and the market said no. This is the scoring half
   of non-negotiable 9. A rule whose input is absent is not a rule that scored
   nothing, and points that can never be earned must not sit inside a threshold.
   Nothing scores off `needs`; it is read only to tell those two apart, which is
   the only way to separate a wrong weight from a field Dexscreener does not
   publish for this chain. **Read that column before anyone proposes moving
   `SCORE_TO_FIRE`** — if the answer is "no data", lowering the threshold is
   treating a data gap as a market opinion.
   So widening the band buys candidates and no calls, at the cost of thinner
   pools — the opposite of the trade it looks like. The rejection table cannot
   show this, because a candidate that clears every gate and then scores 32 is
   not refused by anything an env file can move. `--sweep` now also prints the
   score spread, which rules paid out and which never did, and what the best
   candidate was short — that is the reading to take before touching a weight,
   and it is diagnosis, not permission to tune.
5. **Tier latency is an unresolved product problem.** Several hundred holders
   acting on a $25K token move it themselves, and Tier III entering 10s before
   Tier I means Tier I buys Tier III's exit. Flag it; do not design around it
   silently. The public leg is `PUBLIC_DELAY_S` (default 3600) and is the only
   one that is settable — with no keys minted it is an hour nobody has paid to
   skip. The paid ladder is the promise and does not move.
6. **The contracts have never touched a real chain.** Same shape of gap as #1
   and just as load-bearing. The tooling is now complete and tested —
   `contracts/keys.js` deploys and administers, `contracts/test-deploy.js` runs
   every one of its commands against a JSON-RPC node over a real socket — with a
   second node standing in for Ethereum mainnet, since the seed depends on it —
   and `site/test-mint.mjs` proves the calldata the page hands a wallet is what
   the compiled ABI encodes. All of it against `@ethereumjs/vm`: a real EVM, not
   a real network. Block times, fee markets, reorgs, RPC failures and Robinhood
   Chain's own sequencer are absent. **Robinhood Chain testnet (46630), the whole
   cycle, before mainnet.** `recommitCount` is read by `/api/keys/state`, but the
   Keys page does not print it, and neither are the seed's published ingredients
   shown there yet — today verifying the tier draw means reading the contract.
7. **Nothing is anchored.** The chain is internally consistent and has never
   been published, so it is not independently verifiable — `/api/verify` says
   exactly that and the site now repeats it rather than printing an anchor date
   it invented. What is missing is a publisher with a funded key.
   `signal-engine/test-anchor.js` covers the window arithmetic, the merkle
   proof a third party checks, the refusal to anchor a chain that no longer
   verifies, and the one that loses calls silently — a publisher that throws
   must leave its window pending; it runs against a publisher function, not a
   chain. The root `test-anchor.js` is the one that deploys a real
   `ProofAnchor` on a local EVM and has a non-owner verify every proof inside
   it. **It had been broken since `proofFor` became async in the Postgres move
   and nobody saw it**, which is how the CSV bug below survived: a test that
   cannot run reads exactly like a test that passes.
   Both now run. A real network still does not.

   The public CSV could not recompute its own chain whenever a provider
   reported no volume: v3 hashes `entryVolumeH1`/`entryVolumeM5`, an absent one
   hashes as `null`, and the export wrote an empty cell that reads back as
   `""`. `\N` now marks every hashed field that is absent, not just
   `sourceRef`, and `signal-engine/test-anchor.js` runs `toCsv` → `verifyCsv`
   for a call with volume and one without. Nothing had ever exercised that
   round trip, on the one artefact an outsider actually holds.
8. **The art on chain is one deploy behind the art on the site.** `parity.js`
   now compares the SVG itself and not only the traits, and the first thing it
   found was that Ashfall drew six bright dots on chain where the page drew a
   drift of twenty-six, and that the spoke crown was a dashed circle. Those are
   fixed in the source; the collection at
   `0xe0b0EBDbfAD58d803B4AB654e9508aa6803550Ec` still points at the renderer
   deployed before them. `node contracts/keys.js renderer --confirm` deploys a
   new ProofParts and ProofRenderer and moves the pointer — never a second
   ProofKeys, which would be a second collection at a new address. Two things
   the SVG check still normalises away, and they are the whole of what differs:
   `dur=`, because the page desyncs each token's animation by its phase and
   threading that through every part signature is a wider change than it earns,
   and `font-family=`, because the page can name JetBrains Mono and a wallet
   cannot.
9. ~~**Volume is recorded but not hashed.**~~ Done. `canonical()` now carries a
   field list per hash version, a row is re-hashed under the version it was
   written with, and `entryVolumeH1`/`entryVolumeM5` are frozen from v3.
   `test-hashversion.js` pins the v2 canonical form and digest as literals, so
   a future change that would rewrite what an old row hashes to fails there
   rather than in the register. **Adding a version:** copy the previous array
   in `integrity.js`, append, bump `HASH_VERSION`, add a case to that test, and
   update the copy of the scheme in `site/assets/app.js` — it is deliberately
   copied rather than derived, so drift is loud.

## Things that are decided, do not relitigate

- **A signal is announced with a card; nothing else in the channel is.** `og.js`
  has three cards and which is right depends on how much has happened.
  `callCard` is the record a shared link unfurls into and `bannerCard` is the
  timeline picture — both headline a multiple, and a signal has none: it fired a
  second ago, `nowX` is 1.00 and the series is one point. So `signalCard`
  headlines what is actually known — ticker, contract in full because that is
  what a reader pastes, entry figures, and the reasons at the size the reasons
  deserve. **No sparkline**: a chart of one observation is a decoration
  pretending to be evidence. Served at `/og/signal/:seq.png`, and Telegram
  fetches it by URL, so a card the renderer cannot draw is Telegram's 4xx and
  not ours — either way `send` falls back to the plain message, and a caption
  over 1024 characters skips the photo entirely rather than let Telegram
  silently truncate the reasons. The picture is presentation; the text is the
  record, and the picture must never cost a subscriber the call. Progress and
  outcome messages stay plain: a channel where every message is a picture is a
  channel where the picture stops meaning anything.
- **The channel carries the call, then how far it ran. Nothing else.** The exit
  alert was removed on the owner's instruction, and so was the `Stop` row on the
  outcome card. **A call that is dead when it settles is not announced either**,
  same instruction and same split: the row settles with its verdict and its
  `isDead` mark, the Signals page and the CSV carry it, hit rate still counts it
  in the denominator, and an operator still gets a `[DEAD]` line — only the
  message is gone. `WIN · DEAD` on one line is the end of a story nobody
  subscribed to hear. `test-exit-alert.js` asserts both halves, and that a
  settled *miss* which is not dead still goes out, so "quiet about the dead" can
  never drift into "quiet about the losses". **The rule was not removed**: the poller still walks the trailing
  stop forward, still freezes the fill on the mark, and the Hindsight table and
  the call page still read it — an `[EXIT]` line still goes to the log, because
  an operator watching a fill is not the same as broadcasting one. Deleting a
  message is the easiest way to quietly delete a rule, and `test-exit-alert.js`
  asserts both halves so the two can never be confused later.
  What replaced it is `formatProgress`, on **milestones** (1.5, 2, 3, 5, 10, 25,
  50, 100×) rather than on every poll — the poller runs every twenty seconds and
  a channel repeating "1.04x" is a channel nobody reads by the time something
  moves. The transition is read off the stored mark rather than held in memory,
  so a restart never re-announces a number the channel already has, and an
  update waits `PUBLIC_DELAY_S` like everything else: a 2× posted early tells
  the free channel a call exists before the free channel is due the call.
- **The trailing stop is recorded, not recomputed.** The poller walks it forward
  over every observation it makes and freezes the fill on the mark. Everything
  downstream — the Hindsight table, the card, the share text — reads that value
  rather than re-walking the series, because `samples` is decimated at 96 and
  the register thins it to 24 again, and a stop re-walked over 24 points is a
  different number on the one figure a holder was alerted on. Rows written
  before the rule existed still fall back to the series, and the three states
  are kept distinct on the page: filled, watched-and-not-filled, and never
  walked. The last is not "never hit".
- **This is a Robinhood Chain desk.** `CHAINS` defaults to `robinhood` on the
  owner's instruction — not a multi-chain desk that also looks there. Three
  things follow and all three are deliberate:
  - `tracked_chain` is **first** in `GATES`, so a token elsewhere is refused for
    its chain rather than for its liquidity. A Triage table that blames the
    thresholds teaches the wrong lesson about them.
  - The all-chain feeds are narrowed **before pricing**, not at the gate.
    Dexscreener's profile and boost lists are every chain it indexes, so nine in
    ten candidates would be a batch request spent to learn nothing. The cost is
    that those candidates never become a rejection anyone can argue with, so
    `priceTokens` counts them and `/api/triage` carries `offChain` per source —
    "the profile feed found nothing" and "it found thirty, all elsewhere" are
    different facts and the page must be able to tell them apart.
  - A watcher for a chain outside `CHAINS` is **not built**, and says so. Same
    rule as an unkeyed source being left out, applied to the other half of the
    question: `HeliusSource` watching Solana on a Robinhood desk would scan,
    cost its key, and hand every candidate to a gate that refuses it.

  The startup log prints which chains are in force, so it is never inferred from
  silence. `CHAINS=` empty opens it back up to everything.
- Multi-caller schema from day one. The house desk is `callers.id = 1`. This is
  what lets the product run as one desk today and as a referee later with no
  migration.
- Tier distribution is **probabilistic with published odds** (9.91 / 30.03 /
  60.06), not fixed counts. Site copy must say odds. Fixed counts would need a
  shuffle and the two claims together are a contradiction.
- **The chain is Robinhood Chain** (mainnet 4663, testnet 46630), which runs
  Arbitrum Nitro. That is not a deployment detail: on Nitro `block.number` is an
  estimate of the *Ethereum* block number and `blockhash()` is documented as
  cryptographically insecure and not sourced from L1. Anything resting on either
  is wrong here even though it is right on Ethereum and on the OP Stack.
- The season seed is `keccak256(secret, mintEntropy, entropyHash)`. Commit-reveal
  alone lets a deployer grind outcomes offline before committing, so two things
  they cannot have at commit time are mixed in: `mintEntropy`, folded forward by
  every mint, and the hash of an Ethereum mainnet block whose *number* is fixed
  in the commitment before that block exists. The chain cannot read Ethereum, so
  that hash is submitted at reveal and stored along with the secret — the
  contract cannot check it and **anyone else can**, with one call to any
  Ethereum node, which is the same shape as the rest of this product. There is
  no reveal deadline: nothing in the seed decays.
- `recommitSeed` works only while `totalMinted == 0`. After the first mint the
  deployer can compute what the seed would be, so a second commitment there is a
  reroll whatever it was meant for.
- **Three phases, all of them public, one price each** — roughly $2, $5 and $10.
  There is no allowlist: the merkle path was built and then removed on the
  owner's instruction, and re-adding it is a contract change. The owner opens
  each phase when they choose; nothing moves on its own, because a schedule that
  follows supply cannot be held back for a quiet week and holding it back is the
  point of having phases. Phases only climb — reopening a cheaper one after the
  dear one has run lets whoever waited buy under the people who showed up first —
  and `setPrices` refuses a ladder that falls, for the same reason.
- **One supply number, `seasonCap`, bounds every mint path** — public,
  every phase and the treasury alike. It starts at 666 and only `openSeason()` raises
  it, never past `MAX_SUPPLY`, always with an event. `mintReserved` used to
  measure itself against `MAX_SUPPLY` while the paid paths measured themselves
  against `SEASON_1`, which let the treasury add 445 keys past the number the
  site advertises. Do not reintroduce a second cap.
- **Minting closes before the seed is revealed, and the contract enforces it.**
  Once the seed is public every token's tier is computable, so an open mint
  would let anyone time a transaction onto a Tier III id. `reveal()` refuses
  unless the phase is Closed and `setPhase` will not reopen afterwards. A
  season 2 needs its own commitment, not a second bite at this one.
- **The engraving is drawn from the token number; only the tier waits for the
  seed.** `ProofRenderer.traits()` folds a zero seed for appearance and the
  season seed for tier alone, so a buyer owns a finished key the moment they
  mint and the draw stays as unguessable as before — the tier is the half worth
  timing a purchase around, and it is the half nobody can see in advance. A zero
  seed means the draw has not run: tier 0, rendered "Not drawn yet", never
  Tier I. `parity.js` proves both halves — 666/666 against the prototype at the
  sample seed, and 666/666 identical engravings at seed zero with no tier drawn.
  The first collection sealed the whole picture until reveal and was redeployed
  for this; keys #0001 and #0002 of that one are abandoned on purpose.
- Head position is fixed at x=300 in the artwork. The old per-token nudge was
  invisible and forced every shape to be arithmetic instead of a constant
  string, which matters enormously inside a contract.
