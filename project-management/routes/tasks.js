import { Router } from 'express';
import db from '../database.js';
import { requireAuth, requireRole, requireWrite, attachUpload } from '../middleware.js';
import { logActivity } from '../lib/activity.js';
import {
  statusToProgress, bandToPriority, progressToStatus, priorityToBand,
  isValidStatus, isValidBand, isValidType,
} from '../lib/taskmap.js';

const router = Router();

// ─── Task CRUD ────────────────────────────────────────

function checkPrivateClient(req, res, clientId) {
  const row = db.prepare('SELECT is_private FROM clients WHERE id = ?').get(clientId);
  if (row?.is_private && req.user.role !== 'owner') {
    res.status(403).json({ error: 'Access denied' });
    return false;
  }
  return true;
}

// Date fields render into HTML value="" attributes client-side — accept only
// real ISO dates (or blank) so they can never carry markup.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function cleanDate(v) {
  if (v === undefined || v === null) return v;   // "not provided" stays untouched (COALESCE)
  return ISO_DATE.test(String(v)) ? v : '';
}
function cleanHours(v) {
  if (v === undefined || v === null) return v;
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// The system "Unassigned" client catches clientless Inbox captures.
function getUnassignedClientId() {
  let u = db.prepare("SELECT id FROM clients WHERE is_system=1 ORDER BY id LIMIT 1").get();
  if (!u) {
    const r = db.prepare(
      "INSERT INTO clients (name, code, agreement_type, client_type, is_system, sort_order) VALUES ('📥 Unassigned','UNA','ad-hoc','prospect',1,9999)"
    ).run();
    u = { id: r.lastInsertRowid };
  }
  return u.id;
}

router.post('/', requireAuth, requireWrite, (req, res) => {
  let { client_id, title, assignee, secondary_assignee, deadline, planned_date, estimated_hours,
    task_status, task_band, task_type, suggested_block, priority, references_text, notes,
    is_recurring, recur_interval, recur_unit } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });

  // client_id is optional — clientless quick-captures land in the system "Unassigned" client
  if (!client_id) client_id = getUnassignedClientId();
  if (!checkPrivateClient(req, res, client_id)) return;

  deadline = cleanDate(deadline);
  planned_date = cleanDate(planned_date);
  estimated_hours = cleanHours(estimated_hours);

  // New canonical fields (validated); legacy progress/priority derived as shadows.
  task_status = isValidStatus(task_status) ? task_status : 'inbox';
  task_band = isValidBand(task_band) ? task_band : '';
  task_type = isValidType(task_type) ? task_type : (is_recurring ? 'recurring' : 'ad-hoc');
  const progress = statusToProgress(task_status);
  const priorityShadow = task_band ? bandToPriority(task_band) : (priority || 'medium');

  let proj = db.prepare('SELECT id FROM projects WHERE client_id = ? ORDER BY id LIMIT 1').get(client_id);
  if (!proj) {
    const pr = db.prepare('INSERT INTO projects (client_id, name, status) VALUES (?, ?, ?)').run(client_id, 'General', 'active');
    proj = { id: pr.lastInsertRowid };
  }
  const result = db.prepare(
    'INSERT INTO tasks (project_id, client_id, title, assignee, secondary_assignee, deadline, planned_date, estimated_hours, progress, priority, task_status, task_band, task_type, suggested_block, references_text, notes, is_recurring, recur_interval, recur_unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(proj.id, client_id, title, assignee || '', secondary_assignee || '', deadline || '', planned_date || '', estimated_hours || 0, progress, priorityShadow, task_status, task_band, task_type, suggested_block || '', references_text || '', notes || '', is_recurring ? 1 : 0, recur_interval || 0, recur_unit || '');

  logActivity('task', result.lastInsertRowid, 'created', req.user.display_name, `Created task "${title}"`);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  task.comments = []; task.attachments = [];
  res.json(task);
});

// ─── Manual reorder (notebook drag & drop) ───────────
router.put('/reorder', requireAuth, requireWrite, (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order) || !order.length || order.length > 2000 || !order.every(n => Number.isInteger(n))) {
    return res.status(400).json({ error: 'order must be an array of task ids' });
  }
  const isOwner = req.user.role === 'owner';
  const upd = db.prepare('UPDATE tasks SET sort_order = ? WHERE id = ?');
  const check = db.prepare('SELECT c.is_private FROM tasks t JOIN clients c ON t.client_id = c.id WHERE t.id = ?');
  db.transaction(() => {
    order.forEach((id, i) => {
      const row = check.get(id);
      if (!row) return;
      if (row.is_private && !isOwner) return;   // can't reorder what you can't see
      upd.run((i + 1) * 10, id);
    });
  })();
  res.json({ success: true });
});

