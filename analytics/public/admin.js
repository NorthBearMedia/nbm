// North Bear Pulse — admin console (with first-run setup wizard)
let sites = [];
let setup = null;
let lastDiscovery = null;

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, type = 'ok', ms = 4500) {
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

async function refreshSetup() {
  setup = await api('/api/setup-status');
  renderSetup();
}

// ─── Setup wizard / status panel ──────────────────────────────────

function stepState() {
  return {
    email: setup.smtp && setup.smtpVerified,
    google: setup.google && setup.googleApiOk,
    sites: setup.sitesTotal > 0 && setup.sitesGoogleConnected === setup.sitesTotal,
  };
}

function stepBadge(done, n) {
  return `<span class="step-badge ${done ? 'done' : ''}">${done ? '✓' : n}</span>`;
}

function emailFormFields(s) {
  return `
    <div class="form-grid">
      <div class="field"><label>Mail server</label><input name="smtp_host" value="${esc(s.smtp_host || 'smtp.hostinger.com')}"></div>
      <div class="field"><label>Port</label><input name="smtp_port" value="${esc(s.smtp_port || 465)}"></div>
      <div class="field"><label>Mailbox (user)</label><input name="smtp_user" value="${esc(s.smtp_user)}" placeholder="reports@northbearmedia.co.uk"></div>
      <div class="field"><label>Mailbox password ${s.smtp_pass_set ? '(saved — leave blank to keep)' : ''}</label><input name="smtp_pass" type="password" placeholder="${s.smtp_pass_set ? '••••••••••••' : ''}"></div>
      <div class="field"><label>Send copies to me (BCC)</label><input name="email_bcc" value="${esc(s.email_bcc || 'info@northbearmedia.co.uk')}"></div>
      <div class="field"><label>From name (optional)</label><input name="email_from" value="${esc(s.email_from)}" placeholder="North Bear Media Reports &lt;reports@…&gt;"></div>
    </div>`;
}

function renderSetup() {
  const panel = $('#setupPanel');
  panel.style.display = 'block';
  const st = stepState();
  const allDone = st.email && st.google && st.sites;

  if (allDone) {
    panel.innerHTML = `
      <div class="row" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <span class="chip ok">Email ✓</span>
        <span class="chip ok">Google ✓</span>
        <span class="chip ok">${setup.sitesGoogleConnected}/${setup.sitesTotal} sites connected</span>
        ${setup.sitesMissingEmail ? `<span class="chip warn">${setup.sitesMissingEmail} site(s) need a client email</span>` : ''}
        <span class="hint">Reports go out automatically at 07:00 ${esc(setup.timezone)} on each client's schedule.</span>
      </div>`;
    return;
  }

  panel.innerHTML = `
    <h2>Set up North Bear Pulse</h2>
    <div class="hint" style="margin-bottom:16px">Three steps, copy &amp; paste, ~15 minutes total — then everything runs itself.</div>

    <!-- STEP 1: EMAIL -->
    <div class="wizard-step">
      <div class="wizard-head">${stepBadge(st.email, 1)}<strong>Email sending</strong>
        ${st.email ? '<span class="chip ok">working ✓</span>' : '<span class="chip warn">needed to send reports</span>'}</div>
      <div class="wizard-body">
        <p class="hint" style="margin-bottom:10px">Use any Hostinger mailbox — e.g. create <strong>reports@northbearmedia.co.uk</strong> in hPanel → Emails (2 min), then enter it here. "Save &amp; send test" emails you a real test so you know it works.</p>
        <form id="emailForm">${emailFormFields(setup.settings)}</form>
        <div style="margin-top:12px"><button class="btn primary" id="saveEmailBtn">Save &amp; send me a test email</button></div>
      </div>
    </div>

    <!-- STEP 2: GOOGLE -->
    <div class="wizard-step">
      <div class="wizard-head">${stepBadge(st.google, 2)}<strong>Connect Google (one time — covers every client)</strong>
        ${st.google ? '<span class="chip ok">connected ✓</span>' : setup.google ? '<span class="chip warn">key saved — APIs not reachable yet</span>' : ''}</div>
      <div class="wizard-body">
        ${setup.google ? '' : `
        <ol class="wizard-list">
          <li><a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">Create a Google Cloud project</a> (call it <em>NBM Pulse</em> — free, no billing needed).</li>
          <li>Enable three APIs (click each link → press <em>Enable</em>):
            <a href="https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com" target="_blank" rel="noopener">Analytics Data</a> ·
            <a href="https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com" target="_blank" rel="noopener">Analytics Admin</a> ·
            <a href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com" target="_blank" rel="noopener">Search Console</a></li>
          <li><a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener">Create a service account</a> (name: <em>nbm-pulse</em>, no roles) → open it → <em>Keys → Add key → Create new key → JSON</em>. A file downloads.</li>
          <li>Open that file in a text editor (or Notepad), copy everything, and paste it below:</li>
        </ol>
        <div class="field"><textarea id="saJson" rows="4" placeholder='{ "type": "service_account", "project_id": … }'></textarea></div>
        <div style="margin-top:10px"><button class="btn primary" id="saveGoogleBtn">Connect Google</button></div>`}
        ${setup.googleServiceAccountEmail ? `
        <div class="grant-box">
          <div><strong>Your robot's email</strong> — give it read access to each client's data (one-time, ~30 seconds each):</div>
          <div class="chip" id="copySaEmail" style="cursor:pointer;margin:8px 0" title="Click to copy">${esc(setup.googleServiceAccountEmail)} ⧉</div>
          <ul class="wizard-list">
            <li><strong>GA4:</strong> <a href="https://analytics.google.com/" target="_blank" rel="noopener">analytics.google.com</a> → Admin → <em>Account</em> access management → + Add user → paste → role <em>Viewer</em>. Adding it at <em>account</em> level covers every property in that account at once.</li>
            <li><strong>Search Console:</strong> <a href="https://search.google.com/search-console" target="_blank" rel="noopener">search console</a> → each property → Settings → Users → Add user → paste → <em>Full</em>.</li>
          </ul>
          <button class="btn" id="scanGoogleBtn">Scan my Google account</button>
          <span class="hint" id="scanResult"></span>
        </div>` : ''}
      </div>
    </div>

    <!-- STEP 3: SITES -->
    <div class="wizard-step">
      <div class="wizard-head">${stepBadge(st.sites, 3)}<strong>Wire up the websites</strong>
        <span class="chip ${st.sites ? 'ok' : ''}">${setup.sitesGoogleConnected}/${setup.sitesTotal} connected</span></div>
      <div class="wizard-body">
        <p class="hint" style="margin-bottom:10px">Once Google is connected, this fills in every site's Analytics &amp; Search Console automatically (and checks each website for installed tags). Re-run it any time.</p>
        <button class="btn primary" id="autoConnectAllBtn">⚡ Auto-connect all sites</button>
        <button class="btn" id="hostingerImportBtn">⬇ Import websites from Hostinger</button>
        ${setup.settings.fathom_token_set ? '<button class="btn" id="fathomMatchBtn">🔗 Connect Fathom to sites</button>' : ''}
        <div id="importBlock" style="margin-top:14px"></div>
      </div>
    </div>

    <p class="hint" style="margin-top:10px"><strong>Optional extra:</strong> Microsoft Clarity (heatmaps &amp; frustration signals) — for each site, grab an API token from <a href="https://clarity.microsoft.com" target="_blank" rel="noopener">clarity.microsoft.com</a> → project → Settings → Data Export, and paste it in the site's <em>Edit</em> form. Auto-connect finds the project ID by itself if Clarity is installed on the site.</p>
  `;

  // step 1 events
  $('#saveEmailBtn')?.addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = 'Saving…';
    try {
      const body = Object.fromEntries(new FormData($('#emailForm')).entries());
      body.smtp_secure = String(Number(body.smtp_port) === 465);
      await api('/api/settings', { method: 'PUT', body });
      e.target.textContent = 'Sending test…';
      const r = await api('/api/test-smtp', { method: 'POST', body: { to: body.email_bcc || body.smtp_user } });
      if (r.ok) toast(`Test email sent to ${r.sentTo} — check the inbox ✓`, 'ok', 7000);
      else toast(`Saved, but sending failed: ${r.error}`, 'err', 9000);
      await refreshSetup();
    } catch (err) { toast(err.message, 'err', 7000); }
    finally { e.target.disabled = false; e.target.textContent = 'Save & send me a test email'; }
  });

  // step 2 events
  $('#saveGoogleBtn')?.addEventListener('click', async (e) => {
    const json = $('#saJson').value.trim();
    if (!json) return toast('Paste the JSON key file contents first', 'err');
    e.target.disabled = true; e.target.textContent = 'Connecting…';
    try {
      const r = await api('/api/google/credentials', { method: 'POST', body: { json } });
      if (r.apiOk) toast(`Google connected ✓ — found ${r.propertiesFound} Analytics properties and ${r.gscSitesFound} Search Console sites`, 'ok', 8000);
      else toast(`Key saved (${r.clientEmail}). ${r.apiError || 'Now grant it access, then scan.'}`, 'err', 12000);
      await refreshSetup();
    } catch (err) { toast(err.message, 'err', 9000); e.target.disabled = false; e.target.textContent = 'Connect Google'; }
  });
  $('#copySaEmail')?.addEventListener('click', () => {
    navigator.clipboard.writeText(setup.googleServiceAccountEmail)
      .then(() => toast('Robot email copied — paste it into GA4 and Search Console user management'));
  });
  $('#scanGoogleBtn')?.addEventListener('click', () => scanGoogle());

  // step 3 events
  $('#autoConnectAllBtn')?.addEventListener('click', autoConnectAll);
  $('#hostingerImportBtn')?.addEventListener('click', hostingerImport);
  $('#fathomMatchBtn')?.addEventListener('click', fathomMatch);
  if (lastDiscovery) renderImportBlock();
}

