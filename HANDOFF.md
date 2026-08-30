# Proof — Engineering Handoff

**For:** Michael
**From:** ALFA
**Status:** prototype approved, backend not started

> **Later note.** This document is the original handoff and its reasoning still
> stands, but it is no longer an accurate status report. Since it was written,
> §5's anchor contract, Merkle proofs and standalone verifier have been built
> and proved against a real EVM, and §6's tier gating is enforced server-side
> with a test that fails when the gating is removed. Postgres (§2), the price
> sources of §3 and the frontend work in §9 have not been started. `CLAUDE.md`
> carries the current status; read this for the why, not the what.

---

## 0. What this is

A public register of token calls. Every call is recorded the second it fires,
measured against the market cap it fired at, and marked win / miss / dead.
Failed calls are never removed. That is the entire product — the tracking is
commodity, the *inability to quietly delete* is the moat.

**Files in this handoff**

| File | What it is | State |
|---|---|---|
| `proof.html` | Full frontend prototype, single file, live mock data | Approved by ALFA |
| `schema.sql` | Postgres DDL, runs as-is | Structurally verified |
| `contracts/ProofRenderer.sol` | On-chain character renderer | 666/666 parity, 1.61 M worst case |
| `contracts/ProofParts.sol` | Shape library, 38 variants | Split out for the 24KB limit |
| `signal-engine/` | Screener, scorer, integrity, API, analytics | Tested on fixtures + simulated market |
| `signal-engine/DEPLOY.md` | First live run checklist | Never run against real data |
| `contracts/ProofKeys.sol` | ERC-721 mint | Compiles, 8.7 KB |

Contracts compile with `solc 0.8.24`, **`viaIR: true` required** (stack depth).
`ProofRenderer.tokenURI` was executed against a real EVM — see §7 for measured gas.

---

## 1. The one product decision, and how the schema dodges it

ALFA has not committed to *house desk only* vs *track everyone*. The schema
does not force it: **a call always belongs to a caller, and the house desk is
just `callers.id = 1`.**

- Run as a single desk → seed one caller with `kind = 'house'`.
- Become a referee later → insert more callers, point `ingest_source` at their
  Telegram/X, backfill. **No migration.**

Do not build anything that assumes a single caller. The caller index panel in
the prototype is already wired for many.

---

## 2. Architecture

```
   Telegram / X watchers ─┐
   Manual desk entry ─────┼──▶  ingest   ──▶  calls (append-only)
   API ───────────────────┘                      │
                                                 ▼
   Codex.io / Birdeye WS ──▶  price worker ──▶ candles_1m ──▶ scorer ──▶ call_marks
                                                                            │
   ProofKeys (Base) ──▶ key sync ──▶ keys                                    ▼
                                       └──▶ auth (SIWE) ──▶ tier ──▶ feed API / WS
                                                                            │
   integrity worker ──▶ daily anchor tx ──▶ anchors                          ▼
                                                                        Next.js
```

Stack: Node 20 + TypeScript, Fastify, Postgres 15, Redis, BullMQ, Next.js 14,
viem. Deploy on the existing Hostinger VPS; Postgres and Redis in Docker.

---

## 3. The hard part: capturing peak honestly

This is where the product lives or dies. **If you poll every 60 s, a peak that
happened at second 30 is gone forever and every number on the site is a lie.**

### The rule

> **Peak = the highest 1-minute candle high since `fired_at`.**
> Spot ticks drive the live UI. They never decide a verdict.

Why this and not "highest thing our poller saw": it is deterministic, it
survives us going down for an hour, and anyone can recompute it from the same
public candles. That is what makes the register auditable rather than a claim.

### Sources

| Source | Use | Notes |
|---|---|---|
| **Codex.io** | primary, hot tracking | WS subscriptions, multichain, 1m bars |
| **Birdeye** | Solana fallback | good SOL coverage, REST + WS |
| **GeckoTerminal** | backfill, free | 1m OHLCV, rate limited |
| **DexScreener** | metadata, discovery | no reliable historical bars |

