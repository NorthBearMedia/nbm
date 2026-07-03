import express from 'express';
import cookieParser from 'cookie-parser';
import { createHmac, timingSafeEqual } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

import { config } from './config.js';
import db, { newDashboardToken, setSetting, getSetting } from './database.js';
import { setupStatus, saveSettings, saveGoogleServiceAccount, getAppUrl, getEmailBcc, getSmtp } from './lib/runtime-config.js';
import { startScheduler, syncAllClarity } from './lib/scheduler.js';
import { runReport, previewReportPdf } from './lib/reporter.js';
import { gatherReportData } from './lib/report-data.js';
import { nextRunAt, addDays, todayISO } from './lib/dates.js';
import * as ga4 from './lib/ga4.js';
import * as gsc from './lib/gsc.js';
import * as clarity from './lib/clarity.js';
import { testSmtp, sendTestEmail } from './lib/email.js';
import { discoverAll, clearDiscoveryCache, normalizeHost } from './lib/discovery.js';
import { autoConnectSite } from './lib/autoconnect.js';
import { seedFirstCustomer } from './lib/seed.js';
import * as hostinger from './lib/hostinger.js';
import * as fathom from './lib/fathom.js';
import { scheduleOpsSweep, runOpsSweep, runInjectionTest, runInjectionRollout } from './lib/ops.js';
import { buildInjectorScript, buildSnippet, rootDirFor } from './lib/inject.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The production app has been dying minutes after boot with nothing in
// our own telemetry (only 1-2 verifier ticks ever ran per hour). Survive
// fatal errors instead of crash-looping, and stash the stack in settings
// so the next boot status email shows exactly what fired.
for (const kind of ['uncaughtException', 'unhandledRejection']) {
  process.on(kind, err => {
    console.error(`[fatal] ${kind}:`, err);
    try { setSetting('last_crash', `${new Date().toISOString()} ${kind}: ${(err && (err.stack || err.message)) || String(err)}`.slice(0, 1500)); }
    catch { /* db unavailable — nothing more we can do */ }
  });
}

const app = express();
app.use(express.json());
app.use(cookieParser());

// ─── Admin auth (single password, stateless HMAC-signed cookie) ──
const SECRET = createHmac('sha256', 'nbm-pulse-v1').update(config.adminPassword || 'unset').digest();

function signSession(expiresMs) {
  const sig = createHmac('sha256', SECRET).update(String(expiresMs)).digest('hex');
  return `${expiresMs}.${sig}`;
}

function isValidSession(token) {
  if (!token || !config.adminPassword) return false;
  const [expires, sig] = token.split('.');
  if (!expires || !sig || Number(expires) < Date.now()) return false;
  const expected = createHmac('sha256', SECRET).update(expires).digest('hex');
  try { return timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); } catch { return false; }
}

