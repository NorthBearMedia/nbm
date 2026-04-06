import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import multer from 'multer';
import { createHash, randomBytes } from 'crypto';
import cookieParser from 'cookie-parser';
import db from './database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(cookieParser());

// ─── AUTH HELPERS ─────────────────────────────────────
function hashPassword(pw) {
  return createHash('sha256').update(pw + 'nbm-salt-2026').digest('hex');
}

function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
  db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(userId, token, expires);
  return token;
}

function getSessionUser(req) {
  const token = req.cookies?.nbm_session;
  if (!token) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > datetime(\'now\')').get(token);
  if (!session) return null;
  return db.prepare('SELECT id, username, email, display_name, role, avatar_url, avatar_color FROM users WHERE id = ?').get(session.user_id);
}

// ─── AUTH ROUTES (public) ─────────────────────────────
app.get('/login', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'login.html'));
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || user.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = createSession(user.id);
  res.cookie('nbm_session', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
  res.json({ user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role, avatar_url: user.avatar_url } });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.nbm_session;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie('nbm_session');
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json(user);
});

// ─── AUTH MIDDLEWARE ───────────────────────────────────
function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Serve login page for unauthenticated users at root
app.get('/', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.redirect('/login');
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Static files
app.use(express.static(join(__dirname, 'public')));

// Protect all API routes (except auth)
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/')) return next();
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.user = user;
  next();
});

// File uploads — logos
const logoStorage = multer.diskStorage({
  destination: join(__dirname, 'public', 'uploads'),
  filename: (req, file, cb) => cb(null, `logo-${Date.now()}.${file.originalname.split('.').pop()}`)
});
const logoUpload = multer({ storage: logoStorage, limits: { fileSize: 2 * 1024 * 1024 } });

