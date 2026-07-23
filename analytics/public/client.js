// North Bear Pulse — client-facing live dashboard
const token = location.pathname.split('/').pop();
let currentRange = 30;
let chart = null;

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('en-GB');
const fmtInt = n => nf.format(Math.round(n || 0));
const fmtPct = (p, dp = 1) => `${(p || 0).toFixed(dp)}%`;
function fmtDur(seconds) {
  const s = Math.round(seconds || 0), m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
function pctChange(cur, prev) {
  if (prev == null || cur == null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

function toast(msg, type = 'ok', ms = 6000) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.className = '', ms);
}

function deltaHtml(pct, invert = false) {
  if (pct == null || !isFinite(pct)) return '<div class="delta flat">—</div>';
  const good = invert ? pct <= 0 : pct >= 0;
  const cls = pct === 0 ? 'flat' : good ? 'up' : 'down';
  const arrow = pct >= 0 ? '▲' : '▼';
  return `<div class="delta ${cls}">${arrow} ${Math.abs(pct).toFixed(1)}% <span class="vs">vs previous</span></div>`;
}

// Rank movement in plain English ("up 2.3 places") — a % of a ranking
// position means nothing to a business owner.
function moveHtml(places) {
  if (places == null || !isFinite(places)) return '<div class="delta flat">—</div>';
  if (Math.abs(places) < 0.05) return '<div class="delta flat">no change <span class="vs">vs previous</span></div>';
  const up = places > 0; // positive = climbed the rankings
  return `<div class="delta ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${up ? 'up' : 'down'} ${Math.abs(places).toFixed(1)} places <span class="vs">vs previous</span></div>`;
}

function kpi(label, value, delta, invert = false) {
  return `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div>${deltaHtml(delta, invert)}</div>`;
}

function section(title, hint = '') {
  return `<div class="section-head"><h2>${title}</h2><div class="accent"></div>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
}

const FRIENDLY_CHANNEL = {
  'Organic Search': 'Google search', 'Direct': 'Direct visits', 'Organic Social': 'Social media',
  'Paid Social': 'Social media ads', 'Paid Search': 'Google ads', 'Referral': 'Other websites',
  'Email': 'Email', 'Unassigned': 'Other',
};

function render(d) {
  // Traffic tag under-counting (proven wrong by Search Console/Clarity) →
  // don't render its numbers; lead with the true search + behaviour story.
  const gaBad = Boolean(d.ga4?.unreliable);
  const o = gaBad ? null : d.ga4?.overview, p = d.ga4?.prevOverview || {};
  const s = d.search?.summary, sp = d.search?.prevSummary || {};
  let html = `
    <div class="client-hero">
      <div class="who">
        <h1>${esc(d.clientName)}</h1>
        ${d.domain ? `<a href="https://${esc(d.domain)}" target="_blank" rel="noopener">${esc(d.domain)}</a>` : ''}
      </div>
      <div class="range-switch">
        ${[7, 30, 90].map(r => `<button data-range="${r}" class="${r === currentRange ? 'active' : ''}">Last ${r} days</button>`).join('')}
      </div>
    </div>`;

  if (o) {
    const delta = pctChange(o.sessions, p.sessions);
    const firstDay = d.ga4.timeseries?.[0]?.date;
    const daysIn = firstDay && d.period?.start && firstDay > d.period.start
      ? Math.round((Date.parse(firstDay) - Date.parse(d.period.start)) / 86400000) : 0;
    const freshNote = daysIn >= 5
      ? ` <span class="hint">(Visitor tracking was installed on ${new Date(firstDay + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, so traffic numbers only cover from that date.)</span>` : '';
    html += `<div class="plain-english"><span class="tag">IN PLAIN ENGLISH</span>
      Your website was visited <strong>${fmtInt(o.sessions)}</strong> times by <strong>${fmtInt(o.totalUsers)}</strong> people in the last ${d.rangeDays} days${delta != null && isFinite(delta) ? ` — <strong>${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(1)}%</strong> on the period before` : ''}.${s && s.impressions > 0 ? ` It showed up in Google searches <strong>${fmtInt(s.impressions)}</strong> times.` : ''}${freshNote}
    </div>`;

    html += section('At a glance');
    const thirdKpi = o.newUsers != null
      ? kpi('New visitors', fmtInt(o.newUsers), pctChange(o.newUsers, p.newUsers))
      : kpi('Pages per visit', (o.sessions ? o.screenPageViews / o.sessions : 0).toFixed(1), pctChange(o.sessions ? o.screenPageViews / o.sessions : 0, p.sessions ? p.screenPageViews / p.sessions : null));
    html += `<div class="kpi-grid">
      ${kpi('Visits', fmtInt(o.sessions), pctChange(o.sessions, p.sessions))}
      ${kpi('Visitors', fmtInt(o.totalUsers), pctChange(o.totalUsers, p.totalUsers))}
      ${kpi('Page views', fmtInt(o.screenPageViews), pctChange(o.screenPageViews, p.screenPageViews))}
      ${thirdKpi}
      ${kpi('Engagement rate', fmtPct(o.engagementRate * 100), pctChange(o.engagementRate, p.engagementRate))}
      ${kpi('Avg. visit length', fmtDur(o.averageSessionDuration), pctChange(o.averageSessionDuration, p.averageSessionDuration))}
    </div>`;
    if (d.ga4.sourceLabel) html += `<div class="hint" style="margin-top:6px">Source: ${esc(d.ga4.sourceLabel)}</div>`;
  } else if (gaBad) {
    html += `<div class="panel"><h2>Visitor tracking is being reconnected</h2>
      <p class="hint">The visitor-count tag is being reinstalled on your site, so the visit total isn't complete yet — but your Google search performance and behaviour insights below are fully live and accurate${s && s.impressions > 0 ? `. Google showed your site <strong>${fmtInt(s.impressions)}</strong> times this period` : ''}.</p></div>`;
  } else {
    html += `<div class="panel"><h2>Analytics warming up</h2>
      <p class="hint">Google Analytics isn't connected for your site yet — North Bear Media is on it. Your visits and visitors will appear here soon.</p></div>`;
  }

  if (!gaBad && d.ga4?.timeseries?.length > 1) {
    html += section('Daily visits');
    html += `<div class="panel"><div class="chart-wrap"><canvas id="trafficChart"></canvas></div></div>`;
  }

  if (!gaBad && (d.ga4?.channels?.length || d.ga4?.devices?.length)) {
    html += section('Where your visits came from');
    html += `<div class="two-col">`;
    if (d.ga4.channels?.length) {
      const max = Math.max(...d.ga4.channels.map(c => c.sessions), 1);
      html += `<div class="panel">${d.ga4.channels.slice(0, 7).map(c => `
        <div class="bar-row">
          <div class="bar-label">${esc(FRIENDLY_CHANNEL[c.channel] || c.channel)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.max((c.sessions / max) * 100, 1.5)}%"></div></div>
          <div class="bar-value">${fmtInt(c.sessions)}</div>
        </div>`).join('')}</div>`;
    }
    if (d.ga4.devices?.length) {
      const total = d.ga4.devices.reduce((a, x) => a + x.sessions, 0) || 1;
      html += `<div class="panel"><h2 style="margin-bottom:12px">By device</h2>${d.ga4.devices.map(x => `
        <div class="bar-row">
          <div class="bar-label">${esc(x.device[0].toUpperCase() + x.device.slice(1))}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${(x.sessions / total) * 100}%"></div></div>
          <div class="bar-value">${((x.sessions / total) * 100).toFixed(0)}%</div>
        </div>`).join('')}</div>`;
    }
    html += `</div>`;
  }

  if (s && d.search.empty) {
    html += section('Google search performance', 'Average position = where you rank in Google. 1–10 is page one.');
    html += `<div class="panel"><p class="hint">Your site is connected to Google Search Console, but Google hasn't recorded any searches leading to it in this period yet. As your site builds authority, the terms people find you with will appear here.</p></div>`;
  } else if (s) {
    html += section('Google search performance', 'Average position = where you rank in Google. 1–10 is page one.');
    const posMove = (s.position && sp.position) ? sp.position - s.position : null;
    html += `<div class="kpi-grid">
      ${kpi('Clicks from Google', fmtInt(s.clicks), pctChange(s.clicks, sp.clicks))}
      ${kpi('Times shown', fmtInt(s.impressions), pctChange(s.impressions, sp.impressions))}
      ${kpi('Click-through rate', fmtPct(s.ctr * 100), pctChange(s.ctr, sp.ctr))}
      <div class="kpi"><div class="label">Avg. position</div><div class="value">${s.position ? s.position.toFixed(1) : '—'}</div>${moveHtml(posMove)}</div>
    </div>`;
    if (d.search.topQueries?.length) {
      const moveCell = q => {
        if (q.positionChange == null) return q.prevPosition == null ? '<span class="delta up" style="display:inline">new</span>' : '<span class="delta flat" style="display:inline">—</span>';
        if (Math.abs(q.positionChange) < 0.05) return '<span class="delta flat" style="display:inline">no change</span>';
        const up = q.positionChange > 0;
        return `<span class="delta ${up ? 'up' : 'down'}" style="display:inline">${up ? '▲ up' : '▼ down'} ${Math.abs(q.positionChange).toFixed(1)}</span>`;
      };
      html += `<div class="panel" style="margin-top:16px">
        <h2 style="margin-bottom:10px">Top search terms people found you with</h2>
        <table class="data">
          <thead><tr><th>Search term</th><th class="num">Clicks</th><th class="num">Times shown</th><th class="num">Position</th><th class="num">Movement</th></tr></thead>
          <tbody>${d.search.topQueries.slice(0, 10).map(q => `
            <tr><td class="trunc" title="${esc(q.query)}"><strong>${esc(q.query)}</strong></td>
            <td class="num">${fmtInt(q.clicks)}</td><td class="num">${fmtInt(q.impressions)}</td>
            <td class="num">${q.position.toFixed(1)}${q.position <= 10 ? ' <span class="hint">pg 1</span>' : ''}</td>
            <td class="num">${moveCell(q)}</td></tr>`).join('')}
          </tbody></table>
        <div class="hint" style="margin-top:8px">"Movement" is places gained or lost on Google vs the previous period · "pg 1" means the first page of results.</div>
      </div>`;
    }
    if (d.search.targets?.length) {
      const tMove = t => {
        if (t.position == null) return t.prevPosition != null ? '<span class="delta down" style="display:inline">dropped off</span>' : '<span class="delta flat" style="display:inline">—</span>';
        if (t.movement == null) return t.prevPosition == null ? '<span class="delta up" style="display:inline">new</span>' : '<span class="delta flat" style="display:inline">—</span>';
        if (Math.abs(t.movement) < 0.05) return '<span class="delta flat" style="display:inline">no change</span>';
        const up = t.movement > 0;
        return `<span class="delta ${up ? 'up' : 'down'}" style="display:inline">${up ? '▲ up' : '▼ down'} ${Math.abs(t.movement).toFixed(1)}</span>`;
      };
      html += `<div class="panel" style="margin-top:16px">
        <h2 style="margin-bottom:10px">Where you rank for your target searches</h2>
        <table class="data">
          <thead><tr><th>Target search</th><th class="num">Position</th><th class="num">Times shown</th><th class="num">Movement</th></tr></thead>
          <tbody>${d.search.targets.map(t => `
            <tr><td class="trunc" title="${esc(t.keyword)}"><strong>${esc(t.keyword)}</strong></td>
            <td class="num">${t.position != null ? t.position.toFixed(1) + (t.position <= 10 ? ' <span class="hint">pg 1</span>' : '') : '<span class="hint">not appearing yet</span>'}</td>
            <td class="num">${fmtInt(t.impressions)}</td>
            <td class="num">${tMove(t)}</td></tr>`).join('')}
          </tbody></table>
        <div class="hint" style="margin-top:8px">"Not appearing yet" means Google didn't show the site for that search this period — a clear opportunity to build content around it.</div>
      </div>`;
    }
  } else {
    html += section('Google search performance');
    html += `<div class="panel"><p class="hint">Google Search Console is being connected for your site — your Google rankings and search clicks will appear here soon.</p></div>`;
  }

  if (!gaBad && d.ga4?.topPages?.length) {
    html += section('Most viewed pages');
    html += `<div class="panel"><table class="data">
      <thead><tr><th>Page</th><th class="num">Views</th><th class="num">Visits</th></tr></thead>
      <tbody>${d.ga4.topPages.slice(0, 8).map(pg => `
        <tr><td class="trunc" title="${esc(pg.path)}"><strong>${esc(pg.title && pg.title !== '(not set)' ? pg.title : pg.path)}</strong> <span class="hint">${esc(pg.path)}</span></td>
        <td class="num">${fmtInt(pg.views)}</td><td class="num">${fmtInt(pg.sessions)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  if (d.clarity) {
    const cl = d.clarity, pc = d.prevClarity;
    const humans = cl.humanSessions != null ? cl.humanSessions : cl.sessions;
    const prevHumans = pc ? (pc.humanSessions != null ? pc.humanSessions : pc.sessions) : null;
    html += section('How people use your site', 'Measured by Microsoft Clarity — low frustration numbers are good.');
    html += `<div class="kpi-grid">
      <div class="kpi"><div class="label">Sessions analysed</div><div class="value">${fmtInt(humans)}</div>${pc ? deltaHtml(pctChange(humans, prevHumans)) : '<div class="delta flat">real people, bots excluded</div>'}</div>
      <div class="kpi"><div class="label">Avg. scroll depth</div><div class="value">${cl.avgScrollDepth != null ? fmtPct(cl.avgScrollDepth, 0) : '—'}</div>${pc ? deltaHtml(pctChange(cl.avgScrollDepth, pc.avgScrollDepth)) : '<div class="delta flat">how far people scroll</div>'}</div>
      <div class="kpi"><div class="label">Dead clicks</div><div class="value">${fmtInt(cl.deadClicks)}</div>${pc ? deltaHtml(pctChange(cl.deadClicks, pc.deadClicks), true) : '<div class="delta flat">clicks that did nothing</div>'}</div>
      <div class="kpi"><div class="label">Rage clicks</div><div class="value">${fmtInt(cl.rageClicks)}</div>${pc ? deltaHtml(pctChange(cl.rageClicks, pc.rageClicks), true) : '<div class="delta flat">frustrated clicking</div>'}</div>
    </div>
    <div class="hint" style="margin-top:6px">Based on ${cl.daysCovered} day${cl.daysCovered === 1 ? '' : 's'} of Clarity measurement in this period${cl.quickBacks ? ` · ${fmtInt(cl.quickBacks)} quick-backs (visitors who left a page straight away)` : ''}.</div>`;
  } else {
    html += section('How people use your site');
    html += `<div class="panel"><p class="hint">Microsoft Clarity is being connected for your site — you'll soon see how visitors scroll, click and where they get stuck.</p></div>`;
  }

  if (d.siteHealth && (d.siteHealth.performance != null || d.siteHealth.seo != null)) {
    const sh = d.siteHealth;
    const grade = v => v == null ? '—' : v >= 90 ? 'excellent' : v >= 50 ? 'room to improve' : 'needs attention';
    html += section('Site health check', 'Scored out of 100 by Google PageSpeed (mobile). 90+ is excellent.');
    html += `<div class="kpi-grid">
      <div class="kpi"><div class="label">Speed score</div><div class="value">${sh.performance ?? '—'}</div><div class="delta flat">${grade(sh.performance)}</div></div>
      <div class="kpi"><div class="label">Google-friendliness (SEO)</div><div class="value">${sh.seo ?? '—'}</div><div class="delta flat">${grade(sh.seo)}</div></div>
      <div class="kpi"><div class="label">Built to best practice</div><div class="value">${sh.bestPractices ?? '—'}</div><div class="delta flat">${grade(sh.bestPractices)}</div></div>
    </div>`;
  }

  if (d.insights?.recommendations?.length) {
    html += section('What this means & what to do next');
    html += `<div class="panel">`;
    if (d.insights.headline) html += `<p style="font-size:15px;margin-bottom:14px">${esc(d.insights.headline)}</p>`;
    html += d.insights.recommendations.map(r => `
      <div style="display:flex;gap:10px;margin-bottom:12px">
        <div style="color:var(--green-light);font-weight:700">▸</div>
        <div><strong>${esc(r.title)}</strong><br><span style="color:var(--text-secondary)">${esc(r.detail)}</span></div>
      </div>`).join('');
    html += `</div>`;
  }

  $('#app').innerHTML = html;

  document.querySelectorAll('.range-switch button').forEach(b => {
    b.onclick = () => { currentRange = Number(b.dataset.range); load(); };
  });

  if (!gaBad && d.ga4?.timeseries?.length > 1) drawChart(d.ga4.timeseries);
}

function drawChart(points) {
  const ctx = $('#trafficChart').getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 260);
  grad.addColorStop(0, 'rgba(46,170,123,0.35)');
  grad.addColorStop(1, 'rgba(46,170,123,0)');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: points.map(pt => new Date(pt.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })),
      datasets: [{
        label: 'Visits', data: points.map(pt => pt.sessions),
        borderColor: '#2EAA7B', backgroundColor: grad, fill: true,
        borderWidth: 2, pointRadius: points.length > 35 ? 0 : 2.5, pointBackgroundColor: '#3CC98F', tension: 0.35,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#6b6f82', maxTicksLimit: 10, font: { size: 11 } } },
        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#6b6f82', precision: 0, font: { size: 11 } } },
      },
    },
  });
}

