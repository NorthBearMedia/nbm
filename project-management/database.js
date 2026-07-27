import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, readdirSync, unlinkSync, copyFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Use RAILWAY_VOLUME_MOUNT_PATH if available for persistent storage
const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
export const dbPath = process.env.DB_PATH || join(dataDir, 'nbm-projects.db');
console.log(`Database path: ${dbPath}`);
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── PRE-MIGRATION BACKUP ─────────────────────────────────────────────────────
// SYNCHRONOUS file copy BEFORE any schema changes run.
// This guarantees we always have a snapshot of the pre-migration state,
// because db.backup() is async and wouldn't finish before CREATE TABLE runs.
let preMigrationBackupPath = null;
try {
  if (existsSync(dbPath)) {
    const backupDir = join(dataDir, 'backups');
    mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(backupDir, `pre-migration-${ts}.db`);
    // Checkpoint WAL so the .db file has all data, then copy synchronously
    db.pragma('wal_checkpoint(TRUNCATE)');
    copyFileSync(dbPath, backupPath);
    preMigrationBackupPath = backupPath;
    console.log(`[DB] Pre-migration backup saved: ${backupPath}`);
    // Keep only last 10 pre-migration backups
    try {
      const preMigFiles = readdirSync(backupDir)
        .filter(f => f.startsWith('pre-migration-') && f.endsWith('.db'))
        .sort();
      while (preMigFiles.length > 10) {
        const old = preMigFiles.shift();
        try { unlinkSync(join(backupDir, old)); } catch {}
      }
    } catch {}
  }
} catch (err) {
  console.error('[DB] Pre-migration backup error:', err.message);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT DEFAULT '',
    logo_url TEXT DEFAULT '',
    agreement_type TEXT NOT NULL DEFAULT 'recurring' CHECK(agreement_type IN ('recurring', 'ad-hoc')),
    notes TEXT DEFAULT '',
    gmail_link TEXT DEFAULT '',
    drive_link TEXT DEFAULT '',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'on-hold', 'ready-to-invoice', 'invoiced')),
    notes TEXT DEFAULT '',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    assignee TEXT DEFAULT '',
    deadline TEXT DEFAULT '',
    planned_date TEXT DEFAULT '',
    estimated_hours REAL DEFAULT 0,
    progress TEXT NOT NULL DEFAULT 'not-started' CHECK(progress IN ('not-started', 'in-progress', 'completed', 'stuck', 'awaiting-client', 'awaiting-manager', 'ready-to-invoice', 'invoiced')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('critical', 'high', 'medium', 'low')),
    references_text TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    is_recurring INTEGER NOT NULL DEFAULT 0,
    recur_interval INTEGER DEFAULT 0,
    recur_unit TEXT DEFAULT '' CHECK(recur_unit IN ('', 'days', 'weeks', 'months', 'years')),
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS task_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_type TEXT DEFAULT '',
    file_size INTEGER DEFAULT 0,
    uploaded_by TEXT DEFAULT 'System',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT DEFAULT '',
    avatar_color TEXT DEFAULT '#6366f1'
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    author TEXT NOT NULL DEFAULT 'System',
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('client', 'project', 'task')),
    entity_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT 'System',
    details TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'editor' CHECK(role IN ('owner', 'editor', 'viewer')),
    avatar_url TEXT DEFAULT '',
    avatar_color TEXT DEFAULT '#8b5cf6',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// ─── SAFE MIGRATIONS ONLY ──────────────────────────────────────────────────────
