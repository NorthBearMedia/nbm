// Website monitoring: is each client site up, is its certificate and
// domain in date, and is it telling Google to ignore it. Built into
// Pulse so the owner hears about a problem before the client does.
//
// Everything here only READS. One plain GET of each homepage every five
// minutes, one certificate read and one domain lookup a day. Nothing is
// changed on a client site, in Hostinger or in Google.
//
// Storage is deliberately small: one summary row per site per day, one
// row per incident, and a compact state record per site in settings.
import { connect as tlsConnect } from 'tls';
import { randomBytes, timingSafeEqual } from 'crypto';
import db, { getSetting, setSetting } from '../database.js';
import { config } from '../config.js';
import { mailer } from './email.js';
import { getEmailFrom, getOwnerEmail, getAppUrl, getHostingerToken } from './runtime-config.js';

export const ROUND_MINUTES = 5;
const TIMEOUT_MS = 15_000;
const RETRY_WAIT_MS = 3_000;
const CONCURRENCY = 6;
const USER_AGENT = 'NBM Pulse monitor (+https://northbearmedia.co.uk)';
// Down only after this many failed rounds in a row.
const CONFIRM_ROUNDS = 2;
// More than this share of sites failing in one round means Pulse's own
// connection is the problem, not the sites.
const MASS_FAILURE_SHARE = 0.5;
// A longer silence than this between rounds is Pulse restarting or
// stopped, not the site: a failure before the gap does not count
// towards the two in a row needed to call a site down.
const GAP_MS = 3 * 5 * 60_000;
const MASS_FAILURE_MIN_SITES = 3;
// Last 24 hours of rounds, one character each, kept per site.
const RECENT_MAX = Math.round((24 * 60) / ROUND_MINUTES);
const DAY_MS = 24 * 3600_000;
const BODY_CAP = 512 * 1024;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = d => String(d || '').toLowerCase().replace(/^www\./, '');

// ── Time helpers, all in the configured UK timezone ──────────────────────

export function dayKey(now = new Date()) {
  return new Date(now).toLocaleDateString('en-CA', { timeZone: config.timezone });
}

export function ukTime(d) {
  return new Date(d).toLocaleString('en-GB', {
    timeZone: config.timezone, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function ukDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { timeZone: config.timezone, day: 'numeric', month: 'long', year: 'numeric' });
}

export function describeDuration(ms) {
  const mins = Math.max(1, Math.round(ms / 60_000));
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`;
  const hours = Math.floor(mins / 60), rest = mins % 60;
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}${rest ? ` ${rest} minute${rest === 1 ? '' : 's'}` : ''}`;
  const days = Math.floor(hours / 24), hrs = hours % 24;
  return `${days} day${days === 1 ? '' : 's'}${hrs ? ` ${hrs} hour${hrs === 1 ? '' : 's'}` : ''}`;
}

function daysUntil(iso, now = new Date()) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!isFinite(t)) return null;
  return Math.floor((t - new Date(now).getTime()) / DAY_MS);
}

// ── State kept in the settings table ─────────────────────────────────────

function loadJson(key) {
  try { return JSON.parse(getSetting(key) || '{}'); } catch { return {}; }
}

export function loadState() { return loadJson('monitor_state'); }
function saveState(state) { setSetting('monitor_state', JSON.stringify(state)); }

export function monitoredSites() {
  return db.prepare("SELECT * FROM sites WHERE active = 1 AND domain != '' ORDER BY client_name COLLATE NOCASE").all()
    .map(s => ({ ...s, d: norm(s.domain) }))
    .filter(s => s.d && s.d !== 'nbmdemosite2.co.uk');
}

// The read only status feed lives behind a long random token, made once
// and kept in settings, like the /r/<token> dashboard links.
export function ensureFeedToken() {
  let t = getSetting('monitor_feed_token');
  if (!t) { t = randomBytes(24).toString('hex'); setSetting('monitor_feed_token', t); }
  return t;
}

export function feedTokenMatches(given) {
  const real = Buffer.from(ensureFeedToken());
  const g = Buffer.from(String(given || ''));
  return g.length === real.length && timingSafeEqual(g, real);
}

// ── Alerts: plain text emails to the owner, never twice for one problem ──