async function load() {
  $('#app').innerHTML = `<div class="loading-overlay"><div class="spinner"></div>Fetching your latest numbers…</div>`;
  // A flaky mobile connection or a server restart mid-request shouldn't
  // leave the spinner turning forever: time each attempt out, retry once,
  // then show a friendly retry button.
  const fetchOnce = async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try { return await fetch(`/api/client/${token}/data?range=${currentRange}`, { signal: ctrl.signal }); }
    finally { clearTimeout(timer); }
  };
  let res;
  try {
    res = await fetchOnce();
    if (!res.ok) throw new Error('bad status');
  } catch {
    try { res = await fetchOnce(); if (!res.ok) throw new Error('bad status'); }
    catch {
      $('#app').innerHTML = `<div class="panel" style="text-align:center"><h2>Hmm, that didn't load</h2>
        <p class="hint" style="margin:8px 0 16px">Your connection may have dropped. Please try again.</p>
        <button class="btn primary" id="retryBtn">Try again</button></div>`;
      const rb = $('#retryBtn'); if (rb) rb.onclick = load;
      return;
    }
  }
  render(await res.json());
}

$('#requestReportBtn').onclick = async (e) => {
  const btn = e.target;
  btn.disabled = true; btn.textContent = 'Preparing your report…';
  try {
    const res = await fetch(`/api/client/${token}/request-report`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) toast(data.message || 'Report sent — check your inbox!', 'ok', 8000);
    else toast(data.error || 'Could not send the report just now.', 'err', 8000);
  } catch { toast('Could not send the report just now.', 'err'); }
  btn.disabled = false; btn.textContent = '✉ Email me a fresh report';
};

load();
