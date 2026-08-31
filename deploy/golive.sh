#!/usr/bin/env bash
#
# Takes the register from empty to live. Run it on the VPS, as root.
#
#   curl -fsSL https://raw.githubusercontent.com/fourtisf/nekara/main/deploy/golive.sh -o golive.sh
#   bash golive.sh
#
# It stops at the preflight gate and waits for you, because starting an engine
# that would never fire is worse than not starting one — it looks like it works.
# Pass --yes to run straight through once you have read a preflight you trust.
#
# Safe to re-run. It never touches data/register.json, it keeps the existing
# session secret, and it backs the nginx config up before editing and rolls
# back if the result does not parse.

set -euo pipefail

REPO=https://github.com/fourtisf/nekara.git
BRANCH=main
SRC=/opt/nekara-src
APP=/opt/nekara
ENGINE=$APP/signal-engine
UNIT=/etc/systemd/system/nekara-engine.service
SNIP=/etc/nginx/snippets/nekara-api.conf
DOMAIN=nekara.xyz

ASSUME_YES=0
[ "${1:-}" = "--yes" ] && ASSUME_YES=1

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
die() { printf '\n\033[31mstopped: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "run this as root"

# 1 ──────────────────────────────────────────────────────────────────────────
say "1/7  node"
command -v node >/dev/null || die "node is not installed. install 20 or newer."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || die "node $NODE_MAJOR is too old — the engine needs global fetch, so 20 or newer"
command -v npm >/dev/null || die "npm is missing. the engine has a dependency and cannot install it."
echo "node $(node -v), npm $(npm -v)"

# 2 ──────────────────────────────────────────────────────────────────────────
say "2/7  source"
if [ -d "$SRC/.git" ]; then
  # Point the remote at $REPO first. An existing checkout carries whatever
  # remote it was cloned with, which on this box is a repo the project has
  # moved off, so fetching "origin" fetched the wrong source entirely.
  git -C "$SRC" remote set-url origin "$REPO" 2>/dev/null \
    || git -C "$SRC" remote add origin "$REPO"
  git -C "$SRC" fetch --depth 1 origin "$BRANCH" \
    || die "could not fetch $BRANCH from $REPO"
  # FETCH_HEAD, not origin/$BRANCH: a --depth 1 fetch of a branch name writes
  # FETCH_HEAD and need not create the remote-tracking ref at all, so resetting
  # to origin/$BRANCH failed with "unknown revision" on a box that had one.
  git -C "$SRC" reset --hard FETCH_HEAD
else
  git clone --depth 1 -b "$BRANCH" "$REPO" "$SRC"
fi
echo "source at $(git -C "$SRC" rev-parse --short HEAD) from $(git -C "$SRC" remote get-url origin)"

mkdir -p "$ENGINE/data" "$APP/backup"
# data/ is left alone deliberately. The register is append-only and this script
# must never be the thing that truncates it.
if command -v rsync >/dev/null; then
  rsync -a --exclude data --exclude node_modules "$SRC/signal-engine/" "$ENGINE/"
else
  find "$SRC/signal-engine" -maxdepth 1 -type f -exec cp -f {} "$ENGINE/" ';'
fi
echo "engine at $ENGINE"

# auth.js needs ethereumjs-util for signature recovery, and index.js imports it
# at boot, so a missing node_modules is not a degraded engine — it is no engine.
( cd "$ENGINE" && npm install --omit=dev --no-audit --no-fund ) \
  || die "npm install failed — the engine cannot boot without ethereumjs-util"

if [ -f "$ENGINE/data/register.json" ]; then
  N=$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).calls.length)}catch(e){console.log("?")}' "$ENGINE/data/register.json")
  echo "existing register kept — $N calls on record"
fi

# 3 ──────────────────────────────────────────────────────────────────────────
say "3/7  preflight — nothing is written"
cd "$ENGINE"
set +e
node preflight.js --rounds 3 | tee /tmp/nekara-preflight.log
PF=${PIPESTATUS[0]}
set -e
[ "$PF" -eq 0 ] || die "Dexscreener is not reachable from this box. Fix that first; the log is at /tmp/nekara-preflight.log"

