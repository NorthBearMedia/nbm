// Microsoft Clarity Data Export API.
// The API only exposes the last 1–3 days (max 10 calls/project/day), so a
// daily sync job stores each day's numbers in clarity_snapshots and reports
// aggregate over the stored history.
import db, { getSetting, setSetting } from '../database.js';
import { addDays, todayISO } from './dates.js';

const API_URL = 'https://www.clarity.ms/export-data/api/v1/project-live-insights';

export async function fetchLiveInsights(apiToken, numOfDays = 1, { byPage = false } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}?numOfDays=${numOfDays}${byPage ? '&dimension1=URL' : ''}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    if (err?.name === 'TimeoutError') throw new Error('Clarity API did not answer within 30 seconds');
    throw err;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Clarity API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// One Clarity project can serve several sites. Microsoft only lets a
// project be created by hand in its own console, so the smaller sites
// carry the tag of a project Pulse already reads (North Bear Media's own)
// and Pulse divides that project's figures up by web address. Nothing is
// estimated: Clarity files every visit under one page address, so a
// site's rows add up to exactly what a project of its own would report.
// Checked against a live project on 20 Nov 2026: visits, robots, dead
// clicks and script errors matched the whole-project export to the unit,
// and scroll depth and active time matched to within rounding.
const hostOf = v => String(v || '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#:]/)[0];

// One site's figures out of a page-by-page export, in the shape the
// whole-project export has, so aggregate() reads both the same way.
export function splitForSite(payload, domain) {
  const host = hostOf(domain);
  const rows = name => ((Array.isArray(payload) ? payload : []).find(m => m.metricName === name)?.information || [])
    .filter(r => host && hostOf(r.Url) === host);
  const sum = (list, field) => list.reduce((total, r) => total + Number(r[field] || 0), 0);
  const traffic = rows('Traffic');
  const visits = new Map();
  for (const r of traffic) visits.set(r.Url, (visits.get(r.Url) || 0) + Number(r.totalSessionCount || 0));
  // Averages are weighted by visits, which is how Clarity reaches its own.
  const mean = (list, field) => {
    let total = 0, weight = 0;
    for (const r of list) {
      const w = visits.get(r.Url) || 0;
      if (w && r[field] != null) { total += Number(r[field]) * w; weight += w; }
    }
    return weight ? total / weight : null;
  };
  const out = [{ metricName: 'Traffic', information: [{ totalSessionCount: sum(traffic, 'totalSessionCount'), totalBotSessionCount: sum(traffic, 'totalBotSessionCount') }] }];
  for (const name of ['DeadClickCount', 'RageClickCount', 'QuickbackClick', 'ScriptErrorCount']) {
    out.push({ metricName: name, information: [{ subTotal: sum(rows(name), 'subTotal') }] });
  }
  const scroll = mean(rows('ScrollDepth'), 'averageScrollDepth');
  if (scroll != null) out.push({ metricName: 'ScrollDepth', information: [{ averageScrollDepth: scroll }] });
  const active = mean(rows('EngagementTime'), 'activeTime');
  if (active != null) out.push({ metricName: 'EngagementTime', information: [{ activeTime: active }] });
  return out;
}

// A site can have an API token saved but no project ID: the token was
// pasted in and the ID never was. The tracking code Pulse hands out for
// that site then has no Clarity tag in it, so nothing is ever recorded
// (two sites sat like this for four months, with Pulse reading an empty
// project for each of them every night). The token itself says which
// project it reads: it is a signed pass (a JWT), and the API is given
// nothing else to go on. Which field holds the project is not written
// down anywhere, so nothing is assumed. The rule is worked out from the
// sites where both the token and the ID are known, and is only used when
// at least five of them, and four in every five, agree. A site whose ID
// is found, and whose project has recorded nothing, has its tracking
// code emailed to the owner (the list that sendTrackingCodeWhenReady in
// lib/ops.js works through), because the code on its pages is missing
// the tag.
const claimsOf = token => {
  try { return JSON.parse(Buffer.from(String(token).split('.')[1] || '', 'base64url').toString('utf8')); } catch { return null; }
};
const plain = v => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
const READINGS = [
  v => plain(v).toLowerCase(), // the ID as it appears in the tag
  v => (/^\d{6,20}$/.test(plain(v)) ? BigInt(plain(v)).toString(36) : ''), // the same ID written as a plain number
];

export function findProjectsFromTokens() {
  const sites = db.prepare("SELECT id, domain, clarity_project_id AS project, clarity_api_token AS token FROM sites WHERE active = 1 AND clarity_api_token != ''").all()
    .map(s => ({ ...s, claims: claimsOf(s.token) })).filter(s => s.claims && typeof s.claims === 'object');
  const known = sites.filter(s => s.project), blank = sites.filter(s => !s.project);
  if (!blank.length || known.length < 5) return [];
  let rule = null;
  for (const key of Object.keys(known[0].claims)) {
    for (const read of READINGS) {
      const attempt = claims => { try { return read(claims[key]); } catch { return ''; } };
      const agree = known.filter(s => attempt(s.claims) === String(s.project).toLowerCase()).length;
      if (agree >= 5 && agree >= known.length * 0.8) rule = attempt;
    }
  }
  if (!rule) return [];
  const found = [];
  for (const s of blank) {
    const project = rule(s.claims);
    if (!/^[a-z0-9]{6,16}$/.test(project)) continue;
    db.prepare('UPDATE sites SET clarity_project_id = ? WHERE id = ?').run(project, s.id);
    found.push(s);
    console.log(`[clarity] ${s.domain}: project ID read from its API token`);
  }
  const today = todayISO();
  wantTrackingCode(found.filter(s => !(aggregate(s.id, addDays(today, -30), today)?.sessions > 0)));
  return found.map(bare);
}

const bare = s => String(s.domain || '').toLowerCase().replace(/^www\./, '');
function wantTrackingCode(sites) {
  if (!sites.length) return;
  let wanted = [];
  try { wanted = JSON.parse(getSetting('tracking_code_wanted') || '[]'); } catch { /* start a fresh list */ }
  setSetting('tracking_code_wanted', JSON.stringify([...new Set([...wanted, ...sites.map(bare)])]));
}

// Last resort for a site whose own project still cannot be named. Its
// token has been read for a month or more and has never returned a single
// visit, human or robot, so the project behind it has no tag on any
// page. Rather than leave the site without behaviour data until someone
// opens Clarity to look the ID up, it joins the project other sites
// already share, and its tracking code is emailed to the owner. Its old
// token is kept in settings in case it is ever wanted. Nothing is deleted.
export function joinSharedIfEmpty() {
  const shared = db.prepare(`SELECT clarity_project_id AS project, clarity_api_token AS token, COUNT(*) AS n FROM sites
    WHERE active = 1 AND clarity_project_id != '' AND clarity_api_token != ''
    GROUP BY clarity_api_token HAVING n > 1 ORDER BY n DESC LIMIT 1`).get();
  if (!shared) return [];
  const blank = db.prepare(`SELECT id, domain, clarity_api_token AS token FROM sites
    WHERE active = 1 AND clarity_api_token != '' AND (clarity_project_id IS NULL OR clarity_project_id = '')`).all();
  const moved = [];
  for (const s of blank) {
    const ever = aggregate(s.id, '2000-01-01', todayISO());
    if (!ever || ever.daysCovered < 30 || ever.sessions > 0 || ever.botSessions > 0) continue;
    setSetting(`clarity_token_before_sharing_${s.id}`, s.token);
    db.prepare('UPDATE sites SET clarity_project_id = ?, clarity_api_token = ? WHERE id = ?').run(shared.project, shared.token, s.id);
    moved.push(s);
    console.log(`[clarity] ${s.domain}: its own project has never recorded a visit, so it now shares the project other sites use`);
  }
  wantTrackingCode(moved);
  return moved.map(bare);
}

// A site put on a project that another site already reads takes that
// site's API token, so the same token is never pasted twice.
export function shareTokens() {
  const done = db.prepare(`UPDATE sites SET clarity_api_token = (
      SELECT o.clarity_api_token FROM sites o
      WHERE o.clarity_project_id = sites.clarity_project_id AND o.clarity_api_token != '' ORDER BY o.id LIMIT 1)
    WHERE active = 1 AND clarity_project_id != '' AND (clarity_api_token IS NULL OR clarity_api_token = '')
      AND EXISTS (SELECT 1 FROM sites o WHERE o.clarity_project_id = sites.clarity_project_id AND o.clarity_api_token != '')`).run();
  if (done.changes) console.log(`[clarity] ${done.changes} site(s) joined a Clarity project another site already reads`);
  return done.changes;
}

// Clarity allows ten exports a day for each project. A shared project is
// asked once a day for all its sites, and a failed call is not repeated
// for half an hour, so one bad morning cannot spend the day's allowance.
const sharedFetch = new Map(); // token -> { date already fetched, failedAt }

// Pull yesterday's numbers for one site and store them. Skips silently if
// already snapshotted (so the scheduler can run safely more than once).
export async function syncSite(site) {
  const token = site.clarity_api_token;
  if (!token) return { skipped: true };
  const date = addDays(todayISO(), -1);
  const has = id => db.prepare('SELECT id FROM clarity_snapshots WHERE site_id = ? AND snapshot_date = ?').get(id, date);
  if (has(site.id)) return { skipped: true };
  const save = (id, payload) => db.prepare(
    'INSERT OR REPLACE INTO clarity_snapshots (site_id, snapshot_date, payload) VALUES (?, ?, ?)'
  ).run(id, date, JSON.stringify(payload));

  const others = db.prepare('SELECT id, domain FROM sites WHERE active = 1 AND clarity_api_token = ? AND id != ?').all(token, site.id);
  if (!others.length) {
    save(site.id, await fetchLiveInsights(token, 1));
    return { synced: true, date };
  }

  const state = sharedFetch.get(token) || {};
  if (state.date === date || Date.now() - (state.failedAt || 0) < 30 * 60_000) return { skipped: true };
  let payload;
  try { payload = await fetchLiveInsights(token, 1, { byPage: true }); }
  catch (err) { sharedFetch.set(token, { failedAt: Date.now() }); throw err; }
  sharedFetch.set(token, { date });
  if (Array.isArray(payload) && payload.some(m => (m.information || []).length >= 1000)) {
    console.warn('[clarity] a shared project came back with the most rows Clarity gives in one export, so some pages may be missing from its sites');
  }
  let stored = 0;
  for (const s of [site, ...others]) {
    if (has(s.id)) continue;
    const figures = splitForSite(payload, s.domain);
    const seen = figures[0].information[0];
    // A site whose tag is not on its pages yet has nothing to store. Its
    // history starts on the first day Clarity sees its address, and until
    // then its dashboard says behaviour tracking is being connected,
    // which is the truth.
    const started = db.prepare('SELECT 1 FROM clarity_snapshots WHERE site_id = ? LIMIT 1').get(s.id);
    if (!started && !seen.totalSessionCount && !seen.totalBotSessionCount) continue;
    save(s.id, figures);
    stored++;
  }
  return stored ? { synced: true, date, sites: stored } : { skipped: true };
}

function metricInfo(payload, name) {
  const m = (Array.isArray(payload) ? payload : []).find(x => x.metricName === name);
  return m?.information?.[0] || null;
}

// Aggregate stored daily snapshots across a reporting period into the
// handful of numbers we show clients.
export function aggregate(siteId, start, end) {
  const rows = db.prepare(
    'SELECT snapshot_date, payload FROM clarity_snapshots WHERE site_id = ? AND snapshot_date BETWEEN ? AND ? ORDER BY snapshot_date'
  ).all(siteId, start, end);
  if (!rows.length) return null;

  const totals = { sessions: 0, botSessions: 0, deadClicks: 0, rageClicks: 0, quickBacks: 0, scriptErrors: 0 };
  let scrollSum = 0, scrollCount = 0, engagedSum = 0, engagedCount = 0;

  for (const row of rows) {
    let payload;
    try { payload = JSON.parse(row.payload); } catch { continue; }
    const traffic = metricInfo(payload, 'Traffic');
    if (traffic) {
      totals.sessions += Number(traffic.totalSessionCount || 0);
      totals.botSessions += Number(traffic.totalBotSessionCount || 0);
    }
    totals.deadClicks += Number(metricInfo(payload, 'DeadClickCount')?.subTotal || 0);
    totals.rageClicks += Number(metricInfo(payload, 'RageClickCount')?.subTotal || 0);
    totals.quickBacks += Number(metricInfo(payload, 'QuickbackClick')?.subTotal || 0);
    totals.scriptErrors += Number(metricInfo(payload, 'ScriptErrorCount')?.subTotal || 0);
    const scroll = metricInfo(payload, 'ScrollDepth');
    if (scroll && scroll.averageScrollDepth != null) { scrollSum += Number(scroll.averageScrollDepth); scrollCount++; }
    const engage = metricInfo(payload, 'EngagementTime');
    if (engage && engage.activeTime != null) { engagedSum += Number(engage.activeTime); engagedCount++; }
  }

  return {
    daysCovered: rows.length,
    sessions: totals.sessions,
    // What clients should see: real people. Clarity already leaves robots
    // out of totalSessionCount and counts them apart (a page only robots
    // opened comes back with 0 visits and 1 or more robot visits), so the
    // total is the figure. This used to take the robots off a second time,
    // which under-reported "visits watched" on every site.
    humanSessions: totals.sessions,
    botSessions: totals.botSessions,
    deadClicks: totals.deadClicks,
    rageClicks: totals.rageClicks,
    quickBacks: totals.quickBacks,
    scriptErrors: totals.scriptErrors,
    avgScrollDepth: scrollCount ? scrollSum / scrollCount : null,
    avgActiveTimeSeconds: engagedCount ? engagedSum / engagedCount : null,
  };
}

export async function testConnection(apiToken) {
  await fetchLiveInsights(apiToken, 1);
  return true;
}
