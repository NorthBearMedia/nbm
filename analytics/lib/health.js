// Per-site connections health — live-checked on demand from the admin
// console ("Connections" button). Replaces diagnostic emails: the owner
// looks when he wants, nothing lands in his inbox.
import db from '../database.js';
import * as ga4 from './ga4.js';
import * as gsc from './gsc.js';
import { syncSite } from './clarity.js';
import { gatherFathom } from './fathom.js';
import { getFathomToken } from './runtime-config.js';
import { addDays, todayISO } from './dates.js';

const ok = detail => ({ ok: true, detail });
const bad = detail => ({ ok: false, detail });

// Is the Clarity *tracking tag* actually on the live page? A saved API
// token only reads data — without the tag on the site there is nothing to
// read. Fetches the homepage (cache-busted) and looks for clarity.ms.
// Returns true / false / null (couldn't check).
async function clarityTagOnPage(domain) {
  try {
    const res = await fetch(`https://${domain}/?nbmv=${Date.now()}`, {
      redirect: 'follow', signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0 (NBM Pulse health check)' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html.includes('clarity.ms') || /\bclarity\s*\(/.test(html);
  } catch { return null; }
}

async function siteHealth(site, start, end) {
  const domain = (site.domain || '').toLowerCase().replace(/^www\./, '');
  const out = { id: site.id, client: site.client_name, domain };

  // Google Analytics (or Fathom, which takes precedence as traffic source)
  out.fathom = !site.fathom_site_id ? bad('no site ID')
    : !getFathomToken() ? bad('site ID set but no API key in Settings')
    : await gatherFathom(site.fathom_site_id, start, end)
        .then(m => m?.overview ? ok(`${Math.round(m.overview.sessions)} visits (7d)`) : bad('no data returned'))
        .catch(e => bad(e.message.slice(0, 90)));

  out.ga = !site.ga4_property_id ? bad('no property ID')
    : await ga4.fetchOverview(site.ga4_property_id, start, end)
        .then(o => ok(`${Math.round(o.sessions)} visits (7d)`))
        .catch(e => bad(e.message.slice(0, 90)));

  out.search = !site.gsc_site_url ? bad('not linked')
    : await gsc.fetchSummary(site.gsc_site_url, start, end)
        .then(s => ok(`${Math.round(s.clicks)} clicks, pos ${s.position ? s.position.toFixed(1) : '—'} (7d)`))
        .catch(e => bad(e.message.slice(0, 90)));

  // Clarity: two independent things must be true — the tracking TAG on the
  // live page (collects data) and the API token here (reads it back).
  // Check both so "not working" is never a mystery.
  const tagOnPage = await clarityTagOnPage(domain);
  const tagNote = tagOnPage === true ? 'tag on site ✓' : tagOnPage === false ? 'TAG NOT ON SITE ✗' : 'tag check inconclusive';
  if (!site.clarity_api_token) {
    out.clarity = bad(`${site.clarity_project_id ? 'no API token saved for this site' : 'not set up'} · ${tagNote}`);
  } else {
    let syncErr = null;
    try { await syncSite(site); } catch (e) { syncErr = e.message.slice(0, 90); }
    const snaps = db.prepare('SELECT COUNT(*) AS n, MAX(snapshot_date) AS last FROM clarity_snapshots WHERE site_id = ?').get(site.id);
    const base = snaps.n > 0
      ? `${snaps.n} day(s) of data (latest ${snaps.last})${syncErr ? ' · last sync error: ' + syncErr : ''}`
      : (syncErr ? 'token errors: ' + syncErr : 'token saved, no data stored yet');
    out.clarity = (snaps.n > 0 && tagOnPage !== false) ? ok(`${base} · ${tagNote}`) : bad(`${base} · ${tagNote}`);
  }
  return out;
}

export async function connectionsHealth() {
  const sites = db.prepare("SELECT * FROM sites WHERE active = 1 AND domain != '' ORDER BY client_name").all()
    .filter(s => (s.domain || '') !== 'nbmdemosite2.co.uk');
  const end = addDays(todayISO(), -1), start = addDays(end, -6);
  const results = await Promise.all(sites.map(s => siteHealth(s, start, end).catch(e => ({
    id: s.id, client: s.client_name, domain: s.domain, error: e.message.slice(0, 120),
  }))));
  return { checkedAt: new Date().toISOString(), period: { start, end }, sites: results };
}
