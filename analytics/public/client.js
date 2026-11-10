// North Bear Pulse: the client-facing live dashboard.
//
// Leads with the story (how the period went, what went well, what comes
// next) and only then the detail, section by section. Every block copes
// with its data being absent: a section either shows a tidy note or
// steps aside. Nothing from the payload reaches the page unescaped.
const token = location.pathname.split('/').pop();
let currentRange = 30;
let hasRendered = false;
let loadSeq = 0;
const charts = {};

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('en-GB');
const fmtInt = n => nf.format(Math.round(n || 0));
// Headline figures: past a million the full number no longer fits its
// cell on a phone, so it is shortened ("1.23M").
const fmtBig = n => (Math.abs(n || 0) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : fmtInt(n));
const fmtPct = (p, dp = 1) => `${(p || 0).toFixed(dp)}%`;
function fmtDur(seconds) {
  const s = Math.round(seconds || 0), m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
const fmtDay = (iso, withYear = false) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB',
  { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function toast(msg, type = 'ok', ms = 6000) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.className = '', ms);
}

// ---------- is a change worth mentioning? ----------
// Counts use the same test as the server's story layer: a move has to
// clear a relative bar and an absolute one, so 8 visits becoming 13 is
// not announced as "up 63%". Rates only need the relative bar.
function countTrend(cur, prev) {
  if (cur == null || prev == null) return { dir: 'none', pct: null };
  const diff = cur - prev;
  const pct = prev > 0 ? (diff / prev) * 100 : null;
  if (Math.abs(diff) < Math.max(8, prev * 0.12)) return { dir: 'level', pct };
  return { dir: diff > 0 ? 'up' : 'down', pct };
}
function rateTrend(cur, prev, sample = Infinity) {
  // A rate worked out from a handful of visits swings on one person, so
  // it gets no change note at all until there is enough to go on.
  if (cur == null || prev == null || !(prev > 0) || !(sample >= 30)) return { dir: 'none', pct: null };
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 12) return { dir: 'level', pct };
  return { dir: pct > 0 ? 'up' : 'down', pct };
}
// Up is green, level is quiet, down is a calm note. Never red: red is
// kept for things that are actually broken. goodDown flips the sense for
// figures where less is better (frustrated clicks).
function noteHtml(t, { goodDown = false } = {}) {
  if (!t || t.dir === 'none' || t.dir == null) return '';
  if (t.dir === 'level') return '<div class="fig-note">Level</div>';
  if (t.pct == null || !isFinite(t.pct)) return '';
  const good = goodDown ? t.dir === 'down' : t.dir === 'up';
  return `<div class="fig-note${good ? ' good' : ''}">${t.dir === 'up' ? '\u2191 up' : '\u2193 down'} ${Math.abs(t.pct).toFixed(0)}%</div>`;
}
// Ranking movement in places: positive means climbed.
function placesHtml(places, cls = 'fig-note') {
  if (places == null || !isFinite(places)) return '';
  // Under three quarters of a place is drift, not a move.
  if (Math.abs(places) < 0.75) return `<div class="${cls}">Level</div>`;
  const n = Math.max(1, Math.round(Math.abs(places)));
  const up = places > 0;
  return `<div class="${cls}${up ? ' good' : ''}">${up ? '\u2191 up' : '\u2193 down'} ${n} place${n === 1 ? '' : 's'}</div>`;
}

function fig(label, value, note = '', { color = '', help = '' } = {}) {
  return `<div class="fig"${color ? ` style="--c:var(--${color})"` : ''}>
    <div class="fig-label">${esc(label)}</div>
    <div class="fig-value">${value}</div>
    ${note}${help ? `<div class="fig-help">${esc(help)}</div>` : ''}
  </div>`;
}
const figs = (list, cls = '') => `<div class="figs ${cls}" style="--n:${Math.min(list.length, 6)}">${list.join('')}</div>`;
const band = (no, title, meta = '') => `<div class="band"><span class="band-no">${no}</span><span class="band-title">${esc(title)}</span>${meta ? `<span class="band-meta">${esc(meta)}</span>` : ''}</div>`;
const notice = (title, body) => `<div class="notice"><h3>${esc(title)}</h3><p>${body}</p></div>`;

const FRIENDLY_CHANNEL = {
  'Organic Search': 'Google search', 'Direct': 'Came straight to you', 'Organic Social': 'Social media',
  'Paid Social': 'Social media ads', 'Paid Search': 'Google ads', 'Referral': 'Other websites',
  'Email': 'Email', 'Unassigned': 'Other',
};
const DEVICE = { mobile: 'Phone', phone: 'Phone', desktop: 'Computer', tablet: 'Tablet' };

// A page name a person can read: "/recovery-sales" reads "Recovery sales".
function pageName(path, title) {
  const clean = String(path || '/').split('?')[0].split('#')[0].replace(/\/index\.(html?|php)$/i, '').replace(/\/+$/, '');
  if (!clean) return 'Homepage';
  if (title && title !== '(not set)') {
    const first = String(title).split(/\s+[|\u2013\u2014-]\s+/)[0].trim();
    if (first) return first;
  }
  let last = clean.split('/').pop() || '';
  try { last = decodeURIComponent(last); } catch { /* keep as is */ }
  last = last.replace(/\.(html?|php)$/i, '').replace(/[-_]+/g, ' ').trim();
  return last ? last.charAt(0).toUpperCase() + last.slice(1) : 'Homepage';
}

