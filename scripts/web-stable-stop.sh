#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WATCHDOG_PID_FILE="$ROOT_DIR/.quinapp-watchdog.pid"
APP_PID_FILE="$ROOT_DIR/.quinapp-web.pid"

kill_if_alive() {
  local pid="$1"
  if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 0.3
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
}

WDPID="$(cat "$WATCHDOG_PID_FILE" 2>/dev/null || true)"
APPPID="$(cat "$APP_PID_FILE" 2>/dev/null || true)"
kill_if_alive "$WDPID"
kill_if_alive "$APPPID"
pkill -f "node .*apps/api/src/server.mjs" 2>/dev/null || true

rm -f "$WATCHDOG_PID_FILE" "$APP_PID_FILE"
echo "QUINAPP watchdog detenido."
