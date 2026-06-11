// Microsoft Clarity Data Export API.
// The API only exposes the last 1–3 days (max 10 calls/project/day), so a
// daily sync job stores each day's numbers in clarity_snapshots and reports
// aggregate over the stored history.
import db from '../database.js';
import { addDays, todayISO } from './dates.js';

const API_URL = 'https://www.clarity.ms/export-data/api/v1/project-live-insights';

export async function fetchLiveInsights(apiToken, numOfDays = 1) {
  const res = await fetch(`${API_URL}?numOfDays=${numOfDays}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Clarity API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// Pull yesterday's numbers for one site and store them. Skips silently if
// already snapshotted (so the scheduler can run safely more than once).
export async function syncSite(site) {
  if (!site.clarity_api_token) return { skipped: true };
  const date = addDays(todayISO(), -1);
  const existing = db.prepare(
    'SELECT id FROM clarity_snapshots WHERE site_id = ? AND snapshot_date = ?'
  ).get(site.id, date);
  if (existing) return { skipped: true };

  const payload = await fetchLiveInsights(site.clarity_api_token, 1);
  db.prepare(
    'INSERT OR REPLACE INTO clarity_snapshots (site_id, snapshot_date, payload) VALUES (?, ?, ?)'
  ).run(site.id, date, JSON.stringify(payload));
  return { synced: true, date };
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