// ---------- sections ----------

function heroSection(d, ctx) {
  const { o, p, s, sp, gaBad, story, tr } = ctx;
  const tone = story?.verdict?.tone || 'steady';
  const label = story?.verdict?.label || `The last ${d.rangeDays} days`;
  const standfirst = (d.insights?.source === 'ai' && d.insights.headline) || story?.verdict?.line || d.insights?.headline || '';

  const list = [];
  if (o) list.push(fig('Visits', fmtBig(o.sessions), noteHtml(tr.visits || countTrend(o.sessions, p.sessions)), { color: 'green' }));
  if (s) {
    list.push(fig('Clicks from Google', fmtBig(s.clicks), noteHtml(tr.clicks || countTrend(s.clicks, sp.clicks)), { color: 'cyan' }));
    list.push(fig('Times shown on Google', fmtBig(s.impressions), noteHtml(tr.shown || countTrend(s.impressions, sp.impressions)), { color: 'yellow' }));
  }
  // Counted against every key search, including any Google is not
  // showing the site for yet, the same way the written summary counts.
  const targets = d.search?.targets || [];
  if (s && targets.length) {
    const p1 = targets.filter(t => t.position != null && t.position <= 10.5).length;
    list.push(fig('Key searches on page one', `${p1}<small>of ${targets.length}</small>`, '<div class="fig-note">Google positions 1 to 10</div>', { color: 'white' }));
  } else if (s && s.position) {
    list.push(fig('Average Google position', s.position.toFixed(1), placesHtml(sp.position ? sp.position - s.position : null), { color: 'white' }));
  }
  if (o && list.length < 4) list.push(fig('Pages viewed', fmtBig(o.screenPageViews), noteHtml(countTrend(o.screenPageViews, p.screenPageViews)), { color: 'white' }));
  if (o && list.length < 4) list.push(fig('Average visit', fmtDur(o.averageSessionDuration), noteHtml(rateTrend(o.averageSessionDuration, p.averageSessionDuration, Math.min(o.sessions || 0, p.sessions || 0))), { color: 'cyan' }));

  const notes = [];
  if (list.length) notes.push(`Changes compare with ${esc(story?.period?.prev || 'the period before')}. A movement too small to mean anything shows as level.`);
  if (o) {
    // Set by the server only when tracking genuinely began inside this period.
    if (d.ga4.trackingFrom) notes.push(`Visitor counting was installed on ${esc(fmtDay(d.ga4.trackingFrom))}, so visit numbers only cover from that date.`);
  } else if (gaBad) {
    notes.push('Your visitor counter is being reconnected, so visit totals are left out for now. The Google figures are complete and accurate.');
  }

  const months = (d.history?.months || []);
  const showHistory = months.length >= 2 && months.some(m => (!gaBad && m.visits != null) || m.clicks != null);
  // An under-counting visitor counter never has its history charted either.
  const hasVisits = !gaBad && months.some(m => m.visits != null), hasClicks = months.some(m => m.clicks != null);
  const part = months.some(m => m.partial);

  return `<section class="sec hero" id="summary"><div class="wrap">
    ${band('P100', 'Summary', d.period ? `${fmtDay(d.period.start)} to ${fmtDay(d.period.end, true)}` : '')}
    <p class="verdict t-${esc(tone)}">${esc(label)}</p>
    ${standfirst ? `<p class="standfirst">${esc(standfirst)}</p>` : ''}
    ${list.length ? `<div class="gap-lg">${figs(list)}</div>` : ''}
    ${notes.map(n => `<p class="caption">${n}</p>`).join('')}
    ${showHistory ? `<div class="panel gap-lg">
      <div class="panel-head">
        <h2 class="sub">The long view</h2>
        <div class="legend">
          ${hasVisits ? '<span class="key"><i></i>Visits</span>' : ''}
          ${hasClicks ? `<span class="key"><i class="${hasVisits ? 'k-line' : ''}"></i>Clicks from Google</span>` : ''}
          ${part ? '<span class="key"><i class="k-part"></i>Month so far</span>' : ''}
        </div>
      </div>
      <div class="chart"><canvas id="historyChart" role="img" aria-label="Month by month chart of ${hasVisits ? 'visits' : 'clicks from Google'}"></canvas></div>
      <p class="caption">Month by month, so one quiet or busy spell can be seen against the bigger picture.</p>
    </div>` : ''}
  </div></section>`;
}

