# Post templates

Fill-in patterns for the posts that recur. `COPY.md` is the launch thread —
written once, posted once. This is the rest of the account's life.

Per-call posts are **not** here. The site generates those from the call record
itself (`tplX` in `app.js`, the "Post templates" button on any call), so a post
can never quietly disagree with the register. Use that button, not a template.

Slots look like `{this}`. Anything in a slot must come from the register or
from `/api/analytics` — never from memory, and never rounded in your favour.

---

## Voice

Six rules. They are what makes the account sound like the product.

1. **No exclamation marks, no emoji, no rocket.** The claim is that this desk
   is boring and checkable. Punctuation that shouts undoes it in one character.
2. **Peak never appears alone.** Every multiple gets its `now` beside it. This
   is a non-negotiable in the codebase; it is also the thing nobody else does.
3. **Never quote a rate that drops the misses.** If you catch yourself writing
   "of our winners", stop — that sentence has no denominator.
4. **Say the number, then what it means.** "42% hit rate over 33 calls" beats
   "great week". A number with no n attached is a vibe.
5. **Losses get the same tone as wins.** No apology, no spin, no "shake it
   off". A dead call is a data point the register keeps; write it that way.
6. **Never promise a return, a price, or a next call.** Describe what the
   system did. The reader decides what it is worth.

---

## Keys

Works with the banner or with a screenshot of the Keys page — the image carries
the artwork either way, so the copy should carry the idea.

**A — the short one.** Lead with the tension, not the supply.

> Everyone gets the same calls.
>
> A key only changes how many seconds early they land — which, in this market,
> is the whole game.
>
> 666 keys. Access to a feed, not an investment.

**B — the one that names what you are buying.**

> What a key buys is not information. It is the head start on it.
>
> Same calls for every holder, same register, same reasons attached. Tier moves
> one thing: when it reaches you.
>
> 666 keys. Access to a feed, not an investment.

**C — one line, for a reply or a quote post.**

> A key does not buy better calls. It buys the same ones, earlier.

**D — when the image is the gallery.** The odds are the interesting part here,
so say them.

> 666 keys, every one drawn from its own token number.
>
> Tier is rolled once, on reveal, from a single seed for the whole season —
> published odds, no shuffle. The last key minted can still pull the best one.
>
> What it unlocks is latency. Everyone gets the same calls.

**Do not add a price, a supply counter, or a mint link until the contract is
deployed.** Attaching either to a post is advertising a sale that does not
exist, and it is the one mistake this account cannot walk back.

When the contract is live, the line to add is the address and the phase — never
"don't miss out", never a countdown.

---

## Daily recap

Post with `s1-scoreboard.png`, re-rendered from the real register.

> {n} calls in 24 hours. {w} cleared 2×, {d} died.
>
> {best_ticker} ran to {best_peak}× and sits at {best_now}×.
> {worst_ticker} peaked {worst_peak}× and is at {worst_now}×.
>
> Every one of them is still on the register, with the conditions that fired
> it attached.

If the day had no wins, post it anyway with the same shape. A recap that only
appears on good days is a highlight reel, and the register will show the gap.

---

## Weekly

> Week {n}: {calls} calls, {hit}% cleared 2×.
>
> Median peak {med_peak}×. Under a sell-at-2× rule with 5% round trip, that
> came out at {return}% per call.
>
> The gap between those two numbers is why peak sits next to now on every card.

---

## Caller leaderboard

Post with `p6-callers.png`, re-rendered.

> {top_caller} is top of the board this week — {hit}% over {n} calls, median
> peak {med_peak}×, median now {med_now}×.
>
> Ranked on hit rate over every call, misses in the denominator. No best-ever
> column: one 200× does not make a caller.

---

## A call that died

Only when it is worth saying more than the auto-generated post does.

> {ticker} is dead. Entry {entry}, peaked {peak}×, now {now}×.
>
> It fired on {reason}. That reason has a {lift} lift across {n} calls, so it
> earns its place — this one still went to nothing.
>
> Nothing gets taken down. The hit rate on the site already counts this.

---

## Answering the questions you will get

**"What's your winrate?"**

> {hit}% over {n} calls, all of them — the dead ones are in the denominator.
> Hindsight has the breakdown by score band and by chain, and the register has
> every call it is computed from.

**"Where's the CA / when mint?"**

> No contract yet. When there is one it goes on the site first and the address
> will be in the nav, not in a reply. Anything that DMs you an address before
> then is not us.

**"How do I know you don't delete the bad ones?"**

> Every call is hashed at insert and chained onto the one before it, so
> removing one breaks every hash after it. The head is recomputed in your
> browser on the Custody page, and published on-chain daily. There is a button
> there that deletes a call so you can watch the check fail.

**"Is this financial advice / are you telling me to buy?"**

> No. It publishes what a screener fired and what happened next. What you do
> with that is yours.

**"Why so few calls?"**

> Most candidates die at the gates — that is the design. Triage publishes the
> rejections with the gate that killed each one, so you can check the filter is
> actually strict rather than taking our word for it.

---

## What never gets posted

- A multiple without its `now`.
- A hit rate without its n.
- A screenshot of a winner with the losses cropped out.
- "We called it at X" for a call not in the register.
- A price or mint link before the contract exists.
- Anything from the design prototype's seed data — $WHALES, $BRASS, $FINE,
  412 scanned, 2.42×. Those are mock. Re-render every banner from the real
  register before it goes anywhere.
