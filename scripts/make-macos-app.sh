#!/usr/bin/env bash
# Crea un accés directe "QUINAPP.app" al Desktop que arrenca el servidor i obre
# el navegador amb un doble clic (sense terminal). Només macOS.
#
#   bash scripts/make-macos-app.sh                 # sense Spotify
#   SPOTIFY_CLIENT_ID=xxxx bash scripts/make-macos-app.sh   # amb Spotify
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then echo "Node no trobat al PATH"; exit 1; fi
NODE_DIR="$(dirname "$NODE_BIN")"
APP="$HOME/Desktop/QUINAPP.app"
CLIENT_ID="${SPOTIFY_CLIENT_ID:-}"

OSA="$(mktemp /tmp/quinapp.XXXX.applescript)"
cat > "$OSA" <<OSAEOF
on run
	set repoDir to "$REPO_DIR"
	set envPrefix to "export PATH=$NODE_DIR:/usr/bin:/bin:/usr/sbin:/sbin; export SPOTIFY_CLIENT_ID=$CLIENT_ID; export QUINAPP_NO_OPEN=1; "
	try
		do shell script "/usr/bin/curl -s http://127.0.0.1:3000/api/system/health > /dev/null"
	on error
		do shell script envPrefix & "cd " & quoted form of repoDir & " && nohup node scripts/start.mjs > /tmp/quinapp-app.log 2>&1 &"
	end try
	repeat 40 times
		try
			do shell script "/usr/bin/curl -s http://127.0.0.1:3000/api/system/health > /dev/null"
			exit repeat
		on error
			delay 0.4
		end try
	end repeat
	do shell script "/usr/bin/open http://127.0.0.1:3000"
end run
OSAEOF

rm -rf "$APP"
osacompile -o "$APP" "$OSA"
if [ -f "$REPO_DIR/build/icon.icns" ]; then
  cp "$REPO_DIR/build/icon.icns" "$APP/Contents/Resources/applet.icns"
fi
touch "$APP"
rm -f "$OSA"
echo "Creat: $APP"
echo "Doble clic per obrir QUINAPP al navegador."
