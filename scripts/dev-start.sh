#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.quinapp-dev.pid"
LOG_FILE="$ROOT_DIR/.quinapp-dev.log"
PORT="${PORT:-8787}"
HOST="${HOST:-127.0.0.1}"
SERVER_PATTERN="node .*apps/api/src/server.mjs"

is_quinapp_pid() {
  local pid="$1"
  [[ -n "${pid:-}" ]] || return 1
  ps -p "$pid" -o command= 2>/dev/null | grep -q "apps/api/src/server.mjs"
}

port_pid() {
  lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

is_running() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null && is_quinapp_pid "$pid"; then
      return 0
    fi
  fi
  local pids
  pids="$(pgrep -f "$SERVER_PATTERN" || true)"
  if [[ -n "${pids:-}" ]]; then
    echo "$pids" | head -n 1 > "$PID_FILE"
    return 0
  fi
  return 1
}

if is_running; then
  echo "QUINAPP ya está corriendo (PID $(cat "$PID_FILE"))."
  echo "URL: http://$HOST:$PORT"
  exit 0
fi

rm -f "$PID_FILE"

EXISTING_PORT_PID="$(port_pid)"
if [[ -n "${EXISTING_PORT_PID:-}" ]] && ! is_quinapp_pid "$EXISTING_PORT_PID"; then
  echo "No se puede iniciar QUINAPP: el puerto $PORT está en uso por otro proceso (PID $EXISTING_PORT_PID)." >&2
  echo "Usa otro puerto: PORT=3000 npm run dev:start" >&2
  exit 1
fi

cd "$ROOT_DIR"
nohup env HOST="$HOST" PORT="$PORT" node apps/api/src/server.mjs >> "$LOG_FILE" 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"

sleep 0.6
if kill -0 "$PID" 2>/dev/null || [[ -n "$(port_pid)" ]]; then
  if [[ -z "${PID:-}" ]] || ! kill -0 "$PID" 2>/dev/null; then
    echo "$(port_pid)" > "$PID_FILE"
  fi
  echo "QUINAPP iniciada en http://$HOST:$PORT (PID $(cat "$PID_FILE"))"
  echo "Log: $LOG_FILE"
else
  echo "No se pudo iniciar QUINAPP. Revisa: $LOG_FILE" >&2
  rm -f "$PID_FILE"
  exit 1
fi
