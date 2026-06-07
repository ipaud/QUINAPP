#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WATCHDOG_PID_FILE="$ROOT_DIR/.quinapp-watchdog.pid"
APP_PID_FILE="$ROOT_DIR/.quinapp-web.pid"
WATCHDOG_LOG="/tmp/quinapp-watchdog.log"
APP_LOG="/tmp/quinapp-web.log"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3000}"
SPOTIFY_CLIENT_ID="${SPOTIFY_CLIENT_ID:-55fd39eb5e914973affb017f5b9d1fd6}"

is_alive() {
  local pid="$1"
  [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null
}

if [[ -f "$WATCHDOG_PID_FILE" ]]; then
  PID="$(cat "$WATCHDOG_PID_FILE" 2>/dev/null || true)"
  if is_alive "$PID"; then
    echo "QUINAPP watchdog ya en ejecucion (PID $PID)."
    echo "URL: http://$HOST:$PORT"
    exit 0
  fi
fi

pkill -f "node .*apps/api/src/server.mjs" 2>/dev/null || true
(lsof -tiTCP:"$PORT" -sTCP:LISTEN | xargs kill -9) 2>/dev/null || true
rm -f "$WATCHDOG_PID_FILE" "$APP_PID_FILE"

nohup bash -lc "
  cd '$ROOT_DIR'
  echo \$\$ > '$WATCHDOG_PID_FILE'
  while true; do
    echo \"[\$(date +'%F %T')] start node\" >> '$WATCHDOG_LOG'
    env HOST='$HOST' PORT='$PORT' SPOTIFY_CLIENT_ID='$SPOTIFY_CLIENT_ID' node apps/api/src/server.mjs >> '$APP_LOG' 2>&1 &
    APP_PID=\$!
    echo \$APP_PID > '$APP_PID_FILE'
    wait \$APP_PID
    CODE=\$?
    echo \"[\$(date +'%F %T')] node exit code=\$CODE, restart in 1s\" >> '$WATCHDOG_LOG'
    sleep 1
  done
" >/dev/null 2>&1 &

sleep 0.6
WDPID="$(cat "$WATCHDOG_PID_FILE" 2>/dev/null || true)"
echo "QUINAPP watchdog iniciado (PID ${WDPID:-desconocido})."
echo "URL: http://$HOST:$PORT"
