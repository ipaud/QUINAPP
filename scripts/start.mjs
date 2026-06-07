#!/usr/bin/env node
// Cross-platform launcher: starts the embedded server and opens the default
// browser. Works on macOS, Windows and Linux — no Electron required.
import { spawn } from 'node:child_process';

const PORT = process.env.PORT || '3000';
process.env.PORT = PORT;
// Bind to all interfaces so phones on the same Wi-Fi can reach the mobile pages.
process.env.HOST = process.env.HOST || '0.0.0.0';
const LOCAL = `http://127.0.0.1:${PORT}`;

function openBrowser(url) {
  try {
    if (process.platform === 'darwin') {
      spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    } else if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    } else {
      spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
    }
  } catch {
    // Si falla, l'usuari pot obrir la URL manualment.
  }
}

async function waitHealth(timeoutMs = 12_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${LOCAL}/api/system/health`);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  return false;
}

// Importing the server module starts it listening (it self-invokes server.listen()).
await import('../apps/api/src/server.mjs');

if (await waitHealth()) {
  console.log(`\n✅ QUINAPP a ${LOCAL}`);
  console.log("   Obre aquesta URL al navegador (s'hauria d'haver obert sola).");
  console.log('   Mòbil: pestanya "Mòbil" → usa la URL/QR dins la mateixa Wi-Fi.\n');
  if (!process.env.QUINAPP_NO_OPEN) openBrowser(LOCAL);
} else {
  console.error("⚠️  No s'ha pogut confirmar el health del servidor. Obre " + LOCAL + ' manualment.');
}
