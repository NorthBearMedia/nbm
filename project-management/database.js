import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Use RAILWAY_VOLUME_MOUNT_PATH if available for persistent storage
const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
const dbPath = process.env.DB_PATH || join(dataDir, 'nbm-projects.db');
console.log(`Database path: ${dbPath}`);
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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

// Migrations — add columns if they don't exist
try { db.exec('ALTER TABLE clients ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec("ALTER TABLE clients ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN password_salt TEXT DEFAULT ''"); } catch {}
try { db.exec('ALTER TABLE tasks ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0'); } catch {}

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

// ─── Data Restoration ─────────────────────────────────────────────────────────
// If tasks were wiped by a bad migration, restore seed data
try {
  const taskCount = db.prepare('SELECT count(*) as c FROM tasks').get().c;
  const projectCount = db.prepare('SELECT count(*) as c FROM projects').get().c;
  console.log(`[DB] Tasks: ${taskCount}, Projects: ${projectCount}`);
  if (taskCount === 0 && projectCount > 0) {
    console.log('[DB] RESTORING tasks and comments lost during migration...');
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
    const restored = db.prepare('SELECT count(*) as c FROM tasks').get().c;
    console.log(`[DB] Restored ${restored} tasks and ${comments.length} comments.`);
  }
} catch (err) {
  console.error('[DB] Restoration error:', err.message);
}

export default db;