// `once` keys (certificate and domain warnings, keyed on the expiry date)
// go out a single time. Everything else at most once per UK calendar day.
export async function sendAlert(key, subject, text, { once = false, now = new Date() } = {}) {
  const log = loadJson('monitor_alert_log');
  const last = log[key];
  const nowMs = new Date(now).getTime();
  if (last && (once || dayKey(last) === dayKey(now))) return { sent: false, reason: 'already sent' };
  if (process.env.MONITOR_DRY_RUN === '1') {
    console.log(`[monitor] dry run, would email: ${subject}`);
  } else {
    await mailer().sendMail({ from: getEmailFrom(), to: getOwnerEmail(), subject, text });
  }
  log[key] = new Date(now).toISOString();
  // Keep the log small: anything older than 90 days has no bearing on
  // the once a day rule, and once only keys carry their expiry date.
  for (const [k, v] of Object.entries(log)) if (nowMs - Date.parse(v) > 90 * DAY_MS) delete log[k];
  setSetting('monitor_alert_log', JSON.stringify(log));
  return { sent: true };
}

// ── One fetch of one page ────────────────────────────────────────────────

export async function fetchOnce(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,*/*;q=0.8', 'Cache-Control': 'no-cache' },
    });
    const body = (await res.text().catch(() => '')).slice(0, BODY_CAP);
    return {
      ok: res.status >= 200 && res.status < 300, status: res.status, ms: Date.now() - started,
      body, robotsHeader: res.headers.get('x-robots-tag') || '', finalUrl: res.url || url, error: '',
    };
  } catch (err) {
    const name = err?.name || '';
    const msg = name === 'TimeoutError' || name === 'AbortError' ? `no answer within ${TIMEOUT_MS / 1000} seconds`
      : (err?.cause?.code || err?.code || err?.message || 'request failed');
    return { ok: false, status: 0, ms: Date.now() - started, body: '', robotsHeader: '', finalUrl: url, error: String(msg).slice(0, 120) };
  }
}

// One retry inside the round, so a single dropped packet is not a failure.
export async function checkSite(url, { retryWait = RETRY_WAIT_MS } = {}) {
  const first = await fetchOnce(url);
  if (first.ok) return { ...first, attempts: 1 };
  await sleep(retryWait);
  const second = await fetchOnce(url);
  return { ...second, attempts: 2 };
}

export function pageSaysNoindex(body, robotsHeader) {
  if (/noindex/i.test(robotsHeader || '')) return true;
  const metas = String(body || '').match(/<meta\b[^>]*>/gi) || [];
  return metas.some(m => /name\s*=\s*["']?robots["']?/i.test(m) && /content\s*=\s*["'][^"']*noindex/i.test(m));
}

function describeFailure(r) {
  if (r.status) return `the homepage answered with HTTP ${r.status} instead of a normal 200 response`;
  return `the homepage ${r.error || 'did not answer'}`;
}

async function inBatches(items, worker) {
  const out = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) { const i = next++; out[i] = await worker(items[i], i); }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, lane));
  return out;
}

function bumpDaily(siteId, day, failed, ms) {
  db.prepare(`INSERT INTO monitor_daily (site_id, day, checks, failures, ms_total, ms_count)
              VALUES (?, ?, 1, ?, ?, ?)
              ON CONFLICT(site_id, day) DO UPDATE SET
                checks = checks + 1, failures = failures + excluded.failures,
                ms_total = ms_total + excluded.ms_total, ms_count = ms_count + excluded.ms_count`)
    .run(siteId, day, failed ? 1 : 0, failed ? 0 : ms, failed ? 0 : 1);
}

function openIncident(siteId) {
  return db.prepare('SELECT * FROM monitor_incidents WHERE site_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1').get(siteId) || null;
}

// ── The five minute round ────────────────────────────────────────────────

let rounding = false;

// urlFor and notify are injectable so the whole state machine can be
// driven against a local server in tests. Live callers pass nothing.
export async function runRound({ now = new Date(), urlFor = d => `https://${d}/`, notify = sendAlert } = {}) {
  if (rounding) return { skipped: 'round already running' };
  rounding = true;
  try { return await roundInner({ now, urlFor, notify }); } finally { rounding = false; }
}

async function roundInner({ now, urlFor, notify }) {
  // Never more often than every five minutes per site, and never two
  // "rounds in a row" seconds apart (a boot round next to a scheduled one
  // would otherwise confirm an outage without the five minute wait).
  const prevRound = loadJson('monitor_last_round');
  const sincePrev = prevRound.at ? new Date(now).getTime() - Date.parse(prevRound.at) : Infinity;
  if (sincePrev >= 0 && sincePrev < ROUND_MINUTES * 60_000 - 30_000) {
    return { skipped: 'last round was under five minutes ago' };
  }
  const nowIso = new Date(now).toISOString();
  const sites = monitoredSites().filter(s => !s.monitor_paused);
  const results = await inBatches(sites, s => checkSite(urlFor(s.d)));
  const failed = results.filter(r => !r.ok).length;

  // Most sites failing at once is Pulse's own connection. Say so once,
  // mark nothing down, and count nothing against the sites.
  if (sites.length >= MASS_FAILURE_MIN_SITES && failed / sites.length > MASS_FAILURE_SHARE) {
    setSetting('monitor_last_round', JSON.stringify({ at: nowIso, checked: sites.length, failed, massFailure: true }));
    await notify('pulse-connection', 'PULSE: cannot reach client sites',
      [`In the check at ${ukTime(now)}, ${failed} of ${sites.length} sites failed at the same time.`,
        'That is almost certainly Pulse\'s own connection rather than the sites, so no site has been marked down and nothing is being counted as downtime.',
        'If this keeps happening, check the Railway service for Pulse.',
        '', `Uptime view: ${getAppUrl()}/`].join('\n'), { now }).catch(e => console.error('[monitor] alert failed:', e.message));
    return { checked: sites.length, failed, massFailure: true };
  }

  const state = loadState();
  const day = dayKey(now);
  const events = [];
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i], r = results[i];
    const st = state[s.d] = state[s.d] || {};
    if (st.lastChecked && new Date(now).getTime() - Date.parse(st.lastChecked) > GAP_MS) {
      st.fails = 0; st.firstFailAt = null;
    }
    st.lastChecked = nowIso;
    st.lastStatus = r.status;
    st.lastMs = r.ms;
    st.lastError = r.ok ? '' : (r.error || `HTTP ${r.status}`);
    st.recent = ((st.recent || '') + (r.ok ? '1' : '0')).slice(-RECENT_MAX);
    bumpDaily(s.id, day, !r.ok, r.ms);

    if (r.ok) {
      const incident = openIncident(s.id);
      if (incident) {
        db.prepare('UPDATE monitor_incidents SET ended_at = ? WHERE id = ?').run(nowIso, incident.id);
        const downFor = describeDuration(new Date(now).getTime() - Date.parse(incident.started_at));
        events.push({ domain: s.d, event: 'back-up', downFor });
        // Only for an outage the owner was told about: a "back up" for a
        // DOWN email that was held back (second outage the same day)
        // would describe a problem he never heard of.
        if (st.alertedIncident === incident.id) {
          await notify(`back-up:${s.d}:${incident.id}`, `BACK UP: ${s.d}, down ${downFor}`,
            [`${s.d} is answering again.`, '', `Down since: ${ukTime(incident.started_at)} (UK time)`, `Back at: ${ukTime(now)}`,
              `Total: ${downFor}`, `What had failed: ${incident.reason}`, '', `Page: ${urlFor(s.d)}`].join('\n'), { once: true, now })
            .catch(e => console.error('[monitor] alert failed:', e.message));
        }
        st.alertedIncident = null;
      }
      st.fails = 0;
      st.firstFailAt = null;
      st.status = 'up';

      // Noindex is a quiet way to vanish from Google. Checked on the page
      // already in hand, unless the owner says this site is meant to be hidden.
      const noindex = pageSaysNoindex(r.body, r.robotsHeader);
      st.noindex = noindex;
      if (noindex && !s.monitor_hidden_ok) {
        events.push({ domain: s.d, event: 'noindex' });
        await notify(`noindex:${s.d}`, `NOINDEX: ${s.d} is telling Google not to list it`,
          [`The homepage of ${s.d} carries a "noindex" instruction (in its meta robots tag or X-Robots-Tag header), which tells Google to drop it from search results.`,
            `Seen at: ${ukTime(now)} (UK time)`, '',
            'If that is deliberate, open the Uptime view in Pulse and mark the site as meant to be hidden from Google, and this warning will stop.',
            `Page: ${urlFor(s.d)}`].join('\n'), { now }).catch(e => console.error('[monitor] alert failed:', e.message));
      }
    } else {
      st.fails = (st.fails || 0) + 1;
      st.firstFailAt = st.firstFailAt || nowIso;
      if (st.fails >= CONFIRM_ROUNDS) {
        st.status = 'down';
        if (!openIncident(s.id)) {
          const reason = describeFailure(r);
          const info = db.prepare('INSERT INTO monitor_incidents (site_id, started_at, reason, status_code) VALUES (?, ?, ?, ?)')
            .run(s.id, st.firstFailAt, reason, r.status || 0);
          const incidentId = Number(info.lastInsertRowid);
          events.push({ domain: s.d, event: 'down', reason });
          // One DOWN email per site per UK day, however often it flaps.
          await notify(`down:${s.d}`, `DOWN: ${s.d}`,
            [`${s.d} is down.`, '', `What failed: ${reason}.`,
              `Since: ${ukTime(st.firstFailAt)} (UK time), confirmed by two checks five minutes apart, each tried twice.`,
              `Page: ${urlFor(s.d)}`, '', 'Pulse will email again when it is back.'].join('\n'), { now })
            .then(r2 => { if (r2?.sent) st.alertedIncident = incidentId; })
            .catch(e => console.error('[monitor] alert failed:', e.message));
        }
      } else if (st.status !== 'down') {
        // One failed round on its own is a blip, not an outage.
        st.status = st.status || 'unknown';
      }
    }
  }
  saveState(state);
  setSetting('monitor_last_round', JSON.stringify({ at: nowIso, checked: sites.length, failed, massFailure: false }));
  return { checked: sites.length, failed, massFailure: false, events };
}

// ── Daily checks: certificate and domain expiry ──────────────────────────

// Reads the date only. Validation is not enforced here so an already
// expired or mismatched certificate still yields its date; whether a
// browser would trust it is reported alongside.
export function readCertExpiry(host, { port = 443 } = {}) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const socket = tlsConnect({ host, port, servername: host, rejectUnauthorized: false, timeout: TIMEOUT_MS }, () => {
      const cert = socket.getPeerCertificate();
      const to = cert && cert.valid_to ? new Date(cert.valid_to) : null;
      const trusted = socket.authorized;
      const why = trusted ? '' : String(socket.authorizationError || '');
      socket.end();
      finish(to && isFinite(to.getTime())
        ? { expiresAt: to.toISOString(), error: '', trusted, untrustedReason: why }
        : { expiresAt: null, error: 'no certificate returned', trusted: false, untrustedReason: why });
    });
    socket.on('timeout', () => { socket.destroy(); finish({ expiresAt: null, error: 'no answer within 15 seconds' }); });
    socket.on('error', err => finish({ expiresAt: null, error: String(err?.code || err?.message || 'tls error').slice(0, 120) }));
  });
}

function pickExpiry(obj) {
  for (const k of ['expires_at', 'expiration_date', 'expiry_date', 'expires', 'expiry', 'valid_until']) {
    const v = obj?.[k];
    if (v && isFinite(Date.parse(v))) return new Date(v).toISOString();
  }
  return null;
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...headers }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Hostinger first (the token Pulse already holds), then RDAP through the
// official IANA directory of registry servers. Many registries publish no
// RDAP, so "not known" is a normal answer and is shown as such.
let portfolioCache = null;
let rdapCache = null;
async function hostingerPortfolio() {
  if (portfolioCache && Date.now() - portfolioCache.at < 30 * 60_000) return portfolioCache.items;
  const data = await getJson('https://developers.hostinger.com/api/domains/v1/portfolio', { Authorization: `Bearer ${getHostingerToken()}` });
  const items = Array.isArray(data) ? data : (data.data || data.domains || []);
  portfolioCache = { at: Date.now(), items };
  return items;
}
async function rdapBaseFor(domain) {
  if (!rdapCache || Date.now() - rdapCache.at > DAY_MS) {
    const boot = await getJson('https://data.iana.org/rdap/dns.json');
    rdapCache = { at: Date.now(), services: boot.services || [] };
  }
  const labels = domain.split('.');
  for (let i = 1; i < labels.length; i++) {
    const tld = labels.slice(i).join('.');
    const hit = rdapCache.services.find(([tlds]) => (tlds || []).includes(tld));
    if (hit && hit[1]?.[0]) return hit[1][0].replace(/\/?$/, '/');
  }
  return null;
}

export async function readDomainExpiry(domain) {
  if (getHostingerToken()) {
    try {
      const row = (await hostingerPortfolio()).find(x => norm(x.domain || x.name || x.domain_name) === domain);
      const fromList = pickExpiry(row);
      if (fromList) return { expiresAt: fromList, source: 'hostinger' };
    } catch (e) { console.log('[monitor] hostinger domain lookup failed:', String(e.message || e).slice(0, 80)); }
  }
  try {
    const base = await rdapBaseFor(domain);
    if (base) {
      const rdap = await getJson(`${base}domain/${encodeURIComponent(domain)}`);
      const ev = (rdap?.events || []).find(x => String(x.eventAction || '').toLowerCase() === 'expiration');
      if (ev?.eventDate && isFinite(Date.parse(ev.eventDate))) return { expiresAt: new Date(ev.eventDate).toISOString(), source: 'rdap' };
    }
  } catch { /* registry has no RDAP, or it is not reachable */ }
  return { expiresAt: null, source: '' };
}

