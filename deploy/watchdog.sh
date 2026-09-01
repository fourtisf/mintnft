#!/usr/bin/env bash
#
# Is the engine answering? If not, restart it once and say so out loud.
#
# The engine went down and the way that was discovered was someone opening the
# site and finding it empty. The register is append-only, so a dead engine is
# not a corrupted record — it is a gap in it, and a gap cannot be backfilled
# afterwards. Ten minutes of silence is worth a restart and a message.
#
# Installed by golive.sh as /usr/local/bin/nekara-watchdog, run from cron.
# Restarts at most once per run and never touches data/.

set -u

UNIT=nekara-engine
API="http://127.0.0.1:8787/api/register?limit=1"
STATE=/var/lib/nekara-watchdog.last

log() { logger -t nekara-watchdog "$*" 2>/dev/null || true; echo "$*"; }

# The token lives in the unit's environment, not in this script. Absent is fine:
# the watchdog still restarts and still logs, it just cannot announce.
tg() {
  local env tok chat
  env=$(systemctl show "$UNIT" -p Environment --value 2>/dev/null || true)
  tok=$(printf '%s\n' "$env" | tr ' ' '\n' | sed -n 's/^TG_TOKEN=//p' | head -1)
  chat=$(printf '%s\n' "$env" | tr ' ' '\n' | sed -n 's/^TG_CHAT=//p' | head -1)
  [ -n "${tok:-}" ] && [ -n "${chat:-}" ] || return 0
  curl -fsS -m 10 -X POST "https://api.telegram.org/bot$tok/sendMessage" \
    -d "chat_id=$chat" -d "text=$1" >/dev/null 2>&1 || true
}

alive() { curl -fsS -m 8 "$API" >/dev/null 2>&1; }

if alive; then
  # Say it recovered only if we were the ones who noticed it was gone.
  if [ -f "$STATE" ]; then
    rm -f "$STATE"
    log "engine is answering again"
    tg "🟢 nekara engine is answering again"
  fi
  exit 0
fi

# One retry before doing anything: a single missed request is a request, not an
# outage, and restarting a healthy engine loses whatever it was mid-poll on.
sleep 5
alive && exit 0

log "api not answering — restarting $UNIT"
: > "$STATE"
systemctl restart "$UNIT" 2>/dev/null || { log "restart failed"; tg "🔴 nekara engine is down and the restart failed"; exit 1; }

sleep 10
if alive; then
  log "restarted, api answering"
  tg "🟠 nekara engine stopped answering and was restarted — it is up again"
else
  log "restarted, still not answering"
  tg "🔴 nekara engine is down and did not come back after a restart"
  exit 1
fi
