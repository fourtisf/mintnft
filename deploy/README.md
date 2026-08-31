# Going live

The engine has never run against real market data. Everything in
`signal-engine/` is tested against fixtures and a simulated market, which is why
the register on nekara.xyz is empty. This is the shortest honest path from that
to real signals.

Run every command on the VPS. Dexscreener is not reachable from the machine
these files were written on, so the first real request the engine makes will be
from your box, not from anywhere it has been tried before. That is what
`preflight.js` is for.

## 1 · Copy the engine up

From your laptop, in the repo:

    rsync -av --exclude node_modules --exclude data \
      signal-engine/ root@31.97.66.123:/opt/nekara/signal-engine/
    rsync -av deploy/ root@31.97.66.123:/opt/nekara/deploy/

Node 20 or newer. `node --version` on the box; the engine uses global `fetch`,
which 18 has behind a flag and 20 has outright.

## 2 · Preflight, before anything writes

    cd /opt/nekara/signal-engine && node preflight.js --rounds 3

Three discovery passes, a minute apart. Nothing is written. It answers, in
order:

- **Can this box reach Dexscreener.** It probes the endpoint directly rather
  than through the engine's client, which retries, gives up and returns an
  empty candidate list — indistinguishable from a quiet market. If the probe
  fails it says so and stops; nothing else matters until that line is clean.
- **Do live pairs carry the fields the rules read.** A missing field is not a
  crash — the gates treat it as absent — so it would otherwise show up as an
  unexplained silence.
- **What the filter would have done.** Scanned, vetoed, scored low, would fire,
  and the score distribution against the threshold.

Read the veto histogram before you go further. If one gate is holding most of
the count, that threshold is wrong for live conditions and it is far cheaper to
learn it here than after a silent week. The thresholds in `rules.js` were
reasoned, not measured — that is a known gap, not a finished decision.

If "would fire" is 0 across all three rounds, do not start the engine yet.
Come back with the output and we will look at which gate to argue with.

## 3 · Start it

    sudo cp /opt/nekara/deploy/nekara-engine.service /etc/systemd/system/
    sudo sed -i "s/CHANGE_ME/$(openssl rand -hex 32)/" /etc/systemd/system/nekara-engine.service
    sudo systemctl daemon-reload
    sudo systemctl enable --now nekara-engine
    journalctl -u nekara-engine -f

You want to see `register api on :8787 · discovery 60s hot 20s warm 300s`.
Then `[FIRED]` lines as calls come in, and `[WIN]` / `[DEAD]` as they settle.

Set `SESSION_SECRET` and leave it set. Unset, `index.js` generates a random one
at boot, which logs every key holder out on each restart.

## 4 · Point the site at it

    sudo cp /opt/nekara/deploy/nginx-api.conf /etc/nginx/snippets/nekara-api.conf

Add one line inside the `server` block for nekara.xyz, above `location / `:

    include snippets/nekara-api.conf;

Then:

    sudo nginx -t && sudo systemctl reload nginx
    curl -s https://nekara.xyz/api/register | head -c 400

The site polls `/api/register` every 20 seconds and falls back to an empty
register when that returns nothing, so this is the moment the pages stop being
empty. No front-end change is needed.

## What the register is

`/opt/nekara/signal-engine/data/register.json`. Every call, its marks, the hash
chain and the anchors. Insert is the only write path — the store has no update
or delete, by design.

Back it up. A corrupted or lost file is not recoverable from anywhere, and the
chain is what makes that true rather than merely inconvenient: the whole claim
of the product is that this file cannot be quietly rewritten.

    0 3 * * * cp /opt/nekara/signal-engine/data/register.json \
      /opt/nekara/backup/register-$(date +\%F).json

## Two things that stay untrue until you fix them

**Discovery is thin.** `/token-profiles` shows a token once, when its team
files a profile. Most launches never do, and the best signals come from pools
too fresh to have one. `sources.js` already has a Helius watcher for Solana and
a factory-log watcher for EVM written for exactly this; both need keys. Until
then, low candidate counts are the discovery source, not the market.

**Anchoring is off.** `index.js` starts with `publishAnchorTx = null` and says
so in the log. `/api/verify` will report the register as unanchored, and it is
right to. The chain is computed and checkable locally regardless; what is
missing is publishing the head on-chain daily, which needs a funded key. It is
never faked — an anchor that does not exist is reported as one that does not
exist.
