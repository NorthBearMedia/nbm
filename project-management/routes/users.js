import { Router } from 'express';
import db from '../database.js';
import { requireAuth, requireRole, hashPassword, validatePassword, avatarUpload } from '../middleware.js';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT id, username, email, display_name, role, avatar_url, avatar_color FROM users ORDER BY display_name').all());
});

router.put('/:id', requireAuth, requireRole('owner'), (req, res) => {
  const { display_name, role, email } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('UPDATE users SET display_name=COALESCE(?,display_name), role=COALESCE(?,role), email=COALESCE(?,email) WHERE id=?')
    .run(display_name, role, email, req.params.id);
  res.json(db.prepare('SELECT id, username, email, display_name, role, avatar_url, avatar_color FROM users WHERE id = ?').get(req.params.id));
});

router.put('/:id/password', requireAuth, (req, res) => {
  if (req.user.id !== parseInt(req.params.id) && req.user.role !== 'owner') {
    return res.status(403).json({ error: "Cannot change other users' passwords" });
  }
  const { password } = req.body;
  const err = validatePassword(password);
  if (err) return res.status(400).json({ error: err });

  const { hash, salt } = hashPassword(password);
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, req.params.id);

  // Invalidate other sessions for this user
  const currentToken = req.cookies?.nbm_session;
  if (currentToken) {
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.params.id, currentToken);
  } else {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id);
  }
  res.json({ success: true });
});

router.post('/:id/avatar', requireAuth, avatarUpload.single('avatar'), (req, res) => {
  if (req.user.id !== parseInt(req.params.id) && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(url, req.params.id);
  res.json({ avatar_url: url });
});

router.post('/', requireAuth, requireRole('owner'), (req, res) => {
  const { username, email, password, display_name, role } = req.body;
  if (!username || !email || !password || !display_name) return res.status(400).json({ error: 'All fields required' });
  const err = validatePassword(password);
  if (err) return res.status(400).json({ error: err });

  try {
    const { hash, salt } = hashPassword(password);
    const r = db.prepare('INSERT INTO users (username, email, password_hash, password_salt, display_name, role) VALUES (?, ?, ?, ?, ?, ?)')
      .run(username, email.toLowerCase().trim(), hash, salt, display_name, role || 'editor');
    res.json(db.prepare('SELECT id, username, email, display_name, role, avatar_url, avatar_color FROM users WHERE id = ?').get(r.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: 'Username or email already exists' });
  }
});

router.delete('/:id', requireAuth, requireRole('owner'), (req, res) => {
  if (req.user.id === parseInt(req.params.id)) return res.status(400).json({ error: 'Cannot delete yourself' });
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