async function scanGoogle() {
  const btn = $('#scanGoogleBtn'), out = $('#scanResult');
  if (btn) { btn.disabled = true; btn.textContent = 'Scanning…'; }
  try {
    lastDiscovery = await api('/api/google/discover?refresh=1');
    const nP = lastDiscovery.properties.length, nG = lastDiscovery.gscSites.length;
    const errs = Object.values(lastDiscovery.errors || {});
    if (out) out.textContent = ` Found ${nP} Analytics properties and ${nG} Search Console sites.${errs.length ? ' ⚠ ' + errs.join(' ') : ''}`;
    await refreshSetup();
    renderImportBlock();
    if (nP || nG) toast(`Scan complete — ${nP} Analytics properties, ${nG} Search Console sites visible`, 'ok', 7000);
    else toast(errs[0] || 'Nothing visible yet — grant the robot email access first, then re-scan', 'err', 10000);
  } catch (err) { toast(err.message, 'err', 9000); }
  if (btn) { btn.disabled = false; btn.textContent = 'Scan my Google account'; }
}

function renderImportBlock() {
  const block = $('#importBlock');
  if (!block || !lastDiscovery) return;
  const unlinked = lastDiscovery.properties.filter(p => !p.linked);
  if (!unlinked.length) { block.innerHTML = ''; return; }
  block.innerHTML = `
    <div class="grant-box">
      <strong>Found in your Google account but not in Pulse yet</strong>
      <div class="hint" style="margin:4px 0 10px">Tick the ones that are client websites and import them — Analytics &amp; Search Console come pre-wired. You just add each client's email afterwards.</div>
      ${unlinked.map(p => `
        <label class="import-row"><input type="checkbox" value="${esc(p.propertyId)}" checked>
          <strong>${esc(p.displayName)}</strong>
          <span class="hint">${esc(p.streams[0]?.defaultUri || 'no website address set in GA4')} · ${esc(p.accountName)}</span>
        </label>`).join('')}
      <button class="btn primary" id="importBtn" style="margin-top:10px">Import selected as new sites</button>
    </div>`;
  $('#importBtn').onclick = async (e) => {
    const ids = [...block.querySelectorAll('input:checked')].map(i => i.value);
    if (!ids.length) return toast('Nothing ticked', 'err');
    e.target.disabled = true;
    try {
      const r = await api('/api/google/import-sites', { method: 'POST', body: { propertyIds: ids } });
      toast(`Imported ${r.created.length} site(s) — add each client's email when you're ready to start their reports`, 'ok', 8000);
      lastDiscovery = null;
      await Promise.all([loadSites(), refreshSetup()]);
    } catch (err) { toast(err.message, 'err', 8000); e.target.disabled = false; }
  };
}

