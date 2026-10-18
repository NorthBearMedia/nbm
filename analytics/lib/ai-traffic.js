// Visits that arrived from an AI assistant (ChatGPT, Perplexity, Claude,
// Gemini, Copilot and co), counted from the referrer data the tags already
// on every site collect. Nothing new is installed anywhere.
//
// Honest limits, for anyone extending this:
//  - Only clicks that carry a referrer are countable. Some AI apps open
//    links without one (those land in "Direct"), so these numbers are a
//    floor, not a ceiling.
//  - Clicks from Google's AI Overviews arrive as ordinary google.com
//    search traffic; neither GA4 nor Search Console can split them out.
//  - AI crawlers (GPTBot and friends) never run JavaScript, so they are
//    invisible to tag-based analytics by design and are NOT what this
//    measures. This measures people.
import * as ga4 from './ga4.js';
import { fathomReferrers } from './fathom.js';

// host -> label. A host matches a visit when the visit's referrer host is
// exactly it, or a subdomain of it. Plain search domains (google.com,
// bing.com) must never appear here.
const AI_SOURCES = [
  ['chatgpt.com', 'ChatGPT'],
  ['chat.openai.com', 'ChatGPT'],
  ['openai.com', 'ChatGPT'],
  ['perplexity.ai', 'Perplexity'],
  ['claude.ai', 'Claude'],
  ['gemini.google.com', 'Gemini'],
  ['bard.google.com', 'Gemini'],
  ['copilot.microsoft.com', 'Microsoft Copilot'],
  ['copilot.cloud.microsoft', 'Microsoft Copilot'],
  ['edgeservices.bing.com', 'Microsoft Copilot'],
  ['meta.ai', 'Meta AI'],
  ['grok.com', 'Grok'],
  ['x.ai', 'Grok'],
  ['chat.deepseek.com', 'DeepSeek'],
  ['deepseek.com', 'DeepSeek'],
  ['chat.mistral.ai', 'Mistral'],
  ['poe.com', 'Poe'],
  ['you.com', 'You.com'],
  ['phind.com', 'Phind'],
  ['duck.ai', 'DuckDuckGo AI'],
];

// Referrers arrive in every shape: bare hosts from GA ("chatgpt.com"),
// scheme-prefixed from Fathom ("https://chatgpt.com/"), sometimes with
// www. Reduce all of them to the bare host before matching.
export function bareHost(value) {
  return String(value || '').toLowerCase()
    .replace(/^[a-z+.-]+:\/\//, '')
    .replace(/[/:?#].*$/, '')
    .replace(/^www\./, '');
}

export function aiLabelFor(referrer) {
  const host = bareHost(referrer);
  if (!host) return null;
  for (const [key, label] of AI_SOURCES) {
    if (host === key || host.endsWith('.' + key)) return label;
  }
  return null;
}

// rows: [{ referrer, visits }] in any referrer shape -> totals per assistant.
export function classifyAiReferrers(rows) {
  const byLabel = new Map();
  for (const r of rows || []) {
    const label = aiLabelFor(r.referrer);
    if (!label) continue;
    byLabel.set(label, (byLabel.get(label) || 0) + Number(r.visits || 0));
  }
  const top = [...byLabel.entries()].map(([source, visits]) => ({ source, visits }))
    .filter(t => t.visits > 0).sort((a, b) => b.visits - a.visits);
  return { visits: top.reduce((a, t) => a + t.visits, 0), top };
}

export async function gaAiTraffic(propertyId, start, end) {
  const rows = await ga4.fetchSources(propertyId, start, end, 250);
  return classifyAiReferrers(rows.map(r => ({ referrer: r.source, visits: r.sessions })));
}

export async function fathomAiTraffic(fathomSiteId, start, end) {
  const rows = await fathomReferrers(fathomSiteId, start, end, 100);
  return classifyAiReferrers(rows.map(r => ({ referrer: r.host, visits: r.visits })));
}
