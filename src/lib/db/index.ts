import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, "studio.db");

let db: Database.Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  duration_seconds REAL,
  width INTEGER,
  height INTEGER,
  sha256 TEXT,
  provider TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_sha ON assets(sha256);

CREATE TABLE IF NOT EXISTS style_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL,
  is_template INTEGER NOT NULL DEFAULT 0,
  reference_asset_id TEXT,
  analysis_json TEXT,
  spec_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS voice_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_voice_id TEXT,
  sample_asset_id TEXT,
  sample_seconds REAL,
  status TEXT NOT NULL,
  consent_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  duration_target INTEGER NOT NULL DEFAULT 60,
  aspect TEXT NOT NULL DEFAULT '9:16',
  width INTEGER NOT NULL DEFAULT 720,
  height INTEGER NOT NULL DEFAULT 1280,
  fps INTEGER NOT NULL DEFAULT 30,
  quality TEXT NOT NULL DEFAULT 'standard',
  style_profile_id TEXT,
  story_json TEXT,
  story_input_json TEXT,
  subtitle_settings_json TEXT,
  audio_settings_json TEXT,
  voice_settings_json TEXT,
  video_asset_id TEXT,
  srt_asset_id TEXT,
  thumbnail_asset_id TEXT,
  duration_seconds REAL,
  error TEXT,
  episode_number INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'full',
  status TEXT NOT NULL DEFAULT 'queued',
  step TEXT NOT NULL DEFAULT 'analyze',
  progress INTEGER NOT NULL DEFAULT 0,
  steps_json TEXT NOT NULL,
  logs_json TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  params_json TEXT,
  output_asset_id TEXT,
  srt_asset_id TEXT,
  estimated_cost_usd REAL,
  actual_cost_usd REAL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS generation_cache (
  cache_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  meta_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cost_events (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,
  units REAL NOT NULL,
  unit_label TEXT,
  cost_usd REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 10000");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  ensureDefaultUser(db);
  return db;
}

export const DEFAULT_USER_ID = "user-local";

function ensureDefaultUser(database: Database.Database) {
  const row = database.prepare("SELECT id FROM users WHERE id = ?").get(DEFAULT_USER_ID);
  if (!row) {
    database
      .prepare("INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?)")
      .run(DEFAULT_USER_ID, "Kreator Lokal", null, new Date().toISOString());
  }
}

export function newId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${ts}${rnd}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
