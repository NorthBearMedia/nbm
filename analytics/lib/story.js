// The plain-English read of a period's numbers, worked out by rules so it
// is always available and always grounded: a verdict (how did it go), the
// wins worth telling the client about, the things worth watching, and the
// next steps. Reports, the dashboard and the email all lead with this
// instead of a wall of arrows.
//
// The lesson behind it: Richford's October report showed six red "down"
// arrows on what was a good month for the business (page-one rankings,
// the right pages busiest, no downtime), and the client's reply was "how
// do we improve these?". Month-to-month wobble is not news. A change only
// counts when it is big enough to mean something, wins are told first,
// and red is kept for things that are actually broken.

const nf = new Intl.NumberFormat('en-GB');
const n0 = v => nf.format(Math.round(v || 0));

// What to call the period in a sentence.
export function periodNoun(start, end) {
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  const firstOfMonth = String(start).slice(8, 10) === '01';
  if (days === 7) return { noun: 'week', the: 'this week', prev: 'the week before', days };
  if (firstOfMonth && days >= 28 && days <= 31) return { noun: 'month', the: 'this month', prev: 'the month before', days };
  if (firstOfMonth && days >= 89 && days <= 92) return { noun: 'quarter', the: 'this quarter', prev: 'the quarter before', days };
  return { noun: `${days} days`, the: `the last ${days} days`, prev: `the ${days} days before`, days };
}

// Is a change big enough to mean something? Small sites swing wildly in
// percentage terms (8 visits to 13 is "up 63%"), so a move has to clear
// both a relative bar and an absolute one before it is called up or down.
export function trend(cur, prev) {
  // No earlier figure (or a zero, which means tracking had not started)
  // is "nothing to compare with", not a rise from nothing.
  if (cur == null || prev == null || prev === 0) return { dir: 'none', pct: null, diff: null };
  const diff = cur - prev;
  const pct = prev > 0 ? (diff / prev) * 100 : null;
  const bar = Math.max(8, prev * 0.12);
  if (Math.abs(diff) < bar) return { dir: 'level', pct, diff };
  return { dir: diff > 0 ? 'up' : 'down', pct, diff };
}

const pctText = t => (t.pct == null ? '' : `${Math.abs(t.pct).toFixed(0)}%`);