function storySection(d, ctx) {
  const wins = (d.insights?.wins?.length ? d.insights.wins : ctx.story?.wins) || [];
  const actions = d.insights?.actions || [];
  const watch = ctx.story?.watch || [];
  const ask = d.insights?.ask || '';
  if (!wins.length && !actions.length && !watch.length) return '';
  const two = wins.length && actions.length;
  const no = i => String(i + 1).padStart(2, '0');
  const winsHtml = wins.length ? `<div>
      <h2 class="col-title">What went well</h2>
      <ol class="items">${wins.map((w, i) => `<li class="item">
        <span class="item-no">${no(i)}</span><span class="item-title">${esc(w.title)}</span>
        <span class="item-detail">${esc(w.detail)}</span></li>`).join('')}</ol>
    </div>` : '';
  const actionsHtml = actions.length ? `<div>
      <h2 class="col-title">Where we go from here</h2>
      <ol class="items">${actions.map((a, i) => `<li class="item">
        <span class="item-no" style="grid-row:span 2">${no(i)}</span>
        <span class="item-top"><span class="chip chip--${a.owner === 'you' ? 'you' : 'us'}">${a.owner === 'you' ? 'You' : 'North Bear'}</span></span>
        <span class="item-title" style="grid-column:2">${esc(a.title)}</span>
        <span class="item-detail">${esc(a.detail)}</span></li>`).join('')}</ol>
    </div>` : '';
  const watchHtml = watch.length ? `<div>
      <div class="kicker"><span class="blk"></span>Worth watching</div>
      <ul class="watch">${watch.map(w => `<li><b>${esc(w.title)}</b>${esc(w.detail)}</li>`).join('')}</ul>
    </div>` : '';
  const askHtml = ask ? `<div class="ask"><div class="kicker"><span class="blk"></span>One thing from you</div><p>${esc(ask)}</p></div>` : '';
  return `<section class="sec sec--paper" id="story"><div class="wrap">
    ${band('P150', 'What it means')}
    <div class="story"${two ? '' : ' style="grid-template-columns:1fr"'}>${winsHtml}${actionsHtml}</div>
    ${watchHtml || askHtml ? `<div class="aside${watchHtml && askHtml ? '' : ' aside--one'}">${watchHtml}${askHtml}</div>` : ''}
  </div></section>`;
}

