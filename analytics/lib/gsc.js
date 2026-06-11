// Google Search Console API — search rankings, clicks and impressions.
// Accepts either a URL-prefix property ("https://example.com/") or a
// domain property ("sc-domain:example.com").
//
// If a "Search Console reader" email is configured (Settings) and
// domain-wide delegation is authorised, queries run AS that user,
// read-only — no per-site robot grants needed. Otherwise the robot
// queries directly and must have been added to each property.
import { googleRequest } from './google.js';
import { getGscReaderEmail } from './runtime-config.js';

export function gscAuth() {
  const subject = getGscReaderEmail();
  return subject
    ? { scopes: ['https://www.googleapis.com/auth/webmasters.readonly'], subject }
    : undefined;
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
