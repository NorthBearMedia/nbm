// North Bear Pulse — admin console
let sites = [];
let setup = null;

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, type = 'ok', ms = 3500) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.className = '', ms);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) { location.href = '/login'; throw new Error('Not logged in'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ─── Setup status panel ───────────────────────────────────────────
function renderSetup() {
  const panel = $('#setupPanel');
  const issues = [];
  if (!setup.google) issues.push('Google service account not configured — Google Analytics and Search Console data won\'t load. See README for the 10-minute setup.');
  if (!setup.smtp) issues.push('Email (SMTP) not configured — reports can\'t be sent yet. Add your Hostinger mailbox details to .env.');
  panel.style.display = 'block';
  panel.innerHTML = `
    <h2>System status</h2>
    <div class="hint" style="margin-bottom:12px">Reports go out automatically on each client's schedule (07:00 ${esc(setup.timezone)}). Clarity data is snapshotted nightly.</div>
    <div class="row" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:${issues.length ? '12px' : '0'}">
      <span class="chip ${setup.google ? 'ok' : 'err'}">Google API ${setup.google ? 'connected' : 'not set up'}</span>
      <span class="chip ${setup.smtp ? 'ok' : 'err'}">Email ${setup.smtp ? 'configured' : 'not set up'}</span>
      <span class="chip ${setup.adminPassword ? 'ok' : 'err'}">Admin password ${setup.adminPassword ? 'set' : 'missing'}</span>
      ${setup.googleServiceAccountEmail ? `<span class="chip" style="cursor:pointer" title="Click to copy. Grant this email Viewer access in each client's GA4 property and Search Console." onclick="navigator.clipboard.writeText('${esc(setup.googleServiceAccountEmail)}').then(()=>window._toast('Service account email copied — add it as a Viewer in GA4 & Search Console'))">${esc(setup.googleServiceAccountEmail)} ⧉</span>` : ''}
    </div>
    ${issues.map(i => `<div class="hint" style="color:var(--amber)">⚠ ${esc(i)}</div>`).join('')}
  `;
}
window._toast = toast;

// ─── Sites ────────────────────────────────────────────────────────
const FREQ_LABEL = { weekly: 'Weekly (Mondays)', monthly: 'Monthly (1st)', quarterly: 'Quarterly', none: 'No schedule' };

function sourceChip(label, configured) {
  return `<span class="chip ${configured ? 'ok' : ''}">${label}${configured ? ' ✓' : ' —'}</span>`;
}

function renderSites() {
  $('#loading').style.display = 'none';
  $('#siteCount').textContent = `${sites.length} site${sites.length === 1 ? '' : 's'}`;
  const grid = $('#sitesGrid');
  if (!sites.length) {
    grid.innerHTML = `<div class="panel" style="grid-column:1/-1;text-align:center;color:var(--text-muted)">
      No client sites yet. Click <strong>+ Add client site</strong> to plug in your first one.</div>`;
    return;
  }
  grid.innerHTML = sites.map(s => `
    <div class="site-card ${s.active ? '' : 'inactive'}" data-id="${s.id}">
      <div>
        <div class="name">${esc(s.client_name)} ${s.active ? '' : '<span class="chip warn">paused</span>'}</div>
        ${s.domain ? `<a class="domain" href="https://${esc(s.domain)}" target="_blank" rel="noopener">${esc(s.domain)}</a>` : '<span class="meta">no domain set</span>'}
      </div>
      <div class="row">
        ${sourceChip('Analytics', !!s.ga4_property_id)}
        ${sourceChip('Search', !!s.gsc_site_url)}
        ${sourceChip('Clarity', !!s.has_clarity_token)}
      </div>
      <div class="meta">
        ${esc(FREQ_LABEL[s.report_frequency] || s.report_frequency)}${s.next_report_at && s.report_frequency !== 'none' ? ` · next: ${esc(s.next_report_at)}` : ''}<br>
        ${s.lastReport
          ? `Last report: ${esc(s.lastReport.created_at.slice(0, 16))} ${s.lastReport.status === 'sent' ? '<span style="color:var(--green-light)">✓ sent</span>' : '<span style="color:var(--red)">✗ failed</span>'}`
          : 'No reports sent yet'}
      </div>
      <div class="actions">
        <button class="btn small" data-act="copy-link">Copy dashboard link</button>
        <a class="btn small" href="/r/${esc(s.dashboard_token)}" target="_blank" rel="noopener">Open dashboard</a>
        <a class="btn small" href="/api/sites/${s.id}/preview.pdf" target="_blank" rel="noopener">Preview PDF</a>
        <button class="btn small" data-act="send">Send report now</button>
        <button class="btn small" data-act="test">Test connections</button>
        <button class="btn small" data-act="snippet">Tracking code</button>
        <button class="btn small" data-act="history">History</button>
        <button class="btn small" data-act="edit">Edit</button>
      </div>
    </div>
  `).join('');
}

$('#sitesGrid').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const card = e.target.closest('.site-card');
  const site = sites.find(s => s.id === Number(card.dataset.id));
  const act = btn.dataset.act;

  if (act === 'copy-link') {
    await navigator.clipboard.writeText(site.dashboardUrl);
    toast('Dashboard link copied — safe to send to the client');
  } else if (act === 'send') {
    if (!confirm(`Email a report to ${site.contact_emails || '(no email set!)'} now?`)) return;
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const r = await api(`/api/sites/${site.id}/send-report`, { method: 'POST' });
      if (r.ok) toast(`Report sent to ${r.sentTo.join(', ')}${r.warnings?.length ? ` (warnings: ${r.warnings.length})` : ''}`);
      else toast(`Failed: ${r.error}`, 'err', 7000);
      await loadSites();
    } catch (err) { toast(err.message, 'err', 7000); }
    btn.disabled = false; btn.textContent = 'Send report now';
  } else if (act === 'test') {
    btn.disabled = true; btn.textContent = 'Testing…';
    try {
      const r = await api(`/api/sites/${site.id}/test-connections`, { method: 'POST' });
      const fmt = (name, c) => `${name}: ${c.status === 'ok' ? '✓ working' : c.status === 'not-configured' ? 'not set up' : '✗ ' + c.error}`;
      alert([fmt('Google Analytics', r.ga4), fmt('Search Console', r.gsc), fmt('Microsoft Clarity', r.clarity)].join('\n\n'));
    } catch (err) { toast(err.message, 'err'); }
    btn.disabled = false; btn.textContent = 'Test connections';
  } else if (act === 'snippet') {
    showSnippetModal(site);
  } else if (act === 'history') {
    showHistoryModal(site);
  } else if (act === 'edit') {
    showSiteModal(site);
  }
});