function visitorsSection(d, ctx) {
  const { o, p, gaBad, tr } = ctx;
  let h = `<section class="sec sec--char sec--cyan" id="visitors"><div class="wrap">
    ${band('P200', 'Visitors', o && d.ga4.sourceLabel ? `Source: ${d.ga4.sourceLabel}` : '')}`;
  if (gaBad) {
    h += notice('Visitor counting is being reconnected', 'The counter on your site is being put back in place, so visit totals are not complete yet. Your Google search results and behaviour figures below are live and accurate.');
  } else if (!o) {
    h += notice('Visitor counting is being set up', 'North Bear Media is connecting visitor counting for your site. Your visits, where they came from and your busiest pages will appear here soon.');
  } else {
    const sample = Math.min(o.sessions || 0, p.sessions || 0);
    const ppv = o.sessions ? o.screenPageViews / o.sessions : 0;
    const prevPpv = p.sessions ? p.screenPageViews / p.sessions : null;
    const list = [fig('Visits', fmtBig(o.sessions), noteHtml(tr.visits || countTrend(o.sessions, p.sessions)), { color: 'green' })];
    if (d.ga4.visitorsSameAsVisits === false) list.push(fig('Visitors', fmtBig(o.totalUsers), noteHtml(countTrend(o.totalUsers, p.totalUsers)), { help: 'different people' }));
    list.push(fig('Pages viewed', fmtBig(o.screenPageViews), noteHtml(countTrend(o.screenPageViews, p.screenPageViews))));
    list.push(o.newUsers != null
      ? fig('New visitors', fmtBig(o.newUsers), noteHtml(countTrend(o.newUsers, p.newUsers)), { help: 'here for the first time' })
      : fig('Pages per visit', ppv.toFixed(1), noteHtml(rateTrend(ppv, prevPpv, sample))));
    list.push(fig('Engaged visits', fmtPct(o.engagementRate * 100, 0), noteHtml(rateTrend(o.engagementRate, p.engagementRate, sample)), { help: 'did more than glance at one page' }));
    list.push(fig('Average visit', fmtDur(o.averageSessionDuration), noteHtml(rateTrend(o.averageSessionDuration, p.averageSessionDuration, sample))));
    h += figs(list, 'figs--sm');

    if (d.ga4.timeseries?.length > 1) {
      h += `<div class="panel gap">
        <div class="panel-head"><h2 class="sub">Visits day by day</h2></div>
        <div class="chart"><canvas id="trafficChart" role="img" aria-label="Line chart of visits each day"></canvas></div>
      </div>`;
    }

    const channels = (d.ga4.channels || []).slice(0, 7);
    const devices = d.ga4.devices || [];
    let left = '', right = '';
    if (channels.length) {
      const max = Math.max(...channels.map(c => c.sessions), 1);
      const total = (d.ga4.channels || []).reduce((a, c) => a + c.sessions, 0) || 1;
      left = `<div class="panel">
        <div class="panel-head"><h2 class="sub">Where visitors came from</h2></div>
        <div class="bars">${channels.map(c => `<div class="bar">
          <div class="bar-label" title="${esc(FRIENDLY_CHANNEL[c.channel] || c.channel)}">${esc(FRIENDLY_CHANNEL[c.channel] || c.channel)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${((c.sessions / max) * 100).toFixed(1)}%"></div></div>
          <div class="bar-val">${fmtInt(c.sessions)}<span>${Math.round((c.sessions / total) * 100)}%</span></div>
        </div>`).join('')}</div>
      </div>`;
    }
    if (devices.length) {
      const total = devices.reduce((a, x) => a + x.sessions, 0) || 1;
      const name = x => DEVICE[String(x.device).toLowerCase()] || (String(x.device).charAt(0).toUpperCase() + String(x.device).slice(1));
      right += `<div class="panel">
        <div class="panel-head"><h2 class="sub">What they browsed on</h2></div>
        <div class="split" role="img" aria-label="Share of visits by device">${devices.map(x => `<span style="flex:${Math.max(x.sessions, total * 0.004)}"></span>`).join('')}</div>
        <div class="split-keys">${devices.map(x => `<div class="split-key"><b>${Math.round((x.sessions / total) * 100)}%</b><i></i>${esc(name(x))}</div>`).join('')}</div>
      </div>`;
    }
    if (d.aiTraffic) {
      const ai = d.aiTraffic;
      right += `<div class="panel">
        <div class="panel-head"><h2 class="sub">Visits from AI assistants</h2></div>
        ${ai.visits > 0
          ? `<div class="ai"><b>${fmtInt(ai.visits)}</b><span>${ai.sharePct != null ? `${esc(ai.sharePct)}% of visits` : ''}${ai.top?.length ? `${ai.sharePct != null ? '. ' : ''}${ai.top.map(t => `${esc(t.source)} ${fmtInt(t.visits)}`).join(', ')}` : ''}</span></div>
             <p class="caption">People who found you through ChatGPT, Perplexity, Gemini, Copilot and similar tools.</p>`
          : '<p class="ai-none">None recorded in this period, which is normal today. As more people search with tools like ChatGPT, the visitors they send will show here.</p>'}
      </div>`;
    }
    if (left || right) {
      h += left && right ? `<div class="cols gap">${left}<div class="stack">${right}</div></div>` : `<div class="stack gap">${left || right}</div>`;
    }

    const pages = (d.ga4.topPages || []).slice(0, 8);
    if (pages.length) {
      const max = Math.max(...pages.map(pg => pg.views), 1);
      h += `<div class="panel gap">
        <div class="panel-head"><h2 class="sub">Most viewed pages</h2><div class="legend"><span class="key">Views</span></div></div>
        <ol class="pages">${pages.map((pg, i) => `<li class="page">
          <span class="page-no">${String(i + 1).padStart(2, '0')}</span>
          <span class="page-name" title="${esc(pg.path)}">${esc(pageName(pg.path, pg.title))}<span class="page-path">${esc(pg.path)}</span></span>
          <span class="bar-track"><span class="bar-fill" style="display:block;width:${((pg.views / max) * 100).toFixed(1)}%"></span></span>
          <span class="page-val">${fmtInt(pg.views)}</span>
        </li>`).join('')}</ol>
      </div>`;
    }
  }
  return h + '</div></section>';
}

// Where a Google position sits on the ladder: page one takes the left
// half, pages two and three share the right, and anything past 30 sits
// at the end.
function ladderX(pos) {
  const p = Math.max(1, Math.min(30, pos));
  return p <= 10 ? ((p - 1) / 9) * 50 : 50 + ((p - 10) / 20) * 50;
}

function googleSection(d, ctx) {
  const { s, sp, tr } = ctx;
  let h = `<section class="sec sec--paper sec--yellow" id="google"><div class="wrap">
    ${band('P300', 'Google', d.search ? 'Source: Google Search Console' : '')}`;
  if (!d.search) {
    h += notice('Google search data is being connected', 'Search Console is being linked for your site. Your Google rankings and the searches people find you with will appear here soon.');
  } else if (d.search.empty) {
    h += notice('No Google searches recorded yet', 'Your site is connected to Google Search Console, but Google has not recorded any searches leading to it in this period. As the site builds authority, the searches people find you with will appear here.');
  } else {
    const where = s.position ? (s.position <= 10.5 ? 'page one, on average' : s.position <= 20.5 ? 'page two, on average' : 'beyond page two, on average') : '';
    h += figs([
      fig('Clicks from Google', fmtBig(s.clicks), noteHtml(tr.clicks || countTrend(s.clicks, sp.clicks)), { color: 'green' }),
      fig('Times shown on Google', fmtBig(s.impressions), noteHtml(tr.shown || countTrend(s.impressions, sp.impressions)), { color: 'cyan' }),
      fig('Click rate', fmtPct(s.ctr * 100), noteHtml(rateTrend(s.ctr, sp.ctr, Math.min(s.impressions || 0, sp.impressions || 0) / 4)), { color: 'yellow', help: 'of the people who saw you, how many clicked' }),
      fig('Average position', s.position ? s.position.toFixed(1) : 'n/a', placesHtml(s.position && sp.position ? sp.position - s.position : null), { color: 'text', help: where }),
    ], 'figs--sm');

    const targets = (d.search.targets || []).slice().sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9));
    if (targets.length) {
      h += `<div class="panel gap">
        <div class="panel-head"><h2 class="sub">Your key searches</h2>
          <div class="legend"><span class="key"><i style="background:var(--fg)"></i>Now</span><span class="key"><i style="background:transparent;border:1.5px solid var(--mut)"></i>Before</span></div></div>
        <div class="ladder">
          <div class="ladder-head">
            <span>Search</span>
            <span class="scale" aria-hidden="true"><span class="n" style="left:0">1</span><span class="n" style="left:50%">10</span><span class="n" style="left:75%">20</span><span class="n end" style="left:100%">30+</span>
              <span class="z1">Page one</span><span class="z2"><span class="hide-s">Page </span>two</span><span class="z3"><span class="hide-s">Page </span>three</span></span>
            <span>Position</span><span class="h-mv">Movement</span>
          </div>
          ${targets.map(t => {
            if (t.position == null) {
              return `<div class="rung"><div class="rung-kw">${esc(t.keyword)}</div>
                <div class="track"><span class="zone"></span><span class="tick" style="left:50%"></span><span class="tick" style="left:75%"></span></div>
                <div class="rung-pos none">Not showing yet</div>
                <div class="mv hide-s">${t.prevPosition != null ? 'Dropped out' : ''}</div></div>`;
            }
            const x = ladderX(t.position);
            const px = t.prevPosition != null ? ladderX(t.prevPosition) : null;
            // The "before" marker only earns its place when the move is
            // real and far enough along the track not to sit under the square.
            const moved = px != null && t.movement != null && Math.abs(t.movement) >= 0.75 && Math.abs(px - x) > 3.5;
            return `<div class="rung"><div class="rung-kw">${esc(t.keyword)}</div>
              <div class="track"><span class="zone"></span><span class="tick" style="left:50%"></span><span class="tick" style="left:75%"></span>
                ${moved ? `<span class="link" style="left:${Math.min(x, px).toFixed(1)}%;width:${Math.abs(px - x).toFixed(1)}%"></span><span class="ghost" style="left:${px.toFixed(1)}%"></span>` : ''}
                <span class="dot${t.position <= 10.5 ? ' p1' : ''}" style="left:${x.toFixed(1)}%"></span></div>
              <div class="rung-pos">${Math.max(1, Math.round(t.position))}<small>${t.position <= 10.5 ? 'page one' : t.position <= 20.5 ? 'page two' : 'page three+'}</small></div>
              ${t.movement == null ? `<div class="mv">${t.prevPosition == null ? 'New' : ''}</div>` : placesHtml(t.movement, 'mv')}</div>`;
          }).join('')}
        </div>
        <p class="caption">Where you sit on Google for the searches that matter most to the business. The shaded half is the first page of results. "Not showing yet" means Google did not show the site for that search in this period, which makes it a clear opportunity.</p>
      </div>`;
    }

    const queries = (d.search.topQueries || []).slice(0, 10);
    if (queries.length) {
      const mv = q => {
        if (q.positionChange == null) return `<span class="mv${q.prevPosition == null ? ' good' : ''}">${q.prevPosition == null ? 'New' : ''}</span>`;
        return placesHtml(q.positionChange, 'mv').replace(/^<div/, '<span').replace(/div>$/, 'span>');
      };
      h += `<div class="panel gap">
        <div class="panel-head"><h2 class="sub">Searches that brought people in</h2></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Search</th><th class="num">Clicks</th><th class="num hide-s">Times shown</th><th class="num">Position</th><th class="num">Movement</th></tr></thead>
          <tbody>${queries.map(q => `<tr>
            <td class="term">${esc(q.query)}</td>
            <td class="num" data-l="${Math.round(q.clicks) === 1 ? 'click' : 'clicks'}">${fmtInt(q.clicks)}</td>
            <td class="num hide-s">${fmtInt(q.impressions)}</td>
            <td class="num"><span class="show-s">Position </span>${q.position.toFixed(1)}${q.position <= 10.5 ? '<span class="pg1 hide-s">Page one</span>' : ''}</td>
            <td class="num">${mv(q)}</td></tr>`).join('')}
          </tbody></table></div>
        <p class="caption">Movement is places gained or lost on Google against ${esc(ctx.story?.period?.prev || 'the period before')}.</p>
      </div>`;
    }
  }
  return h + '</div></section>';
}

