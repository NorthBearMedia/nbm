import { Router } from 'express';
import db from '../database.js';
import { requireAuth, requireRole, requireWrite, logoUpload } from '../middleware.js';
import { logActivity } from '../lib/activity.js';
import { isValidClientType, isValidControlStatus, isValidRisk } from '../lib/taskmap.js';

const router = Router();

function requireClientAccess(req, res) {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) { res.status(404).json({ error: 'Client not found' }); return null; }
  if (client.is_private && req.user.role !== 'owner') { res.status(403).json({ error: 'Access denied' }); return null; }
  return client;
}

// Client date fields render into HTML attributes client-side — ISO dates or blank only.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function cleanDate(v) {
  if (v === undefined || v === null) return v;
  return ISO_DATE.test(String(v)) ? v : '';
}
function cleanMoney(v) {
  if (v === undefined || v === null) return v;
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

// Auto RAG status + risk from a client's tasks and dates.
// Principle: Red = genuinely urgent/risky; Amber = needs attention or scheduling.
// A retainer simply lacking a scheduled date is Amber, never Red.
function computeControl(client, tasks, today) {
  const open = tasks.filter(t => t.task_status !== 'done' && t.task_status !== 'cancelled');
  const hasOpenWork = open.length > 0;
  const soon = addDays(today, 3);

  let hasOverdue = false, hasUrgent = false, waitingMePastDue = false, dueSoon = false;
  for (const t of open) {
    const dl = t.deadline || '';
    if (dl && dl < today) hasOverdue = true;
    if (t.task_type === 'urgent') hasUrgent = true;
    if (t.task_status === 'waiting-on-me' && dl && dl < today) waitingMePastDue = true;
    const eff = t.planned_date || t.deadline || '';
    if (eff && eff >= today && eff <= soon) dueSoon = true;
  }
  const noScheduled = !client.next_scheduled_date;
  const staleContact = !!client.last_contact_date && client.last_contact_date < addDays(today, -14);
  const allWaitingClient = hasOpenWork && open.every(t => t.task_status === 'waiting-on-client');

  let status;
  // Red = genuinely urgent/risky ONLY. A blank next_scheduled_date never makes a
  // client Red — at most Amber (and only when there is open work to schedule).
  if (hasOverdue || hasUrgent || waitingMePastDue) status = 'red';
  else if (allWaitingClient) status = 'blue';
  else if ((noScheduled && hasOpenWork) || dueSoon || staleContact) status = 'amber';
  else status = 'green';

  const risk = status === 'red' ? 'high' : status === 'amber' ? 'medium' : 'low';
  return { status, risk };
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

  // Bulk-load everything in 3 queries instead of 2 + 2-per-task (the old
  // shape was ~240 queries per request and grew with every task forever).
  // Output shape is unchanged.
  const cids = clients.map(c => c.id);
  const ph = cids.map(() => '?').join(',');
  const allTasks = cids.length
    ? db.prepare(`SELECT * FROM tasks WHERE client_id IN (${ph}) ORDER BY sort_order, created_at`).all(...cids)
    : [];
  const byClient = new Map(), byClientArchived = new Map();
  for (const t of allTasks) {
    const m = t.archived ? byClientArchived : byClient;
    if (!m.has(t.client_id)) m.set(t.client_id, []);
    m.get(t.client_id).push(t);
  }
  const commentsByTask = new Map(), attachByTask = new Map();
  for (const c of db.prepare('SELECT * FROM comments ORDER BY created_at DESC').all()) {
    if (!commentsByTask.has(c.task_id)) commentsByTask.set(c.task_id, []);
    commentsByTask.get(c.task_id).push(c);
  }
  for (const a of db.prepare('SELECT * FROM task_attachments ORDER BY created_at DESC').all()) {
    if (!attachByTask.has(a.task_id)) attachByTask.set(a.task_id, []);
    attachByTask.get(a.task_id).push(a);
  }

  const now = new Date().toISOString().split('T')[0];
  const doneStatuses = ['completed', 'invoiced'];

  for (const client of clients) {
    client.tasks = byClient.get(client.id) || [];
    client.archivedTasks = byClientArchived.get(client.id) || [];
    let totalTasks = 0, completedTasks = 0, overdueTasks = 0, inProgressTasks = 0, blockedTasks = 0, awaitingManager = 0;

    for (const task of client.tasks) {
      task.comments = commentsByTask.get(task.id) || [];
      task.attachments = attachByTask.get(task.id) || [];
      totalTasks++;
      if (doneStatuses.includes(task.progress)) completedTasks++;
      if (task.progress === 'in-progress') inProgressTasks++;
      if (task.progress === 'stuck') blockedTasks++;
      if (task.progress === 'awaiting-manager') awaitingManager++;
      if (task.deadline && task.deadline < now && !doneStatuses.includes(task.progress)) overdueTasks++;
    }
    for (const task of client.archivedTasks) {
      task.comments = commentsByTask.get(task.id) || [];
      task.attachments = attachByTask.get(task.id) || [];
    }
    client.stats = { totalTasks, completedTasks, overdueTasks, inProgressTasks, blockedTasks, awaitingManager, outstandingTasks: totalTasks - completedTasks };

    // Control Board aggregates (canonical task_status driven)
    let outstanding = 0, waiting = 0, overdue = 0, recurring = 0, nextDue = '';
    for (const task of client.tasks) {
      const open = task.task_status !== 'done' && task.task_status !== 'cancelled';
      if (!open) continue;
      outstanding++;
      if (task.task_status === 'waiting-on-client' || task.task_status === 'waiting-on-me') waiting++;
      if (task.deadline && task.deadline < now) overdue++;
      if (task.task_type === 'recurring' || task.is_recurring) recurring++;
      if (task.deadline && (!nextDue || task.deadline < nextDue)) nextDue = task.deadline;
    }
    const control = computeControl(client, client.tasks, now);
    client.computed_status = control.status;
    client.computed_risk = control.risk;
    client.resolved_status = client.control_status || control.status;
    client.resolved_risk = client.risk_level || control.risk;
    client.board = { outstanding, waiting, overdue, recurring, next_due_date: nextDue };

    // Client financials are owner-only: staff see client health, not money.
    if (!isOwner) {
      client.monthly_value = 0;
      client.agreement_summary = '';
    }
  }
  res.json(clients);
});

