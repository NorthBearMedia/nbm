// The report's "What this means & what to do next" section. Produces an
// AI-written, plain-English narrative + recommendations grounded in the
// site's actual numbers (via Claude), and always has a strong rules-based
// fallback so a report is never left without insight — even before an
// Anthropic API key is configured.
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicKey, getInsightsModel } from './runtime-config.js';
import { pctChange } from './report-data.js';

const nf = new Intl.NumberFormat('en-GB');
const pct = n => `${(n || 0).toFixed(1)}%`;

// Compact, factual snapshot handed to the model (and used by the fallback).
function snapshot(data) {
  const o = data.ga4?.overview, p = data.ga4?.prevOverview || {}, s = data.search?.summary;
  const f = {
    site: data.site.clientName,
    domain: data.site.domain,
    source: data.ga4?.sourceLabel || null,
    visits: o?.sessions ?? null,
    visitsChangePct: o ? pctChange(o.sessions, p.sessions) : null,
    visitors: o?.totalUsers ?? null,
    pageViews: o?.screenPageViews ?? null,
    engagementRatePct: o ? o.engagementRate * 100 : null,
    avgVisitSeconds: o?.averageSessionDuration ?? null,
    topChannels: (data.ga4?.channels || []).slice(0, 4).map(c => ({ channel: c.channel, visits: c.sessions })),
    devices: (data.ga4?.devices || []).map(d => ({ device: d.device, visits: d.sessions })),
    topPages: (data.ga4?.topPages || []).slice(0, 3).map(pg => ({ page: pg.title || pg.path, views: pg.views })),
    search: s ? { clicks: s.clicks, impressions: s.impressions, avgPosition: s.position } : null,
    topQueries: (data.search?.topQueries || []).slice(0, 5).map(q => ({ query: q.query, clicks: q.clicks, position: q.position })),
    clarity: data.clarity ? { deadClicks: data.clarity.deadClicks, rageClicks: data.clarity.rageClicks, avgScrollDepth: data.clarity.avgScrollDepth } : null,
  };
  return f;
}

const SYSTEM = `You are a senior analyst at North Bear Media, a UK web design and marketing agency, writing the "What this means & what to do next" section of a monthly website report for a small-business client who is NOT technical.

Rules:
- British English. Warm, plain, jargon-free — explain any metric in everyday terms.
- Ground EVERY statement in the numbers provided. Never invent data. If a number isn't provided, don't reference it.
- Be genuinely useful: highlight what's working, flag what isn't, and give specific, doable recommendations for THIS business.
- Reply with ONLY a JSON object, no prose around it:
  {"headline": "one encouraging plain-English sentence summarising the month",
   "recommendations": [{"title": "3-5 word bold label", "detail": "1-2 sentence specific insight or action"}]}
- 3 to 4 recommendations. Each "detail" must reference a real figure from the data where possible.`;

async function aiInsights(data) {
  const key = getAnthropicKey();
  if (!key) return null;
  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model: getInsightsModel(),
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: 'user', content: `Here is the data for ${data.site.clientName} (${data.site.domain}), covering ${data.period.start} to ${data.period.end}:\n\n${JSON.stringify(snapshot(data), null, 2)}` }],
  });
  const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  const jsonStr = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const parsed = JSON.parse(jsonStr);
  if (!parsed.recommendations?.length) return null;
  return {
    source: 'ai',
    headline: String(parsed.headline || ''),
    recommendations: parsed.recommendations.slice(0, 4).map(r => ({ title: String(r.title || '').slice(0, 60), detail: String(r.detail || '').slice(0, 320) })),
  };
}

// Deterministic, always-available narrative from the same snapshot.
function rulesInsights(data) {
  const s = snapshot(data);
  const recs = [];

  if (s.visits != null) {
    const dir = s.visitsChangePct == null ? null : (s.visitsChangePct >= 0 ? 'up' : 'down');
    recs.push({
      title: dir ? (dir === 'up' ? 'Traffic is growing' : 'Traffic dipped') : 'Traffic',
      detail: `The site had ${nf.format(Math.round(s.visits))} visits this period${dir ? `, ${dir} ${Math.abs(s.visitsChangePct).toFixed(1)}% on the period before` : ''}. ${dir === 'down' ? 'Worth a push on social or a fresh page to lift it back up.' : 'Keep the momentum with regular fresh content.'}`,
    });
  }
  const organic = (s.topChannels || []).find(c => /organic|google search/i.test(c.channel));
  if (organic && s.visits) {
    recs.push({ title: 'Found on Google', detail: `${Math.round((organic.visits / s.visits) * 100)}% of visits came from search — the most valuable, lowest-cost traffic. Keeping content fresh protects these rankings.` });
  }
  const mobile = (s.devices || []).find(d => /mobile|phone/i.test(d.device));
  const devTotal = (s.devices || []).reduce((a, d) => a + d.visits, 0);
  if (mobile && devTotal) {
    const mp = Math.round((mobile.visits / devTotal) * 100);
    recs.push({ title: 'Mostly on mobile', detail: `${mp}% of visitors are on a phone — make sure buttons, forms and calls-to-action look great on a small screen.` });
  }
  if (s.search?.avgPosition) {
    const near = (data.search?.topQueries || []).find(q => q.position > 10 && q.position <= 20);
    if (near) recs.push({ title: 'Nearly page one', detail: `You rank around position ${near.position.toFixed(0)} for "${near.query}". A little content targeting that term could push it onto page one of Google.` });
    else recs.push({ title: 'Search visibility', detail: `You appeared in Google ${nf.format(Math.round(s.search.impressions))} times with an average rank of ${s.search.avgPosition.toFixed(1)}. Steady content keeps this climbing.` });
  }
  if (s.clarity && (s.clarity.rageClicks > 0 || s.clarity.deadClicks > 0)) {
    recs.push({ title: 'User experience', detail: `Clarity saw ${nf.format(s.clarity.deadClicks)} dead clicks and ${nf.format(s.clarity.rageClicks)} frustrated clicks — worth checking those spots aren't confusing visitors.` });
  }
  if (!recs.length) recs.push({ title: 'Tracking is live', detail: 'Analytics is now recording your visitors — next month brings a full picture of traffic, sources and engagement.' });

  let headline = `Here's how ${s.domain || s.site} performed this period.`;
  if (s.visits != null) {
    const dir = s.visitsChangePct == null ? '' : (s.visitsChangePct >= 0 ? ` — up ${Math.abs(s.visitsChangePct).toFixed(0)}% on the period before` : ` — down ${Math.abs(s.visitsChangePct).toFixed(0)}% on the period before`);
    headline = `Your website drew ${nf.format(Math.round(s.visits))} visits${dir}.`;
  }
  return { source: 'rules', headline, recommendations: recs.slice(0, 4) };
}

export async function generateInsights(data) {
  // Need at least one data source to say anything meaningful.
  if (!data.ga4 && !data.search && !data.clarity) return null;
  try {
    const ai = await aiInsights(data);
    if (ai) return ai;
  } catch (err) {
    (data.warnings || []).push(`AI insights unavailable: ${err.message.slice(0, 120)}`);
  }
  return rulesInsights(data);
}
