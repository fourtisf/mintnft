# Minting the keys

Target chain is **Robinhood Chain** — mainnet `4663`
(`https://rpc.mainnet.chain.robinhood.com`), testnet `46630`
(`https://rpc.testnet.chain.robinhood.com`). ETH is the gas token on both.

Nothing here has ever run against a real chain. Every number below was measured
on `@ethereumjs/vm`, which is a real EVM but not a real network — so treat the
first mainnet transaction as a run to be watched, not a formality.

## The one thing to understand before you start

Robinhood Chain runs Arbitrum Nitro. On Nitro, `block.number` is an estimate of
the **Ethereum** block number, and `blockhash()` does not come from L1 and is
documented by Arbitrum as cryptographically insecure. An earlier version of this
contract mixed `blockhash()` into the season seed, which is correct on Ethereum
and on the OP Stack and would have been a broken promise here.

So the seed is built from three things instead:

```
seed = keccak256(secret, mintEntropy, entropyHash)
```

| Ingredient | Who fixes it | Why it cannot be ground |
|---|---|---|
| `secret` | you, before minting opens | published at reveal; `keccak256(secret)` must match the commitment |
| `mintEntropy` | every mint, as it happens | at commit time the mint has not opened, so there is nobody to grind against |
| `entropyHash` | Ethereum mainnet | its block number is fixed in the commitment, before that block exists |

The chain cannot read Ethereum, so `entropyHash` is submitted at reveal and
stored. **The contract does not verify it — everybody else does**, with one
`eth_getBlockByNumber` against any Ethereum node, forever. `keys.js state` runs
that check itself and prints `cocok` or `TIDAK COCOK`.

Dropping `blockhash()` also means **there is no reveal deadline any more.**
Nothing in the seed decays. The old design gave 256 blocks to reveal in and was
the most dangerous line in this file; it is gone.

## 0. Prove the build first

```bash
npm i
node compile.js               # four contracts, all under the 24KB limit
node parity.js                # must print 666 / 666
node contracts/test-keys.js   # the mint, the phases, the cap, the reveal
node contracts/test-deploy.js # this runbook's own commands, against a real EVM
node test-tier.js             # the backend's tier read reaches the real function
node site/test-mint.mjs       # the calldata the page sends is what the ABI encodes
```

`parity.js` printing anything other than 666/666 stops the deploy. Everything
else is recoverable; that one is not — it means a minted key would render
differently on the site than in the contract, and a buyer would be receiving
something other than what was displayed.

## 1. Deploy

`contracts/keys.js` is the only thing in this repository that sends a
transaction. Every command is a dry run until `--confirm` is added: without it
you get the exact call, the account it comes from, the gas and the cost, and
nothing is sent.

```bash
export DEPLOY_RPC=https://rpc.mainnet.chain.robinhood.com
export DEPLOY_PK=0x…                 # from the environment, never an argument:
                                     # an argument lands in shell history and ps
export ETH_RPC=https://…             # any Ethereum mainnet endpoint. Read only;
                                     # nothing is ever sent to it. Needed for the
                                     # seed's third ingredient.

node contracts/keys.js ping                                 # are both RPCs alive
node contracts/keys.js deploy --owner 0xYourSafe            # reads it back to you
node contracts/keys.js deploy --owner 0xYourSafe --confirm  # sends
```

Start with `ping`. Every other command opens with a network call, and an RPC
that accepts a connection and never answers is the failure that looks most like
work in progress. Nothing here waits longer than fifteen seconds (`RPC_TIMEOUT_MS`
if you need more); when it gives up it names the endpoint and hands you the curl
to check it yourself.

Omit `--owner` and the deployer's own address is used.

It deploys in the only order that works — `ProofRenderer` needs `ProofParts`,
`ProofKeys` needs `ProofRenderer` — and writes the three addresses to
`out/keys.<chainId>.json`. A second deploy is refused unless you pass `--again`,
because it would create a second collection rather than update the first.

Compile with `viaIR: true` — it is not optional, `ProofRenderer` does not
compile without it. `contracts/build.js` is the only place that setting lives,
and both harnesses build through it, so verifying on a block explorer means
reproducing exactly those settings: solc 0.8.24, optimizer on, 200 runs,
`viaIR: true`.

Do **not** call `lockRenderer()` until a token has been rendered from the
deployed renderer and looked at. It is one-way and nobody can undo it, owner
included.

## 2. Price

Three tranches, and the contract keeps all three:

| | wei | at ETH $3,000 |
|---|---|---|
| `priceOne` | 0.0007 ETH | ~$2 |
| `priceTwo` | 0.0017 ETH | ~$5 |
| `priceThree` | 0.0033 ETH | ~$10 |

Flat inside a phase, so a basket cannot straddle a price change mid-transaction.
`setPrices` refuses a ladder that falls — a schedule that drops partway through
charges the earliest buyers the most.

Robinhood Chain's gas token is ETH, so these are the same units a buyer already
holds. The wei figures are today's arithmetic; the dollar figures are the
promise, so re-run `prices` on deploy day against the actual ETH price. If ETH has left that range, set both before
opening anything:

```bash
node contracts/keys.js prices 0.0007 0.0017 0.0033 --confirm
```

Phase 1, 2 and 3. All three move together so none is left stale, and the site
prints them as literals in `site/index.html` — change them there too or the page
quotes a price the contract will reject.

All three move together, so no phase is left at a stale figure while another
moves. The site prints these numbers as literals in
`site/index.html` and `site/assets/app.js` — change them there too, or the page
quotes a price the contract will reject.

