const TOAST_DURATION_MS = 3200;
const DEMO = `Dua Lipa - Levitating
ABBA - Dancing Queen
Queen - Don't Stop Me Now
Coldplay - Viva la Vida
Kate Bush - Running Up That Hill
Shakira - Hips Don't Lie
Daft Punk - Get Lucky
Michael Jackson - Billie Jean
Rosalia - Despecha
The Weeknd - Blinding Lights
Adele - Rolling in the Deep
Backstreet Boys - I Want It That Way
Oques Grasses - Serem ocells
Txarango - Compta amb mi
Lax'n'Busto - Llenca't
U2 - Beautiful Day
George Michael - Faith`;

const state = {
  session: null,
  cards: [],
  activeCardIndex: 0,
  drawnSongs: [],
  marked: new Set(),
  blockedSongs: new Set(),
  eventSource: null,
  currentSong: null,
  nextSong: null,
  playlistDone: false,
};

const spotifyPlayback = {
  sdkPromise: null,
  player: null,
  deviceId: null,
  ready: false,
  paused: true,
  volume: 0.8,
};

const els = {
  pin:           document.querySelector('#pin'),
  seed:          document.querySelector('#seed'),
  rows:          document.querySelector('#rows'),
  cols:          document.querySelector('#cols'),
  cardsCount:    document.querySelector('#cardsCount'),
  songs:         document.querySelector('#songs'),
  playlistUrl:   document.querySelector('#playlistUrl'),
  playlistProvider: document.querySelector('#playlistProvider'),
  playlistCredential: document.querySelector('#playlistCredential'),
  spotifyClientId: document.querySelector('#spotifyClientId'),
  spotifyConnect: document.querySelector('#spotifyConnect'),
  spotifyDisconnect: document.querySelector('#spotifyDisconnect'),
  spotifyStatus: document.querySelector('#spotifyStatus'),
  spotifyEmbed: document.querySelector('#spotifyEmbed'),
  spotifyPlayerStatus: document.querySelector('#spotifyPlayerStatus'),
  spotifySdkStatus: document.querySelector('#spotifySdkStatus'),
  spotifyPlayCurrent: document.querySelector('#spotifyPlayCurrent'),
  spotifyOpenCurrent: document.querySelector('#spotifyOpenCurrent'),
  spotifyAutoplay: document.querySelector('#spotifyAutoplay'),
  spotifyPrev: document.querySelector('#spotifyPrev'),
  spotifyToggle: document.querySelector('#spotifyToggle'),
  spotifyNext: document.querySelector('#spotifyNext'),
  spotifySeek: document.querySelector('#spotifySeek'),
  spotifyVolume: document.querySelector('#spotifyVolume'),
  importPlaylist: document.querySelector('#importPlaylist'),
  reviewSongs:    document.querySelector('#reviewSongs'),
  songRules:      document.querySelector('#songRules'),
  importReport:   document.querySelector('#importReport'),
  liveIndicator: document.querySelector('#liveIndicator'),
  serverIndicator: document.querySelector('#serverIndicator'),
  nowArtist:     document.querySelector('#nowArtist'),
  nowTitle:      document.querySelector('#nowTitle'),
  gameNowArtist: document.querySelector('#gameNowArtist'),
  gameNowTitle:  document.querySelector('#gameNowTitle'),
  drawnHistory:  document.querySelector('#drawnHistory'),
  drawnCount:    document.querySelector('#drawnCount'),
  totalSongs:    document.querySelector('#totalSongs'),
  grid:          document.querySelector('#grid'),
  cardMeta:      document.querySelector('#cardMeta'),
  loadSession:   document.querySelector('#loadSession'),
  adminPin:      document.querySelector('#adminPin'),
  resetRound:    document.querySelector('#resetRound'),
  deleteSessionBtn: document.querySelector('#deleteSessionBtn'),
  connectLive:   document.querySelector('#connectLive'),
  createSession: document.querySelector('#createSession'),
  createCards:   document.querySelector('#createCards'),
  drawNext:      document.querySelector('#drawNext'),
  drawSkip:      document.querySelector('#drawSkip'),
  drawRepeat:    document.querySelector('#drawRepeat'),
  drawBlock:     document.querySelector('#drawBlock'),
  undoDraw:      document.querySelector('#undoDraw'),
  locutorFullscreen: document.querySelector('#locutorFullscreen'),
  eventModeToggle: document.querySelector('#eventModeToggle'),
  eventBigCounter: document.querySelector('#eventBigCounter'),
  eventShortcuts: document.querySelector('#eventShortcuts'),
  queueCurrent:  document.querySelector('#queueCurrent'),
  queueNext:     document.querySelector('#queueNext'),
  queueBlockedInfo: document.querySelector('#queueBlockedInfo'),
  exportLogJson: document.querySelector('#exportLogJson'),
  exportLogCsv:  document.querySelector('#exportLogCsv'),
  claimLine:     document.querySelector('#claimLine'),
  claimBingo:    document.querySelector('#claimBingo'),
  prevCard:      document.querySelector('#prevCard'),
  nextCard:      document.querySelector('#nextCard'),
  downloadPdf:   document.querySelector('#downloadPdf'),
  downloadCurrentPdf: document.querySelector('#downloadCurrentPdf'),
  showCardQr:    document.querySelector('#showCardQr'),
  pdfFormat:     document.querySelector('#pdfFormat'),
  pdfScope:      document.querySelector('#pdfScope'),
  pdfPreset:     document.querySelector('#pdfPreset'),
  pdfShowMeta:   document.querySelector('#pdfShowMeta'),
  pdfHighContrast: document.querySelector('#pdfHighContrast'),
  previewPdf:    document.querySelector('#previewPdf'),
  pdfPreviewWrap: document.querySelector('#pdfPreviewWrap'),
  pdfPreviewFrame: document.querySelector('#pdfPreviewFrame'),
  importCsv:     document.querySelector('#importCsv'),
  importXlsx:    document.querySelector('#importXlsx'),
  cardsList:     document.querySelector('#cardsList'),
  phoneUrl:      document.querySelector('#phoneUrl'),
  phoneUrlBig:   document.querySelector('#phoneUrlBig'),
  refreshPhoneUrl: document.querySelector('#refreshPhoneUrl'),
  copyPhoneUrl:  document.querySelector('#copyPhoneUrl'),
  goToMobileTab: document.querySelector('#goToMobileTab'),
  refreshMobileInfo: document.querySelector('#refreshMobileInfo'),
  shareMobileUrl: document.querySelector('#shareMobileUrl'),
  copyMobileUrl: document.querySelector('#copyMobileUrl'),
  testMobileConnection: document.querySelector('#testMobileConnection'),
  networkHint:   document.querySelector('#networkHint'),
  mobileConnectQr: document.querySelector('#mobileConnectQr'),
  csvFile:       document.querySelector('#csvFile'),
  xlsxFile:      document.querySelector('#xlsxFile'),
  toastContainer:document.querySelector('#toastContainer'),
};

els.songs.value = DEMO;

const SPOT_KEYS = {
  clientId: 'qm_spotify_client_id',
  token: 'qm_spotify_token',
  exp: 'qm_spotify_token_exp',
  refresh: 'qm_spotify_refresh_token',
  verifier: 'qm_spotify_pkce_verifier',
  state: 'qm_spotify_pkce_state',
};

const SPOT_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-email',
  'user-read-private',
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
];

// ── Tabs ──────────────────────────────────────────────────────────────────────

const VALID_TABS = ['session', 'locutor', 'game', 'mobile'];

function switchTab(id) {
  if (!VALID_TABS.includes(id)) return;
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  document.getElementById(`tab-${id}`).classList.remove('hidden');
  document.querySelector(`[data-tab="${id}"]`).classList.add('active');
  // Reflect tab in URL hash so views are deep-linkable / Cmd-clickable.
  if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
}

document.querySelectorAll('[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

window.addEventListener('hashchange', () => {
  switchTab((location.hash || '').replace('#', ''));
});

// ── Toasts ────────────────────────────────────────────────────────────────────

function showToast(text, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = text;
  els.toastContainer.appendChild(t);
  setTimeout(() => t.remove(), TOAST_DURATION_MS);
}

function showQrModal(title, qrDataUrl, url) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  const content = document.createElement('div');
  content.className = 'modal-content';

  const h3 = document.createElement('h3');
  h3.textContent = title;

  const img = document.createElement('img');
  img.src = qrDataUrl;
  img.alt = `Codi QR: ${title}`;
  img.width = 240;
  img.height = 240;
  img.style.maxWidth = '100%';
  img.style.height = 'auto';

  const urlText = document.createElement('p');
  urlText.style.wordBreak = 'break-all';
  urlText.style.fontSize = '12px';
  urlText.style.color = '#666';
  urlText.textContent = url;

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '8px';
  actions.style.justifyContent = 'flex-end';

  const close = () => {
    modal.remove();
    document.removeEventListener('keydown', onKey);
  };

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-ghost';
  closeBtn.textContent = 'Tancar';
  closeBtn.addEventListener('click', close);
  actions.appendChild(closeBtn);

  if (navigator.share) {
    const shareBtn = document.createElement('button');
    shareBtn.className = 'btn btn-accent';
    shareBtn.textContent = 'Compartir';
    shareBtn.addEventListener('click', () => navigator.share({ title, url }).catch(() => {}));
    actions.appendChild(shareBtn);
  }

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn btn-primary';
  copyBtn.textContent = 'Copiar URL';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard?.writeText(url);
    copyBtn.textContent = 'Copiat!';
    setTimeout(() => { copyBtn.textContent = 'Copiar URL'; }, 2000);
  });
  actions.appendChild(copyBtn);

  content.append(h3, img, urlText, actions);
  modal.appendChild(content);
  document.body.appendChild(modal);

  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKey);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  closeBtn.focus();
}

