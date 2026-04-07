import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { join } from 'path';
import { mkdirSync } from 'fs';
import multer from 'multer';
import db from './database.js';

// ─── Data Directories ─────────────────────────────────
export const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.cwd();
export const uploadsDir = join(dataDir, 'uploads');
export const attachmentsDir = join(dataDir, 'attachments');
mkdirSync(uploadsDir, { recursive: true });
mkdirSync(attachmentsDir, { recursive: true });

// ─── Password Hashing (scrypt — NIST-recommended, no native deps) ──
export function legacyHash(pw) {
  return createHash('sha256').update(pw + 'nbm-salt-2026').digest('hex');
}

export function hashPassword(pw, salt) {
  if (!salt) salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pw, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(pw, storedHash, salt) {
  if (!salt) return false;
  const derived = scryptSync(pw, salt, 64);
  const stored = Buffer.from(storedHash, 'hex');
  if (derived.length !== stored.length) return false;
  return timingSafeEqual(derived, stored);
}

// ─── Sessions ─────────────────────────────────────────
export function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(userId, token, expires);
  return token;
}

export function getSessionUser(req) {
  const token = req.cookies?.nbm_session;
  if (!token) return null;
  const session = db.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')").get(token);
  if (!session) return null;
  return db.prepare('SELECT id, username, email, display_name, role, avatar_url, avatar_color FROM users WHERE id = ?').get(session.user_id);
}

// ─── Auth Middleware ──────────────────────────────────
export function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.user = user;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Global API auth — protects all /api routes except /api/auth/*
export function apiAuthGuard(req, res, next) {
  if (req.path.startsWith('/auth/') || req.path === '/health') return next();
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.user = user;
  next();
}

// ─── Security Headers ─────────────────────────────────
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

// ─── Rate Limiting ────────────────────────────────────
const loginAttempts = new Map();

export function checkLoginRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  entry.count++;
  return entry.count <= 10;
}

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(ip);
  }
}, 30 * 60 * 1000);

// ─── File Upload Configs ──────────────────────────────
const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const allowedAttachTypes = [
  ...allowedImageTypes,
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'video/mp4', 'video/quicktime', 'video/webm', 'text/plain', 'text/csv',
];

function imageFilter(req, file, cb) {
  if (allowedImageTypes.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only image files (JPEG, PNG, GIF, WebP, SVG) are allowed'), false);
}

function attachFilter(req, file, cb) {
  if (allowedAttachTypes.includes(file.mimetype)) cb(null, true);
  else cb(new Error('File type not allowed'), false);
}

function safeExt(filename) {
  return filename.split('.').pop().replace(/[^a-zA-Z0-9]/g, '').substring(0, 5);
}

export const logoUpload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => cb(null, `logo-${Date.now()}.${safeExt(file.originalname)}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: imageFilter,
});

export const attachUpload = multer({
  storage: multer.diskStorage({
    destination: attachmentsDir,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100)}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: attachFilter,
});

export const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => cb(null, `avatar-${Date.now()}.${safeExt(file.originalname)}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: imageFilter,
});

// ─── Password Validation ──────────────────────────────
export function validatePassword(password) {
  if (!password || password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include uppercase, lowercase, and a number';
  }
  return null;
}
