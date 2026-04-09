import { Router } from 'express';
import db from '../database.js';
import { requireAuth, requireRole, requireWrite, attachUpload } from '../middleware.js';
import { logActivity } from '../lib/activity.js';

const router = Router();

// ─── Task CRUD ────────────────────────────────────────

// Helper: check if a project's parent client is private and user is not owner
function checkPrivateClient(req, res, projectId) {
  const row = db.prepare('SELECT c.is_private FROM projects p JOIN clients c ON p.client_id = c.id WHERE p.id = ?').get(projectId);
  if (row?.is_private && req.user.role !== 'owner') {
    res.status(403).json({ error: 'Access denied' });
    return false;
  }
  return true;
}

router.post('/', requireAuth, requireWrite, (req, res) => {
  const { project_id, title, assignee, secondary_assignee, deadline, planned_date, estimated_hours, priority, references_text, notes, is_recurring, recur_interval, recur_unit } = req.body;
  if (!project_id || !title) return res.status(400).json({ error: 'project_id and title required' });
  if (!checkPrivateClient(req, res, project_id)) return;

  const result = db.prepare(
    'INSERT INTO tasks (project_id, title, assignee, secondary_assignee, deadline, planned_date, estimated_hours, priority, references_text, notes, is_recurring, recur_interval, recur_unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(project_id, title, assignee || '', secondary_assignee || '', deadline || '', planned_date || '', estimated_hours || 0, priority || 'medium', references_text || '', notes || '', is_recurring ? 1 : 0, recur_interval || 0, recur_unit || '');

  logActivity('task', result.lastInsertRowid, 'created', req.user.display_name, `Created task "${title}"`);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  task.comments = []; task.attachments = [];
  res.json(task);
});

router.put('/:id', requireAuth, requireWrite, (req, res) => {
  let { title, assignee, secondary_assignee, deadline, planned_date, estimated_hours, progress, priority, references_text, notes, is_recurring, recur_interval, recur_unit } = req.body;
  const old = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Task not found' });
  if (!checkPrivateClient(req, res, old.project_id)) return;

  // Set completed_at when task is marked completed/invoiced, clear it if moved back
  let completedAt = undefined;
  if (progress && (progress === 'completed' || progress === 'invoiced') && old.progress !== 'completed' && old.progress !== 'invoiced') {
    completedAt = new Date().toISOString().split('T')[0];
  } else if (progress && progress !== 'completed' && progress !== 'invoiced' && (old.progress === 'completed' || old.progress === 'invoiced')) {
    completedAt = '';
  }

  // Manager sign-off: when set to awaiting-manager, auto-tag the owner
  if (progress === 'awaiting-manager' && old.progress !== 'awaiting-manager') {
    const owner = db.prepare("SELECT display_name FROM users WHERE role='owner' LIMIT 1").get();
    if (owner && secondary_assignee === undefined) {
      secondary_assignee = owner.display_name;
    }
  }
  // Clear secondary when manager signs off (moves away from awaiting-manager)
  if (progress && progress !== 'awaiting-manager' && old.progress === 'awaiting-manager' && secondary_assignee === undefined) {
    // Only clear if the secondary was auto-set (is the owner)
    const owner = db.prepare("SELECT display_name FROM users WHERE role='owner' LIMIT 1").get();
    if (owner && old.secondary_assignee === owner.display_name) {
      secondary_assignee = '';
    }
  }

  db.prepare(
    'UPDATE tasks SET title=COALESCE(?,title), assignee=COALESCE(?,assignee), secondary_assignee=COALESCE(?,secondary_assignee), deadline=COALESCE(?,deadline), planned_date=COALESCE(?,planned_date), estimated_hours=COALESCE(?,estimated_hours), progress=COALESCE(?,progress), priority=COALESCE(?,priority), references_text=COALESCE(?,references_text), notes=COALESCE(?,notes), is_recurring=COALESCE(?,is_recurring), recur_interval=COALESCE(?,recur_interval), recur_unit=COALESCE(?,recur_unit), completed_at=COALESCE(?,completed_at) WHERE id=?'
  ).run(title, assignee, secondary_assignee, deadline, planned_date, estimated_hours, progress, priority, references_text, notes, is_recurring !== undefined ? (is_recurring ? 1 : 0) : null, recur_interval, recur_unit, completedAt, req.params.id);

  const changes = [];
  if (title && title !== old.title) changes.push('title changed');
  if (assignee !== undefined && assignee !== old.assignee) changes.push(`assignee: "${old.assignee || 'none'}" → "${assignee || 'none'}"`);
  if (secondary_assignee !== undefined && secondary_assignee !== old.secondary_assignee) changes.push(`also assigned: "${secondary_assignee || 'none'}"`);
  if (progress && progress !== old.progress) changes.push(`progress: ${old.progress} → ${progress}`);
  if (priority && priority !== old.priority) changes.push(`priority: ${old.priority} → ${priority}`);
  if (deadline !== undefined && deadline !== old.deadline) changes.push('deadline changed');
  if (changes.length) logActivity('task', req.params.id, 'updated', req.user.display_name, changes.join(', '));

  // Recurring: if completed and is recurring, create next occurrence
  if (progress === 'completed' && old.progress !== 'completed' && old.is_recurring && old.recur_interval > 0) {
    const nextDate = calculateNextDate(old.deadline || old.planned_date || new Date().toISOString().split('T')[0], old.recur_interval, old.recur_unit);
    const newTask = db.prepare(
      'INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, priority, references_text, notes, is_recurring, recur_interval, recur_unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(old.project_id, old.title, old.assignee, nextDate, nextDate, old.estimated_hours, old.priority, old.references_text, old.notes, 1, old.recur_interval, old.recur_unit);
    logActivity('task', newTask.lastInsertRowid, 'created', 'System', `Auto-created recurring task "${old.title}" (next: ${nextDate})`);
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  task.comments = db.prepare('SELECT * FROM comments WHERE task_id = ? ORDER BY created_at DESC').all(task.id);
  task.attachments = db.prepare('SELECT * FROM task_attachments WHERE task_id = ? ORDER BY created_at DESC').all(task.id);
  res.json(task);
});

function calculateNextDate(fromDate, interval, unit) {
  const d = new Date(fromDate + 'T00:00:00');
  switch (unit) {
    case 'days': d.setDate(d.getDate() + interval); break;
    case 'weeks': d.setDate(d.getDate() + interval * 7); break;
    case 'months': d.setMonth(d.getMonth() + interval); break;
    case 'years': d.setFullYear(d.getFullYear() + interval); break;
  }
  return d.toISOString().split('T')[0];
}

// ─── Batch Move Tasks ────────────────────────────────
router.post('/batch-move', requireAuth, requireWrite, (req, res) => {
  const { task_ids, target_project_id } = req.body;
  if (!Array.isArray(task_ids) || !task_ids.length || !target_project_id) {
    return res.status(400).json({ error: 'task_ids array and target_project_id required' });
  }
  // Verify target project exists and check privacy
  const targetProj = db.prepare('SELECT p.*, c.name as client_name FROM projects p JOIN clients c ON p.client_id = c.id WHERE p.id = ?').get(target_project_id);
  if (!targetProj) return res.status(404).json({ error: 'Target project not found' });
  if (!checkPrivateClient(req, res, target_project_id)) return;

  const update = db.prepare('UPDATE tasks SET project_id = ? WHERE id = ?');
  const moved = [];
  db.transaction(() => {
    for (const id of task_ids) {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      if (!task) continue;
      update.run(target_project_id, id);
      moved.push(task.title);
      logActivity('task', id, 'updated', req.user.display_name, `Moved to "${targetProj.name}" (${targetProj.client_name})`);
    }
  })();

  res.json({ success: true, moved: moved.length });
});

router.delete('/:id', requireAuth, requireRole('owner'), (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  logActivity('task', req.params.id, 'deleted', req.user.display_name, `Permanently deleted "${task?.title}"`);
  res.json({ success: true });
});

router.put('/:id/archive', requireAuth, requireWrite, (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found' });
  if (!checkPrivateClient(req, res, t.project_id)) return;
  const ns = t.archived ? 0 : 1;
  db.prepare('UPDATE tasks SET archived = ? WHERE id = ?').run(ns, req.params.id);
  logActivity('task', req.params.id, ns ? 'archived' : 'restored', req.user.display_name, `${ns ? 'Archived' : 'Restored'} "${t.title}"`);
  res.json({ success: true, archived: ns });
});

// ─── Attachments ──────────────────────────────────────

router.post('/:id/attachments', requireAuth, requireWrite, (req, res, next) => {
  const t = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found' });
  if (!checkPrivateClient(req, res, t.project_id)) return;
  next();
}, attachUpload.array('files', 10), (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files' });
  const stmt = db.prepare('INSERT INTO task_attachments (task_id, filename, original_name, file_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)');
  const results = [];
  for (const file of req.files) {
    const r = stmt.run(req.params.id, file.filename, file.originalname, file.mimetype, file.size, req.user.display_name);
    results.push(db.prepare('SELECT * FROM task_attachments WHERE id = ?').get(r.lastInsertRowid));
  }
  logActivity('task', req.params.id, 'updated', req.user.display_name, `Uploaded ${req.files.length} file(s)`);
  res.json(results);
});

// Mounted at /api/attachments/:id via server.js
export function deleteAttachmentHandler(req, res) {
  const row = db.prepare(
    'SELECT c.is_private FROM task_attachments a JOIN tasks t ON a.task_id = t.id JOIN projects p ON t.project_id = p.id JOIN clients c ON p.client_id = c.id WHERE a.id = ?'
  ).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Attachment not found' });
  if (row.is_private && req.user.role !== 'owner') return res.status(403).json({ error: 'Access denied' });
  db.prepare('DELETE FROM task_attachments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
}

// ─── Comments ─────────────────────────────────────────

router.post('/:id/comments', requireAuth, requireWrite, (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });
  const t = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found' });
  if (!checkPrivateClient(req, res, t.project_id)) return;
  // Author derived from authenticated session, not client
  const author = req.user.display_name;
  const r = db.prepare('INSERT INTO comments (task_id, author, content) VALUES (?, ?, ?)').run(req.params.id, author, content);
  logActivity('task', req.params.id, 'commented', author, content.substring(0, 100));
  res.json(db.prepare('SELECT * FROM comments WHERE id = ?').get(r.lastInsertRowid));
});

// ─── Checklists ──────────────────────────────────────

router.get('/:id/checklist', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM checklist_items WHERE task_id = ? ORDER BY sort_order, id').all(req.params.id));
});

router.post('/:id/checklist', requireAuth, requireWrite, (req, res) => {
  const { label } = req.body;
  if (!label) return res.status(400).json({ error: 'Label required' });
  const t = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found' });
  if (!checkPrivateClient(req, res, t.project_id)) return;
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM checklist_items WHERE task_id = ?').get(req.params.id)?.m || 0;
  const r = db.prepare('INSERT INTO checklist_items (task_id, label, sort_order) VALUES (?, ?, ?)').run(req.params.id, label, maxOrder + 1);
  res.json(db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(r.lastInsertRowid));
});

router.put('/:id/checklist/:itemId', requireAuth, requireWrite, (req, res) => {
  const { checked, label } = req.body;
  const item = db.prepare('SELECT * FROM checklist_items WHERE id = ? AND task_id = ?').get(req.params.itemId, req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (checked !== undefined) db.prepare('UPDATE checklist_items SET checked = ? WHERE id = ?').run(checked ? 1 : 0, req.params.itemId);
  if (label !== undefined) db.prepare('UPDATE checklist_items SET label = ? WHERE id = ?').run(label, req.params.itemId);
  res.json(db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(req.params.itemId));
});

router.delete('/:id/checklist/:itemId', requireAuth, requireWrite, (req, res) => {
  db.prepare('DELETE FROM checklist_items WHERE id = ? AND task_id = ?').run(req.params.itemId, req.params.id);
  res.json({ success: true });
});

// ─── Pin/Star ────────────────────────────────────────

router.put('/:id/pin', requireAuth, (req, res) => {
  const t = db.prepare('SELECT is_pinned FROM tasks WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found' });
  const newVal = t.is_pinned ? 0 : 1;
  db.prepare('UPDATE tasks SET is_pinned = ? WHERE id = ?').run(newVal, req.params.id);
  res.json({ is_pinned: newVal });
});

// ─── Duplicate Task ─────────────────────────────────
router.post('/:id/duplicate', requireAuth, requireWrite, (req, res) => {
  const old = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Task not found' });
  if (!checkPrivateClient(req, res, old.project_id)) return;

  const r = db.prepare(
    'INSERT INTO tasks (project_id, title, assignee, secondary_assignee, deadline, planned_date, estimated_hours, priority, references_text, notes, is_recurring, recur_interval, recur_unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(old.project_id, old.title + ' (copy)', old.assignee, old.secondary_assignee || '', old.deadline, old.planned_date, old.estimated_hours, old.priority, old.references_text, old.notes, old.is_recurring, old.recur_interval, old.recur_unit);

  logActivity('task', r.lastInsertRowid, 'created', req.user.display_name, `Duplicated from "${old.title}"`);
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(r.lastInsertRowid));
});

// ─── Workload Summary ───────────────────────────────
router.get('/summary', requireAuth, (req, res) => {
  const isOwner = req.user.role === 'owner';
  const priv = isOwner ? '' : 'AND c.is_private = 0';
  const tasks = db.prepare(`
    SELECT t.assignee, t.estimated_hours, t.planned_date, t.deadline, t.progress, t.priority
    FROM tasks t JOIN projects p ON t.project_id=p.id JOIN clients c ON p.client_id=c.id
    WHERE t.archived=0 AND t.progress NOT IN ('completed','invoiced') ${priv}
  `).all();

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  // Week boundaries (Mon-Sun)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + mondayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const wsStr = weekStart.toISOString().split('T')[0];
  const weStr = weekEnd.toISOString().split('T')[0];

  // Next week
  const nextWeekStart = new Date(weekEnd);
  nextWeekStart.setDate(weekEnd.getDate() + 1);
  const nextWeekEnd = new Date(nextWeekStart);
  nextWeekEnd.setDate(nextWeekStart.getDate() + 6);
  const nwsStr = nextWeekStart.toISOString().split('T')[0];
  const nweStr = nextWeekEnd.toISOString().split('T')[0];

  let todayHours = 0, tomorrowHours = 0, thisWeekHours = 0, nextWeekHours = 0, totalHours = 0;
  let todayTasks = 0, tomorrowTasks = 0, thisWeekTasks = 0, nextWeekTasks = 0, totalTasks = 0;
  let overdue = 0;
  const byPerson = {};

  for (const t of tasks) {
    const h = t.estimated_hours || 0;
    const d = t.planned_date || t.deadline || '';
    totalHours += h;
    totalTasks++;

    if (d && d < today) overdue++;

    if (d === today) { todayHours += h; todayTasks++; }
    if (d === tomorrow) { tomorrowHours += h; tomorrowTasks++; }
    if (d >= wsStr && d <= weStr) { thisWeekHours += h; thisWeekTasks++; }
    if (d >= nwsStr && d <= nweStr) { nextWeekHours += h; nextWeekTasks++; }

    // Per-person breakdown
    const name = t.assignee || 'Unassigned';
    if (!byPerson[name]) byPerson[name] = { thisWeek: 0, nextWeek: 0, total: 0, tasks: 0 };
    byPerson[name].total += h;
    byPerson[name].tasks++;
    if (d >= wsStr && d <= weStr) byPerson[name].thisWeek += h;
    if (d >= nwsStr && d <= nweStr) byPerson[name].nextWeek += h;
  }

  // Completed today — separate query since main query filters out completed tasks
  const completedToday = db.prepare(`
    SELECT t.estimated_hours FROM tasks t JOIN projects p ON t.project_id=p.id JOIN clients c ON p.client_id=c.id
    WHERE t.archived=0 AND t.progress IN ('completed','invoiced') AND t.completed_at=? ${priv}
  `).all(today);
  const completedTodayHours = completedToday.reduce((s, t) => s + (t.estimated_hours || 0), 0);
  const completedTodayTasks = completedToday.length;

  res.json({
    today: { hours: todayHours, tasks: todayTasks },
    tomorrow: { hours: tomorrowHours, tasks: tomorrowTasks },
    thisWeek: { hours: thisWeekHours, tasks: thisWeekTasks },
    nextWeek: { hours: nextWeekHours, tasks: nextWeekTasks },
    total: { hours: totalHours, tasks: totalTasks },
    completedToday: { hours: completedTodayHours, tasks: completedTodayTasks },
    overdue,
    byPerson
  });
});

// ─── Workload Detail ────────────────────────────────
// Returns actual task lists for a given workload category or date
router.get('/workload-detail', requireAuth, (req, res) => {
  const { category, date } = req.query;
  const isOwner = req.user.role === 'owner';
  const priv = isOwner ? '' : 'AND c.is_private = 0';
  const baseSelect = `SELECT t.*, p.name as project_name, c.name as client_name, c.code as client_code
    FROM tasks t JOIN projects p ON t.project_id=p.id JOIN clients c ON p.client_id=c.id
    WHERE t.archived=0 ${priv}`;

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now); weekStart.setDate(now.getDate() + mondayOffset);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  const wsStr = weekStart.toISOString().split('T')[0];
  const weStr = weekEnd.toISOString().split('T')[0];
  const nwsStr = new Date(weekEnd.getTime() + 86400000).toISOString().split('T')[0];
  const nweStr = new Date(weekEnd.getTime() + 7 * 86400000).toISOString().split('T')[0];

  let tasks;
  if (category === 'date' && date) {
    // Show all tasks for a specific date — both planned and completed on that day
    const planned = db.prepare(`${baseSelect} AND t.progress NOT IN ('completed','invoiced') AND (t.planned_date=? OR t.deadline=?) ORDER BY t.assignee, t.priority`).all(date, date);
    const completed = db.prepare(`${baseSelect} AND t.progress IN ('completed','invoiced') AND t.completed_at=? ORDER BY t.assignee`).all(date);
    return res.json({ planned, completed });
  } else if (category === 'today') {
    tasks = db.prepare(`${baseSelect} AND t.progress NOT IN ('completed','invoiced') AND (t.planned_date=? OR t.deadline=?) ORDER BY t.assignee, t.priority`).all(today, today);
  } else if (category === 'completed-today') {
    tasks = db.prepare(`${baseSelect} AND t.progress IN ('completed','invoiced') AND t.completed_at=? ORDER BY t.assignee`).all(today);
  } else if (category === 'tomorrow') {
    tasks = db.prepare(`${baseSelect} AND t.progress NOT IN ('completed','invoiced') AND (t.planned_date=? OR t.deadline=?) ORDER BY t.assignee, t.priority`).all(tomorrow, tomorrow);
  } else if (category === 'this-week') {
    tasks = db.prepare(`${baseSelect} AND t.progress NOT IN ('completed','invoiced') AND (COALESCE(NULLIF(t.planned_date,''), t.deadline) BETWEEN ? AND ?) ORDER BY COALESCE(NULLIF(t.planned_date,''), t.deadline), t.priority`).all(wsStr, weStr);
  } else if (category === 'next-week') {
    tasks = db.prepare(`${baseSelect} AND t.progress NOT IN ('completed','invoiced') AND (COALESCE(NULLIF(t.planned_date,''), t.deadline) BETWEEN ? AND ?) ORDER BY COALESCE(NULLIF(t.planned_date,''), t.deadline), t.priority`).all(nwsStr, nweStr);
  } else if (category === 'overdue') {
    tasks = db.prepare(`${baseSelect} AND t.progress NOT IN ('completed','invoiced') AND COALESCE(NULLIF(t.planned_date,''), t.deadline) != '' AND COALESCE(NULLIF(t.planned_date,''), t.deadline) < ? ORDER BY COALESCE(NULLIF(t.planned_date,''), t.deadline), t.priority`).all(today);
  } else {
    return res.json([]);
  }
  res.json(tasks);
});

