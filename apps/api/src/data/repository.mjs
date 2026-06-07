import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import {
  parseSongsFromText,
  generateCardSongs,
  hash32,
  rand,
  seededShuffle,
  findMarkedIndexes,
  countCompletedLines,
  songKey,
  normalizeText,
} from '../../../../packages/core/src/index.mjs';
import { db } from './db.mjs';

function mapSong(row) {
  return {
    artist: row.artist,
    title: row.title,
    provider: row.provider || null,
    url: row.source_url || null,
    uri: row.uri || null,
  };
}

function getSessionSongs(pin) {
  const rows = db
    .prepare('SELECT artist, title, provider, source_url, uri FROM session_songs WHERE session_pin = ? ORDER BY song_order ASC')
    .all(pin);
  return rows.map(mapSong);
}

function hashAdminPin(pin) {
  return createHash('sha256').update(String(pin || ''), 'utf8').digest('hex');
}

export function requireAdmin(pin, adminPin) {
  const row = db.prepare('SELECT admin_pin_hash FROM sessions WHERE pin = ?').get(pin);
  if (!row) throw new Error('Sesion no encontrada');
  if (!row.admin_pin_hash) throw new Error('Sesion sin PIN admin configurado');
  if (hashAdminPin(adminPin) !== row.admin_pin_hash) throw new Error('PIN admin incorrecto');
}

function logAudit(pin, actor, action, details = {}) {
  db.prepare(
    'INSERT INTO audit_logs (session_pin, actor, action, details_json, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(
    pin,
    String(actor || 'system'),
    String(action || 'unknown'),
    JSON.stringify(details || {}),
    new Date().toISOString()
  );
}

function getSessionDrawn(pin) {
  const rows = db
    .prepare('SELECT artist, title, provider, source_url, uri FROM draws WHERE session_pin = ? ORDER BY draw_order ASC')
    .all(pin);
  return rows.map(mapSong);
}

export function listDrawnSongs(pin) {
  return getSessionDrawn(pin);
}

function getCardSongs(cardId) {
  const rows = db
    .prepare('SELECT artist, title, provider, source_url, uri FROM card_songs WHERE card_id = ? ORDER BY song_index ASC')
    .all(cardId);
  return rows.map(mapSong);
}

export function createSession({ pin, songsText, rows = 3, cols = 5, seed, preventDupes = true, adminPin = '' }) {
  const songs = parseSongsFromText(songsText);
  const safeRows = Math.max(1, Math.min(6, Number(rows) || 3));
  const safeCols = Math.max(3, Math.min(8, Number(cols) || 5));
  const safeSeed = String(seed || Date.now().toString(36));
  const safePin = String(pin || '').trim();

  if (!safePin || safePin.length < 3) {
    throw new Error('PIN invalido (minimo 3 caracteres)');
  }
  if (songs.length < safeRows * safeCols) {
    throw new Error(`Se necesitan al menos ${safeRows * safeCols} canciones`);
  }

  const createdAt = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM sessions WHERE pin = ?').run(safePin);
    db.prepare(
      'INSERT INTO sessions (pin, rows, cols, seed, prevent_dupes, created_at, admin_pin_hash) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(safePin, safeRows, safeCols, safeSeed, preventDupes ? 1 : 0, createdAt, adminPin ? hashAdminPin(adminPin) : null);

    const insertSong = db.prepare(
      'INSERT INTO session_songs (session_pin, song_order, artist, title, provider, source_url, uri) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    songs.forEach((song, idx) => {
      insertSong.run(safePin, idx, song.artist, song.title, song.provider || null, song.url || null, song.uri || null);
    });

    logAudit(safePin, 'admin', 'session.create', {
      rows: safeRows,
      cols: safeCols,
      seed: safeSeed,
      songs: songs.length,
      hasAdminPin: Boolean(adminPin),
    });
  });

  tx();

  return {
    pin: safePin,
    rows: safeRows,
    cols: safeCols,
    seed: safeSeed,
    preventDupes: Boolean(preventDupes),
    songs: songs.length,
    createdAt,
  };
}

export function getSession(pin) {
  const row = db.prepare('SELECT pin, rows, cols, seed, prevent_dupes, created_at FROM sessions WHERE pin = ?').get(pin);
  if (!row) return null;
  const cards = db.prepare('SELECT COUNT(*) AS n FROM cards WHERE session_pin = ?').get(pin).n;
  const drawn = db.prepare('SELECT COUNT(*) AS n FROM draws WHERE session_pin = ?').get(pin).n;
  const songs = db.prepare('SELECT COUNT(*) AS n FROM session_songs WHERE session_pin = ?').get(pin).n;
  return {
    pin: row.pin,
    rows: row.rows,
    cols: row.cols,
    seed: row.seed,
    preventDupes: Boolean(row.prevent_dupes),
    songs,
    cards,
    drawn,
    createdAt: row.created_at,
  };
}

