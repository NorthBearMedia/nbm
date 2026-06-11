// Auto-discovery: once the service account has been granted access (a
// one-time click per client — or one click per GA4 *account*), these calls
// find every GA4 property, its measurement ID and website address, and
// every Search Console property the robot can see. Sites can then be wired
// up (or bulk-imported) with no IDs to hunt down.
import { googleRequest } from './google.js';

// ─── GA4 (Admin API) ──────────────────────────────────────────────

async function listAccountSummaries() {
  const all = [];
  let pageToken = '';
  do {
    const data = await googleRequest({
      url: `https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`,
      method: 'GET',
    });
    all.push(...(data.accountSummaries || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return all;
}

async function listDataStreams(propertyName) {
  const data = await googleRequest({
    url: `https://analyticsadmin.googleapis.com/v1beta/${propertyName}/dataStreams`,
    method: 'GET',
  });
  return (data.dataStreams || [])
    .filter(s => s.type === 'WEB_DATA_STREAM' && s.webStreamData)
    .map(s => ({
      measurementId: s.webStreamData.measurementId || '',
      defaultUri: s.webStreamData.defaultUri || '',
    }));
}

export async function listGa4Properties() {
  const summaries = await listAccountSummaries();
  const props = summaries.flatMap(acc =>
    (acc.propertySummaries || []).map(p => ({
      propertyName: p.property,                       // "properties/123456789"
      propertyId: p.property.replace('properties/', ''),
      displayName: p.displayName,
      accountName: acc.displayName,
      streams: [],
    }))
  );
  // Fetch streams a few at a time — fine for dozens of properties.
  const CHUNK = 5;
  for (let i = 0; i < props.length; i += CHUNK) {
    await Promise.all(props.slice(i, i + CHUNK).map(async p => {
      try { p.streams = await listDataStreams(p.propertyName); }
      catch { p.streams = []; }
    }));
  }
  return props;
}

// ─── Search Console ───────────────────────────────────────────────

export async function listGscSites() {
  const data = await googleRequest({
    url: 'https://searchconsole.googleapis.com/webmasters/v3/sites',
    method: 'GET',
  });
  return (data.siteEntry || [])
    .filter(s => s.permissionLevel !== 'siteUnverifiedUser')
    .map(s => ({ siteUrl: s.siteUrl, permissionLevel: s.permissionLevel }));
}

// ─── Domain matching ─────────────────────────────────────────────

export function normalizeHost(input) {
  if (!input) return '';
  try {
    const url = input.includes('://') ? new URL(input) : new URL(`https://${input}`);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch { return String(input).toLowerCase().replace(/^www\./, '').split('/')[0]; }
}

export function matchForDomain(domain, { properties = [], gscSites = [] }) {
  const host = normalizeHost(domain);
  if (!host) return { ga4: null, gsc: null };

  let ga4 = null;
  for (const p of properties) {
    const stream = p.streams.find(s => normalizeHost(s.defaultUri) === host);
    if (stream) { ga4 = { propertyId: p.propertyId, displayName: p.displayName, measurementId: stream.measurementId }; break; }
  }

  // Prefer a domain property, then an https URL-prefix property.
  let gsc = null;
  const domainProp = gscSites.find(s => s.siteUrl === `sc-domain:${host}`);
  if (domainProp) gsc = domainProp.siteUrl;
  else {
    const urlProps = gscSites
      .filter(s => !s.siteUrl.startsWith('sc-domain:') && normalizeHost(s.siteUrl) === host)
      .sort((a, b) => (b.siteUrl.startsWith('https') ? 1 : 0) - (a.siteUrl.startsWith('https') ? 1 : 0) || a.siteUrl.length - b.siteUrl.length);
    if (urlProps.length) gsc = urlProps[0].siteUrl;
  }
  return { ga4, gsc };
}

// ─── Cached full scan ─────────────────────────────────────────────

let cache = null;
let cacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

export async function discoverAll({ refresh = false } = {}) {
  if (!refresh && cache && cacheAt > Date.now() - CACHE_TTL) return cache;
  const result = { properties: [], gscSites: [], errors: {} };
  const [ga4Res, gscRes] = await Promise.allSettled([listGa4Properties(), listGscSites()]);
  if (ga4Res.status === 'fulfilled') result.properties = ga4Res.value;
  else result.errors.ga4 = friendlyGoogleError(ga4Res.reason);
  if (gscRes.status === 'fulfilled') result.gscSites = gscRes.value;
  else result.errors.gsc = friendlyGoogleError(gscRes.reason);
  cache = result;
  cacheAt = Date.now();
  return result;
}

export function clearDiscoveryCache() { cache = null; }

function friendlyGoogleError(err) {
  const msg = String(err?.message || err);
  if (msg.includes('SERVICE_DISABLED') || msg.includes('has not been used in project')) {
    if (msg.includes('analyticsadmin')) return 'The Google Analytics Admin API isn\'t enabled in your Google Cloud project yet — enable it at https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com then try again.';
    if (msg.includes('searchconsole') || msg.includes('webmasters')) return 'The Search Console API isn\'t enabled in your Google Cloud project yet — enable it at https://console.cloud.google.com/apis/library/searchconsole.googleapis.com then try again.';
    return 'A required Google API isn\'t enabled in your Cloud project yet: ' + msg.slice(0, 200);
  }
  if (msg.includes('invalid_grant') || msg.includes('Invalid JWT')) {
    return 'Google rejected the service account key — re-paste the full JSON key file in Settings.';
  }
  if (msg.includes('DECODER routines') || msg.includes('PEM') || msg.includes('asn1')) {
    return 'The private key in the pasted file looks incomplete or damaged — download a fresh JSON key from Google Cloud and paste the whole file again.';
  }
  return msg.slice(0, 300);
}