function behaviourSection(d) {
  const cl = d.clarity, pc = d.prevClarity;
  const sh = d.siteHealth && (d.siteHealth.performance != null || d.siteHealth.seo != null) ? d.siteHealth : null;
  const u = d.uptime;
  let h = `<section class="sec sec--white" id="health"><div class="wrap">
    ${band('P400', 'Behaviour and health', cl && cl.sessions > 0 ? 'Behaviour: Microsoft Clarity' : '')}`;

  if (!cl) {
    h += notice('Behaviour tracking is being connected', 'Soon you will see how far visitors scroll, what they click and where they get stuck.');
  } else if (!(cl.sessions > 0)) {
    h += notice('No visits recorded for behaviour yet', 'Behaviour tracking is connected, but it did not capture any visits in this period. Scroll depth and click figures will show here once it does.');
  } else {
    const humans = cl.humanSessions != null ? cl.humanSessions : cl.sessions;
    const prevHumans = pc ? (pc.humanSessions != null ? pc.humanSessions : pc.sessions) : null;
    const has = pc && pc.sessions > 0;
    h += figs([
      fig('Visits watched', fmtBig(humans), has ? noteHtml(countTrend(humans, prevHumans)) : '', { color: 'green', help: 'real people, robots left out' }),
      fig('How far people scroll', cl.avgScrollDepth != null ? fmtPct(cl.avgScrollDepth, 0) : 'n/a', has ? noteHtml(rateTrend(cl.avgScrollDepth, pc.avgScrollDepth, Math.min(humans || 0, prevHumans || 0))) : '', { color: 'cyan', help: 'of the page, on average' }),
      fig('Clicks that did nothing', fmtBig(cl.deadClicks), has ? noteHtml(countTrend(cl.deadClicks, pc.deadClicks), { goodDown: true }) : '', { color: 'yellow', help: 'taps on things that are not links' }),
      fig('Frustrated clicks', fmtBig(cl.rageClicks), has ? noteHtml(countTrend(cl.rageClicks, pc.rageClicks), { goodDown: true }) : '', { color: 'white', help: 'rapid repeat clicking; low is good' }),
    ], 'figs--sm');
    h += `<p class="caption">Based on ${esc(cl.daysCovered)} day${cl.daysCovered === 1 ? '' : 's'} of recordings in this period${cl.quickBacks ? `. ${fmtInt(cl.quickBacks)} visitor${cl.quickBacks === 1 ? '' : 's'} left a page straight after arriving` : ''}.</p>`;
  }

  let panels = '';
  if (sh) {
    const meter = (label, v) => {
      if (v == null) return '';
      const on = Math.max(0, Math.min(20, Math.round(v / 5)));
      const grade = v >= 90 ? 'Excellent' : v >= 50 ? 'Room to improve' : 'Needs work';
      return `<div class="meter-row">
        <div class="meter-label">${esc(label)}<span class="${v >= 90 ? 'good' : ''}">${grade}</span></div>
        <div class="meter-score">${esc(v)}<small>/100</small></div>
        <div class="meter${v >= 90 ? '' : ' mid'}" role="img" aria-label="${esc(v)} out of 100">${Array.from({ length: 20 }, (_, i) => `<i${i < on ? ' class="on"' : ''}></i>`).join('')}</div>
      </div>`;
    };
    panels += `<div class="panel">
      <div class="panel-head"><h2 class="sub">Site health</h2></div>
      <div class="meters">${meter('Speed on a phone', sh.performance)}${meter('Easy for Google to read', sh.seo)}${meter('Built to best practice', sh.bestPractices)}</div>
      <p class="caption">Scored out of 100 by Google's own test, run as a phone. 90 or more is excellent.</p>
    </div>`;
  }
  if (u) {
    const down = Number(u.outages) > 0;
    const grade = u.uptimePct >= 99.9 ? 'Excellent' : u.uptimePct >= 99 ? 'Good' : 'Needs attention';
    panels += `<div class="panel">
      <div class="panel-head"><h2 class="sub">Website availability</h2></div>
      <div class="trio">
        <div class="fig" style="--c:var(--green)"><div class="fig-label">Uptime</div><div class="fig-value">${esc(u.uptimePct)}%</div><div class="fig-note${u.uptimePct >= 99.9 ? ' good' : ''}">${grade}</div></div>
        <div class="fig" style="--c:var(--cyan)"><div class="fig-label">Time offline</div><div class="fig-value">${esc(u.downtimeShort)}</div><div class="fig-note${down ? ' fault' : ' good'}">${down ? 'In this period' : 'All clear'}</div></div>
        <div class="fig" style="--c:var(--yellow)"><div class="fig-label">Outages</div><div class="fig-value">${esc(u.outages)}</div><div class="fig-note${down ? ' fault' : ' good'}">${down ? 'Confirmed' : 'No interruptions'}</div></div>
      </div>
      <p class="caption">Your homepage is checked every 5 minutes, day and night${u.measuredFrom ? ` (measured from ${esc(new Date(u.measuredFrom).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }))})` : ''}.</p>
    </div>`;
  }
  if (panels) h += `<div class="${sh && u ? 'cols' : 'stack'} gap-lg" style="${sh && u ? 'grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))' : ''}">${panels}</div>`;
  return h + '</div></section>';
}