export function sessionHasAdminPin(pin) {
  const row = db.prepare('SELECT admin_pin_hash FROM sessions WHERE pin = ?').get(pin);
  if (!row) throw new Error('Sesion no encontrada');
  return Boolean(row.admin_pin_hash);
}

export function createCards(pin, count = 1) {
  const session = db.prepare('SELECT pin, rows, cols, seed, prevent_dupes FROM sessions WHERE pin = ?').get(pin);
  if (!session) throw new Error('Sesion no encontrada');

  const requested = Math.max(1, Math.min(200, Number(count) || 1));
  const songs = getSessionSongs(pin);
  const existing = db.prepare('SELECT COUNT(*) AS n FROM cards WHERE session_pin = ?').get(pin).n;

  const created = [];
  const tx = db.transaction(() => {
    const insertCard = db.prepare('INSERT INTO cards (id, session_pin, card_number, created_at) VALUES (?, ?, ?, ?)');
    const insertCardSong = db.prepare(
      'INSERT INTO card_songs (card_id, song_index, artist, title, provider, source_url, uri) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    for (let i = 0; i < requested; i += 1) {
      const cardNumber = existing + i + 1;
      const cardSeed = `${session.seed}#card#${existing + i}`;
      const cardSongs = generateCardSongs({
        songs,
        rows: session.rows,
        cols: session.cols,
        seed: cardSeed,
        preventDupes: Boolean(session.prevent_dupes),
      });
      const cardId = randomUUID();
      const createdAt = new Date().toISOString();

      insertCard.run(cardId, pin, cardNumber, createdAt);
      cardSongs.forEach((song, idx) => {
        insertCardSong.run(cardId, idx, song.artist, song.title, song.provider || null, song.url || null, song.uri || null);
      });

      created.push({ id: cardId, number: cardNumber, songs: cardSongs, createdAt });
    }
  });

  tx();
  logAudit(pin, 'admin', 'cards.create', { count: created.length });
  return created;
}

export function drawNextSong(pin) {
  const session = db.prepare('SELECT pin, seed FROM sessions WHERE pin = ?').get(pin);
  if (!session) throw new Error('Sesion no encontrada');

  const insertDraw = db.prepare(
    'INSERT INTO draws (session_pin, draw_order, artist, title, provider, source_url, uri, drawn_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const allSongs = getSessionSongs(pin);
      const drawnSongs = getSessionDrawn(pin);
      const drawnKeys = new Set(drawnSongs.map(songKey));
      const remaining = allSongs.filter((song) => !drawnKeys.has(songKey(song)));

      if (remaining.length === 0) {
        db.exec('COMMIT');
        return { done: true, song: null, drawn: drawnSongs.length };
      }

      const drawOrder = drawnSongs.length;
      const r = rand(hash32(`${session.seed}#draw#${drawOrder}`));
      const next = seededShuffle(remaining, r)[0];

      insertDraw.run(
        pin,
        drawOrder,
        next.artist,
        next.title,
        next.provider || null,
        next.url || null,
        next.uri || null,
        new Date().toISOString()
      );

      db.exec('COMMIT');
      logAudit(pin, 'locutor', 'draw.next', { drawOrder, song: next });
      return { done: false, song: next, drawn: drawOrder + 1 };
    } catch (error) {
      db.exec('ROLLBACK');
      const isUniqueConflict =
        typeof error?.code === 'string' &&
        error.code === 'SQLITE_CONSTRAINT_UNIQUE';
      if (!isUniqueConflict) throw error;
    }
  }

  throw new Error('No se pudo completar el sorteo por concurrencia');
}

export function peekNextSong(pin) {
  const session = db.prepare('SELECT pin, seed FROM sessions WHERE pin = ?').get(pin);
  if (!session) throw new Error('Sesion no encontrada');
  const allSongs = getSessionSongs(pin);
  const drawnSongs = getSessionDrawn(pin);
  const drawnKeys = new Set(drawnSongs.map(songKey));
  const remaining = allSongs.filter((song) => !drawnKeys.has(songKey(song)));
  if (remaining.length === 0) {
    return { done: true, song: null, drawn: drawnSongs.length };
  }
  const drawOrder = drawnSongs.length;
  const r = rand(hash32(`${session.seed}#draw#${drawOrder}`));
  const next = seededShuffle(remaining, r)[0];
  return { done: false, song: next, drawn: drawOrder + 1 };
}

