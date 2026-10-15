/** Schemat bazy SQLite. Wykonywany przy starcie (idempotentnie). */
export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  params_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT,
  counters_json TEXT NOT NULL,
  date_from TEXT,
  date_to TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  name TEXT NOT NULL,
  app_url TEXT,
  announcement_url TEXT,
  source TEXT NOT NULL,
  external_id TEXT,
  published_at TEXT,
  discovered_at TEXT NOT NULL,
  host TEXT,
  dedup_key TEXT,
  status TEXT NOT NULL,
  reject_reason TEXT,
  class_origin TEXT NOT NULL,
  class_tool TEXT,
  class_confidence TEXT NOT NULL,
  class_language TEXT NOT NULL,
  classification_json TEXT NOT NULL,
  merged_from_json TEXT NOT NULL DEFAULT '[]',
  last_summary TEXT,
  last_checked_at TEXT,
  last_check_run_id TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_dedup ON projects(dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_source ON projects(source);
CREATE INDEX IF NOT EXISTS idx_projects_origin ON projects(class_origin);
CREATE INDEX IF NOT EXISTS idx_projects_host ON projects(host);

CREATE TABLE IF NOT EXISTS check_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  entry_url TEXT NOT NULL,
  resolved_ip TEXT,
  summary TEXT NOT NULL,
  budget_json TEXT NOT NULL,
  observations_json TEXT NOT NULL,
  error TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_checkruns_project ON check_runs(project_id);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  level TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  project_id TEXT,
  run_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

CREATE TABLE IF NOT EXISTS feeds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  item_limit INTEGER NOT NULL DEFAULT 25,
  status TEXT,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS exclusions (
  host TEXT PRIMARY KEY,
  added_at TEXT NOT NULL,
  note TEXT
);
`;
