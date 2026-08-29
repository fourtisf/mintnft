# TASKS.md

Ordered prompts for Claude Code. Paste **one at a time**, in order. Each is
self-contained and ends with something you can check yourself.

Do not paste two at once. Each task changes assumptions the next one depends on,
and a session that tries to do three things at once will do all three badly.

---

## Task 1 — First live run

> Read CLAUDE.md. Then get `signal-engine/` running against real Dexscreener
> data for the first time.
>
> Before anything else, confirm the API is reachable from this machine:
> `curl -s "https://api.dexscreener.com/token-profiles/latest/v1" | head -c 200`
>
> Then run `node run.js --once` and read every line of the output with me. I
> want to know, specifically:
> - how many candidates were scanned, and how many died at each gate
> - whether any signal fired, and if so whether the reasoning reads sensibly
> - whether the rate limiter held, or whether we got 429s
>
> Do not change any threshold in `rules.js` yet. If almost nothing is being
> vetoed, tell me — that means the gates are too loose and we are about to
> write a bad hit rate onto a permanent record.
>
> Finish by writing what you found to `FIRSTRUN.md`.

**Check yourself:** at least 20 candidates scanned, most of them vetoed, and
every veto reason is a sentence you can read and agree with.

---

## Task 2 — Real discovery

> Read CLAUDE.md. `sources.js` has `HeliusSource` and `EvmFactorySource` but
> they have never run.
>
> Wire `HeliusSource` up with my key (in `.env`) and verify it actually returns
> fresh Solana mints. Then compare, over one hour: how many candidates does
> `ProfileSource` produce versus `HeliusSource`, and how many of each clear the
> gates.
>
> If Helius produces materially more, switch `index.js` to `MergedSource` with
> both. If it does not, tell me — I would rather know the extra key is not
> earning its place.

**Check yourself:** a number comparing the two sources, not an assurance that
it works.

---

## Task 3 — Postgres

> Read CLAUDE.md and `schema.sql`. Move `signal-engine/` from `FileStore` to
> Postgres, keeping the exact same `Store` interface so no worker changes.
>
> Requirements:
> - `calls` keeps the append-only RULEs; the app role has no UPDATE or DELETE
>   on it at all
> - the hash chain is computed in the app, not in SQL, and `verifyChain` still
>   passes against the migrated data
> - `stats`, `caller_stats` and `chain_stats` come from the SQL views, not from
>   ad hoc queries
> - a migration script that moves an existing `data/register.json` across
>   without breaking a single chain hash
>
> Prove it: run `node simulate.js` against Postgres and show me the integrity
> tamper test still detects both an edit and a deletion.

**Check yourself:** the tamper test output, not "migration complete".

---

## Task 4 — Next.js port

> Read CLAUDE.md. Port `prototype/proof.html` to Next.js 14 reading from the
> live API.
>
> The prototype is a design reference, not code to copy. Take the design tokens,
> layout, copy and interaction model exactly. Rewrite the logic properly: the
> character renderer becomes a real module, the browser-side SHA-256 goes away
> in favour of a server route, the mock data disappears entirely.
>
> Seven pages: Home, Register, Hindsight, Triage, Custody, Keys, and the call
> detail page. Every number must come from the API. If the API is down, show
> that it is down — do not fall back to invented data.
>
> Keep the character renderer byte-identical in output to the contract. Run
> `parity.js` against the ported version before you tell me it works.

**Check yourself:** `parity.js` printing 666/666 against the new build.

---

## Task 5 — Auth and gating

> Read CLAUDE.md, especially non-negotiable 3.
>
> Implement SIWE sign-in and tier gating:
> - `GET /auth/nonce` → `POST /auth/verify` → short-lived JWT carrying `tier`
> - tier read from `ProofKeys.bestTierOf(address)` on the chain, re-read on
>   every refresh, never trusted from the mirror table
> - four websocket rooms (`feed:t3`, `feed:t2`, `feed:t1`, `feed:public`), each
>   emitting on its own timer from `publish_at`
> - REST filtered by `publish_at[tier] <= now()`
>
> Write a test that proves a Tier I session cannot obtain a call inside the
> first ten seconds through any route — REST, websocket, or a crafted request.
> I want to see that test fail before the gating is added, and pass after.

**Check yourself:** the failing-then-passing test. An assurance is not enough
here; this is the business model.

---

## Task 6 — Contracts to testnet

> Read CLAUDE.md. Take `contracts/` to Base Sepolia.
>
> - Foundry tests covering: mint phases, wallet cap, allowlist proof, the
>   commit-reveal window, and that `reveal()` reverts both before `revealBlock`
>   and after `revealBlock + 256`
> - a test that grinding cannot work: given a fixed secret, show that the
>   resulting seed changes with the blockhash
> - benchmark `tokenURI` gas against the RPC providers we will actually use,
>   not just a local node. Report the numbers
> - deploy, then call `lockRenderer()` and show me it is irreversible
>
> Do not deploy to mainnet in this task.

**Check yourself:** the gas numbers from real RPC providers, and a reverting
`setRenderer` after lock.

---

## Task 7 — Growth surface

> Read CLAUDE.md. Three things, in this order:
>
> 1. `GET /og/call/:seq.png` — take the SVG from `og.js` and rasterise with
>    resvg-js. Cache immutable once settled, 5 minutes while live.
> 2. Wire `notify.js` Telegram push into the running orchestrator, including
>    the settle notification. **Losses get posted too** — that is deliberate.
> 3. Extract every user-facing string into `en.json` and `id.json`, with a
>    language toggle. Bahasa Indonesia matters; a good part of the audience
>    reads it first.
>
> For the OG images, show me a rendered PNG of a losing call before a winning
> one. If the loss card does not look good, the growth loop will not run.

**Check yourself:** the loss card as a PNG.

---

## Task 8 — Measure, then tune

> Read CLAUDE.md gap 4. Only start this after roughly 100 calls have settled.
>
> Pull the register, run it through `analytics.js`, and tell me:
> - does hit rate climb with score band? If it does not, the rules are wrong
>   and the threshold is irrelevant
> - which reason ids have lift meaningfully above 1.0
> - which reasons appear on nearly every call — those cannot be measured at all
>   and we need to sometimes fire without them to learn anything
>
> Then propose exactly one change to `rules.js`, with the number that justifies
> it. One change, measured, not a rewrite.

**Check yourself:** one proposed change with a number attached, not a list.

---

## What not to send

Do not paste the whole prototype and ask for "the same thing but real". It is
4,000 lines of single-file code with mock data, browser hashing and inline
styles. Claude Code will faithfully reproduce all of it, including the parts
that only exist because it had to run from a `file://` URL.

Send `CLAUDE.md` plus the one task. That is enough.
