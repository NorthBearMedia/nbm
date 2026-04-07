import { Router } from 'express';
import { readdirSync, copyFileSync, statSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';
import db from '../database.js';
import { requireAuth } from '../middleware.js';

const router = Router();

// ─── Health Check ─────────────────────────────────────
router.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    const counts = {
      clients: db.prepare('SELECT count(*) as c FROM clients').get().c,
      projects: db.prepare('SELECT count(*) as c FROM projects').get().c,
      tasks: db.prepare('SELECT count(*) as c FROM tasks').get().c,
    };
    res.json({ status: 'ok', timestamp: new Date().toISOString(), counts });
  } catch (err) {
    res.status(500).json({ status: 'error', error: 'Database unavailable' });
  }
});

// ─── Global History (owner only) ──────────────────────
router.get('/api/history', requireAuth, (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
  const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
  res.json(db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?').all(limit));
});

// ─── Archived Clients ─────────────────────────────────
router.get('/api/archived/clients', requireAuth, (req, res) => {
  const isOwner = req.user.role === 'owner';
  const priv = isOwner ? '' : 'AND is_private = 0';
  res.json(db.prepare(`SELECT * FROM clients WHERE archived = 1 ${priv} ORDER BY name`).all());
});

// ─── Team ─────────────────────────────────────────────
router.get('/api/team', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM team_members ORDER BY name').all());
});

router.post('/api/team', requireAuth, (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
  const { name, role, avatar_color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const r = db.prepare('INSERT INTO team_members (name, role, avatar_color) VALUES (?, ?, ?)').run(name, role || '', avatar_color || '#6366f1');
  res.json(db.prepare('SELECT * FROM team_members WHERE id = ?').get(r.lastInsertRowid));
});

router.delete('/api/team/:id', requireAuth, (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
  db.prepare('DELETE FROM team_members WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── Pins ────────────────────────────────────────────
router.get('/api/pins', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM pinned_items WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id));
});

router.post('/api/pins', requireAuth, (req, res) => {
  const { entity_type, entity_id } = req.body;
  if (!entity_type || !entity_id) return res.status(400).json({ error: 'entity_type and entity_id required' });
  try {
    db.prepare('INSERT INTO pinned_items (user_id, entity_type, entity_id) VALUES (?, ?, ?)').run(req.user.id, entity_type, entity_id);
  } catch { /* unique constraint — already pinned */ }
  res.json({ success: true });
});

router.delete('/api/pins/:type/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM pinned_items WHERE user_id = ? AND entity_type = ? AND entity_id = ?').run(req.user.id, req.params.type, req.params.id);
  res.json({ success: true });
});

// ─── Client Timeline ─────────────────────────────────
router.get('/api/clients/:id/timeline', requireAuth, (req, res) => {
  const cid = req.params.id;
  const client = db.prepare('SELECT is_private FROM clients WHERE id = ?').get(cid);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  if (client.is_private && req.user.role !== 'owner') return res.status(403).json({ error: 'Access denied' });

  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  // Get project IDs for this client
  const pids = db.prepare('SELECT id FROM projects WHERE client_id = ?').all(cid).map(p => p.id);
  if (!pids.length) return res.json([]);

  // Get task IDs
  const tids = db.prepare(`SELECT id FROM tasks WHERE project_id IN (${pids.map(() => '?').join(',')})`).all(...pids).map(t => t.id);

  // Build timeline from activity_log — filter to meaningful actions
  const conds = [];
  const params = [];
  conds.push("(entity_type='client' AND entity_id=?)");
  params.push(cid);
  if (pids.length) { conds.push(`(entity_type='project' AND entity_id IN (${pids.map(() => '?').join(',')}))`); params.push(...pids); }
  if (tids.length) { conds.push(`(entity_type='task' AND entity_id IN (${tids.map(() => '?').join(',')}))`); params.push(...tids); }
  params.push(limit);

  const logs = db.prepare(`SELECT * FROM activity_log WHERE (${conds.join(' OR ')}) AND action IN ('created','completed','updated','archived','restored','commented','deleted') ORDER BY created_at DESC LIMIT ?`).all(...params);

  // Enrich with entity names
  const enriched = logs.map(l => {
    let entityName = '';
    if (l.entity_type === 'task') {
      const t = db.prepare('SELECT title FROM tasks WHERE id = ?').get(l.entity_id);
      entityName = t?.title || 'Deleted task';
    } else if (l.entity_type === 'project') {
      const p = db.prepare('SELECT name FROM projects WHERE id = ?').get(l.entity_id);
      entityName = p?.name || 'Deleted project';
    }
    return { ...l, entity_name: entityName };
  });

  res.json(enriched);
});

// ─── Backups (owner only) ─────────────────────────────
export function createBackupRoutes(backupDir, backupFn) {
  const r = Router();

  r.get('/api/backups', requireAuth, (req, res) => {
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
    try {
      const files = readdirSync(backupDir)
        .filter(f => f.startsWith('nbm-projects-') && f.endsWith('.db'))
        .sort().reverse()
        .map(f => {
          try {
            const s = statSync(join(backupDir, f));
            // Peek inside to check task count
            let taskCount = '?';
            try {
              const bdb = new Database(join(backupDir, f), { readonly: true });
              taskCount = bdb.prepare('SELECT count(*) as c FROM tasks').get().c;
              bdb.close();
            } catch {}
            return { file: f, size: s.size, modified: s.mtime, tasks: taskCount };
          } catch { return { file: f }; }
        });
      res.json(files);
    } catch { res.json([]); }
  });

  r.post('/api/backups', requireAuth, (req, res) => {
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
    backupFn();
    res.json({ success: true, message: 'Backup started' });
  });

  // Restore tasks, projects, comments etc from a backup file
  r.post('/api/backups/restore', requireAuth, (req, res) => {
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
    const { file } = req.body;
    if (!file || !file.endsWith('.db')) return res.status(400).json({ error: 'Invalid backup file' });
    const backupPath = join(backupDir, file);
    try {
      statSync(backupPath);
    } catch {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    try {
      const bdb = new Database(backupPath, { readonly: true });
      const tables = ['clients', 'projects', 'tasks', 'comments', 'task_attachments', 'checklist_items', 'team_members', 'activity_log'];
      const counts = {};

      db.pragma('foreign_keys = OFF');
      db.transaction(() => {
        for (const table of tables) {
          try {
            const rows = bdb.prepare(`SELECT * FROM ${table}`).all();
            if (!rows.length) continue;
            // Clear current data and restore from backup
            db.prepare(`DELETE FROM ${table}`).run();
            const cols = Object.keys(rows[0]);
            const placeholders = cols.map(() => '?').join(',');
            const ins = db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`);
            for (const row of rows) ins.run(...cols.map(c => row[c]));
            counts[table] = rows.length;
          } catch (e) {
            counts[table] = `error: ${e.message}`;
          }
        }
      })();
      db.pragma('foreign_keys = ON');
      bdb.close();

      console.log('[DB] Restored from backup:', file, counts);
      res.json({ success: true, restored: counts });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return r;
}

export default router;
