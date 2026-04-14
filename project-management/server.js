import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, readdirSync, unlinkSync } from 'fs';
import cookieParser from 'cookie-parser';
import db from './database.js';
import { securityHeaders, apiAuthGuard, getSessionUser, hashPassword, requireAuth, requireRole, requireWrite, dataDir, uploadsDir, attachmentsDir } from './middleware.js';
import authRoutes from './routes/auth.js';
import clientRoutes from './routes/clients.js';
import projectRoutes from './routes/projects.js';
import taskRoutes, { deleteAttachmentHandler } from './routes/tasks.js';
import userRoutes from './routes/users.js';
import systemRoutes, { createBackupRoutes } from './routes/system.js';
import aiRoutes from './routes/ai.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// ─── Database Backup ────────────────────────────────────
const backupDir = join(dataDir, 'backups');
mkdirSync(backupDir, { recursive: true });

function backupDatabase() {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(backupDir, `nbm-projects-${ts}.db`);
    db.backup(backupPath).then(() => {
      console.log(`Backup created: ${backupPath}`);
      const files = readdirSync(backupDir)
        .filter(f => f.startsWith('nbm-projects-') && f.endsWith('.db'))
        .sort();
      while (files.length > 48) {
        const old = files.shift();
        try { unlinkSync(join(backupDir, old)); } catch {}
      }
    }).catch(err => console.error('Backup failed:', err));
  } catch (err) {
    console.error('Backup error:', err);
  }
}

backupDatabase();
setInterval(backupDatabase, 60 * 60 * 1000);

// ─── Core Middleware ─────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(securityHeaders);

// ─── Static & Uploads ───────────────────────────────────
app.get('/', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.redirect('/login');
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.use(express.static(join(__dirname, 'public'), { maxAge: 0, etag: false }));
app.use('/uploads', express.static(uploadsDir));
app.use('/attachments', express.static(attachmentsDir));

// ─── API Auth Guard ─────────────────────────────────────
app.use('/api', apiAuthGuard);

// ─── Routes ─────────────────────────────────────────────
app.use(authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);
app.delete('/api/attachments/:id', requireAuth, requireWrite, deleteAttachmentHandler);
app.use(systemRoutes);
app.use(createBackupRoutes(backupDir, backupDatabase));
app.use(aiRoutes);

// ─── Seed Users ─────────────────────────────────────────
// Creates default users ONLY when the users table is empty.
// In production, change passwords immediately after first login.
function seedUsers() {
  const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (count > 0) return;

  if (process.env.NODE_ENV === 'production' && !process.env.SEED_ADMIN) {
    console.log('No users exist. Set SEED_ADMIN=1 to create the default admin account, or create one via the API.');
    return;
  }

  const pw = hashPassword('Nbm2026!');
  db.prepare("INSERT INTO users (username, email, password_hash, password_salt, display_name, role, avatar_color) VALUES ('norton', 'norton@northbearmedia.co.uk', ?, ?, 'Norton', 'owner', '#3eaf84')").run(pw.hash, pw.salt);
  console.log('Default admin user created (norton@northbearmedia.co.uk / Nbm2026!) — change this password immediately.');
}

seedUsers();

// ─── Error Handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large' });
  if (err.message?.includes('Only image files') || err.message?.includes('File type not allowed')) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ─── Start ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`North Bear Console running at http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('AI assistant disabled — set ANTHROPIC_API_KEY to enable.');
  } else {
    console.log('AI assistant enabled.');
  }
});