router.put('/:id', requireAuth, requireWrite, (req, res) => {
  let { title, assignee, secondary_assignee, deadline, planned_date, estimated_hours,
    task_status, task_band, task_type, suggested_block, progress, priority,
    references_text, notes, is_recurring, recur_interval, recur_unit, client_id } = req.body;
  const old = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Task not found' });
  if (!checkPrivateClient(req, res, old.client_id)) return;

  deadline = cleanDate(deadline);
  planned_date = cleanDate(planned_date);
  estimated_hours = cleanHours(estimated_hours);

  // Reassign client (e.g. triaging an Inbox task to a client)
  if (client_id !== undefined && client_id !== null && +client_id !== old.client_id) {
    if (!checkPrivateClient(req, res, +client_id)) return;
    let proj = db.prepare('SELECT id FROM projects WHERE client_id = ? ORDER BY id LIMIT 1').get(+client_id);
    if (!proj) {
      const pr = db.prepare('INSERT INTO projects (client_id, name, status) VALUES (?, ?, ?)').run(+client_id, 'General', 'active');
      proj = { id: pr.lastInsertRowid };
    }
    db.prepare('UPDATE tasks SET client_id = ?, project_id = ? WHERE id = ?').run(+client_id, proj.id, req.params.id);
  }

  // Reconcile canonical (task_status/task_band) with legacy shadow (progress/priority).
  // Whichever the caller sends, keep both columns consistent.
  if (task_status !== undefined) {
    if (!isValidStatus(task_status)) return res.status(400).json({ error: 'Invalid task_status' });
    progress = statusToProgress(task_status);
  } else if (progress !== undefined) {
    task_status = progressToStatus(progress);
  }
  if (task_band !== undefined) {
    if (!isValidBand(task_band)) return res.status(400).json({ error: 'Invalid task_band' });
    priority = bandToPriority(task_band);
  } else if (priority !== undefined) {
    task_band = priorityToBand(priority);
  }
  if (task_type !== undefined && !isValidType(task_type)) return res.status(400).json({ error: 'Invalid task_type' });

  // Sending a task for review tags the owner as secondary so it lands in
  // their sign-off queue (and their notebook Review tab).
  if (task_status === 'review' && secondary_assignee === undefined && !old.secondary_assignee) {
    const owner = db.prepare("SELECT display_name FROM users WHERE role='owner' ORDER BY id LIMIT 1").get();
    if (owner) secondary_assignee = owner.display_name;
  }

  // completed_at tracks the canonical "done" transition (not cancelled).
  const wasDone = old.task_status === 'done';
  const nowDone = task_status === 'done';
  let completedAt = undefined;
  if (task_status !== undefined) {
    if (nowDone && !wasDone) completedAt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date()); // UK calendar date — matches the UI's local 'today'
    else if (!nowDone && wasDone) completedAt = '';
  }

  db.prepare(
    'UPDATE tasks SET title=COALESCE(?,title), assignee=COALESCE(?,assignee), secondary_assignee=COALESCE(?,secondary_assignee), deadline=COALESCE(?,deadline), planned_date=COALESCE(?,planned_date), estimated_hours=COALESCE(?,estimated_hours), progress=COALESCE(?,progress), priority=COALESCE(?,priority), task_status=COALESCE(?,task_status), task_band=COALESCE(?,task_band), task_type=COALESCE(?,task_type), suggested_block=COALESCE(?,suggested_block), references_text=COALESCE(?,references_text), notes=COALESCE(?,notes), is_recurring=COALESCE(?,is_recurring), recur_interval=COALESCE(?,recur_interval), recur_unit=COALESCE(?,recur_unit), completed_at=COALESCE(?,completed_at) WHERE id=?'
  ).run(title, assignee, secondary_assignee, deadline, planned_date, estimated_hours, progress, priority, task_status, task_band, task_type, suggested_block, references_text, notes, is_recurring !== undefined ? (is_recurring ? 1 : 0) : null, recur_interval, recur_unit, completedAt, req.params.id);

  const changes = [];
  if (title && title !== old.title) changes.push('title changed');
  if (assignee !== undefined && assignee !== old.assignee) changes.push(`assignee: "${old.assignee || 'none'}" → "${assignee || 'none'}"`);
  if (secondary_assignee !== undefined && secondary_assignee !== old.secondary_assignee) changes.push(`also assigned: "${secondary_assignee || 'none'}"`);
  if (task_status && task_status !== old.task_status) changes.push(`status: ${old.task_status} → ${task_status}`);
  if (task_band && task_band !== old.task_band) changes.push(`band: ${old.task_band || 'none'} → ${task_band}`);
  if (deadline !== undefined && deadline !== old.deadline) changes.push('deadline changed');
  if (planned_date !== undefined && planned_date !== old.planned_date) changes.push('planned date changed');
  if (changes.length) logActivity('task', req.params.id, 'updated', req.user.display_name, changes.join(', '));

  // Recurring auto-create fires on the canonical "done" transition.
  if (nowDone && !wasDone && old.is_recurring && old.recur_interval > 0) {
    const nextDate = calculateNextDate(old.deadline || old.planned_date || new Date().toISOString().split('T')[0], old.recur_interval, old.recur_unit);
    const newTask = db.prepare(
      "INSERT INTO tasks (project_id, client_id, title, assignee, deadline, planned_date, estimated_hours, progress, priority, task_status, task_band, task_type, references_text, notes, is_recurring, recur_interval, recur_unit) VALUES (?, ?, ?, ?, ?, ?, ?, 'not-started', ?, 'scheduled', ?, ?, ?, ?, 1, ?, ?)"
    ).run(old.project_id, old.client_id, old.title, old.assignee, nextDate, nextDate, old.estimated_hours, old.priority, old.task_band || '', old.task_type || 'recurring', old.references_text, old.notes, old.recur_interval, old.recur_unit);
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
  const { task_ids, target_client_id } = req.body;
  if (!Array.isArray(task_ids) || !task_ids.length || !target_client_id) {
    return res.status(400).json({ error: 'task_ids array and target_client_id required' });
  }
  const targetClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(target_client_id);
  if (!targetClient) return res.status(404).json({ error: 'Target client not found' });
  if (!checkPrivateClient(req, res, target_client_id)) return;

  const update = db.prepare('UPDATE tasks SET client_id = ? WHERE id = ?');
  const moved = [];
  const isOwner = req.user.role === 'owner';
  db.transaction(() => {
    for (const id of task_ids) {
      // Join the source client so tasks under private clients can't be moved
      // (or discovered) by non-owners guessing ids.
      const task = db.prepare('SELECT t.*, c.is_private FROM tasks t JOIN clients c ON t.client_id = c.id WHERE t.id = ?').get(id);
      if (!task) continue;
      if (task.is_private && !isOwner) continue;
      update.run(target_client_id, id);
      moved.push(task.title);
      logActivity('task', id, 'updated', req.user.display_name, `Moved to "${targetClient.name}"`);
    }
  })();

  res.json({ success: true, moved: moved.length });
});

