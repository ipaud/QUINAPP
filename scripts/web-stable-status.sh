#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WATCHDOG_PID_FILE="$ROOT_DIR/.quinapp-watchdog.pid"
APP_PID_FILE="$ROOT_DIR/.quinapp-web.pid"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3000}"

is_alive() {
  local pid="$1"
  [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null
}

WDPID="$(cat "$WATCHDOG_PID_FILE" 2>/dev/null || true)"
APPPID="$(cat "$APP_PID_FILE" 2>/dev/null || true)"

if is_alive "$WDPID"; then
  echo "Watchdog: OK (PID $WDPID)"
else
  echo "Watchdog: KO"
fi

if is_alive "$APPPID"; then
  echo "App: OK (PID $APPPID)"
else
  echo "App: KO"
fi

if curl -sSf "http://$HOST:$PORT/api/system/health" >/dev/null 2>&1; then
  echo "Health: OK http://$HOST:$PORT"
else
  echo "Health: KO http://$HOST:$PORT"
fi