Write a `PriceSource` interface and implement all four. Never hardcode one — a
provider outage must not stop scoring, and disagreement between two providers is
information worth logging.

### Market cap: compute it yourself

**Never store a provider's `marketCap` field.** They disagree, they change
definitions, and it makes your numbers unreproducible.

```
mc = price × total_supply
```

Store `price` and `supply` separately in `candles_1m`. Freeze `entry_price`,
`entry_supply` and `entry_mc` on the call row at insert. If supply changes later
(burn, mint), the entry copy stays frozen — that is the point.

### Polling tiers

| Age | Spot | Candles | Purpose |
|---|---|---|---|
| < 24 h | 5 s (WS) | 1 m | live UI + verdict |
| 24 h – 7 d | 60 s | 1 m | drawdown, dead check |
| > 7 d | 15 min | 5 m | dead check only; peak frozen |

After settle, `peak_mc` is final. `now_mc` keeps updating forever so a win can
still be marked dead — both marks stay.

---

## 4. Scoring engine

Runs every minute over live calls. Pure function of candles — rerunnable from
scratch, and it must produce identical output when it is.

```ts
const peakX = peakMc / entryMc;
const nowX  = nowMc  / entryMc;

verdict = peakX >= 2 ? 'win' : (state === 'live' ? 'open' : 'miss');
isDead  = nowMc < entryMc * 0.10;          // orthogonal to verdict
state   = now() - firedAt > 24h ? 'settled' : 'live';
```

`seconds_to_2x` is set from the **first candle whose high ≥ 2 × entry**, and only
if `observed_live = true`. If a call was backfilled, leave `observed_live = false`
and the API omits the field. Never invent this number retroactively.

**Hit rate = wins / all calls in window.** Misses and dead calls stay in the
denominator. There is no code path that removes a call from a stat. If you find
yourself writing a `WHERE verdict != 'miss'`, stop.

---

## 5. Integrity — making "nothing gets deleted" true, not marketing

Right now the claim is unfalsifiable: we could edit a row and nobody could tell.
That is the same thing we accuse callers of. Fix it cheaply.

### Hash chain

On insert, build canonical JSON of the immutable fields only:

```
{caller, chain, token_address, fired_at (ISO µs),
 entry_price, entry_supply, entry_mc, source_kind, source_ref}
```

Keys sorted, no whitespace, numbers as strings.

```
record_hash = sha256(canonical)
chain_hash  = sha256(prev_chain_hash || record_hash)     // prev of seq-1
```

`calls` already has `RULE ... DO INSTEAD NOTHING` on UPDATE and DELETE, so the
DB itself refuses. Revoke UPDATE/DELETE on `calls` from the app role too.

### Daily anchor

Once a day, publish the current `chain_hash` head plus a Merkle root of that
day's `record_hash` values to a one-function contract on Base:

```solidity
event Anchored(uint64 seqTo, bytes32 chainHead, bytes32 merkleRoot);
function anchor(uint64 seqTo, bytes32 chainHead, bytes32 merkleRoot) external onlyOwner;
```

Cost is a few cents. Then ship:

- `GET /verify/:callId` → record hash, its Merkle proof, the anchoring tx
- a standalone `verify.ts` script that recomputes the whole chain from the public
  CSV export and diffs it against on-chain anchors

**Once this ships the tagline stops being a slogan.** It is the single highest-
leverage thing in this document and it is maybe two days of work.

---

## 6. Tier latency — must be server-side

The product sells *seconds*. Tier III sees a call instantly, Tier II at +5 s,
Tier I at +10 s, public at settle.

**Do not send the call to the browser and hide it.** Anyone opens devtools and
the entire business model is gone.

On insert compute:

```
publish_at = { t3: firedAt, t2: firedAt+5s, t1: firedAt+10s, public: firedAt+3600s }
```

