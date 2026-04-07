import { Router } from 'express';
import { readdirSync } from 'fs';
import { join } from 'path';
import db from '../database.js';
import { requireAuth } from '../middleware.js';

const router = Router();

// ─── Health Check ─────────────────────────────────────
router.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', error: 'Database unavailable' });
  }
});

// ─── Global History (owner only) ──────────────────────
router.get('/api/history', requireAuth, (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
  const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
  res.json(db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?').all(limit));
});

// ─── Archived Clients ─────────────────────────────────
router.get('/api/archived/clients', requireAuth, (req, res) => {
  const isOwner = req.user.role === 'owner';
  const priv = isOwner ? '' : 'AND is_private = 0';
  res.json(db.prepare(`SELECT * FROM clients WHERE archived = 1 ${priv} ORDER BY name`).all());
});

// ─── Team ─────────────────────────────────────────────
router.get('/api/team', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM team_members ORDER BY name').all());
});

router.post('/api/team', requireAuth, (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
  const { name, role, avatar_color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const r = db.prepare('INSERT INTO team_members (name, role, avatar_color) VALUES (?, ?, ?)').run(name, role || '', avatar_color || '#6366f1');
  res.json(db.prepare('SELECT * FROM team_members WHERE id = ?').get(r.lastInsertRowid));
});

router.delete('/api/team/:id', requireAuth, (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
  db.prepare('DELETE FROM team_members WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── Backups (owner only) ─────────────────────────────
export function createBackupRoutes(backupDir, backupFn) {
  const r = Router();

  r.get('/api/backups', requireAuth, (req, res) => {
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
    try {
      const files = readdirSync(backupDir)
        .filter(f => f.startsWith('nbm-projects-') && f.endsWith('.db'))
        .sort().reverse();
      res.json(files);
    } catch { res.json([]); }
  });

  r.post('/api/backups', requireAuth, (req, res) => {
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
    backupFn();
    res.json({ success: true, message: 'Backup started' });
  });

  return r;
}

export default router;
