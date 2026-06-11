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
  const o = d.ga4?.overview, p = d.ga4?.prevOverview || {};
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
    html += `<div class="plain-english"><span class="tag">IN PLAIN ENGLISH</span>
      Your website was visited <strong>${fmtInt(o.sessions)}</strong> times by <strong>${fmtInt(o.totalUsers)}</strong> people in the last ${d.rangeDays} days${delta != null && isFinite(delta) ? ` — <strong>${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(1)}%</strong> on the period before` : ''}.${s && s.impressions > 0 ? ` It showed up in Google searches <strong>${fmtInt(s.impressions)}</strong> times.` : ''}
    </div>`;

    html += section('At a glance');
    html += `<div class="kpi-grid">
      ${kpi('Visits', fmtInt(o.sessions), pctChange(o.sessions, p.sessions))}
      ${kpi('Visitors', fmtInt(o.totalUsers), pctChange(o.totalUsers, p.totalUsers))}
      ${kpi('Page views', fmtInt(o.screenPageViews), pctChange(o.screenPageViews, p.screenPageViews))}
      ${kpi('New visitors', fmtInt(o.newUsers), pctChange(o.newUsers, p.newUsers))}
      ${kpi('Engagement rate', fmtPct(o.engagementRate * 100), pctChange(o.engagementRate, p.engagementRate))}
      ${kpi('Avg. visit length', fmtDur(o.averageSessionDuration), pctChange(o.averageSessionDuration, p.averageSessionDuration))}
    </div>`;
  } else {
    html += `<div class="panel"><h2>Analytics warming up</h2>
      <p class="hint">Google Analytics isn't connected for your site yet — North Bear Media is on it. Your visits and visitors will appear here soon.</p></div>`;
  }

  if (d.ga4?.timeseries?.length > 1) {
    html += section('Daily visits');
    html += `<div class="panel"><div class="chart-wrap"><canvas id="trafficChart"></canvas></div></div>`;
  }

  if (d.ga4?.channels?.length || d.ga4?.devices?.length) {
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

  if (s) {
    html += section('Google search performance', 'Average position = where you rank in Google. 1–10 is page one.');
    html += `<div class="kpi-grid">
      ${kpi('Clicks from Google', fmtInt(s.clicks), pctChange(s.clicks, sp.clicks))}
      ${kpi('Times shown', fmtInt(s.impressions), pctChange(s.impressions, sp.impressions))}
      ${kpi('Click-through rate', fmtPct(s.ctr * 100), pctChange(s.ctr, sp.ctr))}
      ${kpi('Avg. position', s.position ? s.position.toFixed(1) : '—', pctChange(s.position, sp.position), true)}
    </div>`;
    if (d.search.topQueries?.length) {
      html += `<div class="panel" style="margin-top:16px">
        <h2 style="margin-bottom:10px">Top search terms people found you with</h2>
        <table class="data">
          <thead><tr><th>Search term</th><th class="num">Clicks</th><th class="num">Times shown</th><th class="num">Position</th></tr></thead>
          <tbody>${d.search.topQueries.slice(0, 10).map(q => `
            <tr><td class="trunc" title="${esc(q.query)}"><strong>${esc(q.query)}</strong></td>
            <td class="num">${fmtInt(q.clicks)}</td><td class="num">${fmtInt(q.impressions)}</td><td class="num">${q.position.toFixed(1)}</td></tr>`).join('')}
          </tbody></table>
      </div>`;
    }
  }

  if (d.ga4?.topPages?.length) {
    html += section('Most viewed pages');
    html += `<div class="panel"><table class="data">
      <thead><tr><th>Page</th><th class="num">Views</th><th class="num">Visits</th></tr></thead>
      <tbody>${d.ga4.topPages.slice(0, 8).map(pg => `
        <tr><td class="trunc" title="${esc(pg.path)}"><strong>${esc(pg.title && pg.title !== '(not set)' ? pg.title : pg.path)}</strong> <span class="hint">${esc(pg.path)}</span></td>
        <td class="num">${fmtInt(pg.views)}</td><td class="num">${fmtInt(pg.sessions)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  if (d.clarity) {
    const cl = d.clarity;
    html += section('How people use your site', 'Measured by Microsoft Clarity — low frustration numbers are good.');
    html += `<div class="kpi-grid">
      <div class="kpi"><div class="label">Sessions analysed</div><div class="value">${fmtInt(cl.sessions)}</div><div class="delta flat">over ${cl.daysCovered} day${cl.daysCovered === 1 ? '' : 's'}</div></div>
      <div class="kpi"><div class="label">Avg. scroll depth</div><div class="value">${cl.avgScrollDepth != null ? fmtPct(cl.avgScrollDepth, 0) : '—'}</div><div class="delta flat">how far people scroll</div></div>
      <div class="kpi"><div class="label">Dead clicks</div><div class="value">${fmtInt(cl.deadClicks)}</div><div class="delta flat">clicks that did nothing</div></div>
      <div class="kpi"><div class="label">Rage clicks</div><div class="value">${fmtInt(cl.rageClicks)}</div><div class="delta flat">frustrated clicking</div></div>
    </div>`;
  }

  $('#app').innerHTML = html;

  document.querySelectorAll('.range-switch button').forEach(b => {
    b.onclick = () => { currentRange = Number(b.dataset.range); load(); };
  });

  if (d.ga4?.timeseries?.length > 1) drawChart(d.ga4.timeseries);
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
  const res = await fetch(`/api/client/${token}/data?range=${currentRange}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    $('#app').innerHTML = `<div class="panel" style="text-align:center"><h2>Hmm, that didn't load</h2>
      <p class="hint" style="margin-top:8px">${esc(err.error || 'Please try again in a few minutes.')}</p></div>`;
    return;
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
