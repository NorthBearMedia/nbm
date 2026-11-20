// The built-in site health check. Pulse runs it itself on every client
// site, once a day, so the "site health" part of a report is never empty.
//
// Google's PageSpeed scores used to be the only thing in that section,
// and Google refuses the test without a key, so no report or dashboard
// has ever shown anything there. These checks need no key and no outside
// service: they read the live homepage and what the uptime monitor
// already records. If Google's scores are available they sit beside
// these, not in place of them.
//
// Every check is something a site owner can understand and North Bear can
// put right: does it answer quickly, is the connection secure, is Google
// allowed to list it, does it have a proper title and description for
// search results, is it set up for phones, does it have a sitemap, and is
// visitor tracking on it. Checks read the page SOURCE, which is what
// search engines and link previews see first. That is deliberate: Ivy
// House's source title was the builder's default, "Hostinger Horizons",
// for months while the title in a browser tab looked fine.
import db, { getSetting, setSetting } from '../database.js';
import { loadState, pageSaysNoindex } from './monitor.js';
import { readBodyCapped } from './fetch-body.js';

const UA = 'Mozilla/5.0 (compatible; NBM Pulse health check; +https://northbearmedia.co.uk)';
const FRESH_MS = 30 * 3600_000; // run daily; a result up to 30 hours old is current

// Titles a builder or framework leaves behind when nobody sets one.
const DEFAULT_TITLE = /^(hostinger horizons|vite \+ react|vite app|react app|untitled( page| document)?|home ?page|home|index|document|welcome|my (web)?site|new site|coming soon|just another wordpress site)$/i;

async function get(url, cap = 600_000) {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': UA, 'Cache-Control': 'no-cache' } });
    const body = await readBodyCapped(res, cap).catch(() => '');
    return { ok: res.ok, status: res.status, body, robots: res.headers.get('x-robots-tag') || '', url: res.url || url };
  } catch { return { ok: false, status: 0, body: '', robots: '', url }; }
}

const attr = (tag, name) => (tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i')) || [])[1] || '';
function metaContent(html, name) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if (attr(tag, 'name').toLowerCase() === name) return attr(tag, 'content').trim();
  }
  return '';
}
const decode = s => s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

// Does robots.txt shut every crawler out of the whole site?
function robotsBlocksAll(text) {
  let applies = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^(user-agent|disallow)\s*:\s*(.*)$/i);
    if (!m) continue;
    if (m[1].toLowerCase() === 'user-agent') applies = m[2].trim() === '*';
    else if (applies && m[2].trim() === '/') return true;
  }
  return false;
}

// Average server response over the last 30 days, from the uptime monitor.
function averageResponseMs(siteId) {
  const from = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const row = db.prepare('SELECT SUM(ms_total) AS ms, SUM(ms_count) AS n FROM monitor_daily WHERE site_id = ? AND day >= ?').get(siteId, from);
  return row && row.n >= 50 ? Math.round(row.ms / row.n) : null;
}