function render(d) {
  // A visitor counter that is proven to be under-counting (Search Console
  // saw far more clicks than it saw visits) never has its numbers shown;
  // the page leads on the search and behaviour figures, which are right.
  const gaBad = Boolean(d.ga4?.unreliable);
  const ctx = {
    gaBad,
    o: gaBad ? null : (d.ga4?.overview || null),
    p: d.ga4?.prevOverview || {},
    s: d.search && !d.search.empty ? d.search.summary : null,
    sp: d.search?.prevSummary || {},
    story: d.story || null,
    tr: d.story?.trends || {},
  };

  $('#clientName').textContent = d.clientName || 'Your website';
  document.title = `${d.clientName || 'Your website'} | Website dashboard`;
  const dom = $('#clientDomain');
  if (d.domain) { dom.textContent = d.domain; dom.href = `https://${d.domain}`; dom.hidden = false; } else dom.hidden = true;

  destroyCharts();
  $('#app').innerHTML = heroSection(d, ctx) + storySection(d, ctx) + visitorsSection(d, ctx) + googleSection(d, ctx) + behaviourSection(d);
  hasRendered = true;

  if ($('#historyChart')) drawHistory(d.history.months, !gaBad);
  if ($('#trafficChart')) drawTraffic(d.ga4.timeseries);
  // The charts take their label font from the page; redraw once the
  // brand fonts have arrived so the labels are not left in a fallback.
  if (document.fonts?.ready) document.fonts.ready.then(() => Object.values(charts).forEach(c => c.update('none')));
}