async function expiryWarnings({ notify, now, domain, kind, expiresAt, thresholds, subjectWord, explain, urlFor }) {
  const days = daysUntil(expiresAt, now);
  if (days === null) return;
  for (const t of thresholds) {
    if (days > t) continue;
    const key = `${kind}-${t}:${domain}:${expiresAt.slice(0, 10)}`;
    const when = days < 0 ? `expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago` : `expires in ${days} day${days === 1 ? '' : 's'}`;
    await notify(key, `${subjectWord}: ${domain} ${when}`,
      [`${explain} for ${domain} ${when}, on ${ukDate(expiresAt)}.`, '', `Page: ${urlFor(domain)}`].join('\n'), { once: true, now })
      .catch(e => console.error('[monitor] alert failed:', e.message));
    break; // the nearest threshold crossed is the one to mention
  }
}

// Once a day, including after a restart only if today's pass has not run.
export async function runDailyChecks({ now = new Date(), notify = sendAlert, certReader = readCertExpiry, domainReader = readDomainExpiry, urlFor = d => `https://${d}/`, force = false } = {}) {
  const day = dayKey(now);
  if (!force && getSetting('monitor_daily_done') === day) return { skipped: 'already run today' };
  const state = loadState();
  const sites = monitoredSites().filter(s => !s.monitor_paused);
  for (const s of sites) {
    const st = state[s.d] = state[s.d] || {};
    const cert = await certReader(s.d);
    st.certExpiresAt = cert.expiresAt;
    st.certError = cert.error || '';
    st.certTrusted = cert.trusted !== false;
    st.certUntrustedReason = cert.untrustedReason || '';
    const dom = await domainReader(s.d);
    st.domainExpiresAt = dom.expiresAt;
    st.domainSource = dom.source || '';
    st.dailyCheckedAt = new Date(now).toISOString();
    if (cert.expiresAt) {
      await expiryWarnings({ notify, now, domain: s.d, kind: 'cert', expiresAt: cert.expiresAt, thresholds: [3, 14], subjectWord: 'CERTIFICATE', explain: 'The SSL certificate', urlFor });
    }
    if (dom.expiresAt) {
      await expiryWarnings({ notify, now, domain: s.d, kind: 'domain', expiresAt: dom.expiresAt, thresholds: [7, 30], subjectWord: 'DOMAIN', explain: 'The domain registration', urlFor });
    }
  }
  saveState(state);
  setSetting('monitor_daily_done', day);
  return { checked: sites.length };
}

