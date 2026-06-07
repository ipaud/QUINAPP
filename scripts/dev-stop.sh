#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.quinapp-dev.pid"
SERVER_PATTERN="node .*apps/api/src/server.mjs"

PIDS="$(pgrep -f "$SERVER_PATTERN" || true)"
if [[ -z "${PIDS:-}" ]]; then
  echo "No hay proceso activo de QUINAPP."
  rm -f "$PID_FILE"
  exit 0
fi

echo "$PIDS" | xargs kill 2>/dev/null || true
sleep 0.5
LEFT="$(pgrep -f "$SERVER_PATTERN" || true)"
if [[ -n "${LEFT:-}" ]]; then
  echo "$LEFT" | xargs kill -9 2>/dev/null || true
fi

echo "QUINAPP detenida (PIDs: $(echo "$PIDS" | tr '\n' ' '))."
rm -f "$PID_FILE"
