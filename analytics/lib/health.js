// Per-site connections health — live-checked on demand from the admin
// console ("Connections" button). Replaces diagnostic emails: the owner
// looks when he wants, nothing lands in his inbox.
import db, { getSetting, setSetting } from '../database.js';
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
  // The auto-installer's own verdict. Repeated failures mean the files it
  // edits are NOT what visitors are served (the classic cause: the site
  // moved to the site builder, leaving a stale docroot) — previously this
  // state was recorded and never shown to anyone.
  let retro = {};
  try { retro = JSON.parse(getSetting('retrofit_state') || '{}')[domain] || {}; } catch { /* none yet */ }
  const installerStuck = retro.tries >= 4 && !retro.done;
  const stuckNote = installerStuck
    ? ` · auto-installer has tried ${retro.tries}× without the tag appearing on the live page — the files it edits aren't what visitors see (site likely served by the builder). Paste this site's Tracking code into the builder to finish it.`
    : '';

  // One homepage fetch feeds every tag check (Fathom, GA, Clarity).
  const homepage = await fetchHomepage(domain);
  const gaTagFound = Boolean(site.ga4_measurement_id) && homepage != null && homepage.includes(site.ga4_measurement_id);

  // Fathom (takes precedence over GA as the report's traffic source).
  // A site whose script is confirmed on the page but has not yet recorded
  // a visit is INSTALLED, not broken — counting it as a failure made the
  // fleet read "8 of 20 connected" when 19 were fully tagged. It stays OK
  // for a grace period; if Fathom is still empty after that while the site
  // demonstrably has traffic, it becomes a real fault worth chasing.
  // Regression memory. A source that USED to work and has stopped is a
  // different, far more urgent problem than one never set up — and it was
  // being disguised: when Fathom data stopped, the "waiting for the first
  // visitor" grace period restarted from scratch, so a site whose tag had
  // been stripped (a builder republish wipes custom code) showed a
  // reassuring green. Live: Active Personnel and EVC Citysprint both lost
  // tags they demonstrably had on 2 Aug — EVC while LIVE to its client.
  let lastOk = {};
  try { lastOk = JSON.parse(getSetting('source_last_ok') || '{}'); } catch { /* fresh */ }
  const seenWorking = lastOk[domain] || {};
  const regressed = (src, msg) =>
    bad(`STOPPED WORKING — ${msg} This was recording normally on ${seenWorking[src]}, so the tag has since been removed from the page (republishing a builder site wipes its custom code). Re-paste this site's Tracking code.`);

  const fathomEnsureErr = getSetting('fathom_ensure_last') || '';
  const fathomTagOn = homepage != null && homepage.includes('usefathom.com');
  const GRACE_MS = 48 * 3600_000;
  let pending = {};
  try { pending = JSON.parse(getSetting('fathom_pending') || '{}'); } catch { /* fresh */ }
  const noData = () => {
    // Never offer the "just installed, be patient" grace to a source that
    // has previously delivered data — that is a regression, not a start-up.
    if (seenWorking.fathom) return regressed('fathom', fathomTagOn ? 'the script is on the page but Fathom has recorded nothing for 7 days.' : 'the Fathom script is no longer on the page.');
    // Don't assume every non-injectable site is a website-builder one.
    // Musk Engineering is a PHP site whose tag lives in a header include:
    // the code was correct in its repo for weeks while the deployed copy
    // was stale, and this message kept sending the owner to a builder that
    // doesn't exist. Name the real possibilities instead.
    if (!fathomTagOn) return bad('not on the live page yet — sites Pulse can edit get it automatically within the hour. Otherwise add this site\'s Tracking code wherever its pages get their <head>: the site builder\'s custom-code box, the CMS theme header, or a header include/template — and if the code is already in a repo, check the deployed copy is up to date.');
    const since = pending[domain] || Date.now();
    if (pending[domain] !== since) { pending[domain] = since; setSetting('fathom_pending', JSON.stringify(pending)); }
    const waited = Date.now() - since;
    return waited < GRACE_MS
      ? ok('script installed ✓ — waiting on the first visitor for data')
      : bad(`script is on the page but Fathom has recorded nothing in ${Math.round(waited / 3600_000)}h — check this site's ID matches the right site in your Fathom account`);
  };
  out.fathom = integ.fathom?.status === 'mismatch'
    ? bad(`this Fathom site's traffic is from ${(integ.fathom.hosts || []).join(', ')}, not this domain — excluded from reports (which use Google Analytics) until it's pointed at the right site. Connection kept, nothing deleted.`)
    : !site.fathom_site_id ? bad(fathomEnsureErr ? `auto-setup blocked: ${fathomEnsureErr}` : 'being set up automatically — check back within the hour')
    : !getFathomToken() ? bad('site ID set but no API key in Settings')
    : await gatherFathom(site.fathom_site_id, start, end)
        .then(m => {
          if (m?.overview) {
            if (pending[domain]) { delete pending[domain]; setSetting('fathom_pending', JSON.stringify(pending)); }
            return ok(`${Math.round(m.overview.sessions)} visits (7d)${integ.fathom?.status === 'verified' ? ' · traffic verified from this domain ✓' : ''}`);
          }
          return noData();
        })
        .catch(e => bad(e.message.slice(0, 90)));
  // Independent evidence that the site genuinely has visitors, gathered
  // from the tools already checked above — used to tell "quiet week" apart
  // from "tag blocked from firing".
  // (Clarity's own verdict is built further down, so read its stored
  // snapshots directly rather than a value that doesn't exist yet.)
  const fathomVisits = Number((out.fathom?.detail || '').match(/^(\d+) visits/)?.[1] || 0);
  const clarityDays = db.prepare('SELECT COUNT(*) AS n FROM clarity_snapshots WHERE site_id = ? AND snapshot_date >= ?')
    .get(site.id, start).n;
  const otherToolsSeeTraffic = fathomVisits > 0 ? `Fathom (${fathomVisits} visits)`
    : clarityDays >= 3 ? `Microsoft Clarity (${clarityDays} days of sessions)` : '';

  // Search Console is resolved BEFORE Analytics because its click count is
  // the yardstick the Analytics check needs: every click is a real landing
  // that Analytics must have seen.
  out.search = !site.gsc_site_url ? bad('not linked')
    : await gsc.fetchSummary(site.gsc_site_url, start, end)
        .then(s => ok(`${Math.round(s.clicks)} clicks, pos ${s.position ? s.position.toFixed(1) : '—'} (7d)`))
        .catch(e => bad(e.message.slice(0, 90)));
  const gscClicks = Number((out.search?.detail || '').match(/^(\d+) clicks/)?.[1] || 0);

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
          // A stuck auto-installer outranks a reassuring visit count: it
          // means the tag genuinely isn't reaching visitors.
          if (installerStuck && !gaTagFound) return bad(`${Math.round(o.sessions)} visits (7d)${stuckNote}`);
          // GA silent while OTHER tools on the same page see real traffic
          // is never "a quiet week" — the tag is present but prevented from
          // firing. Overwhelmingly this is a speed-optimisation plugin
          // delaying scripts until interaction, or a consent tool blocking
          // until accept. GA's pageview is a one-shot event at load, so a
          // delayed library simply never sends it, while cookieless or
          // late-attaching tools (Fathom, Clarity) still record normally.
          // Found live on northbearmedia.co.uk. Naming it saves hours.
          if (o.sessions === 0 && otherToolsSeeTraffic) {
            return seenWorking.ga
              ? regressed('ga', `Analytics is recording nothing while ${otherToolsSeeTraffic} still sees real traffic.`)
              : bad(`recording nothing while ${otherToolsSeeTraffic} sees real traffic on the same pages — the tag is on the site but being stopped from firing. Usual cause: a speed/"delay JavaScript" plugin holding scripts until interaction, or a cookie-consent tool. Exclude googletagmanager.com from that delay list so Analytics loads immediately.`);
          }
          // A collapse against Search Console clicks is the same failure as
          // zero, just less obvious: every click is a real landing, so GA
          // recording a small fraction of them means it stopped capturing.
          // EVC Citysprint fell from 79 visits to 2 against 41 clicks and
          // still read green, days before its next client report.
          if (gscClicks >= 10 && o.sessions < gscClicks * 0.5) {
            return seenWorking.ga
              ? regressed('ga', `Analytics recorded only ${Math.round(o.sessions)} visits while Google sent ${gscClicks} clicks to the site.`)
              : bad(`only ${Math.round(o.sessions)} visits recorded while Google sent ${gscClicks} clicks — the tag isn't capturing most visitors.`);
          }
          return ok(`${Math.round(o.sessions)} visits (7d)${note}`);
        })
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
  // Remember the last date each source genuinely delivered data, so a
  // future failure can be reported as a regression with the date it broke.
  // The Fathom grace message is provisional (installed, no data yet), so it
  // must not count as proof the source ever worked.
  const today = todayISO();
  let recorded = false;
  for (const key of ['ga', 'search', 'clarity', 'fathom']) {
    const v = out[key];
    if (!v?.ok) continue;
    if (key === 'fathom' && /waiting on the first visitor/.test(v.detail || '')) continue;
    if (seenWorking[key] !== today) { seenWorking[key] = today; recorded = true; }
  }
  if (recorded) { lastOk[domain] = seenWorking; setSetting('source_last_ok', JSON.stringify(lastOk)); }

  out.delivery = !last ? bad('no reports generated yet')
    : last.status === 'sent' ? ok(`last report sent ${String(last.created_at).slice(0, 10)} (${last.period_label})`)
    : bad(`LAST REPORT FAILED ${String(last.created_at).slice(0, 10)}: ${String(last.error || '').slice(0, 90)}`);
  return out;
}

export async function connectionsHealth() {
  // Opening the panel first self-heals any wrong Search Console property
  // (e.g. an unverified sc-domain stored over a working URL-prefix), so a
  // permission ✗ corrects itself by the time the rows render — no wait for
  // the hourly pass.
  try { const { healGscProperties } = await import('./ops.js'); await healGscProperties(); } catch { /* panel still renders */ }
  const sites = db.prepare("SELECT * FROM sites WHERE active = 1 AND domain != '' ORDER BY client_name").all()
    .filter(s => (s.domain || '') !== 'nbmdemosite2.co.uk');
  const end = addDays(todayISO(), -1), start = addDays(end, -6);
  const results = await Promise.all(sites.map(s => siteHealth(s, start, end).catch(e => ({
    id: s.id, client: s.client_name, domain: s.domain, error: e.message.slice(0, 120),
  }))));
  return { checkedAt: new Date().toISOString(), period: { start, end }, sites: results };
}