// ── Read models: the admin Uptime view and the status feed ──────────────

function uptimeOver(siteId, days, now) {
  const from = dayKey(new Date(new Date(now).getTime() - (days - 1) * DAY_MS));
  const row = db.prepare('SELECT SUM(checks) AS checks, SUM(failures) AS failures, SUM(ms_total) AS ms, SUM(ms_count) AS n FROM monitor_daily WHERE site_id = ? AND day >= ?').get(siteId, from);
  const checks = Number(row?.checks || 0);
  return {
    pct: checks ? Math.round(((checks - Number(row.failures || 0)) / checks) * 1000) / 10 : null,
    avgMs: Number(row?.n || 0) ? Math.round(Number(row.ms) / Number(row.n)) : null,
    checks,
  };
}

function recentPct(recent) {
  if (!recent) return null;
  const up = (recent.match(/1/g) || []).length;
  return Math.round((up / recent.length) * 1000) / 10;
}

function siteView(s, st, now) {
  const incident = db.prepare('SELECT * FROM monitor_incidents WHERE site_id = ? ORDER BY id DESC LIMIT 1').get(s.id) || null;
  const week = uptimeOver(s.id, 7, now), month = uptimeOver(s.id, 30, now);
  const open = incident && !incident.ended_at;
  return {
    id: s.id, client: s.client_name, domain: s.d,
    paused: Boolean(s.monitor_paused), hiddenOk: Boolean(s.monitor_hidden_ok), inReports: s.uptime_in_reports !== 0,
    status: s.monitor_paused ? 'paused' : (open ? 'down' : (st.status || 'unknown')),
    lastChecked: st.lastChecked || null, lastStatus: st.lastStatus ?? null, lastMs: st.lastMs ?? null, lastError: st.lastError || '',
    uptime24h: recentPct(st.recent), uptime7d: week.pct, uptime30d: month.pct, avgMs7d: week.avgMs,
    certExpiresAt: st.certExpiresAt || null, certDays: daysUntil(st.certExpiresAt, now), certError: st.certError || '',
    certTrusted: st.certTrusted !== false, certUntrustedReason: st.certUntrustedReason || '',
    domainExpiresAt: st.domainExpiresAt || null, domainDays: daysUntil(st.domainExpiresAt, now), domainSource: st.domainSource || '',
    noindex: Boolean(st.noindex), noindexFailing: Boolean(st.noindex) && !s.monitor_hidden_ok,
    lastIncident: incident ? {
      startedAt: incident.started_at, endedAt: incident.ended_at, reason: incident.reason,
      minutes: Math.round(((incident.ended_at ? Date.parse(incident.ended_at) : new Date(now).getTime()) - Date.parse(incident.started_at)) / 60_000),
      open: Boolean(open),
    } : null,
  };
}

