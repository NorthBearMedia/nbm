import { Router } from 'express';
import db from '../database.js';
import { requireAuth, requireRole, hashPassword, verifyPassword, validatePassword, avatarUpload } from '../middleware.js';

const router = Router();

const VALID_ROLES = ['owner', 'editor', 'viewer'];

router.get('/', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT id, username, email, display_name, role, avatar_url, avatar_color FROM users ORDER BY display_name').all());
});

router.put('/:id', requireAuth, requireRole('owner'), (req, res) => {
  let { display_name, role, email } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (role !== undefined && !VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  // Never allow the last owner to be demoted — that would lock everyone out of admin.
  if (role && role !== 'owner' && user.role === 'owner') {
    const owners = db.prepare("SELECT count(*) as c FROM users WHERE role='owner' AND status='active'").get().c;
    if (owners <= 1) return res.status(400).json({ error: 'Cannot demote the last owner' });
  }
  if (email) email = email.toLowerCase().trim();   // login lookups are lowercased
  db.prepare('UPDATE users SET display_name=COALESCE(?,display_name), role=COALESCE(?,role), email=COALESCE(?,email) WHERE id=?')
    .run(display_name, role, email, req.params.id);
  res.json(db.prepare('SELECT id, username, email, display_name, role, avatar_url, avatar_color FROM users WHERE id = ?').get(req.params.id));
});

router.put('/:id/password', requireAuth, (req, res) => {
  const isSelf = req.user.id === parseInt(req.params.id);
  if (!isSelf && req.user.role !== 'owner') {
    return res.status(403).json({ error: "Cannot change other users' passwords" });
  }
  const { password, current_password } = req.body;
  const err = validatePassword(password);
  if (err) return res.status(400).json({ error: err });

  // Changing your own password re-authenticates: a hijacked/walk-up session
  // can't quietly take over the account. (Owner resets of OTHER users are exempt.)
  if (isSelf) {
    const me = db.prepare('SELECT password_hash, password_salt FROM users WHERE id = ?').get(req.user.id);
    if (me?.password_salt && !verifyPassword(current_password || '', me.password_hash, me.password_salt)) {
      return res.status(403).json({ error: 'Current password is incorrect' });
    }
  }

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
