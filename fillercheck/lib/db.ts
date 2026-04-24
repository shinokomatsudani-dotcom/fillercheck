import { createClient, type Client } from '@libsql/client';

const TURSO_URL = process.env.TURSO_URL ?? 'file:fillercheck.db';
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN ?? '';

let _client: Client | null = null;
let _schemaReady = false;

export function getDb(): Client {
  if (!_client) {
    _client = createClient({ url: TURSO_URL, authToken: TURSO_AUTH_TOKEN });
  }
  return _client;
}

export async function ensureSchema(): Promise<void> {
  if (_schemaReady) return;
  const db = getDb();

  const tables = [
    `CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      meeting_at TEXT DEFAULT NULL,
      meeting_result TEXT CHECK(meeting_result IN ('won', 'lost', 'ongoing')) DEFAULT NULL,
      total_filler_count INTEGER DEFAULT 0,
      char_count INTEGER DEFAULT 0,
      speakers TEXT DEFAULT '[]',
      user_id TEXT DEFAULT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS filler_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      word TEXT NOT NULL,
      count INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS filler_occurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      word TEXT NOT NULL,
      position INTEGER NOT NULL,
      context TEXT NOT NULL,
      occurrence_index INTEGER NOT NULL,
      speaker TEXT DEFAULT NULL
    )`,
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

  for (const sql of tables) {
    await db.execute(sql);
  }

  // 既存DBへのマイグレーション
  const migrations = [
    `ALTER TABLE sessions ADD COLUMN speakers TEXT DEFAULT '[]'`,
    `ALTER TABLE sessions ADD COLUMN char_count INTEGER DEFAULT 0`,
    `ALTER TABLE sessions ADD COLUMN meeting_at TEXT DEFAULT NULL`,
    `ALTER TABLE filler_occurrences ADD COLUMN speaker TEXT DEFAULT NULL`,
    `ALTER TABLE sessions ADD COLUMN user_id TEXT DEFAULT NULL`,
  ];
  for (const sql of migrations) {
    try { await db.execute(sql); } catch { /* already exists */ }
  }

  _schemaReady = true;
}