// ─── Site form modal ──────────────────────────────────────────────
function showSiteModal(site = null) {
  const isNew = !site;
  $('#modalRoot').innerHTML = `
  <div class="modal-backdrop" id="backdrop">
    <div class="modal">
      <h3>${isNew ? 'Add client site' : 'Edit ' + esc(site.client_name)}</h3>
      <form id="siteForm" class="form-grid">
        <div class="field"><label>Client / business name *</label>
          <input name="client_name" required value="${esc(site?.client_name)}" placeholder="e.g. RMS Fire Protection"></div>
        <div class="field"><label>Website domain</label>
          <input name="domain" value="${esc(site?.domain)}" placeholder="e.g. rmsfire.co.uk"></div>
        <div class="field"><label>Contact name</label>
          <input name="contact_name" value="${esc(site?.contact_name)}" placeholder="e.g. Sarah"></div>
        <div class="field"><label>Report email(s) *</label>
          <input name="contact_emails" value="${esc(site?.contact_emails)}" placeholder="client@email.com, second@email.com">
          <div class="help">Separate multiple addresses with commas</div></div>
        <div class="field"><label>Report frequency</label>
          <select name="report_frequency">
            ${['weekly', 'monthly', 'quarterly', 'none'].map(f => `<option value="${f}" ${site?.report_frequency === f ? 'selected' : (!site && f === 'monthly' ? 'selected' : '')}>${FREQ_LABEL[f]}</option>`).join('')}
          </select></div>
        <div class="field"><label>Status</label>
          <select name="active"><option value="1" ${site?.active !== 0 ? 'selected' : ''}>Active</option><option value="0" ${site?.active === 0 ? 'selected' : ''}>Paused</option></select></div>

        <div class="full" style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px">
          <strong style="font-size:13px">Data sources</strong>
          <div class="help" style="margin-top:2px">Fill in what you have — anything left blank just won't appear in reports yet.</div>
        </div>
        <div class="field"><label>GA4 property ID</label>
          <input name="ga4_property_id" value="${esc(site?.ga4_property_id)}" placeholder="e.g. 123456789">
          <div class="help">GA4 → Admin → Property details (numbers only)</div></div>
        <div class="field"><label>GA4 measurement ID</label>
          <input name="ga4_measurement_id" value="${esc(site?.ga4_measurement_id)}" placeholder="e.g. G-XXXXXXXXXX">
          <div class="help">Used to generate the tracking code</div></div>
        <div class="field"><label>Search Console property</label>
          <input name="gsc_site_url" value="${esc(site?.gsc_site_url)}" placeholder="sc-domain:example.co.uk">
          <div class="help">"sc-domain:example.co.uk" or "https://example.co.uk/"</div></div>
        <div class="field"><label>Clarity project ID</label>
          <input name="clarity_project_id" value="${esc(site?.clarity_project_id)}" placeholder="e.g. abcd1234ef">
          <div class="help">From the Clarity project URL</div></div>
        <div class="field full"><label>Clarity API token ${site?.has_clarity_token ? '(already saved — leave blank to keep)' : ''}</label>
          <input name="clarity_api_token" placeholder="${site?.has_clarity_token ? '••••••••••••' : 'Clarity → Settings → Data Export → Generate token'}">
          <div class="help">Clarity → your project → Settings → Data Export → Generate new API token</div></div>
        <div class="field full"><label>Notes</label>
          <textarea name="notes" rows="2">${esc(site?.notes)}</textarea></div>
      </form>
      <div class="modal-actions">
        ${isNew ? '' : '<button class="btn danger left" id="deleteBtn">Delete site</button>'}
        <button class="btn" id="cancelBtn">Cancel</button>
        <button class="btn primary" id="saveBtn">${isNew ? 'Add site' : 'Save changes'}</button>
      </div>
    </div>
  </div>`;

  $('#cancelBtn').onclick = closeModal;
  $('#backdrop').onclick = e => { if (e.target.id === 'backdrop') closeModal(); };
  if (!isNew) $('#deleteBtn').onclick = async () => {
    if (!confirm(`Delete ${site.client_name}? This removes their dashboard, history and Clarity snapshots permanently.`)) return;
    await api(`/api/sites/${site.id}`, { method: 'DELETE' });
    toast('Site deleted');
    closeModal();
    await loadSites();
  };
  $('#saveBtn').onclick = async () => {
    const form = $('#siteForm');
    if (!form.reportValidity()) return;
    const body = Object.fromEntries(new FormData(form).entries());
    body.active = body.active === '1';
    try {
      if (isNew) await api('/api/sites', { method: 'POST', body });
      else await api(`/api/sites/${site.id}`, { method: 'PUT', body });
      toast(isNew ? 'Site added — use "Tracking code" to plug it into the website' : 'Saved');
      closeModal();
      await loadSites();
    } catch (err) { toast(err.message, 'err', 6000); }
  };
}

