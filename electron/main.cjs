const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const LOCAL_URL = `http://127.0.0.1:${PORT}`;
let serverProc = null;
let healthTimer = null;
let restartCount = 0;
const MAX_RESTARTS = 6;
let consecutiveHealthFails = 0;

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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    await wait(220);
  }
  return false;
}

async function startEmbeddedServer() {
  const lanIp = pickLanIp();
  const appRoot = app.getAppPath();
  const serverEntry = path.join(appRoot, 'apps/api/src/server.mjs');
  const env = {
    ...process.env,
    HOST,
    PORT: String(PORT),
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || `http://${lanIp}:${PORT}`,
    QUINAPP_DATA_DIR: process.env.QUINAPP_DATA_DIR || path.join(app.getPath('userData'), 'data'),
    ELECTRON_RUN_AS_NODE: '1',
  };
  const serverCwd = app.isPackaged ? process.resourcesPath : appRoot;
  serverProc = spawn(process.execPath, [serverEntry], {
    cwd: serverCwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout.on('data', (d) => {
    console.log(`[QUINAPP API] ${String(d).trim()}`);
  });
  serverProc.stderr.on('data', (d) => {
    console.error(`[QUINAPP API] ${String(d).trim()}`);
  });
  serverProc.on('exit', async (code, signal) => {
    if (app.isQuiting) return;
    console.error(`[QUINAPP API] detenido (code=${code}, signal=${signal})`);
    if (restartCount >= MAX_RESTARTS) {
      console.error('[QUINAPP API] límite de reinicios alcanzado');
      return;
    }
    restartCount += 1;
    await wait(Math.min(1200 * restartCount, 5000));
    try {
      await startEmbeddedServer();
    } catch (err) {
      console.error('[QUINAPP API] error reiniciando:', err);
    }
  });
  const ready = await waitForServerReady(LOCAL_URL);
  if (!ready) throw new Error('No se pudo iniciar servidor QUINAPP');
  restartCount = 0;
  consecutiveHealthFails = 0;
}

function stopHealthMonitor() {
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
}

function startHealthMonitor() {
  stopHealthMonitor();
  healthTimer = setInterval(async () => {
    try {
      const res = await fetch(`${LOCAL_URL}/api/system/health`, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json().catch(() => ({}));
      if (!body.ok) throw new Error('not ok');
      consecutiveHealthFails = 0;
    } catch {
      consecutiveHealthFails += 1;
      if (consecutiveHealthFails < 3) return;
      consecutiveHealthFails = 0;
      if (serverProc && !serverProc.killed) {
        serverProc.kill('SIGTERM');
      } else {
        try {
          await startEmbeddedServer();
        } catch (err) {
          console.error('[QUINAPP API] error recuperando health:', err);
        }
      }
    }
  }, 7000);
}

function createWindow() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.icns');
  const fs = require('node:fs');
  const iconOpts = fs.existsSync(iconPath) ? { icon: iconPath } : {};
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#faf9f6',
    autoHideMenuBar: true,
    ...iconOpts,
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
    startHealthMonitor();
    createWindow();
  } catch (error) {
    console.error('[Electron] Error iniciando QUINAPP:', error);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  app.isQuiting = true;
  stopHealthMonitor();
  if (serverProc && !serverProc.killed) {
    serverProc.kill('SIGTERM');
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
