import http from 'node:http';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import QRCode from 'qrcode';
import { migrate, dbPath } from './data/db.mjs';
import { buildCardsPdf } from './lib/pdf-cards.mjs';
import { normalizeSongKey } from './lib/songs.mjs';
import { decodeAndVerifyQrQuery } from './lib/qr.mjs';
import { getSseSet, broadcast, startSsePing } from './lib/realtime.mjs';
import {
  createSession,
  getSession,
  createCards,
  drawNextSong,
  peekNextSong,
  undoLastDraw,
  evaluateClaim,
  importSongsToSession,
  getCard,
  listCards,
  listDrawnSongs,
  listAuditLogs,
  sessionHasAdminPin,
  resetSessionRound,
  deleteSession,
  analyzeSongsQuality,
  requireAdmin,
} from './data/repository.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ROOT = path.resolve(__dirname, '../../web');

migrate();

const sseClients = new Map();
const serverStartedAt = Date.now();

const SSE_PING_INTERVAL_MS = 15_000;
const BODY_SIZE_LIMIT = 20_000_000;
const RATE_WINDOW_MS = 60_000;

// ── Rate limiter ──────────────────────────────────────────────────────────────
// Simple in-memory sliding-window rate limiter (per IP, per key).
// Not persistent across restarts; good enough for a local/LAN server.
const _rateBuckets = new Map(); // key → [timestamps]

function rateLimit(ip, key, maxHits, windowMs) {
  const bucketKey = `${key}::${ip}`;
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (_rateBuckets.get(bucketKey) || []).filter((t) => t > cutoff);
  hits.push(now);
  _rateBuckets.set(bucketKey, hits);
  if (hits.length > maxHits) {
    throw new Error(`Massa peticions. Torna a intentar-ho en uns moments.`);
  }
}

// Clean stale buckets every 5 minutes to avoid unbounded memory growth.
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [k, hits] of _rateBuckets) {
    const fresh = hits.filter((t) => t > cutoff);
    if (fresh.length === 0) _rateBuckets.delete(k);
    else _rateBuckets.set(k, fresh);
  }
}, 5 * 60 * 1000).unref();

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

// ── Security helpers ────────────────────────────────────────────────────────────
const CDN_SCRIPTS = 'https://sdk.scdn.co https://cdn.jsdelivr.net';

// Content-Security-Policy. Inline <script> in server-rendered pages is allowed only
// via a per-response nonce, so injected markup (stored XSS) cannot execute.
function cspHeader(nonce) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' ${CDN_SCRIPTS}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "media-src 'self' https://*.scdn.co https://*.spotify.com",
    "connect-src 'self' https://*.spotify.com wss://*.spotify.com https://*.scdn.co https://www.googleapis.com",
    "frame-src https://open.spotify.com https://sdk.scdn.co",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self' https://accounts.spotify.com",
  ].join('; ');
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// JSON safe to embed inside a <script> block: neutralizes </script> breakout and
// the JS line/paragraph separators that are valid string chars but illegal in JSON.
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function jsStringLiteral(value) {
  return jsonForScript(String(value ?? ''));
}

function sendHtml(res, html, nonce) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': cspHeader(nonce),
  });
  res.end(html);
}

function sanitizeFilename(name) {
  return String(name || 'file').replace(/[^A-Za-z0-9._-]/g, '_');
}

// Restrict server-side probe to loopback / RFC1918 / link-local to avoid SSRF.
function isPrivateHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (h === 'localhost' || h === '::1') return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 127 || a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendBinary(res, status, type, bytes, fileName) {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Disposition': `attachment; filename="${sanitizeFilename(fileName)}"`,
  });
  res.end(Buffer.from(bytes));
}

function notFound(res) {
  json(res, 404, { error: 'No encontrado' });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > BODY_SIZE_LIMIT) {
        reject(new Error('Body demasiado grande'));
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('JSON invalido'));
      }
    });
    req.on('error', reject);
  });
}

function detectPlaylistProvider(url) {
  if (/youtube\.com\/playlist/.test(url) || /[?&]list=/.test(url)) return 'youtube';
  if (/open\.spotify\.com\/playlist\//.test(url) || /spotify:playlist:/.test(url)) return 'spotify';
  return 'unknown';
}

function parseYouTubePlaylistId(url) {
  try {
    const u = new URL(url);
    const id = u.searchParams.get('list');
    return id || null;
  } catch {
    return null;
  }
}

function parseSpotifyPlaylistId(url) {
  const m = String(url).match(/playlist\/([A-Za-z0-9]+)(?:\?|$)/);
  if (m?.[1]) return m[1];
  const m2 = String(url).match(/spotify:playlist:([A-Za-z0-9]+)/);
  return m2?.[1] || null;
}

function parseCSV(text) {
  const rows = [];
  let cur = '';
  let inQ = false;
  let row = [];
  // Normalitzar line endings: \r\n i \r → \n (evita files duplicades amb Windows CSVs)
  const src = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    const nx = src[i + 1];

    if (inQ) {
      if (ch === '"' && nx === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQ = true;
    } else if (ch === ',' || ch === ';') {
      row.push(cur.trim());
      cur = '';
    } else if (ch === '\n') {
      if (cur !== '' || row.length) {
        row.push(cur.trim());
        rows.push(row);
        row = [];
        cur = '';
      }
    } else {
      cur += ch;
    }
  }

  if (cur !== '' || row.length) {
    row.push(cur.trim());
    rows.push(row);
  }

  const header = rows[0]?.map((h) => String(h).toLowerCase()) || [];
  const hA = header.findIndex((h) => /artist|artista/.test(h));
  const hT = header.findIndex((h) => /title|titol|título|titulo|canco|cancion|canción/.test(h));
  const start = hA > -1 && hT > -1 ? 1 : 0;

  const songs = [];
  for (let i = start; i < rows.length; i += 1) {
    const r = rows[i];
    const artist = (hA > -1 ? r[hA] : r[0]) || '';
    const title = (hT > -1 ? r[hT] : r[1]) || '';
    if (artist || title) songs.push({ artist: artist || '(artista)', title: title || '(cancion)' });
  }
  return songs;
}

async function parseXlsxBase64(base64) {
  let buf;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    throw new Error('Base64 invàlid');
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buf);
  } catch {
    throw new Error('Fitxer XLSX invàlid o corrupte');
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const songs = [];
  worksheet.eachRow((row, rowNumber) => {
    const artist = String(row.getCell(1)?.value || '').trim();
    const title = String(row.getCell(2)?.value || '').trim();
    if (rowNumber === 1) {
      const hArtist = artist.toLowerCase();
      const hTitle = title.toLowerCase();
      const looksLikeHeader =
        /artist|artista/.test(hArtist) &&
        /title|titol|título|titulo|canco|cancion|canción/.test(hTitle);
      if (looksLikeHeader) return;
    }
    if (artist || title) {
      songs.push({ artist: artist || '(artista)', title: title || '(cancion)' });
    }
  });
  return songs;
}