export async function runSiteCheck(site, { fetchPage = get } = {}) {
  const domain = (site.domain || '').toLowerCase().replace(/^www\./, '');
  const items = [];
  const add = (key, label, ok, detail) => items.push({ key, label, ok: Boolean(ok), detail });

  const home = await fetchPage(`https://${domain}/?nbmv=${Date.now()}`);
  // A site that is not answering is the uptime monitor's story to tell,
  // not a reason to fail seven checks at once.
  if (!home.ok || !home.body) return null;
  const html = home.body;
  const head = html.split(/<\/head>/i)[0];

  const ms = averageResponseMs(site.id);
  if (ms != null) {
    const secs = ms >= 950 ? `${(ms / 1000).toFixed(1)} seconds` : `${(ms / 1000).toFixed(1).replace(/^0\.0$/, '0.1')} seconds`;
    add('speed', 'Answers quickly', ms <= 1200, ms <= 1200 ? `The server answers in about ${secs} on average.` : `The server takes about ${secs} to answer on average, which is slow.`);
  }

  const st = loadState()[domain] || {};
  if (st.certExpiresAt) {
    const days = Math.floor((Date.parse(st.certExpiresAt) - Date.now()) / 86400_000);
    add('secure', 'Secure connection', days > 14 && !st.certError,
      days > 14 && !st.certError ? 'Visitors get the padlock, and the security certificate is valid.' : `The security certificate ${days <= 0 ? 'has expired' : `runs out in ${days} day${days === 1 ? '' : 's'}`}.`);
  } else if (home.url.startsWith('https://')) {
    add('secure', 'Secure connection', true, 'Visitors get the padlock: the site loads over a secure connection.');
  }

  const robots = await fetchPage(`https://${domain}/robots.txt`, 100_000);
  const hidden = pageSaysNoindex(html, home.robots) || (robots.ok && robotsBlocksAll(robots.body));
  if (!site.monitor_hidden_ok) {
    add('listed', 'Google can list it', !hidden, hidden ? 'The site is telling Google not to show it in search results.' : 'Nothing on the site stops Google from showing it in search results.');
  }

  const title = decode((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const titleOk = title.length >= 10 && !DEFAULT_TITLE.test(title);
  add('title', 'Proper title for search results', titleOk,
    titleOk ? `Google shows it as "${title.slice(0, 70)}".` : title ? `The title in the page source reads "${title.slice(0, 60)}", which is not a real title.` : 'The page source has no title for Google to show.');

  const desc = decode(metaContent(head, 'description'));
  add('description', 'Description for search results', desc.length >= 50,
    desc.length >= 50 ? 'The page gives Google a description to show under the title.' : desc ? 'The description in the page source is too short to be useful in search results.' : 'The page source has no description, so Google and link previews make one up.');

  add('phone', 'Set up for phones', /<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(head), /<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(head) ? 'The page tells phones how to size it.' : 'The page does not tell phones how to size it.');

  const sitemap = await fetchPage(`https://${domain}/sitemap.xml`, 200_000);
  const hasSitemap = sitemap.ok && /<(urlset|sitemapindex)\b/i.test(sitemap.body);
  add('sitemap', 'Sitemap for Google', hasSitemap, hasSitemap ? 'There is a sitemap, which helps Google find every page.' : 'No sitemap was found, so Google has to discover pages by following links.');

  const tracked = html.includes('NBM-GA-TAG')
    || (site.ga4_measurement_id && html.includes(site.ga4_measurement_id))
    || (site.fathom_site_id && html.includes(site.fathom_site_id))
    || /googletagmanager\.com\/gtm\.js/.test(html);
  add('tracking', 'Visitor tracking in place', tracked, tracked ? 'Visits are being counted.' : 'The tracking code is not on the live page, so visits are not being counted.');

  return { checkedAt: new Date().toISOString(), passed: items.filter(i => i.ok).length, total: items.length, items };
}

const keyFor = domain => `sitecheck_${domain}`;

// What reports and dashboards read. Never runs a check itself unless
// asked to (a report run may refresh a stale one; a page load never does).
export async function getSiteCheck(site, { refresh = false } = {}) {
  const domain = (site.domain || '').toLowerCase().replace(/^www\./, '');
  let cached = null;
  try { cached = JSON.parse(getSetting(keyFor(domain)) || 'null'); } catch { /* run again */ }
  const fresh = cached && Date.now() - Date.parse(cached.checkedAt) < FRESH_MS;
  if (fresh || !refresh) return cached;
  const result = await runSiteCheck(site).catch(() => null);
  if (result) { setSetting(keyFor(domain), JSON.stringify(result)); return result; }
  return cached;
}

// Daily pass over every active site, one at a time.
export async function runAllSiteChecks() {
  const sites = db.prepare("SELECT * FROM sites WHERE active = 1 AND domain != ''").all();
  let done = 0;
  for (const site of sites) {
    const domain = (site.domain || '').toLowerCase().replace(/^www\./, '');
    const result = await runSiteCheck(site).catch(() => null);
    if (result) { setSetting(keyFor(domain), JSON.stringify(result)); done++; }
  }
  if (done) console.log(`[sitecheck] checked ${done} site(s)`);
  return done;
}