// ─── Bulk deadline push ──────────────────────────────
// "Didn't finish Friday — push everything to Monday": shift every open
// task's deadline/planned date by N days in one go. Optional taskIds
// restricts the shift (used by the notebook's undo to reverse exactly
// the tasks it moved). Private clients' tasks stay owner-only.
router.post('/bulk-shift', requireAuth, requireWrite, (req, res) => {
  const days = parseInt(req.body?.days, 10);
  if (!Number.isInteger(days) || days === 0 || Math.abs(days) > 60) {
    return res.status(400).json({ error: 'days must be a whole number between -60 and 60 (not 0)' });
  }
  const onlyIds = Array.isArray(req.body?.taskIds) ? req.body.taskIds.map(Number).filter(Number.isInteger) : null;
  const isOwner = req.user.role === 'owner';
  const priv = isOwner ? '' : 'AND c.is_private = 0';
  let rows;
  if (onlyIds && onlyIds.length) {
    rows = db.prepare(`SELECT t.id, t.deadline, t.planned_date FROM tasks t JOIN clients c ON c.id = t.client_id
      WHERE t.id IN (${onlyIds.map(() => '?').join(',')}) AND t.archived = 0 ${priv}`).all(...onlyIds);
  } else {
    rows = db.prepare(`SELECT t.id, t.deadline, t.planned_date FROM tasks t JOIN clients c ON c.id = t.client_id
      WHERE t.archived = 0 AND t.progress NOT IN ('completed','invoiced')
        AND ((t.deadline IS NOT NULL AND t.deadline != '') OR (t.planned_date IS NOT NULL AND t.planned_date != '')) ${priv}`).all();
  }
  const shift = (str) => {
    if (!str) return str;
    const d = new Date(str + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };
  const update = db.prepare('UPDATE tasks SET deadline = ?, planned_date = ? WHERE id = ?');
  const shifted = [];
  db.transaction(() => {
    for (const t of rows) {
      update.run(shift(t.deadline), shift(t.planned_date), t.id);
      shifted.push(t.id);
    }
  })();
  if (shifted.length) {
    logActivity('task', shifted[0], 'updated', req.user.display_name,
      `Pushed ${shifted.length} task deadline(s) by ${days > 0 ? '+' : ''}${days} day(s) (bulk)`);
  }
  res.json({ success: true, shifted: shifted.length, taskIds: shifted });
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
  if (!checkPrivateClient(req, res, t.client_id)) return;
  const ns = t.archived ? 0 : 1;
  db.prepare('UPDATE tasks SET archived = ? WHERE id = ?').run(ns, req.params.id);
  logActivity('task', req.params.id, ns ? 'archived' : 'restored', req.user.display_name, `${ns ? 'Archived' : 'Restored'} "${t.title}"`);
  res.json({ success: true, archived: ns });
});

// ─── Attachments ──────────────────────────────────────

router.post('/:id/attachments', requireAuth, requireWrite, (req, res, next) => {
  const t = db.prepare('SELECT client_id FROM tasks WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found' });
  if (!checkPrivateClient(req, res, t.client_id)) return;
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

export function deleteAttachmentHandler(req, res) {
  const row = db.prepare(
    'SELECT c.is_private FROM task_attachments a JOIN tasks t ON a.task_id = t.id JOIN clients c ON t.client_id = c.id WHERE a.id = ?'
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
  const t = db.prepare('SELECT client_id FROM tasks WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found' });
  if (!checkPrivateClient(req, res, t.client_id)) return;
  const author = req.user.display_name;
  const r = db.prepare('INSERT INTO comments (task_id, author, content) VALUES (?, ?, ?)').run(req.params.id, author, content);
  logActivity('task', req.params.id, 'commented', author, content.substring(0, 100));
  res.json(db.prepare('SELECT * FROM comments WHERE id = ?').get(r.lastInsertRowid));
});

// ─── Checklists ──────────────────────────────────────

router.get('/:id/checklist', requireAuth, (req, res) => {
  const t = db.prepare('SELECT client_id FROM tasks WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found' });
  if (!checkPrivateClient(req, res, t.client_id)) return;
  res.json(db.prepare('SELECT * FROM checklist_items WHERE task_id = ? ORDER BY sort_order, id').all(req.params.id));
});