export function uptimeOverview(now = new Date()) {
  const state = loadState();
  const lastRound = loadJson('monitor_last_round');
  return {
    generatedAt: new Date(now).toISOString(),
    lastRound: lastRound.at ? lastRound : null,
    roundMinutes: ROUND_MINUTES,
    feedUrl: `${getAppUrl()}/u/${ensureFeedToken()}`,
    sites: monitoredSites().map(s => siteView(s, state[s.d] || {}, now)),
  };
}

// For the assistant: the time of the last round and every site's state.
// A stale "lastRound" means Pulse itself has stopped.
export function statusFeed(now = new Date()) {
  const state = loadState();
  const lastRound = loadJson('monitor_last_round');
  return {
    generatedAt: new Date(now).toISOString(),
    roundMinutes: ROUND_MINUTES,
    lastRound: lastRound.at ? lastRound : null,
    sites: monitoredSites().map(s => {
      const v = siteView(s, state[s.d] || {}, now);
      return {
        domain: v.domain, client: v.client, status: v.status, paused: v.paused,
        lastChecked: v.lastChecked, lastStatus: v.lastStatus, lastMs: v.lastMs, lastError: v.lastError,
        uptime24h: v.uptime24h, uptime7d: v.uptime7d, uptime30d: v.uptime30d,
        certDays: v.certDays, domainDays: v.domainDays, noindexFailing: v.noindexFailing,
        openIncidentSince: v.lastIncident?.open ? v.lastIncident.startedAt : null,
      };
    }),
  };
}

