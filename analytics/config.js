import 'dotenv/config';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, isAbsolute } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolvePath(p) {
  return isAbsolute(p) ? p : join(__dirname, p);
}

const dataDir = resolvePath(process.env.DATA_DIR || './data');
mkdirSync(join(dataDir, 'reports'), { recursive: true });

function loadServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw && raw.trim().startsWith('{')) {
    try { return JSON.parse(raw); } catch { console.error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON'); }
  }
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (file) {
    try { return JSON.parse(readFileSync(resolvePath(file), 'utf8')); } catch { /* not configured yet */ }
  }
  return null;
}

export const config = {
  port: Number(process.env.PORT || 3002),
  appUrl: (process.env.APP_URL || `http://localhost:${process.env.PORT || 3002}`).replace(/\/$/, ''),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  timezone: process.env.TIMEZONE || 'Europe/London',
  dataDir,
  reportsDir: join(dataDir, 'reports'),
  dbPath: join(dataDir, 'pulse.db'),
  googleServiceAccount: loadServiceAccount(),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE ?? 'true') === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  emailFrom: process.env.EMAIL_FROM || process.env.SMTP_USER || '',
  emailBcc: process.env.EMAIL_BCC || '',
};

// Everything except ADMIN_PASSWORD can also be configured from the browser
// via the setup wizard — see lib/runtime-config.js, which overlays settings
// saved in the database on top of these environment defaults.