async function autoConnectAll(e) {
  const btn = e?.target || $('#autoConnectAllBtn');
  btn.disabled = true;
  let filledCount = 0;
  const notes = [];
  for (const site of sites.filter(s => s.active)) {
    btn.textContent = `Connecting ${site.client_name}…`;
    try {
      const r = await api(`/api/sites/${site.id}/autoconnect`, { method: 'POST' });
      filledCount += Object.keys(r.filled).length;
      r.notes.forEach(n => notes.push(`${site.client_name}: ${n}`));
    } catch (err) { notes.push(`${site.client_name}: ${err.message}`); }
  }
  btn.disabled = false; btn.textContent = '⚡ Auto-connect all sites';
  await Promise.all([loadSites(), refreshSetup()]);
  if (notes.length) showNotesModal('Auto-connect results', `${filledCount} connection(s) filled in automatically.`, notes);
  else toast(`Done — ${filledCount} connection(s) filled in, everything wired up ✓`, 'ok', 7000);
}

async function hostingerImport(e) {
  const btn = e.target;
  btn.disabled = true; btn.textContent = 'Fetching your websites…';
  let data;
  try { data = await api('/api/hostinger/websites'); }
  catch (err) {
    toast(err.message, 'err', 9000);
    btn.disabled = false; btn.textContent = '⬇ Import websites from Hostinger';
    return;
  }
  btn.disabled = false; btn.textContent = '⬇ Import websites from Hostinger';
  const fresh = data.websites.filter(w => !w.alreadyInPulse);
  $('#modalRoot').innerHTML = `
  <div class="modal-backdrop" id="backdrop"><div class="modal">
    <h3>Websites on your Hostinger account</h3>
    ${fresh.length ? `
      <p class="hint" style="margin-bottom:10px">Tick the client websites to bring into Pulse. Each is set to monthly reports —
      nothing sends until you add that client's email address.</p>
      ${fresh.map(w => `
        <label class="import-row"><input type="checkbox" value="${esc(w.domain)}" checked>
          <strong>${esc(w.domain)}</strong></label>`).join('')}
      <div class="modal-actions">
        <button class="btn" id="cancelBtn">Cancel</button>
        <button class="btn primary" id="hostingerImportConfirm">Import &amp; auto-connect selected</button>
      </div>` : `
      <p class="hint">All ${data.websites.length} Hostinger website(s) are already in Pulse ✓</p>
      <div class="modal-actions"><button class="btn" id="cancelBtn">Close</button></div>`}
  </div></div>`;
  $('#cancelBtn').onclick = closeModal;
  $('#backdrop').onclick = ev => { if (ev.target.id === 'backdrop') closeModal(); };
  $('#hostingerImportConfirm')?.addEventListener('click', async (ev) => {
    const domains = [...document.querySelectorAll('#modalRoot input:checked')].map(i => i.value);
    if (!domains.length) return toast('Nothing ticked', 'err');
    ev.target.disabled = true; ev.target.textContent = 'Importing & connecting…';
    try {
      const r = await api('/api/hostinger/import-sites', { method: 'POST', body: { domains } });
      closeModal();
      const lines = r.results.map(x => `${x.domain}: ${x.filled.length ? 'connected ' + x.filled.join(', ') : x.notes[0] || 'imported'}`);
      showNotesModal('Hostinger import complete', `${r.created} site(s) imported.`, lines);
      await Promise.all([loadSites(), refreshSetup()]);
    } catch (err) { toast(err.message, 'err', 9000); ev.target.disabled = false; ev.target.textContent = 'Import & auto-connect selected'; }
  });
}

