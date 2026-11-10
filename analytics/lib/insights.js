// The report's written analysis: a headline, a short summary, the wins,
// and "where we go from here" (next steps, each marked as ours or the
// client's, plus at most one thing to ask the client for). Written by
// Claude from the site's actual numbers, with a rules-based version that
// is always available so a report is never left without one, even before
// an Anthropic API key is configured. Both produce the same shape.
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicKey, getInsightsModel } from './runtime-config.js';
import { pctChange } from './report-data.js';

const nf = new Intl.NumberFormat('en-GB');
const pct = n => `${(n || 0).toFixed(1)}%`;
const r1 = n => (n == null ? null : Math.round(n * 10) / 10);

// Compact, factual snapshot handed to the model (and used by the fallback).
function snapshot(data) {
  // If the traffic tag under-counted (proven wrong by Search Console/
  // Clarity), don't feed the model its visit numbers or page titles — it
  // would write a "only 1 visitor / coming-soon" story about a live site.
  const o = (data.ga4?.overview && !data.ga4.unreliable) ? data.ga4.overview : null;
  const ga = data.ga4?.unreliable ? null : data.ga4;
  const p = data.ga4?.prevOverview || {}, s = data.search?.summary;
  const f = {
    site: data.site.clientName,
    domain: data.site.domain,
    about: data.site.about || undefined,
    source: o ? data.ga4?.sourceLabel : null,
    trafficTagBeingFixed: Boolean(data.ga4?.unreliable) || undefined,
    visits: o?.sessions ?? null,
    // Only when the change is big enough to mean something: a raw "+62%"
    // beside a verdict of "level" (8 visits to 13) invites the writer to
    // make news of noise.
    visitsChangePct: o && ['up', 'down'].includes(data.story?.trends?.visits?.dir) ? r1(pctChange(o.sessions, p.sessions)) : undefined,
    visitsPreviousPeriod: o && p.sessions != null ? Math.round(p.sessions) : undefined,
    visitors: o?.totalUsers ?? null,
    pageViews: o?.screenPageViews ?? null,
    engagementRatePct: o ? r1(o.engagementRate * 100) : null,
    avgVisitSeconds: o ? Math.round(o.averageSessionDuration || 0) : null,
    topChannels: (ga?.channels || []).slice(0, 4).map(c => ({ channel: c.channel, visits: c.sessions })),
    devices: (ga?.devices || []).map(d => ({ device: d.device, visits: d.sessions })),
    topPages: (ga?.topPages || []).slice(0, 3).map(pg => ({ page: pg.title || pg.path, views: pg.views })),
    search: s ? { clicks: s.clicks, timesShown: s.impressions, avgPosition: r1(s.position),
      clicksPreviousPeriod: data.search?.prevSummary?.clicks ?? undefined, timesShownPreviousPeriod: data.search?.prevSummary?.impressions ?? undefined } : null,
    topQueries: (data.search?.topQueries || []).slice(0, 5).map(q => ({ query: q.query, clicks: q.clicks, position: r1(q.position) })),
    clarity: data.clarity && data.clarity.sessions > 0 ? { recordedVisits: data.clarity.sessions, deadClicks: data.clarity.deadClicks, frustratedClicks: data.clarity.rageClicks, avgScrollDepthPct: r1(data.clarity.avgScrollDepth) } : null,
    aiAssistantVisits: data.aiTraffic ? data.aiTraffic.visits : undefined,
    topAiAssistant: data.aiTraffic?.top?.[0]?.source,
    // The rules-based read of the same numbers (story.js): which changes
    // are big enough to mean something, and the facts worth leading with.
    verdict: data.story?.verdict?.label,
    meaningfulChanges: data.story ? {
      visits: data.story.trends.visits.dir, googleClicks: data.story.trends.clicks.dir, timesShownOnGoogle: data.story.trends.shown.dir,
    } : undefined,
    wins: (data.story?.wins || []).map(w => `${w.title}. ${w.detail}`),
    worthWatching: (data.story?.watch || []).map(w => `${w.title}. ${w.detail}`),
    targetSearches: (data.search?.targets || []).filter(t => t.position != null).slice(0, 8)
      .map(t => ({ search: t.keyword, position: Math.round(t.position), placesGained: t.movement == null ? null : Math.round(t.movement) })),
    periodIsCalendarMonth: data.story?.period?.noun === 'month',
    monthlyHistory: (data.history?.months || []).map(m => ({ month: m.month, visits: m.visits, googleClicks: m.clicks, partMonth: m.partial || undefined })),
    uptime: data.uptime ? { outages: data.uptime.outages, downtime: data.uptime.downtimeText } : undefined,
    phoneSpeedScore: data.siteHealth?.performance ?? undefined,
  };
  return f;
}

