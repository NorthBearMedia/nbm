import Database from 'better-sqlite3';
import { randomBytes } from 'crypto';
import { config } from './config.js';

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
`);

export function newDashboardToken() {
  return randomBytes(24).toString('hex');
}

export default db;
