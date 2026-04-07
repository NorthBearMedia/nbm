import { Router } from 'express';
import db from '../database.js';
import { requireAuth, requireRole, requireWrite, logoUpload } from '../middleware.js';
import { logActivity } from '../lib/activity.js';

const router = Router();

// Helper: load client and block non-owners from private clients
function requireClientAccess(req, res) {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) { res.status(404).json({ error: 'Client not found' }); return null; }
  if (client.is_private && req.user.role !== 'owner') { res.status(403).json({ error: 'Access denied' }); return null; }
  return client;
}

router.get('/', requireAuth, (req, res) => {
  const { filter, include_archived } = req.query;
  const arc = include_archived === '1' ? '' : 'AND archived = 0';
  const isOwner = req.user.role === 'owner';
  const privateFilter = isOwner ? '' : 'AND is_private = 0';

  let clients;
  if (filter && ['recurring', 'ad-hoc'].includes(filter)) {
    clients = db.prepare(`SELECT * FROM clients WHERE agreement_type = ? ${arc} ${privateFilter} ORDER BY sort_order, name`).all(filter);
  } else {
    clients = db.prepare(`SELECT * FROM clients WHERE 1=1 ${arc} ${privateFilter} ORDER BY sort_order, name`).all();
  }

  const projectsStmt = db.prepare('SELECT * FROM projects WHERE client_id = ? AND archived = 0 ORDER BY sort_order, name');
  const archivedProjectsStmt = db.prepare('SELECT * FROM projects WHERE client_id = ? AND archived = 1 ORDER BY sort_order, name');
  const tasksStmt = db.prepare('SELECT * FROM tasks WHERE project_id = ? AND archived = 0 ORDER BY sort_order, created_at');
  const archivedTasksStmt = db.prepare('SELECT * FROM tasks WHERE project_id = ? AND archived = 1 ORDER BY sort_order, created_at');
  const commentsStmt = db.prepare('SELECT * FROM comments WHERE task_id = ? ORDER BY created_at DESC');
  const attachStmt = db.prepare('SELECT * FROM task_attachments WHERE task_id = ? ORDER BY created_at DESC');

  const now = new Date().toISOString().split('T')[0];
  const doneStatuses = ['completed', 'invoiced'];

  for (const client of clients) {
    client.projects = projectsStmt.all(client.id);
    client.archivedProjects = archivedProjectsStmt.all(client.id);
    let totalTasks = 0, completedTasks = 0, overdueTasks = 0, inProgressTasks = 0, blockedTasks = 0, awaitingManager = 0;

    for (const project of [...client.projects, ...client.archivedProjects]) {
      project.tasks = tasksStmt.all(project.id);
      project.archivedTasks = archivedTasksStmt.all(project.id);
      for (const task of [...project.tasks, ...project.archivedTasks]) {
        task.comments = commentsStmt.all(task.id);
        task.attachments = attachStmt.all(task.id);
      }
      if (!project.archived) {
        for (const task of project.tasks) {
          totalTasks++;
          if (doneStatuses.includes(task.progress)) completedTasks++;
          if (task.progress === 'in-progress') inProgressTasks++;
          if (task.progress === 'stuck') blockedTasks++;
          if (task.progress === 'awaiting-manager') awaitingManager++;
          if (task.deadline && task.deadline < now && !doneStatuses.includes(task.progress)) overdueTasks++;
        }
      }
    }
    client.stats = { totalTasks, completedTasks, overdueTasks, inProgressTasks, blockedTasks, awaitingManager, outstandingTasks: totalTasks - completedTasks };
  }
  res.json(clients);
});

router.post('/', requireAuth, requireWrite, (req, res) => {
  const { name, code, agreement_type, notes, gmail_link, drive_link, is_private } = req.body;
  if (!name) return res.status(400).json({ error: 'Client name is required' });
  if (code && code.length !== 3) return res.status(400).json({ error: 'Client code must be exactly 3 characters' });
  if (is_private && req.user.role !== 'owner') return res.status(403).json({ error: 'Only owners can create private clients' });

  const autoCode = name.split(' ').map(w => w[0]).join('').substring(0, 3).toUpperCase().padEnd(3, 'X');
  const clientCode = code || autoCode;
  const result = db.prepare('INSERT INTO clients (name, code, agreement_type, notes, gmail_link, drive_link, is_private) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    name, clientCode, agreement_type || 'recurring', notes || '', gmail_link || '', drive_link || '', is_private ? 1 : 0
  );
  logActivity('client', result.lastInsertRowid, 'created', req.user.display_name, `Created client "${name}"`);
  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid));
});

