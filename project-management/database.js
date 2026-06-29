import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, readdirSync, unlinkSync, copyFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Use RAILWAY_VOLUME_MOUNT_PATH if available for persistent storage
const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
const dbPath = process.env.DB_PATH || join(dataDir, 'nbm-projects.db');
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

// ─── Auto-Restore from Backup ─────────────────────────────────────────────────
// If tasks were wiped by migration bug, restore EVERYTHING from the best backup

try {
  const taskCount = db.prepare('SELECT count(*) as c FROM tasks').get().c;
  const projectCount = db.prepare('SELECT count(*) as c FROM projects').get().c;
  console.log(`[DB] Tasks: ${taskCount}, Projects: ${projectCount}`);

  if (taskCount < 5 && projectCount > 0) {
    console.log('[DB] Task count too low — searching backups for restoration...');
    const backupDir = join(dataDir, 'backups');
    let bestBackup = null;
    let bestTasks = 0;

    try {
      const files = readdirSync(backupDir)
        .filter(f => f.startsWith('nbm-projects-') && f.endsWith('.db'))
        .sort().reverse();

      for (const f of files) {
        try {
          const bdb = new Database(join(backupDir, f), { readonly: true });
          const tc = bdb.prepare('SELECT count(*) as c FROM tasks').get().c;
          bdb.close();
          console.log(`[DB] Backup ${f}: ${tc} tasks`);
          if (tc > bestTasks) { bestTasks = tc; bestBackup = f; }
        } catch (e) { console.log(`[DB] Backup ${f}: unreadable (${e.message})`); }
      }
    } catch (e) { console.log('[DB] No backup directory found:', e.message); }

    if (bestBackup && bestTasks > taskCount) {
      console.log(`[DB] RESTORING from backup: ${bestBackup} (${bestTasks} tasks)`);
      const bdb = new Database(join(backupDir, bestBackup), { readonly: true });
      const tables = ['clients', 'projects', 'tasks', 'comments', 'task_attachments', 'checklist_items', 'team_members'];

      db.pragma('foreign_keys = OFF');
      db.transaction(() => {
        for (const table of tables) {
          try {
            const rows = bdb.prepare(`SELECT * FROM ${table}`).all();
            if (!rows.length) continue;
            db.prepare(`DELETE FROM ${table}`).run();
            const cols = Object.keys(rows[0]);
            const placeholders = cols.map(() => '?').join(',');
            const ins = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`);
            for (const row of rows) ins.run(...cols.map(c => row[c]));
            console.log(`[DB] Restored ${table}: ${rows.length} rows`);
          } catch (e) { console.log(`[DB] Error restoring ${table}: ${e.message}`); }
        }
      })();
      db.pragma('foreign_keys = ON');
      bdb.close();

      const newCount = db.prepare('SELECT count(*) as c FROM tasks').get().c;
      console.log(`[DB] Restoration complete. Tasks now: ${newCount}`);
    } else {
      console.log('[DB] No suitable backup found, falling back to seed data...');
      // Fallback: insert seed data
      const insertTask = db.prepare('INSERT OR IGNORE INTO tasks (id, project_id, title, assignee, deadline, planned_date, estimated_hours, progress, priority, is_recurring, recur_interval, recur_unit, archived, sort_order, is_pinned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const insertComment = db.prepare('INSERT OR IGNORE INTO comments (id, task_id, author, content) VALUES (?, ?, ?, ?)');
      const tasks = [
        [1,1,"Set up project management system","Norton","2026-04-06","2026-04-06",2,"completed","high",0,0,"",0,0,0],
        [2,1,"Quarterly strategy review","Norton","2026-04-30","2026-04-06",3,"not-started","high",0,0,"",0,0,0],
        [3,1,"Update company portfolio","James","2026-04-15","2026-04-06",4,"in-progress","medium",0,0,"",0,0,0],
        [4,2,"Monthly content calendar","Lucy","2026-04-07","2026-04-06",2,"in-progress","high",1,1,"months",0,0,0],
        [5,2,"Record behind-the-scenes reels","Sarah","2026-04-12","2026-04-07",3,"not-started","medium",0,0,"",0,0,0],
        [6,3,"April social content batch","Lucy","2026-04-10","2026-04-06",5,"in-progress","high",0,0,"",0,0,0],
        [7,3,"Product photography shoot","James","2026-04-14","2026-04-07",6,"not-started","medium",0,0,"",0,0,0],
        [8,3,"Facebook ad campaign — Spring","Lucy","2026-04-08","2026-04-06",2,"awaiting-client","high",0,0,"",0,0,0],
        [9,3,"Monthly performance report","Sarah","2026-04-05","",1,"completed","medium",1,1,"months",0,0,0],
        [10,4,"Add new product pages","Norton","2026-04-20","2026-04-07",4,"not-started","medium",0,0,"",0,0,0],
        [11,5,"Fine-tune moderation threshold","Norton","2026-04-10","2026-04-06",3,"in-progress","critical",0,0,"",0,0,0],
        [12,5,"Add Spotted Darlington","Norton","2026-04-15","",2,"awaiting-manager","medium",0,0,"",0,0,0],
        [13,5,"Weekly moderation report","Sarah","2026-04-07","2026-04-06",1,"not-started","high",1,1,"weeks",0,0,0],
        [14,6,"Menu design — first draft","James","2026-04-12","2026-04-06",6,"in-progress","high",0,0,"",0,0,0],
        [15,6,"Food photography session","James","2026-04-18","",4,"not-started","medium",0,0,"",0,0,0],
        [16,6,"Social media launch pack","Lucy","2026-04-22","",5,"not-started","medium",0,0,"",0,0,0],
        [17,6,"Client sign-off meeting","Norton","2026-04-25","",1,"not-started","low",0,0,"",0,0,0],
        [18,7,"April — before/after gallery","Lucy","2026-04-09","2026-04-06",3,"in-progress","high",0,0,"",0,0,0],
        [19,7,"Drone footage — new build","Norton","2026-04-16","",4,"not-started","medium",0,0,"",0,0,0],
        [20,7,"Google review campaign","Sarah","2026-04-11","2026-04-06",2,"stuck","high",0,0,"",0,0,0],
      ];
      const comments = [
        [1,1,"Norton","System is live. Moving to completed."],
        [2,3,"James","Started layouts, first draft by Wednesday."],
        [3,6,"Lucy","Got 8 of 12 done, rest tomorrow."],
        [4,20,"Sarah","Chased twice — still waiting."],
        [5,20,"Norton","Will call Monday if no response."],
      ];
      db.transaction(() => {
        for (const t of tasks) insertTask.run(...t);
        for (const c of comments) insertComment.run(...c);
      })();
      console.log(`[DB] Seed fallback: inserted ${tasks.length} tasks`);
    }
  }
} catch (err) {
  console.error('[DB] Restoration error:', err.message, err.stack);
}

// ─── Fill missing tasks from activity log ─────────────────────────────────────
// The activity_log survived the cascade. Reconstruct any tasks that exist in the
// log but not in the tasks table.
try {
  const createdTasks = db.prepare(
    "SELECT * FROM activity_log WHERE entity_type='task' AND action='created' ORDER BY created_at ASC"
  ).all();
  const createdProjects = db.prepare(
    "SELECT * FROM activity_log WHERE entity_type='project' AND action='created' ORDER BY created_at ASC"
  ).all();

  let recovered = 0;
  for (const entry of createdTasks) {
    const exists = db.prepare('SELECT id FROM tasks WHERE id = ?').get(entry.entity_id);
    if (exists) continue;

    // Extract title from details like: Created task "Some Title"
    const titleMatch = entry.details.match(/Created task "(.+)"/);
    if (!titleMatch) continue;
    const title = titleMatch[1];

    // Find the most recent project creation event before this task
    let projectId = null;
    for (let i = createdProjects.length - 1; i >= 0; i--) {
      if (createdProjects[i].created_at <= entry.created_at) {
        // Check this project actually exists
        const proj = db.prepare('SELECT id FROM projects WHERE id = ?').get(createdProjects[i].entity_id);
        if (proj) { projectId = proj.id; break; }
      }
    }

    if (!projectId) {
      // Fallback: use the first active project
      const fallback = db.prepare('SELECT id FROM projects WHERE archived=0 ORDER BY id LIMIT 1').get();
      if (fallback) projectId = fallback.id;
    }

    if (projectId) {
      try {
        db.prepare(
          'INSERT OR IGNORE INTO tasks (id, project_id, title, assignee, progress, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(entry.entity_id, projectId, title, entry.author, 'not-started', 'medium', entry.created_at);
        recovered++;
        console.log(`[DB] Recovered task #${entry.entity_id}: "${title}" -> project ${projectId}`);
      } catch (e) { console.log(`[DB] Could not recover task #${entry.entity_id}: ${e.message}`); }
    }
  }

  // Also replay status updates from activity log for recovered tasks
  if (recovered > 0) {
    const updates = db.prepare(
      "SELECT * FROM activity_log WHERE entity_type='task' AND action='updated' AND details LIKE 'progress:%' ORDER BY created_at ASC"
    ).all();
    for (const u of updates) {
      const progressMatch = u.details.match(/progress: \S+ → (\S+)/);
      if (progressMatch) {
        try {
          db.prepare('UPDATE tasks SET progress = ? WHERE id = ?').run(progressMatch[1], u.entity_id);
        } catch {}
      }
    }
    console.log(`[DB] Recovered ${recovered} missing tasks from activity log`);
  }

  const finalCount = db.prepare('SELECT count(*) as c FROM tasks').get().c;
  console.log(`[DB] Final task count: ${finalCount}`);
} catch (err) {
  console.error('[DB] Activity log recovery error:', err.message);
}

export default db;
