# Launch copy

Post text for the banners in `banners/`. Written in the site's voice: plain,
exact, no hype. Every claim here is about the mechanism, not about results —
see **Before you post** at the bottom, which is not optional.

---

## Profile

**Name** — `Nekara`

**Bio.** The header already carries the statement, so the bio should not
repeat it. Its job is the mechanism — why the claim is checkable.

Recommended (155 / 160):

> An automated screener across four chains. Every call is hashed into an
> append-only register — the misses stay up because the schema refuses to
> delete them.

Shorter (136), if you want the chains named:

> Automated signals across Solana, Base, BNB and Ethereum. Every call hashed
> into an append-only register, so the misses cannot come down.

Sharpest (125), once the account has calls to back it:

> Wins, misses and the ones that died, on the same page, under the same rules.
> Removing any of them breaks every hash after it.

**Pinned post** — use post 1 below.

---

## The thread

Seven posts. Post 1 stands alone if you'd rather open quietly and run the rest
later; 2 through 7 read in order.

### 1 · `p0-intro.png`

> Nekara — a public register of automated trading signals.
>
> A screener reads liquidity, buy pressure and volume acceleration across
> Solana, Base, BNB and Ethereum. Every signal it fires is published with the
> exact conditions that triggered it, then tracked to win, miss or dead.
>
> Failed calls are never removed.

*Short (269):* Nekara — a public register of automated trading signals. A
screener reads liquidity, buy pressure and volume acceleration across four
chains. Every signal is published with the conditions that fired it, then
tracked to win, miss or dead. Failed calls are never removed.

*Alt:* The Nekara mark and wordmark over the register page, dimmed back.

### 2 · `p5-scan.png`

> Most of the work is refusal.
>
> Four schedules run one process with no manual step: discovery, hot scorer,
> warm scorer, anchor. Everything scanned is counted, and what dies at the
> gates is counted with it.
>
> A pass rate only means something if you can see the denominator.

*Alt:* A panel headed "Last 24 hours" listing candidates scanned, killed at the
gates, cleared but scored low, signals fired, and the pass rate.

### 3 · `p1-triage.png`

> Every rejection is published with the gate that killed it.
>
> Liquidity under the floor. Already doubled in five minutes — that is the top,
> not the entry. Four minutes old, inside the sniper window. No socials and no
> site, nothing behind the ticker.
>
> Anyone claiming a hit rate should also show what they passed on.

*Alt:* A list of rejected candidates, each with the reason it was rejected and
a tag for the gate that killed it.

### 4 · `p4-gates.png`

> Eight hard vetoes run before anything is scored.
>
> Liquidity floor. Age window. Cap window. Liquidity-to-cap. Sell pressure.
> Entry angle. Identity. Quote asset.
>
> Any single failure kills a signal no matter how good the rest looks. The
> thresholds are published, so the filter can be argued with.

*Alt:* A panel headed "Active gates" listing each veto with its threshold.

### 5 · `p3-hindsight.png`

> Peak × is a ceiling nobody sold at.
>
> So the register applies a real exit rule to every call in it, takes 5%
> round-trip cost off each one, and plots the running result. Losses included.
>
> The distance between an average peak and what an exit rule actually returns
> is the reason peak and now are always shown next to each other.

*Alt:* An equity curve under a set of exit rules, with the resulting return,
profitable calls and worst drawdown beneath it.

### 6 · `p2-custody.png`

> Every call is hashed at insert and chained onto the one before it. Remove one
> and every hash after it breaks.
>
> The head is recomputed from the full register in your browser, and published
> on-chain once a day — so the record is checkable by anyone, not only by us.
>
> There is a button on the page that deletes a call, so you can watch it fail.

*Alt:* The chain head, and a tamper check reporting that a call was removed at
sequence 3 and the published anchor no longer matches what is stored.

### 7 · `b3-method.png`

> A win and a call that died sit on the same page, under the same rules, both
> still carrying the reasons that fired them.
>
> The tracking is commodity. The product is the inability to quietly delete.

*Alt:* Two call cards side by side — one marked WIN, one marked DEAD — each
showing its score, the conditions that fired it, and its entry, peak and
current market cap.

---

## Spare posts

For the days after launch, when the thread is spent.

> A screener that never refuses anything is a random number generator with a
> logo. What a filter rejects is the only evidence it is a filter.

> Peak is the number every track record is quoted in, and the number nobody
> actually sold at. Both get shown here, side by side, always.

> Corrections are new rows. The schema refuses updates and deletes outright —
> not as policy, as a database rule. Nothing gets edited into a better story
> after the fact.

> Hit rate here is wins over every call, including the ones that died. A rate
> that quietly drops its misses is not a rate.

---

## Before you post

**The numbers in the banners are mock data.** They come from the design
prototype's seed — 412 scanned, 12 fired, 2.42×, −93.2%. The engine has been
tested against fixtures and a simulated market, and has never run against live
data. The copy above is written to describe how the register works and never
to claim a track record, and it needs to stay that way until real calls exist.
Presenting those figures as performance would be the first false thing on the
account, and this whole product is an argument against exactly that.

**No domain or contract address is written into any of this.** Add the link
wherever you want it — a reply on post 1 is the usual place. The contract is
not out yet, so do not imply otherwise.

**The site still says the key sale is open.** The Keys page reads
"Phase 2 open · 412/666 minted · 0.08 ETH" with a Connect Wallet button, and no
contract is deployed. Anyone arriving from post 1 can reach it. Fix that before
the thread goes up.