// File uploads — task attachments (images, videos, docs up to 50MB)
const attachStorage = multer.diskStorage({
  destination: join(__dirname, 'public', 'attachments'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`)
});
const attachUpload = multer({ storage: attachStorage, limits: { fileSize: 50 * 1024 * 1024 } });

import { mkdirSync } from 'fs';
mkdirSync(join(__dirname, 'public', 'uploads'), { recursive: true });
mkdirSync(join(__dirname, 'public', 'attachments'), { recursive: true });

function logActivity(entityType, entityId, action, author, details) {
  db.prepare('INSERT INTO activity_log (entity_type, entity_id, action, author, details) VALUES (?, ?, ?, ?, ?)').run(entityType, entityId, action, author || 'System', details || '');
}

// ─── CLIENTS ───────────────────────────────────────────

app.get('/api/clients', (req, res) => {
  const { filter, include_archived } = req.query;
  const arc = include_archived === '1' ? '' : 'AND archived = 0';
  let clients;
  if (filter && ['recurring', 'ad-hoc'].includes(filter)) {
    clients = db.prepare(`SELECT * FROM clients WHERE agreement_type = ? ${arc} ORDER BY sort_order, name`).all(filter);
  } else {
    clients = db.prepare(`SELECT * FROM clients WHERE 1=1 ${arc} ORDER BY sort_order, name`).all();
  }

  const projectsStmt = db.prepare('SELECT * FROM projects WHERE client_id = ? AND archived = 0 ORDER BY sort_order, name');
  const archivedProjectsStmt = db.prepare('SELECT * FROM projects WHERE client_id = ? AND archived = 1 ORDER BY sort_order, name');
  const tasksStmt = db.prepare('SELECT * FROM tasks WHERE project_id = ? AND archived = 0 ORDER BY sort_order, created_at');
  const archivedTasksStmt = db.prepare('SELECT * FROM tasks WHERE project_id = ? AND archived = 1 ORDER BY sort_order, created_at');
  const commentsStmt = db.prepare('SELECT * FROM comments WHERE task_id = ? ORDER BY created_at DESC');
  const attachStmt = db.prepare('SELECT * FROM task_attachments WHERE task_id = ? ORDER BY created_at DESC');

  for (const client of clients) {
    client.projects = projectsStmt.all(client.id);
    client.archivedProjects = archivedProjectsStmt.all(client.id);
    let totalTasks = 0, completedTasks = 0, overdueTasks = 0, inProgressTasks = 0, blockedTasks = 0;
    const now = new Date().toISOString().split('T')[0];
    const doneStatuses = ['completed', 'invoiced'];

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
          if (task.deadline && task.deadline < now && !doneStatuses.includes(task.progress)) overdueTasks++;
        }
      }
    }
    client.stats = { totalTasks, completedTasks, overdueTasks, inProgressTasks, blockedTasks, outstandingTasks: totalTasks - completedTasks };
  }
  res.json(clients);
});

app.post('/api/clients', (req, res) => {
  const { name, code, agreement_type, notes, gmail_link, drive_link, author } = req.body;
  if (!name) return res.status(400).json({ error: 'Client name is required' });
  const clientCode = code || name.split(' ').map(w => w[0]).join('').substring(0, 3).toUpperCase();
  const result = db.prepare('INSERT INTO clients (name, code, agreement_type, notes, gmail_link, drive_link) VALUES (?, ?, ?, ?, ?, ?)').run(name, clientCode, agreement_type || 'recurring', notes || '', gmail_link || '', drive_link || '');
  logActivity('client', result.lastInsertRowid, 'created', author, `Created client "${name}"`);
  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid));
});

app.put('/api/clients/:id', (req, res) => {
  const { name, code, agreement_type, notes, logo_url, gmail_link, drive_link, author } = req.body;
  const old = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  db.prepare('UPDATE clients SET name = COALESCE(?, name), code = COALESCE(?, code), agreement_type = COALESCE(?, agreement_type), notes = COALESCE(?, notes), logo_url = COALESCE(?, logo_url), gmail_link = COALESCE(?, gmail_link), drive_link = COALESCE(?, drive_link) WHERE id = ?')
    .run(name, code, agreement_type, notes, logo_url, gmail_link, drive_link, req.params.id);
  const changes = [];
  if (name && name !== old.name) changes.push(`name: "${old.name}" → "${name}"`);
  if (code !== undefined && code !== old.code) changes.push(`code: "${old.code}" → "${code}"`);
  if (agreement_type && agreement_type !== old.agreement_type) changes.push(`type: ${old.agreement_type} → ${agreement_type}`);
  if (notes !== undefined && notes !== old.notes) changes.push('updated notes');
  if (changes.length) logActivity('client', req.params.id, 'updated', author, changes.join(', '));
  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id));
});

app.delete('/api/clients/:id', (req, res) => {
  const client = db.prepare('SELECT name FROM clients WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  logActivity('client', req.params.id, 'deleted', req.body.author, `Permanently deleted "${client?.name}"`);
  res.json({ success: true });
});

app.put('/api/clients/:id/archive', (req, res) => {
  const c = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  const ns = c.archived ? 0 : 1;
  db.prepare('UPDATE clients SET archived = ? WHERE id = ?').run(ns, req.params.id);
  logActivity('client', req.params.id, ns ? 'archived' : 'restored', req.body.author, `${ns ? 'archived' : 'restored'} "${c.name}"`);
  res.json({ success: true, archived: ns });
});

app.post('/api/clients/:id/logo', logoUpload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE clients SET logo_url = ? WHERE id = ?').run(url, req.params.id);
  res.json({ logo_url: url });
});

app.put('/api/clients/reorder', (req, res) => {
  const { order } = req.body;
  const stmt = db.prepare('UPDATE clients SET sort_order = ? WHERE id = ?');
  db.transaction((ids) => { ids.forEach((id, i) => stmt.run(i, id)); })(order);
  res.json({ success: true });
});

// ─── PROJECTS ──────────────────────────────────────────

app.post('/api/projects', (req, res) => {
  const { client_id, name, notes, author } = req.body;
  if (!client_id || !name) return res.status(400).json({ error: 'client_id and name required' });
  const result = db.prepare('INSERT INTO projects (client_id, name, notes) VALUES (?, ?, ?)').run(client_id, name, notes || '');
  logActivity('project', result.lastInsertRowid, 'created', author, `Created project "${name}"`);
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  p.tasks = []; p.archivedTasks = [];
  res.json(p);
});

app.put('/api/projects/:id', (req, res) => {
  const { name, status, notes, author } = req.body;
  const old = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  db.prepare('UPDATE projects SET name = COALESCE(?, name), status = COALESCE(?, status), notes = COALESCE(?, notes) WHERE id = ?').run(name, status, notes, req.params.id);
  const changes = [];
  if (name && name !== old.name) changes.push(`name: "${old.name}" → "${name}"`);
  if (status && status !== old.status) changes.push(`status: ${old.status} → ${status}`);
  if (changes.length) logActivity('project', req.params.id, 'updated', author, changes.join(', '));
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id));
});

app.delete('/api/projects/:id', (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.put('/api/projects/:id/archive', (req, res) => {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  const ns = p.archived ? 0 : 1;
  db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(ns, req.params.id);
  logActivity('project', req.params.id, ns ? 'archived' : 'restored', req.body.author, `${ns ? 'archived' : 'restored'} "${p.name}"`);
  res.json({ success: true, archived: ns });
});

// ─── TASKS ─────────────────────────────────────────────

app.post('/api/tasks', (req, res) => {
  const { project_id, title, assignee, deadline, planned_date, estimated_hours, priority, references_text, notes, is_recurring, recur_interval, recur_unit, author } = req.body;
  if (!project_id || !title) return res.status(400).json({ error: 'project_id and title required' });
  const result = db.prepare('INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, priority, references_text, notes, is_recurring, recur_interval, recur_unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    project_id, title, assignee || '', deadline || '', planned_date || '', estimated_hours || 0, priority || 'medium', references_text || '', notes || '', is_recurring ? 1 : 0, recur_interval || 0, recur_unit || ''
  );
  logActivity('task', result.lastInsertRowid, 'created', author, `Created task "${title}"`);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  task.comments = []; task.attachments = [];
  res.json(task);
});

app.put('/api/tasks/:id', (req, res) => {
  const { title, assignee, deadline, planned_date, estimated_hours, progress, priority, references_text, notes, is_recurring, recur_interval, recur_unit, author } = req.body;
  const old = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  db.prepare('UPDATE tasks SET title=COALESCE(?,title), assignee=COALESCE(?,assignee), deadline=COALESCE(?,deadline), planned_date=COALESCE(?,planned_date), estimated_hours=COALESCE(?,estimated_hours), progress=COALESCE(?,progress), priority=COALESCE(?,priority), references_text=COALESCE(?,references_text), notes=COALESCE(?,notes), is_recurring=COALESCE(?,is_recurring), recur_interval=COALESCE(?,recur_interval), recur_unit=COALESCE(?,recur_unit) WHERE id=?')
    .run(title, assignee, deadline, planned_date, estimated_hours, progress, priority, references_text, notes, is_recurring !== undefined ? (is_recurring ? 1 : 0) : null, recur_interval, recur_unit, req.params.id);

  const changes = [];
  if (title && title !== old.title) changes.push(`title changed`);
  if (assignee !== undefined && assignee !== old.assignee) changes.push(`assignee: "${old.assignee || 'none'}" → "${assignee || 'none'}"`);
  if (progress && progress !== old.progress) changes.push(`progress: ${old.progress} → ${progress}`);
  if (priority && priority !== old.priority) changes.push(`priority: ${old.priority} → ${priority}`);
  if (deadline !== undefined && deadline !== old.deadline) changes.push(`deadline changed`);
  if (changes.length) logActivity('task', req.params.id, 'updated', author, changes.join(', '));

  // Handle recurring: if task completed and is recurring, create next occurrence
  if (progress === 'completed' && old.progress !== 'completed' && old.is_recurring && old.recur_interval > 0) {
    const nextDate = calculateNextDate(old.deadline || old.planned_date || new Date().toISOString().split('T')[0], old.recur_interval, old.recur_unit);
    const newTask = db.prepare('INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, priority, references_text, notes, is_recurring, recur_interval, recur_unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      old.project_id, old.title, old.assignee, nextDate, nextDate, old.estimated_hours, old.priority, old.references_text, old.notes, 1, old.recur_interval, old.recur_unit
    );
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

app.delete('/api/tasks/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.put('/api/tasks/:id/archive', (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  const ns = t.archived ? 0 : 1;
  db.prepare('UPDATE tasks SET archived = ? WHERE id = ?').run(ns, req.params.id);
  logActivity('task', req.params.id, ns ? 'archived' : 'restored', req.body.author, `${ns ? 'archived' : 'restored'} "${t.title}"`);
  res.json({ success: true, archived: ns });
});

// ─── TASK ATTACHMENTS ──────────────────────────────────

app.post('/api/tasks/:id/attachments', attachUpload.array('files', 10), (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files' });
  const stmt = db.prepare('INSERT INTO task_attachments (task_id, filename, original_name, file_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)');
  const results = [];
  for (const file of req.files) {
    const r = stmt.run(req.params.id, file.filename, file.originalname, file.mimetype, file.size, req.body.author || 'System');
    results.push(db.prepare('SELECT * FROM task_attachments WHERE id = ?').get(r.lastInsertRowid));
  }
  logActivity('task', req.params.id, 'updated', req.body.author, `Uploaded ${req.files.length} file(s)`);
  res.json(results);
});

app.delete('/api/attachments/:id', (req, res) => {
  db.prepare('DELETE FROM task_attachments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── TODAY / CALENDAR ──────────────────────────────────

app.get('/api/tasks/by-date', (req, res) => {
  const { date, assignee } = req.query;
  const d = date || new Date().toISOString().split('T')[0];
  const q = assignee
    ? db.prepare('SELECT t.*, p.name as project_name, c.name as client_name, c.code as client_code, c.logo_url as client_logo FROM tasks t JOIN projects p ON t.project_id=p.id JOIN clients c ON p.client_id=c.id WHERE t.planned_date=? AND t.assignee=? AND t.archived=0 ORDER BY t.priority, t.sort_order')
    : db.prepare('SELECT t.*, p.name as project_name, c.name as client_name, c.code as client_code, c.logo_url as client_logo FROM tasks t JOIN projects p ON t.project_id=p.id JOIN clients c ON p.client_id=c.id WHERE t.planned_date=? AND t.archived=0 ORDER BY t.assignee, t.priority, t.sort_order');
  res.json(assignee ? q.all(d, assignee) : q.all(d));
});

app.get('/api/tasks/calendar', (req, res) => {
  const { start, end, assignee } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end required' });
  const q = assignee
    ? db.prepare('SELECT t.*, p.name as project_name, c.name as client_name, c.code as client_code, c.logo_url as client_logo FROM tasks t JOIN projects p ON t.project_id=p.id JOIN clients c ON p.client_id=c.id WHERE t.archived=0 AND t.assignee=? AND (t.planned_date BETWEEN ? AND ? OR t.deadline BETWEEN ? AND ?) ORDER BY t.planned_date, t.deadline')
    : db.prepare('SELECT t.*, p.name as project_name, c.name as client_name, c.code as client_code, c.logo_url as client_logo FROM tasks t JOIN projects p ON t.project_id=p.id JOIN clients c ON p.client_id=c.id WHERE t.archived=0 AND (t.planned_date BETWEEN ? AND ? OR t.deadline BETWEEN ? AND ?) ORDER BY t.planned_date, t.deadline');
  res.json(assignee ? q.all(assignee, start, end, start, end) : q.all(start, end, start, end));
});

// ─── COMMENTS ──────────────────────────────────────────

app.post('/api/tasks/:id/comments', (req, res) => {
  const { author, content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });
  const r = db.prepare('INSERT INTO comments (task_id, author, content) VALUES (?, ?, ?)').run(req.params.id, author || 'System', content);
  logActivity('task', req.params.id, 'commented', author, content.substring(0, 100));
  res.json(db.prepare('SELECT * FROM comments WHERE id = ?').get(r.lastInsertRowid));
});

// ─── ACTIVITY ──────────────────────────────────────────

app.get('/api/clients/:id/history', (req, res) => {
  const cid = req.params.id;
  const limit = parseInt(req.query.limit) || 100;
  const pids = db.prepare('SELECT id FROM projects WHERE client_id = ?').all(cid).map(p => p.id);
  let tids = [];
  if (pids.length > 0) tids = db.prepare(`SELECT id FROM tasks WHERE project_id IN (${pids.map(() => '?').join(',')})`).all(...pids).map(t => t.id);
  const conds = ["(entity_type='client' AND entity_id=?)"];
  const params = [cid];
  if (pids.length) { conds.push(`(entity_type='project' AND entity_id IN (${pids.map(() => '?').join(',')}))`); params.push(...pids); }
  if (tids.length) { conds.push(`(entity_type='task' AND entity_id IN (${tids.map(() => '?').join(',')}))`); params.push(...tids); }
  params.push(limit);
  res.json(db.prepare(`SELECT * FROM activity_log WHERE ${conds.join(' OR ')} ORDER BY created_at DESC LIMIT ?`).all(...params));
});

// ─── TEAM ──────────────────────────────────────────────

app.get('/api/team', (req, res) => { res.json(db.prepare('SELECT * FROM team_members ORDER BY name').all()); });
app.post('/api/team', (req, res) => {
  const { name, role, avatar_color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const r = db.prepare('INSERT INTO team_members (name, role, avatar_color) VALUES (?, ?, ?)').run(name, role || '', avatar_color || '#6366f1');
  res.json(db.prepare('SELECT * FROM team_members WHERE id = ?').get(r.lastInsertRowid));
});
app.delete('/api/team/:id', (req, res) => { db.prepare('DELETE FROM team_members WHERE id = ?').run(req.params.id); res.json({ success: true }); });

// ─── ARCHIVED ──────────────────────────────────────────

app.get('/api/archived/clients', (req, res) => { res.json(db.prepare('SELECT * FROM clients WHERE archived = 1 ORDER BY name').all()); });

// ─── USER MANAGEMENT ─────────────────────────────────

// Avatar upload
const avatarStorage = multer.diskStorage({
  destination: join(__dirname, 'public', 'uploads'),
  filename: (req, file, cb) => cb(null, `avatar-${Date.now()}.${file.originalname.split('.').pop()}`)
});
const avatarUpload = multer({ storage: avatarStorage, limits: { fileSize: 2 * 1024 * 1024 } });

app.get('/api/users', (req, res) => {
  const users = db.prepare('SELECT id, username, email, display_name, role, avatar_url, avatar_color FROM users ORDER BY display_name').all();
  res.json(users);
});

app.put('/api/users/:id', requireAuth, requireRole('owner'), (req, res) => {
  const { display_name, role, email } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('UPDATE users SET display_name = COALESCE(?, display_name), role = COALESCE(?, role), email = COALESCE(?, email) WHERE id = ?')
    .run(display_name, role, email, req.params.id);
  res.json(db.prepare('SELECT id, username, email, display_name, role, avatar_url, avatar_color FROM users WHERE id = ?').get(req.params.id));
});

app.put('/api/users/:id/password', requireAuth, (req, res) => {
  // Users can change own password, owners can change anyone's
  if (req.user.id !== parseInt(req.params.id) && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Cannot change other users\' passwords' });
  }
  const { password } = req.body;
  if (!password || password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), req.params.id);
  res.json({ success: true });
});

app.post('/api/users/:id/avatar', requireAuth, avatarUpload.single('avatar'), (req, res) => {
  // Users can upload own avatar, owners can do anyone's
  if (req.user.id !== parseInt(req.params.id) && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(url, req.params.id);
  res.json({ avatar_url: url });
});

app.post('/api/users', requireAuth, requireRole('owner'), (req, res) => {
  const { username, email, password, display_name, role } = req.body;
  if (!username || !email || !password || !display_name) return res.status(400).json({ error: 'All fields required' });
  try {
    const r = db.prepare('INSERT INTO users (username, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)')
      .run(username, email.toLowerCase().trim(), hashPassword(password), display_name, role || 'editor');
    res.json(db.prepare('SELECT id, username, email, display_name, role, avatar_url, avatar_color FROM users WHERE id = ?').get(r.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: 'Username or email already exists' });
  }
});

app.delete('/api/users/:id', requireAuth, requireRole('owner'), (req, res) => {
  if (req.user.id === parseInt(req.params.id)) return res.status(400).json({ error: 'Cannot delete yourself' });
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── SEED ──────────────────────────────────────────────

function seedIfEmpty() {
  if (db.prepare('SELECT COUNT(*) as c FROM clients').get().c > 0) return;

  // Seed users
  if (db.prepare('SELECT COUNT(*) as c FROM users').get().c === 0) {
    db.prepare("INSERT INTO users (username, email, password_hash, display_name, role, avatar_color) VALUES ('norton', 'norton@northbearmedia.co.uk', ?, 'Norton', 'owner', '#8b5cf6')").run(hashPassword('nbm2026'));
    db.prepare("INSERT INTO users (username, email, password_hash, display_name, role, avatar_color) VALUES ('cally', 'cally@northbearmedia.co.uk', ?, 'Cally', 'editor', '#f97066')").run(hashPassword('nbm2026'));
    db.prepare("INSERT INTO users (username, email, password_hash, display_name, role, avatar_color) VALUES ('haley', 'haley@northbearmedia.co.uk', ?, 'Haley', 'editor', '#34d399')").run(hashPassword('nbm2026'));
  }

  db.prepare("INSERT INTO team_members (name, role, avatar_color) VALUES ('Norton', 'Director', '#6366f1')").run();
  db.prepare("INSERT INTO team_members (name, role, avatar_color) VALUES ('Sarah', 'Content Manager', '#ec4899')").run();
  db.prepare("INSERT INTO team_members (name, role, avatar_color) VALUES ('James', 'Designer', '#f59e0b')").run();
  db.prepare("INSERT INTO team_members (name, role, avatar_color) VALUES ('Lucy', 'Social Media', '#22c55e')").run();

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 864e5).toISOString().split('T')[0];

  const nbm = db.prepare("INSERT INTO clients (name, code, agreement_type, notes, gmail_link, drive_link, sort_order) VALUES ('NorthBear Media', 'NBM', 'recurring', 'Internal business operations — general tasks, admin, strategy, and growth.', 'https://mail.google.com/mail/u/0/#label/NorthBear+Media', 'https://drive.google.com/drive/folders/northbearmedia', 0)").run();
  const nbmOps = db.prepare("INSERT INTO projects (client_id, name, notes) VALUES (?, 'General Operations', 'Day-to-day business tasks')").run(nbm.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, priority, notes) VALUES (?, 'Set up project management system', 'Norton', '2026-04-06', '2026-04-06', 2, 'completed', 'high', 'Get the team organized')`).run(nbmOps.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, priority, notes) VALUES (?, 'Quarterly strategy review', 'Norton', '2026-04-30', '${today}', 3, 'not-started', 'high', 'Review Q1 performance')`).run(nbmOps.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, priority, notes) VALUES (?, 'Update company portfolio', 'James', '2026-04-15', '${today}', 4, 'in-progress', 'medium', 'Add latest case studies')`).run(nbmOps.lastInsertRowid);
  const nbmSocial = db.prepare("INSERT INTO projects (client_id, name, notes) VALUES (?, 'NBM Social Media', 'Our own social presence')").run(nbm.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, priority, notes, is_recurring, recur_interval, recur_unit) VALUES (?, 'Monthly content calendar', 'Lucy', '2026-04-07', '${today}', 2, 'in-progress', 'high', 'Plan posts for the month', 1, 1, 'months')`).run(nbmSocial.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, priority, notes) VALUES (?, 'Record behind-the-scenes reels', 'Sarah', '2026-04-12', '${tomorrow}', 3, 'not-started', 'medium', 'Instagram content')`).run(nbmSocial.lastInsertRowid);

  const rms = db.prepare("INSERT INTO clients (name, code, agreement_type, notes, gmail_link, drive_link, sort_order) VALUES ('RMS Fire Blankets', 'RMS', 'recurring', 'Fire safety company. Monthly social media, content, and ads. Retainer.', 'https://mail.google.com/mail/u/0/#label/RMS', 'https://drive.google.com/drive/folders/rms', 1)").run();
  const rmsSocial = db.prepare("INSERT INTO projects (client_id, name, notes) VALUES (?, 'Social Media Management', 'Monthly content and community management')").run(rms.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, priority, notes) VALUES (?, 'April social content batch', 'Lucy', '2026-04-10', '${today}', 5, 'in-progress', 'high', 'Create 12 posts for FB/IG')`).run(rmsSocial.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, priority, notes) VALUES (?, 'Product photography shoot', 'James', '2026-04-14', '${tomorrow}', 6, 'not-started', 'medium', 'New range — lifestyle shots')`).run(rmsSocial.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, priority, notes) VALUES (?, 'Facebook ad campaign — Spring', 'Lucy', '2026-04-08', '${today}', 2, 'awaiting-client', 'high', 'Awaiting creative approval from client')`).run(rmsSocial.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, estimated_hours, progress, priority, notes, is_recurring, recur_interval, recur_unit) VALUES (?, 'Monthly performance report', 'Sarah', '2026-04-05', 1, 'completed', 'medium', 'Analytics summary', 1, 1, 'months')`).run(rmsSocial.lastInsertRowid);
  const rmsWeb = db.prepare("INSERT INTO projects (client_id, name, notes) VALUES (?, 'Website Updates', 'Ongoing maintenance')").run(rms.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, priority, notes) VALUES (?, 'Add new product pages', 'Norton', '2026-04-20', '${tomorrow}', 4, 'not-started', 'medium', 'New commercial range')`).run(rmsWeb.lastInsertRowid);

  const spotted = db.prepare("INSERT INTO clients (name, code, agreement_type, notes, sort_order) VALUES ('Spotted Community Pages', 'SCP', 'recurring', 'AI-powered moderation for community Facebook pages.', 2)").run();
  const spottedMod = db.prepare("INSERT INTO projects (client_id, name, notes) VALUES (?, 'AI Moderation System', 'Automated moderation using Claude AI')").run(spotted.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, priority, notes) VALUES (?, 'Fine-tune moderation threshold', 'Norton', '2026-04-10', '${today}', 3, 'in-progress', 'critical', 'Reduce false positives')`).run(spottedMod.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, estimated_hours, progress, priority, notes) VALUES (?, 'Add Spotted Darlington', 'Norton', '2026-04-15', 2, 'awaiting-manager', 'medium', 'Awaiting approval to onboard')`).run(spottedMod.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, priority, notes, is_recurring, recur_interval, recur_unit) VALUES (?, 'Weekly moderation report', 'Sarah', '2026-04-07', '${today}', 1, 'not-started', 'high', 'Summary of flagged posts', 1, 1, 'weeks')`).run(spottedMod.lastInsertRowid);

  const adhoc1 = db.prepare("INSERT INTO clients (name, code, agreement_type, notes, sort_order) VALUES ('The Garden Kitchen', 'TGK', 'ad-hoc', 'Local restaurant. Menu redesign and social media launch.', 3)").run();
  const gkMenu = db.prepare("INSERT INTO projects (client_id, name, notes) VALUES (?, 'Menu Redesign & Launch', 'Brand refresh + social launch')").run(adhoc1.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, priority, notes) VALUES (?, 'Menu design — first draft', 'James', '2026-04-12', '${today}', 6, 'in-progress', 'high', 'A3 folded menu')`).run(gkMenu.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, estimated_hours, progress, priority, notes) VALUES (?, 'Food photography session', 'James', '2026-04-18', 4, 'not-started', 'medium', 'On-location shoot')`).run(gkMenu.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, estimated_hours, progress, priority, notes) VALUES (?, 'Social media launch pack', 'Lucy', '2026-04-22', 5, 'not-started', 'medium', '10 launch posts')`).run(gkMenu.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, estimated_hours, progress, priority, notes) VALUES (?, 'Client sign-off meeting', 'Norton', '2026-04-25', 1, 'not-started', 'low', 'Present final designs')`).run(gkMenu.lastInsertRowid);

  const build = db.prepare("INSERT INTO clients (name, code, agreement_type, notes, sort_order) VALUES ('Hartlepool Builders Ltd', 'HBL', 'recurring', 'Construction company. Monthly social and quarterly video. 12-month retainer.', 4)").run();
  const buildSocial = db.prepare("INSERT INTO projects (client_id, name, notes) VALUES (?, 'Social Media Management', 'Monthly content creation')").run(build.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, priority, notes) VALUES (?, 'April — before/after gallery', 'Lucy', '2026-04-09', '${today}', 3, 'in-progress', 'high', 'Kitchen reno posts')`).run(buildSocial.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, estimated_hours, progress, priority, notes) VALUES (?, 'Drone footage — new build', 'Norton', '2026-04-16', 4, 'not-started', 'medium', 'Aerial progress shots')`).run(buildSocial.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, priority, notes) VALUES (?, 'Google review campaign', 'Sarah', '2026-04-11', '${today}', 2, 'stuck', 'high', 'Waiting on client email list')`).run(buildSocial.lastInsertRowid);

  // Comments
  const findTask = (s) => db.prepare('SELECT id FROM tasks WHERE title LIKE ?').get(`%${s}%`);
  const t1 = findTask('Set up project management'); if (t1) db.prepare("INSERT INTO comments (task_id, author, content) VALUES (?, 'Norton', 'System is live. Moving to completed.')").run(t1.id);
  const t2 = findTask('Update company portfolio'); if (t2) db.prepare("INSERT INTO comments (task_id, author, content) VALUES (?, 'James', 'Started layouts, first draft by Wednesday.')").run(t2.id);
  const t3 = findTask('April social content'); if (t3) db.prepare("INSERT INTO comments (task_id, author, content) VALUES (?, 'Lucy', 'Got 8 of 12 done, rest tomorrow.')").run(t3.id);
  const t4 = findTask('Google review campaign'); if (t4) { db.prepare("INSERT INTO comments (task_id, author, content) VALUES (?, 'Sarah', 'Chased twice — still waiting.')").run(t4.id); db.prepare("INSERT INTO comments (task_id, author, content) VALUES (?, 'Norton', 'Will call Monday if no response.')").run(t4.id); }

  logActivity('client', nbm.lastInsertRowid, 'created', 'Norton', 'Created "NorthBear Media"');
  logActivity('client', rms.lastInsertRowid, 'created', 'Norton', 'Created "RMS Fire Blankets"');
  logActivity('client', spotted.lastInsertRowid, 'created', 'Norton', 'Created "Spotted Community Pages"');
  logActivity('client', adhoc1.lastInsertRowid, 'created', 'Norton', 'Created "The Garden Kitchen"');
  logActivity('client', build.lastInsertRowid, 'created', 'Norton', 'Created "Hartlepool Builders Ltd"');
}

// Always ensure users exist
function seedUsers() {
  if (db.prepare('SELECT COUNT(*) as c FROM users').get().c === 0) {
    db.prepare("INSERT INTO users (username, email, password_hash, display_name, role, avatar_color) VALUES ('norton', 'norton@northbearmedia.co.uk', ?, 'Norton', 'owner', '#8b5cf6')").run(hashPassword('nbm2026'));
    db.prepare("INSERT INTO users (username, email, password_hash, display_name, role, avatar_color) VALUES ('cally', 'cally@northbearmedia.co.uk', ?, 'Cally', 'editor', '#f97066')").run(hashPassword('nbm2026'));
    db.prepare("INSERT INTO users (username, email, password_hash, display_name, role, avatar_color) VALUES ('haley', 'haley@northbearmedia.co.uk', ?, 'Haley', 'editor', '#34d399')").run(hashPassword('nbm2026'));
    console.log('Default users created (password: nbm2026)');
  }
}

seedUsers();
seedIfEmpty();
app.listen(PORT, () => { console.log(`NorthBear Media Project Management running at http://localhost:${PORT}`); });
