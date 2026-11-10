// Gathers everything a report or dashboard needs for one site over one
// period, in parallel, with per-source failure tolerance: if one source is
// down or not configured, the rest still render.
import * as ga4 from './ga4.js';
import * as gsc from './gsc.js';
import * as clarity from './clarity.js';
import { gatherFathom, fathomMonthly } from './fathom.js';
import { getFathomToken } from './runtime-config.js';
import { previousPeriod } from './dates.js';
import { reportUptime } from './monitor.js';
import { gaAiTraffic, fathomAiTraffic } from './ai-traffic.js';
import { buildStory } from './story.js';
import { getSetting, setSetting } from '../database.js';

// The long view: up to twelve calendar months of visits and Google
// clicks, ending with the month the report covers. One month of numbers
// says little on its own; the same month set against the year shows
// whether the site is building. Visits come from the SAME source as the
// headline figure (never mixed), search from Search Console. Cached per
// site for half a day, since a dashboard load must not pay for it twice.
const HISTORY_TTL_MS = 12 * 3600_000;
async function gatherHistory(site, end, source, warnings) {
  const endMonth = end.slice(0, 7);
  const d = new Date(endMonth + '-01T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - 12); // twelve to chart, plus the same month a year ago
  const start = d.toISOString().slice(0, 10);
  const cacheKey = `history_${site.id}`;
  const stamp = `${start}|${end}|${source || '-'}|${site.gsc_site_url || '-'}`;
  try {
    const c = JSON.parse(getSetting(cacheKey) || 'null');
    if (c && c.stamp === stamp && Date.now() - c.at < HISTORY_TTL_MS) return c.history;
  } catch { /* refetch */ }

  const [visitRows, searchRows] = await Promise.all([
    source === 'fathom' ? attempt('Visit history', warnings, () => fathomMonthly(site.fathom_site_id, start, end))
      : source === 'ga' ? attempt('Visit history', warnings, () => ga4.fetchMonthly(site.ga4_property_id, start, end))
      : null,
    site.gsc_site_url ? attempt('Search history', warnings, () => gsc.fetchMonthly(site.gsc_site_url, start, end)) : null,
  ]);
  const v = new Map((visitRows || []).map(r => [r.month, r.visits]));
  const g = new Map((searchRows || []).map(r => [r.month, r]));
  const lastDay = new Date(Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)), 0, 12)).toISOString().slice(0, 10);
  let months = [];
  for (let i = 0; i < 13; i++) {
    const m = new Date(start + 'T12:00:00Z');
    m.setUTCMonth(m.getUTCMonth() + i);
    const key = m.toISOString().slice(0, 7);
    months.push({
      month: key,
      label: m.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      visits: visitRows ? (v.has(key) ? v.get(key) : 0) : null,
      clicks: searchRows ? (g.get(key)?.clicks ?? 0) : null,
      impressions: searchRows ? (g.get(key)?.impressions ?? 0) : null,
      partial: key === endMonth && end < lastDay,
    });
  }
  // A source that started part-way through the year has no real zeros
  // before its first month: blank those out rather than chart a false
  // climb from nothing, then drop leading months with no data at all.
  const firstWith = f => months.findIndex(m => m[f] > 0);
  for (const f of ['visits', 'clicks', 'impressions']) {
    const first = firstWith(f);
    months.forEach((m, i) => { if (m[f] != null && (first === -1 || i < first)) m[f] = null; });
  }
  // The same calendar month a year earlier, kept apart from the chart for
  // "against last October". Only real when that month has data.
  const yearAgo = months.shift();
  const lastYear = yearAgo && (yearAgo.visits != null || yearAgo.clicks != null) ? yearAgo : null;
  // The first month a source has visits for is rarely a whole month (the
  // tag went live part-way through), and it charts as a leap in traffic
  // that never happened. Mark it so it is drawn as a part month.
  const firstV = firstWith('visits');
  if (firstV > 0 || (firstV === 0 && !lastYear?.visits)) months[firstV].firstTracked = true; // firstV is -1 when there are no visits at all
  while (months.length && months[0].visits == null && months[0].clicks == null) months.shift();
  const history = months.length >= 2
    ? { months, lastYear, visitsSource: source === 'fathom' ? 'Fathom Analytics' : source === 'ga' ? 'Google Analytics' : null }
    : null;
  // A fetch that failed must not be remembered: one timeout would blank
  // the long view on every dashboard load for the next twelve hours.
  const failed = (source && visitRows == null) || (site.gsc_site_url && searchRows == null);
  if (!failed) { try { setSetting(cacheKey, JSON.stringify({ stamp, at: Date.now(), history })); } catch { /* cache is a nicety */ } }
  return history;
}

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
      about: /auto-onboarding|added by ops|managed site|imported from hostinger/i.test(site.notes || '') ? '' : String(site.notes || '').trim().slice(0, 400) },
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
    integrity = JSON.parse(getSetting('source_integrity') || '{}')[(site.domain || '').toLowerCase().replace(/^www\./, '')] || {};
  } catch { /* no verdicts yet — trust the sources */ }
  const useFathom = Boolean(getFathomToken() && site.fathom_site_id) && integrity.fathom?.status !== 'mismatch';
  // How much of the reporting period does a source's history actually
  // cover? A source connected mid-period reports a fraction of the real
  // traffic — true for its own data, but wrong as the headline figure for
  // the whole period, and it makes healthy sites look broken.
  const periodDays = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1);
  const coversPeriod = (block) => {
    // Traffic in the period before proves tracking was already running.
    // Without this a quiet site was told its tracking "began" on the day
    // of its first visit of the month: CN Maintenance, tracked since
    // August, had no visitor until the 21st and its report said visitor
    // tracking began on 21 October.
    if (Number(block?.prevOverview?.sessions) > 0) return true;
    const first = (block?.timeseries || []).map(t => t.date).filter(Boolean).sort()[0];
    if (!first) return false;
    const missedDays = Math.round((Date.parse(first) - Date.parse(start)) / 86400000);
    return missedDays <= Math.max(2, periodDays * 0.15);
  };

  let aiRaw = null;
  jobs.push((async () => {
    let fathomBlock = null;
    if (useFathom) {
      fathomBlock = await attempt('Fathom analytics', warnings, () => gatherFathom(site.fathom_site_id, start, end));
      // Only lead with Fathom when its history spans the period. A site
      // whose Fathom was connected days ago would otherwise headline a
      // month's report with a couple of days of visits — which is exactly
      // what made EVC Citysprint's report claim its tracking was broken.
      // (No early return here: the AI-assistant count at the end of this
      // job must run whichever source wins.)
      if (fathomBlock && coversPeriod(fathomBlock)) data.ga4 = fathomBlock;
      else if (fathomBlock) warnings.push('Fathom history starts mid-period — using Google Analytics for this report so the totals cover the whole period.');
    }
    if (!data.ga4 && site.ga4_property_id) {
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
      // Likewise a property whose only traffic is a developer's preview
      // copy (localhost): those hits are not the client's visitors.
      const wrongProperty = integrity.ga?.status === 'mismatch' || integrity.ga?.status === 'dev-only';
      if (wrongProperty) warnings.push(`Analytics: property carries traffic for ${(integrity.ga.hosts || []).join(', ')}, not this site — excluded from the report.`);
      if (overview && !dead && !wrongProperty) data.ga4 = { sourceLabel: 'Google Analytics', overview, prevOverview, timeseries: timeseries || [], topPages: topPages || [], channels: channels || [], devices: devices || [] };
    }
    // GA unusable after all (no property, silent, or wrong property)?
    // Fathom's partial history still beats reporting nothing.
    if (!data.ga4 && fathomBlock) data.ga4 = fathomBlock;

    // Visits that came from AI assistants, read from the SAME source that
    // supplies the headline numbers so the share is apples to apples.
    if (data.ga4?.sourceLabel === 'Fathom Analytics') {
      aiRaw = {
        cur: await attempt('AI assistant visits', warnings, () => fathomAiTraffic(site.fathom_site_id, start, end)),
        prev: await attempt('AI assistant visits (prev)', warnings, () => fathomAiTraffic(site.fathom_site_id, prev.start, prev.end)),
      };
    } else if (data.ga4?.sourceLabel === 'Google Analytics' && site.ga4_property_id) {
      aiRaw = {
        cur: await attempt('AI assistant visits', warnings, () => gaAiTraffic(site.ga4_property_id, start, end)),
        prev: await attempt('AI assistant visits (prev)', warnings, () => gaAiTraffic(site.ga4_property_id, prev.start, prev.end)),
      };
    }
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
        if (!empty) {
          const DEEP = 1000;
          const [deep, prevDeep, pages, prevPages] = await Promise.all([
            attempt('Search target keywords', warnings, () => gsc.fetchTopQueries(url, start, end, DEEP)),
            attempt('Search target keywords (prev)', warnings, () => gsc.fetchTopQueries(url, prev.start, prev.end, DEEP)),
            attempt('Search pages', warnings, () => gsc.fetchTopPages(url, start, end, 25)),
            attempt('Search pages (prev)', warnings, () => gsc.fetchTopPages(url, prev.start, prev.end, 100)),
          ]);

          // Pages Google sent people to, with the change in clicks. A page
          // missing from the earlier list had no clicks worth listing then.
          if (pages) {
            const before = new Map((prevPages || []).map(r => [r.page, r.clicks]));
            data.search.pages = pages.slice(0, 8).map(r => ({
              ...r,
              prevClicks: prevPages ? (before.get(r.page) ?? 0) : null,
            }));
          }

          // Searches the site appeared for now that it did not appear for at
          // all in the period before. Only claimed when BOTH lists came back
          // whole: a list cut off at the limit cannot prove a search is new,
          // and a failed earlier pull would make every search look new.
          if (deep && prevDeep && deep.length < DEEP && prevDeep.length < DEEP) {
            const seen = new Set(prevDeep.map(r => r.query));
            data.search.newQueries = deep
              .filter(r => !seen.has(r.query) && r.impressions >= 10)
              .sort((a, b) => b.impressions - a.impressions)
              .slice(0, 8)
              .map(r => ({ query: r.query, impressions: r.impressions, clicks: r.clicks, position: r.position }));
          }

          if (!kws.length) return;
          if (deep == null) return; // fetch failed — skip the table rather than lie
          const match = (rows, kw) => (rows || []).filter(r => {
            const q = r.query.toLowerCase();
            return q.includes(kw) || kw.includes(q);
          });
          // Position is the impression-weighted average over the matching
          // searches, the same way Google averages. The best single match
          // flattered the table: "recovery driver jobs" read 1.0 here (from
          // one long-tail variant) while the top-terms table above showed
          // the phrase itself at 7.8.
          const avgPos = rows => {
            const imp = rows.reduce((a, r) => a + r.impressions, 0);
            if (!rows.length) return null;
            if (!imp) return Math.min(...rows.map(r => r.position));
            return rows.reduce((a, r) => a + r.position * r.impressions, 0) / imp;
          };
          data.search.targets = kws.map(kw => {
            const cur = match(deep, kw), prv = match(prevDeep, kw);
            const pos = avgPos(cur), prevPos = avgPos(prv);
            return {
              keyword: kw,
              position: pos,
              prevPosition: prevPos,
              movement: pos != null && prevPos != null ? prevPos - pos : null, // + = up
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

  // Website availability for the period (null unless it may be shown).
  try { data.uptime = reportUptime(site, start, end); } catch { data.uptime = null; }

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

  // Visits from AI assistants: attached only when the traffic source is
  // trusted (never alongside an under-counting tag), zero included: "no
  // AI visits yet" is a true and useful answer for a client.
  if (aiRaw?.cur && data.ga4?.overview && !data.ga4.unreliable) {
    const sessions = Number(data.ga4.overview.sessions || 0);
    data.aiTraffic = {
      visits: aiRaw.cur.visits,
      prevVisits: aiRaw.prev ? aiRaw.prev.visits : null,
      sharePct: sessions > 0 ? Math.round((aiRaw.cur.visits / sessions) * 1000) / 10 : null,
      top: aiRaw.cur.top.slice(0, 3),
    };
  }

  // The long view, read from whichever source supplied the headline
  // visits (skipped when that source is under-counting).
  const histSource = data.ga4 && !data.ga4.unreliable
    ? (data.ga4.sourceLabel === 'Fathom Analytics' ? 'fathom' : 'ga') : null;
  try { data.history = await gatherHistory(site, end, histSource, warnings); } catch { data.history = null; }

  // Was the period BEFORE only partly tracked? A site's second report
  // otherwise compares a full month with the few days after its tag went
  // live and announces "visits rose 950%". When the first recorded day
  // of the previous period is well inside it, and the monthly history
  // shows no visits in any earlier month, there is nothing fair to
  // compare with: the comparison is dropped everywhere, not just hidden.
  if (data.ga4?.prevOverview && data.ga4.prevFirstDay) {
    const lateBy = Math.round((Date.parse(data.ga4.prevFirstDay) - Date.parse(prev.start)) / 86400000);
    const firstMonth = (data.history?.months || []).find(m => m.visits > 0)?.month;
    if (lateBy > Math.max(2, periodDays * 0.15) && firstMonth && firstMonth >= prev.start.slice(0, 7)) {
      data.ga4.prevPartialFrom = data.ga4.prevFirstDay;
      data.ga4.prevOverview = null;
      warnings.push(`Previous period only tracked from ${data.ga4.prevFirstDay}: comparison with it left out.`);
    }
  }
  if (data.ga4) delete data.ga4.prevFirstDay;

  // The day tracking began, set only when the source genuinely started
  // inside this period. Renderers show their "figures cover from this
  // date" note from this field alone.
  if (data.ga4) {
    const first = (data.ga4.timeseries || []).map(t => t.date).filter(Boolean).sort()[0];
    data.ga4.trackingFrom = first && first > start && !coversPeriod(data.ga4) ? first : null;
  }

  // Visits and visitors are the same count on Fathom (it has no
  // returning-visitor memory by design), so showing both is one number
  // twice. Renderers show "Visitors" only when this is false.
  if (data.ga4?.overview) {
    data.ga4.visitorsSameAsVisits = Math.round(data.ga4.overview.totalUsers || 0) === Math.round(data.ga4.overview.sessions || 0);
  }

  // Work North Bear did for this client in the period, as logged by the
  // owner in the admin console. Shown beside the results it sits with.
  try {
    const { default: db } = await import('../database.js');
    data.workDone = db.prepare('SELECT done_on AS date, title, detail FROM work_log WHERE site_id = ? AND done_on >= ? AND done_on <= ? ORDER BY done_on, id')
      .all(site.id, start, end);
  } catch { data.workDone = []; }

  // Verdict, wins and things to watch, worked out by rules (story.js).
  try { data.story = buildStory(data); } catch (err) { warnings.push(`Story: ${err.message}`); data.story = null; }

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
