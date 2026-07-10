// Fathom Analytics API (api.usefathom.com/v1). Real, bot-filtered visitor
// data with history — used as Pulse's primary web-analytics source when a
// Fathom API key is configured. The data is mapped into the same shape the
// PDF and dashboard already expect for GA4, so everything renders for free.
import { getFathomToken } from './runtime-config.js';
import { previousPeriod } from './dates.js';

const BASE = 'https://api.usefathom.com/v1';

async function fathomGet(path, params) {
  const token = getFathomToken();
  if (!token) throw new Error('Fathom is not connected yet — add your Fathom API key in Settings');
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params || {})) if (v != null && v !== '') url.searchParams.set(k, v);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: controller.signal });
    if (res.status === 401) throw new Error('Fathom rejected the API key — generate a new one in Fathom → Settings → API');
    if (!res.ok) throw new Error(`Fathom API ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    return res.json();
  } finally { clearTimeout(timer); }
}

// Fathom responses are { object:"list", data:[...] }; be tolerant of shapes.
const rows = d => Array.isArray(d?.data) ? d.data : (Array.isArray(d) ? d : (d?.data ? [d.data] : []));
const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };

export async function listSites() {
  const all = [];
  let after = null, guard = 0;
  do {
    const d = await fathomGet('/sites', { limit: 100, starting_after: after });
    const items = rows(d);
    items.forEach(s => all.push({ id: s.id || s.object_id || s.site_id, name: s.name || '' }));
    after = d?.has_more && items.length ? (items[items.length - 1].id || items[items.length - 1].object_id) : null;
  } while (after && ++guard < 20);
  return all.filter(s => s.id);
}

function dt(iso, end = false) { return `${iso} ${end ? '23:59:59' : '00:00:00'}`; }

async function agg(entityId, opts) {
  const d = await fathomGet('/aggregations', {
    entity: 'pageview',
    entity_id: entityId,
    aggregates: opts.aggregates,
    date_from: dt(opts.date_from),
    date_to: dt(opts.date_to, true),
    date_grouping: opts.date_grouping,
    field_grouping: opts.field_grouping,
    sort_by: opts.sort_by,
    limit: opts.limit,
    timezone: 'Europe/London',
  });
  return rows(d);
}

const AGG = 'visits,uniques,pageviews,avg_duration,bounce_rate';

function overviewFrom(row) {
  if (!row) return null;
  let bounce = num(row.bounce_rate);
  if (bounce > 1) bounce = bounce / 100; // some responses give a percentage
  return {
    sessions: num(row.visits),
    totalUsers: num(row.uniques),
    newUsers: null,
    screenPageViews: num(row.pageviews),
    engagementRate: Math.max(0, 1 - bounce),
    averageSessionDuration: num(row.avg_duration),
  };
}

function friendlyRef(host) {
  if (!host) return 'Direct';
  host = String(host).replace(/^www\./, '');
  if (/google\./.test(host)) return 'Google search';
  if (/bing\./.test(host)) return 'Bing';
  if (/duckduckgo/.test(host)) return 'DuckDuckGo';
  if (/(facebook|instagram|t\.co|twitter|x\.com|linkedin|tiktok)/.test(host)) return 'Social media';
  return host;
}

// Returns a block in the same shape report-data builds for GA4, tagged with
// a sourceLabel so the report can say where the numbers came from.
export async function gatherFathom(fathomSiteId, start, end) {
  const prev = previousPeriod(start, end);
  const [cur, prv, ts, pages, refs, devices] = await Promise.all([
    agg(fathomSiteId, { aggregates: AGG, date_from: start, date_to: end }),
    agg(fathomSiteId, { aggregates: AGG, date_from: prev.start, date_to: prev.end }),
    agg(fathomSiteId, { aggregates: 'visits,uniques', date_from: start, date_to: end, date_grouping: 'day' }),
    agg(fathomSiteId, { aggregates: 'pageviews,visits', date_from: start, date_to: end, field_grouping: 'pathname', sort_by: 'pageviews:desc', limit: 10 }),
    agg(fathomSiteId, { aggregates: 'visits', date_from: start, date_to: end, field_grouping: 'referrer_hostname', sort_by: 'visits:desc', limit: 8 }),
    agg(fathomSiteId, { aggregates: 'visits', date_from: start, date_to: end, field_grouping: 'device_type', sort_by: 'visits:desc' }),
  ]);

  // All-zero Fathom (quiet period or stale site ID) returns null so the
  // caller can fall back to GA4 — real numbers from either source beat a
  // "0 visits" report, and a dead GA4 is caught by its own zero-guard.
  const overview = overviewFrom(cur[0]);
  if (!overview || overview.sessions === 0) return null;

  return {
    sourceLabel: 'Fathom Analytics',
    overview,
    prevOverview: overviewFrom(prv[0]),
    timeseries: ts.map(r => ({ date: String(r.date || r.date_formatted || '').slice(0, 10), sessions: num(r.visits), users: num(r.uniques) })).filter(r => r.date),
    topPages: pages.map(r => ({ path: r.pathname || '/', title: '', views: num(r.pageviews), sessions: num(r.visits) })),
    channels: refs.map(r => ({ channel: friendlyRef(r.referrer_hostname), sessions: num(r.visits) })),
    devices: devices.map(r => ({ device: r.device_type || 'unknown', sessions: num(r.visits) })),
  };
}

export async function testConnection() {
  await listSites();
  return true;
}