FIRED=$(grep -oE 'would fire [0-9]+' /tmp/nekara-preflight.log | tail -1 | grep -oE '[0-9]+$' || true)
if [ "${FIRED:-0}" = "0" ]; then
  printf '\n\033[33mAcross three passes the filter would not have fired once.\033[0m\n'
  echo "That may be an honest quiet hour, or a threshold that is wrong for live"
  echo "conditions. Look at the veto histogram above: one gate holding most of"
  echo "the count is a gate to argue with, not a filter doing its job. Starting"
  echo "now gives you an engine that runs silently and cannot be told apart"
  echo "from a broken one."
  if [ "$ASSUME_YES" = 0 ]; then
    ANS=n
    # Read from the terminal, not stdin — stdin may be the script itself.
    if [ -r /dev/tty ]; then
      printf '\nStart it anyway? [y/N] '
      read -r ANS < /dev/tty || ANS=n
    else
      echo "(no terminal to ask on — re-run with --yes to start regardless)"
    fi
    [ "$ANS" = y ] || die "not started. send /tmp/nekara-preflight.log back and we will look at the gates."
  fi
fi

# 4 ──────────────────────────────────────────────────────────────────────────
say "4/7  service"
# Keep the old secret if there is one. A fresh one logs every key holder out.
OLD_SECRET=$(sed -n 's/^Environment=SESSION_SECRET=//p' "$UNIT" 2>/dev/null | head -1 || true)
install -m 644 "$SRC/deploy/nekara-engine.service" "$UNIT"
if [ -n "${OLD_SECRET:-}" ] && [ "$OLD_SECRET" != CHANGE_ME ]; then
  SECRET=$OLD_SECRET
else
  SECRET=$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')
fi
sed -i "s|CHANGE_ME|$SECRET|" "$UNIT"

systemctl daemon-reload
systemctl enable nekara-engine >/dev/null
# restart, not "enable --now": on a service that is already running the start
# is a no-op, so every re-run of this script would leave the old code loaded
# and report success.
systemctl restart nekara-engine
sleep 4
systemctl is-active --quiet nekara-engine || { journalctl -u nekara-engine -n 40 --no-pager; die "engine did not stay up"; }
curl -fsS -m 5 http://127.0.0.1:8787/api/register >/dev/null || { journalctl -u nekara-engine -n 40 --no-pager; die "api is not answering on :8787"; }
echo "engine up, api answering on :8787"

# 5 ──────────────────────────────────────────────────────────────────────────
say "5/7  nginx"
mkdir -p "$(dirname "$SNIP")"
install -m 644 "$SRC/deploy/nginx-api.conf" "$SNIP"

# -R, not -r: sites-enabled is symlinks on Debian and Ubuntu, and -r skips
# symlinks it meets while walking a directory. -r finds nothing, every time.
CONF=$(grep -RlF "server_name $DOMAIN" /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/conf.d 2>/dev/null | head -1 || true)
INCLUDE_LINE="    include snippets/nekara-api.conf;"

if [ -z "$CONF" ]; then
  echo "could not find the server block for $DOMAIN."
  echo "add this line inside it yourself, above 'location / ':"
  echo "$INCLUDE_LINE"
elif grep -qF "snippets/nekara-api.conf" "$CONF"; then
  echo "already included in $CONF"
  nginx -t && systemctl reload nginx
elif grep -qE '^[[:space:]]*location[[:space:]]+/api/' "$CONF"; then
  # A hand-written location /api/ already there. Adding the include would put a
  # second one in the same server block, nginx would refuse to load, and this
  # script would roll back and stop before it ever published the site.
  printf '\n\033[33m%s\033[0m\n' "$CONF already has its own location /api/"
  echo "Not touching it — two of them will not load. Replace that block by hand"
  echo "with this line, then: nginx -t && systemctl reload nginx"
  echo "$INCLUDE_LINE"
  echo
  echo "It matters: the snippet also carries /feed, which is what makes the page"
  echo "say \"live\" instead of \"polling\", and the no-cache header for /assets/."
