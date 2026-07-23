// Per-site connections health — live-checked on demand from the admin
// console ("Connections" button). Replaces diagnostic emails: the owner
// looks when he wants, nothing lands in his inbox.
import db, { getSetting } from '../database.js';
import * as ga4 from './ga4.js';
import * as gsc from './gsc.js';
import { syncSite } from './clarity.js';
import { gatherFathom } from './fathom.js';
import { getFathomToken } from './runtime-config.js';
import { addDays, todayISO } from './dates.js';

const ok = detail => ({ ok: true, detail });
const bad = detail => ({ ok: false, detail });

// The live homepage (cache-busted), for tag-presence checks: a saved API
// token or property ID says nothing about whether the tracking code is
// actually being SERVED. Returns html or null (couldn't fetch).
async function fetchHomepage(domain) {
  try {
    const res = await fetch(`https://${domain}/?nbmv=${Date.now()}`, {
      redirect: 'follow', signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0 (NBM Pulse health check)' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

async function siteHealth(site, start, end) {
  const domain = (site.domain || '').toLowerCase().replace(/^www\./, '');
  const out = { id: site.id, client: site.client_name, domain };

  // Hourly machine-verified answer to "is this really THIS domain's
  // traffic?" (GA4/Fathom hostname data, computed by ops) — the check a
  // human would otherwise do with view-source or a GA Realtime self-test.
  let integ = {};
  try { integ = JSON.parse(getSetting('source_integrity') || '{}')[domain] || {}; } catch { /* none yet */ }

  // Google Analytics (or Fathom, which takes precedence as traffic source)
  out.fathom = integ.fathom?.status === 'mismatch'
    ? bad(`was matched to the WRONG Fathom site (its data was from ${(integ.fathom.hosts || []).join(', ')}) — disconnected automatically; reports use Google Analytics instead`)
    : !site.fathom_site_id ? bad('no site ID')
    : !getFathomToken() ? bad('site ID set but no API key in Settings')
    : await gatherFathom(site.fathom_site_id, start, end)
        .then(m => m?.overview ? ok(`${Math.round(m.overview.sessions)} visits (7d)${integ.fathom?.status === 'verified' ? ' · traffic verified from this domain ✓' : ''}`) : bad('no data returned'))
        .catch(e => bad(e.message.slice(0, 90)));

  // One homepage fetch feeds both tag checks (GA + Clarity below).
  const homepage = await fetchHomepage(domain);
  const gaTagFound = Boolean(site.ga4_measurement_id) && homepage != null && homepage.includes(site.ga4_measurement_id);
  out.ga = integ.ga?.status === 'mismatch'
    ? bad(`WRONG PROPERTY — its traffic is from ${(integ.ga.hosts || []).join(', ')}, not this site. North Bear is on it; don't paste anything.`)
    : !site.ga4_property_id ? bad('no property ID')
    : await ga4.fetchOverview(site.ga4_property_id, start, end)
        .then(o => {
          // Real data flowing is the only proof that matters — if the tag
          // isn't visible in raw HTML but sessions are non-zero, it's loaded
          // via Tag Manager, a plugin, or the builder's own hook, not
          // missing. The hourly hostname verification settles it outright.
          const note = integ.ga?.status === 'verified' ? ' · traffic verified from this domain ✓'
            : gaTagFound ? ' · tag on site ✓'
            : o.sessions > 0 ? ' · data flowing (tag loads via the builder/Tag Manager, so it won’t show in page source)'
            : (site.ga4_measurement_id && homepage != null) ? ' · tag NOT detected on the page — paste this site’s Tracking code into the builder' : '';
          return ok(`${Math.round(o.sessions)} visits (7d)${note}`);
        })
        .catch(e => bad(e.message.slice(0, 90)));

  out.search = !site.gsc_site_url ? bad('not linked')
    : await gsc.fetchSummary(site.gsc_site_url, start, end)
        .then(s => ok(`${Math.round(s.clicks)} clicks, pos ${s.position ? s.position.toFixed(1) : '—'} (7d)`))
        .catch(e => bad(e.message.slice(0, 90)));

  // Clarity: two independent things must be true — the tracking TAG on the
  // live page (collects data) and the API token here (reads it back).
  // Check both so "not working" is never a mystery. A tag loaded through
  // Google Tag Manager won't show in raw HTML, so "not found" is only
  // damning when there's also no data arriving.
  const tagOnPage = homepage == null ? null
    : (homepage.includes('clarity.ms') || /\bclarity\s*\(/.test(homepage));
  const tagNote = tagOnPage === true ? 'tag on site ✓'
    : tagOnPage === false ? 'tag not found in page HTML (fine if loaded via Tag Manager)'
    : 'tag check inconclusive';
  if (!site.clarity_api_token) {
    out.clarity = bad(`${site.clarity_project_id ? 'no API token saved for this site' : 'not set up'} · ${tagNote}`);
  } else {
    let syncErr = null;
    try { await syncSite(site); } catch (e) { syncErr = e.message.slice(0, 90); }
    const snaps = db.prepare('SELECT COUNT(*) AS n, MAX(snapshot_date) AS last FROM clarity_snapshots WHERE site_id = ?').get(site.id);
    const base = snaps.n > 0
      ? `${snaps.n} day(s) of data (latest ${snaps.last})${syncErr ? ' · last sync error: ' + syncErr : ''}`
      : (syncErr ? 'token errors: ' + syncErr : 'token saved, no data stored yet');
    // Data arriving = working, whatever the HTML grep says. No data AND no
    // tag found = the tracking tag is missing (the usual "not working").
    out.clarity = snaps.n > 0
      ? ok(`${base}${tagOnPage === false ? ' · ' + tagNote : ''}`)
      : bad(`${base} · ${tagOnPage === false ? 'TAG NOT ON SITE ✗ — add the Clarity snippet in the site builder' : tagNote}`);
  }

  // Report delivery: the last report's fate, so a silently failing send is
  // visible here instead of nowhere.
  const last = db.prepare('SELECT status, period_label, error, created_at FROM reports WHERE site_id = ? ORDER BY id DESC LIMIT 1').get(site.id);
  out.delivery = !last ? bad('no reports generated yet')
    : last.status === 'sent' ? ok(`last report sent ${String(last.created_at).slice(0, 10)} (${last.period_label})`)
    : bad(`LAST REPORT FAILED ${String(last.created_at).slice(0, 10)}: ${String(last.error || '').slice(0, 90)}`);
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
