import { Router } from 'express';
import { readdirSync, copyFileSync, statSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';
import XLSX from 'xlsx';
import db from '../database.js';
import { requireAuth } from '../middleware.js';

const router = Router();

// ─── Health Check ─────────────────────────────────────
router.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    const counts = {
      clients: db.prepare('SELECT count(*) as c FROM clients').get().c,
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
  const tids = db.prepare('SELECT id FROM tasks WHERE client_id = ?').all(cid).map(t => t.id);

  const conds = [];
  const params = [];
  conds.push("(entity_type='client' AND entity_id=?)");
  params.push(cid);
  if (tids.length) { conds.push(`(entity_type='task' AND entity_id IN (${tids.map(() => '?').join(',')}))`); params.push(...tids); }
  params.push(limit);

  const logs = db.prepare(`SELECT * FROM activity_log WHERE (${conds.join(' OR ')}) AND action IN ('created','completed','updated','archived','restored','commented','deleted') ORDER BY created_at DESC LIMIT ?`).all(...params);

  const enriched = logs.map(l => {
    let entityName = '';
    if (l.entity_type === 'task') {
      const t = db.prepare('SELECT title FROM tasks WHERE id = ?').get(l.entity_id);
      entityName = t?.title || 'Deleted task';
    }
    return { ...l, entity_name: entityName };
  });

  res.json(enriched);
});

// ─── Export to Excel ─────────────────────────────────
router.get('/api/export/excel', requireAuth, (req, res) => {
  const isOwner = req.user.role === 'owner';
  const priv = isOwner ? '' : 'AND c.is_private = 0';

  const tasks = db.prepare(`
    SELECT t.id, t.title, t.assignee, t.secondary_assignee, t.deadline, t.planned_date,
           t.estimated_hours, t.progress, t.priority, t.notes, t.references_text,
           t.is_recurring, t.created_at,
           c.name as client_name, c.code as client_code, c.agreement_type
    FROM tasks t
    JOIN clients c ON t.client_id = c.id
    WHERE t.archived = 0 AND t.progress NOT IN ('completed', 'invoiced')
    ${priv}
    ORDER BY c.name, t.priority, t.deadline
  `).all();

  const clientRows = db.prepare(`
    SELECT c.id, c.name, c.code, c.agreement_type, c.notes, c.gmail_link, c.drive_link, c.created_at,
           (SELECT count(*) FROM tasks t WHERE t.client_id = c.id AND t.archived = 0 AND t.progress NOT IN ('completed','invoiced')) as active_tasks,
           (SELECT COALESCE(sum(t.estimated_hours), 0) FROM tasks t WHERE t.client_id = c.id AND t.archived = 0 AND t.progress NOT IN ('completed','invoiced')) as total_hours
    FROM clients c
    WHERE c.archived = 0 ${priv}
    ORDER BY c.name
  `).all();

  const wb = XLSX.utils.book_new();

  const taskRows = tasks.map(t => ({
    'Ref': 'NB' + String(t.id).padStart(3, '0'),
    'Client': t.client_name,
    'Client Code': t.client_code || '',
    'Task': t.title,
    'Assigned To': t.assignee || '',
    'Also Assigned': t.secondary_assignee || '',
    'Priority': t.priority,
    'Status': t.progress,
    'Deadline': t.deadline || '',
    'Planned Date': t.planned_date || '',
    'Est. Hours': t.estimated_hours || 0,
    'Notes': t.notes || '',
    'References': t.references_text || '',
    'Recurring': t.is_recurring ? 'Yes' : '',
    'Created': t.created_at ? t.created_at.split('T')[0].split(' ')[0] : '',
  }));
  const wsTask = XLSX.utils.json_to_sheet(taskRows);
  wsTask['!cols'] = Object.keys(taskRows[0] || {}).map(k => ({ wch: Math.max(k.length, 12) }));
  XLSX.utils.book_append_sheet(wb, wsTask, 'Tasks');

  const cRows = clientRows.map(c => ({
    'Client': c.name,
    'Code': c.code || '',
    'Type': c.agreement_type,
    'Active Tasks': c.active_tasks,
    'Total Hours (Active)': c.total_hours,
    'Notes': c.notes || '',
    'Gmail': c.gmail_link || '',
    'Drive': c.drive_link || '',
    'Created': c.created_at ? c.created_at.split('T')[0].split(' ')[0] : '',
  }));
  const wsCli = XLSX.utils.json_to_sheet(cRows);
  wsCli['!cols'] = Object.keys(cRows[0] || {}).map(k => ({ wch: Math.max(k.length, 12) }));
  XLSX.utils.book_append_sheet(wb, wsCli, 'Clients');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const ts = new Date().toISOString().split('T')[0];
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="NBM-Console-Export-${ts}.xlsx"`);
  res.send(Buffer.from(buf));
});

// ─── Backups (owner only) ─────────────────────────────
export function createBackupRoutes(backupDir, backupFn) {
  const r = Router();

  r.get('/api/backups', requireAuth, (req, res) => {
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
    try {
      const files = readdirSync(backupDir)
        .filter(f => f.endsWith('.db'))
        .sort().reverse()
        .map(f => {
          try {
            const s = statSync(join(backupDir, f));
            let taskCount = '?';
            try {
              const bdb = new Database(join(backupDir, f), { readonly: true });
              taskCount = bdb.prepare('SELECT count(*) as c FROM tasks').get().c;
              bdb.close();
            } catch {}
            const type = f.startsWith('pre-migration-') ? 'pre-migration' : 'hourly';
            return { file: f, size: s.size, modified: s.mtime, tasks: taskCount, type };
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

  r.get('/api/backups/download/:file', requireAuth, (req, res) => {
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
    const file = req.params.file;
    if (!file || !file.endsWith('.db') || file.includes('..') || file.includes('/')) {
      return res.status(400).json({ error: 'Invalid backup file' });
    }
    const backupPath = join(backupDir, file);
    try {
      statSync(backupPath);
    } catch {
      return res.status(404).json({ error: 'Backup file not found' });
    }
    res.download(backupPath, file);
  });

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