- REST: `WHERE publish_at[session.tier] <= now()`
- WS: four rooms (`feed:t3`, `feed:t2`, `feed:t1`, `feed:public`), emit into each
  on its own timer. A socket joins exactly one room, decided server-side from the
  verified session.

### Auth

1. `GET /auth/nonce` → store in `auth_nonces`
2. Client signs SIWE message
3. `POST /auth/verify` → recover address, call `ProofKeys.bestTierOf(addr)`
4. Issue JWT, 5 min TTL, `{ addr, tier }`, refresh re-reads the chain

Cache ownership in `keys` for display, but **re-read the contract on refresh**.
The mirror table is never authoritative — someone can sell a key mid-session.

> `bestTierOf` loops all minted tokens. Fine as a `view` at 1111 supply; do not
> call it from a state-changing function. If supply ever grows, add an
> `ERC721Enumerable` index or track best-tier in a mapping on transfer.

---

## 7. NFT contracts

### Design

- 1111 max, Season 1 = 666, 5 per wallet
- Phases: Closed → Allowlist (Merkle) → Public
- **Commit-reveal seed.** `commitSeed(keccak256(seed))` before minting opens,
  `reveal(seed)` after it closes, contract verifies the preimage. Nobody —
  including us — can steer which token gets Tier III.
- `lockRenderer()` is one-way. After it, the art can never be changed by anyone.

### Tier distribution — one honest correction

The marketing copy in the prototype says *both* "400 / 200 / 66 keys" *and*
"60% / 30% / 10% odds". Those are contradictory unless you run a shuffle.

The contract implements **probabilistic odds** (9.91% / 30.03% / 60.06%),
verifiable on-chain by anyone. Actual counts will land near but not exactly on
400/200/66.

**Update the site copy to state odds, not fixed counts.** Do not ship the
contradiction — this is exactly the kind of thing the product exists to punish.

### Fully on-chain artwork — now matching the site

`ProofRenderer` draws the character: a hooded operator built from flat vector
layers, animated with SMIL so the motion is part of the token rather than
something the website adds. Split across two contracts (`ProofParts` holds the
38 shape variants) purely for the 24KB code limit.

**Parity is restored and verified token by token:**

```
PARITY TEST: 666 / 666 tokens match exactly
```

Reproduce with `node parity.js` — it compiles the contracts, deploys to a local
EVM, reads traits for all 666 tokens, then runs the same ids through the
browser build of `proof.html` and diffs them.

This has to be re-run after **any** art change. The site and the contract
diverge the moment either one moves, and a buyer receiving different art from
what was displayed is not a rough edge, it is mis-selling.

### Gas, and why it fell so far

| Version | Worst case |
|---|---|
| Guilloché curves, hand-rolled base64 | 34.3 M |
| Guilloché, OpenZeppelin base64, fewer steps | 8.9 M |
| **Character, flat shapes** | **1.61 M** |

Flat shapes cost a fraction of what 13 layered 68-point curves cost. Measured
across a spread of tokens, worst case 1.61M — comfortably under any RPC
`eth_call` cap, with room to add detail later.

One head position (x=300) for every key. The old ±4px per-token nudge was
invisible and it forced every shape to be arithmetic instead of a constant
string, which matters enormously inside a contract.

### The seed grinding hole is closed

Commit-reveal alone was not enough, and this was a real hole rather than a
theoretical one. A deployer who knows the secret can grind millions of
candidates offline, pick the one that hands them the Tier III tokens they
intend to buy, and only then publish the commitment.

`reveal()` now mixes the secret with `blockhash(revealBlock)` — a block that
did not exist when the commitment was made:

```solidity
seed = keccak256(abi.encodePacked(secret, blockhash(revealBlock)));
```

At commit time that hash is unknowable, so grinding buys nothing. `blockhash`
only reaches back 256 blocks, so reveal has a window; missing it forces a
`recommitSeed`, which increments a **public** counter. A deployer cannot
quietly reroll.