## 3. Opening and closing

Three phases, every one of them public. There is no allowlist: anybody can mint
in any open phase, and the only thing that changes between them is the price.

```bash
node contracts/keys.js phase 1 --confirm   # ~$2
node contracts/keys.js phase 2 --confirm   # ~$5
node contracts/keys.js phase 3 --confirm   # ~$10
node contracts/keys.js phase closed --confirm
node contracts/keys.js state               # what the chain actually says
```

You decide when each one opens; nothing moves on its own. The supply figures on
the site (111 / 222 / 333) are the plan, not a rule the contract enforces —
watch `state` and open the next phase when you want to.

Phases only climb. Going back to a cheaper one after the dearer one has run
would let whoever waited buy under the people who showed up first, so the
contract refuses it. Closing is always allowed, so a mint can be paused.

`seasonCap` starts at 666 and bounds **every** mint path, the treasury's
included. Raising it is `openSeason(newCap)`, one direction only, never past
`MAX_SUPPLY` (1111), and it emits `SeasonOpened` — so the supply on the site
cannot grow without a public record of the moment it did.

## 5. The reveal

```bash
node contracts/keys.js commit "<your secret>" --ahead 600 --confirm
#   … mint …
node contracts/keys.js phase closed --confirm
node contracts/keys.js reveal "<your secret>" --confirm
```

`--ahead` is how many Ethereum blocks into the future to pin the seed's third
ingredient. 600 is about two hours; the minimum is 100. Pick it so the block is
comfortably unmined when the commit lands, and so the mint has finished before
it arrives — you cannot reveal until that block exists.

**Keep the secret somewhere outside this repository.** Without it the seed can
never be opened and the collection never gets tiers.

`reveal()` refuses while any phase other than Closed is set. Once the seed is
public every token's tier is computable, so a mint left open would let anyone —
the treasury included — time a transaction onto the id they want. That is the
exact thing the commitment exists to prevent, so the contract refuses rather
than trusting the operator to remember the order, and `setPhase` will not
reopen minting afterwards.

`keys.js state` tells you where you are: whether the Ethereum block exists yet
and how many minutes away it is, and after the reveal it recomputes the seed
from the published ingredients and checks the stored hash against a live
Ethereum node.

`recommitSeed` replaces a commitment made wrongly, but **only while nothing has
been minted**. After the first mint the deployer can compute what the seed would
be, so a second commitment there is a reroll whatever it was meant for, and the
contract refuses. `recommitCount` is public either way.

## 6. Money

```bash
node contracts/keys.js withdraw 0xTreasury --confirm
```

Sends the whole balance and reverts if the recipient rejects it, so a contract
that cannot receive ETH fails loudly instead of stranding the funds. Test with
a small amount to the real destination before the mint, not after.

## 7. Wire the backend

The engine reads `process.env` and nothing else — it loads no `.env` file.
Writing one is the failure this whole document exists to avoid: nothing errors,
the site comes up, and every holder silently sits at public tier. Use a systemd
drop-in, which also survives `golive.sh` reinstalling the unit:

```
mkdir -p /etc/systemd/system/nekara-engine.service.d
printf '[Service]\nEnvironment=KEYS_CONTRACT=0x…\nEnvironment=KEYS_RPC=https://rpc.mainnet.chain.robinhood.com\n' \
  > /etc/systemd/system/nekara-engine.service.d/keys.conf
systemctl daemon-reload && systemctl restart nekara-engine
```

`KEYS_CHAIN_ID` defaults to 4663 and `KEYS_EXPLORER` to
`https://robinhoodchain.blockscout.com`; set them only on the testnet, where
they are `46630` and `https://explorer.testnet.chain.robinhood.com`.

**Both** `KEYS_CONTRACT` and `KEYS_RPC` are required. With one of the two the
engine does not complain — it falls back to public tier for everyone, which is
correct behaviour and indistinguishable from a typo. Read it back rather than
assuming:

```
journalctl -u nekara-engine -n 30 --no-pager | grep -i "tier\|keys"
curl -s https://nekara.xyz/api/keys
```

The engine logs which of these it got at boot, in both directions — a mint panel
that is not wired says so on the page rather than rendering zeroes.

`bestTierOf(address)` is what decides which latency queue a session joins. It
costs about 40K gas for a five-key holder and nothing for a non-holder, and it
does not grow with the season — but it is read over an RPC, and an RPC that is
down reads as tier 0, never as a promotion. That is deliberate: `test-tier.js`
pins it. It also means a provider outage silently demotes paying holders to the
public queue, so alert on it.

## What is still unproven

`contracts/test-deploy.js` runs every command above — deploy, phase, prices,
commit, reveal, withdraw — against a JSON-RPC node over a real
socket backed by a real EVM, with a second node standing in for Ethereum
mainnet, including a reveal a hundred thousand blocks after the commit. So the
commands work. What that cannot cover:

- **No transaction here has ever been sent to a real network.** Block times, fee
  markets, reorgs and RPC failure modes are all absent from the test.
- Robinhood Chain's own behaviour: sequencer latency, whether its public RPC
  holds up under a mint, and how `block.number` reporting an L1 number actually
  feels in practice.
- `bestTierOf` gas is measured on a local EVM at a 661-token season.
- The mint page has been tested against a stubbed wallet, not MetaMask.

**Robinhood Chain testnet (46630) first, the whole cycle** — deploy, open each
phase, mint, close, reveal — with a real Ethereum block as the seed's third ingredient.
It costs a testnet faucet and an evening, and it is the only thing that turns
the list above into experience.
