import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'fillercheck.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      meeting_at TEXT DEFAULT NULL,
      meeting_result TEXT CHECK(meeting_result IN ('won', 'lost', 'ongoing')) DEFAULT NULL,
      total_filler_count INTEGER DEFAULT 0,
      char_count INTEGER DEFAULT 0,
      speakers TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS filler_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      word TEXT NOT NULL,
      count INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS filler_occurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      word TEXT NOT NULL,
      position INTEGER NOT NULL,
      context TEXT NOT NULL,
      occurrence_index INTEGER NOT NULL,
      speaker TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS speaker_filler_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      speaker TEXT NOT NULL,
      word TEXT NOT NULL,
      count INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS speaker_char_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      speaker TEXT NOT NULL,
      char_count INTEGER NOT NULL
    );
  `);

  // 既存DBへのマイグレーション
  const migrations = [
    `ALTER TABLE sessions ADD COLUMN speakers TEXT DEFAULT '[]'`,
    `ALTER TABLE sessions ADD COLUMN char_count INTEGER DEFAULT 0`,
    `ALTER TABLE sessions ADD COLUMN meeting_at TEXT DEFAULT NULL`,
    `ALTER TABLE filler_occurrences ADD COLUMN speaker TEXT DEFAULT NULL`,
    `CREATE TABLE IF NOT EXISTS speaker_filler_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      speaker TEXT NOT NULL,
      word TEXT NOT NULL,
      count INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS speaker_char_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      speaker TEXT NOT NULL,
      char_count INTEGER NOT NULL
    )`,
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* already exists */ }
  }
}