// ---------- charts ----------

function destroyCharts() {
  for (const k of Object.keys(charts)) { charts[k].destroy(); delete charts[k]; }
}

const MONO = "'Martian Mono', ui-monospace, Menlo, Consolas, monospace";
function chartBase() {
  const tick = { color: '#A6ABB1', font: { family: MONO, size: 10 } };
  return {
    responsive: true, maintainAspectRatio: false,
    animation: reducedMotion ? false : { duration: 500 },
    // Only the first draw animates. A chart that is resized, or re-attached
    // after its box briefly had no size, snaps straight to its new shape.
    transitions: { resize: { animation: { duration: 0 } }, attach: { animation: { duration: 0 } } },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#F1EEE7', titleColor: '#0F1012', bodyColor: '#0F1012', cornerRadius: 2, padding: 10,
        titleFont: { family: MONO, size: 10, weight: '500' }, bodyFont: { family: MONO, size: 11 },
        boxWidth: 8, boxHeight: 8, boxPadding: 5, usePointStyle: false,
      },
    },
    scales: {
      x: { grid: { display: false }, border: { color: 'rgba(255,255,255,.15)' }, ticks: { ...tick, maxRotation: 0, autoSkipPadding: 14 } },
      y: { beginAtZero: true, border: { display: false }, grid: { color: 'rgba(255,255,255,.07)' }, ticks: { ...tick, precision: 0, maxTicksLimit: 6 } },
    },
  };
}

// Diagonal stripes for a month that is not over yet.
function stripes(ctx) {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const g = c.getContext('2d');
  g.strokeStyle = '#4DB88C'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-2, 10); g.lineTo(10, -2); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(6, 10); g.lineTo(10, 6); g.stroke();
  return ctx.createPattern(c, 'repeat');
}

function drawHistory(months, visitsTrusted = true) {
  if (typeof Chart === 'undefined') return;
  const ctx = $('#historyChart').getContext('2d');
  const hasVisits = visitsTrusted && months.some(m => m.visits != null);
  const hasClicks = months.some(m => m.clicks != null);
  const barField = hasVisits ? 'visits' : 'clicks';
  const pattern = stripes(ctx);
  const datasets = [{
    type: 'bar', label: hasVisits ? 'Visits' : 'Clicks from Google', order: 2,
    data: months.map(m => m[barField]),
    backgroundColor: months.map(m => (m.partial ? pattern : '#4DB88C')),
    borderColor: '#4DB88C', borderWidth: months.map(m => (m.partial ? 1 : 0)),
    maxBarThickness: 64, categoryPercentage: 0.72, barPercentage: 0.9,
  }];
  if (hasVisits && hasClicks) {
    datasets.push({
      type: 'line', label: 'Clicks from Google', order: 1,
      data: months.map(m => m.clicks),
      borderColor: '#58C3DA', backgroundColor: '#58C3DA', borderWidth: 2, tension: 0,
      pointStyle: 'rect', pointRadius: 4, pointHoverRadius: 6, spanGaps: false,
      segment: { borderDash: c => (months[c.p1DataIndex]?.partial ? [4, 4] : undefined) },
    });
  }
  const opts = chartBase();
  opts.plugins.tooltip.callbacks = {
    title: items => { const m = months[items[0].dataIndex]; return m.partial ? `${m.label} so far` : m.label; },
    label: item => ` ${item.dataset.label}: ${fmtInt(item.parsed.y)}`,
  };
  charts.history = new Chart(ctx, {
    data: { labels: months.map(m => (m.partial ? [m.label, 'so far'] : m.label)), datasets },
    options: opts,
  });
}

// One point for every day from the first recorded day to the last. A
// source that leaves quiet days out would otherwise close the gaps up
// and bend the shape of the line; a day with nothing recorded is a zero.
function fillDays(points) {
  const sorted = points.filter(pt => /^\d{4}-\d{2}-\d{2}$/.test(pt.date)).sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return sorted;
  const by = new Map(sorted.map(pt => [pt.date, pt.sessions]));
  const out = [];
  const end = Date.parse(sorted[sorted.length - 1].date + 'T12:00:00Z');
  for (let t = Date.parse(sorted[0].date + 'T12:00:00Z'), guard = 0; t <= end && guard < 400; t += 86400000, guard++) {
    const date = new Date(t).toISOString().slice(0, 10);
    out.push({ date, sessions: by.get(date) || 0 });
  }
  return out;
}