For a 666 supply on an L2 this is proportionate. VRF is stronger and worth the
cost if supply or price grows.

### Degenerate combinations are blocked

`_guard()` rewrites four combinations that render as a shapeless dark blob.
The same four rules run on the site, inside the same parity test.

---

## 8. OG images — the growth loop that is currently missing

ALFA has 65 K on X and 15 K on Telegram and the prototype has zero share
surface. Every call card should be a postable image.

- `GET /og/call/:id.png` — Satori + resvg on the API, 1200×630
- Renders entry / peak / now, the sparkline with the 2× threshold line, the
  verdict, the caller handle
- **Render losses too.** A miss card that says "we called this, it went -80%,
  it is still on the register" is far better marketing than another green
  screenshot. Nobody else will post those.
- `GET /og/caller/:handle.png` — hit rate, median peak, call count
- Cache 5 min live, immutable once settled

---

## 9. Frontend work remaining

The prototype covers the landing page, register feed, and mint. Still to build:

1. **Call detail page** `/call/:id` — full candle chart, entry marker, 2× line,
   peak marker, verify panel (record hash, Merkle proof, anchor tx)
2. **Caller profile** `/caller/:handle` — full history, hit rate over time,
   median by chain, *including* every miss
3. **Connected state** — replace the static Connect button with SIWE, show tier,
   show latency countdown on gated calls
4. **Localisation** — copy is currently English only; ALFA's audience is partly
   Indonesian. Extract strings to `en.json` / `id.json` before more copy is written
5. **Empty and error states** — currently only one empty state exists

Read the prototype for the design tokens; do not re-derive them. The colour
variables, spacing, and card structure in `proof.html` are approved.

---

## 10. Build order

| Phase | Work | Days |
|---|---|---|
| 1 | Schema, ingest, manual call entry, candle worker, scorer | 5 |
| 2 | Read API + Next.js port of the prototype against real data | 4 |
| 3 | Hash chain + daily anchor + `/verify` + verify script | 2 |
| 4 | SIWE auth, tier gating, WS rooms with per-tier timers | 3 |
| 5 | Contracts: tests, testnet, RPC gas benchmark, audit pass | 4 |
| 6 | OG images, call detail, caller profile, i18n | 4 |

Phase 3 before phase 5. The register has to be trustworthy before we sell
access to it.

---

## 11. Open items for ALFA

1. **Which callers seed the register at launch?** Just the desk, or a set of
   public callers tracked from day one?
2. **Mint chain** — contracts are written for an EVM chain (Base assumed). If
   the keys need to live somewhere else, say so before phase 5.
3. **Mint price and phase dates** — `0.08 ETH` is a placeholder.
4. **Brand name** — "Proof" is a placeholder in the prototype. Renaming touches
   the contract name, so decide before deploy.
5. **Copy fix** — tier counts vs odds, see §7. The prototype now states odds.
6. **Tier latency.** Still unresolved and it is a product problem, not an
   engineering one. Several hundred holders acting on a $25K token move it
   themselves, and Tier III entering 10s before Tier I means Tier I is buying
   Tier III's exit. The register will make the pattern visible. Either shrink
   the group, raise the cap floor, or stop selling latency and sell the
   screener instead.
7. **Legal review.** Not legal advice, but the shape of this — a token sold for
   ETH, granting paid access to trading signals, marketed with a hit-rate
   performance claim — touches both OJK and Bappebti territory in Indonesia.
   Given the fourtis.io hosting suspension, get someone qualified to look before
   the mint page goes live. The prototype now carries plain risk language on the
   mint panel; that is a floor, not a substitute.

---

## 12. Non-negotiables

- Never delete or update a row in `calls`.
- Never compute a stat that excludes misses.
- Never resolve tier gating in the browser.
- Never trust a provider's market cap field.
- Never backfill `seconds_to_2x`.

Every one of these is a place where the product quietly becomes the thing it
was built to replace.