const SYSTEM = `You are a senior analyst at North Bear Media, a UK web design and marketing agency. You are writing the analysis in a website report for a small-business client who is not technical. North Bear Media built and looks after the website, so "we" means North Bear Media and "you" means the client.

How to read the data:
- "meaningfulChanges" says, for each headline number, whether the change from the previous period is big enough to mean anything: "up", "down", "level" or "none". Treat "level" as no change: small movement from one period to the next is normal and is not news, so never present a "level" figure as a rise or a fall. "none" means there is no earlier figure to compare with, so make no comparison at all.
- "wins" and "worthWatching" are facts already checked against the numbers. Build on them. "monthlyHistory" shows the longer trend by calendar month, which matters more than one month against the last. When "periodIsCalendarMonth" is false the period is a rolling window, so describe the direction of the monthly figures and do not set the period's total against any single month.
- "targetSearches" gives each key search's position averaged across every search containing that phrase, while "topQueries" gives the exact phrase alone, so the two can differ for the same words. For a key search, use the "targetSearches" position.
- "about", when present, is the business in the owner's own words. Use it to make everything specific to what they sell and who they serve, and never contradict it.

How to write:
- British English. Warm, plain and confident, the way a trusted adviser talks to a client. No jargon: say "times you appeared on Google", not "impressions".
- Lead with what is going well. A client who reads only the headline and the wins should come away knowing what their website did for them.
- When something fell by a meaningful amount, say so plainly in one calm sentence with context (the longer trend, or the time of year when that genuinely applies), then move to what we recommend doing about it. Never alarm and never spin: do not call a meaningful fall "steady", and do not offer a seasonal reason unless the dates make it obvious.
- Mind the time of year (the covering dates are given). Quiet spells over Christmas and New Year, Easter or the summer holidays are normal for many small businesses.
- Ground every statement in the numbers provided. Never invent a figure. You may work out a simple share or difference from figures that are given (for example phone visits as a share of all visits) and round it. When the earlier figure is under 50, give the two numbers ("59, up from 18") instead of a percentage.
- Do not assume facts about the business that are not in the data or in "about" (stock levels, vacancies, opening hours, how often they post). Suggest, do not presume.
- "clarity" comes from visitor recordings, which count visits differently from the headline figure, so never compare "recordedVisits" with "visits". "deadClicks" are taps on things that did nothing: only raise them when there are at least 50 recorded visits and at least one dead click for every five of them.
- If "uptime" shows outages, mention it once in the summary in one calm factual sentence. Do not turn it into a next step.
- Never use an em dash or an en dash. Use commas, full stops or the word "to".
- If "trafficTagBeingFixed" is true, the visitor counter is being reconnected and visit numbers are absent. Do not say the site had few visitors. Lead on the Google search and behaviour data, which are accurate.
- North Bear Media builds mobile-first, so a high share of phone visitors is a fact worth noting, never a sign the site needs to be made phone-friendly.
- "aiAssistantVisits" counts visitors who arrived from AI assistants such as ChatGPT. Three or more deserves one upbeat mention. With fewer than three, do not mention it at all.

Next steps ("actions"):
- These answer the question every client asks: "how do we improve this?". Each one is a specific, sensible piece of work for THIS business, tied to a figure in the data.
- Mark each with "owner": "us" for work North Bear Media would do (page titles, new content, fixing a sticking point, speed work) or "you" for something only the client can do.
- Phrase "us" actions as what we recommend doing next ("We recommend..."), not as promises with dates.
- "ask" is one short, friendly request to the client that would genuinely help (for example recent photos, a new offer, or customer reviews), or null if nothing is needed.

Reply with ONLY a JSON object, no prose around it:
{"headline": "one plain-English sentence that sums up the period honestly and leads with the best true thing",
 "summary": "three or four sentences: what happened, what it means for the business, and where the next steps point",
 "wins": [{"title": "short label of 3 to 7 words", "detail": "one sentence with the figure"}],
 "actions": [{"title": "short label of 3 to 7 words", "detail": "one or two sentences: what and why, with a figure", "owner": "us"}],
 "ask": "one sentence, or null"}
Give 2 to 4 wins and 3 to 4 actions.`;

const clip = (v, n) => String(v || '').replace(/\s*[\u2014\u2013]\s*/g, ', ').trim().slice(0, n);
const item = (r, n = 340) => ({ title: clip(r.title, 80), detail: clip(r.detail, n) });

// One shape for both writers. "recommendations" is kept as a copy of the
// actions for anything still reading the old field.
function shape(source, v) {
  const actions = (v.actions || []).slice(0, 4).map(r => ({ ...item(r), owner: r.owner === 'you' ? 'you' : 'us' }));
  return {
    source,
    headline: clip(v.headline, 240),
    summary: clip(v.summary, 800),
    wins: (v.wins || []).slice(0, 4).map(r => item(r, 240)),
    actions,
    ask: v.ask ? clip(v.ask, 260) : null,
    recommendations: actions.map(({ title, detail }) => ({ title, detail })),
  };
}

