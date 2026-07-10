import Database from 'better-sqlite3';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { config } from './config.js';

// A brand-new database file is normal on first install but alarming any
// time after — a detached Railway volume silently presents as a fresh
// install. Surfaced in the admin console via setup-status.
export const freshDatabase = !existsSync(config.dbPath);

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT NOT NULL,
    contact_name TEXT DEFAULT '',
    contact_emails TEXT NOT NULL DEFAULT '',
    domain TEXT NOT NULL DEFAULT '',
    ga4_property_id TEXT DEFAULT '',
    ga4_measurement_id TEXT DEFAULT '',
    gsc_site_url TEXT DEFAULT '',
    clarity_project_id TEXT DEFAULT '',
    clarity_api_token TEXT DEFAULT '',
    report_frequency TEXT NOT NULL DEFAULT 'monthly'
      CHECK(report_frequency IN ('weekly', 'monthly', 'quarterly', 'none')),
    next_report_at TEXT,
    dashboard_token TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS clarity_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL,
    snapshot_date TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(site_id, snapshot_date),
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    period_label TEXT NOT NULL DEFAULT '',
    pdf_path TEXT NOT NULL DEFAULT '',
    sent_to TEXT NOT NULL DEFAULT '',
    trigger_type TEXT NOT NULL DEFAULT 'scheduled'
      CHECK(trigger_type IN ('scheduled', 'requested', 'manual')),
    status TEXT NOT NULL DEFAULT 'sent'
      CHECK(status IN ('sent', 'failed')),
    error TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_snapshots_site_date ON clarity_snapshots(site_id, snapshot_date);
  CREATE INDEX IF NOT EXISTS idx_reports_site ON reports(site_id, created_at);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// ─── Lightweight idempotent migrations ───────────────────────────
function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
addColumnIfMissing('sites', 'fathom_site_id', "TEXT DEFAULT ''");
addColumnIfMissing('sites', 'target_keywords', "TEXT DEFAULT ''");
// Per-site Live holdback: 1 = reports for this site go only to the owner
// even when the global delivery mode is Live.
addColumnIfMissing('sites', 'delivery_hold', 'INTEGER NOT NULL DEFAULT 0');

export function newDashboardToken() {
  return randomBytes(24).toString('hex');
}

// Rolling online backups (safe under WAL via better-sqlite3's backup API):
// hourly copies into <dataDir>/backups, keeping the most recent 48. The
// single SQLite file holds every token, keyword and report record — this
// is the difference between a bad hour and a bad month.
const backupsDir = join(config.dataDir, 'backups');
export async function backupDatabase(prefix = 'hourly') {
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  await db.backup(join(backupsDir, `${prefix}-${stamp}.db`));
  const old = readdirSync(backupsDir).filter(f => f.startsWith(prefix + '-') && f.endsWith('.db')).sort();
  while (old.length > 48) unlinkSync(join(backupsDir, old.shift()));
  return true;
}

export function getSetting(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null;
}

export function setSetting(key, value) {
  db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .run(key, String(value ?? ''));
}

export default db;
