import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, readdirSync, unlinkSync, readFileSync } from 'fs';
import { gzipSync } from 'zlib';
import { createHash } from 'crypto';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import db, { dbPath } from './database.js';
import { securityHeaders, apiAuthGuard, getSessionUser, hashPassword, requireAuth, requireRole, requireWrite, dataDir, uploadsDir, attachmentsDir } from './middleware.js';
import authRoutes from './routes/auth.js';
import clientRoutes from './routes/clients.js';
// routes/projects.js is retired — the UI dropped the projects layer, and its
// delete/duplicate endpoints were an unused cascade-delete risk. File kept for
// history; deliberately not mounted.
import taskRoutes, { deleteAttachmentHandler } from './routes/tasks.js';
import userRoutes from './routes/users.js';
import systemRoutes, { createBackupRoutes } from './routes/system.js';
import aiRoutes from './routes/ai.js';
import gmailRoutes from './routes/gmail.js';
import xeroRoutes from './routes/xero.js';
import whatsappRoutes from './routes/whatsapp.js';

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

// ─── Off-site backup (Backblaze B2) ─────────────────────
// The hourly backups above live on the SAME volume as the database — one
// volume failure loses both. Set B2_KEY_ID, B2_APP_KEY and B2_BUCKET_ID and
// a gzipped copy of the database uploads to B2 once a day (checked hourly,
// last-upload tracked in app_meta so restarts never double-upload). With the
// env vars unset this is entirely dormant.
async function offsiteBackup() {
  const { B2_KEY_ID, B2_APP_KEY, B2_BUCKET_ID } = process.env;
  if (!B2_KEY_ID || !B2_APP_KEY || !B2_BUCKET_ID) return;
  try {
    const last = db.prepare("SELECT value FROM app_meta WHERE key='last_offsite_backup'").get();
    if (last && Date.now() - new Date(last.value).getTime() < 23.5 * 3600 * 1000) return;

    db.pragma('wal_checkpoint(TRUNCATE)');
    const body = gzipSync(readFileSync(dbPath));
    const sha1 = createHash('sha1').update(body).digest('hex');

    const authRes = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
      headers: { Authorization: 'Basic ' + Buffer.from(`${B2_KEY_ID}:${B2_APP_KEY}`).toString('base64') },
    });
    if (!authRes.ok) throw new Error(`auth failed (${authRes.status})`);
    const auth = await authRes.json();

    const urlRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
      method: 'POST',
      headers: { Authorization: auth.authorizationToken },
      body: JSON.stringify({ bucketId: B2_BUCKET_ID }),
    });
    if (!urlRes.ok) throw new Error(`get_upload_url failed (${urlRes.status})`);
    const up = await urlRes.json();

    const name = `nbm-console/nbm-projects-${new Date().toISOString().slice(0, 10)}.db.gz`;
    const upRes = await fetch(up.uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: up.authorizationToken,
        'X-Bz-File-Name': encodeURIComponent(name),
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(body.length),
        'X-Bz-Content-Sha1': sha1,
      },
      body,
    });
    if (!upRes.ok) throw new Error(`upload failed (${upRes.status}): ${(await upRes.text()).slice(0, 200)}`);

    db.prepare("INSERT INTO app_meta (key, value) VALUES ('last_offsite_backup', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .run(new Date().toISOString());
    console.log(`[Backup] Off-site copy uploaded to B2: ${name} (${Math.round(body.length / 1024)} KB)`);
  } catch (err) {
    console.error('[Backup] Off-site backup failed:', err.message);
  }
}
offsiteBackup();
setInterval(offsiteBackup, 60 * 60 * 1000);

