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

// File upload for logos
const storage = multer.diskStorage({
  destination: join(__dirname, 'public', 'uploads'),
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop();
    cb(null, `logo-${Date.now()}.${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } });

// Ensure uploads directory exists
import { mkdirSync } from 'fs';
mkdirSync(join(__dirname, 'public', 'uploads'), { recursive: true });

// ─── CLIENTS ───────────────────────────────────────────

app.get('/api/clients', (req, res) => {
  const { filter } = req.query; // 'recurring', 'ad-hoc', or undefined for all
  let clients;
  if (filter && ['recurring', 'ad-hoc'].includes(filter)) {
    clients = db.prepare('SELECT * FROM clients WHERE agreement_type = ? ORDER BY sort_order, name').all(filter);
  } else {
    clients = db.prepare('SELECT * FROM clients ORDER BY sort_order, name').all();
  }

  // Attach projects and tasks
  const projectsStmt = db.prepare('SELECT * FROM projects WHERE client_id = ? ORDER BY sort_order, name');
  const tasksStmt = db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY sort_order, created_at');

  for (const client of clients) {
    client.projects = projectsStmt.all(client.id);
    for (const project of client.projects) {
      project.tasks = tasksStmt.all(project.id);
    }
  }

  res.json(clients);
});

app.post('/api/clients', (req, res) => {
  const { name, agreement_type, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Client name is required' });
  const result = db.prepare('INSERT INTO clients (name, agreement_type, notes) VALUES (?, ?, ?)').run(
    name, agreement_type || 'recurring', notes || ''
  );
  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid));
});

app.put('/api/clients/:id', (req, res) => {
  const { name, agreement_type, notes, logo_url } = req.body;
  db.prepare('UPDATE clients SET name = COALESCE(?, name), agreement_type = COALESCE(?, agreement_type), notes = COALESCE(?, notes), logo_url = COALESCE(?, logo_url) WHERE id = ?')
    .run(name, agreement_type, notes, logo_url, req.params.id);
  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id));
});

app.delete('/api/clients/:id', (req, res) => {
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/clients/:id/logo', upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const logoUrl = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE clients SET logo_url = ? WHERE id = ?').run(logoUrl, req.params.id);
  res.json({ logo_url: logoUrl });
});

// ─── PROJECTS ──────────────────────────────────────────

app.post('/api/projects', (req, res) => {
  const { client_id, name, notes } = req.body;
  if (!client_id || !name) return res.status(400).json({ error: 'client_id and name are required' });
  const result = db.prepare('INSERT INTO projects (client_id, name, notes) VALUES (?, ?, ?)').run(
    client_id, name, notes || ''
  );
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  project.tasks = [];
  res.json(project);
});

app.put('/api/projects/:id', (req, res) => {
  const { name, status, notes } = req.body;
  db.prepare('UPDATE projects SET name = COALESCE(?, name), status = COALESCE(?, status), notes = COALESCE(?, notes) WHERE id = ?')
    .run(name, status, notes, req.params.id);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  project.tasks = db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY sort_order, created_at').all(project.id);
  res.json(project);
});

app.delete('/api/projects/:id', (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── TASKS ─────────────────────────────────────────────

app.post('/api/tasks', (req, res) => {
  const { project_id, title, assignee, deadline, references_text, notes } = req.body;
  if (!project_id || !title) return res.status(400).json({ error: 'project_id and title are required' });
  const result = db.prepare('INSERT INTO tasks (project_id, title, assignee, deadline, references_text, notes) VALUES (?, ?, ?, ?, ?, ?)').run(
    project_id, title, assignee || '', deadline || '', references_text || '', notes || ''
  );
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid));
});

app.put('/api/tasks/:id', (req, res) => {
  const { title, assignee, deadline, progress, references_text, notes } = req.body;
  db.prepare('UPDATE tasks SET title = COALESCE(?, title), assignee = COALESCE(?, assignee), deadline = COALESCE(?, deadline), progress = COALESCE(?, progress), references_text = COALESCE(?, references_text), notes = COALESCE(?, notes) WHERE id = ?')
    .run(title, assignee, deadline, progress, references_text, notes, req.params.id);
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id));
});

app.delete('/api/tasks/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── TEAM MEMBERS ──────────────────────────────────────

app.get('/api/team', (req, res) => {
  res.json(db.prepare('SELECT * FROM team_members ORDER BY name').all());
});

app.post('/api/team', (req, res) => {
  const { name, role, avatar_color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const result = db.prepare('INSERT INTO team_members (name, role, avatar_color) VALUES (?, ?, ?)').run(
    name, role || '', avatar_color || '#6366f1'
  );
  res.json(db.prepare('SELECT * FROM team_members WHERE id = ?').get(result.lastInsertRowid));
});

app.delete('/api/team/:id', (req, res) => {
  db.prepare('DELETE FROM team_members WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── SEED DATA ─────────────────────────────────────────

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) as c FROM clients').get().c;
  if (count === 0) {
    // Create NorthBear Media as the default internal client
    const nbm = db.prepare("INSERT INTO clients (name, agreement_type, notes) VALUES ('NorthBear Media', 'recurring', 'Internal business tasks and operations')").run();

    // Add a default project
    const proj = db.prepare("INSERT INTO projects (client_id, name, notes) VALUES (?, 'General Operations', 'Day-to-day business tasks')").run(nbm.lastInsertRowid);

    // Add sample tasks
    db.prepare("INSERT INTO tasks (project_id, title, assignee, deadline, progress, notes) VALUES (?, 'Set up project management system', '', '', 'completed', 'Get the team organized')").run(proj.lastInsertRowid);

    // Add a sample team member
    db.prepare("INSERT INTO team_members (name, role, avatar_color) VALUES ('Admin', 'Manager', '#6366f1')").run();
  }
}

seedIfEmpty();

app.listen(PORT, () => {
  console.log(`NorthBear Media Project Management running at http://localhost:${PORT}`);
});