// ── Live indicator ────────────────────────────────────────────────────────────

function setLiveIndicator(connected) {
  els.liveIndicator.textContent = connected ? '● LIVE' : '○ OFF';
  els.liveIndicator.className = `live-badge ${connected ? 'live-on' : 'live-off'}`;
}

function setServerIndicator(ok) {
  if (!els.serverIndicator) return;
  els.serverIndicator.textContent = ok ? 'SERVER OK' : 'SERVER KO';
  els.serverIndicator.className = `server-badge ${ok ? 'server-on' : 'server-off'}`;
}

// ── API helper ────────────────────────────────────────────────────────────────

async function api(path, options = {}) {
  const res = await fetch(path, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : null,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error API');
  return data;
}

async function apiBinary(path, options = {}) {
  const res = await fetch(path, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : null,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Error API');
  }
  return res.blob();
}

async function fetchSpotifyConfig() {
  const res = await fetch('/api/tools/spotify-config');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No es pot carregar la configuracio de Spotify');
  return data;
}

async function fetchNetworkConfig() {
  const res = await fetch('/api/system/network');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No es pot carregar la configuracio de xarxa');
  return data;
}

async function fetchServerHealth() {
  const res = await fetch('/api/system/health');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Servidor no disponible');
  return data;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Run an async action while showing a busy state on its trigger button.
async function withBusy(btn, busyText, fn) {
  if (!btn) return fn();
  const prevText = btn.textContent;
  const prevDisabled = btn.disabled;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.textContent = busyText;
  try {
    return await fn();
  } finally {
    btn.disabled = prevDisabled;
    btn.removeAttribute('aria-busy');
    btn.textContent = prevText;
  }
}

function applyPdfPreset(preset) {
  if (!els.pdfShowMeta || !els.pdfHighContrast) return;
  if (preset === 'imprenta') {
    els.pdfShowMeta.checked = true;
    els.pdfHighContrast.checked = true;
  } else if (preset === 'ahorro') {
    els.pdfShowMeta.checked = false;
    els.pdfHighContrast.checked = true;
  } else {
    els.pdfShowMeta.checked = true;
    els.pdfHighContrast.checked = false;
  }
}

function pickBestPhoneUrl(urls = []) {
  if (!Array.isArray(urls) || !urls.length) return '';
  const lan = urls.find((u) => /^http:\/\/(?!127\.0\.0\.1|localhost)/.test(String(u)));
  return lan || urls[0];
}

async function refreshPhoneConnectionUrl() {
  if (!els.phoneUrl && !els.phoneUrlBig) return;
  try {
    const cfg = await fetchNetworkConfig();
    const best = cfg.selectedUrl || pickBestPhoneUrl(cfg.urls);
    if (els.phoneUrl) els.phoneUrl.value = best || '';
    if (els.phoneUrlBig) els.phoneUrlBig.value = best || '';
    if (els.mobileConnectQr) {
      if (cfg.qrDataUrl) {
        els.mobileConnectQr.src = cfg.qrDataUrl;
        els.mobileConnectQr.style.display = 'block';
      } else {
        els.mobileConnectQr.removeAttribute('src');
        els.mobileConnectQr.style.display = 'none';
      }
    }
    if (els.networkHint) {
      const host = location.hostname;
      const isLocalHost = host === '127.0.0.1' || host === 'localhost';
      const hasLan = Boolean(best) && !best.includes('127.0.0.1') && !best.includes('localhost');
      els.networkHint.textContent = hasLan
        ? 'Red OK: usa el QR o la URL en iPhone (misma Wi-Fi).'
        : isLocalHost
          ? 'Avis: estas en localhost. Per iPhone necessites una URL LAN.'
          : 'Revisa la Wi-Fi compartida entre Mac i iPhone.';
    }
  } catch {
    if (els.phoneUrl) els.phoneUrl.value = '';
    if (els.phoneUrlBig) els.phoneUrlBig.value = '';
    if (els.networkHint) els.networkHint.textContent = 'No es pot carregar la xarxa local.';
  }
}

async function refreshServerHealthIndicator() {
  try {
    await fetchServerHealth();
    setServerIndicator(true);
  } catch {
    setServerIndicator(false);
  }
}

function lsSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

function lsGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function lsDel(key) {
  try { localStorage.removeItem(key); } catch {}
}

function b64url(bytes) {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256ToB64Url(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return b64url(new Uint8Array(digest));
}

function randomString(length = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const out = [];
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  for (let i = 0; i < length; i += 1) out.push(chars[values[i] % chars.length]);
  return out.join('');
}

function detectPlaylistProvider(url) {
  if (/youtube\.com\/playlist/.test(url) || /[?&]list=/.test(url)) return 'youtube';
  if (/open\.spotify\.com\/playlist\//.test(url) || /spotify:playlist:/.test(url)) return 'spotify';
  return 'unknown';
}

function parseSongsFromTextarea(text) {
  return String(text || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s*[—-]\s*|\s+-\s+/);
      return {
        artist: (parts[0] || '(artista)').trim(),
        title: (parts[1] || '(cancion)').trim(),
      };
    });
}

function renderImportReport(report) {
  if (!els.importReport) return;
  if (!report) {
    els.importReport.textContent = '';
    return;
  }
  const txt = [
    `Importacio: ${report.newCount || 0} noves`,
    `${report.duplicateCount || 0} duplicades`,
    `${report.conflictiveCount || 0} conflictives`,
    `(uniques: ${report.uniqueCount || 0}/${report.total || 0})`,
  ].join(' · ');
  els.importReport.textContent = txt;
  if (els.songRules && Array.isArray(report.normalizationRules)) {
    els.songRules.innerHTML = report.normalizationRules.map((r) => `• ${r}`).join('<br>');
  }
}

function currentSpotifyClientId() {
  return (els.spotifyClientId?.value || '').trim() || lsGet(SPOT_KEYS.clientId) || '';
}

function spotifyConnected() {
  const token = lsGet(SPOT_KEYS.token);
  const exp = Number(lsGet(SPOT_KEYS.exp) || 0);
  return Boolean(token && Date.now() < exp - 30_000);
}

function updateSpotifyStatus() {
  const connected = spotifyConnected();
  if (els.spotifyStatus) {
    els.spotifyStatus.textContent = connected ? 'Spotify: connectat' : 'Spotify: no connectat';
  }
}

function setSpotifySdkStatus(text) {
  if (els.spotifySdkStatus) els.spotifySdkStatus.textContent = `SDK: ${text}`;
}

async function loadSpotifySdk() {
  if (window.Spotify?.Player) return window.Spotify;
  if (spotifyPlayback.sdkPromise) return spotifyPlayback.sdkPromise;
  spotifyPlayback.sdkPromise = new Promise((resolve, reject) => {
    const done = () => resolve(window.Spotify);
    window.onSpotifyWebPlaybackSDKReady = done;
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    s.async = true;
    s.onload = () => {
      if (window.Spotify?.Player) done();
    };
    s.onerror = () => reject(new Error('No es pot carregar el SDK de Spotify'));
    document.head.appendChild(s);
  });
  return spotifyPlayback.sdkPromise;
}

async function spotifyApi(path, options = {}) {
  const token = options.token || await spotifyGetValidToken();
  if (!token) throw new Error('Spotify no connectat');
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Spotify API ${res.status}`);
  return data;
}

async function ensureSpotifyPlayer() {
  if (!spotifyConnected()) {
    setSpotifySdkStatus('connecta Spotify primer');
    return false;
  }
  if (spotifyPlayback.player && spotifyPlayback.ready) return true;
  try {
    setSpotifySdkStatus('carregant...');
    await loadSpotifySdk();
    const token = await spotifyGetValidToken();
    if (!token) throw new Error('Spotify no connectat');

    spotifyPlayback.player = new window.Spotify.Player({
      name: 'QUINAPP Locutor',
      getOAuthToken: async (cb) => {
        const tk = await spotifyGetValidToken();
        cb(tk || '');
      },
      volume: spotifyPlayback.volume,
    });

    spotifyPlayback.player.addListener('ready', ({ device_id }) => {
      spotifyPlayback.deviceId = device_id;
      spotifyPlayback.ready = true;
      setSpotifySdkStatus('listo');
    });
    spotifyPlayback.player.addListener('not_ready', () => {
      spotifyPlayback.ready = false;
      setSpotifySdkStatus('dispositiu no disponible');
    });
    spotifyPlayback.player.addListener('player_state_changed', (s) => {
      spotifyPlayback.paused = Boolean(s?.paused ?? true);
      if (els.spotifyToggle) els.spotifyToggle.textContent = spotifyPlayback.paused ? '▶' : '⏸';
      if (els.spotifySeek && s?.duration) {
        const ratio = Math.max(0, Math.min(1, Number(s.position || 0) / Number(s.duration)));
        els.spotifySeek.value = String(Math.floor(ratio * 1000));
      }
    });
    spotifyPlayback.player.addListener('initialization_error', ({ message }) => setSpotifySdkStatus(`error init (${message})`));
    spotifyPlayback.player.addListener('authentication_error', ({ message }) => setSpotifySdkStatus(`error auth (${message})`));
    spotifyPlayback.player.addListener('account_error', ({ message }) => setSpotifySdkStatus(`error cuenta (${message})`));

    const ok = await spotifyPlayback.player.connect();
    if (!ok) throw new Error('No es pot connectar el SDK de Spotify');
    return true;
  } catch (error) {
    setSpotifySdkStatus(`fallback embed (${error.message})`);
    return false;
  }
}

async function spotifyTransferToSdkDevice(play = false) {
  if (!spotifyPlayback.deviceId) return;
  await spotifyApi('/me/player', {
    method: 'PUT',
    body: { device_ids: [spotifyPlayback.deviceId], play },
  });
}

async function spotifyPlaySong(song, forceAutoplay = false) {
  const trackId = getSpotifyTrackId(song);
  if (!trackId) {
    updateSpotifyPlayer(song, forceAutoplay);
    return;
  }
  const wantAuto = forceAutoplay || Boolean(els.spotifyAutoplay?.checked);
  const sdkReady = await ensureSpotifyPlayer();
  if (!sdkReady || !spotifyPlayback.deviceId) {
    updateSpotifyPlayer(song, wantAuto);
    return;
  }
  try {
    await spotifyTransferToSdkDevice(wantAuto);
    await spotifyApi(`/me/player/play?device_id=${encodeURIComponent(spotifyPlayback.deviceId)}`, {
      method: 'PUT',
      body: { uris: [`spotify:track:${trackId}`] },
    });
    if (!wantAuto) await spotifyPlayback.player.pause();
    updateSpotifyPlayer(song, wantAuto);
  } catch (error) {
    setSpotifySdkStatus(`fallback embed (${error.message})`);
    updateSpotifyPlayer(song, wantAuto);
  }
}

async function spotifyGetValidToken() {
  const now = Date.now();
  const token = lsGet(SPOT_KEYS.token);
  const exp = Number(lsGet(SPOT_KEYS.exp) || 0);
  if (token && now < exp - 60_000) return token;

  const refreshToken = lsGet(SPOT_KEYS.refresh);
  const clientId = currentSpotifyClientId();
  if (!refreshToken || !clientId) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.access_token) return null;
  lsSet(SPOT_KEYS.token, data.access_token);
  lsSet(SPOT_KEYS.exp, String(Date.now() + (Number(data.expires_in || 3600) * 1000)));
  if (data.refresh_token) lsSet(SPOT_KEYS.refresh, data.refresh_token);
  updateSpotifyStatus();
  return data.access_token;
}

function spotifyLogout() {
  lsDel(SPOT_KEYS.token);
  lsDel(SPOT_KEYS.exp);
  lsDel(SPOT_KEYS.refresh);
  lsDel(SPOT_KEYS.verifier);
  lsDel(SPOT_KEYS.state);
  updateSpotifyStatus();
}

const SPOTIFY_POPUP_NAME = 'qm-spotify-login';

async function buildSpotifyAuthUrl() {
  const clientId = currentSpotifyClientId();
  if (!clientId) throw new Error('Falta el Client ID de Spotify: configura SPOTIFY_CLIENT_ID al servidor o omple el camp');
  lsSet(SPOT_KEYS.clientId, clientId);

  const verifier = randomString(96);
  const challenge = await sha256ToB64Url(verifier);
  const stateValue = randomString(24);
  lsSet(SPOT_KEYS.verifier, verifier);
  lsSet(SPOT_KEYS.state, stateValue);

  const redirectUri = `${location.origin}/`;
  const auth = new URL('https://accounts.spotify.com/authorize');
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('client_id', clientId);
  auth.searchParams.set('scope', SPOT_SCOPES.join(' '));
  auth.searchParams.set('redirect_uri', redirectUri);
  auth.searchParams.set('state', stateValue);
  auth.searchParams.set('code_challenge_method', 'S256');
  auth.searchParams.set('code_challenge', challenge);
  return auth.toString();
}

// Full-page redirect login (mode avançat).
async function spotifyStartLogin() {
  location.href = await buildSpotifyAuthUrl();
}

// Popup login (assistent): obre una finestra nova com fan altres apps.
// Resol true quan el token ja és vàlid; cau a redirect si el popup està bloquejat.
async function spotifyStartLoginPopup() {
  const url = await buildSpotifyAuthUrl();
  const w = 480;
  const h = 730;
  const left = (window.screenX ?? 0) + Math.max(0, ((window.outerWidth || 1024) - w) / 2);
  const top = (window.screenY ?? 0) + Math.max(0, ((window.outerHeight || 768) - h) / 2);
  const popup = window.open(url, SPOTIFY_POPUP_NAME, `width=${w},height=${h},left=${left},top=${top}`);
  if (!popup) {
    // Popup bloquejat pel navegador → torna al redirect de pàgina sencera.
    lsSet('qm_wiz_resume', '2');
    location.href = url;
    return false;
  }
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (spotifyConnected()) {
        clearInterval(timer);
        try { popup.close(); } catch {}
        resolve(true);
      } else if (popup.closed || Date.now() - start > 180_000) {
        clearInterval(timer);
        resolve(spotifyConnected());
      }
    }, 700);
  });
}

async function spotifyHandleRedirect() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const stateValue = params.get('state');
  if (!code) return;

  const expectedState = lsGet(SPOT_KEYS.state);
  const verifier = lsGet(SPOT_KEYS.verifier);
  const clientId = currentSpotifyClientId();
  if (!stateValue || stateValue !== expectedState || !verifier || !clientId) {
    throw new Error('Callback de Spotify no valid');
  }

  const redirectUri = `${location.origin}/`;
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error('No es pot completar el login de Spotify');
  const data = await res.json();
  if (!data.access_token) throw new Error('Spotify no ha retornat cap token');

  lsSet(SPOT_KEYS.token, data.access_token);
  lsSet(SPOT_KEYS.exp, String(Date.now() + (Number(data.expires_in || 3600) * 1000)));
  if (data.refresh_token) lsSet(SPOT_KEYS.refresh, data.refresh_token);
  lsDel(SPOT_KEYS.verifier);
  lsDel(SPOT_KEYS.state);
  updateSpotifyStatus();

  // Si això corre dins el popup de login, tanca'l: l'obridor detecta el token
  // (localStorage compartit) i continua l'assistent.
  if (window.opener && window.name === SPOTIFY_POPUP_NAME) {
    try { window.close(); } catch {}
    return;
  }

  const clean = new URL(location.href);
  clean.searchParams.delete('code');
  clean.searchParams.delete('state');
  history.replaceState({}, '', clean.pathname + clean.search);
  showToast('Spotify connectat', 'success');
}

async function hydrateSpotifyClientIdFromServer() {
  try {
    const cfg = await fetchSpotifyConfig();
    const serverClientId = String(cfg.clientId || '').trim();
    if (!serverClientId) return;

    if (!lsGet(SPOT_KEYS.clientId)) {
      lsSet(SPOT_KEYS.clientId, serverClientId);
    }
    if (els.spotifyClientId && !els.spotifyClientId.value.trim()) {
      els.spotifyClientId.value = serverClientId;
    }
  } catch {
    // fallback silencioso: input manual sigue funcionando
  }
}

function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

// ── Card rendering ────────────────────────────────────────────────────────────

function activeCard() {
  return state.cards[state.activeCardIndex] || null;
}

function renderCard(card) {
  if (!card || !state.session) {
    els.grid.innerHTML = '';
    els.cardMeta.textContent = 'Sense cartó';
    return;
  }

  const cols = state.session.cols;
  els.grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  els.grid.innerHTML = '';

  card.songs.forEach((song, idx) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = `cell${state.marked.has(idx) ? ' marked' : ''}`;
    const artist = document.createElement('div');
    artist.className = 'artist';
    artist.textContent = song.artist;
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = song.title;
    cell.append(artist, title);
    cell.addEventListener('click', () => {
      if (state.marked.has(idx)) state.marked.delete(idx);
      else state.marked.add(idx);
      renderCard(card);
    });
    els.grid.appendChild(cell);
  });

  els.cardMeta.textContent = `#${card.number}  ·  ${state.activeCardIndex + 1}/${state.cards.length}  ·  ${state.marked.size}/${card.songs.length} marcadas`;
}

function syncMarksFromDrawn() {
  const card = activeCard();
  if (!card) return;
  state.marked = new Set();
  const keys = new Set(state.drawnSongs.map((s) => `${s.artist}::${s.title}`));
  card.songs.forEach((song, idx) => {
    if (keys.has(`${song.artist}::${song.title}`)) state.marked.add(idx);
  });
}

// ── Cards list rendering ───────────────────────────────────────────────────────

async function renderCardsList() {
  if (!els.cardsList || !state.session || !state.cards.length) {
    if (els.cardsList) els.cardsList.innerHTML = '';
    return;
  }

  els.cardsList.innerHTML = '';
  for (const card of state.cards) {
    const playUrl = `${location.origin}/play-card?pin=${encodeURIComponent(state.session.pin)}&card=${encodeURIComponent(card.id)}`;
    let qrDataUrl = '';
    try {
      if (typeof QRCode === 'undefined') {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      qrDataUrl = await QRCode.toDataURL(playUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 200,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
    } catch (err) {
      qrDataUrl = '';
    }

    const item = document.createElement('div');
    item.className = 'card-item';

    const info = document.createElement('div');
    info.className = 'card-info';
    const strong = document.createElement('strong');
    strong.textContent = `Cartó #${card.number}`;
    const small = document.createElement('small');
    small.textContent = `${card.songs.length} cançons`;
    info.append(strong, document.createElement('br'), small);

    const qrBtn = document.createElement('button');
    qrBtn.type = 'button';
    qrBtn.className = 'card-qr';
    qrBtn.setAttribute('aria-label', `Mostrar QR del cartó ${card.number}`);
    if (qrDataUrl) {
      const qrImg = document.createElement('img');
      qrImg.src = qrDataUrl;
      qrImg.alt = `QR cartó ${card.number}`;
      qrImg.width = 200;
      qrImg.height = 200;
      qrBtn.appendChild(qrImg);
    } else {
      qrBtn.textContent = 'QR';
    }
    qrBtn.addEventListener('click', () => showQrModal(`QR Cartó #${card.number}`, qrDataUrl, playUrl));

    item.append(info, qrBtn);
    els.cardsList.appendChild(item);
  }
}

// ── Now playing ───────────────────────────────────────────────────────────────

function getSpotifyTrackId(song) {
  if (!song) return null;
  const fromUri = String(song.uri || '').match(/spotify:track:([A-Za-z0-9]+)/);
  if (fromUri?.[1]) return fromUri[1];
  const fromUrl = String(song.url || '').match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
  if (fromUrl?.[1]) return fromUrl[1];
  return null;
}

function buildSpotifyTrackUrl(song) {
  const trackId = getSpotifyTrackId(song);
  if (trackId) return `https://open.spotify.com/track/${trackId}`;
  if (song?.url && /open\.spotify\.com/.test(String(song.url))) return String(song.url);
  return null;
}

function updateSpotifyPlayer(song, forceAutoplay = false) {
  const embed = els.spotifyEmbed;
  const status = els.spotifyPlayerStatus;
  if (!embed || !status) return;

  if (!song) {
    embed.src = 'about:blank';
    status.textContent = 'Importa una llista de Spotify per reproduir cancons reals.';
    return;
  }

  const trackId = getSpotifyTrackId(song);
  if (!trackId) {
    status.textContent = 'La canco actual no te enllac de Spotify.';
    return;
  }

  const autoplay = forceAutoplay || Boolean(els.spotifyAutoplay?.checked);
  const src = `https://open.spotify.com/embed/track/${trackId}?utm_source=generator${autoplay ? '&autoplay=1' : ''}`;
  if (embed.src !== src) embed.src = src;
  status.textContent = `Spotify: ${song.artist} — ${song.title}`;
}

function songKey(song) {
  return `${String(song?.artist || '').trim()}::${String(song?.title || '').trim()}`;
}

function updateQueueUi(current = null, next = null) {
  state.nextSong = next || null;
  if (els.queueCurrent) {
    els.queueCurrent.textContent = current
      ? `Actual: ${current.artist} — ${current.title}`
      : 'Actual: —';
  }
  if (els.queueNext) {
    els.queueNext.textContent = next
      ? `Seguent: ${next.artist} — ${next.title}`
      : 'Seguent: —';
  }
  if (els.queueBlockedInfo) {
    els.queueBlockedInfo.textContent = `Bloquejades: ${state.blockedSongs.size}`;
  }
}

async function warmSpotifyTrack(song) {
  const trackId = getSpotifyTrackId(song);
  if (!trackId || !spotifyConnected()) return;
  try {
    await spotifyApi(`/tracks/${encodeURIComponent(trackId)}`);
  } catch {
    // warming best effort
  }
}

async function refreshNextInQueue() {
  if (!state.session) {
    updateQueueUi(state.currentSong, null);
    return;
  }
  try {
    const peek = await api(`/api/sessions/${encodeURIComponent(state.session.pin)}/draw/peek`);
    const next = peek.done ? null : peek.song;
    updateQueueUi(state.currentSong, next);
    if (next) warmSpotifyTrack(next);
  } catch {
    updateQueueUi(state.currentSong, null);
  }
}

async function spotifyTogglePlayback() {
  const ok = await ensureSpotifyPlayer();
  if (!ok || !spotifyPlayback.player) return;
  await spotifyPlayback.player.togglePlay();
}

async function spotifyNextTrack() {
  const ok = await ensureSpotifyPlayer();
  if (!ok || !spotifyPlayback.player) return;
  await spotifyPlayback.player.nextTrack();
}

async function spotifyPreviousTrack() {
  const ok = await ensureSpotifyPlayer();
  if (!ok || !spotifyPlayback.player) return;
  await spotifyPlayback.player.previousTrack();
}

async function spotifySeekToRatio(ratio) {
  const ok = await ensureSpotifyPlayer();
  if (!ok || !spotifyPlayback.player) return;
  const stateNow = await spotifyPlayback.player.getCurrentState();
  const total = Number(stateNow?.duration || 0);
  if (!total) return;
  const pos = Math.max(0, Math.min(total, Math.floor(total * ratio)));
  await spotifyPlayback.player.seek(pos);
}

async function spotifySetVolume(v) {
  const ok = await ensureSpotifyPlayer();
  if (!ok || !spotifyPlayback.player) return;
  spotifyPlayback.volume = Math.max(0, Math.min(1, v));
  await spotifyPlayback.player.setVolume(spotifyPlayback.volume);
}

function updateNow(song) {
  state.currentSong = song || null;
  const blocked = song ? state.blockedSongs.has(songKey(song)) : false;
  if (!song) {
    els.nowArtist.textContent = '—';
    els.nowTitle.textContent = 'Esperant primera cançó';
    els.gameNowArtist.textContent = '—';
    els.gameNowTitle.textContent = 'Esperant...';
    updateSpotifyPlayer(null);
    updateQueueUi(null, null);
    return;
  }
  els.nowArtist.textContent = song.artist;
  els.nowTitle.textContent = blocked ? `${song.title} (bloquejada)` : song.title;
  els.gameNowArtist.textContent = song.artist;
  els.gameNowTitle.textContent = blocked ? `${song.title} (bloquejada)` : song.title;
  if (blocked) {
    setSpotifySdkStatus('canco bloquejada');
    updateSpotifyPlayer(song, false);
  } else {
    spotifyPlaySong(song, Boolean(els.spotifyAutoplay?.checked));
  }
  updateQueueUi(song, null);
}

// ── Drawn history ─────────────────────────────────────────────────────────────

function addToHistory(song, index) {
  const empty = els.drawnHistory.querySelector('.drawn-empty');
  if (empty) empty.remove();

  const li = document.createElement('li');
  const num = document.createElement('span');
  num.className = 'd-num';
  num.textContent = String(index);
  const artist = document.createElement('span');
  artist.className = 'd-artist';
  artist.textContent = song.artist;
  const sep = document.createElement('span');
  sep.className = 'd-sep';
  sep.textContent = ' — ';
  const title = document.createElement('span');
  title.className = 'd-title';
  title.textContent = song.title;
  li.append(num, artist, sep, title);
  els.drawnHistory.prepend(li);
}

function rebuildHistory(songs) {
  els.drawnHistory.innerHTML = '';
  if (!songs.length) {
    els.drawnHistory.innerHTML = '<li class="drawn-empty">Cap canco treta encara.</li>';
    return;
  }
  songs.forEach((song, i) => addToHistory(song, i + 1));
}

// ── Apply a drawn song (SSE or manual draw) ───────────────────────────────────

function applyDrawSong(song, drawnCount) {
  if (!song) {
    state.playlistDone = true;
    els.nowArtist.textContent = '✓ Fi de partida';
    els.nowTitle.textContent = `Totes les cançons sacades (${drawnCount})`;
    els.gameNowArtist.textContent = '✓ Fi de partida';
    els.gameNowTitle.textContent = `Totes les cançons sacades (${drawnCount})`;
    if (els.eventBigCounter) els.eventBigCounter.textContent = `${drawnCount} / ${els.totalSongs.textContent || '—'}`;
    if (els.drawNext) { els.drawNext.disabled = true; els.drawNext.textContent = '✓ Playlist finalitzada'; }
    updateQueueUi(null, null);
    showToast('Totes les cançons han sonat!', 'success');
    if (window.updateWizNow) window.updateWizNow(null, drawnCount);
    return;
  }
  const key = `${song.artist}::${song.title}`;
  if (!state.drawnSongs.find((s) => `${s.artist}::${s.title}` === key)) {
    state.drawnSongs.push(song);
    addToHistory(song, drawnCount);
  }
  updateNow(song);
  els.drawnCount.textContent = drawnCount;
  if (els.eventBigCounter) els.eventBigCounter.textContent = `${drawnCount} / ${els.totalSongs.textContent || '—'}`;
  syncMarksFromDrawn();
  renderCard(activeCard());
  refreshNextInQueue();
  if (window.updateWizNow) window.updateWizNow(song, drawnCount);
}

// ── SSE connection ────────────────────────────────────────────────────────────

function connectLiveSSE(pin) {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }

  const es = new EventSource(`/api/sessions/${encodeURIComponent(pin)}/events`);
  state.eventSource = es;

  es.onopen  = () => setLiveIndicator(true);
  es.onerror = () => setLiveIndicator(false);

  es.addEventListener('draw.next', (evt) => {
    const data = JSON.parse(evt.data);
    applyDrawSong(data.song, data.drawn);
  });

  es.addEventListener('session.snapshot', (evt) => {
    const data = JSON.parse(evt.data);
    if (!data?.session) return;
    if (!state.session || state.session.pin === data.session.pin) {
      els.totalSongs.textContent = data.session.songs;
      els.drawnCount.textContent = data.drawnCount ?? 0;
      if (data.lastSong) updateNow(data.lastSong);
    }
  });

  es.addEventListener('cards.created', (evt) => {
    const data = JSON.parse(evt.data);
    if (Array.isArray(data.cards) && data.cards.length) {
      state.cards = data.cards;
      state.activeCardIndex = 0;
      syncMarksFromDrawn();
      renderCard(activeCard());
      showToast(`Cartons actualitzats (${data.cards.length})`, 'success');
    }
  });

  es.addEventListener('session.updated', (evt) => {
    const data = JSON.parse(evt.data);
    if (!data?.session) return;
    if (state.session && state.session.pin === data.session.pin) {
      state.session = data.session;
      els.totalSongs.textContent = data.session.songs;
      showToast('Sessio sincronitzada', 'info');
    }
  });

  es.addEventListener('claim.checked', (evt) => {
    const data = JSON.parse(evt.data);
    if (data.result?.valid) showToast(`Reclamacio valida: ${data.result.type.toUpperCase()}!`, 'success');
    else showToast(`No valida: ${data.result?.type?.toUpperCase() || ''}`, 'error');
  });

  es.addEventListener('ping', () => {
    setLiveIndicator(true);
  });
}

// ── Hydrate session ───────────────────────────────────────────────────────────

async function hydrateSession(pin) {
  const session = await api(`/api/sessions/${encodeURIComponent(pin)}`);
  const [cardsData, drawnData] = await Promise.all([
    api(`/api/sessions/${encodeURIComponent(pin)}/cards`),
    api(`/api/sessions/${encodeURIComponent(pin)}/drawn`),
  ]);

  state.session = session;
  renderImportReport(null);
  state.cards = cardsData.cards || [];
  state.activeCardIndex = 0;
  state.drawnSongs = drawnData.drawn || [];
  state.playlistDone = state.drawnSongs.length >= session.songs;

  els.rows.value = session.rows;
  els.cols.value = session.cols;
  els.seed.value = session.seed;
  els.totalSongs.textContent = session.songs;
  els.drawnCount.textContent = state.drawnSongs.length;
  if (els.eventBigCounter) els.eventBigCounter.textContent = `${state.drawnSongs.length} / ${session.songs}`;

  if (state.playlistDone) {
    els.drawNext.disabled = true;
    els.drawNext.textContent = '✓ Playlist finalitzada';
  } else {
    els.drawNext.disabled = false;
    els.drawNext.textContent = '▶ Seguent canco';
  }

  rebuildHistory(state.drawnSongs);
  syncMarksFromDrawn();

  if (state.drawnSongs.length > 0) {
    updateNow(state.drawnSongs[state.drawnSongs.length - 1]);
  } else {
    updateNow(null);
  }

  renderCard(activeCard());
  refreshNextInQueue();
  connectLiveSSE(pin);
  renderCardsList();
  showToast(`Sessio "${pin}" carregada`, 'success');
}

// ── Event listeners ───────────────────────────────────────────────────────────

els.loadSession.addEventListener('click', async () => {
  try {
    const pin = els.pin.value.trim();
    if (!pin) throw new Error('Cal el PIN');
    await hydrateSession(pin);
    switchTab('locutor');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

els.connectLive.addEventListener('click', () => {
  const pin = els.pin.value.trim() || state.session?.pin;
  if (!pin) { showToast('Cal el PIN per al temps real', 'error'); return; }
  connectLiveSSE(pin);
  showToast('Connectant en temps real...', 'info');
});

els.spotifyConnect?.addEventListener('click', async () => {
  try {
    await spotifyStartLogin();
  } catch (error) {
    showToast(error.message, 'error');
  }
});

els.spotifyDisconnect?.addEventListener('click', () => {
  spotifyLogout();
  showToast('Spotify desconnectat', 'info');
});

els.spotifyPlayCurrent?.addEventListener('click', () => {
  if (!state.currentSong) {
    showToast('Encara no hi ha canco actual', 'error');
    return;
  }
  const trackId = getSpotifyTrackId(state.currentSong);
  if (!trackId) {
    showToast('La canco actual no esta vinculada a Spotify', 'error');
    return;
  }
  updateSpotifyPlayer(state.currentSong, true);
  showToast('Reproduccio carregada al reproductor de Spotify', 'info');
});

els.spotifyOpenCurrent?.addEventListener('click', () => {
  if (!state.currentSong) {
    showToast('Encara no hi ha canco actual', 'error');
    return;
  }
  const url = buildSpotifyTrackUrl(state.currentSong);
  if (!url) {
    showToast('La canco actual no es a Spotify', 'error');
    return;
  }
  window.open(url, '_blank');
});

els.spotifyToggle?.addEventListener('click', async () => {
  try {
    await spotifyTogglePlayback();
  } catch (error) {
    showToast(error.message || 'No es pot canviar la reproduccio', 'error');
  }
});

els.spotifyNext?.addEventListener('click', async () => {
  try {
    await spotifyNextTrack();
  } catch (error) {
    showToast(error.message || 'No es pot avancar', 'error');
  }
});

els.spotifyPrev?.addEventListener('click', async () => {
  try {
    await spotifyPreviousTrack();
  } catch (error) {
    showToast(error.message || 'No es pot retrocedir', 'error');
  }
});

els.spotifySeek?.addEventListener('change', async () => {
  const ratio = Number(els.spotifySeek.value || 0) / 1000;
  try {
    await spotifySeekToRatio(ratio);
  } catch (error) {
    showToast(error.message || 'No es pot moure', 'error');
  }
});

els.spotifyVolume?.addEventListener('input', async () => {
  const v = Number(els.spotifyVolume.value || 80) / 100;
  try {
    await spotifySetVolume(v);
  } catch {
    // keep silent for slider moves
  }
});

els.drawRepeat?.addEventListener('click', async () => {
  if (!state.currentSong) {
    showToast('No hi ha canco actual per repetir', 'error');
    return;
  }
  await spotifyPlaySong(state.currentSong, true);
});

els.drawBlock?.addEventListener('click', () => {
  if (!state.currentSong) {
    showToast('No hi ha canco actual per bloquejar', 'error');
    return;
  }
  const key = songKey(state.currentSong);
  if (state.blockedSongs.has(key)) {
    state.blockedSongs.delete(key);
    showToast('Canco desbloquejada', 'info');
  } else {
    state.blockedSongs.add(key);
    showToast('Canco bloquejada (sense autoplay)', 'info');
  }
  updateNow(state.currentSong);
  updateQueueUi(state.currentSong, null);
});

els.drawSkip?.addEventListener('click', () => {
  els.drawNext?.click();
});

els.eventModeToggle?.addEventListener('click', () => {
  document.body.classList.toggle('event-mode');
  const active = document.body.classList.contains('event-mode');
  if (els.eventModeToggle) els.eventModeToggle.textContent = active ? 'Sortir mode esdeveniment' : 'Mode esdeveniment';
  showToast(active ? 'Mode esdeveniment activat' : 'Mode esdeveniment desactivat', 'info');
});

els.spotifyClientId?.addEventListener('change', () => {
  const v = (els.spotifyClientId.value || '').trim();
  if (v) lsSet(SPOT_KEYS.clientId, v);
});

els.reviewSongs?.addEventListener('click', async () => {
  try {
    const songs = parseSongsFromTextarea(els.songs.value);
    const existingSongs = [];
    const report = await withBusy(els.reviewSongs, 'Revisant…',
      () => api('/api/tools/analyze-songs', {
        method: 'POST',
        body: { songs, existingSongs },
      }));
    renderImportReport(report);
    showToast(`Revisio llesta: ${report.duplicateCount} duplicades, ${report.conflictiveCount} conflictives`, 'info');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

els.goToMobileTab?.addEventListener('click', () => {
  switchTab('mobile');
  refreshPhoneConnectionUrl();
});

els.refreshPhoneUrl?.addEventListener('click', async () => {
  await refreshPhoneConnectionUrl();
  if (els.phoneUrl?.value) showToast('URL iPhone actualitzada', 'info');
});

els.copyPhoneUrl?.addEventListener('click', async () => {
  const value = (els.phoneUrl?.value || '').trim();
  if (!value) { showToast('URL iPhone buida', 'error'); return; }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const tmp = document.createElement('input');
      tmp.value = value;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      tmp.remove();
    }
    showToast('URL copiada', 'success');
  } catch {
    showToast('No es pot copiar la URL', 'error');
  }
});

els.refreshMobileInfo?.addEventListener('click', async () => {
  await refreshPhoneConnectionUrl();
  if (els.phoneUrlBig?.value) showToast('Informacio del mobil actualitzada', 'info');
});

els.copyMobileUrl?.addEventListener('click', async () => {
  const value = (els.phoneUrlBig?.value || els.phoneUrl?.value || '').trim();
  if (!value) { showToast('URL buida', 'error'); return; }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const tmp = document.createElement('input');
      tmp.value = value;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      tmp.remove();
    }
    showToast('URL copiada', 'success');
  } catch {
    showToast('No s\'ha pogut copiar l\'URL', 'error');
  }
});

els.shareMobileUrl?.addEventListener('click', async () => {
  const value = (els.phoneUrlBig?.value || els.phoneUrl?.value || '').trim();
  if (!value) { showToast('URL buida', 'error'); return; }
  try {
    if (navigator.share) {
      await navigator.share({
        title: 'Connexió mòbil QUINAPP',
        url: value
      });
    } else {
      showToast('Compartir no disponible en aquest navegador', 'error');
    }
  } catch {
    // User cancelled share or error
  }
});

els.testMobileConnection?.addEventListener('click', async () => {
  const value = (els.phoneUrlBig?.value || els.phoneUrl?.value || '').trim();
  if (!value) { showToast('URL del mobil buida', 'error'); return; }
  try {
    const probe = await api('/api/system/probe', {
      method: 'POST',
      body: { url: value },
    });
    if (probe.ok) {
      showToast('Prova de connexio OK', 'success');
    } else {
      showToast(`Prova de connexio KO (status ${probe.status})`, 'error');
    }
  } catch (error) {
    showToast(error.message || 'Error en la prova de connexio', 'error');
  }
});

els.playlistProvider?.addEventListener('change', () => {
  els.playlistCredential.placeholder =
    els.playlistProvider.value === 'youtube'
      ? 'YouTube Data API key'
      : els.playlistProvider.value === 'spotify'
        ? 'Spotify OAuth token (opcional si ya conectaste PKCE)'
        : 'API Key / Token';
});

els.pdfPreset?.addEventListener('change', () => {
  applyPdfPreset(els.pdfPreset.value || 'evento');
});

els.importPlaylist?.addEventListener('click', async () => {
  try {
    const playlistUrl = els.playlistUrl.value.trim();
    if (!playlistUrl) throw new Error('Falta la URL de la llista');
    const provider = els.playlistProvider.value || 'auto';
    const credential = els.playlistCredential.value.trim();
    const detected = provider === 'auto' ? detectPlaylistProvider(playlistUrl) : provider;
    let spotifyToken = '';
    let youtubeApiKey = '';
    if (detected === 'spotify') {
      spotifyToken = credential || await spotifyGetValidToken() || '';
      if (!spotifyToken) {
        throw new Error('Falta la credencial de Spotify: prem "Connectar Spotify (PKCE)" i revisa Client ID + Redirect URI, o enganxa un token OAuth manual');
      }
    } else if (detected === 'youtube') {
      youtubeApiKey = credential;
      if (!youtubeApiKey) throw new Error('Falta la clau YouTube Data API v3: enganxa la clau al camp de credencial');
    }

    const parsed = await withBusy(els.importPlaylist, 'Important llista…',
      () => api('/api/tools/import-playlist', {
        method: 'POST',
        body: {
          url: playlistUrl,
          provider,
          apiKey: youtubeApiKey,
          token: spotifyToken,
        },
      }));
    if (!parsed.songs?.length) throw new Error('Llista buida o no llegible');
    els.songs.value = parsed.songs.map((s) => `${s.artist} - ${s.title}`).join('\n');
    showToast(`Llista ${parsed.provider} importada (${parsed.count})`, 'success');

    if (state.session) {
      const updated = await api(`/api/sessions/${encodeURIComponent(state.session.pin)}/import-songs`, {
        method: 'POST',
        body: { songs: parsed.songs },
      });
      state.session = updated;
      state.cards = [];
      state.activeCardIndex = 0;
      state.drawnSongs = [];
      state.marked = new Set();
      els.totalSongs.textContent = updated.songs;
      els.drawnCount.textContent = 0;
      rebuildHistory([]);
      updateNow(null);
      renderCard(null);
      showToast('Sessio actualitzada amb la llista', 'info');
      if (updated.importReport) renderImportReport(updated.importReport);
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
});

els.createSession.addEventListener('click', async () => {
  try {
    const seed = els.seed.value.trim() || Date.now().toString(36);
    const payload = {
      pin: els.pin.value.trim(),
      seed,
      rows: Number(els.rows.value),
      cols: Number(els.cols.value),
      songsText: els.songs.value,
      adminPin: (els.adminPin?.value || '').trim(),
      preventDupes: true,
    };
    const session = await withBusy(els.createSession, 'Creant sessió…',
      () => api('/api/sessions', { method: 'POST', body: payload }));
    state.session = session;
    renderImportReport(null);
    state.cards = [];
    state.activeCardIndex = 0;
    state.drawnSongs = [];
    state.marked = new Set();
    state.playlistDone = false;
    els.drawNext.disabled = false;
    els.drawNext.textContent = '▶ Seguent canco';
    els.totalSongs.textContent = session.songs;
    els.drawnCount.textContent = 0;
    rebuildHistory([]);
    updateNow(null);
    renderCard(null);
    connectLiveSSE(session.pin);
    showToast(`Sessio "${session.pin}" creada`, 'success');
    switchTab('locutor');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

els.createCards.addEventListener('click', async () => {
  try {
    if (!state.session) throw new Error('Primer crea o carrega una sessió');
    const count = Number(els.cardsCount.value || 2);
    const data = await withBusy(els.createCards, 'Generant cartons…',
      () => api(`/api/sessions/${encodeURIComponent(state.session.pin)}/cards`, {
        method: 'POST',
        body: { count },
      }));
    state.cards = data.cards;
    state.activeCardIndex = 0;
    syncMarksFromDrawn();
    renderCard(activeCard());
    renderCardsList();
    showToast(`${data.cards.length} cartons generats`, 'success');
    switchTab('game');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

els.resetRound?.addEventListener('click', async () => {
  try {
    if (!state.session) throw new Error('Primer crea o carrega una sessió');
    const adminPin = (els.adminPin?.value || '').trim();
    if (!adminPin) throw new Error('Falta el PIN admin');
    const ok = confirm(`Nova tanda a ${state.session.pin}? Esborra els cartons i sortejos d'aquesta sessió. No es pot desfer.`);
    if (!ok) return;
    const updated = await withBusy(els.resetRound, 'Reiniciant…',
      () => api(`/api/sessions/${encodeURIComponent(state.session.pin)}/reset-round`, {
        method: 'POST',
        body: { adminPin },
      }));
    state.session = updated;
    state.cards = [];
    state.activeCardIndex = 0;
    state.drawnSongs = [];
    state.marked = new Set();
    els.drawnCount.textContent = 0;
    rebuildHistory([]);
    updateNow(null);
    renderCard(null);
    showToast('Nova tanda creada (sense cartons ni sortejos previs)', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

els.deleteSessionBtn?.addEventListener('click', async () => {
  try {
    if (!state.session) throw new Error('No hi ha sessio activa');
    const adminPin = (els.adminPin?.value || '').trim();
    if (!adminPin) throw new Error('Falta el PIN admin');
    const ok = confirm(`Esborrar la sessió ${state.session.pin}? Aquesta acció no es pot desfer.`);
    if (!ok) return;
    await api(`/api/sessions/${encodeURIComponent(state.session.pin)}`, {
      method: 'DELETE',
      body: { adminPin },
    });
    state.session = null;
    state.cards = [];
    state.activeCardIndex = 0;
    state.drawnSongs = [];
    state.marked = new Set();
    rebuildHistory([]);
    updateNow(null);
    renderCard(null);
    showToast('Sessio esborrada', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

els.drawNext.addEventListener('click', async () => {
  if (els.drawNext.disabled) return;
  try {
    if (!state.session) throw new Error('Primer crea o carrega una sessió');
    els.drawNext.disabled = true;
    const data = await api(`/api/sessions/${encodeURIComponent(state.session.pin)}/draw/next`, { method: 'POST' });
    if (data.done) {
      applyDrawSong(null, data.drawn);
      els.drawNext.disabled = true;
      els.drawNext.textContent = '✓ Playlist finalitzada';
      return;
    }
    applyDrawSong(data.song, data.drawn);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    if (!state.playlistDone) els.drawNext.disabled = false;
  }
});

els.undoDraw?.addEventListener('click', async () => {
  try {
    if (!state.session) throw new Error('Primer crea o carrega una sessió');
    const adminPin = els.adminPin?.value?.trim();
    const data = await api(`/api/sessions/${encodeURIComponent(state.session.pin)}/draw/undo`, {
      method: 'POST',
      body: adminPin ? { adminPin } : {},
    });
    if (!data.undone) {
      showToast('No hi ha sortejos per desfer', 'info');
      return;
    }
    await hydrateSession(state.session.pin);
    showToast('Ultim sorteig desfet', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

els.locutorFullscreen?.addEventListener('click', async () => {
  try {
    const root = document.documentElement;
    if (!document.fullscreenElement) {
      await root.requestFullscreen();
      switchTab('locutor');
    } else {
      await document.exitFullscreen();
    }
  } catch (error) {
    showToast(error.message || 'No es pot canviar la pantalla completa', 'error');
  }
});

els.exportLogJson?.addEventListener('click', () => {
  if (!state.session) { showToast('Cal una sessio activa', 'error'); return; }
  window.open(`/api/sessions/${encodeURIComponent(state.session.pin)}/log-export?format=json`, '_blank');
});

els.exportLogCsv?.addEventListener('click', () => {
  if (!state.session) { showToast('Cal una sessio activa', 'error'); return; }
  window.open(`/api/sessions/${encodeURIComponent(state.session.pin)}/log-export?format=csv`, '_blank');
});

async function submitClaim(type) {
  try {
    if (!state.session || !activeCard()) throw new Error('Cal sessio i carto');
    const result = await api(`/api/sessions/${encodeURIComponent(state.session.pin)}/claims`, {
      method: 'POST',
      body: { cardId: activeCard().id, type },
    });
    if (result.valid) {
      showToast(`Reclamacio valida: ${type.toUpperCase()}!`, 'success');
    } else {
      showToast(`No valida: ${type.toUpperCase()} (linies=${result.lines})`, 'error');
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

els.claimLine.addEventListener('click', () => submitClaim('linea'));
els.claimBingo.addEventListener('click', () => submitClaim('bingo'));

els.prevCard.addEventListener('click', () => {
  if (!state.cards.length) return;
  state.activeCardIndex = Math.max(0, state.activeCardIndex - 1);
  syncMarksFromDrawn();
  renderCard(activeCard());
});

els.nextCard.addEventListener('click', () => {
  if (!state.cards.length) return;
  state.activeCardIndex = Math.min(state.cards.length - 1, state.activeCardIndex + 1);
  syncMarksFromDrawn();
  renderCard(activeCard());
});

els.downloadCurrentPdf?.addEventListener('click', () => {
  const card = activeCard();
  if (!state.session || !card) { showToast('Cal sessio i carto actiu', 'error'); return; }
  window.open(`/api/sessions/${encodeURIComponent(state.session.pin)}/cards/${encodeURIComponent(card.id)}/pdf`, '_blank');
});

els.showCardQr?.addEventListener('click', async () => {
  const card = activeCard();
  if (!state.session || !card) { showToast('Cal sessio i carto actiu', 'error'); return; }
  const playUrl = `${location.origin}/play-card?pin=${encodeURIComponent(state.session.pin)}&card=${encodeURIComponent(card.id)}`;
  try {
    // Load QRCode if not available
    if (typeof QRCode === 'undefined') {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    const qrDataUrl = await QRCode.toDataURL(playUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 300,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
    showQrModal(`QR Cartó #${card.number}`, qrDataUrl, playUrl);
  } catch (err) {
    showToast('Error generant el QR', 'error');
  }
});

els.downloadPdf?.addEventListener('click', async () => {
  try {
    if (!state.session) throw new Error('Cal una sessio activa');
    if (!state.cards.length) throw new Error('No hi ha cartons per exportar');
    const card = activeCard();
    const scope = els.pdfScope?.value || 'all';
    const payload = {
      format: els.pdfFormat?.value || 'a4-2up',
      preset: els.pdfPreset?.value || 'evento',
      showMeta: Boolean(els.pdfShowMeta?.checked),
      highContrast: Boolean(els.pdfHighContrast?.checked),
      cardIds: scope === 'current' && card ? [card.id] : null,
    };
    const blob = await withBusy(els.downloadPdf, 'Generant PDF…',
      () => apiBinary(`/api/sessions/${encodeURIComponent(state.session.pin)}/pdf-pro`, {
        method: 'POST',
        body: payload,
      }));
    const suffix = payload.cardIds ? `card-${card?.number || 1}` : 'all-cards';
    downloadBlob(blob, `quinapp-${state.session.pin}-${suffix}.pdf`);
  } catch (error) {
    showToast(error.message, 'error');
  }
});

els.previewPdf?.addEventListener('click', async () => {
  try {
    const card = activeCard();
    if (!state.session || !card) throw new Error('Cal sessio i carto actiu');
    const blob = await withBusy(els.previewPdf, 'Generant…', async () => {
      const res = await fetch(`/api/sessions/${encodeURIComponent(state.session.pin)}/cards/${encodeURIComponent(card.id)}/pdf`);
      if (!res.ok) throw new Error('No es pot generar la previsualitzacio PDF');
      return res.blob();
    });
    const url = URL.createObjectURL(blob);
    if (els.pdfPreviewFrame) els.pdfPreviewFrame.src = url;
    if (els.pdfPreviewWrap) els.pdfPreviewWrap.classList.remove('hidden');
    showToast('Previsualitzacio PDF generada', 'info');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

els.importCsv.addEventListener('click', () => els.csvFile.click());
els.importXlsx.addEventListener('click', () => els.xlsxFile.click());

els.csvFile.addEventListener('change', async () => {
  try {
    if (!state.session) throw new Error('Primer crea o carrega una sessió');
    const file = els.csvFile.files?.[0];
    if (!file) return;
    const csvText = await file.text();
    const { parsed, updated } = await withBusy(els.importCsv, 'Important CSV…', async () => {
      const parsed = await api('/api/tools/parse-csv', { method: 'POST', body: { csvText } });
      const updated = await api(`/api/sessions/${encodeURIComponent(state.session.pin)}/import-songs`, {
        method: 'POST',
        body: { songs: parsed.songs },
      });
      return { parsed, updated };
    });
    state.session = updated;
    state.cards = [];
    state.activeCardIndex = 0;
    state.drawnSongs = [];
    state.marked = new Set();
    els.songs.value = parsed.songs.map((s) => `${s.artist} - ${s.title}`).join('\n');
    renderCard(null);
    showToast(`Importades ${parsed.songs.length} cancons des de CSV`, 'success');
    if (updated.importReport) renderImportReport(updated.importReport);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    els.csvFile.value = '';
  }
});

els.xlsxFile.addEventListener('change', async () => {
  try {
    if (!state.session) throw new Error('Primer crea o carrega una sessió');
    const file = els.xlsxFile.files?.[0];
    if (!file) return;
    const arrBuf = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(arrBuf);
    const { parsed, updated } = await withBusy(els.importXlsx, 'Important XLSX…', async () => {
      const parsed = await api('/api/tools/parse-xlsx', { method: 'POST', body: { base64 } });
      const updated = await api(`/api/sessions/${encodeURIComponent(state.session.pin)}/import-songs`, {
        method: 'POST',
        body: { songs: parsed.songs },
      });
      return { parsed, updated };
    });
    state.session = updated;
    state.cards = [];
    state.activeCardIndex = 0;
    state.drawnSongs = [];
    state.marked = new Set();
    els.songs.value = parsed.songs.map((s) => `${s.artist} - ${s.title}`).join('\n');
    renderCard(null);
    showToast(`Importades ${parsed.songs.length} cancons des de XLSX`, 'success');
    if (updated.importReport) renderImportReport(updated.importReport);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    els.xlsxFile.value = '';
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
setLiveIndicator(false);
setServerIndicator(false);
applyPdfPreset(els.pdfPreset?.value || 'evento');
if (els.spotifyClientId) {
  els.spotifyClientId.value = lsGet(SPOT_KEYS.clientId) || '';
}
if (els.playlistProvider) {
  els.playlistProvider.dispatchEvent(new Event('change'));
}
updateSpotifyStatus();
updateSpotifyPlayer(null);

(async function initSpotifyAuth() {
  try {
    await refreshServerHealthIndicator();
    await refreshPhoneConnectionUrl();
    await hydrateSpotifyClientIdFromServer();
    await spotifyHandleRedirect();
    if (window.__wizResume) window.__wizResume();
    // Optional deep-link: ?load=PIN opens the app already on that session.
    const loadPin = new URLSearchParams(location.search).get('load');
    if (loadPin) {
      els.pin.value = loadPin;
      await hydrateSession(loadPin).catch(() => {});
    }
    // Restore the tab from the URL hash (deep-linkable views).
    const initialTab = (location.hash || '').replace('#', '');
    if (VALID_TABS.includes(initialTab)) switchTab(initialTab);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    updateSpotifyStatus();
    setInterval(refreshServerHealthIndicator, 6000);
  }
})();

document.addEventListener('keydown', (event) => {
  const tag = String(event.target?.tagName || '').toLowerCase();
  const inField = tag === 'input' || tag === 'textarea' || tag === 'select' || event.target?.isContentEditable;
  if (inField) return;
  const key = String(event.key || '').toLowerCase();

  if (event.code === 'Space') {
    event.preventDefault();
    els.drawNext?.click();
    return;
  }
  if (key === 's' || key === 'n') {
    event.preventDefault();
    els.drawSkip?.click();
    return;
  }
  if (key === 'r') {
    event.preventDefault();
    els.drawRepeat?.click();
    return;
  }
  if (key === 'b') {
    event.preventDefault();
    els.drawBlock?.click();
    return;
  }
  if (key === 'u') {
    event.preventDefault();
    els.undoDraw?.click();
    return;
  }
  if (key === 'f') {
    event.preventDefault();
    els.locutorFullscreen?.click();
  }
});

// ── Assistent guiat (vista base, 5 passos) ────────────────────────────────────
(function initWizard() {
  const W = {
    section: document.getElementById('wizard'),
    dots: Array.from(document.querySelectorAll('.wiz-step-dot')),
    panels: Array.from(document.querySelectorAll('.wiz-panel')),
    modeToggle: document.getElementById('modeToggle'),
    spotConnect: document.getElementById('wizSpotifyConnect'),
    spotStatus: document.getElementById('wizSpotifyStatus'),
    clientIdWrap: document.getElementById('wizClientIdWrap'),
    clientId: document.getElementById('wizClientId'),
    skipSpotify: document.getElementById('wizSkipSpotify'),
    next1: document.getElementById('wizNext1'),
    playlistUrl: document.getElementById('wizPlaylistUrl'),
    importBtn: document.getElementById('wizImport'),
    importStatus: document.getElementById('wizImportStatus'),
    next2: document.getElementById('wizNext2'),
    songList: document.getElementById('wizSongList'),
    songCount: document.getElementById('wizSongCount'),
    addSong: document.getElementById('wizAddSong'),
    next3: document.getElementById('wizNext3'),
    count: document.getElementById('wizCount'),
    generate: document.getElementById('wizGenerate'),
    genResult: document.getElementById('wizGenResult'),
    pinOut: document.getElementById('wizPin'),
    downloadPdf: document.getElementById('wizDownloadPdf'),
    next4: document.getElementById('wizNext4'),
    drawNext: document.getElementById('wizDrawNext'),
    nowArtist: document.getElementById('wizNowArtist'),
    nowTitle: document.getElementById('wizNowTitle'),
    counter: document.getElementById('wizCounter'),
    openConsole: document.getElementById('wizOpenConsole'),
    restart: document.getElementById('wizRestart'),
    share: document.getElementById('wizShare'),
  };
  if (!W.section) return;

  const MODE_KEY = 'qm_mode';
  const RESUME_KEY = 'qm_wiz_resume';
  const STATE_KEY = 'qm_wiz_state';
  const MIN_SONGS = 15; // 3×5 per defecte
  const wstate = { songs: [], pin: null };
  let curStep = 1;

  function saveWiz() {
    try { lsSet(STATE_KEY, JSON.stringify({ songs: wstate.songs, pin: wstate.pin, step: curStep })); } catch {}
  }

  function setMode(advanced) {
    document.body.classList.toggle('advanced', advanced);
    lsSet(MODE_KEY, advanced ? 'advanced' : 'wizard');
    if (W.modeToggle) W.modeToggle.textContent = advanced ? 'Assistent' : 'Mode avançat';
  }
  W.modeToggle?.addEventListener('click', () => setMode(!document.body.classList.contains('advanced')));
  setMode(lsGet(MODE_KEY) === 'advanced'
    || new URLSearchParams(location.search).get('mode') === 'advanced');

  function showStep(n) {
    curStep = n;
    W.panels.forEach((p) => { p.hidden = Number(p.dataset.wiz) !== n; });
    W.dots.forEach((d) => {
      const s = Number(d.dataset.step);
      d.classList.toggle('active', s === n);
      d.classList.toggle('done', s < n);
    });
    saveWiz();
  }

  // Pas 1 — Spotify
  function refreshSpotifyStep() {
    const connected = spotifyConnected();
    if (W.spotStatus) {
      W.spotStatus.textContent = connected ? 'Connectat ✓' : 'No connectat';
      W.spotStatus.classList.toggle('ok', connected);
    }
    if (W.next1) W.next1.disabled = !connected;
  }
  W.spotConnect?.addEventListener('click', async () => {
    try {
      const cid = (W.clientId?.value || '').trim() || currentSpotifyClientId();
      if (!cid) {
        // Cap Client ID configurat: revela el camp un sol cop en lloc de fallar.
        if (W.clientIdWrap) { W.clientIdWrap.hidden = false; W.clientIdWrap.open = true; }
        W.clientId?.focus();
        showToast('Configura el Client ID de Spotify (un sol cop) o arrenca amb SPOTIFY_CLIENT_ID', 'info');
        return;
      }
      if ((W.clientId?.value || '').trim()) lsSet(SPOT_KEYS.clientId, cid);
      // No usem withBusy: canviaria textContent i eliminaria el logo SVG.
      if (W.spotConnect) W.spotConnect.disabled = true;
      let ok = false;
      try { ok = await spotifyStartLoginPopup(); }
      finally { if (W.spotConnect) W.spotConnect.disabled = false; }
      refreshSpotifyStep();
      if (ok || spotifyConnected()) {
        showToast('Spotify connectat', 'success');
        showStep(2);
      }
    } catch (e) { showToast(e.message, 'error'); }
  });
  W.skipSpotify?.addEventListener('click', () => {
    if (!wstate.songs.length) wstate.songs = [{ artist: '', title: '' }];
    renderSongs();
    showStep(3);
  });
  W.next1?.addEventListener('click', () => showStep(2));

  // Pas 2 — import playlist
  W.importBtn?.addEventListener('click', async () => {
    try {
      const url = (W.playlistUrl?.value || '').trim();
      if (!url) throw new Error('Enganxa una URL de playlist');
      const provider = detectPlaylistProvider(url);
      let token = '';
      if (provider === 'spotify' || provider === 'unknown') token = (await spotifyGetValidToken()) || '';
      const parsed = await withBusy(W.importBtn, 'Important…', () => api('/api/tools/import-playlist', {
        method: 'POST', body: { url, provider: 'auto', token },
      }));
      if (!parsed.songs?.length) throw new Error('Llista buida o no llegible');
      wstate.songs = parsed.songs.map((s) => ({ artist: s.artist || '', title: s.title || '' }));
      if (W.importStatus) W.importStatus.textContent = `${parsed.songs.length} cançons importades.`;
      if (W.next2) W.next2.disabled = false;
      saveWiz();
    } catch (e) { showToast(e.message, 'error'); }
  });
  W.next2?.addEventListener('click', () => { renderSongs(); showStep(3); });

  // Pas 3 — editar
  function validSongs() {
    return wstate.songs.filter((s) => (s.artist || '').trim() && (s.title || '').trim());
  }
  function updateCount() {
    const n = validSongs().length;
    if (W.songCount) {
      W.songCount.textContent = `${n} cançons (mínim ${MIN_SONGS})`;
      W.songCount.classList.toggle('bad', n < MIN_SONGS);
    }
    if (W.next3) W.next3.disabled = n < MIN_SONGS;
    saveWiz();
  }
  function renderSongs() {
    if (!W.songList) return;
    W.songList.innerHTML = '';
    wstate.songs.forEach((song, i) => {
      const row = document.createElement('div');
      row.className = 'wiz-song-row';
      const a = document.createElement('input');
      a.value = song.artist || ''; a.placeholder = 'Artista'; a.setAttribute('aria-label', 'Artista');
      const t = document.createElement('input');
      t.value = song.title || ''; t.placeholder = 'Títol'; t.setAttribute('aria-label', 'Títol');
      a.addEventListener('input', () => { wstate.songs[i].artist = a.value; updateCount(); });
      t.addEventListener('input', () => { wstate.songs[i].title = t.value; updateCount(); });
      const del = document.createElement('button');
      del.type = 'button'; del.textContent = '✕'; del.setAttribute('aria-label', 'Esborrar cançó');
      del.addEventListener('click', () => { wstate.songs.splice(i, 1); renderSongs(); });
      row.append(a, t, del);
      W.songList.appendChild(row);
    });
    updateCount();
  }
  W.addSong?.addEventListener('click', () => {
    wstate.songs.push({ artist: '', title: '' });
    renderSongs();
    W.songList.lastElementChild?.querySelector('input')?.focus();
  });
  W.next3?.addEventListener('click', () => showStep(4));

  // Pas 4 — generar
  function genPin() { return String(1000 + Math.floor(Math.random() * 9000)); }
  async function downloadWizPdf() {
    if (!wstate.pin) return;
    const blob = await apiBinary(`/api/sessions/${encodeURIComponent(wstate.pin)}/pdf-pro`, {
      method: 'POST', body: { format: 'a4-2up', preset: 'evento', showMeta: true, highContrast: false, cardIds: null },
    });
    downloadBlob(blob, `quinapp-${wstate.pin}-cartons.pdf`);
  }
  async function doGenerate() {
    const songs = validSongs();
    if (songs.length < MIN_SONGS) throw new Error(`Calen almenys ${MIN_SONGS} cançons`);
    const pin = genPin();
    const songsText = songs.map((s) => `${s.artist} - ${s.title}`).join('\n');
    await api('/api/sessions', { method: 'POST', body: { pin, songsText, rows: 3, cols: 5, preventDupes: true } });
    const count = Math.max(1, Math.min(200, Number(W.count?.value || 20)));
    await api(`/api/sessions/${encodeURIComponent(pin)}/cards`, { method: 'POST', body: { count } });
    wstate.pin = pin;
    saveWiz();
    await hydrateSession(pin);
    await downloadWizPdf();
    if (W.pinOut) W.pinOut.textContent = pin;
    if (W.genResult) W.genResult.hidden = false;
    if (W.next4) W.next4.disabled = false;
  }
  W.generate?.addEventListener('click', async () => {
    try { await withBusy(W.generate, 'Generant…', doGenerate); }
    catch (e) { showToast(e.message, 'error'); }
  });
  W.downloadPdf?.addEventListener('click', async () => {
    try { await withBusy(W.downloadPdf, 'Descarregant…', downloadWizPdf); }
    catch (e) { showToast(e.message, 'error'); }
  });
  W.next4?.addEventListener('click', () => { showStep(5); updateWizNow(state.currentSong, state.drawnSongs.length); });

  // Pas 5 — jugar
  W.drawNext?.addEventListener('click', () => els.drawNext?.click());
  W.openConsole?.addEventListener('click', () => { setMode(true); switchTab('locutor'); });
  W.share?.addEventListener('click', async () => {
    try {
      const cfg = await fetchNetworkConfig();
      const url = cfg.selectedUrl || pickBestPhoneUrl(cfg.urls);
      if (!cfg.qrDataUrl || !url) throw new Error('No hi ha URL de xarxa disponible');
      showQrModal(`Connexió mòbil${wstate.pin ? ` · PIN ${wstate.pin}` : ''}`, cfg.qrDataUrl, url);
    } catch (e) { showToast(e.message, 'error'); }
  });
  W.restart?.addEventListener('click', () => {
    wstate.songs = []; wstate.pin = null;
    lsDel(STATE_KEY);
    if (W.importStatus) W.importStatus.textContent = '';
    if (W.genResult) W.genResult.hidden = true;
    if (W.next2) W.next2.disabled = true;
    if (W.next4) W.next4.disabled = true;
    if (W.playlistUrl) W.playlistUrl.value = '';
    refreshSpotifyStep();
    showStep(1);
  });

  document.querySelectorAll('[data-wiz-back]').forEach((b) => {
    b.addEventListener('click', () => showStep(Number(b.dataset.wizBack)));
  });

  // Mirall del sorteig al pas 5 (cridat des d'applyDrawSong)
  window.updateWizNow = function (song, drawn) {
    if (!W.nowArtist) return;
    const total = els.totalSongs?.textContent || '—';
    if (!song) {
      W.nowArtist.textContent = '—';
      W.nowTitle.textContent = state.playlistDone ? '✓ Fi de la partida' : 'Prem «Següent cançó»';
    } else {
      W.nowArtist.textContent = song.artist;
      W.nowTitle.textContent = song.title;
    }
    if (W.counter) W.counter.textContent = `${drawn ?? 0} / ${total}`;
  };

  // Resume després del redirect PKCE de Spotify (cridat des de l'init async)
  window.__wizResume = function () {
    const r = lsGet(RESUME_KEY);
    if (r && spotifyConnected()) {
      lsDel(RESUME_KEY);
      setMode(false);
      refreshSpotifyStep();
      showStep(Number(r) || 2);
    }
  };

  // Restaura l'estat del wizard si l'usuari recarrega a mig flux.
  (function restoreWiz() {
    refreshSpotifyStep();
    let saved = null;
    try { saved = JSON.parse(lsGet(STATE_KEY) || 'null'); } catch {}
    if (saved && (saved.songs?.length || saved.pin)) {
      wstate.songs = Array.isArray(saved.songs) ? saved.songs : [];
      wstate.pin = saved.pin || null;
      if (wstate.songs.length) {
        renderSongs();
        if (W.importStatus) W.importStatus.textContent = `${wstate.songs.length} cançons.`;
        if (W.next2) W.next2.disabled = false;
      }
      if (wstate.pin) {
        if (W.pinOut) W.pinOut.textContent = wstate.pin;
        if (W.genResult) W.genResult.hidden = false;
        if (W.next4) W.next4.disabled = false;
        hydrateSession(wstate.pin).catch(() => {});
      }
      showStep(Math.min(5, Math.max(1, Number(saved.step) || 1)));
    } else {
      showStep(1);
    }
  })();
  setInterval(refreshSpotifyStep, 2500);
})();