function drawTraffic(rawPoints) {
  if (typeof Chart === 'undefined') return;
  const points = fillDays(rawPoints);
  const ctx = $('#trafficChart').getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 300);
  grad.addColorStop(0, 'rgba(77,184,140,.30)');
  grad.addColorStop(1, 'rgba(77,184,140,0)');
  const opts = chartBase();
  opts.scales.x.ticks.maxTicksLimit = window.innerWidth < 640 ? 5 : 10;
  opts.plugins.tooltip.callbacks = { label: item => ` Visits: ${fmtInt(item.parsed.y)}` };
  charts.traffic = new Chart(ctx, {
    type: 'line',
    data: {
      labels: points.map(pt => fmtDay(pt.date)),
      datasets: [{
        label: 'Visits', data: points.map(pt => pt.sessions),
        borderColor: '#4DB88C', backgroundColor: grad, fill: true, borderWidth: 2, cubicInterpolationMode: 'monotone',
        pointStyle: 'rect', pointRadius: points.length > 35 ? 0 : 2.5, pointHoverRadius: 5, pointBackgroundColor: '#4DB88C',
      }],
    },
    options: opts,
  });
}

// ---------- loading ----------

async function load() {
  // Tapping two periods quickly starts two requests; only the latest one
  // may draw, or the page could settle on the period that was not asked for.
  const seq = ++loadSeq;
  const app = $('#app');
  if (hasRendered) {
    // Changing the period keeps the page in place and dims it, so the
    // screen does not jump back to a blank loader.
    app.classList.add('is-loading');
    $('#progress').hidden = false;
  } else {
    app.innerHTML = '<div class="loading"><div class="blocks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>Fetching your latest numbers</div>';
  }
  document.querySelectorAll('#rangeSwitch button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.range) === currentRange)));

  // A flaky mobile connection or a server restart mid-request should not
  // leave the loader running forever: time each attempt out, retry once,
  // then show a friendly retry button.
  const fetchOnce = async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try { return await fetch(`/api/client/${token}/data?range=${currentRange}`, { signal: ctrl.signal }); }
    finally { clearTimeout(timer); }
  };
  const done = () => { app.classList.remove('is-loading'); $('#progress').hidden = true; };
  let res;
  try {
    res = await fetchOnce();
    if (!res.ok) throw new Error('bad status');
  } catch {
    try { res = await fetchOnce(); if (!res.ok) throw new Error('bad status'); }
    catch {
      if (seq !== loadSeq) return;
      done();
      destroyCharts();
      hasRendered = false;
      app.innerHTML = `<div class="failed"><h2>That did not load</h2>
        <p>Your connection may have dropped. Please try again.</p>
        <button type="button" class="btn" id="retryBtn">Try again</button></div>`;
      const rb = $('#retryBtn'); if (rb) rb.onclick = load;
      return;
    }
  }
  const data = await res.json();
  if (seq !== loadSeq) return;
  done();
  render(data);
}

document.querySelectorAll('#rangeSwitch button').forEach(b => {
  b.onclick = () => {
    const r = Number(b.dataset.range);
    if (r === currentRange && hasRendered) return;
    currentRange = r;
    load();
  };
});

$('#requestReportBtn').onclick = async () => {
  const btn = $('#requestReportBtn'), label = $('#requestReportLabel');
  btn.disabled = true; label.textContent = 'Preparing your report\u2026';
  // The server builds and emails the report inside this request, which
  // can take a few minutes. A dropped connection or gateway timeout does
  // not mean it failed, so say so and hold the button for a minute.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 150000);
  const stillGoing = () => { toast('Your report is being prepared and will arrive by email shortly.', 'ok', 8000); return 60000; };
  let holdMs = 0;
  const started = Date.now();
  try {
    const res = await fetch(`/api/client/${token}/request-report`, { method: 'POST', signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (res.ok) toast(data.message || 'Report sent. Check your inbox!', 'ok', 8000);
    // A gateway timeout after a long wait means the server is still working;
    // a fast 502 means the app was not reachable and nothing was started.
    else if ((res.status === 502 || res.status === 504) && Date.now() - started > 20000) holdMs = stillGoing();
    else if (res.status === 409) { toast(data.error || 'Your report is already being prepared. Give it a minute and check your inbox.', 'ok', 8000); holdMs = 60000; }
    else toast(data.error || 'Could not send the report just now.', 'err', 8000);
  } catch (err) {
    if (err && err.name === 'AbortError') holdMs = stillGoing();
    else toast('Could not send the report just now.', 'err');
  } finally { clearTimeout(timer); }
  setTimeout(() => { btn.disabled = false; label.textContent = 'Email me a fresh report'; }, holdMs);
};

load();