// Must be before /:id routes
router.put('/reorder', requireAuth, requireWrite, (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });
  const stmt = db.prepare('UPDATE clients SET sort_order = ? WHERE id = ?');
  db.transaction((ids) => { ids.forEach((id, i) => stmt.run(i, id)); })(order);
  res.json({ success: true });
});

router.put('/:id', requireAuth, requireWrite, (req, res) => {
  const { name, code, agreement_type, notes, logo_url, gmail_link, drive_link, is_private } = req.body;
  const old = requireClientAccess(req, res);
  if (!old) return;
  if (is_private && req.user.role !== 'owner') return res.status(403).json({ error: 'Only owners can make clients private' });

  db.prepare('UPDATE clients SET name=COALESCE(?,name), code=COALESCE(?,code), agreement_type=COALESCE(?,agreement_type), notes=COALESCE(?,notes), logo_url=COALESCE(?,logo_url), gmail_link=COALESCE(?,gmail_link), drive_link=COALESCE(?,drive_link), is_private=COALESCE(?,is_private) WHERE id=?')
    .run(name, code, agreement_type, notes, logo_url, gmail_link, drive_link, is_private !== undefined ? (is_private ? 1 : 0) : null, req.params.id);

  const changes = [];
  if (name && name !== old.name) changes.push(`name: "${old.name}" → "${name}"`);
  if (code !== undefined && code !== old.code) changes.push(`code: "${old.code}" → "${code}"`);
  if (agreement_type && agreement_type !== old.agreement_type) changes.push(`type: ${old.agreement_type} → ${agreement_type}`);
  if (notes !== undefined && notes !== old.notes) changes.push('updated notes');
  if (changes.length) logActivity('client', req.params.id, 'updated', req.user.display_name, changes.join(', '));

  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requireAuth, requireRole('owner'), (req, res) => {
  const client = db.prepare('SELECT name FROM clients WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  logActivity('client', req.params.id, 'deleted', req.user.display_name, `Permanently deleted "${client?.name}"`);
  res.json({ success: true });
});

router.put('/:id/archive', requireAuth, requireWrite, (req, res) => {
  const c = requireClientAccess(req, res);
  if (!c) return;
  const ns = c.archived ? 0 : 1;
  db.prepare('UPDATE clients SET archived = ? WHERE id = ?').run(ns, req.params.id);
  logActivity('client', req.params.id, ns ? 'archived' : 'restored', req.user.display_name, `${ns ? 'Archived' : 'Restored'} "${c.name}"`);
  res.json({ success: true, archived: ns });
});

router.post('/:id/logo', requireAuth, requireWrite, (req, res, next) => {
  if (!requireClientAccess(req, res)) return;
  next();
}, logoUpload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE clients SET logo_url = ? WHERE id = ?').run(url, req.params.id);
  res.json({ logo_url: url });
});

router.get('/:id/history', requireAuth, (req, res) => {
  const cid = req.params.id;
  const client = db.prepare('SELECT is_private FROM clients WHERE id = ?').get(cid);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  if (client.is_private && req.user.role !== 'owner') return res.status(403).json({ error: 'Access denied' });
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const pids = db.prepare('SELECT id FROM projects WHERE client_id = ?').all(cid).map(p => p.id);
  let tids = [];
  if (pids.length > 0) {
    tids = db.prepare(`SELECT id FROM tasks WHERE project_id IN (${pids.map(() => '?').join(',')})`).all(...pids).map(t => t.id);
  }
  const conds = ["(entity_type='client' AND entity_id=?)"];
  const params = [cid];
  if (pids.length) { conds.push(`(entity_type='project' AND entity_id IN (${pids.map(() => '?').join(',')}))`); params.push(...pids); }
  if (tids.length) { conds.push(`(entity_type='task' AND entity_id IN (${tids.map(() => '?').join(',')}))`); params.push(...tids); }
  params.push(limit);
  res.json(db.prepare(`SELECT * FROM activity_log WHERE ${conds.join(' OR ')} ORDER BY created_at DESC LIMIT ?`).all(...params));
});

export default router;
