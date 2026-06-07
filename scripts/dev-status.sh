#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.quinapp-dev.pid"
PORT="${PORT:-8787}"
HOST="${HOST:-127.0.0.1}"
SERVER_PATTERN="node .*apps/api/src/server.mjs"

port_pid() {
  lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

PIDS="$(pgrep -f "$SERVER_PATTERN" || true)"
if [[ -n "${PIDS:-}" ]]; then
  PID="$(echo "$PIDS" | head -n 1)"
  echo "$PID" > "$PID_FILE"
  echo "QUINAPP en ejecución"
  echo "PID: $PID"
  echo "URL: http://$HOST:$PORT"
  exit 0
fi

PPID_LISTEN="$(port_pid)"
if [[ -n "${PPID_LISTEN:-}" ]]; then
  echo "Puerto $PORT ocupado por otro proceso (PID $PPID_LISTEN), pero QUINAPP no está en ejecución."
  exit 1
fi

echo "QUINAPP detenida"
exit 1
