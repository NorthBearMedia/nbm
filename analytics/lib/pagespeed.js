// Google PageSpeed Insights — the "site health" pillar of the report.
// Keyless API (server-IP quota is plenty for ~18 sites monthly). Scores
// are cached in the settings table and refreshed at most every 20 days,
// so report generation never waits on a slow Lighthouse run twice.
import { getSetting, setSetting } from '../database.js';

const FRESH_MS = 20 * 24 * 3600_000;

export async function fetchScores(domain) {
  const url = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
    + `?url=${encodeURIComponent('https://' + domain)}&strategy=mobile&category=performance&category=seo&category=best-practices`;
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  const j = await res.json();
  if (j.error) throw new Error(`PageSpeed: ${String(j.error.message || j.error).slice(0, 120)}`);
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