async function fathomMatch(e) {
  const btn = e.target; btn.disabled = true; btn.textContent = 'Matching Fathom sites…';
  try {
    const r = await api('/api/fathom/match', { method: 'POST' });
    const lines = r.matched.map(m => `${m.site} → ${m.fathom}${m.already ? ' (already linked)' : ' ✓'}`)
      .concat(r.unmatched.map(u => `${u} — no Fathom site found (link manually in Edit)`));
    showNotesModal('Fathom connected', `${r.fathomSitesFound} Fathom site(s) found · ${r.matched.length} linked.`, lines);
    await Promise.all([loadSites(), refreshSetup()]);
  } catch (err) { toast(err.message, 'err', 9000); }
  btn.disabled = false; btn.textContent = '🔗 Connect Fathom to sites';
}

function showNotesModal(title, summary, notes) {
  $('#modalRoot').innerHTML = `
  <div class="modal-backdrop" id="backdrop"><div class="modal">
    <h3>${esc(title)}</h3>
    <p style="margin-bottom:12px">${esc(summary)}</p>
    <ul class="wizard-list">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
    <div class="modal-actions"><button class="btn primary" id="cancelBtn">OK</button></div>
  </div></div>`;
  $('#cancelBtn').onclick = closeModal;
  $('#backdrop').onclick = ev => { if (ev.target.id === 'backdrop') closeModal(); };
}

