// The sense check. Every report is read before it can reach a client, so
// the owner does not have to approve each one: reports that make sense go
// out on their own, and only the exceptions are held back for him.
//
// Two readers, in this order:
//   1. Rules. Cheap, always on. They catch what code can be sure about:
//      placeholder text in the report, a visit count that has collapsed
//      the way a broken tag does, a counter known to be under-counting.
//   2. A second AI reader (when an Anthropic key is set), given the same
//      numbers the writer had plus what the writer wrote, and asked one
//      question: would a careful account manager be happy to send this?
//
// What happens to a problem depends on where it is:
//   - In the WRITING (a claim the numbers do not support, a promise, a
//     guess about the business): the AI-written analysis is swapped for
//     the rules-based one, which is built from the numbers and cannot
//     wander. The report still goes. Nobody needs to do anything.
//   - In the DATA (it looks broken, not merely bad): the report is HELD.
//     It goes to the owner only, with the reason at the top, and he can
//     release it from the site's History in one click.
// If the second reader cannot be reached, AI-written analysis is not
// trusted unread: it is swapped for the rules-based one.
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicKey, getInsightsModel } from './runtime-config.js';
import { insightsPrompt, rulesInsights } from './insights.js';
import { isAutoName } from './story.js';

const nf = new Intl.NumberFormat('en-GB');
const n0 = v => nf.format(Math.round(v || 0));

// Every sentence the client would read from the analysis, as one string.
function analysisText(ins) {
  if (!ins) return '';
  return [ins.headline, ins.summary, ins.ask,
    ...(ins.wins || []).flatMap(w => [w.title, w.detail]),
    ...(ins.actions || []).flatMap(a => [a.title, a.detail])].filter(Boolean).join('\n');
}

// What code can be sure about.
function ruleChecks(data) {
  const holds = [], notes = [];
  const o = data.ga4?.overview, po = data.ga4?.prevOverview;

  if (data.ga4?.unreliable) {
    holds.push(`The visitor counter is under-counting: it shows ${n0(o?.sessions)} visits while Google alone sent ${n0(data.ga4.independentTraffic)} clicks. The report hides the visit figures and says the counter is being reconnected.`);
  } else if (o && po && po.sessions >= 100 && o.sessions <= po.sessions * 0.3) {
    holds.push(`Visits fell from ${n0(po.sessions)} to ${n0(o.sessions)}. A drop that sharp is more often a tracking fault than a real collapse, so check the tag before the client reads it.`);
  }
  const s = data.search && !data.search.empty ? data.search.summary : null, ps = data.search?.prevSummary;
  if (s && ps && ps.clicks >= 50 && s.clicks <= ps.clicks * 0.25) {
    holds.push(`Clicks from Google fell from ${n0(ps.clicks)} to ${n0(s.clicks)}. Check Search Console for a penalty, a noindex tag or a property mix-up before the client reads it.`);
  }

  const text = [analysisText(data.insights), data.story?.verdict?.label, data.story?.verdict?.line,
    ...(data.story?.wins || []).flatMap(w => [w.title, w.detail]),
    ...(data.story?.watch || []).flatMap(w => [w.title, w.detail])].filter(Boolean).join('\n');
  const placeholder = text.match(/\b(undefined|NaN|\[object Object\]|Infinity)\b/);
  if (placeholder) holds.push(`The report text contains "${placeholder[1]}", which means a figure failed to fill in.`);

  if (data.uptime?.outages > 0) notes.push(`The report tells the client their site was offline for ${data.uptime.downtimeText} (${data.uptime.outages} outage${data.uptime.outages === 1 ? '' : 's'}).`);
  if (isAutoName(data.site?.clientName, data.site?.domain) && /^[A-Z][a-z]{11,}$/.test(String(data.site?.clientName || ''))) {
    notes.push(`The client name "${data.site.clientName}" still reads like a web address. Edit the site to set the proper business name.`);
  }
  if (data.ga4?.trackingFrom) notes.push(`Visitor tracking only began on ${data.ga4.trackingFrom}, and the report says so.`);
  return { holds, notes };
}

