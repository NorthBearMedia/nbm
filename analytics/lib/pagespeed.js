// Google PageSpeed Insights — the "site health" pillar of the report.
// Scores are cached in the settings table and refreshed at most every 20
// days, so report generation never waits on a slow Lighthouse run twice.
//
// The API used to be called with no credentials. Google now refuses that
// outright (every keyless caller on the internet shares one daily quota,
// and it is always spent), which is why no dashboard ever showed a site
// health score. Calls now identify themselves, in this order: an API key
// from Settings (pagespeed_api_key), else the Google robot account Pulse
// already holds, else keyless as a last resort. The last outcome is kept
// in "psi_status" so the Connections panel can say what is needed.
import { getSetting, setSetting } from '../database.js';
import { getPagespeedKey } from './runtime-config.js';

const FRESH_MS = 20 * 24 * 3600_000;
const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

async function robotAuthHeader() {
  try {
    const { googleClient } = await import('./google.js');
    const h = await googleClient({ scopes: ['openid'] }).getRequestHeaders();
    const auth = typeof h.get === 'function' ? h.get('authorization') : (h.Authorization || h.authorization);
    return auth ? { Authorization: auth } : null;
  } catch { return null; }
}

function note(status) {
  try { setSetting('psi_status', JSON.stringify({ ...status, at: new Date().toISOString() })); } catch { /* best effort */ }
}
export function pagespeedStatus() {
  try { return JSON.parse(getSetting('psi_status') || 'null'); } catch { return null; }
}

export async function fetchScores(domain) {
  const base = ENDPOINT + `?url=${encodeURIComponent('https://' + domain)}&strategy=mobile&category=performance&category=seo&category=best-practices`;
  const key = getPagespeedKey();
  const ways = [];
  if (key) ways.push({ via: 'key', url: `${base}&key=${encodeURIComponent(key)}`, headers: {} });
  const robot = key ? null : await robotAuthHeader();
  if (robot) ways.push({ via: 'robot', url: base, headers: robot });
  ways.push({ via: 'keyless', url: base, headers: {} });
  let j = null, lastErr = '';
  for (const w of ways) {
    const res = await fetch(w.url, { headers: w.headers, signal: AbortSignal.timeout(90_000) });
    j = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
    if (!j.error) { note({ ok: true, via: w.via }); break; }
    lastErr = String(j.error.message || j.error).slice(0, 160);
  }
  if (!j || j.error) {
    note({ ok: false, error: lastErr });
    throw new Error(`PageSpeed: ${lastErr}`);
  }
  const cats = j.lighthouseResult?.categories || {};
  const score = c => (cats[c] && cats[c].score != null) ? Math.round(cats[c].score * 100) : null;
  return {
    performance: score('performance'),
    seo: score('seo'),
    bestPractices: score('best-practices'),
    fetchedAt: new Date().toISOString(),
  };
}

// Cached wrapper used by report generation: returns the stored scores if
// fresh; otherwise refreshes (and on failure serves whatever is stored,
// however old, or null). Never throws. With cachedOnly (the dashboard
// fast path) it never triggers a live Lighthouse run — stale or null is
// fine; the next report run refreshes it.
export async function getScores(domain, { cachedOnly = false } = {}) {
  const key = 'psi_' + domain;
  let cached = null;
  try { cached = JSON.parse(getSetting(key) || 'null'); } catch { /* ignore */ }
  const fresh = cached && cached.fetchedAt && (Date.now() - Date.parse(cached.fetchedAt)) < FRESH_MS;
  if (fresh || cachedOnly) return cached;
  try {
    const scores = await fetchScores(domain);
    if (scores.performance != null || scores.seo != null) {
      setSetting(key, JSON.stringify(scores));
      return scores;
    }
  } catch (e) { console.log('[psi]', domain, e.message.slice(0, 100)); }
  return cached; // possibly stale, possibly null — better than nothing
}

// Weekly top-up so dashboards always have a score to show (the dashboard
// itself only ever reads the cache). One site at a time, oldest first,
// and it stops at the first refusal rather than hammer a spent quota.
export async function refreshStaleScores(domains, { maxAgeMs = 6 * 24 * 3600_000, limit = 30 } = {}) {
  const age = d => {
    try { return Date.now() - Date.parse(JSON.parse(getSetting('psi_' + d) || 'null')?.fetchedAt || 0); } catch { return Infinity; }
  };
  const due = domains.filter(d => !(age(d) < maxAgeMs)).sort((a, b) => age(b) - age(a)).slice(0, limit);
  let done = 0;
  for (const d of due) {
    try {
      const scores = await fetchScores(d);
      if (scores.performance != null || scores.seo != null) { setSetting('psi_' + d, JSON.stringify(scores)); done++; }
    } catch (e) {
      console.log('[psi] refresh stopped:', d, e.message.slice(0, 100));
      break;
    }
  }
  if (done) console.log(`[psi] refreshed ${done} site score(s)`);
  return { due: due.length, done };
}