router.post('/', requireAuth, requireWrite, (req, res) => {
  let { name, code, agreement_type, notes, gmail_link, drive_link, is_private,
    client_type, monthly_value, agreement_summary, recurring_deliverables,
    last_contact_date, next_scheduled_date, control_status, risk_level, important_contacts } = req.body;
  if (!name) return res.status(400).json({ error: 'Client name is required' });
  last_contact_date = cleanDate(last_contact_date);
  next_scheduled_date = cleanDate(next_scheduled_date);
  monthly_value = cleanMoney(monthly_value);
  if (code && code.length !== 3) return res.status(400).json({ error: 'Client code must be exactly 3 characters' });
  if (is_private && req.user.role !== 'owner') return res.status(403).json({ error: 'Only owners can create private clients' });

  const ct = isValidClientType(client_type) ? client_type : (agreement_type === 'ad-hoc' ? 'ad-hoc' : 'retainer');
  const cs = isValidControlStatus(control_status || '') ? (control_status || '') : '';
  const rl = isValidRisk(risk_level || '') ? (risk_level || '') : '';

  const autoCode = name.split(' ').map(w => w[0]).join('').substring(0, 3).toUpperCase().padEnd(3, 'X');
  const clientCode = code || autoCode;
  const result = db.prepare(
    'INSERT INTO clients (name, code, agreement_type, notes, gmail_link, drive_link, is_private, client_type, monthly_value, agreement_summary, recurring_deliverables, last_contact_date, next_scheduled_date, control_status, risk_level, important_contacts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    name, clientCode, agreement_type || 'recurring', notes || '', gmail_link || '', drive_link || '', is_private ? 1 : 0,
    ct, monthly_value || 0, agreement_summary || '', recurring_deliverables || '',
    last_contact_date || '', next_scheduled_date || '', cs, rl, important_contacts || ''
  );
  logActivity('client', result.lastInsertRowid, 'created', req.user.display_name, `Created client "${name}"`);
  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/reorder', requireAuth, requireWrite, (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });
  const stmt = db.prepare('UPDATE clients SET sort_order = ? WHERE id = ?');
  db.transaction((ids) => { ids.forEach((id, i) => stmt.run(i, id)); })(order);
  res.json({ success: true });
});