else
  BACKUP="$CONF.bak.$(date +%s)"
  cp "$CONF" "$BACKUP"
  # Before the first location in the TLS block specifically. Matching the first
  # location in the file lands inside the :80 redirect on any config with an
  # acme-challenge there, and /api would then 301 to itself.
  if awk '
      /listen[^;]*443/ { tls = 1 }
      tls && !done && /^[[:space:]]*location[[:space:]]/ {
        print "    include snippets/nekara-api.conf;"; print ""; done = 1
      }
      { print }
      END { if (!done) exit 3 }
    ' "$CONF" > /tmp/nekara-nginx.new
  then
    cp /tmp/nekara-nginx.new "$CONF"
    if nginx -t; then
      systemctl reload nginx
      echo "included in $CONF  (backup at $BACKUP)"
    else
      cp "$BACKUP" "$CONF"
      die "nginx rejected the edit and it has been rolled back. add the include by hand."
    fi
  else
    echo "no TLS server block found in $CONF. add this inside it yourself, above 'location / ':"
    echo "$INCLUDE_LINE"
  fi
fi

# 6 ──────────────────────────────────────────────────────────────────────────
say "6/7  site"
# The pages are four files and no build step. They were being uploaded by hand,
# which is how a front-end fix sits in git for a week while the live site keeps
# the old bug. Only ever writes where nginx already serves from.
# A server file can carry several roots — the :80 redirect, an acme-challenge
# webroot — and the first one is not necessarily the site. The one already
# holding an index.html is.
WEBROOT=""
if [ -n "${CONF:-}" ]; then
  for R in $(awk '$1 == "root" { sub(/;.*/, "", $2); print $2 }' "$CONF" | sort -u); do
    if [ -f "$R/index.html" ]; then WEBROOT=$R; break; fi
    if [ -z "$WEBROOT" ] && [ -d "$R" ]; then WEBROOT=$R; fi
  done
fi
if [ -z "$WEBROOT" ] && [ -d /var/www/nekara ]; then WEBROOT=/var/www/nekara; fi
if [ -n "$WEBROOT" ] && [ -d "$WEBROOT" ]; then
  install -d "$WEBROOT/assets"
  install -m 644 "$SRC/site/index.html" "$SRC/site/favicon.svg" "$WEBROOT/"
  install -m 644 "$SRC/site/assets/"* "$WEBROOT/assets/"
  echo "site published to $WEBROOT  (index.html, favicon.svg, assets/)"
else
  echo "no web root found — copy site/index.html, site/favicon.svg and site/assets/ up by hand"
fi

# 7 ──────────────────────────────────────────────────────────────────────────
say "7/7  check"
CODE=$(curl -s -o /tmp/nekara-api.json -w '%{http_code}' "https://$DOMAIN/api/register?limit=3" || true)
echo "https://$DOMAIN/api/register -> HTTP $CODE"
if [ "$CODE" = 200 ]; then
  head -c 400 /tmp/nekara-api.json; echo
else
  echo "not 200 yet. the engine is up either way — see the nginx step above."
fi

cat <<'NOTES'

== what happens now ==
The engine polls every 60s for candidates and every 20s to re-mark live calls.
The site holds a websocket to /feed, so a signal lands on the page the moment
its tier's timer fires, and falls back to a 20s poll if the socket drops. There
is nothing else to do.

The header says which of those is true — "live" for the socket, "polling" for
the fallback, "engine offline" when neither answers. If it says offline while
this script reported the API answering, the nginx include is the thing to look
at, not the engine.

Public readers are PUBLIC_DELAY_S behind the desk, an hour by default. With no
keys minted that hour is a delay nobody has paid to skip, and the public page
shows nothing until it passes. Set Environment=PUBLIC_DELAY_S= in the unit file
to change it; the paid tiers are not settable and do not move.

Watch it:   journalctl -u nekara-engine -f
Look for:   [FIRED]  a call went on record
            [WIN]    one reached 2x
            [DEAD]   one fell to a tenth of entry

Back the register up. It is the product.
   0 3 * * * cp /opt/nekara/signal-engine/data/register.json \
     /opt/nekara/backup/register-$(date +\%F).json

Still not true, and not faked:
  - discovery only sees tokens whose team filed a Dexscreener profile
  - anchoring is off, so /api/verify reports the register as unanchored
NOTES
