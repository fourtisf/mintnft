# First live run

Everything below has been tested against fixtures and a simulated market.
**None of it has touched real market data** — this sandbox cannot reach
api.dexscreener.com (`x-deny-reason: host_not_allowed`). This is the checklist
for the run that changes that.

## 1. Box

Node 20+. Any small VPS. The engine is one process and a JSON file; Postgres
can wait until there are enough calls to justify it.

```bash
sudo useradd -r -s /usr/sbin/nologin proof
sudo mkdir -p /opt/proof /var/log/proof
sudo chown -R proof:proof /opt/proof /var/log/proof
# copy signal-engine/ to /opt/proof/signal-engine
cp .env.example .env      # fill it in
```

## 2. Check the API is reachable before anything else

```bash
curl -s "https://api.dexscreener.com/token-profiles/latest/v1" | head -c 200
```

Anything other than JSON and nothing downstream will work.

## 3. Dry run

```bash
node test.js        # rules against fixtures
node simulate.js    # full pipeline, simulated market, integrity check
node run.js --once  # ONE live pass — read every line of this output
```

On that first live pass, **read the rejections, not the signals.** If almost
nothing is being vetoed, the gates are too loose and you are about to publish
a bad hit rate onto a permanent record.

## 4. Run it

```bash
sudo cp proof-engine.service /etc/systemd/system/
sudo systemctl enable --now proof-engine
journalctl -u proof-engine -f
```

## 5. Do not tune anything for two weeks

The weights in `rules.js` are reasoned, not measured. Resist changing them on
the basis of a few calls — that is fitting to noise.

After roughly 100 settled calls:

```bash
curl localhost:8787/api/analytics/bands     # is the score predictive at all?
curl localhost:8787/api/analytics/reasons   # which reasons actually earn their place
```

Read the bands first. If hit rate does not climb with score, the problem is the
rules, not the threshold. If it does climb, move `SCORE_TO_FIRE` to where the
climb starts and leave everything else alone.

**A reason present on nearly every call cannot be measured.** Its lift will sit
at 1.00 regardless of whether it works. To learn anything about it the screener
has to sometimes fire without it.

## 6. Before the mint, not after

- [ ] `ProofRenderer` deployed, `lockRenderer()` called — after this the art
      can never be changed by anyone, including you
- [ ] `commitSeed(keccak256(secret), delay)` published **before** minting opens
- [ ] `reveal(secret)` called inside the 256-block window. Miss it and you must
      re-commit, which increments a public counter
- [ ] Parity re-run after any art change. The site and the contract diverge the
      moment either one moves
- [ ] Site copy states tier **odds**, not fixed counts
- [ ] Legal review. Not optional, and not something an engineer signs off

## 7. What is still weak

**Discovery.** With no `HELIUS_KEY` you only see Dexscreener profiles, and the
best signals come from pools too fresh to have one. This is the largest single
improvement available and it costs an API key.

**Peak accuracy.** Dexscreener publishes no candles, so peak is the highest
value the poller actually observed. At 20s intervals a shorter spike is missed.
Recorded honestly as `peakSource:"observed"`. Plug in GeckoTerminal OHLCV to
upgrade to a peak anyone can recompute independently.

**Group impact.** If several hundred key holders act on a call in a $25K token,
the move is partly your own buying. The hit rate then measures your group, not
the signal. Either keep the group small, raise the cap floor, or stop selling
latency — the current tier design institutionalises the problem.
