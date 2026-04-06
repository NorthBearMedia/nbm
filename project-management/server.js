import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import multer from 'multer';
import db from './database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: join(__dirname, 'public', 'uploads'),
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop();
    cb(null, `logo-${Date.now()}.${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } });

import { mkdirSync } from 'fs';
mkdirSync(join(__dirname, 'public', 'uploads'), { recursive: true });

function logActivity(entityType, entityId, action, author, details) {
  db.prepare('INSERT INTO activity_log (entity_type, entity_id, action, author, details) VALUES (?, ?, ?, ?, ?)')
    .run(entityType, entityId, action, author || 'System', details || '');
}

// ─── CLIENTS ───────────────────────────────────────────

app.get('/api/clients', (req, res) => {
  const { filter, include_archived } = req.query;
  const archivedClause = include_archived === '1' ? '' : 'AND archived = 0';
  let clients;
  if (filter && ['recurring', 'ad-hoc'].includes(filter)) {
    clients = db.prepare(`SELECT * FROM clients WHERE agreement_type = ? ${archivedClause} ORDER BY sort_order, name`).all(filter);
  } else {
    clients = db.prepare(`SELECT * FROM clients WHERE 1=1 ${archivedClause} ORDER BY sort_order, name`).all();
  }

  const projectsStmt = db.prepare('SELECT * FROM projects WHERE client_id = ? AND archived = 0 ORDER BY sort_order, name');
  const archivedProjectsStmt = db.prepare('SELECT * FROM projects WHERE client_id = ? AND archived = 1 ORDER BY sort_order, name');
  const tasksStmt = db.prepare('SELECT * FROM tasks WHERE project_id = ? AND archived = 0 ORDER BY sort_order, created_at');
  const archivedTasksStmt = db.prepare('SELECT * FROM tasks WHERE project_id = ? AND archived = 1 ORDER BY sort_order, created_at');
  const commentsStmt = db.prepare('SELECT * FROM comments WHERE task_id = ? ORDER BY created_at DESC');

  for (const client of clients) {
    client.projects = projectsStmt.all(client.id);
    client.archivedProjects = archivedProjectsStmt.all(client.id);
    let totalTasks = 0, completedTasks = 0, overdueTasks = 0, inProgressTasks = 0, blockedTasks = 0;
    const now = new Date().toISOString().split('T')[0];

    for (const project of [...client.projects, ...client.archivedProjects]) {
      project.tasks = tasksStmt.all(project.id);
      project.archivedTasks = archivedTasksStmt.all(project.id);
      for (const task of [...project.tasks, ...project.archivedTasks]) {
        task.comments = commentsStmt.all(task.id);
      }
      if (!project.archived) {
        for (const task of project.tasks) {
          totalTasks++;
          if (task.progress === 'completed' || task.progress === 'invoiced') completedTasks++;
          if (task.progress === 'in-progress') inProgressTasks++;
          if (task.progress === 'blocked') blockedTasks++;
          if (task.deadline && task.deadline < now && task.progress !== 'completed' && task.progress !== 'invoiced') overdueTasks++;
        }
      }
    }
    client.stats = { totalTasks, completedTasks, overdueTasks, inProgressTasks, blockedTasks, outstandingTasks: totalTasks - completedTasks };
  }

  res.json(clients);
});

app.post('/api/clients', (req, res) => {
  const { name, agreement_type, notes, gmail_link, drive_link, author } = req.body;
  if (!name) return res.status(400).json({ error: 'Client name is required' });
  const result = db.prepare('INSERT INTO clients (name, agreement_type, notes, gmail_link, drive_link) VALUES (?, ?, ?, ?, ?)').run(
    name, agreement_type || 'recurring', notes || '', gmail_link || '', drive_link || ''
  );
  logActivity('client', result.lastInsertRowid, 'created', author, `Created client "${name}"`);
  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid));
});

app.put('/api/clients/:id', (req, res) => {
  const { name, agreement_type, notes, logo_url, gmail_link, drive_link, author } = req.body;
  const old = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  db.prepare('UPDATE clients SET name = COALESCE(?, name), agreement_type = COALESCE(?, agreement_type), notes = COALESCE(?, notes), logo_url = COALESCE(?, logo_url), gmail_link = COALESCE(?, gmail_link), drive_link = COALESCE(?, drive_link) WHERE id = ?')
    .run(name, agreement_type, notes, logo_url, gmail_link, drive_link, req.params.id);
  const changes = [];
  if (name && name !== old.name) changes.push(`name: "${old.name}" → "${name}"`);
  if (agreement_type && agreement_type !== old.agreement_type) changes.push(`type: ${old.agreement_type} → ${agreement_type}`);
  if (notes !== undefined && notes !== old.notes) changes.push('updated notes');
  if (gmail_link !== undefined && gmail_link !== old.gmail_link) changes.push('updated Gmail link');
  if (drive_link !== undefined && drive_link !== old.drive_link) changes.push('updated Drive link');
  if (changes.length) logActivity('client', req.params.id, 'updated', author, changes.join(', '));
  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id));
});

app.delete('/api/clients/:id', (req, res) => {
  const client = db.prepare('SELECT name FROM clients WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  logActivity('client', req.params.id, 'deleted', req.body.author, `Permanently deleted client "${client?.name}"`);
  res.json({ success: true });
});

app.put('/api/clients/:id/archive', (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  const newState = client.archived ? 0 : 1;
  db.prepare('UPDATE clients SET archived = ? WHERE id = ?').run(newState, req.params.id);
  logActivity('client', req.params.id, newState ? 'archived' : 'restored', req.body.author, `${newState ? 'archived' : 'restored'} client "${client.name}"`);
  res.json({ success: true, archived: newState });
});

app.post('/api/clients/:id/logo', upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const logoUrl = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE clients SET logo_url = ? WHERE id = ?').run(logoUrl, req.params.id);
  logActivity('client', req.params.id, 'updated', 'System', 'Updated logo');
  res.json({ logo_url: logoUrl });
});

// Client sort order
app.put('/api/clients/reorder', (req, res) => {
  const { order } = req.body; // array of client IDs in desired order
  const stmt = db.prepare('UPDATE clients SET sort_order = ? WHERE id = ?');
  const updateMany = db.transaction((ids) => {
    ids.forEach((id, i) => stmt.run(i, id));
  });
  updateMany(order);
  res.json({ success: true });
});

// ─── PROJECTS ──────────────────────────────────────────

app.post('/api/projects', (req, res) => {
  const { client_id, name, notes, author } = req.body;
  if (!client_id || !name) return res.status(400).json({ error: 'client_id and name are required' });
  const result = db.prepare('INSERT INTO projects (client_id, name, notes) VALUES (?, ?, ?)').run(client_id, name, notes || '');
  logActivity('project', result.lastInsertRowid, 'created', author, `Created project "${name}"`);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  project.tasks = []; project.archivedTasks = [];
  res.json(project);
});

app.put('/api/projects/:id', (req, res) => {
  const { name, status, notes, author } = req.body;
  const old = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  db.prepare('UPDATE projects SET name = COALESCE(?, name), status = COALESCE(?, status), notes = COALESCE(?, notes) WHERE id = ?')
    .run(name, status, notes, req.params.id);
  const changes = [];
  if (name && name !== old.name) changes.push(`name: "${old.name}" → "${name}"`);
  if (status && status !== old.status) changes.push(`status: ${old.status} → ${status}`);
  if (notes !== undefined && notes !== old.notes) changes.push('updated notes');
  if (changes.length) logActivity('project', req.params.id, 'updated', author, changes.join(', '));
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  project.tasks = db.prepare('SELECT * FROM tasks WHERE project_id = ? AND archived = 0 ORDER BY sort_order, created_at').all(project.id);
  project.archivedTasks = db.prepare('SELECT * FROM tasks WHERE project_id = ? AND archived = 1 ORDER BY sort_order, created_at').all(project.id);
  res.json(project);
});

app.delete('/api/projects/:id', (req, res) => {
  const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  logActivity('project', req.params.id, 'deleted', req.body.author, `Permanently deleted project "${project?.name}"`);
  res.json({ success: true });
});

app.put('/api/projects/:id/archive', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  const newState = project.archived ? 0 : 1;
  db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(newState, req.params.id);
  logActivity('project', req.params.id, newState ? 'archived' : 'restored', req.body.author, `${newState ? 'archived' : 'restored'} project "${project.name}"`);
  res.json({ success: true, archived: newState });
});

// ─── TASKS ─────────────────────────────────────────────

app.post('/api/tasks', (req, res) => {
  const { project_id, title, assignee, deadline, planned_date, estimated_hours, references_text, notes, author } = req.body;
  if (!project_id || !title) return res.status(400).json({ error: 'project_id and title are required' });
  const result = db.prepare('INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, references_text, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    project_id, title, assignee || '', deadline || '', planned_date || '', estimated_hours || 0, references_text || '', notes || ''
  );
  logActivity('task', result.lastInsertRowid, 'created', author, `Created task "${title}"`);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  task.comments = [];
  res.json(task);
});

app.put('/api/tasks/:id', (req, res) => {
  const { title, assignee, deadline, planned_date, estimated_hours, progress, references_text, notes, author } = req.body;
  const old = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  db.prepare('UPDATE tasks SET title = COALESCE(?, title), assignee = COALESCE(?, assignee), deadline = COALESCE(?, deadline), planned_date = COALESCE(?, planned_date), estimated_hours = COALESCE(?, estimated_hours), progress = COALESCE(?, progress), references_text = COALESCE(?, references_text), notes = COALESCE(?, notes) WHERE id = ?')
    .run(title, assignee, deadline, planned_date, estimated_hours, progress, references_text, notes, req.params.id);
  const changes = [];
  if (title && title !== old.title) changes.push(`title: "${old.title}" → "${title}"`);
  if (assignee !== undefined && assignee !== old.assignee) changes.push(`assignee: "${old.assignee || 'none'}" → "${assignee || 'none'}"`);
  if (deadline !== undefined && deadline !== old.deadline) changes.push(`deadline: ${old.deadline || 'none'} → ${deadline || 'none'}`);
  if (planned_date !== undefined && planned_date !== old.planned_date) changes.push(`planned: ${old.planned_date || 'none'} → ${planned_date || 'none'}`);
  if (estimated_hours !== undefined && estimated_hours !== old.estimated_hours) changes.push(`est. hours: ${old.estimated_hours || 0} → ${estimated_hours || 0}`);
  if (progress && progress !== old.progress) changes.push(`progress: ${old.progress} → ${progress}`);
  if (changes.length) logActivity('task', req.params.id, 'updated', author, changes.join(', '));
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  task.comments = db.prepare('SELECT * FROM comments WHERE task_id = ? ORDER BY created_at DESC').all(task.id);
  res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT title FROM tasks WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  logActivity('task', req.params.id, 'deleted', req.body.author, `Permanently deleted task "${task?.title}"`);
  res.json({ success: true });
});

app.put('/api/tasks/:id/archive', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  const newState = task.archived ? 0 : 1;
  db.prepare('UPDATE tasks SET archived = ? WHERE id = ?').run(newState, req.params.id);
  logActivity('task', req.params.id, newState ? 'archived' : 'restored', req.body.author, `${newState ? 'archived' : 'restored'} task "${task.title}"`);
  res.json({ success: true, archived: newState });
});

// ─── TODAY / CALENDAR VIEWS ────────────────────────────

// Get tasks for a specific date (or today) optionally filtered by assignee
app.get('/api/tasks/by-date', (req, res) => {
  const { date, assignee } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];
  let tasks;
  if (assignee) {
    tasks = db.prepare(`
      SELECT t.*, p.name as project_name, c.name as client_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      WHERE t.planned_date = ? AND t.assignee = ? AND t.archived = 0
      ORDER BY t.sort_order, t.created_at
    `).all(targetDate, assignee);
  } else {
    tasks = db.prepare(`
      SELECT t.*, p.name as project_name, c.name as client_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      WHERE t.planned_date = ? AND t.archived = 0
      ORDER BY t.assignee, t.sort_order, t.created_at
    `).all(targetDate);
  }
  res.json(tasks);
});

// Get tasks for a date range (for calendar view)
app.get('/api/tasks/calendar', (req, res) => {
  const { start, end, assignee } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end dates required' });
  let tasks;
  if (assignee) {
    tasks = db.prepare(`
      SELECT t.*, p.name as project_name, c.name as client_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      WHERE t.archived = 0 AND t.assignee = ?
      AND (t.planned_date BETWEEN ? AND ? OR t.deadline BETWEEN ? AND ?)
      ORDER BY t.planned_date, t.deadline
    `).all(assignee, start, end, start, end);
  } else {
    tasks = db.prepare(`
      SELECT t.*, p.name as project_name, c.name as client_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      WHERE t.archived = 0
      AND (t.planned_date BETWEEN ? AND ? OR t.deadline BETWEEN ? AND ?)
      ORDER BY t.planned_date, t.deadline
    `).all(start, end, start, end);
  }
  res.json(tasks);
});

// ─── COMMENTS ──────────────────────────────────────────

app.get('/api/tasks/:id/comments', (req, res) => {
  res.json(db.prepare('SELECT * FROM comments WHERE task_id = ? ORDER BY created_at DESC').all(req.params.id));
});

app.post('/api/tasks/:id/comments', (req, res) => {
  const { author, content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content is required' });
  const result = db.prepare('INSERT INTO comments (task_id, author, content) VALUES (?, ?, ?)').run(req.params.id, author || 'System', content);
  logActivity('task', req.params.id, 'commented', author, content.substring(0, 100));
  res.json(db.prepare('SELECT * FROM comments WHERE id = ?').get(result.lastInsertRowid));
});

// ─── ACTIVITY LOG ──────────────────────────────────────

app.get('/api/activity', (req, res) => {
  const { entity_type, entity_id, limit } = req.query;
  let query = 'SELECT * FROM activity_log';
  const params = [];
  const conditions = [];
  if (entity_type) { conditions.push('entity_type = ?'); params.push(entity_type); }
  if (entity_id) { conditions.push('entity_id = ?'); params.push(entity_id); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit) || 50);
  res.json(db.prepare(query).all(...params));
});

app.get('/api/clients/:id/history', (req, res) => {
  const clientId = req.params.id;
  const limit = parseInt(req.query.limit) || 100;
  const projectIds = db.prepare('SELECT id FROM projects WHERE client_id = ?').all(clientId).map(p => p.id);
  let taskIds = [];
  if (projectIds.length > 0) {
    taskIds = db.prepare(`SELECT id FROM tasks WHERE project_id IN (${projectIds.map(() => '?').join(',')})`).all(...projectIds).map(t => t.id);
  }
  const conditions = ["(entity_type = 'client' AND entity_id = ?)"];
  const params = [clientId];
  if (projectIds.length > 0) {
    conditions.push(`(entity_type = 'project' AND entity_id IN (${projectIds.map(() => '?').join(',')}))`);
    params.push(...projectIds);
  }
  if (taskIds.length > 0) {
    conditions.push(`(entity_type = 'task' AND entity_id IN (${taskIds.map(() => '?').join(',')}))`);
    params.push(...taskIds);
  }
  params.push(limit);
  res.json(db.prepare(`SELECT * FROM activity_log WHERE ${conditions.join(' OR ')} ORDER BY created_at DESC LIMIT ?`).all(...params));
});

// ─── TEAM MEMBERS ──────────────────────────────────────

app.get('/api/team', (req, res) => {
  res.json(db.prepare('SELECT * FROM team_members ORDER BY name').all());
});

app.post('/api/team', (req, res) => {
  const { name, role, avatar_color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const result = db.prepare('INSERT INTO team_members (name, role, avatar_color) VALUES (?, ?, ?)').run(name, role || '', avatar_color || '#6366f1');
  res.json(db.prepare('SELECT * FROM team_members WHERE id = ?').get(result.lastInsertRowid));
});

app.delete('/api/team/:id', (req, res) => {
  db.prepare('DELETE FROM team_members WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── ARCHIVED ──────────────────────────────────────────

app.get('/api/archived/clients', (req, res) => {
  res.json(db.prepare('SELECT * FROM clients WHERE archived = 1 ORDER BY name').all());
});

// ─── SEED DATA ─────────────────────────────────────────

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) as c FROM clients').get().c;
  if (count > 0) return;

  db.prepare("INSERT INTO team_members (name, role, avatar_color) VALUES ('Norton', 'Director', '#6366f1')").run();
  db.prepare("INSERT INTO team_members (name, role, avatar_color) VALUES ('Sarah', 'Content Manager', '#ec4899')").run();
  db.prepare("INSERT INTO team_members (name, role, avatar_color) VALUES ('James', 'Designer', '#f59e0b')").run();
  db.prepare("INSERT INTO team_members (name, role, avatar_color) VALUES ('Lucy', 'Social Media', '#22c55e')").run();

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const nbm = db.prepare("INSERT INTO clients (name, agreement_type, notes, gmail_link, drive_link, sort_order) VALUES ('NorthBear Media', 'recurring', 'Internal business operations — general tasks, admin, strategy, and growth.', 'https://mail.google.com/mail/u/0/#label/NorthBear+Media', 'https://drive.google.com/drive/folders/northbearmedia', 0)").run();
  const nbmOps = db.prepare("INSERT INTO projects (client_id, name, notes) VALUES (?, 'General Operations', 'Day-to-day business tasks and admin')").run(nbm.lastInsertRowid);
  db.prepare("INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, notes) VALUES (?, 'Set up project management system', 'Norton', '2026-04-06', '2026-04-06', 2, 'completed', 'Get the team organized')").run(nbmOps.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, notes) VALUES (?, 'Quarterly strategy review', 'Norton', '2026-04-30', '${today}', 3, 'not-started', 'Review Q1 performance')`).run(nbmOps.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, notes) VALUES (?, 'Update company portfolio', 'James', '2026-04-15', '${today}', 4, 'in-progress', 'Add latest case studies')`).run(nbmOps.lastInsertRowid);

  const nbmSocial = db.prepare("INSERT INTO projects (client_id, name, notes) VALUES (?, 'NBM Social Media', 'Our own social media presence')").run(nbm.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, notes) VALUES (?, 'April content calendar', 'Lucy', '2026-04-07', '${today}', 2, 'in-progress', 'Plan and schedule posts')`).run(nbmSocial.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, notes) VALUES (?, 'Record behind-the-scenes reels', 'Sarah', '2026-04-12', '${tomorrow}', 3, 'not-started', 'Instagram content')`).run(nbmSocial.lastInsertRowid);

  const rms = db.prepare("INSERT INTO clients (name, agreement_type, notes, gmail_link, drive_link, sort_order) VALUES ('RMS Fire Blankets', 'recurring', 'Fire safety product company. Monthly social media management and ad campaigns. Retainer.', 'https://mail.google.com/mail/u/0/#label/RMS+Fire+Blankets', 'https://drive.google.com/drive/folders/rms-fire-blankets', 1)").run();
  const rmsSocial = db.prepare("INSERT INTO projects (client_id, name, notes) VALUES (?, 'Social Media Management', 'Monthly content and community management')").run(rms.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, notes) VALUES (?, 'April social media content batch', 'Lucy', '2026-04-10', '${today}', 5, 'in-progress', 'Create 12 posts for FB and IG')`).run(rmsSocial.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, notes) VALUES (?, 'Product photography shoot', 'James', '2026-04-14', '${tomorrow}', 6, 'not-started', 'New fire blanket range shots')`).run(rmsSocial.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, notes) VALUES (?, 'Facebook ad campaign — Spring', 'Lucy', '2026-04-08', '${today}', 2, 'in-progress', 'Targeting homeowners, £500 budget')`).run(rmsSocial.lastInsertRowid);
  db.prepare("INSERT INTO tasks (project_id, title, assignee, deadline, estimated_hours, progress, notes) VALUES (?, 'Monthly performance report — March', 'Sarah', '2026-04-05', 1, 'completed', 'Analytics summary sent')").run(rmsSocial.lastInsertRowid);
  const rmsWeb = db.prepare("INSERT INTO projects (client_id, name, notes) VALUES (?, 'Website Updates', 'Ongoing maintenance')").run(rms.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, notes) VALUES (?, 'Add new product pages', 'Norton', '2026-04-20', '${tomorrow}', 4, 'not-started', 'New commercial range pages')`).run(rmsWeb.lastInsertRowid);

  const spotted = db.prepare("INSERT INTO clients (name, agreement_type, notes, sort_order) VALUES ('Spotted Community Pages', 'recurring', 'AI-powered moderation for community Facebook pages.', 2)").run();
  const spottedMod = db.prepare("INSERT INTO projects (client_id, name, notes) VALUES (?, 'AI Moderation System', 'Automated moderation using Claude AI')").run(spotted.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, notes) VALUES (?, 'Fine-tune moderation threshold', 'Norton', '2026-04-10', '${today}', 3, 'in-progress', 'Reduce false positives')`).run(spottedMod.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, estimated_hours, progress, notes) VALUES (?, 'Add Spotted Darlington', 'Norton', '2026-04-15', 2, 'not-started', 'Onboard new page')`).run(spottedMod.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, notes) VALUES (?, 'Weekly moderation report', 'Sarah', '2026-04-07', '${today}', 1, 'not-started', 'Summary of flagged posts')`).run(spottedMod.lastInsertRowid);

  const adhoc1 = db.prepare("INSERT INTO clients (name, agreement_type, notes, sort_order) VALUES ('The Garden Kitchen', 'ad-hoc', 'Local restaurant. Menu redesign and social media launch.', 3)").run();
  const gkMenu = db.prepare("INSERT INTO projects (client_id, name, notes) VALUES (?, 'Menu Redesign & Launch', 'Brand refresh + social launch')").run(adhoc1.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, notes) VALUES (?, 'Menu design — first draft', 'James', '2026-04-12', '${today}', 6, 'in-progress', 'A3 folded menu')`).run(gkMenu.lastInsertRowid);
  db.prepare("INSERT INTO tasks (project_id, title, assignee, deadline, estimated_hours, progress, notes) VALUES (?, 'Food photography session', 'James', '2026-04-18', 4, 'not-started', 'On-location shoot')").run(gkMenu.lastInsertRowid);
  db.prepare("INSERT INTO tasks (project_id, title, assignee, deadline, estimated_hours, progress, notes) VALUES (?, 'Social media launch pack', 'Lucy', '2026-04-22', 5, 'not-started', '10 posts for launch')").run(gkMenu.lastInsertRowid);
  db.prepare("INSERT INTO tasks (project_id, title, assignee, deadline, estimated_hours, progress, notes) VALUES (?, 'Client sign-off meeting', 'Norton', '2026-04-25', 1, 'not-started', 'Present final designs')").run(gkMenu.lastInsertRowid);

  const build = db.prepare("INSERT INTO clients (name, agreement_type, notes, sort_order) VALUES ('Hartlepool Builders Ltd', 'recurring', 'Construction company. Monthly social media and quarterly video. 12-month retainer.', 4)").run();
  const buildSocial = db.prepare("INSERT INTO projects (client_id, name, notes) VALUES (?, 'Social Media Management', 'Monthly content creation')").run(build.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, notes) VALUES (?, 'April content — before/after gallery', 'Lucy', '2026-04-09', '${today}', 3, 'in-progress', 'Kitchen renovation posts')`).run(buildSocial.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, estimated_hours, progress, notes) VALUES (?, 'Drone footage — new build site', 'Norton', '2026-04-16', 4, 'not-started', 'Aerial progress shots')`).run(buildSocial.lastInsertRowid);
  db.prepare(`INSERT INTO tasks (project_id, title, assignee, deadline, planned_date, estimated_hours, progress, notes) VALUES (?, 'Google review request campaign', 'Sarah', '2026-04-11', '${today}', 2, 'blocked', 'Waiting on client email list')`).run(buildSocial.lastInsertRowid);

  // Comments
  // Add comments to specific tasks by looking them up
  const allTasks = db.prepare('SELECT id, title FROM tasks').all();
  const findTask = (substr) => allTasks.find(t => t.title.includes(substr));
  const t1 = findTask('Set up project management');
  const t2 = findTask('Update company portfolio');
  const t3 = findTask('April social media content batch');
  const t4 = findTask('Monthly performance report');
  const t5 = findTask('Google review request');
  if (t1) db.prepare("INSERT INTO comments (task_id, author, content) VALUES (?, 'Norton', 'System is live and working. Moving to completed.')").run(t1.id);
  if (t2) db.prepare("INSERT INTO comments (task_id, author, content) VALUES (?, 'James', 'Started on case study layouts, first draft by Wednesday.')").run(t2.id);
  if (t3) db.prepare("INSERT INTO comments (task_id, author, content) VALUES (?, 'Lucy', 'Got 8 of 12 posts done, finishing rest tomorrow.')").run(t3.id);
  if (t4) db.prepare("INSERT INTO comments (task_id, author, content) VALUES (?, 'Sarah', 'Report sent via email. Client happy with growth.')").run(t4.id);
  if (t5) {
    db.prepare("INSERT INTO comments (task_id, author, content) VALUES (?, 'Sarah', 'Chased the client twice — still waiting on email list.')").run(t5.id);
    db.prepare("INSERT INTO comments (task_id, author, content) VALUES (?, 'Norton', 'Will call them directly Monday if no response.')").run(t5.id);
  }

  // Activity
  logActivity('client', nbm.lastInsertRowid, 'created', 'Norton', 'Created client "NorthBear Media"');
  logActivity('client', rms.lastInsertRowid, 'created', 'Norton', 'Created client "RMS Fire Blankets"');
  logActivity('client', spotted.lastInsertRowid, 'created', 'Norton', 'Created client "Spotted Community Pages"');
  logActivity('client', adhoc1.lastInsertRowid, 'created', 'Norton', 'Created client "The Garden Kitchen"');
  logActivity('client', build.lastInsertRowid, 'created', 'Norton', 'Created client "Hartlepool Builders Ltd"');
}

seedIfEmpty();

app.listen(PORT, () => {
  console.log(`NorthBear Media Project Management running at http://localhost:${PORT}`);
});
