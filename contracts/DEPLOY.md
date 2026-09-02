# Minting the keys

Nothing here has ever run against a real chain. Every number below was measured
on `@ethereumjs/vm` by `contracts/test-keys.js`, which is a real EVM but not a
real network — so treat the first mainnet transaction as a run to be watched,
not a formality.

Read this whole file before sending anything. Two steps have deadlines and one
of them is about eight minutes wide.

## 0. Prove the build first

```bash
npm i
node compile.js               # four contracts, all under the 24KB limit
node parity.js                # must print 666 / 666
node contracts/test-keys.js   # the mint, the allowlist, the cap, the reveal
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
export DEPLOY_RPC=https://mainnet.base.org
export DEPLOY_PK=0x…                 # from the environment, never an argument:
                                     # an argument lands in shell history and ps

node contracts/keys.js deploy --owner 0xYourSafe            # reads it back to you
node contracts/keys.js deploy --owner 0xYourSafe --confirm  # sends
```

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

The contract ships at **0.0005 ETH allowlist / 0.0015 ETH public**, which is
roughly $1.50 and $4.50 at ETH $3,000 and stays inside the $1–$10 band anywhere
between about $2,000 and $6,500. If ETH has left that range, set both before
opening anything:

```bash
node contracts/keys.js prices 0.0005 0.0015 --confirm
```

Both move together, so the allowlist can never be left at a stale figure while
the public price moves. The site prints these numbers as literals in
`site/index.html` and `site/assets/app.js` — change them there too, or the page
quotes a price the contract will reject.

## 3. Allowlist

The leaf is `keccak256(abi.encodePacked(msg.sender))` and pairs hash in sorted
order, which is what OpenZeppelin's `MerkleProof` verifies. `contracts/allowlist.js`
produces both the root and each address's proof, and it is the same code
`test-keys.js` checks against the on-chain verifier — do not generate the root
with anything else.

```bash
node contracts/keys.js allowlist-root allowlist.txt --confirm
# -> out/proofs.json, and setAllowlistRoot on-chain
```

Then point the engine at that file:

```
ALLOWLIST_PROOFS=/opt/proof/signal-engine/proofs.json
```

The site asks `/api/keys/state?address=…` and is handed that address's proof if
it has one. An address not in the file cannot mint, and a proof from one address
does not work for another — the leaf is the caller, not an argument. If the file
and the on-chain root disagree, the panel refuses and says so rather than
handing out a proof that would fail in the wallet.

Changing the root revokes the old list immediately. There is no way to add one
address without republishing the whole root.

## 4. Opening and closing

```bash
node contracts/keys.js phase allowlist --confirm
node contracts/keys.js phase public --confirm
node contracts/keys.js phase closed --confirm
node contracts/keys.js state              # what the chain actually says
```

`seasonCap` starts at 666 and bounds **every** mint path, the treasury's
included. Raising it is `openSeason(newCap)`, one direction only, never past
`MAX_SUPPLY` (1111), and it emits `SeasonOpened` — so the supply on the site
cannot grow without a public record of the moment it did.

## 5. The reveal, and its deadline

The seed is committed before minting and revealed after it closes. The final
seed mixes the committed secret with `blockhash(revealBlock)`, so nobody can
grind outcomes offline before committing — not even the deployer.

```bash
node contracts/keys.js commit "<your secret>" --delay 10 --confirm
#   … mint …
node contracts/keys.js phase closed --confirm
node contracts/keys.js state              # prints the blocks left in the window
node contracts/keys.js reveal "<your secret>" --confirm
```

Keep the secret somewhere outside this repository. Without it the seed can never
be opened and the collection never gets tiers.

`reveal()` refuses while any phase other than Closed is set. Once the seed is
public every token's tier is computable, so a mint left open would let anyone
time a transaction onto the id they want — the exact thing the commitment
exists to prevent. The contract refuses rather than trusting the operator to
remember the order, and `setPhase` will not reopen minting afterwards.

**`blockhash` only reaches back 256 blocks.** On Base at 2s blocks that is about
**8 minutes 30 seconds** after `revealBlock`. Miss it and `reveal()` reverts
`WindowMissed` permanently for that commitment.

So:

- Pick `delay` small — 10 blocks is about 20 seconds on Base. A long delay buys
  nothing and only widens the gap you have to be awake for.
- Have the reveal transaction built and funded *before* `revealBlock` arrives.
- Watch it land. Do not fire and walk away.

If the window is missed, `recommitSeed(newCommitment, delay)` reopens it. It
increments `recommitCount`, which is public on-chain, so a deployer cannot
quietly reroll until they like the outcome — anyone who reads the contract sees
the counter. **The Keys page does not surface it yet**, so today "public" means
"readable by someone who goes looking", not "shown". Say so yourself when it
happens; it is a worse story when someone else finds the counter first.

## 6. Money

```bash
node contracts/keys.js withdraw 0xTreasury --confirm
```

Sends the whole balance and reverts if the recipient rejects it, so a contract
that cannot receive ETH fails loudly instead of stranding the funds. Test with
a small amount to the real destination before the mint, not after.

## 7. Wire the backend

`signal-engine/.env`:

```
KEYS_CONTRACT=0x…
BASE_RPC=https://…
KEYS_CHAIN_ID=8453
KEYS_EXPLORER=https://basescan.org
ALLOWLIST_PROOFS=/opt/proof/signal-engine/proofs.json
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
allowlist-root, commit, reveal, withdraw — against a JSON-RPC node over a real
socket backed by a real EVM, including a reveal window that is deliberately
missed. So the commands work. What that cannot cover:

- **No transaction here has ever been sent to a real network.** Block times, fee
  markets, reorgs and RPC failure modes are all absent from the test.
- The reveal window has never been exercised against real block times, which is
  the one deadline in this file.
- `bestTierOf` gas is measured on a local EVM at a 661-token season, not on Base.
- The mint page has been tested against a stubbed wallet, not MetaMask.

Base Sepolia first, with the whole cycle — deploy, allowlist, mint, close,
reveal — and watch the window land. It costs a testnet faucet and an evening,
and it is the only thing that turns the list above into experience.
