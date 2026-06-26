// Live configuration: values saved through the setup wizard (settings table)
// take priority, falling back to .env. This means the only thing that MUST
// be configured via environment is ADMIN_PASSWORD — everything else can be
// done from the browser.
import { config } from '../config.js';
import { getSetting, setSetting } from '../database.js';

function pick(settingKey, envValue) {
  const v = getSetting(settingKey);
  return v !== null && v !== '' ? v : envValue;
}

export function getSmtp() {
  return {
    host: pick('smtp_host', config.smtp.host),
    port: Number(pick('smtp_port', config.smtp.port)),
    secure: String(pick('smtp_secure', config.smtp.secure)) === 'true',
    user: pick('smtp_user', config.smtp.user),
    pass: pick('smtp_pass', config.smtp.pass),
  };
}

export function getEmailFrom() {
  const explicit = pick('email_from', config.emailFrom);
  if (explicit) return explicit;
  const user = getSmtp().user;
  return user ? `North Bear Media Reports <${user}>` : '';
}

export function getEmailBcc() {
  return pick('email_bcc', config.emailBcc);
}

export function getAppUrl() {
  return (pick('app_url', config.appUrl) || '').replace(/\/$/, '');
}

export function getGoogleServiceAccount() {
  const raw = getSetting('google_service_account_json');
  if (raw) {
    try { return JSON.parse(raw); } catch { /* fall through to env */ }
  }
  return config.googleServiceAccount;
}

// When set (and domain-wide delegation is authorised in Google Workspace
// admin), Search Console is read as this user — read-only — instead of
// needing the robot granted on every property.
export function getGscReaderEmail() {
  return pick('gsc_reader_email', process.env.GSC_READER_EMAIL || '');
}

export function getHostingerToken() {
  return pick('hostinger_api_token', process.env.HOSTINGER_API_TOKEN || '');
}

// Fathom Analytics API key — when set, Fathom becomes the primary web
// analytics source (real, bot-filtered, with history), preferred over GA4.
export function getFathomToken() {
  return pick('fathom_api_token', process.env.FATHOM_API_TOKEN || '');
}

export function saveGoogleServiceAccount(json) {
  let parsed;
  try { parsed = typeof json === 'string' ? JSON.parse(json) : json; }
  catch { throw new Error('That doesn\'t look like valid JSON — paste the whole contents of the downloaded key file.'); }
  if (parsed?.type !== 'service_account' || !parsed.client_email || !parsed.private_key) {
    throw new Error('That JSON isn\'t a service account key — it should contain "type": "service_account", a client_email and a private_key.');
  }
  setSetting('google_service_account_json', JSON.stringify(parsed));
  return parsed;
}

const SETTING_KEYS = ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'email_from', 'email_bcc', 'app_url', 'gsc_reader_email', 'hostinger_api_token', 'fathom_api_token'];
const KEEP_IF_BLANK = new Set(['smtp_pass', 'hostinger_api_token', 'fathom_api_token']);

export function saveSettings(body) {
  for (const key of SETTING_KEYS) {
    if (body[key] === undefined) continue;
    const value = String(body[key] ?? '').trim();
    // A blank secret field in the form means "keep the saved one".
    if (KEEP_IF_BLANK.has(key) && value === '') continue;
    setSetting(key, value);
  }
}

export function setupStatus() {
  const smtp = getSmtp();
  const sa = getGoogleServiceAccount();
  return {
    adminPassword: Boolean(config.adminPassword),
    google: Boolean(sa),
    googleServiceAccountEmail: sa?.client_email || null,
    googleApiOk: getSetting('google_api_ok') === 'true',
    smtp: Boolean(smtp.host && smtp.user && smtp.pass),
    smtpVerified: getSetting('smtp_verified') === 'true',
    appUrl: getAppUrl(),
    timezone: config.timezone,
    settings: {
      smtp_host: smtp.host,
      smtp_port: smtp.port,
      smtp_secure: smtp.secure,
      smtp_user: smtp.user,
      smtp_pass_set: Boolean(smtp.pass),
      email_from: getEmailFrom(),
      email_bcc: getEmailBcc(),
      app_url: getAppUrl(),
      gsc_reader_email: getGscReaderEmail(),
      hostinger_token_set: Boolean(getHostingerToken()),
      fathom_token_set: Boolean(getFathomToken()),
    },
  };
}