export function evaluateClaim(pin, cardId, type) {
  const session = db.prepare('SELECT rows, cols FROM sessions WHERE pin = ?').get(pin);
  if (!session) throw new Error('Sesion no encontrada');

  const card = db.prepare('SELECT id FROM cards WHERE id = ? AND session_pin = ?').get(cardId, pin);
  if (!card) throw new Error('Carton no encontrado');

  const cardSongs = getCardSongs(cardId);
  const drawnSongs = getSessionDrawn(pin);
  const marked = findMarkedIndexes(cardSongs, drawnSongs);
  const lines = countCompletedLines(marked, session.rows, session.cols);
  const bingo = marked.size === session.rows * session.cols;
  const safeType = type === 'linea' ? 'linea' : 'bingo';
  const valid = safeType === 'linea' ? lines >= 1 : bingo;

  const result = {
    valid,
    type: safeType,
    lines,
    bingo,
    marked: marked.size,
    total: session.rows * session.cols,
  };

  db.prepare(
    `INSERT INTO claims (session_pin, card_id, type, valid, lines, bingo, marked, total, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(pin, cardId, safeType, valid ? 1 : 0, lines, bingo ? 1 : 0, marked.size, result.total, new Date().toISOString());

  logAudit(pin, 'jugador', 'claim.check', { cardId, ...result });

  return result;
}

export function undoLastDraw(pin, actor = 'locutor') {
  const session = db.prepare('SELECT pin FROM sessions WHERE pin = ?').get(pin);
  if (!session) throw new Error('Sesion no encontrada');
  const last = db.prepare('SELECT id, draw_order, artist, title FROM draws WHERE session_pin = ? ORDER BY draw_order DESC LIMIT 1').get(pin);
  if (!last) return { undone: false, drawn: 0 };

  db.prepare('DELETE FROM draws WHERE id = ?').run(last.id);
  const drawn = db.prepare('SELECT COUNT(*) AS n FROM draws WHERE session_pin = ?').get(pin).n;
  logAudit(pin, actor, 'draw.undo', { drawOrder: last.draw_order, song: { artist: last.artist, title: last.title } });
  return { undone: true, drawn };
}

export function resetSessionRound(pin, adminPin, actor = 'admin') {
  requireAdmin(pin, adminPin);
  const session = db.prepare('SELECT pin FROM sessions WHERE pin = ?').get(pin);
  if (!session) throw new Error('Sesion no encontrada');
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM cards WHERE session_pin = ?').run(pin);
    db.prepare('DELETE FROM draws WHERE session_pin = ?').run(pin);
    db.prepare('DELETE FROM claims WHERE session_pin = ?').run(pin);
  });
  tx();
  logAudit(pin, actor, 'session.reset_round', {});
  return getSession(pin);
}

export function deleteSession(pin, adminPin, actor = 'admin') {
  requireAdmin(pin, adminPin);
  const session = db.prepare('SELECT pin FROM sessions WHERE pin = ?').get(pin);
  if (!session) throw new Error('Sesion no encontrada');
  db.prepare('DELETE FROM sessions WHERE pin = ?').run(pin);
  // El borrado de sesión en cascada elimina todo; guardamos rastro global no asociado si no existe sesión.
  return { deleted: true, pin };
}

export function listAuditLogs(pin, limit = 300) {
  const safe = Math.max(1, Math.min(1000, Number(limit) || 300));
  return db.prepare(
    'SELECT id, actor, action, details_json, created_at FROM audit_logs WHERE session_pin = ? ORDER BY id DESC LIMIT ?'
  ).all(pin, safe).map((r) => ({
    id: r.id,
    actor: r.actor,
    action: r.action,
    details: (() => { try { return JSON.parse(r.details_json || '{}'); } catch { return {}; } })(),
    createdAt: r.created_at,
  }));
}

export function analyzeSongsQuality(songs, existingSongs = []) {
  const input = Array.isArray(songs) ? songs : [];
  const existing = Array.isArray(existingSongs) ? existingSongs : [];
  const seen = new Map();
  const byTitle = new Map();
  const byArtist = new Map();
  const duplicates = [];
  const conflictive = [];
  const unique = [];
  const existingKeys = new Set(existing.map(songKey));
  let newCount = 0;

  input.forEach((song, index) => {
    const artist = String(song.artist || '').trim();
    const title = String(song.title || '').trim();
    const safeSong = { ...song, artist: artist || '(artista)', title: title || '(cancion)' };
    const key = songKey(safeSong);
    const nTitle = normalizeText(safeSong.title);
    const nArtist = normalizeText(safeSong.artist);
    if (seen.has(key)) {
      duplicates.push({ index, song: safeSong, firstIndex: seen.get(key) });
      return;
    }
    seen.set(key, index);
    unique.push(safeSong);
    if (!existingKeys.has(key)) newCount += 1;

    const prevTitle = byTitle.get(nTitle);
    if (prevTitle && normalizeText(prevTitle.artist) !== nArtist) {
      conflictive.push({ kind: 'same_title_diff_artist', song: safeSong, with: prevTitle });
    }
    if (!prevTitle) byTitle.set(nTitle, safeSong);

    const prevArtist = byArtist.get(nArtist);
    if (prevArtist && normalizeText(prevArtist.title) !== nTitle) {
      conflictive.push({ kind: 'same_artist_diff_title', song: safeSong, with: prevArtist });
    }
    if (!prevArtist) byArtist.set(nArtist, safeSong);
  });

  return {
    total: input.length,
    uniqueCount: unique.length,
    newCount,
    duplicateCount: duplicates.length,
    conflictiveCount: conflictive.length,
    duplicates: duplicates.slice(0, 25),
    conflictive: conflictive.slice(0, 25),
    unique,
    normalizationRules: [
      'Comparación por artista+título normalizados (minúsculas, sin acentos, trim).',
      'Duplicada: misma clave normalizada artista::título.',
      'Conflictiva: mismo título con artista distinto o mismo artista con título distinto.',
    ],
  };
}

export function importSongsToSession(pin, songs) {
  const session = db.prepare('SELECT pin, rows, cols FROM sessions WHERE pin = ?').get(pin);
  if (!session) throw new Error('Sesion no encontrada');
  if (!Array.isArray(songs)) {
    throw new Error(`Se necesitan al menos ${session.rows * session.cols} canciones`);
  }

  const previousSongs = getSessionSongs(pin);
  const analysis = analyzeSongsQuality(songs, previousSongs);
  const finalSongs = analysis.unique;
  if (finalSongs.length < session.rows * session.cols) {
    throw new Error(`Se necesitan al menos ${session.rows * session.cols} canciones`);
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM session_songs WHERE session_pin = ?').run(pin);
    db.prepare('DELETE FROM cards WHERE session_pin = ?').run(pin);
    db.prepare('DELETE FROM draws WHERE session_pin = ?').run(pin);
    db.prepare('DELETE FROM claims WHERE session_pin = ?').run(pin);

    const insertSong = db.prepare(
      'INSERT INTO session_songs (session_pin, song_order, artist, title, provider, source_url, uri) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    finalSongs.forEach((song, idx) => {
      insertSong.run(pin, idx, song.artist, song.title, song.provider || null, song.url || null, song.uri || null);
    });
  });

  tx();
  logAudit(pin, 'admin', 'songs.import', {
    total: analysis.total,
    uniqueCount: analysis.uniqueCount,
    newCount: analysis.newCount,
    duplicateCount: analysis.duplicateCount,
    conflictiveCount: analysis.conflictiveCount,
  });

  return {
    ...getSession(pin),
    importReport: {
      total: analysis.total,
      uniqueCount: analysis.uniqueCount,
      newCount: analysis.newCount,
      duplicateCount: analysis.duplicateCount,
      conflictiveCount: analysis.conflictiveCount,
      duplicates: analysis.duplicates,
      conflictive: analysis.conflictive,
      normalizationRules: analysis.normalizationRules,
    },
  };
}

export function getCard(pin, cardId) {
  const cardRow = db.prepare('SELECT id, card_number AS number, created_at FROM cards WHERE id = ? AND session_pin = ?').get(cardId, pin);
  if (!cardRow) return null;
  return { ...cardRow, songs: getCardSongs(cardId) };
}

export function listCards(pin) {
  const rows = db.prepare(
    `SELECT c.id, c.card_number AS number, c.created_at,
            cs.artist, cs.title, cs.provider, cs.source_url, cs.uri
     FROM cards c
     LEFT JOIN card_songs cs ON cs.card_id = c.id
     WHERE c.session_pin = ?
     ORDER BY c.card_number ASC, cs.song_index ASC`
  ).all(pin);

  const cardsMap = new Map();
  for (const row of rows) {
    if (!cardsMap.has(row.id)) {
      cardsMap.set(row.id, { id: row.id, number: row.number, created_at: row.created_at, songs: [] });
    }
    if (row.artist !== null || row.title !== null) {
      cardsMap.get(row.id).songs.push({
        artist: row.artist,
        title: row.title,
        provider: row.provider || null,
        url: row.source_url || null,
        uri: row.uri || null,
      });
    }
  }
  return [...cardsMap.values()];
}
