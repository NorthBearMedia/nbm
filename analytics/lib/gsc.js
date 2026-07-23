// Google Search Console API — search rankings, clicks and impressions.
// Accepts either a URL-prefix property ("https://example.com/") or a
// domain property ("sc-domain:example.com").
//
// Reads always delegate as the owner (explicit "Search Console reader"
// setting, falling back to norton@ — the same default every WRITE path in
// ops.js already uses to verify/register properties). Without this
// fallback, a property registered via delegated auth (which works because
// the owner already has access in his own Search Console) would then fail
// every read with "insufficient permission", because the bare robot
// service account was never individually granted that specific property —
// a real bug that broke every newly onboarded site until a human noticed
// and manually granted the robot. Domain-wide delegation covers every
// property the owner can see, so this needs no per-site grant, ever.
import { googleRequest } from './google.js';
import { getGscReaderEmail } from './runtime-config.js';

export function gscAuth() {
  return { scopes: ['https://www.googleapis.com/auth/webmasters.readonly'], subject: getGscReaderEmail() || 'norton@northbearmedia.co.uk' };
}

async function query(siteUrl, body) {
  return googleRequest({
    url: `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    method: 'POST',
    data: body,
  }, gscAuth());
}

export async function fetchSummary(siteUrl, start, end) {
  const data = await query(siteUrl, { startDate: start, endDate: end, dimensions: [], rowLimit: 1 });
  const row = data.rows?.[0];
  return {
    clicks: row?.clicks || 0,
    impressions: row?.impressions || 0,
    ctr: row?.ctr || 0,
    position: row?.position || 0,
  };
}

export async function fetchTopQueries(siteUrl, start, end, limit = 10) {
  const data = await query(siteUrl, {
    startDate: start, endDate: end,
    dimensions: ['query'],
    rowLimit: limit,
  });
  return (data.rows || []).map(r => ({
    query: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
}

export async function testConnection(siteUrl) {
  await query(siteUrl, { startDate: '2024-01-01', endDate: '2024-01-02', dimensions: [], rowLimit: 1 });
  return true;
}