router.post('/:id/checklist', requireAuth, requireWrite, (req, res) => {
  const { label } = req.body;
  if (!label) return res.status(400).json({ error: 'Label required' });
  const t = db.prepare('SELECT client_id FROM tasks WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found' });
  if (!checkPrivateClient(req, res, t.client_id)) return;
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
  const t = db.prepare('SELECT is_pinned, client_id FROM tasks WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found' });
  if (!checkPrivateClient(req, res, t.client_id)) return;
  const newVal = t.is_pinned ? 0 : 1;
  db.prepare('UPDATE tasks SET is_pinned = ? WHERE id = ?').run(newVal, req.params.id);
  res.json({ is_pinned: newVal });
});

// ─── Duplicate Task ─────────────────────────────────
router.post('/:id/duplicate', requireAuth, requireWrite, (req, res) => {
  const old = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Task not found' });
  if (!checkPrivateClient(req, res, old.client_id)) return;

  const r = db.prepare(
    'INSERT INTO tasks (project_id, client_id, title, assignee, secondary_assignee, deadline, planned_date, estimated_hours, progress, priority, task_status, task_band, task_type, suggested_block, references_text, notes, is_recurring, recur_interval, recur_unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(old.project_id, old.client_id, old.title + ' (copy)', old.assignee, old.secondary_assignee || '', old.deadline, old.planned_date, old.estimated_hours, old.progress, old.priority, old.task_status || 'inbox', old.task_band || '', old.task_type || '', old.suggested_block || '', old.references_text, old.notes, old.is_recurring, old.recur_interval, old.recur_unit);

  logActivity('task', r.lastInsertRowid, 'created', req.user.display_name, `Duplicated from "${old.title}"`);
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(r.lastInsertRowid));
});