// ─── Tracking snippet modal ───────────────────────────────────────
function showSnippetModal(site) {
  const parts = [];
  if (site.ga4_measurement_id) {
    parts.push(`<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${site.ga4_measurement_id}"><\/script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${site.ga4_measurement_id}');
<\/script>`);
  }
  if (site.clarity_project_id) {
    parts.push(`<!-- Microsoft Clarity -->
<script>
  (function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
  })(window, document, "clarity", "script", "${site.clarity_project_id}");
<\/script>`);
  }
  const snippet = parts.join('\n\n');
  $('#modalRoot').innerHTML = `
  <div class="modal-backdrop" id="backdrop">
    <div class="modal">
      <h3>Tracking code — ${esc(site.client_name)}</h3>
      ${snippet ? `
        <p class="hint" style="margin-bottom:12px">Paste this just before the closing <strong>&lt;/head&gt;</strong> tag on every page.
        In Hostinger Website Builder: <em>Settings → Integrations → Custom code → Head</em>. In WordPress: use the theme's header.php or a "header scripts" plugin.</p>
        <code class="snippet" id="snippetCode">${esc(snippet)}</code>` :
        `<p class="hint">Add a <strong>GA4 measurement ID</strong> and/or <strong>Clarity project ID</strong> to this site first, then the code to paste will appear here.</p>`}
      <div class="modal-actions">
        ${snippet ? '<button class="btn primary" id="copySnippet">Copy code</button>' : ''}
        <button class="btn" id="cancelBtn">Close</button>
      </div>
    </div>
  </div>`;
  $('#cancelBtn').onclick = closeModal;
  $('#backdrop').onclick = e => { if (e.target.id === 'backdrop') closeModal(); };
  if (snippet) $('#copySnippet').onclick = async () => {
    await navigator.clipboard.writeText(snippet);
    toast('Tracking code copied');
  };
}

