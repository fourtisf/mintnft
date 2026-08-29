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

## Verify before you trust anything

```bash
npm i solc@0.8.24 @openzeppelin/contracts@5.0.2 ethereumjs-util \
      @ethereumjs/vm@6 @ethereumjs/common@3 jsdom

node compile.js            # contracts build, all under 24KB
node parity.js             # must print 666 / 666
cd signal-engine
node test.js               # rules against fixtures
node simulate.js           # pipeline + integrity tamper test
node backtest.js           # threshold sweep, reason attribution
```

## The honest status

Everything here is tested against fixtures and a simulated market. **Nothing has
touched live market data.** The sandbox this was built in blocks
`api.dexscreener.com`.

So: the engine is correct in the sense that it does what it says. Whether what
it says is profitable is unknown, and Task 1 is the only thing that answers it.
Do that before the mint, not after.