// ─── Settings modal (after first setup) ──────────────────────────
function showSettingsModal() {
  const s = setup.settings;
  $('#modalRoot').innerHTML = `
  <div class="modal-backdrop" id="backdrop"><div class="modal">
    <h3>Settings</h3>
    <form id="settingsForm">
      ${emailFormFields(s)}
      <div class="form-grid" style="margin-top:14px">
        <div class="field full"><label>Delivery mode</label>
          <select name="delivery_mode">
            <option value="test" ${s.delivery_mode !== 'live' ? 'selected' : ''}>Test — every report comes to me only (tagged with its intended client)</option>
            <option value="live" ${s.delivery_mode === 'live' ? 'selected' : ''}>Live — reports go to clients (I'm BCC'd)</option>
          </select>
          <div class="help">Start in Test, review the reports landing in your inbox, then switch to Live when happy — that's the moment clients start receiving them.</div></div>
        <div class="field full"><label>App address (used in email links)</label>
          <input name="app_url" value="${esc(s.app_url)}" placeholder="${esc(location.origin)}"></div>
        <div class="field full"><label>Search Console reader (optional)</label>
          <input name="gsc_reader_email" value="${esc(s.gsc_reader_email)}" placeholder="you@yourdomain.co.uk">
          <div class="help">Your own Google email. With domain-wide delegation authorised in Google Workspace admin
          (incl. the <strong>webmasters.readonly</strong> scope), rankings are read as you — read-only, and no
          per-site grants are ever needed.</div></div>
        <div class="field full"><label>Hostinger API token ${s.hostinger_token_set ? '(saved — leave blank to keep)' : ''}</label>
          <input name="hostinger_api_token" type="password" placeholder="${s.hostinger_token_set ? '••••••••••••' : 'hPanel → Account → API → New token'}">
          <div class="help">Lets Pulse list every website on your Hostinger account and import them in one click.</div></div>
        <div class="field full"><label>Fathom API key ${s.fathom_token_set ? '(saved — leave blank to keep)' : ''}</label>
          <input name="fathom_api_token" type="password" placeholder="${s.fathom_token_set ? '••••••••••••' : 'Fathom → Settings → API → Create key'}">
          <div class="help">Real, bot-filtered visitor data with history — becomes the primary source for reports.
          After saving, use <strong>Connect Fathom</strong> in the setup panel to match it to your sites.</div></div>
        <div class="field full"><label>AI insights — Anthropic API key ${s.anthropic_key_set ? '(saved — leave blank to keep)' : ''}</label>
          <input name="anthropic_api_key" type="password" placeholder="${s.anthropic_key_set ? '••••••••••••' : 'console.anthropic.com → API keys'}">
          <div class="help">Writes the plain-English "what this means & what to do next" section of each report.
          ${s.anthropic_key_set ? 'Active ✓' : 'Without it, reports use a strong built-in insights section instead.'}</div></div>
        <div class="field full"><label>Replace Google service account key (optional)</label>
          <textarea name="google_json" rows="3" placeholder='Paste new key JSON only if you need to replace it${setup.googleServiceAccountEmail ? ' — current: ' + esc(setup.googleServiceAccountEmail) : ''}'></textarea></div>
      </div>
    </form>
    <div class="modal-actions">
      <button class="btn left" id="testEmailBtn2">Send test email</button>
      <button class="btn" id="cancelBtn">Cancel</button>
      <button class="btn primary" id="saveSettingsBtn">Save</button>
    </div>
  </div></div>`;
  $('#cancelBtn').onclick = closeModal;
  $('#backdrop').onclick = e => { if (e.target.id === 'backdrop') closeModal(); };
  $('#testEmailBtn2').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const r = await api('/api/test-smtp', { method: 'POST', body: {} });
      toast(r.ok ? `Test email sent to ${r.sentTo} ✓` : `Failed: ${r.error}`, r.ok ? 'ok' : 'err', 8000);
    } catch (err) { toast(err.message, 'err'); }
    e.target.disabled = false;
  };
  $('#saveSettingsBtn').onclick = async () => {
    const body = Object.fromEntries(new FormData($('#settingsForm')).entries());
    body.smtp_secure = String(Number(body.smtp_port) === 465);
    const googleJson = body.google_json?.trim();
    delete body.google_json;
    try {
      await api('/api/settings', { method: 'PUT', body });
      if (googleJson) {
        const r = await api('/api/google/credentials', { method: 'POST', body: { json: googleJson } });
        toast(r.apiOk ? 'Settings saved, Google key replaced ✓' : `Saved. Google: ${r.apiError || 'grant access then scan'}`, r.apiOk ? 'ok' : 'err', 8000);
      } else toast('Settings saved');
      closeModal();
      await refreshSetup();
    } catch (err) { toast(err.message, 'err', 8000); }
  };
}

