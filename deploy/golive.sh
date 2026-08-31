#!/usr/bin/env bash
#
# Takes the register from empty to live. Run it on the VPS, as root.
#
#   curl -fsSL https://raw.githubusercontent.com/fourtisf/mintnft/claude/new-session-jzxh7a/deploy/golive.sh -o golive.sh
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

REPO=https://github.com/fourtisf/mintnft.git
BRANCH=claude/new-session-jzxh7a
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
say "1/6  node"
command -v node >/dev/null || die "node is not installed. install 20 or newer."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || die "node $NODE_MAJOR is too old — the engine needs global fetch, so 20 or newer"
echo "node $(node -v)"

# 2 ──────────────────────────────────────────────────────────────────────────
say "2/6  source"
if [ -d "$SRC/.git" ]; then
  git -C "$SRC" fetch --depth 1 origin "$BRANCH"
  git -C "$SRC" reset --hard "origin/$BRANCH"
else
  git clone --depth 1 -b "$BRANCH" "$REPO" "$SRC"
fi

mkdir -p "$ENGINE/data" "$APP/backup"
# data/ is left alone deliberately. The register is append-only and this script
# must never be the thing that truncates it.
if command -v rsync >/dev/null; then
  rsync -a --exclude data --exclude node_modules "$SRC/signal-engine/" "$ENGINE/"
else
  find "$SRC/signal-engine" -maxdepth 1 -type f -exec cp -f {} "$ENGINE/" ';'
fi
echo "engine at $ENGINE"

if [ -f "$ENGINE/data/register.json" ]; then
  N=$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).calls.length)}catch(e){console.log("?")}' "$ENGINE/data/register.json")
  echo "existing register kept — $N calls on record"
fi

# 3 ──────────────────────────────────────────────────────────────────────────
say "3/6  preflight — nothing is written"
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
say "4/6  service"
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
systemctl enable --now nekara-engine
sleep 4
systemctl is-active --quiet nekara-engine || { journalctl -u nekara-engine -n 40 --no-pager; die "engine did not stay up"; }
curl -fsS -m 5 http://127.0.0.1:8787/api/register >/dev/null || { journalctl -u nekara-engine -n 40 --no-pager; die "api is not answering on :8787"; }
echo "engine up, api answering on :8787"

# 5 ──────────────────────────────────────────────────────────────────────────
say "5/6  nginx"
mkdir -p "$(dirname "$SNIP")"
install -m 644 "$SRC/deploy/nginx-api.conf" "$SNIP"

CONF=$(grep -rlF "server_name $DOMAIN" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -1 || true)
INCLUDE_LINE="    include snippets/nekara-api.conf;"

if [ -z "$CONF" ]; then
  echo "could not find the server block for $DOMAIN."
  echo "add this line inside it yourself, above 'location / ':"
  echo "$INCLUDE_LINE"
elif grep -qF "snippets/nekara-api.conf" "$CONF"; then
  echo "already included in $CONF"
  nginx -t && systemctl reload nginx
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
say "6/6  check"
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
The site polls /api/register every 20s, so the first call to clear the filter
appears on the pages by itself. There is nothing else to do.

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
