import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = process.env.QUINAPP_DATA_DIR
  ? path.resolve(process.env.QUINAPP_DATA_DIR)
  : path.resolve(__dirname, '../../../../data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'quinapp.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      pin TEXT PRIMARY KEY,
      rows INTEGER NOT NULL,
      cols INTEGER NOT NULL,
      seed TEXT NOT NULL,
      prevent_dupes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_pin TEXT NOT NULL,
      song_order INTEGER NOT NULL,
      artist TEXT NOT NULL,
      title TEXT NOT NULL,
      provider TEXT,
      source_url TEXT,
      uri TEXT,
      FOREIGN KEY (session_pin) REFERENCES sessions(pin) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      session_pin TEXT NOT NULL,
      card_number INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_pin) REFERENCES sessions(pin) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS card_songs (
      card_id TEXT NOT NULL,
      song_index INTEGER NOT NULL,
      artist TEXT NOT NULL,
      title TEXT NOT NULL,
      provider TEXT,
      source_url TEXT,
      uri TEXT,
      PRIMARY KEY (card_id, song_index),
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS draws (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_pin TEXT NOT NULL,
      draw_order INTEGER NOT NULL,
      artist TEXT NOT NULL,
      title TEXT NOT NULL,
      provider TEXT,
      source_url TEXT,
      uri TEXT,
      drawn_at TEXT NOT NULL,
      FOREIGN KEY (session_pin) REFERENCES sessions(pin) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_pin TEXT NOT NULL,
      card_id TEXT NOT NULL,
      type TEXT NOT NULL,
      valid INTEGER NOT NULL,
      lines INTEGER NOT NULL,
      bingo INTEGER NOT NULL,
      marked INTEGER NOT NULL,
      total INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_pin) REFERENCES sessions(pin) ON DELETE CASCADE,
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_pin TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      details_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_pin) REFERENCES sessions(pin) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_session_songs_pin ON session_songs(session_pin, song_order);
    CREATE INDEX IF NOT EXISTS idx_cards_pin ON cards(session_pin, card_number);
    CREATE INDEX IF NOT EXISTS idx_draws_pin ON draws(session_pin, draw_order);
    CREATE INDEX IF NOT EXISTS idx_claims_pin ON claims(session_pin, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_cards_session_number ON cards(session_pin, card_number);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_draws_session_order ON draws(session_pin, draw_order);
    CREATE INDEX IF NOT EXISTS idx_audit_pin ON audit_logs(session_pin, created_at);
  `);

  // Compatibilidad hacia atrás para sesiones existentes.
  const cols = db.prepare('PRAGMA table_info(sessions)').all();
  const hasAdminPinHash = cols.some((c) => c.name === 'admin_pin_hash');
  if (!hasAdminPinHash) {
    db.exec('ALTER TABLE sessions ADD COLUMN admin_pin_hash TEXT');
  }
}

export { dbPath };