async function aiInsights(data) {
  const key = getAnthropicKey();
  if (!key) return null;
  // 60 second cap and one retry: a hung endpoint must not stall a report
  // for half an hour (SDK defaults are 10 minutes times three attempts).
  // The rules-based insights below are the designed fallback.
  const client = new Anthropic({ apiKey: key, timeout: 60_000, maxRetries: 1 });
  const msg = await client.messages.create({
    model: getInsightsModel(),
    max_tokens: 4096,
    system: SYSTEM,
    messages: [{ role: 'user', content: `Here is the data for ${data.site.clientName} (${data.site.domain}), covering ${data.period.start} to ${data.period.end}:\n\n${JSON.stringify(snapshot(data), null, 2)}` }],
  });
  const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  const jsonStr = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const parsed = JSON.parse(jsonStr);
  if (!parsed.headline || !(parsed.actions || []).length) return null;
  return shape('ai', parsed);
}

// Deterministic, always-available version built from the story layer.
function rulesInsights(data) {
  const s = snapshot(data);
  const story = data.story;
  const the = story?.period?.the || 'this period';
  const actions = [];

  if (story?.nearly) {
    actions.push({ owner: 'us', title: `Push "${story.nearly.keyword}" onto page one`,
      detail: `You sit around position ${Math.round(story.nearly.position)} for it, just off the first page. A page section or article written for that search is the quickest ranking win available.` });
  }
  if (s.search && s.search.timesShown >= 300 && s.search.clicks / s.search.timesShown < 0.03) {
    actions.push({ owner: 'us', title: 'Turn more Google appearances into visits',
      detail: `You appeared on Google ${nf.format(Math.round(s.search.timesShown))} times and ${pct((s.search.clicks / s.search.timesShown) * 100)} of those searchers clicked. Sharper page titles and descriptions for your top searches would lift that.` });
  }
  if ((story?.watch || []).some(w => w.key === 'rage')) {
    actions.push({ owner: 'us', title: 'Fix where visitors get stuck',
      detail: `Visitor recordings show ${nf.format(s.clarity.frustratedClicks)} frustrated clicks. We would find the element causing them and put it right.` });
  }
  if (s.phoneSpeedScore != null && s.phoneSpeedScore < 60) {
    actions.push({ owner: 'us', title: 'Speed up the site on phones',
      detail: `Google scores loading speed on a phone at ${s.phoneSpeedScore} out of 100. Lighter images and scripts would raise it, which helps both visitors and rankings.` });
  }
  const organic = (s.topChannels || []).find(c => /organic|google search/i.test(c.channel));
  if (organic && s.visits && organic.visits / s.visits >= 0.3) {
    actions.push({ owner: 'us', title: 'Keep the Google momentum',
      detail: `${Math.round((organic.visits / s.visits) * 100)}% of visits came from Google search. Fresh, useful content each month is what protects and grows those rankings.` });
  }
  if (story?.trends?.visits?.dir === 'down' && actions.length < 4) {
    actions.push({ owner: 'you', title: 'Share what is new',
      detail: `Visits were lower in ${the}. A post on your social pages or Google Business Profile linking back to the site is the fastest way to bring people in.` });
  }
  if (actions.length < 3) {
    actions.push({ owner: 'us', title: 'Add fresh content',
      detail: 'A new article or updated page each month gives Google a reason to keep sending people your way.' });
  }
  if (actions.length < 3) {
    actions.push({ owner: 'you', title: 'Ask happy customers for a Google review',
      detail: 'Reviews on your Google Business Profile are one of the strongest signals for local searches, and they cost nothing.' });
  }

  const wins = (story?.wins || []).slice(0, 4).map(w => ({ title: w.title, detail: w.detail }));
  const headline = story ? story.verdict.line : `Here is how ${s.domain || s.site} performed.`;
  const watch = (story?.watch || [])[0];
  const lead = wins.find(w => !/^Page one of Google/.test(w.title)) || wins[0];
  const summary = [
    lead ? `${lead.title}. ${lead.detail}` : '',
    watch ? `Worth watching: ${watch.title.charAt(0).toLowerCase()}${watch.title.slice(1)} (${watch.detail.replace(/\.$/, '')}).` : '',
    actions[0] ? `The next step we recommend is below.` : '',
  ].filter(Boolean).join(' ');
  return shape('rules', {
    headline, summary, wins, actions,
    ask: 'If you have new photos, offers or news, send them over and we will put them to work on the site.',
  });
}

export async function generateInsights(data, { rulesOnly = false } = {}) {
  // Need at least one data source to say anything meaningful.
  if (!data.ga4 && !data.search && !data.clarity) return null;
  if (!rulesOnly) {
    try {
      const ai = await aiInsights(data);
      if (ai) return ai;
    } catch (err) {
      (data.warnings || []).push(`AI insights unavailable: ${err.message.slice(0, 120)}`);
    }
  }
  return rulesInsights(data);
}

// Exposed for the prompt test: the exact system prompt and user message.
export function insightsPrompt(data) {
  return { system: SYSTEM, user: `Here is the data for ${data.site.clientName} (${data.site.domain}), covering ${data.period.start} to ${data.period.end}:\n\n${JSON.stringify(snapshot(data), null, 2)}` };
}