async function fetchYouTubePlaylistSongs(url, apiKey) {
  if (!apiKey) throw new Error('Falta API key de YouTube');
  const playlistId = parseYouTubePlaylistId(url);
  if (!playlistId) throw new Error('No se detecto playlist de YouTube');

  const songs = [];
  let pageToken = '';
  do {
    const endpoint = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    endpoint.searchParams.set('part', 'snippet');
    endpoint.searchParams.set('maxResults', '50');
    endpoint.searchParams.set('playlistId', playlistId);
    endpoint.searchParams.set('key', apiKey);
    if (pageToken) endpoint.searchParams.set('pageToken', pageToken);

    const res = await fetch(endpoint);
    if (!res.ok) throw new Error(`YouTube API error (${res.status})`);
    const data = await res.json();

    (data.items || []).forEach((item) => {
      const s = item?.snippet || {};
      const full = String(s.title || '').trim();
      const parts = full.split(/\s[-–—]\s/);
      const artist = parts.length >= 2 ? parts[0] : String(s.videoOwnerChannelTitle || '(artista)');
      const title = parts.length >= 2 ? parts.slice(1).join(' - ') : String(full || '(cancion)');
      const vid = s.resourceId?.videoId || null;
      const songUrl = vid ? `https://www.youtube.com/watch?v=${vid}` : null;
      songs.push({ artist, title, provider: 'youtube', url: songUrl });
    });
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return songs;
}

async function fetchSpotifyPlaylistSongs(url, token) {
  if (!token) throw new Error('Falta token OAuth de Spotify');
  const playlistId = parseSpotifyPlaylistId(url);
  if (!playlistId) throw new Error('No se detecto playlist de Spotify');

  const songs = [];
  let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Spotify API error (${res.status})`);
    const data = await res.json();
    (data.items || []).forEach((it) => {
      const tr = it?.track;
      if (!tr) return;
      const artist = tr?.artists?.[0]?.name || '(artista)';
      const title = tr?.name || '(cancion)';
      const songUrl = tr?.external_urls?.spotify || null;
      const uri = tr?.uri || null;
      songs.push({ artist, title, provider: 'spotify', url: songUrl, uri });
    });
    nextUrl = data.next || null;
  }
  return songs;
}

function getRealtimeSnapshot(pin) {
  const session = getSession(pin);
  if (!session) return null;
  const drawn = listDrawnSongs(pin);
  return {
    session,
    cardsCount: listCards(pin).length,
    drawnCount: drawn.length,
    lastSong: drawn.length ? drawn[drawn.length - 1] : null,
    ts: Date.now(),
  };
}

function computeCardValidation(pin, card) {
  const drawn = listDrawnSongs(pin);
  const drawnKeys = new Set(drawn.map(normalizeSongKey));
  const total = card.songs.length;
  const missing = [];
  let matched = 0;
  for (const song of card.songs) {
    if (drawnKeys.has(normalizeSongKey(song))) {
      matched += 1;
    } else {
      missing.push({ artist: song.artist, title: song.title });
    }
  }
  return {
    pin,
    cardId: card.id,
    cardNumber: card.number,
    valid: matched === total,
    matched,
    total,
    missingSample: missing.slice(0, 8),
    missingCount: missing.length,
    checkedAt: Date.now(),
  };
}

function renderValidateCardHtml(nonce) {
  return `<!doctype html>
<html lang="ca">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Validar Cartó · QUINAPP</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700;800&display=swap" rel="stylesheet" />
  <style>
    :root{--bg:#faf9f6;--panel:#fff;--ink:#0d0d0d;--muted:#6b6b6b;--brand:#ff4b4b;--accent:#ffe234;--border:3px solid #0d0d0d;--shadow:5px 5px 0 #0d0d0d}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:"Space Grotesk",system-ui,sans-serif;background:var(--bg);color:var(--ink);padding:24px 16px;min-height:100vh}
    .wrap{max-width:560px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
    .logo{font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);padding-bottom:4px}
    .logo span{color:var(--ink)}
    .card{background:var(--panel);border:var(--border);box-shadow:var(--shadow);padding:24px}
    h1{font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:16px}
    .badge{display:inline-block;padding:6px 16px;font-size:28px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border:var(--border);margin-bottom:14px}
    .badge.valid{background:var(--accent)}
    .badge.invalid{background:var(--brand);color:#fff}
    .badge.loading{background:var(--bg)}
    .progress{font-size:20px;font-weight:800;margin-bottom:8px}
    .meta{font-size:13px;color:var(--muted);margin-top:4px}
    .missing{margin-top:18px;border-top:var(--border);padding-top:14px}
    .missing h2{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
    ul{padding-left:18px;display:flex;flex-direction:column;gap:4px}
    li{font-size:14px}
    .refresh{font-size:12px;color:var(--muted);text-align:right}
  </style>
</head>
<body>
  <main class="wrap">
    <div class="logo">♫ <span>QUINAPP</span> · Validació cartó</div>
    <section class="card">
      <h1>Estat del cartó</h1>
      <div id="badge" class="badge loading">CARREGANT</div>
      <div class="progress" id="progress"></div>
      <p class="meta" id="metaPin"></p>
      <p class="meta" id="metaCard"></p>
      <div class="missing" id="missingWrap" hidden>
        <h2>Cançons que falten</h2>
        <ul id="missingList"></ul>
      </div>
    </section>
    <div class="refresh" id="metaChecked"></div>
  </main>
  <script nonce="${nonce}">
    const params = new URLSearchParams(location.search);
    const d = params.get('d');
    const s = params.get('s');
    const badgeEl = document.getElementById('badge');
    const progressEl = document.getElementById('progress');
    const pinEl = document.getElementById('metaPin');
    const cardEl = document.getElementById('metaCard');
    const checkedEl = document.getElementById('metaChecked');
    const missingWrap = document.getElementById('missingWrap');
    const missingList = document.getElementById('missingList');
    async function refresh(){
      try{
        const res = await fetch('/api/validate-card?d='+encodeURIComponent(d||'')+'&s='+encodeURIComponent(s||''));
        const data = await res.json();
        if(!res.ok) throw new Error(data.error || 'No es pot validar');
        badgeEl.textContent = data.valid ? '✓ VALID' : '✗ NO VALID';
        badgeEl.className = 'badge ' + (data.valid ? 'valid' : 'invalid');
        progressEl.textContent = data.matched + ' / ' + data.total + ' cançons sonades';
        pinEl.textContent = 'PIN: ' + data.pin;
        cardEl.textContent = 'Cartó #' + data.cardNumber;
        checkedEl.textContent = 'Actualitzat: ' + new Date(data.checkedAt).toLocaleTimeString();
        missingList.innerHTML = '';
        const missing = data.missingSample || [];
        if(!data.valid && missing.length){
          missingWrap.hidden = false;
          missing.forEach((song)=>{const li=document.createElement('li');li.textContent=song.artist+' — '+song.title;missingList.appendChild(li);});
        } else {
          missingWrap.hidden = true;
        }
      }catch(err){
        badgeEl.textContent = 'ERROR';
        badgeEl.className = 'badge invalid';
        progressEl.textContent = err.message;
      }
    }
    refresh();
    setInterval(refresh, 4000);
  </script>
</body>
</html>`;
}

function renderValidateBatchHtml(nonce) {
  return `<!doctype html>
<html lang="ca">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Escaneig per lots · QUINAPP</title>
  <style>
    :root{--bg:#f7f7f7;--ink:#111;--muted:#666}
    *{box-sizing:border-box}
    body{margin:0;font-family:"Space Grotesk",system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--ink)}
    .wrap{max-width:980px;margin:0 auto;padding:20px}
    .head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
    .head-actions{display:flex;gap:8px;flex-wrap:wrap}
    h1{margin:0;font-size:24px;letter-spacing:.05em;text-transform:uppercase}
    .hint{font-size:13px;color:var(--muted)}
    .panel{background:#fff;border:2px solid #111;box-shadow:6px 6px 0 #111;padding:14px}
    .grid{display:grid;grid-template-columns:360px 1fr;gap:14px;margin-top:14px}
    @media(max-width:900px){.grid{grid-template-columns:1fr}}
    video{width:100%;aspect-ratio:3/4;background:#000;border:2px solid #111}
    .controls{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
    button,input,select{font:inherit}
    button{border:2px solid #111;background:#fff;padding:8px 10px;cursor:pointer;font-weight:700}
    button:disabled{opacity:.5;cursor:not-allowed}
    input,select{border:2px solid #111;padding:8px 10px;width:100%}
    .status{font-size:14px;margin-top:8px}
    .list{display:flex;flex-direction:column;gap:8px;max-height:72vh;overflow:auto}
    .item{border:2px solid #111;padding:10px;background:#fff}
    .item.ok{background:#fff}
    .item.bad{background:#fff}
    .top{display:flex;justify-content:space-between;gap:8px;align-items:center}
    .badge{font-size:12px;font-weight:800;letter-spacing:.08em}
    .meta{font-size:13px;color:#333}
    .small{font-size:12px;color:#666}
    .actions{display:flex;justify-content:flex-end;margin-top:8px}
    .actions button{font-size:12px;padding:6px 8px}
    .filters{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0 10px}
    .summary{font-size:12px;color:#666;margin-bottom:8px}
    ul{margin:8px 0 0;padding-left:18px}
  </style>
</head>
<body>
  <main class="wrap">
    <div class="head">
      <div>
        <h1>Escaneig per lots</h1>
        <div class="hint">Escaneja diversos QR seguits sense sortir de la pantalla.</div>
      </div>
      <div class="head-actions">
        <button id="exportCsvBtn">Exportar CSV</button>
        <button id="clearBtn">Netejar llista</button>
      </div>
    </div>
    <section class="grid">
      <div class="panel">
        <video id="video" autoplay playsinline muted></video>
        <div class="controls">
          <button id="startBtn">Iniciar camera</button>
          <button id="stopBtn" disabled>Aturar</button>
          <button id="photoBtn">Foto QR</button>
        </div>
        <div class="status" id="status">Estat: a punt</div>
        <div style="margin-top:10px">
          <div class="small">Alternativa manual URL QR</div>
          <input id="manualInput" placeholder="Enganxa URL /validate-card?d=...&s=..." />
          <input id="photoInput" type="file" accept="image/*" capture="environment" hidden />
          <div class="controls">
            <button id="manualBtn">Validar manual</button>
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="filters">
          <select id="filterStatus">
            <option value="all">Tots</option>
            <option value="invalid">Nomes no valids</option>
            <option value="valid">Nomes valids</option>
          </select>
          <select id="filterWindow">
            <option value="all">Tot el temps</option>
            <option value="5">Ultims 5 min</option>
            <option value="15">Ultims 15 min</option>
          </select>
        </div>
        <div id="summary" class="summary">0 resultats</div>
        <div class="small">Resultats (mes recents a dalt)</div>
        <div id="results" class="list"></div>
      </div>
    </section>
  </main>
  <script nonce="${nonce}">
    const video = document.getElementById('video');
    const statusEl = document.getElementById('status');
    const resultsEl = document.getElementById('results');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const clearBtn = document.getElementById('clearBtn');
    const manualInput = document.getElementById('manualInput');
    const manualBtn = document.getElementById('manualBtn');
    const photoBtn = document.getElementById('photoBtn');
    const photoInput = document.getElementById('photoInput');
    const filterStatus = document.getElementById('filterStatus');
    const filterWindow = document.getElementById('filterWindow');
    const summaryEl = document.getElementById('summary');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const seen = new Map();
    const rows = [];
    let stream = null;
    let timer = null;
    let detector = null;
    let jsQrFn = null;
    let scanCanvas = null;
    let scanCtx = null;
    let audioCtx = null;

    function setStatus(text){ statusEl.textContent = 'Estat: ' + text; }
    function isLocalhostHost() {
      const h = String(location.hostname || '').toLowerCase();
      return h === 'localhost' || h === '127.0.0.1' || h === '::1';
    }
    async function ensureJsQr(){
      if(jsQrFn) return jsQrFn;
      if(typeof window.jsQR === 'function'){
        jsQrFn = window.jsQR;
        return jsQrFn;
      }
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
        s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error('No es pot carregar la llibreria QR'));
        document.head.appendChild(s);
      });
      if(typeof window.jsQR !== 'function') throw new Error('Llibreria QR no disponible');
      jsQrFn = window.jsQR;
      return jsQrFn;
    }
    function loadImageFromFile(file){
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('No es pot llegir la imatge'));
          img.src = String(reader.result || '');
        };
        reader.onerror = () => reject(new Error('No es pot llegir el fitxer'));
        reader.readAsDataURL(file);
      });
    }
    async function decodeQrFromImageFile(file){
      if(!file) return null;
      const jsqr = await ensureJsQr();
      const img = await loadImageFromFile(file);
      if(!scanCanvas){
        scanCanvas = document.createElement('canvas');
        scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });
      }
      if(!scanCtx) throw new Error('Canvas no disponible');
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if(!w || !h) throw new Error('Imatge no valida');
      scanCanvas.width = w;
      scanCanvas.height = h;
      scanCtx.drawImage(img, 0, 0, w, h);
      const data = scanCtx.getImageData(0, 0, w, h);
      const qr = jsqr(data.data, w, h, { inversionAttempts: 'attemptBoth' });
      return qr?.data || null;
    }
    function ensureAudio(){
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if(!Ctx) return null;
      if(!audioCtx) audioCtx = new Ctx();
      if(audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
      return audioCtx;
    }
    function beep(freq, duration, at){
      const ctx = ensureAudio();
      if(!ctx) return;
      const now = ctx.currentTime + (at || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }
    function playFeedback(valid){
      try{
        if(valid){
          beep(920, 0.09, 0);
          if(navigator.vibrate) navigator.vibrate(70);
        }else{
          beep(240, 0.1, 0);
          beep(190, 0.12, 0.14);
          if(navigator.vibrate) navigator.vibrate([60,45,60]);
        }
      }catch{}
    }
    function extractDs(raw){
      try{
        const u = raw.startsWith('http') ? new URL(raw) : new URL(raw, location.origin);
        const d = u.searchParams.get('d');
        const s = u.searchParams.get('s');
        if (d && s) return {d,s};
      }catch{}
      return null;
    }
    function shouldProcess(key){
      const now = Date.now();
      const last = seen.get(key) || 0;
      if (now - last < 5000) return false;
      seen.set(key, now);
      return true;
    }
    function applyFilters(){
      const mode = filterStatus.value;
      const win = filterWindow.value;
      const now = Date.now();
      let shown = 0;
      const all = Array.from(resultsEl.children);
      for(const item of all){
        const isValid = item.dataset.valid === '1';
        const ts = Number(item.dataset.ts || 0);
        let ok = true;
        if(mode === 'valid') ok = isValid;
        if(mode === 'invalid') ok = !isValid;
        if(ok && win !== 'all'){
          const maxAgeMs = Number(win) * 60 * 1000;
          ok = (now - ts) <= maxAgeMs;
        }
        item.hidden = !ok;
        if(ok) shown += 1;
      }
      summaryEl.textContent = shown + ' visibles / ' + all.length + ' totals';
    }
    function csvEscape(value){
      const text = String(value ?? '');
      if(/[",\\n\\r]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
      return text;
    }
    function exportCsv(){
      if(!rows.length){
        setStatus('sense resultats per exportar');
        return;
      }
      const header = ['timestamp','pin','cardNumber','valid','matched','total','missing'];
      const lines = [header.join(',')];
      for(const row of rows){
        lines.push([
          new Date(row.checkedAt).toISOString(),
          row.pin,
          row.cardNumber,
          row.valid ? 'valid' : 'invalid',
          row.matched,
          row.total,
          row.missing.join(' | ')
        ].map(csvEscape).join(','));
      }
      const csv = lines.join('\\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[.:]/g, '-');
      a.href = url;
      a.download = 'validate-batch-' + ts + '.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus('CSV exportat');
    }
    function renderResult(data){
      const item = document.createElement('article');
      item.className = 'item ' + (data.valid ? 'ok' : 'bad');
      item.dataset.valid = data.valid ? '1' : '0';
      item.dataset.ts = String(data.checkedAt || Date.now());
      const top = document.createElement('div'); top.className = 'top';
      const t1 = document.createElement('div');
      t1.className = 'badge';
      t1.textContent = data.valid ? 'VALID' : 'NO VALID';
      const t2 = document.createElement('div');
      t2.className = 'small';
      t2.textContent = new Date(data.checkedAt || Date.now()).toLocaleTimeString();
      top.append(t1,t2);
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = 'PIN ' + data.pin + ' · Carto #' + data.cardNumber + ' · ' + data.matched + '/' + data.total;
      item.append(top, meta);
      if(data.validationUrl){
        item.dataset.validationUrl = data.validationUrl;
      }
      if(!data.valid && Array.isArray(data.missingSample) && data.missingSample.length){
        const ul = document.createElement('ul');
        data.missingSample.forEach((s)=>{const li=document.createElement('li');li.textContent=s.artist+' — '+s.title;ul.appendChild(li);});
        item.appendChild(ul);
      }
      if(data.validationUrl){
        const actions = document.createElement('div');
        actions.className = 'actions';
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.dataset.action = 'copy-link';
        copyBtn.textContent = 'Copiar enllac';
        actions.appendChild(copyBtn);
        item.appendChild(actions);
      }
      resultsEl.prepend(item);
      rows.unshift({
        checkedAt: Number(data.checkedAt || Date.now()),
        pin: data.pin || '',
        cardNumber: data.cardNumber || '',
        valid: Boolean(data.valid),
        matched: Number(data.matched || 0),
        total: Number(data.total || 0),
        missing: Array.isArray(data.missingSample) ? data.missingSample.map((s)=> (s.artist || '') + ' - ' + (s.title || '')) : [],
      });
      playFeedback(Boolean(data.valid));
      applyFilters();
    }
    async function validateDs(d,s){
      const key = d + '::' + s;
      if (!shouldProcess(key)) return;
      const res = await fetch('/api/validate-card?d='+encodeURIComponent(d)+'&s='+encodeURIComponent(s));
      const data = await res.json().catch(()=>({error:'Resposta no valida'}));
      if(!res.ok) throw new Error(data.error || 'No es pot validar');
      renderResult({ ...data, validationUrl: location.origin + '/validate-card?d=' + encodeURIComponent(d) + '&s=' + encodeURIComponent(s) });
    }
    async function processRaw(raw){
      const q = extractDs(raw);
      if(!q){ setStatus('QR no reconegut'); return; }
      try{
        await validateDs(q.d, q.s);
        setStatus('QR validat');
      }catch(err){
        setStatus(err.message);
      }
    }
    async function scanFrame(){
      if(!video.videoWidth) return;
      try{
        if(detector){
          const barcodes = await detector.detect(video);
          for(const code of barcodes){
            const raw = code.rawValue || '';
            if(raw) await processRaw(raw);
          }
          return;
        }
        if(!scanCanvas){
          scanCanvas = document.createElement('canvas');
          scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });
        }
        if(!scanCtx) return;
        const w = video.videoWidth;
        const h = video.videoHeight;
        if(!w || !h) return;
        scanCanvas.width = w;
        scanCanvas.height = h;
        scanCtx.drawImage(video, 0, 0, w, h);
        const img = scanCtx.getImageData(0, 0, w, h);
        const qr = jsQrFn ? jsQrFn(img.data, w, h, { inversionAttempts: 'attemptBoth' }) : null;
        if(qr?.data){
          await processRaw(qr.data);
        }
      }catch{}
    }
    async function startCam(){
      if(!navigator.mediaDevices?.getUserMedia){
        setStatus('Camera web no compatible. Usa "Foto QR" o validar manual.');
        return;
      }
      const secureLike = window.isSecureContext || isLocalhostHost();
      if(!secureLike){
        setStatus('Camera bloquejada en HTTP. Obre la URL a Safari/Chrome normal o usa HTTPS.');
      }
      detector = null;
      if('BarcodeDetector' in window){
        try{
          detector = new BarcodeDetector({ formats: ['qr_code'] });
          setStatus('escanejant... (detector natiu)');
        }catch{
          detector = null;
        }
      }
      if(!detector){
        await ensureJsQr();
        setStatus('escanejant... (mode compatibilitat iPhone)');
      }
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio:false });
      video.srcObject = stream;
      startBtn.disabled = true; stopBtn.disabled = false;
      timer = setInterval(scanFrame, 450);
    }
    function stopCam(){
      if(timer){ clearInterval(timer); timer = null; }
      if(stream){ stream.getTracks().forEach(t=>t.stop()); stream = null; }
      detector = null;
      video.srcObject = null;
      startBtn.disabled = false; stopBtn.disabled = true;
      setStatus('aturat');
    }
    startBtn.addEventListener('click', async()=>{ try{ await startCam(); }catch(e){ setStatus(e.message || 'No es pot obrir la camera'); }});
    stopBtn.addEventListener('click', stopCam);
    clearBtn.addEventListener('click', ()=>{ resultsEl.innerHTML=''; rows.length = 0; seen.clear(); applyFilters(); });
    exportCsvBtn.addEventListener('click', exportCsv);
    resultsEl.addEventListener('click', async (event) => {
      const btn = event.target.closest('button[data-action="copy-link"]');
      if(!btn) return;
      const article = btn.closest('.item');
      const link = article?.dataset?.validationUrl || '';
      if(!link){
        setStatus('enllac no disponible');
        return;
      }
      try{
        if(navigator.clipboard?.writeText){
          await navigator.clipboard.writeText(link);
        }else{
          const temp = document.createElement('input');
          temp.value = link;
          document.body.appendChild(temp);
          temp.select();
          document.execCommand('copy');
          temp.remove();
        }
        setStatus('enllac copiat');
      }catch{
        setStatus('no es pot copiar');
      }
    });
    manualBtn.addEventListener('click', ()=> processRaw(manualInput.value.trim()));
    photoBtn?.addEventListener('click', () => {
      if(!photoInput) return;
      photoInput.value = '';
      photoInput.click();
    });
    photoInput?.addEventListener('change', async () => {
      const file = photoInput.files?.[0];
      if(!file) return;
      try{
        setStatus('processant foto...');
        const raw = await decodeQrFromImageFile(file);
        if(!raw){
          setStatus('Cap QR detectat a la foto');
          return;
        }
        await processRaw(raw);
      }catch(err){
        setStatus(err.message || 'No es pot processar la foto');
      }
    });
    filterStatus.addEventListener('change', applyFilters);
    filterWindow.addEventListener('change', applyFilters);
    applyFilters();
  </script>
</body>
</html>`;
}

function renderPlayCardHtml(pin, card, nonce) {
  return `<!doctype html>
<html lang="ca">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Cartó ${htmlEscape(card.number)} · QUINAPP</title>
  <style>
    :root{--bg:#f7f7f7;--ink:#111;--muted:#666;--marked:#000;--unmarked:#999}
    *{box-sizing:border-box}
    body{margin:0;font-family:"Space Grotesk",system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--ink)}
    .wrap{max-width:600px;margin:0 auto;padding:20px}
    .header{text-align:center;margin-bottom:20px}
    h1{margin:0 0 8px;font-size:24px;letter-spacing:.04em;text-transform:uppercase}
    .meta{font-size:14px;color:var(--muted)}
    .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:20px 0}
    .cell{background:#fff;border:2px solid #111;padding:12px;text-align:center;font-weight:700;cursor:pointer;user-select:none;transition:background 0.2s}
    .cell.marked{background:var(--marked);color:#fff}
    .cell.unmarked{background:#fff;color:var(--ink)}
    .artist{font-size:12px;color:var(--muted);margin-bottom:2px}
    .title{font-size:14px}
    .actions{display:flex;gap:10px;justify-content:center;margin-top:20px}
    button{border:2px solid #111;background:#fff;padding:12px 16px;font-weight:700;cursor:pointer}
    button:disabled{opacity:.5;cursor:not-allowed}
    .status{margin-top:20px;text-align:center;font-size:18px;font-weight:700}
    .now-playing{background:#fff;border:2px solid #111;padding:16px;margin:20px 0;text-align:center}
    .now-playing h2{margin:0 0 8px;font-size:18px;text-transform:uppercase}
    .now-song{font-size:20px;font-weight:800}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>Cartó #${htmlEscape(card.number)}</h1>
      <div class="meta">PIN: ${htmlEscape(pin)} · ${htmlEscape(card.songs.length)} cançons</div>
    </div>

    <div id="nowPlaying" class="now-playing">
      <h2>Cançó actual</h2>
      <div id="nowSong" class="now-song">Esperant...</div>
    </div>

    <div id="grid" class="grid"></div>

    <div class="actions">
      <button id="claimLine">Reclamar línia</button>
      <button id="claimBingo">¡BINGO!</button>
    </div>

    <div id="status" class="status"></div>
  </div>

  <script nonce="${nonce}">
    const pin = ${jsStringLiteral(pin)};
    const cardId = ${jsStringLiteral(card.id)};
    const cardSongs = ${jsonForScript(card.songs)};
    let marked = new Set();
    let drawnSongs = [];
    let eventSource = null;

    function renderGrid() {
      const grid = document.getElementById('grid');
      grid.innerHTML = '';
      cardSongs.forEach((song, idx) => {
        const cell = document.createElement('div');
        cell.className = 'cell ' + (marked.has(idx) ? 'marked' : 'unmarked');
        cell.setAttribute('role', 'button');
        cell.setAttribute('tabindex', '0');
        const artistEl = document.createElement('div');
        artistEl.className = 'artist';
        artistEl.textContent = song.artist;
        const titleEl = document.createElement('div');
        titleEl.className = 'title';
        titleEl.textContent = song.title;
        cell.append(artistEl, titleEl);
        cell.addEventListener('click', () => toggleMark(idx));
        cell.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMark(idx); }
        });
        grid.appendChild(cell);
      });
    }

    function toggleMark(idx) {
      if (marked.has(idx)) {
        marked.delete(idx);
      } else {
        marked.add(idx);
      }
      localStorage.setItem(\`quinapp-\${pin}-\${cardId}-marks\`, JSON.stringify([...marked]));
      renderGrid();
    }

    function updateDrawn() {
      const drawnKeys = new Set(drawnSongs.map(s => \`\${s.artist}::\${s.title}\`));
      marked.clear();
      cardSongs.forEach((song, idx) => {
        if (drawnKeys.has(\`\${song.artist}::\${song.title}\`)) {
          marked.add(idx);
        }
      });
      const saved = localStorage.getItem(\`quinapp-\${pin}-\${cardId}-marks\`);
      if (saved) {
        try {
          const savedMarks = new Set(JSON.parse(saved));
          savedMarks.forEach(idx => marked.add(idx));
        } catch {}
      }
      renderGrid();
    }

    function updateNowPlaying() {
      const now = document.getElementById('nowSong');
      if (drawnSongs.length > 0) {
        const last = drawnSongs[drawnSongs.length - 1];
        now.textContent = \`\${last.artist} — \${last.title}\`;
      } else {
        now.textContent = 'Esperant...';
      }
    }

    async function claim(type) {
      const status = document.getElementById('status');
      status.textContent = 'Enviant reclamació...';
      try {
        const res = await fetch(\`/api/sessions/\${pin}/claims\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardId, type })
        });
        const data = await res.json();
        if (res.ok) {
          status.textContent = data.valid ? \`¡\${type.toUpperCase()} vàlid!\` : \`\${type.toUpperCase()} no vàlid\`;
        } else {
          status.textContent = data.error || 'Error';
        }
      } catch (err) {
        status.textContent = 'Error de connexió';
      }
      setTimeout(() => status.textContent = '', 5000);
    }

    function refreshDrawn() {
      fetch(\`/api/sessions/\${pin}/drawn\`)
        .then(r => r.json())
        .then(d => {
          drawnSongs = d.drawn || [];
          updateDrawn();
          updateNowPlaying();
        })
        .catch(() => {});
    }

    function connectSSE() {
      if (eventSource) eventSource.close();
      eventSource = new EventSource(\`/api/sessions/\${pin}/events\`);
      // Server emits named SSE events, so onmessage (default 'message') never fires.
      ['draw.next', 'draw.undo', 'session.snapshot', 'session.updated'].forEach((name) => {
        eventSource.addEventListener(name, refreshDrawn);
      });
      eventSource.onerror = () => {
        setTimeout(connectSSE, 5000);
      };
    }

    document.getElementById('claimLine').addEventListener('click', () => claim('linea'));
    document.getElementById('claimBingo').addEventListener('click', () => claim('bingo'));

    // Initial load
    fetch(\`/api/sessions/\${pin}/drawn\`)
      .then(r => r.json())
      .then(d => {
        drawnSongs = d.drawn || [];
        updateDrawn();
        updateNowPlaying();
        connectSSE();
      });
  </script>
</body>
</html>`;
}

function requestBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.trim()) {
    return process.env.PUBLIC_BASE_URL.trim();
  }
  const protoHeader = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = protoHeader || (req.socket?.encrypted ? 'https' : 'http');
  const host = req.headers.host || '127.0.0.1:3000';
  return `${proto}://${host}`;
}

function listNetworkUrls(port) {
  const urls = [];
  const seen = new Set();
  const add = (u) => {
    if (!u || seen.has(u)) return;
    seen.add(u);
    urls.push(u);
  };

  add(`http://127.0.0.1:${port}`);
  add(`http://localhost:${port}`);

  const ifaces = os.networkInterfaces();
  for (const entries of Object.values(ifaces)) {
    for (const inf of entries || []) {
      if (!inf || inf.internal || inf.family !== 'IPv4') continue;
      const ip = String(inf.address || '').trim();
      if (!ip) continue;
      add(`http://${ip}:${port}`);
    }
  }
  return urls;
}

const ssePingTimer = startSsePing(sseClients, SSE_PING_INTERVAL_MS);

async function serveStatic(req, res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(WEB_ROOT, safePath);

  if (!filePath.startsWith(WEB_ROOT)) {
    notFound(res);
    return;
  }

  try {
    const content = await readFile(filePath);
    const ext = path.extname(filePath);
    const type =
      ext === '.html' ? 'text/html; charset=utf-8' :
      ext === '.js' ? 'text/javascript; charset=utf-8' :
      ext === '.css' ? 'text/css; charset=utf-8' :
      ext === '.json' ? 'application/json; charset=utf-8' :
      'application/octet-stream';

    const headers = { 'Content-Type': type };
    // index.html ships no inline <script>, so a nonce-less CSP still allows it
    // while blocking any injected inline script.
    if (ext === '.html') headers['Content-Security-Policy'] = cspHeader(randomBytes(16).toString('base64'));
    res.writeHead(200, headers);
    res.end(content);
  } catch {
    notFound(res);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    try {
      if (req.method === 'GET' && pathname === '/api/validate-card') {
        const d = url.searchParams.get('d') || '';
        const s = url.searchParams.get('s') || '';
        const payload = decodeAndVerifyQrQuery(d, s);
        // QR TTL: reject payloads older than QR_TTL_DAYS (default 30 days)
        const ttlDays = Math.max(1, Number(process.env.QR_TTL_DAYS || 30));
        if (payload.issuedAt && Date.now() - payload.issuedAt > ttlDays * 86_400_000) {
          json(res, 400, { error: `QR caducat (TTL ${ttlDays} dies)` });
          return;
        }
        const session = getSession(payload.pin);
        if (!session) {
          json(res, 404, { error: 'Sesion no encontrada' });
          return;
        }
        const card = getCard(payload.pin, payload.cardId);
        if (!card) {
          json(res, 404, { error: 'Carton no encontrado' });
          return;
        }
        const result = computeCardValidation(payload.pin, card);
        json(res, 200, result);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/sessions') {
        rateLimit(clientIp(req), 'create-session', 10, RATE_WINDOW_MS);
        const body = await parseBody(req);
        const session = createSession(body);
        broadcast(sseClients, session.pin, 'session.updated', { session });
        json(res, 201, session);
        return;
      }

      const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (req.method === 'GET' && sessionMatch) {
        const pin = decodeURIComponent(sessionMatch[1]);
        const session = getSession(pin);
        if (!session) {
          json(res, 404, { error: 'Sesion no encontrada' });
          return;
        }
        json(res, 200, session);
        return;
      }

      const sessionEventsMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/events$/);
      if (req.method === 'GET' && sessionEventsMatch) {
        const pin = decodeURIComponent(sessionEventsMatch[1]);
        const snapshot = getRealtimeSnapshot(pin);
        if (!snapshot) {
          json(res, 404, { error: 'Sesion no encontrada' });
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        });
        res.write('retry: 1000\n\n');
        res.write(`event: session.snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);

        const clients = getSseSet(sseClients, pin);
        clients.add(res);

        req.on('close', () => {
          clients.delete(res);
        });
        return;
      }

      const drawnMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/drawn$/);
      if (req.method === 'GET' && drawnMatch) {
        const pin = decodeURIComponent(drawnMatch[1]);
        const session = getSession(pin);
        if (!session) {
          json(res, 404, { error: 'Sesion no encontrada' });
          return;
        }
        json(res, 200, { drawn: listDrawnSongs(pin) });
        return;
      }

      const cardsMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/cards$/);
      if (cardsMatch) {
        const pin = decodeURIComponent(cardsMatch[1]);
        if (req.method === 'POST') {
          const body = await parseBody(req);
          const cards = createCards(pin, body.count);
          broadcast(sseClients, pin, 'cards.created', { count: cards.length, cards });
          json(res, 201, { cards });
          return;
        }
        if (req.method === 'GET') {
          json(res, 200, { cards: listCards(pin) });
          return;
        }
      }

      const cardMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/cards\/([^/]+)$/);
      if (req.method === 'GET' && cardMatch) {
        const pin = decodeURIComponent(cardMatch[1]);
        const cardId = decodeURIComponent(cardMatch[2]);
        const card = getCard(pin, cardId);
        if (!card) {
          json(res, 404, { error: 'Carton no encontrado' });
          return;
        }
        json(res, 200, { card });
        return;
      }

      const cardPdfMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/cards\/([^/]+)\/pdf$/);
      if (req.method === 'GET' && cardPdfMatch) {
        const pin = decodeURIComponent(cardPdfMatch[1]);
        const cardId = decodeURIComponent(cardPdfMatch[2]);
        const session = getSession(pin);
        if (!session) {
          json(res, 404, { error: 'Sesion no encontrada' });
          return;
        }
        const card = getCard(pin, cardId);
        if (!card) {
          json(res, 404, { error: 'Carton no encontrado' });
          return;
        }

        const pdfBytes = await buildCardsPdf(session, [card], {
          format: 'a5',
          showMeta: true,
          highContrast: true,
          baseUrl: requestBaseUrl(req),
        });
        sendBinary(res, 200, 'application/pdf', pdfBytes, `quinapp-${pin}-card-${card.number}.pdf`);
        return;
      }

      const sessionPdfMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/pdf-pro$/);
      if (req.method === 'POST' && sessionPdfMatch) {
        const pin = decodeURIComponent(sessionPdfMatch[1]);
        const session = getSession(pin);
        if (!session) {
          json(res, 404, { error: 'Sesion no encontrada' });
          return;
        }
        const body = await parseBody(req);
        const allCards = listCards(pin);
        if (!allCards.length) throw new Error('No hay cartones en la sesion');

        const wantedIds = Array.isArray(body.cardIds) ? new Set(body.cardIds) : null;
        const cards = wantedIds ? allCards.filter((c) => wantedIds.has(c.id)) : allCards;
        if (!cards.length) throw new Error('No hay cartones para exportar');

        const format = body.format === 'a5' ? 'a5' : 'a4-2up';
        const showMeta = body.showMeta !== false;
        const highContrast = Boolean(body.highContrast);
        const preset = String(body.preset || 'evento');
        const pdfBytes = await buildCardsPdf(session, cards, {
          format,
          preset,
          showMeta,
          highContrast,
          baseUrl: requestBaseUrl(req),
        });
        sendBinary(res, 200, 'application/pdf', pdfBytes, `quinapp-${pin}-${format}.pdf`);
        return;
      }

      const drawMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/draw\/next$/);
      if (req.method === 'POST' && drawMatch) {
        const pin = decodeURIComponent(drawMatch[1]);
        rateLimit(clientIp(req), `draw::${pin}`, 60, RATE_WINDOW_MS);
        const result = drawNextSong(pin);
        if (!result.done) {
          broadcast(sseClients, pin, 'draw.next', result);
        }
        json(res, 200, result);
        return;
      }

      const drawPeekMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/draw\/peek$/);
      if (req.method === 'GET' && drawPeekMatch) {
        const pin = decodeURIComponent(drawPeekMatch[1]);
        const result = peekNextSong(pin);
        json(res, 200, result);
        return;
      }

      const undoMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/draw\/undo$/);
      if (req.method === 'POST' && undoMatch) {
        const pin = decodeURIComponent(undoMatch[1]);
        const body = await parseBody(req);
        rateLimit(clientIp(req), `undo::${pin}`, 10, RATE_WINDOW_MS);
        // Require admin PIN only when the session is configured with one.
        if (sessionHasAdminPin(pin)) {
          if (!body.adminPin) throw new Error('Cal el PIN admin per fer undo');
          requireAdmin(pin, String(body.adminPin));
        }
        const result = undoLastDraw(pin, 'locutor');
        broadcast(sseClients, pin, 'draw.undo', result);
        json(res, 200, result);
        return;
      }

      const claimMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/claims$/);
      if (req.method === 'POST' && claimMatch) {
        const pin = decodeURIComponent(claimMatch[1]);
        rateLimit(clientIp(req), `claim::${pin}`, 30, RATE_WINDOW_MS);
        const body = await parseBody(req);
        const result = evaluateClaim(pin, body.cardId, body.type);
        broadcast(sseClients, pin, 'claim.checked', { cardId: body.cardId, result });
        json(res, 200, result);
        return;
      }

      const importSongsMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/import-songs$/);
      if (req.method === 'POST' && importSongsMatch) {
        const pin = decodeURIComponent(importSongsMatch[1]);
        const body = await parseBody(req);
        const session = importSongsToSession(pin, body.songs || []);
        broadcast(sseClients, pin, 'session.updated', { session });
        json(res, 200, session);
        return;
      }

      const resetRoundMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/reset-round$/);
      if (req.method === 'POST' && resetRoundMatch) {
        const pin = decodeURIComponent(resetRoundMatch[1]);
        // Throttle admin-PIN attempts per IP+session to slow brute force.
        rateLimit(clientIp(req), `admin::${pin}`, 10, RATE_WINDOW_MS);
        const body = await parseBody(req);
        const session = resetSessionRound(pin, String(body.adminPin || ''), 'admin');
        broadcast(sseClients, pin, 'session.updated', { session });
        json(res, 200, session);
        return;
      }

      const deleteSessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (req.method === 'DELETE' && deleteSessionMatch) {
        const pin = decodeURIComponent(deleteSessionMatch[1]);
        rateLimit(clientIp(req), `admin::${pin}`, 10, RATE_WINDOW_MS);
        const body = await parseBody(req);
        const result = deleteSession(pin, String(body.adminPin || ''), 'admin');
        json(res, 200, result);
        return;
      }

      const auditMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/audit$/);
      if (req.method === 'GET' && auditMatch) {
        const pin = decodeURIComponent(auditMatch[1]);
        const limit = Number(url.searchParams.get('limit') || 300);
        const logs = listAuditLogs(pin, limit);
        json(res, 200, { logs });
        return;
      }

      const logExportMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/log-export$/);
      if (req.method === 'GET' && logExportMatch) {
        const pin = decodeURIComponent(logExportMatch[1]);
        const format = (url.searchParams.get('format') || 'json').toLowerCase();
        const logs = listAuditLogs(pin, 2000);
        if (format === 'csv') {
          const esc = (v) => {
            const s = String(v ?? '');
            return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          };
          const lines = ['id,createdAt,actor,action,details'];
          logs.slice().reverse().forEach((l) => {
            lines.push([
              l.id,
              l.createdAt,
              l.actor,
              l.action,
              JSON.stringify(l.details || {}),
            ].map(esc).join(','));
          });
          sendBinary(res, 200, 'text/csv; charset=utf-8', Buffer.from(lines.join('\n'), 'utf8'), `quinapp-${pin}-log.csv`);
          return;
        }
        sendBinary(
          res,
          200,
          'application/json; charset=utf-8',
          Buffer.from(JSON.stringify({ pin, logs: logs.slice().reverse() }, null, 2), 'utf8'),
          `quinapp-${pin}-log.json`
        );
        return;
      }

      if (req.method === 'POST' && pathname === '/api/tools/parse-csv') {
        const body = await parseBody(req);
        const songs = parseCSV(String(body.csvText || ''));
        json(res, 200, { songs });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/tools/parse-xlsx') {
        const body = await parseBody(req);
        if (!body.base64) throw new Error('Falta base64');
        const songs = await parseXlsxBase64(body.base64);
        json(res, 200, { songs });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/tools/import-playlist') {
        const body = await parseBody(req);
        const playlistUrl = String(body.url || '').trim();
        if (!playlistUrl) throw new Error('Falta URL de playlist');
        const provider = body.provider && body.provider !== 'auto'
          ? String(body.provider)
          : detectPlaylistProvider(playlistUrl);

        let songs = [];
        if (provider === 'youtube') {
          songs = await fetchYouTubePlaylistSongs(playlistUrl, String(body.apiKey || '').trim());
        } else if (provider === 'spotify') {
          songs = await fetchSpotifyPlaylistSongs(playlistUrl, String(body.token || '').trim());
        } else {
          throw new Error('Proveedor no soportado o no detectado');
        }

        json(res, 200, { provider, count: songs.length, songs });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/tools/spotify-config') {
        const clientId = String(process.env.SPOTIFY_CLIENT_ID || '').trim();
        json(res, 200, {
          clientId,
          configured: Boolean(clientId),
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/tools/analyze-songs') {
        const body = await parseBody(req);
        const songs = Array.isArray(body.songs) ? body.songs : [];
        const existingSongs = Array.isArray(body.existingSongs) ? body.existingSongs : [];
        const report = analyzeSongsQuality(songs, existingSongs);
        json(res, 200, report);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/system/network') {
        const port = Number(process.env.PORT || 3000);
        const urls = listNetworkUrls(port);
        const selectedUrl = process.env.PUBLIC_BASE_URL || urls.find((u) => !u.includes('127.0.0.1') && !u.includes('localhost')) || urls[0] || '';
        let qrDataUrl = '';
        try {
          if (selectedUrl) {
            qrDataUrl = await QRCode.toDataURL(selectedUrl, {
              errorCorrectionLevel: 'M',
              margin: 1,
              width: 320,
              color: { dark: '#000000', light: '#FFFFFF' },
            });
          }
        } catch {
          qrDataUrl = '';
        }
        json(res, 200, {
          port,
          urls,
          selectedUrl,
          qrDataUrl,
          publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/system/health') {
        json(res, 200, {
          ok: true,
          ts: Date.now(),
          uptimeMs: Date.now() - serverStartedAt,
          pid: process.pid,
          host: process.env.HOST || '127.0.0.1',
          port: Number(process.env.PORT || 3000),
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/system/probe') {
        const body = await parseBody(req);
        const target = String(body.url || '').trim();
        if (!target) throw new Error('Falta URL');
        let endpoint;
        try {
          const u = new URL(target);
          if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('proto');
          if (!isPrivateHost(u.hostname)) throw new Error('host');
          endpoint = new URL('/api/system/health', `${u.protocol}//${u.host}`).toString();
        } catch {
          throw new Error('URL no permesa (només LAN/local)');
        }
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 2500);
        try {
          const r = await fetch(endpoint, { method: 'GET', signal: ctrl.signal });
          const data = await r.json().catch(() => ({}));
          json(res, 200, {
            ok: r.ok && Boolean(data.ok),
            status: r.status,
            endpoint,
          });
        } catch {
          json(res, 200, { ok: false, status: 0, endpoint });
        } finally {
          clearTimeout(to);
        }
        return;
      }

      notFound(res);
      return;
    } catch (error) {
      json(res, 400, { error: error.message || 'Peticion invalida' });
      return;
    }
  }

  if (req.method === 'GET' && pathname === '/validate-card') {
    const nonce = randomBytes(16).toString('base64');
    sendHtml(res, renderValidateCardHtml(nonce), nonce);
    return;
  }

  if (req.method === 'GET' && pathname === '/validate-batch') {
    const nonce = randomBytes(16).toString('base64');
    sendHtml(res, renderValidateBatchHtml(nonce), nonce);
    return;
  }

  if (req.method === 'GET' && pathname === '/play-card') {
    const pin = url.searchParams.get('pin') || '';
    const cardId = url.searchParams.get('card') || '';
    if (!pin || !cardId) {
      json(res, 400, { error: 'Faltan parametros pin y card' });
      return;
    }
    const session = getSession(pin);
    if (!session) {
      json(res, 404, { error: 'Sesion no encontrada' });
      return;
    }
    const card = getCard(pin, cardId);
    if (!card) {
      json(res, 404, { error: 'Carton no encontrado' });
      return;
    }
    const nonce = randomBytes(16).toString('base64');
    sendHtml(res, renderPlayCardHtml(pin, card, nonce), nonce);
    return;
  }

  await serveStatic(req, res, pathname);
});

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
server.listen(PORT, HOST, () => {
  console.log(`QUINAPP v3 (faseada) corriendo en http://${HOST}:${PORT}`);
  console.log(`SQLite: ${dbPath}`);
});

server.on('close', () => {
  clearInterval(ssePingTimer);
});