// ─── History modal ────────────────────────────────────────────────
async function showHistoryModal(site) {
  const reports = await api(`/api/sites/${site.id}/reports`);
  $('#modalRoot').innerHTML = `
  <div class="modal-backdrop" id="backdrop">
    <div class="modal" style="max-width:720px">
      <h3>Report history — ${esc(site.client_name)}</h3>
      ${reports.length ? `<table class="data">
        <thead><tr><th>Sent</th><th>Period</th><th>To</th><th>Type</th><th>Status</th><th></th></tr></thead>
        <tbody>${reports.map(r => `
          <tr>
            <td>${esc(r.created_at.slice(0, 16))}</td>
            <td>${esc(r.period_label || `${r.period_start} – ${r.period_end}`)}</td>
            <td class="trunc" title="${esc(r.sent_to)}">${esc(r.sent_to)}</td>
            <td>${esc(r.trigger_type)}</td>
            <td>${r.status === 'sent' ? '<span style="color:var(--green-light)">✓ sent</span>' : `<span style="color:var(--red)" title="${esc(r.error)}">✗ failed</span>`}</td>
            <td>${r.status === 'sent' && r.pdf_path ? `<a class="btn small" href="/api/reports/${r.id}/download">PDF</a>` : ''}</td>
          </tr>`).join('')}
        </tbody></table>` : '<p class="hint">No reports yet for this site.</p>'}
      <div class="modal-actions"><button class="btn" id="cancelBtn">Close</button></div>
    </div>
  </div>`;
  $('#cancelBtn').onclick = closeModal;
  $('#backdrop').onclick = e => { if (e.target.id === 'backdrop') closeModal(); };
}

function closeModal() { $('#modalRoot').innerHTML = ''; }

// ─── Top bar actions ──────────────────────────────────────────────
$('#addSiteBtn').onclick = () => showSiteModal();
$('#logoutBtn').onclick = async () => { await api('/api/logout', { method: 'POST' }); location.href = '/login'; };
$('#testEmailBtn').onclick = async (e) => {
  e.target.disabled = true;
  try {
    const r = await api('/api/test-smtp', { method: 'POST' });
    toast(r.ok ? 'Email connection working ✓' : `Email problem: ${r.error}`, r.ok ? 'ok' : 'err', 6000);
  } catch (err) { toast(err.message, 'err'); }
  e.target.disabled = false;
};
$('#syncClarityBtn').onclick = async (e) => {
  e.target.disabled = true; e.target.textContent = 'Syncing…';
  try {
    const r = await api('/api/sync-clarity', { method: 'POST' });
    toast(`Clarity sync complete — ${r.synced} site(s) snapshotted`);
  } catch (err) { toast(err.message, 'err'); }
  e.target.disabled = false; e.target.textContent = 'Sync Clarity';
};

// ─── Boot ─────────────────────────────────────────────────────────
async function loadSites() {
  sites = await api('/api/sites');
  renderSites();
}
(async () => {
  try {
    [setup] = await Promise.all([api('/api/setup-status'), loadSites()]);
    renderSetup();
  } catch (err) { /* redirected to login */ }
})();
