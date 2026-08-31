# Proof — handoff

## Send order

1. Put this whole folder in a git repo.
2. Run `claude` inside it. `CLAUDE.md` is read automatically every session.
3. Open `TASKS.md` and paste **one task at a time**, in order.

That is it. Do not paste the prototype and ask for "the same but real" — see
the last section of TASKS.md for why.

## What each file is for

| File | Who reads it |
|---|---|
| `CLAUDE.md` | Claude Code, automatically, every session. The non-negotiables live here. |
| `TASKS.md` | You. Eight ordered prompts, each with something you can check yourself. |
| `HANDOFF.md` | Architecture and the reasoning behind each decision. Read once. |
| `schema.sql` | Postgres DDL. Runs as-is. |
| `contracts/` | Solidity. Compiles with `viaIR: true`. |
| `signal-engine/` | The working engine. Start here — it is the actual product. |
| `signal-engine/DEPLOY.md` | First live run checklist. |
| `prototype/proof.html` | Design reference. Open it in a browser, do not port it line by line. |
| `parity.js` | Proves contract and site agree. Run after every art change. |
| `signal-engine/verify.js` | Standalone verifier. Recomputes the register from the public CSV and diffs it against the on-chain anchor — reads nothing of ours. |

## Verify before you trust anything

```bash
npm i                      # deps are pinned in package.json

node compile.js            # contracts build, all under 24KB
node parity.js             # must print 666 / 666
node test-anchor.js        # anchor + Merkle proof on a real EVM, then the
                           # public CSV recomputed by the standalone verifier
node test-tier.js          # the tier read reaches the real ProofKeys function
node site/test-live.mjs    # the real page against the real engine: an engine
                           # that is down reads as down, one that is up and
                           # empty reads as empty, and a fired signal reaches
                           # the DOM over the socket rather than on the poll

cd signal-engine
node test.js               # rules against fixtures
node simulate.js           # pipeline + integrity tamper test
node backtest.js           # threshold sweep, reason attribution
node test-gating.js        # Tier I cannot get a call inside 10s, any route
node test-gating.js --nogate   # the same test failing, on purpose
```

## The honest status

Everything here is tested against fixtures and a simulated market. **Nothing has
touched live market data.** The sandbox this was built in blocks
`api.dexscreener.com`.

So: the engine is correct in the sense that it does what it says. Whether what
it says is profitable is unknown, and Task 1 is the only thing that answers it.
Do that before the mint, not after.

The integrity claim is a separate question from the profitability one, and it
is now testable rather than asserted: `test-anchor.js` publishes a register to a
real EVM and shows that an edited row, a removed row, and a call moved to
another desk all fail to verify against what was published. What is still
missing there is a publisher with a funded key — until one is wired,
`/api/verify` says the register is unanchored, and it means it.