// ─── Workload Summary ───────────────────────────────
router.get('/summary', requireAuth, (req, res) => {
  const isOwner = req.user.role === 'owner';
  const priv = isOwner ? '' : 'AND c.is_private = 0';
  const tasks = db.prepare(`
    SELECT t.assignee, t.estimated_hours, t.planned_date, t.deadline, t.progress, t.priority
    FROM tasks t JOIN clients c ON t.client_id=c.id
    WHERE t.archived=0 AND t.progress NOT IN ('completed','invoiced') ${priv}
  `).all();

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + mondayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const wsStr = weekStart.toISOString().split('T')[0];
  const weStr = weekEnd.toISOString().split('T')[0];

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

    const name = t.assignee || 'Unassigned';
    if (!byPerson[name]) byPerson[name] = { thisWeek: 0, nextWeek: 0, total: 0, tasks: 0 };
    byPerson[name].total += h;
    byPerson[name].tasks++;
    if (d >= wsStr && d <= weStr) byPerson[name].thisWeek += h;
    if (d >= nwsStr && d <= nweStr) byPerson[name].nextWeek += h;
  }

  const completedToday = db.prepare(`
    SELECT t.estimated_hours FROM tasks t JOIN clients c ON t.client_id=c.id
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
router.get('/workload-detail', requireAuth, (req, res) => {
  const { category, date } = req.query;
  const isOwner = req.user.role === 'owner';
  const priv = isOwner ? '' : 'AND c.is_private = 0';
  const baseSelect = `SELECT t.*, c.name as client_name, c.code as client_code
    FROM tasks t JOIN clients c ON t.client_id=c.id
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
    ? db.prepare(`SELECT t.*, c.name as client_name, c.code as client_code, c.logo_url as client_logo FROM tasks t JOIN clients c ON t.client_id=c.id WHERE t.planned_date=? AND t.assignee=? AND t.archived=0 ${priv} ORDER BY t.priority, t.sort_order`)
    : db.prepare(`SELECT t.*, c.name as client_name, c.code as client_code, c.logo_url as client_logo FROM tasks t JOIN clients c ON t.client_id=c.id WHERE t.planned_date=? AND t.archived=0 ${priv} ORDER BY t.assignee, t.priority, t.sort_order`);
  res.json(assignee ? q.all(d, assignee) : q.all(d));
});

router.get('/calendar', requireAuth, (req, res) => {
  const { start, end, assignee } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end required' });
  const isOwner = req.user.role === 'owner';
  const priv = isOwner ? '' : 'AND c.is_private = 0';
  const q = assignee
    ? db.prepare(`SELECT t.*, c.name as client_name, c.code as client_code, c.logo_url as client_logo FROM tasks t JOIN clients c ON t.client_id=c.id WHERE t.archived=0 AND t.assignee=? AND (t.planned_date BETWEEN ? AND ? OR t.deadline BETWEEN ? AND ?) ${priv} ORDER BY t.planned_date, t.deadline`)
    : db.prepare(`SELECT t.*, c.name as client_name, c.code as client_code, c.logo_url as client_logo FROM tasks t JOIN clients c ON t.client_id=c.id WHERE t.archived=0 AND (t.planned_date BETWEEN ? AND ? OR t.deadline BETWEEN ? AND ?) ${priv} ORDER BY t.planned_date, t.deadline`);
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
    tasks = db.prepare(`SELECT t.*, c.name as client_name, c.code as client_code FROM tasks t JOIN clients c ON t.client_id=c.id WHERE t.id=? ${priv}`).all(taskId);
  } else {
    tasks = db.prepare(`SELECT t.*, c.name as client_name, c.code as client_code FROM tasks t JOIN clients c ON t.client_id=c.id WHERE (t.title LIKE ? OR t.notes LIKE ? OR t.assignee LIKE ?) ${priv} ORDER BY t.archived ASC, t.created_at DESC LIMIT 20`).all(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  res.json(tasks);
});

export default router;
