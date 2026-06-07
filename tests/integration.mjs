import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import ExcelJS from 'exceljs';

const HOST = '127.0.0.1';
const PORT = 8799;
const BASE = `http://${HOST}:${PORT}`;
const QR_SECRET = 'integration-qr-secret';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let i = 0; i < 30; i += 1) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await wait(150);
  }
  throw new Error(`Server did not start for integration test.\nLogs:\n${logs}`);
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return body;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

function b64urlEncode(value) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function signData(data) {
  return createHmac('sha256', QR_SECRET).update(data).digest('hex');
}

const server = spawn('node', ['apps/api/src/server.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, HOST, PORT: String(PORT), QR_HMAC_SECRET: QR_SECRET },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let logs = '';
server.stdout.on('data', (d) => { logs += d.toString(); });
server.stderr.on('data', (d) => { logs += d.toString(); });

try {
  await waitForServer();

  const songsText = [
    'A - a', 'B - b', 'C - c', 'D - d', 'E - e',
    'F - f', 'G - g', 'H - h', 'I - i', 'J - j',
    'K - k', 'L - l', 'M - m', 'N - n', 'O - o',
  ].join('\n');

  const created = await api('/api/sessions', {
    method: 'POST',
    body: { pin: 'TEST1', songsText, rows: 3, cols: 5, seed: 'seed1' },
  });
  assert.equal(created.pin, 'TEST1');

  const cards = await api('/api/sessions/TEST1/cards', { method: 'POST', body: { count: 2 } });
  assert.equal(cards.cards.length, 2);

  const draw = await api('/api/sessions/TEST1/draw/next', { method: 'POST' });
  assert.equal(draw.done, false);
  assert.equal(draw.drawn, 1);

  const payload = {
    v: 1,
    pin: 'TEST1',
    cardId: cards.cards[0].id,
    cardNumber: cards.cards[0].number,
    songs: cards.cards[0].songs.map((s) => ({ artist: s.artist, title: s.title })),
    issuedAt: Date.now(),
  };
  const d = b64urlEncode(JSON.stringify(payload));
  const s = signData(d);

  const validation1 = await api(`/api/validate-card?d=${encodeURIComponent(d)}&s=${encodeURIComponent(s)}`);
  assert.equal(validation1.valid, false);
  assert.equal(validation1.total, 15);
  assert.equal(validation1.matched >= 1, true);

  const claim = await api('/api/sessions/TEST1/claims', {
    method: 'POST',
    body: { cardId: cards.cards[0].id, type: 'linea' },
  });
  assert.equal(typeof claim.valid, 'boolean');

  const parsedCsv = await api('/api/tools/parse-csv', {
    method: 'POST',
    body: { csvText: 'artist,title\nX,SongX\nY,SongY\nZ,SongZ\nK,SongK\nL,SongL\nM,SongM\nN,SongN\nO,SongO\nP,SongP\nQ,SongQ\nR,SongR\nS,SongS\nT,SongT\nU,SongU\nV,SongV' },
  });
  assert.equal(parsedCsv.songs.length, 15);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Songs');
  ws.addRow(['Artist', 'Title']);
  ws.addRow(['AA', 'SongAA']);
  ws.addRow(['BB', 'SongBB']);
  ws.addRow(['CC', 'SongCC']);
  ws.addRow(['DD', 'SongDD']);
  ws.addRow(['EE', 'SongEE']);
  ws.addRow(['FF', 'SongFF']);
  ws.addRow(['GG', 'SongGG']);
  ws.addRow(['HH', 'SongHH']);
  ws.addRow(['II', 'SongII']);
  ws.addRow(['JJ', 'SongJJ']);
  ws.addRow(['KK', 'SongKK']);
  ws.addRow(['LL', 'SongLL']);
  ws.addRow(['MM', 'SongMM']);
  ws.addRow(['NN', 'SongNN']);
  ws.addRow(['OO', 'SongOO']);
  const xlsxBuffer = await wb.xlsx.writeBuffer();
  const parsedXlsx = await api('/api/tools/parse-xlsx', {
    method: 'POST',
    body: { base64: Buffer.from(xlsxBuffer).toString('base64') },
  });
  assert.equal(parsedXlsx.songs.length, 15);

  for (let i = 0; i < 20; i += 1) {
    const next = await api('/api/sessions/TEST1/draw/next', { method: 'POST' });
    if (next.done) break;
  }
  const validation2 = await api(`/api/validate-card?d=${encodeURIComponent(d)}&s=${encodeURIComponent(s)}`);
  assert.equal(validation2.valid, true);
  assert.equal(validation2.matched, validation2.total);

  const tampered = await fetch(`${BASE}/api/validate-card?d=${encodeURIComponent(`${d}x`)}&s=${encodeURIComponent(s)}`);
  assert.equal(tampered.status, 400);

  const batchView = await fetch(`${BASE}/validate-batch`);
  assert.equal(batchView.status, 200);
  const batchHtml = await batchView.text();
  assert.ok(batchHtml.includes('Escaneo en lote'));

  const cardPdfRes = await api(`/api/sessions/TEST1/cards/${cards.cards[0].id}/pdf`);
  const arr = await cardPdfRes.arrayBuffer();
  assert.ok(arr.byteLength > 500);

  const proPdfRes = await api('/api/sessions/TEST1/pdf-pro', {
    method: 'POST',
    body: { format: 'a4-2up', showMeta: true, highContrast: false },
  });
  const proArr = await proPdfRes.arrayBuffer();
  assert.ok(proArr.byteLength > 700);

  console.log('Integration test passed');
} finally {
  server.kill('SIGTERM');
  await wait(150);
  if (!server.killed) server.kill('SIGKILL');
}
