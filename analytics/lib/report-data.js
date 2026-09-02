// Gathers everything a report or dashboard needs for one site over one
// period, in parallel, with per-source failure tolerance: if one source is
// down or not configured, the rest still render.
import * as ga4 from './ga4.js';
import * as gsc from './gsc.js';
import * as clarity from './clarity.js';
import { gatherFathom } from './fathom.js';
import { getFathomToken } from './runtime-config.js';
import { previousPeriod } from './dates.js';

async function attempt(name, warnings, fn) {
  try { return await fn(); } catch (err) {
    warnings.push(`${name}: ${err.message}`);
    return null;
  }
}

// opts.fast — the client-dashboard path: serve PageSpeed from cache only
// (never a live 90s Lighthouse run in a page load) and use the instant
// rules-based insights instead of a live AI call. Reports/PDFs keep the
// full pipeline.
export async function gatherReportData(site, start, end, opts = {}) {
  const prev = previousPeriod(start, end);
  const warnings = [];
  const data = {
    // The owner's own description of the business (the site's Notes field),
    // so the writer can be specific about what they sell and who they serve
    // instead of inferring it from URL slugs. Ops bookkeeping notes are not
    // a business description and are filtered out.
    site: { id: site.id, clientName: site.client_name, domain: site.domain,
      about: /auto-onboarding|added by ops|managed site/i.test(site.notes || '') ? '' : String(site.notes || '').trim().slice(0, 400) },
    period: { start, end },
    previousPeriod: prev,
    warnings,
    ga4: null,
    search: null,
    clarity: null,
  };

  const jobs = [];

  // Web analytics: prefer Fathom when connected and matched to this site
  // (real, bot-filtered, with history); fall back to GA4 if Fathom isn't set
  // up or returns nothing. Resolved in one sequential job so the preference
  // is deterministic; Search Console (below) still runs in parallel.
  // Integrity verdicts (hourly, hostname-based) gate which source we TRUST.
  // A source flagged as carrying another domain's traffic is skipped here
  // rather than disconnected — the connection stays, the wrong numbers
  // never reach a report, and it self-clears when the data looks right.
  let integrity = {};
  try {
    const { getSetting } = await import('../database.js');
    integrity = JSON.parse(getSetting('source_integrity') || '{}')[(site.domain || '').toLowerCase().replace(/^www\./, '')] || {};
  } catch { /* no verdicts yet — trust the sources */ }
  const useFathom = Boolean(getFathomToken() && site.fathom_site_id) && integrity.fathom?.status !== 'mismatch';
  // How much of the reporting period does a source's history actually
  // cover? A source connected mid-period reports a fraction of the real
  // traffic — true for its own data, but wrong as the headline figure for
  // the whole period, and it makes healthy sites look broken.
  const periodDays = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1);
  const coversPeriod = (block) => {
    const first = (block?.timeseries || []).map(t => t.date).filter(Boolean).sort()[0];
    if (!first) return false;
    const missedDays = Math.round((Date.parse(first) - Date.parse(start)) / 86400000);
    return missedDays <= Math.max(2, periodDays * 0.15);
  };

  jobs.push((async () => {
    let fathomBlock = null;
    if (useFathom) {
      fathomBlock = await attempt('Fathom analytics', warnings, () => gatherFathom(site.fathom_site_id, start, end));
      // Only lead with Fathom when its history spans the period. A site
      // whose Fathom was connected days ago would otherwise headline a
      // month's report with a couple of days of visits — which is exactly
      // what made EVC Citysprint's report claim its tracking was broken.
      if (fathomBlock && coversPeriod(fathomBlock)) { data.ga4 = fathomBlock; return; }
      if (fathomBlock) warnings.push('Fathom history starts mid-period — using Google Analytics for this report so the totals cover the whole period.');
    }
    if (site.ga4_property_id) {
      const pid = site.ga4_property_id;
      const [overview, prevOverview, timeseries, topPages, channels, devices] = await Promise.all([
        attempt('Analytics overview', warnings, () => ga4.fetchOverview(pid, start, end)),
        attempt('Analytics comparison', warnings, () => ga4.fetchOverview(pid, prev.start, prev.end)),
        attempt('Analytics daily traffic', warnings, () => ga4.fetchTimeseries(pid, start, end)),
        attempt('Analytics top pages', warnings, () => ga4.fetchTopPages(pid, start, end)),
        attempt('Analytics channels', warnings, () => ga4.fetchChannels(pid, start, end)),
        attempt('Analytics devices', warnings, () => ga4.fetchDevices(pid, start, end)),
      ]);
      // GA4 answers all-zeros (not an error) for a property whose tag was
      // never installed — treat that as "not recording" rather than send a
      // client a branded report headlining "0 visits".
      const dead = overview && !(overview.sessions > 0) && !(overview.screenPageViews > 0) && !(overview.totalUsers > 0);
      if (dead) warnings.push('Analytics: property returned zero traffic for the whole period — treating as not yet recording');
      // A property proven (hourly, by hostname) to carry a DIFFERENT
      // domain's traffic must never supply a client's numbers.
      const wrongProperty = integrity.ga?.status === 'mismatch';
      if (wrongProperty) warnings.push(`Analytics: property carries traffic for ${(integrity.ga.hosts || []).join(', ')}, not this site — excluded from the report.`);
      if (overview && !dead && !wrongProperty) data.ga4 = { sourceLabel: 'Google Analytics', overview, prevOverview, timeseries: timeseries || [], topPages: topPages || [], channels: channels || [], devices: devices || [] };
    }
    // GA unusable after all (no property, silent, or wrong property)?
    // Fathom's partial history still beats reporting nothing.
    if (!data.ga4 && fathomBlock) data.ga4 = fathomBlock;
  })());

  if (site.gsc_site_url) {
    const url = site.gsc_site_url;
    jobs.push((async () => {
      const [summary, prevSummary, topQueries, prevQueries] = await Promise.all([
        attempt('Search summary', warnings, () => gsc.fetchSummary(url, start, end)),
        attempt('Search comparison', warnings, () => gsc.fetchSummary(url, prev.start, prev.end)),
        attempt('Search top queries', warnings, () => gsc.fetchTopQueries(url, start, end)),
        attempt('Search previous queries', warnings, () => gsc.fetchTopQueries(url, prev.start, prev.end, 50)),
      ]);
      if (summary) {
        // Per-query ranking movement: previous position by query (lower
        // position = better ranking, so previous − current = places GAINED).
        const prevPos = new Map((prevQueries || []).map(q => [q.query, q.position]));
        const queries = (topQueries || []).map(q => ({
          ...q,
          prevPosition: prevPos.has(q.query) ? prevPos.get(q.query) : null,
          positionChange: prevPos.has(q.query) ? (prevPos.get(q.query) - q.position) : null, // + = moved up
        }));
        // Connected-but-silent (all-zeros) is different from not-connected:
        // renderers show "no search activity recorded yet" instead of a
        // dead wall of zeros or a false "not connected" note.
        const empty = !(summary.clicks > 0) && !(summary.impressions > 0);
        data.search = { summary, prevSummary, topQueries: queries, empty };

        // Target keywords: where does the site rank for the searches the
        // OWNER cares about — even when they earn no clicks (GSC's top-N
        // misses those entirely). Deep query list fetched once, matched
        // fuzzily (either string contains the other). "Not appearing yet"
        // is an honest, useful answer — but only when the deep fetch itself
        // succeeded and the property has data: a failed/empty pull must not
        // masquerade as "you rank for nothing".
        const kws = String(site.target_keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean).slice(0, 12);
        if (kws.length && !empty) {
          const [deep, prevDeep] = await Promise.all([
            attempt('Search target keywords', warnings, () => gsc.fetchTopQueries(url, start, end, 1000)),
            attempt('Search target keywords (prev)', warnings, () => gsc.fetchTopQueries(url, prev.start, prev.end, 1000)),
          ]);
          if (deep == null) return; // fetch failed — skip the table rather than lie
          const match = (rows, kw) => (rows || []).filter(r => {
            const q = r.query.toLowerCase();
            return q.includes(kw) || kw.includes(q);
          });
          data.search.targets = kws.map(kw => {
            const cur = match(deep, kw), prv = match(prevDeep, kw);
            const best = cur.length ? Math.min(...cur.map(r => r.position)) : null;
            const prevBest = prv.length ? Math.min(...prv.map(r => r.position)) : null;
            return {
              keyword: kw,
              position: best,
              prevPosition: prevBest,
              movement: best != null && prevBest != null ? prevBest - best : null, // + = up
              clicks: cur.reduce((a, r) => a + r.clicks, 0),
              impressions: cur.reduce((a, r) => a + r.impressions, 0),
            };
          });
        }
      }
    })());
  }

  // Site health: Google PageSpeed scores. Reports may refresh a stale
  // cache (time-boxed Lighthouse run); the dashboard fast path serves
  // cache-only so a page load never waits on Lighthouse.
  jobs.push((async () => {
    const { getScores } = await import('./pagespeed.js');
    data.siteHealth = await attempt('Site health', warnings, () =>
      getScores((site.domain || '').toLowerCase().replace(/^www\./, ''), { cachedOnly: Boolean(opts.fast) }));
  })());

  await Promise.all(jobs);

  if (site.clarity_api_token || site.clarity_project_id) {
    data.clarity = clarity.aggregate(site.id, start, end);
    // Same-length window immediately before, for trend arrows on the
    // behaviour cards (null when history doesn't reach back that far).
    data.prevClarity = clarity.aggregate(site.id, prev.start, prev.end);
  }

  // Cross-source truth check: is the traffic source so far below hard
  // evidence that its number would be a lie?
  //
  // The ONLY safe yardstick is Search Console clicks. Each click is a
  // person who landed on the site from Google, so the traffic tool must
  // have seen at least most of them. Clarity was in this comparison
  // originally and had to come out: Clarity counts sessions on completely
  // different rules and routinely reports several times GA's figure, so a
  // perfectly healthy site with rich Clarity history was branded broken —
  // hit live on EVC Citysprint, whose GA, Fathom, Search Console and
  // Clarity were all working while its report claimed tracking was being
  // reconnected.
  //
  // Threshold is deliberately generous: GA legitimately runs below click
  // counts (consent tools, ad-blockers, bounced redirects), so only a
  // catastrophic shortfall — under half the clicks — counts as broken.
  if (data.ga4?.overview) {
    const sessions = Number(data.ga4.overview.sessions || 0);
    const gscClicks = Number(data.search?.summary?.clicks || 0);
    // A source whose history genuinely begins mid-period reports less than
    // the period's real traffic and must not be called broken for it — the
    // report already carries a "tracking installed on <date>" caveat.
    const partialHistory = !coversPeriod(data.ga4);
    if (!partialHistory && gscClicks >= 10 && sessions < gscClicks * 0.5) {
      data.ga4.unreliable = true;
      data.ga4.independentTraffic = gscClicks;
      warnings.push(`Traffic source under-counting: ${data.ga4.sourceLabel} shows ${sessions} sessions but Search Console recorded ${gscClicks} clicks from Google alone — the tracking tag likely isn't firing on the live site.`);
    }
  }

  // AI-written (or rules-based) insights, computed once the data is in.
  try {
    const { generateInsights } = await import('./insights.js');
    data.insights = await generateInsights(data, { rulesOnly: Boolean(opts.fast) });
  } catch (err) {
    warnings.push(`Insights: ${err.message}`);
    data.insights = null;
  }

  return data;
}

export function pctChange(current, previous) {
  if (previous == null || current == null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}
