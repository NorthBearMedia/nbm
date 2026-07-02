import { Router } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { timingSafeEqual } from 'crypto';
import db from '../database.js';
import {
  getSessionUser, checkLoginRateLimit, legacyHash,
  verifyPassword, hashPassword, createSession,
} from '../middleware.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

router.get('/login', (req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'login.html'));
});

router.post('/api/auth/login', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (!checkLoginRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many login attempts. Please try again in 15 minutes.' });
  }

  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  let authenticated = false;
  if (user.password_salt) {
    authenticated = verifyPassword(password, user.password_hash, user.password_salt);
  } else {
    // Legacy SHA256 — timing-safe compare, migrate to scrypt on success
    try {
      const expected = Buffer.from(user.password_hash, 'hex');
      const actual = Buffer.from(legacyHash(password), 'hex');
      authenticated = expected.length === actual.length && timingSafeEqual(expected, actual);
    } catch { authenticated = false; }
    if (authenticated) {
      const { hash, salt } = hashPassword(password);
      db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, user.id);
    }
  }

  if (!authenticated) return res.status(401).json({ error: 'Invalid email or password' });

  const token = createSession(user.id);
  const isProduction = !!(process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production');
  res.cookie('nbm_session', token, {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    secure: isProduction,
  });
  res.json({
    user: {
      id: user.id, username: user.username,
      display_name: user.display_name, role: user.role,
      avatar_url: user.avatar_url,
    },
  });
});

router.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.nbm_session;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie('nbm_session');
  res.json({ success: true });
});

router.get('/api/auth/me', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json(user);
});

export default router;