// RULE: NEVER use DROP TABLE, CREATE TABLE ... AS SELECT, or table recreation.
//       These trigger ON DELETE CASCADE and WIPE referencing data.
//       Only use: ALTER TABLE ADD COLUMN, UPDATE, INSERT, CREATE INDEX.
//       If CHECK constraints need updating, leave old ones — they can't be altered
//       in SQLite without table recreation, so just validate in application code.
// ────────────────────────────────────────────────────────────────────────────────
try { db.exec('ALTER TABLE clients ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec("ALTER TABLE clients ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN password_salt TEXT DEFAULT ''"); } catch {}
try { db.exec('ALTER TABLE tasks ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec("ALTER TABLE tasks ADD COLUMN completed_at TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE tasks ADD COLUMN secondary_assignee TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE tasks ADD COLUMN client_id INTEGER DEFAULT NULL"); } catch {}

// ─── Client Control Board (Stage 1) — additive columns only, no CHECK constraints ──
// New enums are validated in application code; legacy progress/priority CHECK columns
// stay intact and are kept in sync as shadow values (see lib/taskmap.js).
try { db.exec("ALTER TABLE clients ADD COLUMN monthly_value REAL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE clients ADD COLUMN client_type TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE clients ADD COLUMN agreement_summary TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE clients ADD COLUMN recurring_deliverables TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE clients ADD COLUMN last_contact_date TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE clients ADD COLUMN next_scheduled_date TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE clients ADD COLUMN control_status TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE clients ADD COLUMN risk_level TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE clients ADD COLUMN important_contacts TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE clients ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE tasks ADD COLUMN task_status TEXT DEFAULT 'inbox'"); } catch {}
try { db.exec("ALTER TABLE tasks ADD COLUMN task_band TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE tasks ADD COLUMN task_type TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE tasks ADD COLUMN suggested_block TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN prefs TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'"); } catch {}

// Gmail OAuth tokens per user
db.exec(`CREATE TABLE IF NOT EXISTS gmail_tokens (
  user_id INTEGER PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expiry_date INTEGER NOT NULL,
  email TEXT DEFAULT '',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`);

// Xero OAuth tokens
db.exec(`CREATE TABLE IF NOT EXISTS xero_tokens (
  user_id INTEGER PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expiry_date INTEGER NOT NULL,
  tenant_id TEXT DEFAULT '',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`);

// WhatsApp Business API config (one row per phone number)
db.exec(`CREATE TABLE IF NOT EXISTS whatsapp_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  waba_id TEXT DEFAULT '',
  access_token TEXT NOT NULL,
  verify_token TEXT NOT NULL,
  enabled INTEGER DEFAULT 1
)`);

// WhatsApp messages
db.exec(`CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_id INTEGER NOT NULL,
  direction TEXT NOT NULL DEFAULT 'inbound',
  from_number TEXT DEFAULT '',
  to_number TEXT DEFAULT '',
  contact_name TEXT DEFAULT '',
  body TEXT DEFAULT '',
  timestamp TEXT DEFAULT (datetime('now')),
  wa_message_id TEXT DEFAULT '',
  read INTEGER DEFAULT 0,
  FOREIGN KEY (config_id) REFERENCES whatsapp_config(id) ON DELETE CASCADE
)`);

// Analytics config
db.exec(`CREATE TABLE IF NOT EXISTS analytics_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  ga_property_id TEXT DEFAULT '',
  enabled INTEGER DEFAULT 1
)`);

// Backfill client_id from projects for tasks that don't have it yet
try {
  const unfilled = db.prepare("SELECT count(*) as c FROM tasks WHERE client_id IS NULL AND project_id IS NOT NULL").get().c;
  if (unfilled > 0) {
    db.prepare("UPDATE tasks SET client_id = (SELECT client_id FROM projects WHERE projects.id = tasks.project_id) WHERE client_id IS NULL AND project_id IS NOT NULL").run();
    console.log(`[DB] Backfilled client_id for ${unfilled} tasks from projects`);
  }
  const orphans = db.prepare("SELECT count(*) as c FROM tasks WHERE client_id IS NULL").get().c;
  if (orphans > 0) {
    const firstClient = db.prepare("SELECT id FROM clients ORDER BY id LIMIT 1").get();
    if (firstClient) {
      db.prepare("UPDATE tasks SET client_id = ? WHERE client_id IS NULL").run(firstClient.id);
      console.log(`[DB] Assigned ${orphans} orphaned tasks to client #${firstClient.id}`);
    }
  }
} catch (err) {
  console.error('[DB] client_id backfill error:', err.message);
}

// Backfill completed_at from activity log for tasks completed before the column existed
try {
  const missing = db.prepare("SELECT id FROM tasks WHERE progress IN ('completed','invoiced') AND (completed_at IS NULL OR completed_at = '')").all();
  if (missing.length) {
    const update = db.prepare("UPDATE tasks SET completed_at = ? WHERE id = ?");
    for (const t of missing) {
      // Find when task was marked completed in activity log
      const log = db.prepare(
        "SELECT created_at FROM activity_log WHERE entity_type='task' AND entity_id=? AND action='updated' AND details LIKE '%completed%' ORDER BY created_at DESC LIMIT 1"
      ).get(t.id);
      if (log) {
        const dateStr = log.created_at.split('T')[0].split(' ')[0];
        update.run(dateStr, t.id);
      } else {
        // Fall back to task's planned_date or today
        const task = db.prepare("SELECT planned_date, deadline FROM tasks WHERE id = ?").get(t.id);
        const fallback = task?.planned_date || task?.deadline || new Date().toISOString().split('T')[0];
        update.run(fallback, t.id);
      }
    }
    console.log(`[DB] Backfilled completed_at for ${missing.length} tasks`);
  }
} catch (err) {
  console.error('[DB] completed_at backfill error:', err.message);
}

// In-app notifications (review requests/approvals). Additive, no FKs.
db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT DEFAULT '',
    task_id INTEGER,
    message TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
`);

// Indexes for the hot query paths (additive, idempotent — explicitly allowed
// by the migration rules). tasks.client_id is hit for every client on every
// /api/clients request; comments/attachments/activity_log are joined per task.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tasks_client ON tasks(client_id, archived);
  CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id);
  CREATE INDEX IF NOT EXISTS idx_attachments_task ON task_attachments(task_id);
  CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);
`);

// One-time migration flags
db.exec(`CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)`);

// ─── Client Control Board one-time backfill (Stage 1) ──────────────────────────
// Seeds the new task_status/task_band/task_type and client_type columns from the
// legacy progress/priority/agreement_type values. Runs exactly once (guarded).
try {
  const done = db.prepare("SELECT value FROM app_meta WHERE key='ccb_backfill_v1'").get();
  if (!done) {
    const report = { tasksBackfilled: 0, clientsBackfilled: 0, assignedToUnassigned: 0, unmapped: [] };

    // 1) Ensure the system "Unassigned" client exists (for clientless Inbox captures)
    let unassigned = db.prepare("SELECT id FROM clients WHERE is_system=1 ORDER BY id LIMIT 1").get();
    if (!unassigned) {
      const r = db.prepare(
        "INSERT INTO clients (name, code, agreement_type, client_type, is_system, sort_order) VALUES (?, 'UNA', 'ad-hoc', 'prospect', 1, 9999)"
      ).run('📥 Unassigned');
      unassigned = { id: r.lastInsertRowid };
      console.log(`[DB] Created system "Unassigned" client #${unassigned.id}`);
    }

    // 2) Backfill tasks: task_status / task_band / task_type from legacy columns
    const statusMap = {
      'in-progress': 'in-progress',
      'completed': 'done',
      'ready-to-invoice': 'done',
      'invoiced': 'done',
      'stuck': 'waiting-on-me',
      'awaiting-manager': 'waiting-on-me',
      'awaiting-client': 'waiting-on-client',
    };
    const bandMap = { 'critical': 'today', 'high': 'this-week', 'medium': 'scheduled', 'low': 'someday' };
    const tasks = db.prepare("SELECT id, progress, priority, deadline, planned_date, is_recurring FROM tasks").all();
    const upd = db.prepare("UPDATE tasks SET task_status=?, task_band=?, task_type=? WHERE id=?");
    for (const t of tasks) {
      let ns = statusMap[t.progress];
      if (!ns) {
        if (t.progress === 'not-started') ns = (t.planned_date || t.deadline) ? 'scheduled' : 'inbox';
        else { report.unmapped.push(t.id); ns = 'inbox'; }
      }
      const nb = bandMap[t.priority] || 'scheduled';
      const tt = t.is_recurring ? 'recurring' : 'ad-hoc';
      upd.run(ns, nb, tt, t.id);
      report.tasksBackfilled++;
    }

    // 3) Backfill clients: client_type from agreement_type (skip the system client)
    const clientsToFill = db.prepare("SELECT id, agreement_type FROM clients WHERE is_system=0").all();
    const cupd = db.prepare("UPDATE clients SET client_type=? WHERE id=? AND (client_type IS NULL OR client_type='')");
    for (const c of clientsToFill) {
      cupd.run(c.agreement_type === 'recurring' ? 'retainer' : 'ad-hoc', c.id);
      report.clientsBackfilled++;
    }

    // 4) Any tasks still without a client → system "Unassigned"
    const noClient = db.prepare("SELECT id FROM tasks WHERE client_id IS NULL").all();
    if (noClient.length) {
      const au = db.prepare("UPDATE tasks SET client_id=? WHERE id=?");
      for (const t of noClient) { au.run(unassigned.id, t.id); report.assignedToUnassigned++; }
    }

    db.prepare("INSERT INTO app_meta (key, value) VALUES ('ccb_backfill_v1', ?)").run(new Date().toISOString());

    console.log('[DB] ── Client Control Board backfill complete ──');
    console.log(`[DB]   pre-migration backup: ${preMigrationBackupPath || '(none — fresh DB, no prior data)'}`);
    console.log(`[DB]   tasks backfilled: ${report.tasksBackfilled}`);
    console.log(`[DB]   clients backfilled: ${report.clientsBackfilled}`);
    console.log(`[DB]   tasks assigned to "Unassigned": ${report.assignedToUnassigned}`);
    console.log(`[DB]   tasks with no clean status map (defaulted to inbox): ${report.unmapped.length}${report.unmapped.length ? ' — ids: ' + report.unmapped.join(',') : ''}`);
  }
} catch (err) {
  console.error('[DB] Client Control Board backfill error:', err.message);
}

// Checklists table
db.exec(`
  CREATE TABLE IF NOT EXISTS checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pinned_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('client', 'project', 'task')),
    entity_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, entity_type, entity_id)
  );
`);

// ─── April 2026 crisis-recovery code — RETIRED ───────────────────────────────
// Two blocks lived here: an auto-restore-from-backup (which could DELETE live
// tables and reinsert an old backup — or hard-coded seed data — whenever the
// task count looked low at boot) and a "fill missing tasks from activity log"
// rebuild. The second ran unconditionally on EVERY boot and resurrected
// deliberately deleted tasks as blank zombies after each deploy. Recovery is
// covered properly by the hourly + pre-migration backups and the owner-only
// restore route; automatic silent restores caused more risk than they removed.
console.log(`[DB] Tasks: ${db.prepare('SELECT count(*) as c FROM tasks').get().c}, Projects: ${db.prepare('SELECT count(*) as c FROM projects').get().c}`);

export default db;