// ─── Calendar / By-date ───────────────────────────────

router.get('/by-date', requireAuth, (req, res) => {
  const { date, assignee } = req.query;
  const d = date || new Date().toISOString().split('T')[0];
  const isOwner = req.user.role === 'owner';
  const priv = isOwner ? '' : 'AND c.is_private = 0';
  const q = assignee
    ? db.prepare(`SELECT t.*, p.name as project_name, c.name as client_name, c.code as client_code, c.logo_url as client_logo FROM tasks t JOIN projects p ON t.project_id=p.id JOIN clients c ON p.client_id=c.id WHERE t.planned_date=? AND t.assignee=? AND t.archived=0 ${priv} ORDER BY t.priority, t.sort_order`)
    : db.prepare(`SELECT t.*, p.name as project_name, c.name as client_name, c.code as client_code, c.logo_url as client_logo FROM tasks t JOIN projects p ON t.project_id=p.id JOIN clients c ON p.client_id=c.id WHERE t.planned_date=? AND t.archived=0 ${priv} ORDER BY t.assignee, t.priority, t.sort_order`);
  res.json(assignee ? q.all(d, assignee) : q.all(d));
});

router.get('/calendar', requireAuth, (req, res) => {
  const { start, end, assignee } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end required' });
  const isOwner = req.user.role === 'owner';
  const priv = isOwner ? '' : 'AND c.is_private = 0';
  const q = assignee
    ? db.prepare(`SELECT t.*, p.name as project_name, c.name as client_name, c.code as client_code, c.logo_url as client_logo FROM tasks t JOIN projects p ON t.project_id=p.id JOIN clients c ON p.client_id=c.id WHERE t.archived=0 AND t.assignee=? AND (t.planned_date BETWEEN ? AND ? OR t.deadline BETWEEN ? AND ?) ${priv} ORDER BY t.planned_date, t.deadline`)
    : db.prepare(`SELECT t.*, p.name as project_name, c.name as client_name, c.code as client_code, c.logo_url as client_logo FROM tasks t JOIN projects p ON t.project_id=p.id JOIN clients c ON p.client_id=c.id WHERE t.archived=0 AND (t.planned_date BETWEEN ? AND ? OR t.deadline BETWEEN ? AND ?) ${priv} ORDER BY t.planned_date, t.deadline`);
  res.json(assignee ? q.all(assignee, start, end, start, end) : q.all(start, end, start, end));
});

// ─── Search ───────────────────────────────────────────

router.get('/search', requireAuth, (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 1) return res.json([]);

  const isOwner = req.user.role === 'owner';
  const priv = isOwner ? '' : 'AND c.is_private = 0';
  const refMatch = q.match(/^(?:NB)?(\d+)$/i);
  let tasks;
  if (refMatch) {
    const taskId = parseInt(refMatch[1]);
    tasks = db.prepare(`SELECT t.*, p.name as project_name, c.name as client_name, c.code as client_code FROM tasks t JOIN projects p ON t.project_id=p.id JOIN clients c ON p.client_id=c.id WHERE t.id=? ${priv}`).all(taskId);
  } else {
    tasks = db.prepare(`SELECT t.*, p.name as project_name, c.name as client_name, c.code as client_code FROM tasks t JOIN projects p ON t.project_id=p.id JOIN clients c ON p.client_id=c.id WHERE (t.title LIKE ? OR t.notes LIKE ? OR t.assignee LIKE ?) ${priv} ORDER BY t.archived ASC, t.created_at DESC LIMIT 20`).all(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  res.json(tasks);
});

export default router;