export function setMonitorFlags(siteId, { paused, hiddenOk, inReports }) {
  if (paused !== undefined) db.prepare('UPDATE sites SET monitor_paused = ? WHERE id = ?').run(paused ? 1 : 0, siteId);
  if (hiddenOk !== undefined) db.prepare('UPDATE sites SET monitor_hidden_ok = ? WHERE id = ?').run(hiddenOk ? 1 : 0, siteId);
  if (inReports !== undefined) db.prepare('UPDATE sites SET uptime_in_reports = ? WHERE id = ?').run(inReports ? 1 : 0, siteId);
  if (paused) {
    // Pausing closes any open incident quietly: the owner is moving the
    // site and knows it is unreachable.
    const site = db.prepare('SELECT id FROM sites WHERE id = ?').get(siteId);
    if (site) db.prepare("UPDATE monitor_incidents SET ended_at = ? WHERE site_id = ? AND ended_at IS NULL").run(new Date().toISOString(), siteId);
  }
}

// ── The client facing uptime score (dashboard and PDF) ───────────────────

export const MIN_REPORT_DAYS = 14;
// A day counts towards the 14 only if at least half of its checks ran, so
// a day Pulse spent mostly restarting does not count as measured.
const MIN_CHECKS_PER_DAY = Math.round(RECENT_MAX / 2);

