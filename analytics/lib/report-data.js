// Gathers everything a report or dashboard needs for one site over one
// period, in parallel, with per-source failure tolerance: if one source is
// down or not configured, the rest still render.
import * as ga4 from './ga4.js';
import * as gsc from './gsc.js';
import * as clarity from './clarity.js';
import { previousPeriod } from './dates.js';

async function attempt(name, warnings, fn) {
  try { return await fn(); } catch (err) {
    warnings.push(`${name}: ${err.message}`);
    return null;
  }
}

export async function gatherReportData(site, start, end) {
  const prev = previousPeriod(start, end);
  const warnings = [];
  const data = {
    site: { id: site.id, clientName: site.client_name, domain: site.domain },
    period: { start, end },
    previousPeriod: prev,
    warnings,
    ga4: null,
    search: null,
    clarity: null,
  };

  const jobs = [];

  if (site.ga4_property_id) {
    const pid = site.ga4_property_id;
    jobs.push((async () => {
      const [overview, prevOverview, timeseries, topPages, channels, devices] = await Promise.all([
        attempt('Analytics overview', warnings, () => ga4.fetchOverview(pid, start, end)),
        attempt('Analytics comparison', warnings, () => ga4.fetchOverview(pid, prev.start, prev.end)),
        attempt('Analytics daily traffic', warnings, () => ga4.fetchTimeseries(pid, start, end)),
        attempt('Analytics top pages', warnings, () => ga4.fetchTopPages(pid, start, end)),
        attempt('Analytics channels', warnings, () => ga4.fetchChannels(pid, start, end)),
        attempt('Analytics devices', warnings, () => ga4.fetchDevices(pid, start, end)),
      ]);
      if (overview) data.ga4 = { overview, prevOverview, timeseries: timeseries || [], topPages: topPages || [], channels: channels || [], devices: devices || [] };
    })());
  }

  if (site.gsc_site_url) {
    const url = site.gsc_site_url;
    jobs.push((async () => {
      const [summary, prevSummary, topQueries] = await Promise.all([
        attempt('Search summary', warnings, () => gsc.fetchSummary(url, start, end)),
        attempt('Search comparison', warnings, () => gsc.fetchSummary(url, prev.start, prev.end)),
        attempt('Search top queries', warnings, () => gsc.fetchTopQueries(url, start, end)),
      ]);
      if (summary) data.search = { summary, prevSummary, topQueries: topQueries || [] };
    })());
  }

  await Promise.all(jobs);

  if (site.clarity_api_token || site.clarity_project_id) {
    data.clarity = clarity.aggregate(site.id, start, end);
  }

  return data;
}

export function pctChange(current, previous) {
  if (previous == null || current == null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}