const REVIEWER = `You are the last check at North Bear Media, a UK web agency, before a website report is emailed to a small-business client. Another writer produced the written analysis from the data. You did not write it. Your job is to protect the client relationship: stop anything wrong, unsupported or embarrassing, and let everything else through without fuss.

You are given DATA (the numbers the writer had) and ANALYSIS (what the writer wrote).

Check the ANALYSIS. Raise a problem with "about": "analysis" when:
- it states a figure that is not in the DATA and cannot be worked out from it by a simple share, difference or rounding;
- it says something rose or fell when "meaningfulChanges" says "level" or "none" for it, or gets a direction wrong;
- it presents a fact about the business that is not in the DATA or in "about" (stock, vacancies, opening hours, how often they post) as if known;
- it says North Bear Media did a piece of work that is not listed in "workDoneThisPeriod", or says that work caused a result ("because of") when the data can only show it came after;
- it makes a promise with a date, or commits North Bear Media to specific work as a certainty, instead of recommending it;
- it is alarming, blaming, sarcastic, or reads as an excuse; or it would embarrass the agency if the client forwarded it;
- it mentions anything internal (tracking tags being fixed is allowed only when "trafficTagBeingFixed" is true);
- it contradicts itself, or a sentence is cut off or garbled;
- it celebrates a striking change that rests on almost nothing, such as a big ranking jump for a search with "timesShown" under 10.
Reasonable inference about what kind of business this is, drawn from page names and searches, is fine. Honest mention of a real fall is fine. Do not nitpick style.

Check the DATA. Raise a problem with "about": "data" only when the numbers look BROKEN, not merely poor: figures that cannot both be true, a pattern that points to a tracking fault or a wrong property, or totals that are implausible for a small business website. A quiet month is not a data problem, and neither are small totals on a small or new website. Nor is "clarity.recordedVisits" being higher than "visits": the recording tool counts visits by different rules and routinely shows more, so never raise that.

Only raise a problem you can point to: a sentence in the ANALYSIS or figures in the DATA. Fields that are missing from the DATA ("about", "trafficTagBeingFixed" and others) were simply not provided; treat a missing true/false field as false. List each separate problem once.

Severity: "block" means the client must not see this as it stands. "note" means worth a look but fine to send. For a real problem in the ANALYSIS, when you cannot decide between the two, choose "block" (a safe standard analysis replaces it automatically). For the DATA, when you cannot decide, choose "note" (blocking holds the whole report for a person to read).

Reply with ONLY a JSON object:
{"problems": [{"about": "analysis" | "data", "severity": "block" | "note", "problem": "one plain sentence a non-technical owner can act on"}]}
An empty list means send it. Never use an em dash or an en dash.`;

async function aiReview(data) {
  const key = getAnthropicKey();
  if (!key) return null;
  const client = new Anthropic({ apiKey: key, timeout: 60_000, maxRetries: 1 });
  const ins = data.insights || {};
  const analysis = { headline: ins.headline, summary: ins.summary, wins: ins.wins, actions: ins.actions, ask: ins.ask };
  const msg = await client.messages.create({
    model: getInsightsModel(),
    max_tokens: 2048,
    system: REVIEWER,
    messages: [{ role: 'user', content: `DATA\n${insightsPrompt(data).user}\n\nANALYSIS\n${JSON.stringify(analysis, null, 2)}` }],
  });
  const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  if (!Array.isArray(parsed.problems)) throw new Error('reviewer reply had no problems list');
  return parsed.problems
    .filter(p => p && p.problem)
    .map(p => ({
      about: p.about === 'data' ? 'data' : 'analysis',
      severity: p.severity === 'block' ? 'block' : 'note',
      problem: String(p.problem).replace(/\s*[\u2014\u2013]\s*/g, ', ').trim().slice(0, 300),
    }))
    .slice(0, 8);
}

// Runs the check and, where the writing fails it, repairs the report in
// place (data.insights is replaced). Returns what happened:
//   { outcome: 'pass' | 'hold', holds: [...], notes: [...], reviewedBy: 'ai' | 'rules', swapped: bool }
// Never throws: a check that cannot run must not stop a report.
export async function senseCheck(data, { review = aiReview } = {}) {
  const result = { outcome: 'pass', holds: [], notes: [], reviewedBy: 'rules', swapped: false };
  try {
    const rules = ruleChecks(data);
    result.holds.push(...rules.holds);
    result.notes.push(...rules.notes);

    const aiWritten = data.insights?.source === 'ai';
    let problems = null;
    if (data.insights) {
      try { problems = await review(data); } catch (err) {
        result.notes.push(`The second reader could not be reached (${String(err.message || err).slice(0, 80)}).`);
      }
    }
    if (problems) {
      result.reviewedBy = 'ai';
      const badWriting = problems.filter(p => p.about === 'analysis' && p.severity === 'block');
      if (badWriting.length && aiWritten) {
        data.insights = rulesInsights(data);
        result.swapped = true;
        result.notes.push(`The AI-written analysis was replaced with the standard one. Reason: ${badWriting.map(p => p.problem).join(' ')}`);
      } else if (badWriting.length) {
        // The standard analysis itself was faulted: nothing safer to fall
        // back to, so a person should read it.
        result.holds.push(...badWriting.map(p => p.problem));
      }
      result.holds.push(...problems.filter(p => p.about === 'data' && p.severity === 'block').map(p => p.problem));
      result.notes.push(...problems.filter(p => p.severity === 'note').map(p => p.problem));
    } else if (aiWritten) {
      // Unread AI writing does not go to a client.
      data.insights = rulesInsights(data);
      result.swapped = true;
      result.notes.push('The AI-written analysis could not be checked by a second reader, so the standard analysis was used instead.');
    }
  } catch (err) {
    result.notes.push(`Sense check did not complete: ${String(err.message || err).slice(0, 100)}`);
  }
  if (result.holds.length) result.outcome = 'hold';
  return result;
}

// One line for the report history.
export function checkSummary(check, held) {
  if (!check) return '';
  const parts = [];
  if (held) parts.push(`HELD: ${check.holds.join(' | ')}`);
  else if (check.holds.length) parts.push(`Released by the owner despite: ${check.holds.join(' | ')}`);
  if (check.notes.length) parts.push(`Notes: ${check.notes.join(' | ')}`);
  return parts.join(' || ').slice(0, 1500);
}