// Midnight UK time at the start of a YYYY-MM-DD date, as epoch ms.
function ukMidnightMs(dateStr) {
  const utc = Date.parse(`${dateStr}T00:00:00Z`);
  for (const c of [utc - 3600_000, utc]) if (dayKey(new Date(c)) === dateStr) return c;
  return utc;
}

// Uptime for a report period, or null when it must not be shown: switched
// off for the site, or fewer than 14 well measured days in the period.
// Built from CONFIRMED outages only (two failed rounds in a row), so a
// single blip, or Pulse's own connection trouble, never lowers a client's
// score. Only numbers leave here: no incident reasons reach a client.
export function reportUptime(site, start, end, now = new Date()) {
  if (!site || site.uptime_in_reports === 0) return null;
  const days = db.prepare('SELECT day, checks FROM monitor_daily WHERE site_id = ? AND day >= ? AND day <= ? AND checks >= ? ORDER BY day')
    .all(site.id, start, end, MIN_CHECKS_PER_DAY);
  if (days.length < MIN_REPORT_DAYS) return null;
  const allChecks = db.prepare('SELECT SUM(checks) AS n FROM monitor_daily WHERE site_id = ? AND day >= ? AND day <= ?').get(site.id, start, end).n || 0;
  const monitoredMinutes = allChecks * ROUND_MINUTES;
  const fromMs = ukMidnightMs(start);
  const toMs = Math.min(ukMidnightMs(new Date(Date.parse(`${end}T12:00:00Z`) + DAY_MS).toISOString().slice(0, 10)), new Date(now).getTime());
  const incidents = db.prepare('SELECT started_at, ended_at FROM monitor_incidents WHERE site_id = ? AND started_at < ? AND (ended_at IS NULL OR ended_at > ?)')
    .all(site.id, new Date(toMs).toISOString(), new Date(fromMs).toISOString());
  let downMs = 0;
  for (const i of incidents) {
    const a = Math.max(Date.parse(i.started_at), fromMs);
    const b = Math.min(i.ended_at ? Date.parse(i.ended_at) : new Date(now).getTime(), toMs);
    if (b > a) downMs += b - a;
  }
  const downtimeMinutes = Math.min(Math.round(downMs / 60_000), monitoredMinutes);
  // Rounded DOWN, so any downtime at all never displays as 100%.
  const uptimePct = downtimeMinutes ? Math.floor((1 - downtimeMinutes / monitoredMinutes) * 10_000) / 100 : 100;
  return {
    uptimePct, downtimeMinutes, outages: incidents.length,
    daysMeasured: days.length, measuredFrom: days[0].day > start ? days[0].day : null,
    downtimeText: downtimeMinutes ? describeDuration(downtimeMinutes * 60_000) : 'none',
    downtimeShort: downtimeMinutes ? shortDuration(downtimeMinutes) : 'None',
  };
}

// Compact form for the score tiles: "22 min", "1 h 5 min", "2 d 3 h".
function shortDuration(mins) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 24) return `${h} h${m ? ` ${m} min` : ''}`;
  return `${Math.floor(h / 24)} d${h % 24 ? ` ${h % 24} h` : ''}`;
}