function monthName(key) {
  return new Date(key + '-15T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
}

// Where this period sits against the site's own recent history, in one
// honest clause. Needs at least four earlier full months to say anything.
function historyContext(history, field, current, data) {
  const endMonth = String(data?.period?.end || '').slice(0, 7);
  const calendarMonth = periodNoun(data.period.start, data.period.end).noun === 'month';
  const earlier = (history?.months || [])
    .filter(m => !m.partial && m[field] != null && !(calendarMonth && m.month === endMonth))
    .map(m => m[field]);
  if (earlier.length < 3 || current == null) return null;
  const avg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
  const best = Math.max(...earlier);
  if (current > best) return { kind: 'best', text: `the best in the last ${earlier.length + 1} months` };
  if (avg > 0 && current >= avg * 1.1) return { kind: 'above', text: `above the ${earlier.length}-month average of ${n0(avg)}` };
  if (avg > 0 && current >= avg * 0.9) return { kind: 'inline', text: `in line with the ${earlier.length}-month average of ${n0(avg)}` };
  return { kind: 'below', text: `below the ${earlier.length}-month average of ${n0(avg)}` };
}

// A readable name for a page when the analytics source gives no title:
// "/recovery-sales" reads as "Recovery sales".
export function pageLabel(path, title) {
  if (title) return title;
  const clean = String(path || '/').split('?')[0].replace(/\/+$/, '');
  if (!clean) return 'Homepage';
  const last = decodeURIComponent(clean.split('/').pop() || '').replace(/\.(html?|php)$/i, '').replace(/[-_]+/g, ' ').trim();
  return last ? last.charAt(0).toUpperCase() + last.slice(1) : 'Homepage';
}

const quote = s => `"${s}"`;
const pos = p => (p == null ? null : Math.max(1, Math.round(p)));

export function buildStory(data) {
  const period = periodNoun(data.period.start, data.period.end);
  const trusted = data.ga4?.overview && !data.ga4.unreliable;
  const o = trusted ? data.ga4.overview : null;
  const po = trusted ? (data.ga4.prevOverview || null) : null;
  const s = data.search && !data.search.empty ? data.search.summary : null;
  const ps = s ? data.search.prevSummary : null;

  const visits = trend(o?.sessions, po?.sessions);
  const clicks = trend(s?.clicks, ps?.clicks);
  const shown = trend(s?.impressions, ps?.impressions);

  // Every key search counts in "5 of 8", including ones not ranking yet.
  const allTargets = data.search?.targets || [];
  const targets = allTargets.filter(t => t.position != null);
  const pageOne = targets.filter(t => t.position <= 10.5);
  const ofKey = allTargets.length === 1 ? 'your key search'
    : pageOne.length === allTargets.length ? `all ${allTargets.length} of your key searches`
    : `${pageOne.length} of your ${allTargets.length} key searches`;
  const climbers = [...targets, ...(data.search?.topQueries || []).map(q => ({ keyword: q.query, position: q.position, movement: q.positionChange }))]
    .filter(t => t.movement != null && t.movement >= 1.5 && t.position <= 12.5)
    .sort((a, b) => b.movement - a.movement);
  const seen = new Set();
  const topClimbers = climbers.filter(t => !seen.has(t.keyword) && seen.add(t.keyword)).slice(0, 3);
  const nearly = [...targets, ...(data.search?.topQueries || []).map(q => ({ keyword: q.query, position: q.position, impressions: q.impressions }))]
    .filter(t => t.position > 10.5 && t.position <= 16)
    .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))[0] || null;

  // ---------- wins ----------
  const wins = [];
  if (pageOne.length) {
    const names = pageOne.slice().sort((a, b) => a.position - b.position).slice(0, 3)
      .map(t => `${quote(t.keyword)} (position ${pos(t.position)})`).join(', ');
    wins.push({
      key: 'page-one',
      title: `Page one of Google for ${ofKey}`,
      detail: `Including ${names}.`,
    });
  }
  if (topClimbers.length) {
    const c = topClimbers[0];
    wins.push({
      key: 'climber',
      title: `${quote(c.keyword)} climbed ${Math.round(c.movement)} place${Math.round(c.movement) === 1 ? '' : 's'}`,
      detail: `Now around position ${pos(c.position)} on Google${topClimbers[1] ? `, and ${quote(topClimbers[1].keyword)} is up ${Math.round(topClimbers[1].movement)} too` : ''}.`,
    });
  }
  if (visits.dir === 'up') {
    const ctx = historyContext(data.history, 'visits', o.sessions, data);
    wins.push({
      key: 'visits',
      title: `Visits up ${pctText(visits)}`,
      detail: `${n0(o.sessions)} visits, against ${n0(po.sessions)} in ${period.prev}${ctx && (ctx.kind === 'best' || ctx.kind === 'above') ? `, ${ctx.text}` : ''}.`,
    });
  }
  if (clicks.dir === 'up') {
    wins.push({ key: 'clicks', title: `More people clicking through from Google`, detail: `${n0(s.clicks)} clicks, up ${pctText(clicks)} on ${period.prev}.` });
  }
  if (shown.dir === 'up') {
    wins.push({ key: 'shown', title: `Showing up in more Google searches`, detail: `You appeared ${n0(s.impressions)} times, up ${pctText(shown)} on ${period.prev}.` });
  }
  const ga = trusted ? data.ga4 : null;
  const topPage = (ga?.topPages || [])[0];
  if (topPage && topPage.views >= 10) {
    const label = topPage.path === '/' ? 'Your homepage' : `Your "${pageLabel(topPage.path, topPage.title)}" page`;
    wins.push({ key: 'top-page', title: `${label} was the busiest`, detail: `${n0(topPage.views)} views in ${period.the}.` });
  }
  if (data.uptime && data.uptime.outages === 0) {
    wins.push({ key: 'uptime', title: 'No downtime', detail: `Your website was up and answering for all of ${period.the}.` });
  }
  if (data.aiTraffic && data.aiTraffic.visits >= 3) {
    const top = data.aiTraffic.top?.[0]?.source;
    wins.push({ key: 'ai', title: `${n0(data.aiTraffic.visits)} visits from AI assistants`, detail: `People are finding you through AI answers${top ? `, mostly ${top}` : ''}.` });
  }
  if (o && o.averageSessionDuration >= 60 && visits.dir !== 'up') {
    wins.push({ key: 'time', title: 'Visitors are staying to read', detail: `The average visit lasted ${Math.floor(o.averageSessionDuration / 60)}m ${Math.round(o.averageSessionDuration % 60)}s.` });
  }

  // ---------- things to watch (calm, factual, never alarmist) ----------
  const watch = [];
  if (visits.dir === 'down') {
    const ctx = historyContext(data.history, 'visits', o.sessions, data);
    watch.push({
      key: 'visits',
      title: `Fewer visits than ${period.prev}`,
      detail: `${n0(o.sessions)} against ${n0(po.sessions)}${ctx ? `, ${ctx.text}` : ''}.`,
    });
  }
  if (clicks.dir === 'down') {
    watch.push({ key: 'clicks', title: 'Fewer clicks from Google', detail: `${n0(s.clicks)} against ${n0(ps.clicks)} in ${period.prev}.` });
  }
  if (nearly) {
    watch.push({ key: 'nearly', title: `${quote(nearly.keyword)} is just off page one`, detail: `It sits around position ${pos(nearly.position)}. A small push could move it onto the first page.` });
  }
  if (data.clarity && data.clarity.sessions > 0 && data.clarity.rageClicks >= Math.max(10, data.clarity.sessions * 0.02)) {
    watch.push({ key: 'rage', title: 'A few visitors got stuck', detail: `${n0(data.clarity.rageClicks)} frustrated clicks recorded. Worth finding the spot that caused them.` });
  }
  if (data.siteHealth?.performance != null && data.siteHealth.performance < 50) {
    watch.push({ key: 'speed', title: 'Phone loading speed', detail: `Google scores the site ${data.siteHealth.performance} out of 100 for speed on a phone.` });
  }
  if (data.uptime && data.uptime.outages > 0) {
    watch.push({ key: 'downtime', title: 'Some downtime', detail: `The site was unreachable for ${data.uptime.downtimeText} across ${data.uptime.outages} outage${data.uptime.outages === 1 ? '' : 's'}.` });
  }

  // ---------- verdict ----------
  // Tiny sites cannot have a "trend": below about two visits a day the
  // month-to-month change is noise, so the verdict says so instead.
  const small = o ? (o.sessions < 60 && (po?.sessions ?? 0) < 60) : (s ? s.clicks < 20 && (ps?.clicks ?? 0) < 20 : true);
  const score = (visits.dir === 'up' ? 1 : visits.dir === 'down' ? -1 : 0)
    + (clicks.dir === 'up' ? 1 : clicks.dir === 'down' ? -1 : 0)
    + (shown.dir === 'up' ? 0.5 : shown.dir === 'down' ? -0.5 : 0)
    + (topClimbers.length ? 0.5 : 0);
  const ups = [visits, clicks, shown].filter(t => t.dir === 'up').length;
  const downs = [visits, clicks, shown].filter(t => t.dir === 'down').length;

  const N = period.noun;
  let tone, label;
  if (!o && !s) { tone = 'building'; label = 'Getting started'; }
  else if (small) { tone = 'building'; label = 'Early days'; }
  else if (score >= 1.5 && downs === 0) { tone = 'strong'; label = `A strong ${N}`; }
  else if (score >= 0.5 && downs === 0 && ups) { tone = 'good'; label = `A good ${N}`; }
  else if (ups && downs) { tone = 'mixed'; label = `A mixed ${N}`; }
  else if (downs >= 2 || (o ? visits : clicks).dir === 'down') { tone = 'quieter'; label = `A quieter ${N}`; }
  else { tone = 'steady'; label = `A steady ${N}`; }

  // One or two plain sentences, best true thing first.
  const facts = [];
  if (o) {
    facts.push(visits.dir === 'up' ? `visits rose ${pctText(visits)} to ${n0(o.sessions)}`
      : visits.dir === 'down' ? `visits were ${n0(o.sessions)}, down ${pctText(visits)} on ${period.prev}`
      : visits.dir === 'level' ? `visits held level at ${n0(o.sessions)}`
      : `the site had ${n0(o.sessions)} visit${Math.round(o.sessions) === 1 ? '' : 's'}`);
  }
  if (s) {
    facts.push(clicks.dir === 'up' ? `clicks from Google rose ${pctText(clicks)} to ${n0(s.clicks)}`
      : clicks.dir === 'down' ? `clicks from Google were ${n0(s.clicks)}, down ${pctText(clicks)}`
      : clicks.dir === 'level' && s.clicks >= 20 ? `Google sent a steady ${n0(s.clicks)} clicks`
      : `Google sent ${n0(s.clicks)} click${Math.round(s.clicks) === 1 ? '' : 's'}`);
  }
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  const sentences = [];
  if (pageOne.length) sentences.push(`You are on page one of Google for ${ofKey}.`);
  if (facts.length) sentences.push(cap(facts.join(', and ')) + '.');
  let line = sentences.length ? sentences.join(' ') : 'Tracking is in place and the numbers are starting to build.';
  if (tone === 'building' && (o || s)) line += ' Numbers this small move around a lot from one period to the next, so the trend matters more than any single figure.';

  return {
    period,
    verdict: { tone, label, line },
    trends: { visits, clicks, shown },
    pageOne: allTargets.length ? { count: pageOne.length, of: allTargets.length } : null,
    wins: wins.slice(0, 5),
    watch: watch.slice(0, 4),
    nearly,
  };
}

// Auto-imported sites were named from their domain ("Richfordvehiclesales").
// True when a name is still that machine-made form, so a proper name can
// replace it without ever overwriting one a person typed.
export function isAutoName(clientName, domain) {
  const label = String(domain || '').toLowerCase().replace(/^www\./, '').split('.')[0];
  const auto = label.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return String(clientName || '').trim() === auto;
}

export { monthName };