router.put('/:id', requireAuth, requireWrite, (req, res) => {
  let { name, code, agreement_type, notes, logo_url, gmail_link, drive_link, is_private,
    client_type, monthly_value, agreement_summary, recurring_deliverables,
    last_contact_date, next_scheduled_date, control_status, risk_level, important_contacts } = req.body;
  const old = requireClientAccess(req, res);
  if (!old) return;
  if (is_private && req.user.role !== 'owner') return res.status(403).json({ error: 'Only owners can make clients private' });
  if (client_type !== undefined && !isValidClientType(client_type)) return res.status(400).json({ error: 'Invalid client_type' });
  if (control_status !== undefined && !isValidControlStatus(control_status)) return res.status(400).json({ error: 'Invalid control_status' });
  if (risk_level !== undefined && !isValidRisk(risk_level)) return res.status(400).json({ error: 'Invalid risk_level' });
  last_contact_date = cleanDate(last_contact_date);
  next_scheduled_date = cleanDate(next_scheduled_date);
  monthly_value = cleanMoney(monthly_value);
  // Financials are owner-only: staff never see these fields, so a staff save
  // must never overwrite them (their form posts blanks).
  if (req.user.role !== 'owner') { monthly_value = undefined; agreement_summary = undefined; }

  db.prepare('UPDATE clients SET name=COALESCE(?,name), code=COALESCE(?,code), agreement_type=COALESCE(?,agreement_type), notes=COALESCE(?,notes), logo_url=COALESCE(?,logo_url), gmail_link=COALESCE(?,gmail_link), drive_link=COALESCE(?,drive_link), is_private=COALESCE(?,is_private), client_type=COALESCE(?,client_type), monthly_value=COALESCE(?,monthly_value), agreement_summary=COALESCE(?,agreement_summary), recurring_deliverables=COALESCE(?,recurring_deliverables), last_contact_date=COALESCE(?,last_contact_date), next_scheduled_date=COALESCE(?,next_scheduled_date), control_status=COALESCE(?,control_status), risk_level=COALESCE(?,risk_level), important_contacts=COALESCE(?,important_contacts) WHERE id=?')
    .run(name, code, agreement_type, notes, logo_url, gmail_link, drive_link, is_private !== undefined ? (is_private ? 1 : 0) : null,
      client_type, monthly_value, agreement_summary, recurring_deliverables,
      last_contact_date, next_scheduled_date, control_status, risk_level, important_contacts, req.params.id);

  const changes = [];
  if (name && name !== old.name) changes.push(`name: "${old.name}" → "${name}"`);
  if (code !== undefined && code !== old.code) changes.push(`code: "${old.code}" → "${code}"`);
  if (agreement_type && agreement_type !== old.agreement_type) changes.push(`type: ${old.agreement_type} → ${agreement_type}`);
  if (control_status !== undefined && control_status !== old.control_status) changes.push(`status override: ${old.control_status || 'auto'} → ${control_status || 'auto'}`);
  if (risk_level !== undefined && risk_level !== old.risk_level) changes.push(`risk override: ${old.risk_level || 'auto'} → ${risk_level || 'auto'}`);
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
  const tids = db.prepare('SELECT id FROM tasks WHERE client_id = ?').all(cid).map(t => t.id);
  const conds = ["(entity_type='client' AND entity_id=?)"];
  const params = [cid];
  if (tids.length) { conds.push(`(entity_type='task' AND entity_id IN (${tids.map(() => '?').join(',')}))`); params.push(...tids); }
  params.push(limit);
  res.json(db.prepare(`SELECT * FROM activity_log WHERE ${conds.join(' OR ')} ORDER BY created_at DESC LIMIT ?`).all(...params));
});

export default router;
