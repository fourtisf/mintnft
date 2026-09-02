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
node compile.js            # four contracts, all under the 24KB limit
node parity.js             # must print 666 / 666
node contracts/test-keys.js  # the mint, the allowlist, the cap, the reveal
node test-tier.js          # the backend's tier read reaches the real function
```

`parity.js` printing anything other than 666/666 stops the deploy. Everything
else is recoverable; that one is not — it means a minted key would render
differently on the site than in the contract, and a buyer would be receiving
something other than what was displayed.

## 1. Order of deployment

`ProofRenderer` needs `ProofParts`, and `ProofKeys` needs `ProofRenderer`.

```
ProofParts      (no arguments)
ProofRenderer   (partsAddress)
ProofKeys       (rendererAddress, ownerAddress)
```

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

```
setPrices(allowlistWei, publicWei)
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
node contracts/allowlist.js allowlist.txt proofs.json
# -> root  0x…      and every proof, keyed by address
```

Then `setAllowlistRoot(root)`, and serve `proofs.json` to the front end. An
address not in the file cannot mint, and a proof from one address does not work
for another — the leaf is the caller, not an argument.

Changing the root revokes the old list immediately. There is no way to add one
address without republishing the whole root.

## 4. Opening and closing

```
setPhase(1)   Allowlist
setPhase(2)   Public
setPhase(0)   Closed
```

`seasonCap` starts at 666 and bounds **every** mint path, the treasury's
included. Raising it is `openSeason(newCap)`, one direction only, never past
`MAX_SUPPLY` (1111), and it emits `SeasonOpened` — so the supply on the site
cannot grow without a public record of the moment it did.

## 5. The reveal, and its deadline

The seed is committed before minting and revealed after it closes. The final
seed mixes the committed secret with `blockhash(revealBlock)`, so nobody can
grind outcomes offline before committing — not even the deployer.

```
commitSeed(keccak256(secret), delay)   delay >= 5 blocks
… mint …
setPhase(0)                            minting must be closed first
reveal(secret)
```

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

```
withdraw(payable to)
```

Sends the whole balance and reverts if the recipient rejects it, so a contract
that cannot receive ETH fails loudly instead of stranding the funds. Test with
a small amount to the real destination before the mint, not after.

## 7. Wire the backend

`signal-engine/.env`:

```
KEYS_CONTRACT=0x…
KEYS_RPC=https://…
```

`bestTierOf(address)` is what decides which latency queue a session joins. It
costs about 40K gas for a five-key holder and nothing for a non-holder, and it
does not grow with the season — but it is read over an RPC, and an RPC that is
down reads as tier 0, never as a promotion. That is deliberate: `test-tier.js`
pins it. It also means a provider outage silently demotes paying holders to the
public queue, so alert on it.

## What is still unproven

- No transaction in this repository has ever been sent to a real network.
- The reveal window has never been exercised against real block times.
- `bestTierOf` gas is measured on a local EVM at a 661-token season, not on Base.
