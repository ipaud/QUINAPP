import { app, BrowserWindow, shell } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const LOCAL_URL = `http://127.0.0.1:${PORT}`;
let serverProc = null;

function pickLanIp() {
  const ifaces = os.networkInterfaces();
  for (const entries of Object.values(ifaces)) {
    for (const inf of entries || []) {
      if (!inf || inf.internal || inf.family !== 'IPv4') continue;
      return String(inf.address || '').trim();
    }
  }
  return '127.0.0.1';
}

async function waitForServerReady(url, timeoutMs = 12_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 220));
  }
  return false;
}

async function startEmbeddedServer() {
  const lanIp = pickLanIp();
  const serverEntry = path.resolve(__dirname, '../apps/api/src/server.mjs');
  const env = {
    ...process.env,
    HOST,
    PORT: String(PORT),
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || `http://${lanIp}:${PORT}`,
    QUINAPP_DATA_DIR: process.env.QUINAPP_DATA_DIR || path.join(app.getPath('userData'), 'data'),
  };
  serverProc = spawn('node', [serverEntry], {
    cwd: path.resolve(__dirname, '..'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout.on('data', (d) => {
    // eslint-disable-next-line no-console
    console.log(`[QUINAPP API] ${String(d).trim()}`);
  });
  serverProc.stderr.on('data', (d) => {
    // eslint-disable-next-line no-console
    console.error(`[QUINAPP API] ${String(d).trim()}`);
  });
  const ready = await waitForServerReady(LOCAL_URL);
  if (!ready) throw new Error('No se pudo iniciar servidor QUINAPP');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#faf9f6',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(LOCAL_URL);
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  try {
    await startEmbeddedServer();
    createWindow();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Electron] Error iniciando QUINAPP:', error);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProc && !serverProc.killed) {
    serverProc.kill('SIGTERM');
  }
});
