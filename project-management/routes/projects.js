import { Router } from 'express';
import db from '../database.js';
import { requireAuth, requireRole, requireWrite } from '../middleware.js';
import { logActivity } from '../lib/activity.js';

const router = Router();

router.post('/', requireAuth, requireWrite, (req, res) => {
  const { client_id, name, notes } = req.body;
  if (!client_id || !name) return res.status(400).json({ error: 'client_id and name required' });
  const client = db.prepare('SELECT is_private FROM clients WHERE id = ?').get(client_id);
  if (client?.is_private && req.user.role !== 'owner') return res.status(403).json({ error: 'Access denied' });
  const result = db.prepare('INSERT INTO projects (client_id, name, notes) VALUES (?, ?, ?)').run(client_id, name, notes || '');
  logActivity('project', result.lastInsertRowid, 'created', req.user.display_name, `Created project "${name}"`);
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  p.tasks = []; p.archivedTasks = [];
  res.json(p);
});

router.put('/:id', requireAuth, requireWrite, (req, res) => {
  const { name, status, notes } = req.body;
  const old = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Project not found' });
  const client = db.prepare('SELECT is_private FROM clients WHERE id = ?').get(old.client_id);
  if (client?.is_private && req.user.role !== 'owner') return res.status(403).json({ error: 'Access denied' });

  db.prepare('UPDATE projects SET name=COALESCE(?,name), status=COALESCE(?,status), notes=COALESCE(?,notes) WHERE id=?')
    .run(name, status, notes, req.params.id);

  const changes = [];
  if (name && name !== old.name) changes.push(`name: "${old.name}" → "${name}"`);
  if (status && status !== old.status) changes.push(`status: ${old.status} → ${status}`);
  if (changes.length) logActivity('project', req.params.id, 'updated', req.user.display_name, changes.join(', '));

  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requireAuth, requireRole('owner'), (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  logActivity('project', req.params.id, 'deleted', req.user.display_name, `Permanently deleted "${project?.name}"`);
  res.json({ success: true });
});

router.put('/:id/archive', requireAuth, requireWrite, (req, res) => {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const client = db.prepare('SELECT is_private FROM clients WHERE id = ?').get(p.client_id);
  if (client?.is_private && req.user.role !== 'owner') return res.status(403).json({ error: 'Access denied' });
  const ns = p.archived ? 0 : 1;
  db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(ns, req.params.id);
  logActivity('project', req.params.id, ns ? 'archived' : 'restored', req.user.display_name, `${ns ? 'Archived' : 'Restored'} "${p.name}"`);
  res.json({ success: true, archived: ns });
});

export default router;