// ─── Core Middleware ─────────────────────────────────────
// Railway terminates TLS at a proxy: trust one hop so req.ip is the real
// client (login rate limiting) and secure cookies work correctly.
app.set('trust proxy', 1);
app.use(compression());
// Keep the raw request body so webhook signatures (Meta X-Hub-Signature-256)
// can be verified against exactly what was sent.
app.use(express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(cookieParser());
app.use(securityHeaders);

// ─── Static & Uploads ───────────────────────────────────
app.get('/', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.redirect('/login');
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Versioned assets (?v=N in index.html) can cache forever — a version bump
// changes the URL. HTML + manifest stay no-cache so a deploy shows up on the
// next load without a hard refresh.
app.use(express.static(join(__dirname, 'public'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.html') || path.endsWith('.json')) res.setHeader('Cache-Control', 'no-cache');
    else res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));
// User-uploaded content is served inert: the sandbox CSP means a crafted file
// (e.g. SVG/HTML masquerading as an image) can never run script in our origin.
const inertUploads = {
  setHeaders: (res) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  },
};
app.use('/uploads', express.static(uploadsDir, inertUploads));
app.use('/attachments', express.static(attachmentsDir, inertUploads));

// ─── API Auth Guard ─────────────────────────────────────
app.use('/api', apiAuthGuard);

// ─── Routes ─────────────────────────────────────────────
app.use(authRoutes);
app.use('/api/clients', clientRoutes);

app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);
app.delete('/api/attachments/:id', requireAuth, requireWrite, deleteAttachmentHandler);
app.use(systemRoutes);
app.use(createBackupRoutes(backupDir, backupDatabase));
app.use(aiRoutes);
app.use(gmailRoutes);
app.use(xeroRoutes);
app.use(whatsappRoutes);

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

// ─── One-time seed: Willis Cooper July content list ─────
// Runs once at boot (guarded by app_meta flag). The seed itself is idempotent
// (dedupe by title) so a manual CLI run beforehand can't cause duplicates.
// If the Willis Cooper client doesn't exist yet, the flag stays unset and it
// retries on a later boot.
try {
  const wcDone = db.prepare("SELECT value FROM app_meta WHERE key='willis_cooper_seed_v1'").get();
  if (!wcDone) {
    const { seedWillisCooper } = await import('./scripts/seed-willis-cooper-tasks.js');
    const report = seedWillisCooper(db);
    if (report) {
      db.prepare("INSERT INTO app_meta (key, value) VALUES ('willis_cooper_seed_v1', ?)").run(new Date().toISOString());
      console.log(`[Seed] Willis Cooper content list: ${report.created} created, ${report.skipped.length} already present.`);
    } else {
      console.log('[Seed] Willis Cooper client not found — content list seed deferred to a later boot.');
    }
  }
} catch (err) {
  console.error('[Seed] Willis Cooper content list error:', err.message);
}

// ─── One-time seed: Richford Motor Services July list ───
// Same pattern as the Willis Cooper seed above.
try {
  const rmsDone = db.prepare("SELECT value FROM app_meta WHERE key='richford_seed_v1'").get();
  if (!rmsDone) {
    const { seedRichford } = await import('./scripts/seed-richford-tasks.js');
    const report = seedRichford(db);
    if (report) {
      db.prepare("INSERT INTO app_meta (key, value) VALUES ('richford_seed_v1', ?)").run(new Date().toISOString());
      console.log(`[Seed] Richford list: ${report.created} created, ${report.skipped.length} already present.`);
    } else {
      console.log('[Seed] Richford client not found — list seed deferred to a later boot.');
    }
  }
} catch (err) {
  console.error('[Seed] Richford list error:', err.message);
}

// ─── One-time amend: Richford v2 (Norton's answers + Dave's email) ───
// Runs after the v1 seed so a fresh boot applies create-then-amend in order.
try {
  const rmsV2Done = db.prepare("SELECT value FROM app_meta WHERE key='richford_seed_v2'").get();
  if (!rmsV2Done) {
    const { amendRichfordV2 } = await import('./scripts/seed-richford-tasks.js');
    const report = amendRichfordV2(db);
    if (report) {
      db.prepare("INSERT INTO app_meta (key, value) VALUES ('richford_seed_v2', ?)").run(new Date().toISOString());
      console.log(`[Seed] Richford v2 amend: ${report.updated.length} updated, ${report.created.length} created, ${report.missing.length} not found.`);
    } else {
      console.log('[Seed] Richford client not found — v2 amend deferred to a later boot.');
    }
  }
} catch (err) {
  console.error('[Seed] Richford v2 amend error:', err.message);
}

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