function requireAdmin(req, res, next) {
  if (!isValidSession(req.cookies?.pulse_session)) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

app.post('/api/login', (req, res) => {
  if (!config.adminPassword) return res.status(500).json({ error: 'ADMIN_PASSWORD is not set on the server' });
  if (req.body?.password !== config.adminPassword) return res.status(401).json({ error: 'Wrong password' });
  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
  res.cookie('pulse_session', signSession(expires), { httpOnly: true, maxAge: expires - Date.now(), sameSite: 'lax' });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('pulse_session');
  res.json({ ok: true });
});

// ─── Admin: setup wizard + settings ───────────────────────────────
app.get('/api/setup-status', requireAdmin, (req, res) => {
  const sites = db.prepare('SELECT id, client_name, domain, ga4_property_id, gsc_site_url, clarity_api_token, contact_emails FROM sites WHERE active = 1').all();
  res.json({
    ...setupStatus(),
    sitesTotal: sites.length,
    sitesGoogleConnected: sites.filter(s => s.ga4_property_id && s.gsc_site_url).length,
    sitesFullyConnected: sites.filter(s => s.ga4_property_id && s.gsc_site_url && s.clarity_api_token).length,
    sitesMissingEmail: sites.filter(s => !s.contact_emails).length,
  });
});

app.put('/api/settings', requireAdmin, (req, res) => {
  try {
    const body = req.body || {};
    saveSettings(body);
    // Changed mail details need re-verifying.
    if (Object.keys(body).some(k => k.startsWith('smtp_') || k === 'email_from')) {
      setSetting('smtp_verified', 'false');
    }
    res.json({ ok: true, ...setupStatus() });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/test-smtp', requireAdmin, async (req, res) => {
  try {
    const to = String(req.body?.to || '').trim() || getEmailBcc() || getSmtp().user;
    if (to) await sendTestEmail(to);
    else await testSmtp();
    setSetting('smtp_verified', 'true');
    res.json({ ok: true, sentTo: to || null });
  } catch (err) {
    setSetting('smtp_verified', 'false');
    res.json({ ok: false, error: err.message });
  }
});

// Paste-the-key-file step: saves the service account and immediately tries
// a real scan so the wizard can show green ticks (or the exact problem).
app.post('/api/google/credentials', requireAdmin, async (req, res) => {
  let sa;
  try { sa = saveGoogleServiceAccount(req.body?.json ?? req.body); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  clearDiscoveryCache();
  let apiOk = false, scan = null, apiError = null;
  try {
    scan = await discoverAll({ refresh: true });
    apiOk = !scan.errors.ga4 || !scan.errors.gsc;
    apiError = scan.errors.ga4 || scan.errors.gsc || null;
  } catch (err) { apiError = err.message; }
  setSetting('google_api_ok', String(apiOk));
  res.json({
    ok: true,
    clientEmail: sa.client_email,
    apiOk,
    apiError,
    propertiesFound: scan?.properties.length ?? 0,
    gscSitesFound: scan?.gscSites.length ?? 0,
  });
});

app.get('/api/google/discover', requireAdmin, async (req, res) => {
  try {
    const scan = await discoverAll({ refresh: req.query.refresh === '1' });
    setSetting('google_api_ok', String(!scan.errors.ga4 || !scan.errors.gsc));
    const sites = db.prepare('SELECT id, client_name, domain, ga4_property_id, gsc_site_url FROM sites').all();
    const linkedProps = new Set(sites.map(s => s.ga4_property_id).filter(Boolean));
    const linkedHosts = new Set(sites.map(s => normalizeHost(s.domain)).filter(Boolean));
    res.json({
      ...scan,
      properties: scan.properties.map(p => ({
        ...p,
        linked: linkedProps.has(p.propertyId) ||
          p.streams.some(s => linkedHosts.has(normalizeHost(s.defaultUri))),
      })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bulk import: turn discovered GA4 properties into ready-made site records
// (no email/schedule yet — those get added per client when ready).
app.post('/api/google/import-sites', requireAdmin, async (req, res) => {
  const wanted = new Set((req.body?.propertyIds || []).map(String));
  if (!wanted.size) return res.status(400).json({ error: 'No properties selected' });
  let scan;
  try { scan = await discoverAll(); }
  catch (err) { return res.status(500).json({ error: err.message }); }
  const existingProps = new Set(db.prepare('SELECT ga4_property_id FROM sites').all().map(r => r.ga4_property_id).filter(Boolean));
  const created = [];
  for (const p of scan.properties) {
    if (!wanted.has(p.propertyId) || existingProps.has(p.propertyId)) continue;
    const stream = p.streams.find(s => s.defaultUri) || p.streams[0] || {};
    const domain = normalizeHost(stream.defaultUri || '');
    const gscMatch = domain
      ? (scan.gscSites.find(s => s.siteUrl === `sc-domain:${domain}`)?.siteUrl ||
         scan.gscSites.find(s => !s.siteUrl.startsWith('sc-domain:') && normalizeHost(s.siteUrl) === domain)?.siteUrl || '')
      : '';
    db.prepare(`INSERT INTO sites (client_name, domain, ga4_property_id, ga4_measurement_id, gsc_site_url, report_frequency, notes, dashboard_token, next_report_at)
                VALUES (?, ?, ?, ?, ?, 'none', ?, ?, NULL)`)
      .run(p.displayName, domain, p.propertyId, stream.measurementId || '', gscMatch,
        'Imported from Google Analytics — add the client\'s email and pick a report frequency to go live.',
        newDashboardToken());
    created.push(p.displayName);
  }
  res.json({ ok: true, created });
});

function siteSummary(site) {
  const lastReport = db.prepare('SELECT created_at, status, period_label, trigger_type FROM reports WHERE site_id = ? ORDER BY id DESC LIMIT 1').get(site.id);
  const claritySnapshots = db.prepare('SELECT COUNT(*) AS n FROM clarity_snapshots WHERE site_id = ?').get(site.id).n;
  const { clarity_api_token, ...safe } = site;
  return {
    ...safe,
    has_clarity_token: Boolean(clarity_api_token),
    lastReport: lastReport || null,
    claritySnapshots,
    dashboardUrl: `${getAppUrl()}/r/${site.dashboard_token}`,
  };
}

app.get('/api/sites', requireAdmin, (req, res) => {
  const sites = db.prepare('SELECT * FROM sites ORDER BY client_name COLLATE NOCASE').all();
  res.json(sites.map(siteSummary));
});

const SITE_FIELDS = ['client_name', 'contact_name', 'contact_emails', 'domain', 'ga4_property_id', 'ga4_measurement_id', 'gsc_site_url', 'clarity_project_id', 'clarity_api_token', 'fathom_site_id', 'report_frequency', 'notes'];

function cleanSiteBody(body) {
  const out = {};
  for (const f of SITE_FIELDS) {
    if (body[f] !== undefined) out[f] = String(body[f] ?? '').trim();
  }
  if (out.report_frequency && !['weekly', 'monthly', 'quarterly', 'none'].includes(out.report_frequency)) {
    out.report_frequency = 'monthly';
  }
  return out;
}

app.post('/api/sites', requireAdmin, (req, res) => {
  const data = cleanSiteBody(req.body || {});
  if (!data.client_name) return res.status(400).json({ error: 'Client name is required' });
  const freq = data.report_frequency || 'monthly';
  const info = db.prepare(`INSERT INTO sites (client_name, contact_name, contact_emails, domain, ga4_property_id, ga4_measurement_id, gsc_site_url, clarity_project_id, clarity_api_token, fathom_site_id, report_frequency, notes, dashboard_token, next_report_at)
    VALUES (@client_name, @contact_name, @contact_emails, @domain, @ga4_property_id, @ga4_measurement_id, @gsc_site_url, @clarity_project_id, @clarity_api_token, @fathom_site_id, @report_frequency, @notes, @token, @next)`)
    .run({
      client_name: '', contact_name: '', contact_emails: '', domain: '', ga4_property_id: '', ga4_measurement_id: '',
      gsc_site_url: '', clarity_project_id: '', clarity_api_token: '', fathom_site_id: '', notes: '',
      ...data, report_frequency: freq,
      token: newDashboardToken(), next: nextRunAt(freq),
    });
  res.json(siteSummary(db.prepare('SELECT * FROM sites WHERE id = ?').get(info.lastInsertRowid)));
});

app.put('/api/sites/:id', requireAdmin, (req, res) => {
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(req.params.id);
  if (!site) return res.status(404).json({ error: 'Site not found' });
  const data = cleanSiteBody(req.body || {});
  // Blank clarity token in the form means "keep the existing one".
  if (data.clarity_api_token === '') delete data.clarity_api_token;
  if (req.body?.clear_clarity_token) data.clarity_api_token = '';
  if (req.body?.active !== undefined) data.active = req.body.active ? 1 : 0;
  if (data.report_frequency && data.report_frequency !== site.report_frequency) {
    data.next_report_at = nextRunAt(data.report_frequency);
  }
  const keys = Object.keys(data);
  if (keys.length) {
    db.prepare(`UPDATE sites SET ${keys.map(k => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...data, id: site.id });
  }
  res.json(siteSummary(db.prepare('SELECT * FROM sites WHERE id = ?').get(site.id)));
});

app.delete('/api/sites/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM sites WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/sites/:id/autoconnect', requireAdmin, async (req, res) => {
  try {
    const result = await autoConnectSite(Number(req.params.id));
    const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(req.params.id);
    res.json({ ...result, site: siteSummary(site) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sites/:id/test-connections', requireAdmin, async (req, res) => {
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(req.params.id);
  if (!site) return res.status(404).json({ error: 'Site not found' });
  async function check(configured, fn) {
    if (!configured) return { status: 'not-configured' };
    try { await fn(); return { status: 'ok' }; }
    catch (err) { return { status: 'error', error: err.message.slice(0, 300) }; }
  }
  res.json({
    fathom: await check(site.fathom_site_id, () => fathom.gatherFathom(site.fathom_site_id, addDays(todayISO(), -8), addDays(todayISO(), -1))),
    ga4: await check(site.ga4_property_id, () => ga4.testConnection(site.ga4_property_id)),
    gsc: await check(site.gsc_site_url, () => gsc.testConnection(site.gsc_site_url)),
    clarity: await check(site.clarity_api_token, () => clarity.testConnection(site.clarity_api_token)),
  });
});

app.post('/api/sites/:id/send-report', requireAdmin, async (req, res) => {
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(req.params.id);
  if (!site) return res.status(404).json({ error: 'Site not found' });
  const result = await runReport(site, { trigger: 'manual' });
  res.json(result);
});

app.get('/api/sites/:id/preview.pdf', requireAdmin, async (req, res) => {
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(req.params.id);
  if (!site) return res.status(404).json({ error: 'Site not found' });
  try {
    const pdf = await previewReportPdf(site);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="preview-${site.id}.pdf"`);
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sites/:id/reports', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT id, period_start, period_end, period_label, sent_to, trigger_type, status, error, created_at, pdf_path FROM reports WHERE site_id = ? ORDER BY id DESC LIMIT 50').all(req.params.id));
});

app.get('/api/reports/:id/download', requireAdmin, (req, res) => {
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!report?.pdf_path) return res.status(404).json({ error: 'Report not found' });
  const path = join(config.reportsDir, report.pdf_path);
  if (!existsSync(path)) return res.status(404).json({ error: 'PDF file no longer exists' });
  res.download(path, report.pdf_path.replace(/^\d+-\d+-/, ''));
});

app.post('/api/sync-clarity', requireAdmin, async (req, res) => {
  const synced = await syncAllClarity();
  res.json({ ok: true, synced });
});

// Re-run the self-setup sweep on demand (idempotent — only fills gaps).
app.post('/api/ops/run', requireAdmin, async (req, res) => {
  try { res.json({ ok: true, log: await runOpsSweep({ force: true }) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GA auto-install: test on the demo site, or roll out to client sites.
app.post('/api/inject/test', requireAdmin, async (req, res) => {
  try { setSetting('inject_demo_done', 'false'); res.json({ ok: true, result: await runInjectionTest() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/inject/rollout', requireAdmin, async (req, res) => {
  try { res.json({ ok: true, results: await runInjectionRollout({ onlyDomain: req.body?.domain || null }) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Hostinger: list + one-click import of all hosted sites ──────
app.get('/api/hostinger/websites', requireAdmin, async (req, res) => {
  try {
    const domains = await hostinger.listDomains();
    const existing = new Set(db.prepare('SELECT domain FROM sites').all().map(r => normalizeHost(r.domain)).filter(Boolean));
    res.json({ ok: true, websites: domains.map(d => ({ ...d, alreadyInPulse: existing.has(normalizeHost(d.domain)) })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/hostinger/import-sites', requireAdmin, async (req, res) => {
  const wanted = (req.body?.domains || []).map(d => normalizeHost(d)).filter(Boolean);
  if (!wanted.length) return res.status(400).json({ error: 'No websites selected' });
  const existing = new Set(db.prepare('SELECT domain FROM sites').all().map(r => normalizeHost(r.domain)).filter(Boolean));
  const created = [];
  for (const domain of wanted) {
    if (existing.has(domain)) continue;
    const prettyName = domain.split('.')[0].replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const info = db.prepare(`INSERT INTO sites (client_name, domain, report_frequency, notes, dashboard_token, next_report_at)
                             VALUES (?, ?, 'monthly', ?, ?, ?)`)
      .run(prettyName, domain,
        'Imported from Hostinger — add the client\'s email to start their monthly reports.',
        newDashboardToken(), nextRunAt('monthly'));
    created.push({ id: info.lastInsertRowid, domain });
  }
  // Wire up whatever can be discovered, site by site (Google + installed tags).
  const results = [];
  for (const site of created) {
    try {
      const r = await autoConnectSite(site.id);
      results.push({ domain: site.domain, filled: Object.keys(r.filled), notes: r.notes });
    } catch (err) { results.push({ domain: site.domain, filled: [], notes: [err.message] }); }
  }
  res.json({ ok: true, created: created.length, results });
});

// ─── Fathom: connect every site's real visitor data in one click ──
function fathomMatch(fathomSites, site) {
  const host = normalizeHost(site.domain);
  const name = (site.client_name || '').toLowerCase();
  // Match a Fathom site to a Pulse site by domain or by name.
  return fathomSites.find(f => {
    const fn = (f.name || '').toLowerCase();
    const fnHost = normalizeHost(f.name);
    return (host && (fnHost === host || fn.includes(host) || host.includes(fnHost && fnHost.length > 3 ? fnHost : '\0')))
      || (name && fn && (fn === name || fn.includes(name) || name.includes(fn)));
  }) || null;
}

app.get('/api/fathom/sites', requireAdmin, async (req, res) => {
  try { res.json({ ok: true, sites: await fathom.listSites() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Auto-assign each Pulse site its Fathom site id by matching domain/name.
app.post('/api/fathom/match', requireAdmin, async (req, res) => {
  let fathomSites;
  try { fathomSites = await fathom.listSites(); }
  catch (err) { return res.status(500).json({ error: err.message }); }
  const sites = db.prepare('SELECT * FROM sites').all();
  const matched = [], unmatched = [];
  for (const site of sites) {
    if (site.fathom_site_id) { matched.push({ site: site.client_name, fathom: site.fathom_site_id, already: true }); continue; }
    const m = fathomMatch(fathomSites, site);
    if (m) {
      db.prepare('UPDATE sites SET fathom_site_id = ? WHERE id = ?').run(String(m.id), site.id);
      matched.push({ site: site.client_name, fathom: m.name || m.id });
    } else {
      unmatched.push(site.client_name);
    }
  }
  res.json({ ok: true, fathomSitesFound: fathomSites.length, matched, unmatched });
});

// ─── Client-facing (secret dashboard link, no login) ─────────────
function siteByToken(token) {
  return db.prepare('SELECT * FROM sites WHERE dashboard_token = ? AND active = 1').get(token);
}

// Live dashboard data is cached briefly to stay well inside API quotas.
const dataCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

app.get('/api/client/:token/data', async (req, res) => {
  const site = siteByToken(req.params.token);
  if (!site) return res.status(404).json({ error: 'Dashboard not found' });
  const rangeDays = { '7': 7, '30': 30, '90': 90 }[String(req.query.range)] || 30;
  const cacheKey = `${site.id}:${rangeDays}`;
  const cached = dataCache.get(cacheKey);
  if (cached && cached.at > Date.now() - CACHE_TTL) return res.json(cached.data);

  const end = addDays(todayISO(), -1);
  const start = addDays(end, -(rangeDays - 1));
  try {
    const data = await gatherReportData(site, start, end);
    const payload = {
      clientName: site.client_name,
      domain: site.domain,
      frequency: site.report_frequency,
      rangeDays,
      ...data,
    };
    dataCache.set(cacheKey, { at: Date.now(), data: payload });
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: 'Could not load analytics right now. Please try again shortly.' });
  }
});

app.post('/api/client/:token/request-report', async (req, res) => {
  const site = siteByToken(req.params.token);
  if (!site) return res.status(404).json({ error: 'Dashboard not found' });
  const recent = db.prepare(`SELECT COUNT(*) AS n FROM reports WHERE site_id = ? AND trigger_type = 'requested' AND created_at > datetime('now', '-1 day')`).get(site.id).n;
  if (recent >= 3) {
    return res.status(429).json({ error: 'You can request up to 3 reports a day — your most recent one should already be in your inbox.' });
  }
  const result = await runReport(site, { trigger: 'requested' });
  if (!result.ok) return res.status(500).json({ error: 'Sorry, we could not generate your report just now. North Bear Media has been notified.' });
  const masked = site.contact_emails.split(',').map(e => {
    const [user, dom] = e.trim().split('@');
    return user && dom ? `${user.slice(0, 2)}…@${dom}` : e;
  }).join(', ');
  res.json({ ok: true, message: `Done! A fresh PDF report (${result.periodText}) is on its way to ${masked}.` });
});

// ─── Pages + static ───────────────────────────────────────────────
app.get('/r/:token', (req, res) => {
  if (!siteByToken(req.params.token)) return res.status(404).send('Dashboard not found');
  res.sendFile(join(__dirname, 'public', 'client.html'));
});

app.get('/login', (req, res) => res.sendFile(join(__dirname, 'public', 'login.html')));

app.get('/', (req, res) => {
  if (!isValidSession(req.cookies?.pulse_session)) return res.redirect('/login');
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Injector script endpoint — the Hostinger cron job fetches and runs this.
// Gated by a per-install secret token (cron command is <255 chars, so the
// real script must be fetched). Returns the GA/Clarity injector for the
// given domain, resolved from that site's stored measurement/Clarity IDs.
app.get('/ix/:token/:domain', (req, res) => {
  if (!req.params.token || req.params.token !== getSetting('inject_script_token')) {
    return res.status(403).type('text/plain').send('echo "NBM: bad token"');
  }
  const domain = String(req.params.domain).toLowerCase().replace(/[^a-z0-9.-]/g, '');
  const demoId = 'G-MS3V4KS3PB';
  try {
    let measurementId, clarityId = null;
    if (domain === 'nbmdemosite2.co.uk') {
      measurementId = demoId;
    } else {
      // Single-quote the string literals: SQLite reads "www." as an
      // IDENTIFIER, so the double-quoted form threw "no such column",
      // 500'd this endpoint, and every client injector download failed.
      const site = db.prepare("SELECT * FROM sites WHERE lower(replace(domain,'www.','')) = ? AND active = 1").get(domain);
      if (!site || !site.ga4_measurement_id) {
        return res.status(200).type('text/x-shellscript').send(`echo "NBM: no measurement id for ${domain}"\n`);
      }
      measurementId = site.ga4_measurement_id;
      clarityId = site.clarity_project_id || null;
    }
    const script = buildInjectorScript(rootDirFor(domain), buildSnippet(measurementId, clarityId));
    res.type('text/x-shellscript').send(script);
  } catch (e) {
    // Never hard-500 the injector — a 500 makes curl write nothing and the
    // runner cron fails "no such file". Return a harmless shell no-op.
    console.error('[ix] error for', domain, e.message);
    res.status(200).type('text/x-shellscript').send(`echo "NBM: ix error for ${domain}: ${e.message.replace(/"/g, '')}"\n`);
  }
});

// Health checks. railway.json's healthcheckPath is /api/health; the app
// only served /healthz, so every deploy failed its health check and
// Railway refused to route the public domain to it (502 "Application
// failed to respond") even though the process was running fine. Serve
// both, and keep them dependency-free so a slow DB/SMTP can't fail them.
const health = (req, res) => res.json({ ok: true });
app.get('/healthz', health);
app.get('/api/health', health);
app.use(express.static(join(__dirname, 'public')));

app.listen(config.port, () => {
  console.log(`North Bear Pulse running on port ${config.port} — ${getAppUrl()}`);
  seedFirstCustomer();
  startScheduler();
  scheduleOpsSweep();
});

// Railway's edge routes the public domain to ONE configured target port.
// If that setting drifts from config.port, the edge returns 502
// "Application failed to respond" while the app runs happily — which is
// exactly what the boot email's self-fetch diagnosed. Answering on the
// usual suspects too makes the domain work whichever port the edge hits.
const extraPorts = [...new Set([Number(process.env.PORT) || 0, 8080, 3000, 3001, 5000])]
  .filter(p => p && p !== Number(config.port));
for (const p of extraPorts) {
  const srv = app.listen(p, () => console.log(`[net] also listening on ${p} (edge port-drift guard)`));
  srv.on('error', () => { /* port busy — fine, main listener has it */ });
}
