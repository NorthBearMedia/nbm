// Google Analytics 4 Data API (v1beta). Live queries — GA4 keeps the
// history, so nothing needs caching in our database.
import { googleRequest } from './google.js';

async function runReport(propertyId, body) {
  return googleRequest({
    url: `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    method: 'POST',
    data: body,
  });
}

const OVERVIEW_METRICS = [
  'sessions', 'totalUsers', 'newUsers', 'screenPageViews',
  'engagementRate', 'averageSessionDuration',
];

function metricRow(report) {
  const row = report.rows?.[0];
  const out = {};
  OVERVIEW_METRICS.forEach((m, i) => { out[m] = Number(row?.metricValues?.[i]?.value || 0); });
  return out;
}

export async function fetchOverview(propertyId, start, end) {
  const report = await runReport(propertyId, {
    dateRanges: [{ startDate: start, endDate: end }],
    metrics: OVERVIEW_METRICS.map(name => ({ name })),
  });
  return metricRow(report);
}

export async function fetchTimeseries(propertyId, start, end) {
  const report = await runReport(propertyId, {
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: 'date' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
    orderBys: [{ dimension: { dimensionName: 'date' } }],
    limit: 400,
  });
  return (report.rows || []).map(r => ({
    date: r.dimensionValues[0].value.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
    sessions: Number(r.metricValues[0].value),
    users: Number(r.metricValues[1].value),
  }));
}

export async function fetchTopPages(propertyId, start, end, limit = 10) {
  const report = await runReport(propertyId, {
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit,
  });
  return (report.rows || []).map(r => ({
    path: r.dimensionValues[0].value,
    title: r.dimensionValues[1].value,
    views: Number(r.metricValues[0].value),
    sessions: Number(r.metricValues[1].value),
  }));
}

export async function fetchChannels(propertyId, start, end, limit = 8) {
  const report = await runReport(propertyId, {
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit,
  });
  return (report.rows || []).map(r => ({
    channel: r.dimensionValues[0].value,
    sessions: Number(r.metricValues[0].value),
  }));
}

export async function fetchDevices(propertyId, start, end) {
  const report = await runReport(propertyId, {
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: 'deviceCategory' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
  });
  return (report.rows || []).map(r => ({
    device: r.dimensionValues[0].value,
    sessions: Number(r.metricValues[0].value),
  }));
}

// Quick connectivity check used by the admin "test connection" button.
export async function testConnection(propertyId) {
  await fetchOverview(propertyId, '7daysAgo', 'yesterday');
  return true;
}