// ─── Sites ────────────────────────────────────────────────────────
const FREQ_LABEL = { weekly: 'Weekly (Mondays)', monthly: 'Monthly (1st)', quarterly: 'Quarterly', none: 'No schedule yet' };

function sourceChip(label, configured) {
  return `<span class="chip ${configured ? 'ok' : ''}">${label}${configured ? ' ✓' : ' —'}</span>`;
}

function renderSites() {
  $('#loading').style.display = 'none';
  $('#siteCount').textContent = `${sites.length} site${sites.length === 1 ? '' : 's'}`;
  const grid = $('#sitesGrid');
  if (!sites.length) {
    grid.innerHTML = `<div class="panel" style="grid-column:1/-1;text-align:center;color:var(--text-muted)">
      No client sites yet. Click <strong>+ Add client site</strong>, or connect Google above and import them in one go.</div>`;
    return;
  }
  grid.innerHTML = sites.map(s => `
    <div class="site-card ${s.active ? '' : 'inactive'}" data-id="${s.id}">
      <div>
        <div class="name">${esc(s.client_name)} ${s.active ? '' : '<span class="chip warn">paused</span>'}</div>
        ${s.domain ? `<a class="domain" href="https://${esc(s.domain)}" target="_blank" rel="noopener">${esc(s.domain)}</a>` : '<span class="meta">no domain set</span>'}
      </div>
      <div class="row">
        ${s.fathom_site_id ? sourceChip('Fathom', true) : sourceChip('Analytics', !!s.ga4_property_id)}
        ${sourceChip('Search', !!s.gsc_site_url)}
        ${sourceChip('Clarity', !!s.has_clarity_token)}
        ${!s.contact_emails ? '<span class="chip warn">no client email</span>' : ''}
      </div>
      <div class="meta">
        ${esc(FREQ_LABEL[s.report_frequency] || s.report_frequency)}${s.next_report_at && s.report_frequency !== 'none' ? ` · next: ${esc(s.next_report_at)}` : ''}<br>
        ${s.lastReport
          ? `Last report: ${esc(s.lastReport.created_at.slice(0, 16))} ${s.lastReport.status === 'sent' ? '<span style="color:var(--green-light)">✓ sent</span>' : '<span style="color:var(--red)">✗ failed</span>'}`
          : 'No reports sent yet'}
      </div>
      <div class="actions">
        ${(!s.ga4_property_id || !s.gsc_site_url) ? '<button class="btn small primary" data-act="autoconnect">⚡ Auto-connect</button>' : ''}
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
  } else if (act === 'autoconnect') {
    btn.disabled = true; btn.textContent = 'Connecting…';
    try {
      const r = await api(`/api/sites/${site.id}/autoconnect`, { method: 'POST' });
      const got = Object.keys(r.filled);
      if (got.length) toast(`Connected: ${got.join(', ')} ✓`, 'ok', 7000);
      if (r.notes.length) showNotesModal(`Auto-connect — ${site.client_name}`, got.length ? `Filled in: ${got.join(', ')}` : 'Nothing new could be filled in automatically yet.', r.notes);
      await Promise.all([loadSites(), refreshSetup()]);
    } catch (err) { toast(err.message, 'err', 8000); }
  } else if (act === 'send') {
    if (!confirm(`Email a report to ${site.contact_emails || '(no email set!)'} now?`)) return;
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const r = await api(`/api/sites/${site.id}/send-report`, { method: 'POST' });
      if (r.ok) toast(`Report sent to ${r.sentTo.join(', ')}${r.warnings?.length ? ` (warnings: ${r.warnings.length})` : ''}`);
      else toast(`Failed: ${r.error}`, 'err', 8000);
      await loadSites();
    } catch (err) { toast(err.message, 'err', 8000); }
    btn.disabled = false; btn.textContent = 'Send report now';
  } else if (act === 'test') {
    btn.disabled = true; btn.textContent = 'Testing…';
    try {
      const r = await api(`/api/sites/${site.id}/test-connections`, { method: 'POST' });
      const fmt = (name, c) => `${name}: ${c.status === 'ok' ? '✓ working' : c.status === 'not-configured' ? 'not set up' : '✗ ' + c.error}`;
      showNotesModal(`Connections — ${site.client_name}`, '', [fmt('Fathom Analytics', r.fathom), fmt('Google Analytics', r.ga4), fmt('Search Console', r.gsc), fmt('Microsoft Clarity', r.clarity)]);
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
        <div class="field"><label>Report email(s)</label>
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
          <div class="help" style="margin-top:2px">Tip: save with just the domain, then hit <strong>⚡ Auto-connect</strong> on the site card — it fills these in for you.</div>
        </div>
        <div class="field"><label>GA4 property ID</label>
          <input name="ga4_property_id" value="${esc(site?.ga4_property_id)}" placeholder="auto-connect fills this">
          <div class="help">GA4 → Admin → Property details (numbers only)</div></div>
        <div class="field"><label>GA4 measurement ID</label>
          <input name="ga4_measurement_id" value="${esc(site?.ga4_measurement_id)}" placeholder="auto-connect fills this">
          <div class="help">The G-XXXX one, used for the tracking code</div></div>
        <div class="field"><label>Search Console property</label>
          <input name="gsc_site_url" value="${esc(site?.gsc_site_url)}" placeholder="auto-connect fills this">
          <div class="help">"sc-domain:example.co.uk" or "https://example.co.uk/"</div></div>
        <div class="field"><label>Fathom site ID</label>
          <input name="fathom_site_id" value="${esc(site?.fathom_site_id)}" placeholder="Connect Fathom fills this">
          <div class="help">Primary data source when set. Use “Connect Fathom” to fill automatically.</div></div>
        <div class="field"><label>Clarity project ID</label>
          <input name="clarity_project_id" value="${esc(site?.clarity_project_id)}" placeholder="auto-connect detects this">
          <div class="help">From the Clarity project URL</div></div>
        <div class="field full"><label>Clarity API token ${site?.has_clarity_token ? '(already saved — leave blank to keep)' : ''}</label>
          <input name="clarity_api_token" placeholder="${site?.has_clarity_token ? '••••••••••••' : 'Clarity → Settings → Data Export → Generate token'}">
          <div class="help">The one thing that can't be auto-fetched — Clarity → project → Settings → Data Export → Generate new API token</div></div>
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
    await Promise.all([loadSites(), refreshSetup()]);
  };
  $('#saveBtn').onclick = async () => {
    const form = $('#siteForm');
    if (!form.reportValidity()) return;
    const body = Object.fromEntries(new FormData(form).entries());
    body.active = body.active === '1';
    try {
      const saved = isNew
        ? await api('/api/sites', { method: 'POST', body })
        : await api(`/api/sites/${site.id}`, { method: 'PUT', body });
      closeModal();
      await Promise.all([loadSites(), refreshSetup()]);
      if (isNew && saved.domain && !saved.ga4_property_id) {
        toast('Site added — running auto-connect…', 'ok');
        try {
          const r = await api(`/api/sites/${saved.id}/autoconnect`, { method: 'POST' });
          const got = Object.keys(r.filled);
          toast(got.length ? `Auto-connected: ${got.join(', ')} ✓` : 'Added. Auto-connect found nothing yet — grant the robot access and retry.', got.length ? 'ok' : 'err', 8000);
          await Promise.all([loadSites(), refreshSetup()]);
        } catch { /* site saved fine; connect later */ }
      } else {
        toast(isNew ? 'Site added' : 'Saved');
      }
    } catch (err) { toast(err.message, 'err', 7000); }
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
        `<p class="hint">Add a <strong>GA4 measurement ID</strong> and/or <strong>Clarity project ID</strong> to this site first (⚡ Auto-connect usually finds them), then the code to paste will appear here.</p>`}
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
$('#settingsBtn').onclick = () => showSettingsModal();
$('#logoutBtn').onclick = async () => { await api('/api/logout', { method: 'POST' }); location.href = '/login'; };
$('#connectionsBtn').onclick = async (e) => {
  e.target.disabled = true; e.target.textContent = 'Checking…';
  try {
    const h = await api('/api/connections');
    const cell = c => c
      ? `<td style="padding:6px 10px;white-space:nowrap">${c.ok ? '✅' : '❌'} <span class="hint">${esc(c.detail || '')}</span></td>`
      : '<td style="padding:6px 10px">—</td>';
    $('#modalRoot').innerHTML = `
    <div class="modal-backdrop" id="backdrop"><div class="modal" style="max-width:1050px">
      <h3>Connections — live check (last 7 days)</h3>
      <p class="hint" style="margin:4px 0 12px">Checked ${new Date(h.checkedAt).toLocaleTimeString('en-GB')} · ✅ pulling data · ❌ needs attention (reason shown)</p>
      <div style="overflow:auto;max-height:65vh">
      <table class="data" style="width:100%">
        <thead><tr><th style="text-align:left;padding:6px 10px">Site</th><th style="text-align:left;padding:6px 10px">Google Analytics</th><th style="text-align:left;padding:6px 10px">Search Console</th><th style="text-align:left;padding:6px 10px">Clarity</th><th style="text-align:left;padding:6px 10px">Fathom</th></tr></thead>
        <tbody>${h.sites.map(r => `<tr>
          <td style="padding:6px 10px"><strong>${esc(r.client)}</strong><br><span class="hint">${esc(r.domain)}</span></td>
          ${r.error ? `<td colspan="4" style="padding:6px 10px">❌ ${esc(r.error)}</td>` : cell(r.ga) + cell(r.search) + cell(r.clarity) + cell(r.fathom)}
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="modal-actions" style="margin-top:14px"><button class="btn" onclick="document.getElementById('modalRoot').innerHTML=''">Close</button></div>
    </div></div>`;
    $('#backdrop').onclick = ev => { if (ev.target.id === 'backdrop') closeModal(); };
  } catch (err) { toast(err.message, 'err'); }
  e.target.disabled = false; e.target.textContent = 'Connections';
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
    await Promise.all([refreshSetup(), loadSites()]);
    // Quietly self-heal the app URL so email links point at the real
    // deployment instead of localhost — zero-setup nicety.
    const saved = setup.settings.app_url || '';
    if ((!saved || saved.includes('localhost')) && !location.origin.includes('localhost')) {
      await api('/api/settings', { method: 'PUT', body: { app_url: location.origin } });
      await refreshSetup();
    }
  } catch (err) { /* redirected to login */ }
})();
