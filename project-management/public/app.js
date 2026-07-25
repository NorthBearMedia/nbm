// ─── State ──────────────────────────────────────────────
let clients = [];
let teamMembers = [];
let appUsers = [];
let assigneePool = []; // display names assignable to tasks (users + team_members)
let currentUser = null;
let currentFilter = 'all';
let currentView = 'dashboard';
let showCompletedTasks = new Set();
let calendarDate = new Date();
let myTasksFilter = false;
let selectedTasks = new Set();

async function loadCurrentUser() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      currentUser = await res.json();
      const sel = document.getElementById('currentUser');
      if (sel) sel.innerHTML = `<option selected>${esc(currentUser.display_name)}</option>`;
      const ghb = document.getElementById('globalHistoryBtn');
      if (ghb) ghb.style.display = currentUser.role === 'owner' ? '' : 'none';
      const bkb = document.getElementById('manageBackupsBtn');
      if (bkb) bkb.style.display = currentUser.role === 'owner' ? '' : 'none';
    } else {
      window.location.href = '/login';
    }
  } catch (e) {
    window.location.href = '/login';
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

// Small bottom-centre toast — failed saves must be SEEN, never swallowed.
let toastTimer = null;
function toast(msg) {
  let el = document.getElementById('appToast');
  if (!el) { el = document.createElement('div'); el.id = 'appToast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  if (res.status === 401) { window.location.href = '/login'; throw new Error('Session expired'); }
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Server error — please refresh and try again'); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

// Save button state helper
function setSaving(btn, saving) {
  if (!btn) return;
  if (saving) {
    btn.disabled = true;
    btn._origText = btn.textContent;
    btn.innerHTML = '<span class="saving-spinner"></span> Saving...';
  } else {
    btn.disabled = false;
    btn.textContent = btn._origText || 'Save';
  }
}

async function loadClients() {
  const fp = currentFilter !== 'all' ? `?filter=${currentFilter}` : '';
  clients = await api(`/api/clients${fp}`);
  updateClientFilterDropdown();
  renderStats();
  updateInboxCount();
  if (currentView === 'clients') {
    renderClients();
    loadWorkloadSummary();
  } else if (currentView === 'dashboard') {
    loadDashboard();
  } else if (currentView === 'inbox') {
    loadInboxView();
  } else if (currentView === 'planning') {
    loadPlanningView();
  } else if (currentView === 'notebook') {
    loadNotebookView();
  }
}

async function loadTeam() {
  try { appUsers = await api('/api/users'); } catch(e) { appUsers = []; }
  if (!Array.isArray(appUsers)) appUsers = [];
  teamMembers = appUsers.map(u => ({ id: u.id, name: u.display_name, role: u.role, avatar_color: u.avatar_color, avatar_url: u.avatar_url }));
  // Everyone a task can be assigned to: login users + the team_members table
  // (people without logins — The Bear already merges these, the UI must too).
  let extra = [];
  try { extra = await api('/api/team'); } catch(e) { extra = []; }
  const seen = new Set(appUsers.map(u => u.display_name));
  assigneePool = appUsers.map(u => u.display_name)
    .concat((Array.isArray(extra) ? extra : []).map(m => m.name).filter(n => n && !seen.has(n)))
    .sort((a, b) => a.localeCompare(b));
  updateUserSelector();
  updatePersonDropdowns();
  updatePersonFilter();
}

function updateUserSelector() {
  const sel = document.getElementById('currentUser');
  if (!sel) return;  const cur = sel.value;
  sel.innerHTML = teamMembers.map(m => `<option value="${esc(m.name)}" ${m.name===cur?'selected':''}>${esc(m.name)}</option>`).join('');
  if (!cur && teamMembers.length) sel.value = teamMembers[0].name;
}

function updatePersonDropdowns() {
  ['todayPerson','calendarPerson'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">Everyone</option>' + appUsers.map(u => `<option value="${esc(u.display_name)}" ${u.display_name===cur?'selected':''}>${esc(u.display_name)}</option>`).join('');
  });
}

// ─── Nav Menu ──────────────────────────────────────────
function toggleNavMenu() {
  const dd = document.getElementById('navDropdown');
  dd.classList.toggle('open');
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.nav-menu-wrap')) {
    document.getElementById('navDropdown')?.classList.remove('open');
  }
});

// ─── Focus Timer ────────────────────────────────────────
// A persistent top-bar countdown. Set a duration, watch it tick down (with
// escalating urgency colours), survives view switches and page reloads.
let focusState = null;          // { label, taskId, endTs, paused, remainingMs, dinged }
let focusInterval = null;
let focusPendingTaskId = null;
let focusAudioCtx = null;

function focusFmt(ms) {
  const neg = ms < 0;
  let s = Math.round(Math.abs(ms) / 1000);
  const m = Math.floor(s / 60);
  return (neg ? '+' : '') + m + ':' + String(s % 60).padStart(2, '0');
}

function focusRemaining() {
  if (!focusState) return 0;
  return focusState.paused ? focusState.remainingMs : focusState.endTs - Date.now();
}

function persistFocus() {
  if (focusState) localStorage.setItem('nbm_focus', JSON.stringify(focusState));
  else localStorage.removeItem('nbm_focus');
}

function startFocus(label, minutes, taskId) {
  const total = Math.max(1, Math.min(240, minutes || 25)) * 60000;
  focusState = { label: label || 'Focus session', taskId: taskId || null, endTs: Date.now() + total, paused: false, remainingMs: total, dinged: false };
  persistFocus();
  // Unlock audio on this user gesture so the end chime can play later.
  try { focusAudioCtx = focusAudioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  // Focusing a task moves it to In Progress (single-tasking reinforcement) —
  // reload so the notebook draws its NOW ring straight away.
  if (taskId) {
    api(`/api/tasks/${taskId}`, { method: 'PUT', body: { task_status: 'in-progress' } })
      .then(() => loadClients()).catch(e => toast('Not saved — ' + e.message));
  }
  document.getElementById('focusStartPanel')?.classList.remove('open');
  renderFocusPill();
  clearInterval(focusInterval);
  focusInterval = setInterval(focusTick, 250);
  focusTick();
}

function renderFocusPill() {
  const pill = document.getElementById('focusTimer');
  if (!pill) return;
  if (!focusState) { pill.style.display = 'none'; return; }
  pill.style.display = '';
  const taskEl = document.getElementById('ftTask');
  taskEl.textContent = focusState.label;
  taskEl.style.cursor = focusState.taskId ? 'pointer' : 'default';
  document.getElementById('ftPause').innerHTML = focusState.paused ? '&#9654;' : '&#10073;&#10073;';
  const pop = document.getElementById('ftPop');
  if (pop) pop.style.display = focusPipSupported() ? '' : 'none';
}

function focusTick() {
  if (!focusState) return;
  const rem = focusRemaining();
  const pill = document.getElementById('focusTimer');
  document.getElementById('ftTime').textContent = focusFmt(rem);
  pill.classList.toggle('ft-paused', focusState.paused);
  pill.classList.toggle('ft-warn', !focusState.paused && rem <= 300000 && rem > 60000);
  pill.classList.toggle('ft-urgent', !focusState.paused && rem <= 60000 && rem > 0);
  pill.classList.toggle('ft-over', rem <= 0);
  document.title = (rem <= 0 ? '⏰ ' : '⏱ ') + focusFmt(rem) + ' · ' + (focusState.label || 'Focus');
  focusPipRender();
  if (rem <= 0 && !focusState.dinged) { focusState.dinged = true; persistFocus(); focusChime(); }
}

function focusTogglePause() {
  if (!focusState) return;
  if (focusState.paused) { focusState.endTs = Date.now() + focusState.remainingMs; focusState.paused = false; }
  else { focusState.remainingMs = focusRemaining(); focusState.paused = true; }
  persistFocus(); renderFocusPill(); focusTick();
}

function focusAdd(mins) {
  if (!focusState) return;
  if (focusState.paused) focusState.remainingMs += mins * 60000;
  else focusState.endTs += mins * 60000;
  focusState.dinged = false;
  persistFocus(); focusTick();
}

function focusStop() {
  clearInterval(focusInterval); focusInterval = null;
  focusState = null; persistFocus();
  focusPipClose();
  document.getElementById('focusTimer').style.display = 'none';
  document.title = 'North Bear Console';
  if (currentView === 'notebook') loadNotebookView();
}

function focusComplete() {
  const id = focusState?.taskId;
  if (id) {
    api(`/api/tasks/${id}`, { method: 'PUT', body: { task_status: 'done' } })
      .then(() => { try { celebrate(); } catch {} ; loadClients(); }).catch(e => toast('Not saved — ' + e.message));
  }
  focusStop();
}

function focusOpenTask() { if (focusState?.taskId) editTask(focusState.taskId); }

// ─── Pop-out timer — floats on top of EVERY window, park it by the camera ──
// Prefers Document Picture-in-Picture (Chrome); falls back to canvas→video
// PiP (Safari). Both give a small always-on-top countdown you can drag
// anywhere on screen — it keeps ticking over email, Photoshop, whatever.
let focusPipWin = null;
let focusPipCanvas = null;
let focusPipVideo = null;

function focusPipSupported() {
  return !!(window.documentPictureInPicture ||
    (document.pictureInPictureEnabled && HTMLCanvasElement.prototype.captureStream));
}

async function focusPopOut() {
  if (!focusState) return;
  try {
    if (window.documentPictureInPicture) {
      if (focusPipWin) { try { focusPipWin.focus(); } catch {} return; }
      const win = await documentPictureInPicture.requestWindow({ width: 250, height: 96 });
      focusPipWin = win;
      const st = win.document.createElement('style');
      st.textContent = `
        body{margin:0;background:#141a17;color:#eee;font-family:system-ui,sans-serif;
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          height:100vh;overflow:hidden;user-select:none}
        #l{font-size:11px;color:#9ab5a6;max-width:92%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #t{font-size:44px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.05;color:#3eaf84}
        .warn #t{color:#e7b549}
        .urgent #t,.over #t{color:#e05252}
        .over #t{animation:fl 1s steps(2) infinite}
        .paused #t{color:#8a938e}
        @keyframes fl{50%{opacity:.35}}`;
      win.document.head.appendChild(st);
      win.document.body.innerHTML = '<div id="l"></div><div id="t"></div>';
      win.addEventListener('pagehide', () => { focusPipWin = null; });
      focusPipRender();
    } else if (document.pictureInPictureEnabled && HTMLCanvasElement.prototype.captureStream) {
      if (!focusPipCanvas) {
        focusPipCanvas = document.createElement('canvas');
        focusPipCanvas.width = 480; focusPipCanvas.height = 180;
        focusPipVideo = document.createElement('video');
        focusPipVideo.muted = true; focusPipVideo.playsInline = true;
        focusPipVideo.srcObject = focusPipCanvas.captureStream(2);
        focusPipVideo.style.cssText = 'position:fixed;left:-9999px;bottom:0;width:2px;height:2px;';
        document.body.appendChild(focusPipVideo);
      }
      focusPipRender();
      await focusPipVideo.play();
      await focusPipVideo.requestPictureInPicture();
    }
  } catch (e) { console.warn('Pop-out timer unavailable:', e.message); focusFlashPill(); }
}

function focusPipRender() {
  if (!focusState) return;
  const rem = focusRemaining();
  const cls = focusState.paused ? 'paused' : rem <= 0 ? 'over' : rem <= 60000 ? 'urgent' : rem <= 300000 ? 'warn' : '';
  if (focusPipWin) {
    try {
      focusPipWin.document.body.className = cls;
      focusPipWin.document.getElementById('l').textContent = focusState.label || '';
      focusPipWin.document.getElementById('t').textContent = focusFmt(rem);
    } catch {}
  }
  if (focusPipCanvas && document.pictureInPictureElement === focusPipVideo) {
    const c = focusPipCanvas.getContext('2d');
    c.fillStyle = '#141a17'; c.fillRect(0, 0, 480, 180);
    c.textAlign = 'center';
    c.fillStyle = '#9ab5a6'; c.font = '20px system-ui';
    c.fillText((focusState.label || '').slice(0, 36), 240, 42);
    c.fillStyle = focusState.paused ? '#8a938e' : rem <= 60000 ? '#e05252' : rem <= 300000 ? '#e7b549' : '#3eaf84';
    c.font = '700 88px system-ui';
    c.fillText(focusFmt(rem), 240, 142);
  }
}

function focusPipClose() {
  if (focusPipWin) { try { focusPipWin.close(); } catch {} focusPipWin = null; }
  if (focusPipVideo && document.pictureInPictureElement === focusPipVideo) {
    document.exitPictureInPicture().catch(() => {});
  }
}

// No pop-out available (or it failed): pulse the pill so the eye finds it.
function focusFlashPill() {
  const pill = document.getElementById('focusTimer');
  if (!pill) return;
  pill.classList.remove('ft-flash'); void pill.offsetWidth;
  pill.classList.add('ft-flash');
}

// A task is "NOW" when it's in progress and on my plate.
function nbIsNow(t) {
  return t && t.task_status === 'in-progress'
    && (!t.assignee || (currentUser && t.assignee === currentUser.display_name));
}

// Clicking a NOW-ringed line in the notebook: bring the timer up.
function nbNowClick(id) {
  if (focusState && focusState.taskId === id) {
    if (focusPipSupported()) focusPopOut(); else focusFlashPill();
    return;
  }
  focusForTask(id);
}

// Take the NOW ring off: back to Scheduled, and stop its timer if running.
async function nbNowOff(id) {
  const t = findTaskById(id);
  if (!t) return;
  const prevStatus = t.task_status;
  if (focusState && focusState.taskId === id) focusStop();
  try {
    await api(`/api/tasks/${id}`, { method: 'PUT', body: { task_status: 'scheduled' } });
    nbPushUndo('take off NOW', async () => {
      await api(`/api/tasks/${id}`, { method: 'PUT', body: { task_status: prevStatus } });
    });
    await loadClients();
  } catch {}
}

function focusChime() {
  try {
    const ctx = focusAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880 - i * 110; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.24);
    });
  } catch {}
}

// Start panel
function toggleFocusStart(e) {
  if (e) e.stopPropagation();
  const p = document.getElementById('focusStartPanel');
  p.classList.toggle('open');
  if (p.classList.contains('open')) { focusPendingTaskId = null; setTimeout(() => document.getElementById('fsLabel').focus(), 30); }
}
function fsSetMins(m) { document.getElementById('fsMins').value = m; document.getElementById('fsMins').focus(); }
function focusStartFromPanel() {
  const label = document.getElementById('fsLabel').value.trim() || 'Focus session';
  const mins = parseInt(document.getElementById('fsMins').value) || 25;
  startFocus(label, mins, focusPendingTaskId);
  focusPendingTaskId = null;
}
// Launch the start panel pre-filled for a specific task (e.g. from the Battle Plan).
function focusForTask(id) {
  const t = findTaskById(id);
  if (!t) return;
  focusPendingTaskId = id;
  document.getElementById('fsLabel').value = t.title;
  const est = t.estimated_hours ? Math.round(t.estimated_hours * 60) : 25;
  document.getElementById('fsMins').value = est || 25;
  document.getElementById('focusStartPanel').classList.add('open');
  setTimeout(() => document.getElementById('fsMins').focus(), 30);
}
document.addEventListener('click', (e) => {
  // Ignore clicks inside the notebook menu/palette — their items OPEN this
  // panel, and the same click would otherwise bubble here and shut it again.
  if (!e.target.closest('.focus-wrap') && !e.target.closest('.focus-start')
    && !e.target.closest('#nbMenu') && !e.target.closest('#nbPalette')
    && !e.target.closest('.nb-now-ring') && !e.target.closest('.nb-now-tag')) {
    document.getElementById('focusStartPanel')?.classList.remove('open');
  }
});

function restoreFocus() {
  try {
    const s = JSON.parse(localStorage.getItem('nbm_focus'));
    if (!s) return;
    focusState = s;
    renderFocusPill();
    clearInterval(focusInterval);
    focusInterval = setInterval(focusTick, 250);
    focusTick();
  } catch {}
}
restoreFocus();

function updateClientFilterDropdown() {
  const sel = document.getElementById('clientFilter');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">All Clients</option>' + clients.map(c => `<option value="${c.id}" ${String(c.id)===cur?'selected':''}>${esc(c.name)}</option>`).join('');
}

function updatePersonFilter() {
  const sel = document.getElementById('personFilter');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">All People</option>' + appUsers.map(u => `<option value="${esc(u.display_name)}" ${u.display_name===cur?'selected':''}>${esc(u.display_name)}</option>`).join('');
}

// ─── Per-user preferences (server-synced) ───────────────
// localStorage is per-device and iOS can purge it — the server copy is the
// source of truth so the notebook/format looks identical on every device.
let appPrefs = {};
let prefsSaveTimer = null;

function setPref(key, value) {
  appPrefs[key] = value;
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch {}
  clearTimeout(prefsSaveTimer);
  prefsSaveTimer = setTimeout(() => {
    api('/api/prefs', { method: 'PUT', body: appPrefs }).catch(() => {});
  }, 800);
}

async function loadServerPrefs() {
  try {
    const sp = await api('/api/prefs');
    if (!sp || typeof sp !== 'object') return;
    appPrefs = { ...sp };
    // Apply known keys (validated) over the localStorage-seeded defaults.
    if (typeof sp.nbm_nb_tab === 'string' && ['all','today','week','waiting','done'].includes(sp.nbm_nb_tab)) nbTab = sp.nbm_nb_tab;
    if (typeof sp.nbm_nb_client === 'string') nbClient = sp.nbm_nb_client;
    if (typeof sp.nbm_nb_order === 'string' && NB_ORDERS.includes(sp.nbm_nb_order)) nbOrder = sp.nbm_nb_order;
    if (typeof sp.nbm_nb_font === 'string' && NB_PENS[sp.nbm_nb_font]) nbFont = sp.nbm_nb_font;
    { const n = parseFloat(sp.nbm_nb_size); if (Number.isFinite(n) && n >= 0.7 && n <= 1.5) nbSize = n; }
    if (sp.nbm_nb_hidedone === '1' || sp.nbm_nb_hidedone === '0') nbHideDone = sp.nbm_nb_hidedone === '1';
    if (typeof sp.nbm_nb_hl === 'string' && NB_HLS[sp.nbm_nb_hl]) nbHl = sp.nbm_nb_hl;
    if (sp.nbm_board_density === 'rows' || sp.nbm_board_density === 'cards') boardDensity = sp.nbm_board_density;
    if (typeof sp.nbm_nb_newclient === 'string') { try { localStorage.setItem('nbm_nb_newclient', sp.nbm_nb_newclient); } catch {} }
    // Mirror everything locally for instant next boot.
    for (const [k, v] of Object.entries(sp)) { try { localStorage.setItem(k, String(v)); } catch {} }
    applyNbFont();
  } catch {}
}

// ─── View Switching ─────────────────────────────────────
function applyViewVisibility() {
  const views = { dashboard: 'dashboardView', notebook: 'notebookView', inbox: 'inboxView', clients: 'clientsView', today: 'todayView', planning: 'planningView', calendar: 'calendarView', focus: 'focusView', email: 'emailView' };
  for (const [v, id] of Object.entries(views)) {
    const el = document.getElementById(id);
    if (el) el.style.display = currentView === v ? '' : 'none';
  }
  document.getElementById('clientSubBar').style.display = currentView === 'clients' ? '' : 'none';
  document.getElementById('workloadSummary').style.display = currentView === 'clients' ? 'flex' : 'none';
}

// Views tucked into the "More" overflow — same functions, less shopfront.
const OVERFLOW_VIEWS = ['today', 'calendar', 'focus', 'email'];

function switchView(view) {
  document.querySelectorAll('.nav-tab[data-view], .nav-dropdown-item[data-view]').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  // On phones the nav scrolls — keep the active tab in view.
  try { document.querySelector(`.nav-tab[data-view="${view}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch {}
  document.getElementById('navMoreBtn')?.classList.toggle('active', OVERFLOW_VIEWS.includes(view));
  document.getElementById('navMoreDropdown')?.classList.remove('open');
  currentView = view;
  setPref('nbm_view', view);
  applyViewVisibility();
  if (view === 'dashboard') loadDashboard();
  if (view === 'notebook') loadNotebookView();
  if (view === 'inbox') loadInboxView();
  if (view === 'clients') renderClients();
  if (view === 'today') loadTodayView();
  if (view === 'planning') loadPlanningView();
  if (view === 'calendar') loadCalendarView();
  if (view === 'focus') loadFocusView();
  if (view === 'email') loadEmailView();
}

document.querySelectorAll('.nav-tab[data-view], .nav-dropdown-item[data-view]').forEach(tab => {
  tab.addEventListener('click', () => switchView(tab.dataset.view));
});

function toggleNavMore(e) {
  if (e) e.stopPropagation();
  document.getElementById('navMoreDropdown').classList.toggle('open');
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.nav-more-wrap')) {
    document.getElementById('navMoreDropdown')?.classList.remove('open');
  }
});

// ─── Dashboard ─────────────────────────────────────────
let dashWaConfigs = [];
let bpDoNowCount = 0;

async function loadDashboard() {
  renderDashGreeting();
  renderDashStats();
  renderBattlePlan();
  renderDashMomentum();
  renderControlBoard();
  // Integrations strip (preserved widgets, relocated below the board)
  renderDashUrgentTasks();
  renderDashSchedule();
  loadDashEmails();
  loadDashXero();
  loadDashWhatsApp();
  loadDashAnalytics();
  renderDashSocial();
  loadDashActivity();
}

function toggleIntegrationsStrip() {
  const strip = document.getElementById('integrationsStrip');
  const tog = document.getElementById('stripToggle');
  const open = strip.style.display !== 'none';
  strip.style.display = open ? 'none' : '';
  tog.innerHTML = open ? '&#9654;' : '&#9660;';
}

// ─── Client Control Board ───────────────────────────────
function clientControlData(c) {
  const status = c.resolved_status || c.computed_status || 'green';
  const risk = c.resolved_risk || c.computed_risk || 'low';
  const b = c.board || {};
  return { status, risk, b };
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.floor((now - d) / 864e5);
}

function lastContactLabel(dateStr) {
  const n = daysSince(dateStr);
  if (n === null) return 'Last contact: not set';
  if (n <= 0) return 'Last contact: today';
  if (n === 1) return 'Last contact: yesterday';
  return `Last contact: ${n} days ago`;
}

// Relative date language ("3d ago", "tomorrow") — faster to parse than raw dates.
function relDate(ds) {
  const n = daysSince(ds);
  if (n === null) return '';
  if (n === 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n === -1) return 'tomorrow';
  return n > 1 ? `${n}d ago` : `in ${-n}d`;
}
// Rendered span with urgency colouring + the real date in the tooltip.
function relDateHtml(ds) {
  if (!ds) return '—';
  const n = daysSince(ds);
  const cls = n > 0 ? 'rel-over' : (n === 0 || n === -1) ? 'rel-soon' : '';
  return `<span class="${cls}" title="${ds}">${relDate(ds)}</span>`;
}

// Format estimated hours as 15m / 45m / 1h / 2h 30m. Empty string when none.
function fmtEstTime(h) {
  if (!h || h <= 0) return '';
  const mins = Math.round(h * 60);
  if (mins < 60) return mins + 'm';
  const hh = Math.floor(mins / 60), mm = mins % 60;
  return mm ? `${hh}h ${mm}m` : `${hh}h`;
}

// Total estimated time of a client's OPEN (active, canonical) tasks.
function openWorkload(c) {
  return (c.tasks || []).filter(isOpenTask).reduce((s, t) => s + (t.estimated_hours || 0), 0);
}

// Monthly value chip text. "£345/month" when populated, else the client type.
function clientValueLabel(c) {
  if (c.monthly_value) return `£${Number(c.monthly_value).toLocaleString('en-GB')}/month`;
  return typeLabelClient(c.client_type);
}

// One short recommended next action per client (rule-based).
function clientNextAction(c) {
  const today = localDateStr(new Date());
  const open = (c.tasks || []).filter(isOpenTask);
  const b = c.board || {};
  if ((b.overdue || 0) > 0) return { text: `Finish ${b.overdue} overdue task${b.overdue > 1 ? 's' : ''}`, urgent: true };
  const urgent = open.filter(t => t.task_type === 'urgent');
  if (urgent.length) return { text: `Handle urgent: ${urgent[0].title}`, urgent: true };
  const waitingMe = open.filter(t => t.task_status === 'waiting-on-me');
  if (waitingMe.length) return { text: `Review waiting item${waitingMe.length > 1 ? 's' : ''}`, urgent: false };
  if (open.length && open.every(t => t.task_status === 'waiting-on-client')) return { text: 'Chase client for assets', urgent: false };
  const dueToday = open.filter(t => (t.planned_date || t.deadline) === today || t.task_band === 'today');
  if (dueToday.length) return { text: `Do ${dueToday.length} task${dueToday.length > 1 ? 's' : ''} due today`, urgent: false };
  if (c.client_type === 'retainer' && open.length && !c.next_scheduled_date) return { text: 'Schedule next work block', urgent: false };
  const lc = daysSince(c.last_contact_date);
  if (lc !== null && lc > 14) return { text: 'Reconnect — no recent contact', urgent: false };
  if (open.length) return { text: `Progress ${open.length} open task${open.length > 1 ? 's' : ''}`, urgent: false };
  if (c.client_type === 'prospect') return { text: 'Follow up to win the work', urgent: false };
  return { text: 'No action needed', urgent: false };
}

// Today's Battle Plan — short, rule-based, grouped Do now / Do next / Can wait.
// Uses ONLY active canonical tasks: c.tasks is already non-archived (server-side),
// isOpenTask() excludes done/cancelled, and overdue is computed from the deadline.
function renderBattlePlan() {
  const el = document.getElementById('battlePlanBody');
  const section = document.getElementById('battlePlan');
  if (!el || !section) return;
  const today = localDateStr(new Date());
  const tasks = allTasksFlat().filter(t => !t.client_is_system && isOpenTask(t));

  const isOverdue = t => t.deadline && t.deadline < today;
  const isUrgent = t => t.task_type === 'urgent';
  const isToday = t => t.task_band === 'today' || (t.planned_date || t.deadline) === today;
  const redClientIds = new Set(clients.filter(c => !c.is_system && !c.archived && clientControlData(c).status === 'red').map(c => c.id));
  const isCrit = t => redClientIds.has(t.client_id);
  const score = t => (isOverdue(t) ? -8 : 0) + (isUrgent(t) ? -4 : 0) + (isCrit(t) ? -2 : 0) + (isToday(t) ? -1 : 0);
  const used = new Set();

  // Do now: the 1–2 most pressing overdue/urgent items.
  const doNow = tasks.filter(t => isOverdue(t) || isUrgent(t)).sort((a, b) => score(a) - score(b)).slice(0, 2);
  doNow.forEach(t => used.add(t.id));
  // Do next: remaining today / urgent / high-risk-client tasks (max 5).
  const doNext = tasks.filter(t => !used.has(t.id) && (isToday(t) || isUrgent(t) || isCrit(t))).sort((a, b) => score(a) - score(b)).slice(0, 5);
  doNext.forEach(t => used.add(t.id));
  // Can wait: lower-priority overdue / this-week items that are not client-critical (max 4).
  const canWait = tasks.filter(t => !used.has(t.id) && (isOverdue(t) || t.task_band === 'this-week') && !isCrit(t)).sort((a, b) => score(a) - score(b)).slice(0, 4);

  function iconFor(t) {
    if (isOverdue(t)) return '🔴';
    if (isUrgent(t)) return '🔥';
    if (t.task_type === 'admin') return '🗂';
    if (isToday(t)) return '☼';
    return '▸';
  }
  // A one-word "why this is here" — trust in the ordering means less re-checking the board.
  function whyFor(t) {
    if (isOverdue(t)) { const n = daysSince(t.deadline); return { text: n === 1 ? '1d overdue' : `${n}d overdue`, bad: true }; }
    if (isUrgent(t)) return { text: 'urgent', bad: true };
    if (isToday(t)) return { text: 'due today', bad: false };
    if (isCrit(t)) return { text: 'client red', bad: false };
    if (t.task_band === 'this-week') return { text: 'this week', bad: false };
    return null;
  }
  function itemHtml(t) {
    const est = fmtEstTime(t.estimated_hours);
    const why = whyFor(t);
    return `<div class="bp-item">
      <span class="bp-icon">${iconFor(t)}</span>
      <span class="bp-text" onclick="editTask(${t.id})" title="Open task">${esc(t.title)}</span>
      ${why ? `<span class="bp-why ${why.bad ? 'bp-why-bad' : ''}">${why.text}</span>` : ''}
      ${est ? `<span class="bp-est">${est}</span>` : ''}
      <span class="bp-sub">${esc(t.client_name || '')}</span>
      <span class="bp-actions">
        <button class="bp-act bp-focus" title="Start focus timer" onclick="event.stopPropagation();focusForTask(${t.id})">&#9201;</button>
        <button class="bp-act bp-done" title="Mark done" onclick="event.stopPropagation();bpDone(${t.id})">&#10003;</button>
        <select class="bp-resched" title="Reschedule" onchange="bpReschedule(${t.id}, this.value)" onclick="event.stopPropagation()">
          <option value="">Move&hellip;</option>
          <option value="tomorrow">Tomorrow</option>
          <option value="this-week">Later this week</option>
          <option value="next-week">Next week</option>
        </select>
        <button class="bp-act" title="Open" onclick="event.stopPropagation();editTask(${t.id})">&#8599;</button>
      </span>
    </div>`;
  }
  // Group headers show the summed estimate — the pile is visibly bounded ("~1h 20m", not "??").
  const group = (title, cls, arr) => {
    if (!arr.length) return '';
    const est = arr.reduce((s, t) => s + (t.estimated_hours || 0), 0);
    return `<div class="bp-group ${cls}"><div class="bp-group-title">${title}${est > 0 ? ` <span class="bp-group-est">· ~${fmtEstTime(est)}</span>` : ''}</div>${arr.map(itemHtml).join('')}</div>`;
  };

  bpDoNowCount = doNow.length;
  section.style.display = '';
  if (!doNow.length && !doNext.length && !canWait.length) {
    el.innerHTML = '<div class="bp-empty">✓ Nothing on fire. Pick from the board below, or plan your week.</div>';
    return;
  }
  el.innerHTML =
    group('Do now', 'bp-now', doNow) +
    group('Do next', 'bp-next', doNext) +
    group('Can wait', 'bp-wait', canWait);
}

async function bpDone(id) {
  try { await api(`/api/tasks/${id}`, { method: 'PUT', body: { task_status: 'done' } }); await loadClients(); }
  catch (e) { toast('Not saved — ' + e.message); loadClients(); }
}

async function bpReschedule(id, when) {
  if (!when) return;
  const d = new Date(); d.setHours(0, 0, 0, 0);
  let band = 'this-week';
  if (when === 'tomorrow') { d.setDate(d.getDate() + 1); }
  else if (when === 'this-week') { const dow = d.getDay(); const toFri = (5 - dow + 7) % 7 || 3; d.setDate(d.getDate() + toFri); }
  else if (when === 'next-week') { const dow = d.getDay(); const toMon = ((8 - dow) % 7) || 7; d.setDate(d.getDate() + toMon); band = 'scheduled'; }
  const planned = localDateStr(d);
  try { await api(`/api/tasks/${id}`, { method: 'PUT', body: { planned_date: planned, task_band: band } }); await loadClients(); }
  catch (e) { toast('Not saved — ' + e.message); loadClients(); }
}

function renderControlBoard() {
  const board = document.getElementById('controlBoard');
  if (!board) return;
  const statusF = document.getElementById('cbStatusFilter')?.value || '';
  const typeF = document.getElementById('cbTypeFilter')?.value || '';
  const sortBy = document.getElementById('cbSort')?.value || 'risk';

  // Real clients only (exclude the system "Unassigned" bucket and archived)
  let list = clients.filter(c => !c.is_system && !c.archived);
  if (statusF) list = list.filter(c => clientControlData(c).status === statusF);
  if (typeF) list = list.filter(c => (c.client_type || '') === typeF);

  const riskRank = { red: 0, amber: 1, blue: 2, green: 3 };
  list.sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'value') return (b.monthly_value || 0) - (a.monthly_value || 0);
    if (sortBy === 'outstanding') return ((b.board?.outstanding) || 0) - ((a.board?.outstanding) || 0);
    // default: risk (red first), then by monthly value
    const ra = riskRank[clientControlData(a).status] ?? 3;
    const rb = riskRank[clientControlData(b).status] ?? 3;
    if (ra !== rb) return ra - rb;
    return (b.monthly_value || 0) - (a.monthly_value || 0);
  });

  if (!list.length) {
    board.innerHTML = '<div class="dash-widget-empty" style="grid-column:1/-1">No clients match these filters.</div>';
    return;
  }
  const compact = boardDensity === 'rows';
  board.className = compact ? 'cb-list' : 'cb-grid';
  const densBtn = document.getElementById('cbDensity');
  if (densBtn) densBtn.innerHTML = compact ? '&#9638;' : '&#9776;';
  board.innerHTML = list.map(compact ? clientRowHTML : clientCardHTML).join('');
}

// Compact one-line-per-client mode: scanning becomes linear instead of grid-hopping.
let boardDensity = localStorage.getItem('nbm_board_density') || 'cards';
function toggleBoardDensity() {
  boardDensity = boardDensity === 'cards' ? 'rows' : 'cards';
  setPref('nbm_board_density', boardDensity);
  renderControlBoard();
}

function clientRowHTML(c) {
  const { status, risk, b } = clientControlData(c);
  const sCfg = CONTROL_STATUS[status] || CONTROL_STATUS.green;
  const na = clientNextAction(c);
  const lcDays = daysSince(c.last_contact_date);
  const lcStale = lcDays !== null && lcDays > 14;
  return `<div class="cb-row rag-border-${status}" onclick="openClientDetail(${c.id})">
    <span class="rag-dot ${sCfg.cls}" title="${sCfg.label}"></span>
    <span class="cb-row-name">${esc(c.name)}</span>
    <span class="cb-row-next ${na.urgent ? 'cb-row-next-urgent' : ''}">➜ ${esc(na.text)}</span>
    ${b.overdue ? `<span class="cb-stat cb-stat-bad">${b.overdue} overdue</span>` : ''}
    ${lcStale ? `<span class="cb-row-stale" title="${lastContactLabel(c.last_contact_date)}">⚠ ${lcDays}d</span>` : ''}
    <span class="cb-row-value">${c.monthly_value ? clientValueLabel(c) : typeLabelClient(c.client_type)}</span>
  </div>`;
}

function fmtMoney(n) {
  if (!n) return '£0';
  return '£' + Number(n).toLocaleString('en-GB');
}

function clientCardHTML(c) {
  const { status, risk, b } = clientControlData(c);
  const sCfg = CONTROL_STATUS[status] || CONTROL_STATUS.green;
  const overrideTag = c.control_status ? '<span class="cb-override" title="Manual override">override</span>' : '';
  const logo = c.logo_url ? `<img src="${esc(c.logo_url)}" class="cb-logo" alt="">` : `<span class="cb-logo cb-logo-code">${esc(c.code || c.name.substring(0,3))}</span>`;
  const na = clientNextAction(c);
  const lcDays = daysSince(c.last_contact_date);
  const lcStale = lcDays !== null && lcDays > 14;
  const weekly = c.monthly_value ? Math.round(c.monthly_value / 4.345) : 0;
  const valueChip = c.monthly_value
    ? `<span class="cb-value-chip" title="≈ ${fmtMoney(weekly)}/week">${clientValueLabel(c)}</span>`
    : `<span class="cb-value-chip cb-value-type">${esc(typeLabelClient(c.client_type))}</span>`;
  const workload = openWorkload(c);
  const workloadLine = workload > 0 ? `<span title="Total estimated time of open tasks">Open workload: ${fmtEstTime(workload)}</span>` : '';
  return `<div class="cb-card rag-border-${status}" onclick="openClientDetail(${c.id})">
    <div class="cb-card-top">
      ${logo}
      <div class="cb-card-name">
        <div class="cb-name">${esc(c.name)} ${c.is_private?'<span title="Private">🔒</span>':''}</div>
        <div class="cb-sub">${esc(typeLabelClient(c.client_type))}</div>
      </div>
      ${valueChip}
      <span class="rag-dot ${sCfg.cls}" title="${sCfg.label}"></span>
    </div>
    <div class="cb-next ${na.urgent?'cb-next-urgent':''}" title="Recommended next action"><span class="cb-next-arrow">➜</span> ${esc(na.text)}</div>
    <div class="cb-stats">
      <span class="cb-stat ${b.overdue?'cb-stat-bad':''}" title="Overdue">${b.overdue||0} overdue</span>
      <span class="cb-stat" title="Outstanding tasks">${b.outstanding||0} open</span>
      <span class="cb-stat" title="Waiting">${b.waiting||0} waiting</span>
      ${workloadLine ? `<span class="cb-stat cb-stat-workload">${workloadLine}</span>` : ''}
    </div>
    <div class="cb-meta">
      <span title="Next due">Due: ${b.next_due_date ? relDateHtml(b.next_due_date) : '—'}</span>
      <span title="Next scheduled work">Sched: ${c.next_scheduled_date ? relDateHtml(c.next_scheduled_date) : '—'}</span>
      <span class="risk-badge risk-${risk}" title="Risk">${(RISK[risk]||'')} risk</span>
    </div>
    <div class="cb-contact ${lcStale?'cb-contact-stale':''}" title="Last contact">${lastContactLabel(c.last_contact_date)}${lcStale?' ⚠':''}</div>
    <div class="cb-status-line"><span class="rag-pill ${sCfg.cls}">${sCfg.label}</span>${overrideTag}</div>
  </div>`;
}

function typeLabelClient(t) {
  return { retainer: 'Retainer', project: 'Project', 'ad-hoc': 'Ad hoc', prospect: 'Prospect' }[t] || (t || '—');
}

function openClientDetail(id) {
  const c = clients.find(x => x.id === id);
  if (!c) return;
  const { status, risk, b } = clientControlData(c);
  const sCfg = CONTROL_STATUS[status] || CONTROL_STATUS.green;
  document.getElementById('clientDetailTitle').textContent = c.name;
  const tasks = c.tasks || [];
  const isWaiting = t => t.task_status === 'waiting-on-client' || t.task_status === 'waiting-on-me';
  const recurring = tasks.filter(t => isOpenTask(t) && (t.task_type === 'recurring' || t.is_recurring));
  const waiting = tasks.filter(isWaiting);
  const adhoc = tasks.filter(t => isOpenTask(t) && !isWaiting(t) && t.task_type !== 'recurring' && !t.is_recurring);
  const completed = tasks.filter(t => t.task_status === 'done');
  const taskLine = t => `<div class="cd-task" onclick="openTaskFromClient(${c.id},${t.id})">
      <span class="status-badge status-${t.task_status}">${statusLabel(t.task_status)}</span>
      <span class="cd-task-title">${esc(t.title)}</span>
      ${t.task_band ? `<span class="band-badge ${bandClass(t.task_band)}">${bandLabel(t.task_band)}</span>` : ''}
      ${t.deadline ? `<span class="cd-task-due ${getDeadlineClass(t.deadline, t.progress)}">${fmtDateShort(t.deadline)}</span>` : ''}
    </div>`;
  const section = (title, arr) => arr.length ? `<div class="cd-section"><h4>${title} (${arr.length})</h4>${arr.map(taskLine).join('')}</div>` : '';
  const links = [];
  if (c.gmail_link) links.push(`<a href="${esc(c.gmail_link)}" target="_blank" class="btn btn-ghost btn-sm">✉ Gmail</a>`);
  if (c.drive_link) links.push(`<a href="${esc(c.drive_link)}" target="_blank" class="btn btn-ghost btn-sm">📁 Drive</a>`);
  document.getElementById('clientDetailBody').innerHTML = `
    <div class="cd-head">
      <span class="rag-pill ${sCfg.cls}">${sCfg.label}</span>
      <span class="risk-badge risk-${risk}">${RISK[risk] || ''} risk</span>
      <span class="cd-type">${typeLabelClient(c.client_type)}</span>
      ${c.monthly_value ? `<span class="cd-value">${fmtMoney(c.monthly_value)}/mo</span>` : ''}
      <span style="flex:1"></span>
      <button class="btn btn-ghost btn-sm" onclick="closeModal('clientDetailModal');editClient(${c.id})">Edit client</button>
      <button class="btn btn-primary btn-sm" onclick="newTaskFromClient(${c.id})">+ Task</button>
    </div>
    <div class="cd-grid">
      <div>
        ${c.agreement_summary ? `<div class="cd-block"><h4>Agreement</h4><p>${esc(c.agreement_summary)}</p></div>` : ''}
        ${c.recurring_deliverables ? `<div class="cd-block"><h4>Recurring deliverables</h4><p style="white-space:pre-wrap">${esc(c.recurring_deliverables)}</p></div>` : ''}
        ${c.notes ? `<div class="cd-block"><h4>Notes</h4><p style="white-space:pre-wrap">${esc(c.notes)}</p></div>` : ''}
        ${c.important_contacts ? `<div class="cd-block"><h4>Important contacts</h4><p style="white-space:pre-wrap">${esc(c.important_contacts)}</p></div>` : ''}
        ${links.length ? `<div class="cd-block"><h4>Links</h4><div style="display:flex;gap:8px">${links.join('')}</div></div>` : ''}
        <div class="cd-block"><h4>Key dates</h4><p>Last contact: ${c.last_contact_date || '—'}<br>Next scheduled: ${c.next_scheduled_date || '—'}<br>Next due: ${b.next_due_date ? fmtDateShort(b.next_due_date) : '—'}</p></div>
      </div>
      <div>
        ${section('Waiting', waiting)}
        ${section('Recurring', recurring)}
        ${section('Ad hoc / open', adhoc)}
        ${section('Completed', completed.slice(0, 10))}
        ${tasks.length === 0 ? '<div class="dash-widget-empty">No tasks yet.</div>' : ''}
      </div>
    </div>`;
  openModal('clientDetailModal');
}

function renderDashGreeting() {
  const name = currentUser?.display_name?.split(' ')[0] || 'there';
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('dashGreeting').textContent = `${greeting}, ${name}`;
  const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  document.getElementById('dashDate').textContent = new Date().toLocaleDateString('en-GB', opts);
}

// Momentum strip — visible progress is the dopamine ADHD brains under-supply themselves.
function renderDashMomentum() {
  const el = document.getElementById('dashMomentum');
  if (!el) return;
  const today = localDateStr(new Date());
  const done = allTasksFlat().filter(t => t.task_status === 'done' && (t.completed_at || '') === today).length;
  if (!done && !bpDoNowCount) { el.innerHTML = ''; return; }
  el.innerHTML = `${done ? `&#9989; <strong>${done}</strong> done today` : ''}${done && bpDoNowCount ? ' &middot; ' : ''}${bpDoNowCount ? `<strong>${bpDoNowCount}</strong> in Do-now` : ''}`;
}

function renderDashStats() {
  const today = localDateStr(new Date());
  let overdue = 0, dueToday = 0, waiting = 0, inbox = 0;
  for (const c of clients) {
    for (const t of (c.tasks || [])) {
      if (!isOpenTask(t)) continue;
      if (t.task_status === 'inbox') inbox++;
      if (t.task_status === 'waiting-on-client' || t.task_status === 'waiting-on-me') waiting++;
      const d = t.planned_date || t.deadline || '';
      if (t.deadline && t.deadline < today) overdue++;
      if (d === today) dueToday++;
    }
  }
  const atRisk = clients.filter(c => !c.is_system && !c.archived && ['red','amber'].includes(clientControlData(c).status)).length;
  // Every stat is a door: it opens the view where you can act on the number.
  document.getElementById('dashStats').innerHTML = `
    <div class="dash-stat dash-stat--danger" onclick="switchView('planning')" title="Open Planning — Overdue section"><div class="dash-stat-icon">&#9888;</div><div class="dash-stat-value">${overdue}</div><div class="dash-stat-label">Overdue</div></div>
    <div class="dash-stat dash-stat--warning" onclick="document.getElementById('controlBoardSection').scrollIntoView({behavior:'smooth'})" title="Scroll to the board (sorted risk-first)"><div class="dash-stat-icon">&#9888;</div><div class="dash-stat-value">${atRisk}</div><div class="dash-stat-label">At-risk Clients</div></div>
    <div class="dash-stat dash-stat--blue" onclick="switchView('today')" title="Open Today"><div class="dash-stat-icon">&#128197;</div><div class="dash-stat-value">${dueToday}</div><div class="dash-stat-label">Due Today</div></div>
    <div class="dash-stat dash-stat--teal" onclick="switchView('planning')" title="Open Planning — Waiting section"><div class="dash-stat-icon">&#9203;</div><div class="dash-stat-value">${waiting}</div><div class="dash-stat-label">Waiting</div></div>
    <div class="dash-stat dash-stat--purple" id="dashStatInbox" onclick="switchView('inbox')" title="Open the Inbox"><div class="dash-stat-icon">&#128229;</div><div class="dash-stat-value">${inbox}</div><div class="dash-stat-label">Inbox</div></div>
    <div class="dash-stat dash-stat--orange" id="dashStatMessages" style="display:none" onclick="openIntegrationsStrip()" title="Open the Workspace strip"><div class="dash-stat-icon">&#128172;</div><div class="dash-stat-value">—</div><div class="dash-stat-label">Messages</div></div>
  `;
}

function openIntegrationsStrip() {
  const strip = document.getElementById('integrationsStrip');
  if (strip.style.display === 'none') toggleIntegrationsStrip();
  strip.scrollIntoView({ behavior: 'smooth' });
}

function renderDashUrgentTasks() {
  const today = localDateStr(new Date());
  const tasks = [];
  for (const c of clients) {
    if (c.is_system) continue;
    for (const t of (c.tasks || [])) {
      if (!isOpenTask(t)) continue;
      const isOverdue = t.deadline && t.deadline < today;
      const isUrgent = t.task_type === 'urgent' || t.task_band === 'today';
      if (isOverdue || isUrgent) tasks.push({ ...t, client_name: c.name, client_code: c.code, overdue: isOverdue });
    }
  }
  tasks.sort((a, b) => (a.overdue === b.overdue ? 0 : a.overdue ? -1 : 1));
  const body = document.getElementById('dashUrgentBody');
  if (!tasks.length) { body.innerHTML = '<div class="dash-widget-empty">No urgent tasks right now</div>'; return; }
  body.innerHTML = tasks.slice(0, 8).map(t => {
    const badge = t.overdue ? '<span class="badge badge-danger">Overdue</span>' : `<span class="badge badge-warning">${bandLabel(t.task_band) || typeLabel(t.task_type)}</span>`;
    return `<div class="dash-widget-row" onclick="editTask(${t.id})"><div class="dash-widget-row-title">${esc(t.title)}</div><div class="dash-widget-row-meta">${esc(t.client_name)}</div>${badge}</div>`;
  }).join('');
}

function renderDashSchedule() {
  const today = localDateStr(new Date());
  const tasks = [];
  for (const c of clients) {
    if (c.is_system) continue;
    for (const t of (c.tasks || [])) {
      if (!isOpenTask(t)) continue;
      const d = t.planned_date || t.deadline || '';
      if (d === today || t.task_band === 'today') tasks.push({ ...t, client_name: c.name });
    }
  }
  const body = document.getElementById('dashScheduleBody');
  if (!tasks.length) { body.innerHTML = '<div class="dash-widget-empty">Nothing scheduled today</div>'; return; }
  body.innerHTML = tasks.map(t => {
    const hours = t.estimated_hours ? `<span class="dash-widget-row-meta">${t.estimated_hours}h</span>` : '';
    return `<div class="dash-widget-row" onclick="editTask(${t.id})"><div class="dash-widget-row-title">${esc(t.title)}</div><div class="dash-widget-row-meta">${esc(t.assignee || 'Unassigned')} · ${esc(t.client_name)}</div>${hours}</div>`;
  }).join('');
}

async function loadDashEmails() {
  const body = document.getElementById('dashEmailBody');
  // No server-side Gmail config = dead widget. Hide it rather than show a permanent placeholder.
  if (!gmailServerConfigured) { document.getElementById('dashEmails').style.display = 'none'; return; }
  document.getElementById('dashEmails').style.display = '';
  if (!gmailConnected) {
    body.innerHTML = '<div class="dash-widget-empty"><div style="font-size:28px;margin-bottom:8px">&#9993;</div><p>Connect Gmail to see your inbox</p><a href="/auth/gmail/connect" class="dash-connect-btn">Connect Gmail</a></div>';
    return;
  }
  body.innerHTML = '<div class="dash-widget-empty">Loading...</div>';
  try {
    const data = await api('/api/gmail/inbox?label=INBOX');
    const unread = (data.messages || []).filter(m => m.unread).length;
    const emailStat = document.getElementById('dashStatEmails');
    if (emailStat) emailStat.querySelector('.dash-stat-value').textContent = unread;
    if (!data.messages?.length) { body.innerHTML = '<div class="dash-widget-empty">Inbox empty</div>'; return; }
    body.innerHTML = data.messages.slice(0, 6).map(m => {
      const from = m.from.replace(/<[^>]+>/g, '').trim();
      const d = new Date(m.date);
      const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const cls = m.unread ? 'dash-widget-row email-row-unread' : 'dash-widget-row';
      return `<div class="${cls}" onclick="document.querySelector('[data-view=email]').click();setTimeout(()=>openEmailThread('${jsSafe(m.threadId)}'),300)"><div class="dash-widget-row-title">${esc(m.subject || '(no subject)')}</div><div class="dash-widget-row-meta">${esc(from)} · ${time}</div></div>`;
    }).join('');
  } catch { body.innerHTML = '<div class="dash-widget-empty">Failed to load emails</div>'; }
}

async function loadDashXero() {
  const body = document.getElementById('dashXeroBody');
  try {
    const status = await api('/api/xero/status');
    if (!status.configured) { document.getElementById('dashXero').style.display = 'none'; return; }
    document.getElementById('dashXero').style.display = '';
    if (!status.connected) {
      body.innerHTML = '<div class="dash-widget-empty"><div style="font-size:28px;margin-bottom:8px">&#128176;</div><p>Connect your Xero account</p><a href="/auth/xero/connect" class="dash-connect-btn">Connect Xero</a></div>';
      return;
    }
    body.innerHTML = '<div class="dash-widget-empty">Loading...</div>';
    const data = await api('/api/xero/dashboard');
    const fmtMoney = n => '£' + (n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:4px 0">
        <div class="dash-xero-card"><div class="dash-xero-value">${fmtMoney(data.outstanding_total)}</div><div class="dash-xero-label">Outstanding</div></div>
        <div class="dash-xero-card" style="border-color:var(--error)"><div class="dash-xero-value" style="color:var(--error)">${fmtMoney(data.overdue_total)}</div><div class="dash-xero-label">Overdue</div></div>
        <div class="dash-xero-card" style="border-color:var(--primary)"><div class="dash-xero-value" style="color:var(--primary)">${fmtMoney(data.revenue_this_month)}</div><div class="dash-xero-label">Revenue (this month)</div></div>
        <div class="dash-xero-card"><div class="dash-xero-value">${data.outstanding_count || 0}</div><div class="dash-xero-label">Open invoices</div></div>
      </div>
    `;
  } catch { body.innerHTML = '<div class="dash-widget-empty">Failed to load Xero data</div>'; }
}

async function loadDashWhatsApp() {
  const body1 = document.getElementById('dashWa1Body');
  const body2 = document.getElementById('dashWa2Body');
  try {
    const cfg = await api('/api/whatsapp/config');
    dashWaConfigs = cfg.configs || cfg || [];
    if (!dashWaConfigs.length) {
      // Not set up: hide both WhatsApp widgets and the Messages stat entirely.
      document.getElementById('dashWhatsapp1').style.display = 'none';
      document.getElementById('dashWhatsapp2').style.display = 'none';
      return;
    }
    const msgStatCard = document.getElementById('dashStatMessages');
    if (msgStatCard) msgStatCard.style.display = '';
    for (let i = 0; i < 2; i++) {
      const config = dashWaConfigs[i];
      const bodyEl = i === 0 ? body1 : body2;
      const widgetEl = document.getElementById(`dashWhatsapp${i + 1}`);
      const titleEl = document.getElementById(`dashWa${i + 1}Title`);
      const inputEl = document.getElementById(`dashWa${i + 1}Input`);
      if (!config) { widgetEl.style.display = 'none'; continue; }
      widgetEl.style.display = '';
      titleEl.textContent = `WhatsApp — ${config.label}`;
      inputEl.style.display = 'flex';
      try {
        const msgs = await api(`/api/whatsapp/messages/${config.id}`);
        const list = msgs.messages || msgs || [];
        if (!list.length) { bodyEl.innerHTML = '<div class="dash-widget-empty">No messages yet</div>'; continue; }
        bodyEl.innerHTML = list.slice(0, 10).reverse().map(m => {
          const cls = m.direction === 'outbound' ? 'wa-msg wa-msg-outbound' : 'wa-msg wa-msg-inbound';
          const name = m.contact_name || m.from_number || '';
          const time = new Date(m.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          return `<div class="${cls}"><div class="wa-msg-meta">${esc(name)} · ${time}</div><div>${esc(m.body)}</div></div>`;
        }).join('');
        bodyEl.scrollTop = bodyEl.scrollHeight;
      } catch { bodyEl.innerHTML = '<div class="dash-widget-empty">Failed to load messages</div>'; }
    }
    // Update message stat
    try {
      const dash = await api('/api/whatsapp/dashboard');
      const total = (dash.lines || []).reduce((s, l) => s + (l.unread_count || 0), 0);
      const msgStat = document.getElementById('dashStatMessages');
      if (msgStat) msgStat.querySelector('.dash-stat-value').textContent = total;
    } catch {}
  } catch { body1.innerHTML = '<div class="dash-widget-empty">WhatsApp unavailable</div>'; body2.innerHTML = body1.innerHTML; }
}

async function sendDashWa(lineNum) {
  const config = dashWaConfigs[lineNum - 1];
  if (!config) return;
  const toEl = document.getElementById(`wa${lineNum}To`);
  const msgEl = document.getElementById(`wa${lineNum}Msg`);
  const to = toEl.value.trim();
  const body = msgEl.value.trim();
  if (!to || !body) return;
  try {
    await api('/api/whatsapp/send', { method: 'POST', body: { configId: config.id, to, body } });
    msgEl.value = '';
    loadDashWhatsApp();
  } catch (err) { alert('Failed: ' + (err.message || 'Error')); }
}

// Analytics/social aren't wired up yet — permanent "coming soon" placeholders are
// pure visual noise, so these widgets stay hidden until a real integration exists.
async function loadDashAnalytics() {
  document.getElementById('dashAnalytics').style.display = 'none';
}

function renderDashSocial() {
  document.getElementById('dashSocial').style.display = 'none';
}

async function loadDashActivity() {
  const body = document.getElementById('dashActivityBody');
  try {
    const data = await api('/api/history?limit=10');
    const items = data.entries || data || [];
    if (!items.length) { body.innerHTML = '<div class="dash-widget-empty">No recent activity</div>'; return; }
    body.innerHTML = items.map(e => {
      const time = new Date(e.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      return `<div class="dash-widget-row"><div class="dash-widget-row-title">${esc(e.details || e.action)}</div><div class="dash-widget-row-meta">${esc(e.display_name || '')} · ${time}</div></div>`;
    }).join('');
  } catch { body.innerHTML = '<div class="dash-widget-empty">Failed to load activity</div>'; }
}

// ─── Task Inbox ─────────────────────────────────────────
function allTasksFlat() {
  const out = [];
  for (const c of clients) for (const t of (c.tasks || [])) {
    out.push({ ...t, client_name: c.name, client_code: c.code, client_logo: c.logo_url, client_id: c.id, client_is_system: c.is_system });
  }
  return out;
}

function updateInboxCount() {
  const n = allTasksFlat().filter(t => t.task_status === 'inbox').length;
  const badge = document.getElementById('inboxCount');
  // Cap at 9+ — past a point the exact number is just shame-rendering, not information.
  if (badge) { badge.textContent = n > 9 ? '9+' : n; badge.style.display = n ? '' : 'none'; }
}

function clientSelectOptions(sel) {
  const real = clients.filter(c => !c.is_system && !c.archived).sort((a, b) => a.name.localeCompare(b.name));
  return '<option value="">No client</option>' + real.map(c => `<option value="${c.id}" ${sel === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
}

function loadInboxView() {
  document.getElementById('inboxClient').innerHTML = clientSelectOptions('');
  const list = document.getElementById('inboxList');
  const items = allTasksFlat().filter(t => t.task_status === 'inbox')
    .sort((a, b) => (b.id - a.id));
  if (!items.length) {
    list.innerHTML = '<div class="inbox-empty">📥 Inbox zero. Capture a task above to get started.</div>';
    return;
  }
  list.innerHTML = items.map(t => `<div class="inbox-row">
    <span class="task-ref">${taskRef(t.id)}</span>
    <span class="inbox-row-title" onclick="editTask(${t.id})" title="Open full edit">${esc(t.title)}</span>
    <select class="inbox-sel" title="Band" onchange="inboxTriage(${t.id},'task_band',this.value)">${bandOptions(t.task_band)}</select>
    <select class="inbox-sel" title="Type" onchange="inboxTriage(${t.id},'task_type',this.value)">${typeSelectOptions(t.task_type)}</select>
    <select class="inbox-sel" title="Client" onchange="inboxTriage(${t.id},'client_id',this.value)">${clientSelectOptions(t.client_is_system ? '' : t.client_id)}</select>
    <select class="inbox-sel" title="Status" onchange="inboxTriage(${t.id},'task_status',this.value)">${statusOptions(t.task_status)}</select>
    <button class="btn-icon" onclick="archiveTask(${t.id})" title="Archive">&#128230;</button>
  </div>`).join('');
}

async function inboxTriage(taskId, field, value) {
  const body = {};
  if (field === 'client_id') { if (!value) return; body.client_id = +value; }
  else body[field] = value;
  await api(`/api/tasks/${taskId}`, { method: 'PUT', body });
  await loadClients();
  loadInboxView();
}

async function quickAddInbox() {
  const titleEl = document.getElementById('inboxTitle');
  const title = titleEl.value.trim();
  if (!title) return;
  const body = {
    title,
    notes: document.getElementById('inboxNotes').value,
    deadline: document.getElementById('inboxDue').value,
    estimated_hours: parseFloat(document.getElementById('inboxEst').value) || 0,
    task_status: 'inbox',
  };
  const cid = document.getElementById('inboxClient').value;
  if (cid) body.client_id = +cid;
  await api('/api/tasks', { method: 'POST', body });
  titleEl.value = ''; document.getElementById('inboxNotes').value = '';
  document.getElementById('inboxDue').value = ''; document.getElementById('inboxEst').value = '';
  document.getElementById('inboxClient').value = '';
  await loadClients();
  loadInboxView();
  titleEl.focus();
}

// ─── Notebook (paper day-book) ──────────────────────────
// A faithful skin over the same tasks: bullets in ink, tick = done,
// highlighter = today band. Pages (tabs), a client filter and a written/due
// ordering toggle — all persisted, all still the same canonical data.
let nbTab = localStorage.getItem('nbm_nb_tab') || 'all';
let nbClient = localStorage.getItem('nbm_nb_client') || '';
let nbOrder = localStorage.getItem('nbm_nb_order') || 'written';
let nbFont = localStorage.getItem('nbm_nb_font') || 'Caveat';
let nbSize = parseFloat(localStorage.getItem('nbm_nb_size')) || 1;
let nbHideDone = localStorage.getItem('nbm_nb_hidedone') === '1';
let nbHl = localStorage.getItem('nbm_nb_hl') || 'yellow';

// Available "pens" — self-hosted handwriting fonts, each with its own size
// tuning so the ink sits on the ruled lines regardless of the font's metrics.
// Rule spacing for the whole page — roomier than a pocket book.
const NB_LINE_H = 42;
const NB_PENS = {
  'Caveat':             { label: 'Caveat (flowing)',     size: 27, small: 19 },
  'Kalam':              { label: 'Kalam (biro)',         size: 21, small: 16 },
  'Patrick Hand':       { label: 'Patrick Hand (neat)',  size: 23, small: 17 },
  'Shadows Into Light': { label: 'Shadows (fine liner)', size: 23, small: 17 },
  'Indie Flower':       { label: 'Indie Flower (bubbly)',size: 21, small: 16 },
};

function nbSetTab(t) { nbTab = t; setPref('nbm_nb_tab', t); loadNotebookView(); }
function nbSetClient(v) { nbClient = v; setPref('nbm_nb_client', v); loadNotebookView(); }
const NB_ORDERS = ['manual', 'written', 'due', 'client', 'status', 'alpha', 'band', 'quick'];
function nbSetOrder(v) {
  nbOrder = NB_ORDERS.includes(v) ? v : 'written';
  setPref('nbm_nb_order', nbOrder);
  loadNotebookView();
}

function nbComparator(order) {
  const eff = t => t.planned_date || t.deadline || '';
  const big = 1e15;
  switch (order) {
    case 'manual': return (a, b) => ((a.sort_order || big) - (b.sort_order || big)) || (a.id - b.id);
    case 'due':    return (a, b) => { const x = eff(a) || '9999', y = eff(b) || '9999'; return x < y ? -1 : x > y ? 1 : a.id - b.id; };
    case 'client': return (a, b) => (a.client_name || '').localeCompare(b.client_name || '') || (a.id - b.id);
    case 'status': return (a, b) => (STATUS_ORDER.indexOf(a.task_status) - STATUS_ORDER.indexOf(b.task_status)) || (a.id - b.id);
    case 'alpha':  return (a, b) => (a.title || '').localeCompare(b.title || '') || (a.id - b.id);
    case 'band':   return (a, b) => ((BAND_RANK[a.task_band] ?? 9) - (BAND_RANK[b.task_band] ?? 9)) || (a.id - b.id);
    case 'quick':  return (a, b) => ((a.estimated_hours || big) - (b.estimated_hours || big)) || (a.id - b.id);
    default:       return (a, b) => a.id - b.id;   // written (entry order)
  }
}

// ─── Notebook undo ───────────────────────────────────────
// Every notebook action (marker paint, tick, delegate, bulk clear/push)
// records its inverse; the Undo button / Ctrl+Z plays them back, newest
// first. In-memory only — a page refresh starts a fresh history.
const nbUndoStack = [];
function nbPushUndo(label, undoFn) {
  nbUndoStack.push({ label, undoFn });
  if (nbUndoStack.length > 25) nbUndoStack.shift();
  nbUpdateUndoBtn();
}
function nbUpdateUndoBtn() {
  const b = document.getElementById('nbUndoBtn');
  if (!b) return;
  const top = nbUndoStack[nbUndoStack.length - 1];
  b.disabled = !top;
  b.textContent = top ? `\u21a9 Undo: ${top.label}` : '\u21a9 Nothing to undo';
}
async function nbUndo() {
  const entry = nbUndoStack.pop();
  nbUpdateUndoBtn();
  if (!entry) return;
  try { await entry.undoFn(); } catch (e) { toast('Undo failed — ' + e.message); }
  await loadClients();
}
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
  const nb = document.getElementById('notebookLines');
  if (!nb || !nb.offsetParent) return; // only when the notebook is on screen
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  e.preventDefault();
  nbUndo();
});

// Snapshot the fields the marker palette can touch, for undo.
function nbStateSnapshot(t) {
  return { task_status: t.task_status, task_band: t.task_band, task_type: t.task_type, assignee: t.assignee || '', planned_date: t.planned_date || '' };
}

// "Clear all highlighter": rub out every state-driven colour on the book
// (urgent / due-today / waiting flags). Delegation (yellow) is a real
// assignment, not ink — it stays. One undo entry restores the lot.
async function nbClearAllHighlights() {
  const targets = allTasksFlat().filter(t => {
    if (!isOpenTask(t)) return false;
    return t.task_type === 'urgent' || t.task_band === 'today'
      || t.task_status === 'waiting-on-client' || t.task_status === 'waiting-on-me';
  });
  if (!targets.length) { alert('No highlighter to clear — every colour on the page comes from deadlines or delegation.'); return; }
  if (!confirm(`Clear the highlighter from ${targets.length} line(s)?\nThis removes their urgent / due-today / waiting flags — the tasks themselves stay put. (Undo can bring them back.)`)) return;
  const prev = targets.map(t => ({ id: t.id, ...nbStateSnapshot(t) }));
  for (const t of targets) {
    const body = {};
    if (t.task_type === 'urgent') body.task_type = 'ad-hoc';
    if (t.task_band === 'today') body.task_band = 'scheduled';
    if (t.task_status === 'waiting-on-client' || t.task_status === 'waiting-on-me') body.task_status = 'scheduled';
    try { await api(`/api/tasks/${t.id}`, { method: 'PUT', body }); } catch {}
  }
  nbPushUndo(`clear highlighter (${targets.length} lines)`, async () => {
    for (const p of prev) {
      try { await api(`/api/tasks/${p.id}`, { method: 'PUT', body: { task_status: p.task_status, task_band: p.task_band, task_type: p.task_type } }); } catch {}
    }
  });
  await loadClients();
}

// ─── Per-line dates: show small, edit inline, one-click push ─────────────
// Compact "margin note" showing a task's planned/deadline dates. Each is a
// native date input overlaid on tiny handwriting text (so the picker is real
// but the look stays penned). A "+1d" pill shifts both dates one day.
function nbDatesHtml(t) {
  const today = localDateStr(new Date());
  const chip = (field, label, val) => {
    const over = field === 'deadline' && val && val < today;
    return `<span class="nb-dchip ${over ? 'nb-dchip-over' : ''} nb-d-${field === 'deadline' ? 'due' : 'plan'}">`
      + `<span class="nb-dlabel">${label}</span>&nbsp;${esc(fmtDateShort(val))}`
      + `<input type="date" value="${esc(val)}" onchange="nbSetDate(${t.id},'${field}',this.value)" onclick="nbPickDate(this)" draggable="false" title="${label} date — click to change">`
      + `</span>`;
  };
  const parts = [];
  if (t.planned_date) parts.push(chip('planned_date', 'plan', t.planned_date));
  if (t.deadline) parts.push(chip('deadline', 'due', t.deadline));
  const hasDate = t.planned_date || t.deadline;
  if (!hasDate) {
    parts.push(`<span class="nb-dchip nb-dadd">`
      + `<span class="nb-dlabel">+ date</span>`
      + `<input type="date" value="" onchange="nbSetDate(${t.id},'deadline',this.value)" onclick="nbPickDate(this)" draggable="false" title="Set a due date">`
      + `</span>`);
  } else {
    parts.push(`<button class="nb-push1" onclick="nbPush1(${t.id})" draggable="false" title="Push planned + deadline forward one day">+1d</button>`);
  }
  return `<span class="nb-dates">${parts.join('')}</span>`;
}

// Open the native date picker on click. On desktop, a bare (indicator-hidden)
// date input won't drop the calendar on a plain click; showPicker() does — and
// letting the click bubble still closes any open palette/menu.
function nbPickDate(el) { try { el.showPicker && el.showPicker(); } catch (e) {} }

// Set one date field on a task from the notebook, with undo. Blank clears it.
async function nbSetDate(id, field, value) {
  const t = findTaskById(id);
  if (!t) return;
  const clean = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
  const prevVal = (field === 'deadline' ? t.deadline : t.planned_date) || '';
  if (clean === prevVal) return;
  try {
    await api(`/api/tasks/${id}`, { method: 'PUT', body: { [field]: clean } });
    nbPushUndo(clean ? (field === 'deadline' ? 'change due date' : 'change planned date') : 'clear date', async () => {
      await api(`/api/tasks/${id}`, { method: 'PUT', body: { [field]: prevVal } });
    });
    await loadClients();
  } catch (e) { toast('Not saved — ' + (e.message || 'could not set the date')); }
}

// One-click "+1 day": shift whichever of planned/deadline exists forward a day.
async function nbPush1(id) {
  const t = findTaskById(id);
  if (!t || (!t.planned_date && !t.deadline)) return;
  // Only touch (and only later restore) the fields that actually had a date —
  // so undo can never blank a planned/deadline date added after the push.
  const body = {}, prevBody = {};
  if (t.planned_date) { body.planned_date = shiftDate(t.planned_date, 1); prevBody.planned_date = t.planned_date; }
  if (t.deadline) { body.deadline = shiftDate(t.deadline, 1); prevBody.deadline = t.deadline; }
  try {
    await api(`/api/tasks/${id}`, { method: 'PUT', body });
    nbPushUndo('push +1 day', async () => { await api(`/api/tasks/${id}`, { method: 'PUT', body: prevBody }); });
    await loadClients();
  } catch (e) { toast('Not saved — ' + (e.message || 'could not push the dates')); }
}

// "Push all deadlines": didn't finish Friday? Shift every open task's
// deadline/planned date by N days in one server call. Undo shifts exactly
// those tasks back.
async function nbPushDeadlines() {
  const v = prompt('Push every open task\u2019s deadline forward by how many days?\n(3 = Friday \u2192 Monday. Negative pulls them back.)', '3');
  if (v === null) return;
  const days = parseInt(v, 10);
  if (!Number.isInteger(days) || days === 0 || Math.abs(days) > 60) { alert('Enter a whole number of days between -60 and 60.'); return; }
  try {
    const r = await api('/api/tasks/bulk-shift', { method: 'POST', body: { days } });
    if (!r.shifted) { alert('No open tasks with dates to push.'); return; }
    nbPushUndo(`deadline push ${days > 0 ? '+' : ''}${days}d (${r.shifted} tasks)`, async () => {
      await api('/api/tasks/bulk-shift', { method: 'POST', body: { days: -days, taskIds: r.taskIds } });
    });
    await loadClients();
    alert(`Done \u2014 pushed ${r.shifted} task deadline(s) by ${days > 0 ? '+' : ''}${days} day(s).`);
  } catch (e) { alert(e.message || 'Could not push deadlines.'); }
}

// ─── Meaningful highlight colours ────────────────────────
// The marker colour is a visual language over real task state. Painted states
// (urgent, waiting, band=today) come first so a colour you choose always
// shows; derived colours (delegated, overdue, dated today) fill in beneath.
function nbHighlightFor(t) {
  if (!isOpenTask(t)) return null;
  const today = localDateStr(new Date());
  if (t.task_type === 'urgent') return 'pink';
  if (t.task_status === 'waiting-on-client') return 'blue';
  if (t.task_status === 'waiting-on-me') return 'orange';
  if (t.task_band === 'today') return 'green';
  if (t.assignee && currentUser && t.assignee !== currentUser.display_name) return 'yellow';
  if (t.deadline && t.deadline < today) return 'pink';
  if ((t.planned_date || t.deadline) === today) return 'green';
  return null;
}

// Tapping a line's marker opens a mini palette; picking a colour SETS the
// matching state (blue really does mark it waiting-on-client, etc.).
let nbPaletteTaskId = null;
function nbPaletteEl() {
  let m = document.getElementById('nbPalette');
  if (m) return m;
  m = document.createElement('div');
  m.id = 'nbPalette';
  m.className = 'nb-menu nb-palette';
  document.body.appendChild(m);
  return m;
}
function nbOpenPalette(taskId, ev) {
  if (ev) { ev.stopPropagation(); ev.preventDefault(); }
  const t = findTaskById(taskId);
  if (!t) return;
  nbPaletteTaskId = taskId;
  const m = nbPaletteEl();
  m.innerHTML = `
    <div class="nb-menu-title">${esc(t.title.length > 30 ? t.title.slice(0, 30) + '…' : t.title)}</div>
    <button class="nb-menu-item" onclick="nbPaint('pink')"><span class="nb-leg-chip nb-chip-pink"></span> Urgent</button>
    <button class="nb-menu-item" onclick="nbPaint('green')"><span class="nb-leg-chip nb-chip-green"></span> Due today</button>
    <button class="nb-menu-item" onclick="nbPaint('blue')"><span class="nb-leg-chip nb-chip-blue"></span> Awaiting client</button>
    <button class="nb-menu-item" onclick="nbPaint('orange')"><span class="nb-leg-chip nb-chip-orange"></span> Waiting on me</button>
    <button class="nb-menu-item" onclick="nbPaint('yellow')"><span class="nb-leg-chip nb-chip-yellow"></span> Delegate to&hellip;</button>
    <div class="nb-menu-sep"></div>
    <button class="nb-menu-item" onclick="nbPaint('')">&#9003; Rub it out (clear)</button>`;
  const x = ev?.clientX ?? 200, y = ev?.clientY ?? 200;
  m.style.display = 'block';
  m.style.left = Math.min(x, window.innerWidth - 240) + 'px';
  m.style.top = Math.min(y, window.innerHeight - 300) + 'px';
}
function nbClosePalette() {
  const m = document.getElementById('nbPalette');
  if (m) m.style.display = 'none';
  nbPaletteTaskId = null;
}
async function nbPaint(colour) {
  const t = nbPaletteTaskId !== null ? findTaskById(nbPaletteTaskId) : null;
  if (!t) { nbClosePalette(); return; }
  if (colour === 'yellow') {
    // Delegating needs a name — swap the palette for a person list.
    const m = nbPaletteEl();
    const me = currentUser?.display_name;
    const candidates = assigneePool.filter(n => n !== me);
    if (!candidates.length) {
      m.innerHTML = `<div class="nb-menu-title">Delegate to&hellip;</div>
        <div class="nb-leg-hint" style="padding:6px 10px">No one to hand this to yet &mdash; add a user or team member first.</div>
        <div class="nb-menu-sep"></div><button class="nb-menu-item" onclick="nbClosePalette()">Close</button>`;
      return;
    }
    m.innerHTML = `<div class="nb-menu-title">Delegate to&hellip;</div>` +
      candidates.map(n => `<button class="nb-menu-item" data-name="${esc(n)}">${esc(n)}</button>`).join('') +
      `<div class="nb-menu-sep"></div><button class="nb-menu-item" onclick="nbClosePalette()">Cancel</button>`;
    m.querySelectorAll('[data-name]').forEach(b => b.addEventListener('click', () => nbDelegate(b.dataset.name)));
    return;
  }
  const id = nbPaletteTaskId;
  const prev = { id, ...nbStateSnapshot(t) };
  nbClosePalette();
  const today = localDateStr(new Date());
  const isWaiting = t.task_status === 'waiting-on-client' || t.task_status === 'waiting-on-me';
  const isDelegated = t.assignee && currentUser && t.assignee !== currentUser.display_name;
  const body = {};
  // Each colour also clears any state that outranks it, so the colour you
  // pick is the colour you see.
  if (colour === 'pink') body.task_type = 'urgent';
  else if (colour === 'blue') {
    body.task_status = 'waiting-on-client';
    if (t.task_type === 'urgent') body.task_type = 'ad-hoc';
  } else if (colour === 'orange') {
    body.task_status = 'waiting-on-me';
    if (t.task_type === 'urgent') body.task_type = 'ad-hoc';
  } else if (colour === 'green') {
    body.task_band = 'today';
    if (t.task_type === 'urgent') body.task_type = 'ad-hoc';
    if (isWaiting) body.task_status = 'scheduled';
  } else {
    // Eraser: strip whatever is giving this line its colour — including the
    // NOW ring (in-progress → scheduled). Real deadlines stay put — an
    // overdue line stays pink until it's rescheduled or done.
    if (t.task_type === 'urgent') body.task_type = 'ad-hoc';
    if (t.task_band === 'today') body.task_band = 'scheduled';
    if (isWaiting || nbIsNow(t)) body.task_status = 'scheduled';
    if (isDelegated) body.assignee = currentUser.display_name;
    if (t.planned_date === today && (!t.deadline || t.deadline !== today)) body.planned_date = '';
    if (!Object.keys(body).length) return;
  }
  // Optimistic: the ink changes the moment you pick a colour.
  const revert = {};
  for (const k of Object.keys(body)) revert[k] = t[k] ?? '';
  Object.assign(t, body);
  loadNotebookView();
  try {
    await api(`/api/tasks/${id}`, { method: 'PUT', body });
    nbPushUndo(colour ? 'highlight' : 'rub out', async () => {
      await api(`/api/tasks/${prev.id}`, { method: 'PUT', body: { task_status: prev.task_status, task_band: prev.task_band, task_type: prev.task_type, assignee: prev.assignee, planned_date: prev.planned_date } });
    });
    loadClients(); // background reconcile
  } catch (e) {
    Object.assign(t, revert);
    toast('Not saved — ' + e.message);
    loadNotebookView();
  }
}
async function nbDelegate(name) {
  const id = nbPaletteTaskId;
  nbClosePalette();
  if (id === null) return;
  const t = findTaskById(id);
  if (!t) return;
  const prev = { id, ...nbStateSnapshot(t) };
  // Yellow must show once painted, so delegating also clears the painted
  // flags that outrank it (the dates/facts on the task are untouched).
  const body = { assignee: name };
  if (t.task_type === 'urgent') body.task_type = 'ad-hoc';
  if (t.task_status === 'waiting-on-client' || t.task_status === 'waiting-on-me') body.task_status = 'scheduled';
  if (t.task_band === 'today') body.task_band = 'scheduled';
  try {
    await api(`/api/tasks/${id}`, { method: 'PUT', body });
    nbPushUndo(`delegate to ${name}`, async () => {
      await api(`/api/tasks/${id}`, { method: 'PUT', body: { assignee: prev.assignee || '', task_status: prev.task_status, task_band: prev.task_band, task_type: prev.task_type } });
    });
    await loadClients();
  } catch (e) { toast('Not saved — ' + e.message); loadClients(); }
}
document.addEventListener('click', (e) => {
  // A click on "Delegate to…" re-renders the palette, detaching the clicked
  // button before this bubbles here — a detached target isn't an outside click.
  if (!e.target.isConnected) return;
  if (!e.target.closest('#nbPalette') && !e.target.closest('.nb-marker')) nbClosePalette();
});

// ─── Drag & drop reordering ──────────────────────────────
// Dropping snapshots the order you were LOOKING at (whatever sort), applies
// your move, and switches to "My order" so it sticks.
let nbDragId = null;
async function nbDrop(targetId) {
  const dragged = nbDragId; nbDragId = null;
  if (dragged === null || dragged === targetId) return;
  const all = allTasksFlat().slice().sort(nbComparator(nbOrder));
  const ids = all.map(t => t.id);
  const from = ids.indexOf(dragged), to = ids.indexOf(targetId);
  if (from < 0 || to < 0) return;
  ids.splice(from, 1);
  let at = ids.indexOf(targetId);
  if (from < to) at += 1;
  ids.splice(at, 0, dragged);
  try {
    await api('/api/tasks/reorder', { method: 'PUT', body: { order: ids } });
    if (nbOrder !== 'manual') { nbOrder = 'manual'; setPref('nbm_nb_order', 'manual'); }
    await loadClients();
  } catch (e) { toast('Order not saved — ' + e.message); loadClients(); }
}
function nbSetFont(f) {
  nbFont = NB_PENS[f] ? f : 'Caveat';
  setPref('nbm_nb_font', nbFont);
  applyNbFont();
  loadNotebookView();
}
// Rules are drawn as a bottom border on every row (see CSS), so alignment is
// structural and can't drift with font metrics. This just sets the ink vars;
// each row's fixed height == --nb-lh keeps text welded to its line.
function applyNbFont() {
  const wrap = document.querySelector('.nb-wrap');
  if (!wrap) return;
  const pen = NB_PENS[nbFont] || NB_PENS.Caveat;
  const scale = Math.max(0.7, Math.min(1.5, nbSize || 1));
  wrap.style.setProperty('--nb-font', `'${nbFont}', cursive`);
  wrap.style.setProperty('--nb-size', Math.round(pen.size * scale) + 'px');
  wrap.style.setProperty('--nb-small', Math.round(pen.small * scale) + 'px');
  wrap.style.setProperty('--nb-lh', Math.round(NB_LINE_H * scale) + 'px');
  const hl = NB_HLS[nbHl] || NB_HLS.yellow;
  wrap.style.setProperty('--nb-hl', hl.light);
  wrap.style.setProperty('--nb-hl-deep', hl.deep);
}
function nbSetSize(delta) {
  nbSize = Math.max(0.7, Math.min(1.5, Math.round(((nbSize || 1) + delta) * 100) / 100));
  setPref('nbm_nb_size', String(nbSize));
  applyNbFont();
}
function nbToggleHideDone() {
  nbHideDone = !nbHideDone;
  setPref('nbm_nb_hidedone', nbHideDone ? '1' : '0');
  loadNotebookView();
}

// One highlighter in hand at a time, like real life — the colour applies to
// every highlighted line and to the little marker swatches on each row.
const NB_HLS = {
  yellow: { light: 'rgba(255,228,58,.85)', deep: '#f6cf22' },
  green:  { light: 'rgba(142,226,125,.8)', deep: '#6fcf5e' },
  pink:   { light: 'rgba(255,158,203,.75)', deep: '#f77fb4' },
  blue:   { light: 'rgba(143,208,255,.8)', deep: '#6cb8f2' },
  orange: { light: 'rgba(255,180,94,.8)',  deep: '#f29b3f' },
};
function nbSetHl(c) {
  nbHl = NB_HLS[c] ? c : 'yellow';
  setPref('nbm_nb_hl', nbHl);
  applyNbFont();
  nbMarkActiveSwatch();
}
function nbMarkActiveSwatch() {
  document.querySelectorAll('.nb-swatch').forEach(b => b.classList.toggle('nb-swatch-on', b.dataset.hl === nbHl));
}
function nbToggleOptions(e) {
  if (e) e.stopPropagation();
  document.getElementById('nbOptions').classList.toggle('open');
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('#nbOptions') && !e.target.closest('#nbDogear')) {
    document.getElementById('nbOptions')?.classList.remove('open');
  }
});
const NB_PAGE_TITLES = {
  all: 'Everything on my plate',
  today: "Today's page",
  week: 'This week',
  waiting: 'Waiting on people',
  done: 'Ticked off lately',
};

function loadNotebookView() {
  const el = document.getElementById('notebookLines');
  if (!el) return;
  const today = localDateStr(new Date());
  document.getElementById('nbDate').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  applyNbFont();
  // Pen picker
  const penSel = document.getElementById('nbPenSelect');
  if (penSel && !penSel.options.length) {
    penSel.innerHTML = Object.entries(NB_PENS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
  }
  if (penSel) penSel.value = nbFont;
  // Tabs + client dropdown state
  document.querySelectorAll('#nbTabs .nb-tab').forEach(b => b.classList.toggle('nb-tab-active', b.dataset.nbtab === nbTab));
  const sel = document.getElementById('nbClientFilter');
  const realClients = clients.filter(c => !c.is_system && !c.archived).sort((a, b) => a.name.localeCompare(b.name));
  sel.innerHTML = '<option value="">everyone</option>' + realClients.map(c => `<option value="${c.id}" ${String(c.id) === nbClient ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  document.getElementById('nbPageTitle').textContent = NB_PAGE_TITLES[nbTab] || '';
  const orderSel = document.getElementById('nbOrderSelect');
  if (orderSel) orderSel.value = nbOrder;
  const hideBtn = document.getElementById('nbHideDoneBtn');
  if (hideBtn) {
    hideBtn.textContent = nbHideDone ? 'show ticked off' : 'hide ticked off';
    hideBtn.style.display = nbTab === 'done' ? 'none' : '';
  }

  // Monday-anchored week window for the "this week" page
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const dow = now.getDay();
  const ws = new Date(now); ws.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow));
  const we = new Date(ws); we.setDate(ws.getDate() + 6);
  const wsStr = localDateStr(ws), weStr = localDateStr(we);
  const weekAgo = localDateStr(new Date(now.getTime() - 7 * 864e5));
  const eff = t => t.planned_date || t.deadline || '';

  let items = allTasksFlat();
  if (nbClient) items = items.filter(t => String(t.client_id) === nbClient);

  if (nbTab === 'today') {
    items = items.filter(t =>
      (isOpenTask(t) && (t.task_band === 'today' || eff(t) === today || (t.deadline && t.deadline < today))) ||
      (t.task_status === 'done' && (t.completed_at || '') === today));
  } else if (nbTab === 'week') {
    items = items.filter(t => isOpenTask(t) &&
      (t.task_band === 'today' || t.task_band === 'this-week' || (eff(t) >= wsStr && eff(t) <= weStr) || (t.deadline && t.deadline < today)));
  } else if (nbTab === 'waiting') {
    items = items.filter(t => t.task_status === 'waiting-on-client' || t.task_status === 'waiting-on-me');
  } else if (nbTab === 'done') {
    items = items.filter(t => t.task_status === 'done' && (t.completed_at || '') >= weekAgo);
  } else {
    items = items.filter(t => isOpenTask(t) || (t.task_status === 'done' && (t.completed_at || '') === today));
  }

  // "Hide ticked off" cleans the page down to only what's still open (the
  // dedicated "Ticked off" tab always shows completed regardless).
  if (nbHideDone && nbTab !== 'done') items = items.filter(isOpenTask);

  items.sort(nbComparator(nbOrder));

  // Footer note in pencil (counts across the whole filtered set, not just this page)
  const openCount = items.filter(isOpenTask).length;
  const tickedToday = allTasksFlat().filter(t => t.task_status === 'done' && (t.completed_at || '') === today && (!nbClient || String(t.client_id) === nbClient)).length;
  document.getElementById('nbFooter').textContent =
    `${openCount} thing${openCount === 1 ? '' : 's'} to do here${tickedToday ? ` · ${tickedToday} ticked off today` : ''}`;

  // Quick-add hint follows the client filter ("writing on that client's page")
  document.getElementById('nbNewTask').placeholder = nbClient
    ? `Write a task for ${realClients.find(c => String(c.id) === nbClient)?.name || 'this client'}, press Enter…`
    : 'Write a task, press Enter…';
  document.getElementById('nbNewRow').style.display = nbTab === 'done' ? 'none' : '';

  // Inline "for: <customer>" picker on the write line. When a client filter is
  // active the task is already filed under them, so the picker hides; otherwise
  // it lets you allocate as you write, remembering the last pick for batching.
  const forWrap = document.getElementById('nbNewForWrap');
  const newSel = document.getElementById('nbNewClient');
  if (nbClient) {
    forWrap.style.display = 'none';
  } else {
    forWrap.style.display = '';
    const remembered = localStorage.getItem('nbm_nb_newclient') || '';
    newSel.innerHTML = '<option value="">no customer</option>' +
      realClients.map(c => `<option value="${c.id}" ${String(c.id) === remembered ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  }

  if (!items.length) {
    document.getElementById('nbFooter').textContent = '';
    el.innerHTML = `<div class="nb-empty">${nbTab === 'done' ? 'Nothing ticked off yet — go tick something.' : 'A blank page. Write something below…'}</div>`;
    return;
  }

  // One long page — every task on a single scroll, write line at the bottom.
  el.innerHTML = items.map(t => {
    const done = t.task_status === 'done';
    const hlc = done ? null : nbHighlightFor(t);
    const overdue = !done && t.deadline && t.deadline < today;
    const client = t.client_name && !t.client_is_system ? `<span class="nb-client">&nbsp;&mdash; ${esc(t.client_name)}</span>` : '';
    const due = overdue ? `<span class="nb-due">&nbsp;(${relDate(t.deadline)}!)</span>` : '';
    // "I'm on this NOW": in-progress tasks that are mine get a red ink ring +
    // NOW tag; clicking the ring summons the countdown instead of the modal.
    const isNow = !done && nbIsNow(t);
    const nowTag = isNow ? `<span class="nb-now-tag" onclick="nbNowClick(${t.id});event.stopPropagation()" title="Working on this now — click for the countdown">NOW</span>` : '';
    const titleCls = [hlc ? 'nb-hl nb-hl-' + hlc : '', isNow ? 'nb-now-ring' : ''].join(' ').trim();
    const titleClick = isNow ? `nbNowClick(${t.id})` : `editTask(${t.id})`;
    const titleTip = isNow ? 'Working on this NOW — click to bring up the timer' : 'Open task';
    return `<div class="nb-line ${done ? 'nb-done' : ''}" data-id="${t.id}" draggable="true">
      <button class="nb-bullet ${done ? 'nb-ticked' : ''}" onclick="nbTick(${t.id})" title="${done ? 'Untick' : 'Tick off'}">${done ? '&#10003;' : '&bull;'}</button>
      <span class="nb-text">${nowTag}<span class="${titleCls}" onclick="${titleClick}" title="${titleTip}">${esc(t.title)}</span>${client}${due}</span>
      ${done ? '' : nbDatesHtml(t)}
      <button class="nb-marker ${hlc ? 'nb-marker-' + hlc : ''}" onclick="nbOpenPalette(${t.id}, event)" title="Colour-code this line"></button>
    </div>`;
  }).join('');
}

async function nbTick(id) {
  const t = findTaskById(id);
  if (!t) return;
  const done = t.task_status === 'done';
  const prevStatus = t.task_status;
  const prevCompleted = t.completed_at || '';
  // Optimistic: flip the bullet instantly from the local cache, save behind it.
  t.task_status = done ? 'scheduled' : 'done';
  t.completed_at = done ? '' : localDateStr(new Date());
  loadNotebookView();
  if (!done) { try { celebrate(); } catch {} }
  try {
    await api(`/api/tasks/${id}`, { method: 'PUT', body: { task_status: t.task_status } });
    nbPushUndo(done ? 'untick' : 'tick off', async () => {
      await api(`/api/tasks/${id}`, { method: 'PUT', body: { task_status: prevStatus } });
    });
    loadClients(); // background reconcile (stats, recurring auto-create)
  } catch (e) {
    t.task_status = prevStatus;
    t.completed_at = prevCompleted;
    toast('Not saved — ' + e.message);
    loadNotebookView();
  }
}

async function nbHighlight(id) {
  const t = findTaskById(id);
  if (!t) return;
  try {
    await api(`/api/tasks/${id}`, { method: 'PUT', body: { task_band: t.task_band === 'today' ? 'scheduled' : 'today' } });
    await loadClients();
  } catch {}
}

async function nbQuickAdd() {
  const inp = document.getElementById('nbNewTask');
  const title = inp.value.trim();
  if (!title) return;
  const body = { title, task_status: 'inbox' };
  // Filter wins ("writing on that client's page"); otherwise use the inline
  // "for: <customer>" picker and remember it so back-to-back tasks stay allocated.
  if (nbClient) {
    body.client_id = +nbClient;
  } else {
    const chosen = document.getElementById('nbNewClient')?.value || '';
    if (chosen) { body.client_id = +chosen; setPref('nbm_nb_newclient', chosen); }
    else { setPref('nbm_nb_newclient', ''); }
  }
  // Writing on a filtered page must produce a task that page SHOWS — otherwise
  // it vanishes on Enter. Today page → today band; This week → this-week band;
  // Waiting → waiting-on-client status.
  if (nbTab === 'today') body.task_band = 'today';
  else if (nbTab === 'week') { body.task_status = 'scheduled'; body.task_band = 'this-week'; }
  else if (nbTab === 'waiting') body.task_status = 'waiting-on-client';
  try {
    await api('/api/tasks', { method: 'POST', body });
    inp.value = '';
    await loadClients();
    inp.focus();
  } catch (e) { toast('Not saved — ' + e.message); }  // typed text stays in the input
}

// ─── Notebook right-click menu ──────────────────────────
// Right-click (long-press on Android) a line: change due date, highlight,
// open, or scribble it out entirely.
let nbMenuTaskId = null;

function nbMenuEl() {
  let m = document.getElementById('nbMenu');
  if (m) return m;
  m = document.createElement('div');
  m.id = 'nbMenu';
  m.className = 'nb-menu';
  m.innerHTML = `
    <div class="nb-menu-title" id="nbMenuTitle"></div>
    <button class="nb-menu-item" onclick="nbMenuDue('today')">Due today</button>
    <button class="nb-menu-item" onclick="nbMenuDue('tomorrow')">Due tomorrow</button>
    <button class="nb-menu-item" onclick="nbMenuDue('next-week')">Due next week</button>
    <div class="nb-menu-item nb-menu-pick">Pick a date: <input type="date" id="nbMenuDate" onchange="nbMenuDue(this.value)" onclick="event.stopPropagation()"></div>
    <button class="nb-menu-item" onclick="nbMenuDue('')">Clear due date</button>
    <button class="nb-menu-item" onclick="nbMenuPush1()">Push both dates +1 day</button>
    <div class="nb-menu-sep"></div>
    <button class="nb-menu-item nb-menu-now" id="nbMenuNowBtn" onclick="nbMenuNow()">&#9654; I&rsquo;m on this NOW</button>
    <button class="nb-menu-item" id="nbMenuHl" onclick="nbMenuColour(event)">Colour-code&hellip;</button>
    <button class="nb-menu-item" onclick="nbMenuOpen()">Open full task</button>
    <div class="nb-menu-sep"></div>
    <button class="nb-menu-item nb-menu-delete" onclick="nbMenuDelete()">Scribble it out (delete)</button>`;
  document.body.appendChild(m);
  return m;
}

function nbOpenMenu(taskId, x, y) {
  const t = findTaskById(taskId);
  if (!t) return;
  nbMenuTaskId = taskId;
  const m = nbMenuEl();
  document.getElementById('nbMenuTitle').textContent = t.title.length > 34 ? t.title.slice(0, 34) + '…' : t.title;

  document.getElementById('nbMenuDate').value = t.deadline || '';
  document.getElementById('nbMenuNowBtn').innerHTML = nbIsNow(t)
    ? '&#10005; Not on this any more' : '&#9654; I&rsquo;m on this NOW';
  m.style.display = 'block';
  const mw = 240, mh = m.offsetHeight || 320;
  m.style.left = Math.min(x, window.innerWidth - mw - 12) + 'px';
  m.style.top = Math.min(y, window.innerHeight - mh - 12) + 'px';
}

function nbCloseMenu() {
  const m = document.getElementById('nbMenu');
  if (m) m.style.display = 'none';
  nbMenuTaskId = null;
}

async function nbMenuDue(when) {
  if (nbMenuTaskId === null) return;
  const d = new Date(); d.setHours(0, 0, 0, 0);
  let deadline = when;
  if (when === 'today') deadline = localDateStr(d);
  else if (when === 'tomorrow') { d.setDate(d.getDate() + 1); deadline = localDateStr(d); }
  else if (when === 'next-week') { const dow = d.getDay(); d.setDate(d.getDate() + (((8 - dow) % 7) || 7)); deadline = localDateStr(d); }
  const id = nbMenuTaskId;
  nbCloseMenu();
  try { await api(`/api/tasks/${id}`, { method: 'PUT', body: { deadline } }); await loadClients(); } catch (e) { toast('Not saved — ' + (e.message || 'could not update')); }
}

function nbMenuColour(ev) {
  const id = nbMenuTaskId; nbCloseMenu();
  if (id !== null) nbOpenPalette(id, ev);
}

// "I'm on this NOW" toggle — on: opens the focus launcher prefilled with this
// task (starting marks it In Progress → NOW ring). Off: ring + timer removed.
function nbMenuNow() {
  const id = nbMenuTaskId; nbCloseMenu();
  if (id === null) return;
  nbIsNow(findTaskById(id)) ? nbNowOff(id) : nbNowClick(id);
}

function nbMenuPush1() {
  const id = nbMenuTaskId;
  const t = id !== null ? findTaskById(id) : null;
  nbCloseMenu();
  if (!t) return;
  if (!t.planned_date && !t.deadline) { alert('This task has no planned or deadline date to push yet — set one first.'); return; }
  nbPush1(id);
}

function nbMenuOpen() {
  const id = nbMenuTaskId; nbCloseMenu();
  if (id !== null) editTask(id);
}

async function nbMenuDelete() {
  const id = nbMenuTaskId;
  const t = id !== null ? findTaskById(id) : null;
  nbCloseMenu();
  if (!t) return;
  if (!confirm(`Scribble out "${t.title}" for good? This deletes the task entirely.`)) return;
  try { await api(`/api/tasks/${id}`, { method: 'DELETE' }); await loadClients(); }
  catch (e) { alert(e.message || 'Only owners can delete tasks — tick it off or cancel it instead.'); }
}

document.getElementById('notebookLines').addEventListener('contextmenu', (e) => {
  const line = e.target.closest('.nb-line');
  if (!line || !line.dataset.id) return;
  e.preventDefault();
  nbOpenMenu(+line.dataset.id, e.clientX, e.clientY);
});

// iOS Safari never fires contextmenu — emulate it with a 550ms long-press.
// Cancels if the finger moves (scrolling) or lifts early.
let nbPressTimer = null;
let nbPressStart = null;
document.getElementById('notebookLines').addEventListener('touchstart', (e) => {
  if (e.target.closest('.nb-dates')) return; // tapping a date/push control isn't a long-press
  const line = e.target.closest('.nb-line');
  if (!line || !line.dataset.id || e.touches.length !== 1) return;
  const t = e.touches[0];
  nbPressStart = { x: t.clientX, y: t.clientY };
  nbPressTimer = setTimeout(() => {
    nbPressTimer = null;
    nbOpenMenu(+line.dataset.id, nbPressStart.x, nbPressStart.y);
  }, 550);
}, { passive: true });
document.getElementById('notebookLines').addEventListener('touchmove', (e) => {
  if (!nbPressTimer || !nbPressStart) return;
  const t = e.touches[0];
  if (Math.abs(t.clientX - nbPressStart.x) > 10 || Math.abs(t.clientY - nbPressStart.y) > 10) {
    clearTimeout(nbPressTimer); nbPressTimer = null;
  }
}, { passive: true });
['touchend', 'touchcancel'].forEach(ev =>
  document.getElementById('notebookLines').addEventListener(ev, () => { if (nbPressTimer) { clearTimeout(nbPressTimer); nbPressTimer = null; } }));

// Desktop drag & drop (HTML5 DnD — iOS uses the long-press menu instead)
const nbLinesEl = document.getElementById('notebookLines');
nbLinesEl.addEventListener('dragstart', (e) => {
  // Never start a line drag from the date controls (the date input / +1d pill).
  if (e.target.closest('.nb-dates')) { e.preventDefault(); return; }
  const line = e.target.closest('.nb-line');
  if (!line || !line.dataset.id) return;
  nbDragId = +line.dataset.id;
  line.classList.add('nb-dragging');
  try { e.dataTransfer.setData('text/plain', line.dataset.id); e.dataTransfer.effectAllowed = 'move'; } catch {}
});
nbLinesEl.addEventListener('dragover', (e) => {
  const line = e.target.closest('.nb-line');
  if (!line || !line.dataset.id || nbDragId === null) return;
  e.preventDefault();
  document.querySelectorAll('.nb-drop-target').forEach(x => x.classList.remove('nb-drop-target'));
  line.classList.add('nb-drop-target');
});
nbLinesEl.addEventListener('dragleave', (e) => {
  const line = e.target.closest('.nb-line');
  if (line) line.classList.remove('nb-drop-target');
});
nbLinesEl.addEventListener('drop', (e) => {
  const line = e.target.closest('.nb-line');
  document.querySelectorAll('.nb-drop-target,.nb-dragging').forEach(x => x.classList.remove('nb-drop-target', 'nb-dragging'));
  if (!line || !line.dataset.id) return;
  e.preventDefault();
  nbDrop(+line.dataset.id);
});
nbLinesEl.addEventListener('dragend', () => {
  document.querySelectorAll('.nb-drop-target,.nb-dragging').forEach(x => x.classList.remove('nb-drop-target', 'nb-dragging'));
});
document.addEventListener('click', (e) => { if (!e.target.closest('#nbMenu')) nbCloseMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') nbCloseMenu(); });

// ─── Weekly Planning ────────────────────────────────────
function planningTaskRow(t) {
  return `<div class="plan-row" onclick="editTask(${t.id})">
    <span class="status-badge status-${t.task_status}">${statusLabel(t.task_status)}</span>
    <span class="plan-title">${esc(t.title)}</span>
    <span class="plan-meta">${esc(t.client_name || '')}${t.assignee ? ' · ' + esc(t.assignee) : ''}</span>
    ${t.task_band ? `<span class="band-badge ${bandClass(t.task_band)}">${bandLabel(t.task_band)}</span>` : ''}
    ${t.deadline ? `<span class="plan-due ${getDeadlineClass(t.deadline, t.progress)}">${fmtDateShort(t.deadline)}</span>` : ''}
  </div>`;
}

function loadPlanningView() {
  const today = localDateStr(new Date());
  const now = new Date();
  const dow = now.getDay();
  const monOff = dow === 0 ? -6 : 1 - dow;
  const ws = new Date(now); ws.setDate(now.getDate() + monOff);
  const we = new Date(ws); we.setDate(ws.getDate() + 6);
  const wsStr = localDateStr(ws), weStr = localDateStr(we);

  const open = allTasksFlat().filter(isOpenTask);
  const eff = t => t.planned_date || t.deadline || '';

  const overdue = open.filter(t => t.deadline && t.deadline < today);
  const todayTasks = open.filter(t => t.task_band === 'today' || eff(t) === today);
  const thisWeek = open.filter(t => t.task_band === 'this-week' || (eff(t) >= wsStr && eff(t) <= weStr));
  const waiting = open.filter(t => t.task_status === 'waiting-on-client' || t.task_status === 'waiting-on-me');
  const sales = open.filter(t => t.task_type === 'sales');
  const admin = open.filter(t => t.task_type === 'admin');

  const realClients = clients.filter(c => !c.is_system && !c.archived);
  const retainersNoSchedule = realClients.filter(c => (c.client_type === 'retainer') && !c.next_scheduled_date);
  const highRisk = realClients.filter(c => (c.resolved_risk || c.computed_risk) === 'high' || (c.resolved_status || c.computed_status) === 'red');

  const taskSection = (title, arr, emptyMsg) => `<div class="plan-section">
    <h3 class="plan-heading">${title} <span class="plan-count">${arr.length}</span></h3>
    ${arr.length ? arr.map(planningTaskRow).join('') : `<div class="plan-empty">${emptyMsg}</div>`}
  </div>`;

  const clientSection = (title, arr, emptyMsg) => `<div class="plan-section">
    <h3 class="plan-heading">${title} <span class="plan-count">${arr.length}</span></h3>
    ${arr.length ? arr.map(c => `<div class="plan-row" onclick="openClientDetail(${c.id})">
        <span class="rag-dot ${(CONTROL_STATUS[c.resolved_status||c.computed_status]||CONTROL_STATUS.green).cls}"></span>
        <span class="plan-title">${esc(c.name)}</span>
        <span class="plan-meta">${typeLabelClient(c.client_type)}${c.monthly_value ? ' · ' + fmtMoney(c.monthly_value) + '/mo' : ''}</span>
      </div>`).join('') : `<div class="plan-empty">${emptyMsg}</div>`}
  </div>`;

  document.getElementById('planningContent').innerHTML = `
    <div class="plan-grid">
      ${taskSection('🔴 Overdue', overdue, 'Nothing overdue — nice.')}
      ${taskSection('☼ Today', todayTasks, 'Nothing flagged for today.')}
      ${taskSection('🗓 This Week', thisWeek, 'Nothing due this week.')}
      ${taskSection('⏳ Waiting', waiting, 'Nothing waiting.')}
      ${clientSection('⚠ Retainers with no scheduled work', retainersNoSchedule, 'All retainers have work scheduled.')}
      ${clientSection('🔥 High-risk clients', highRisk, 'No high-risk clients.')}
      ${taskSection('💬 Sales follow-ups', sales, 'No sales tasks.')}
      ${taskSection('🗂 Admin', admin, 'No admin tasks.')}
    </div>`;
}

// ─── Stats ──────────────────────────────────────────────
function renderStats() {
  const today = localDateStr(new Date());
  let outstanding = 0, inProgress = 0, overdue = 0, waiting = 0, inbox = 0;
  for (const c of clients) for (const t of (c.tasks || [])) {
    if (!isOpenTask(t)) continue;
    outstanding++;
    if (t.task_status === 'in-progress') inProgress++;
    if (t.task_status === 'waiting-on-client' || t.task_status === 'waiting-on-me') waiting++;
    if (t.task_status === 'inbox') inbox++;
    if (t.deadline && t.deadline < today) overdue++;
  }
  document.getElementById('statsBar').innerHTML = `
    <div class="stat-card" onclick="showStatPopup('outstanding')"><div class="stat-number">${outstanding}</div><div class="stat-label">Outstanding</div></div>
    <div class="stat-card" onclick="showStatPopup('in-progress')"><div class="stat-number">${inProgress}</div><div class="stat-label">In Progress</div></div>
    <div class="stat-card" onclick="showStatPopup('overdue')"><div class="stat-number" style="color:${overdue?'var(--danger)':'var(--text-secondary)'}">${overdue}</div><div class="stat-label">Overdue</div></div>
    <div class="stat-card" onclick="showStatPopup('waiting')"><div class="stat-number">${waiting}</div><div class="stat-label">Waiting</div></div>
    <div class="stat-card" onclick="showStatPopup('inbox')"><div class="stat-number">${inbox}</div><div class="stat-label">Inbox</div></div>`;
}

function showStatPopup(type) {
  const titles = {'outstanding':'Outstanding Tasks','in-progress':'In Progress','overdue':'Overdue Tasks','waiting':'Waiting','inbox':'Inbox','completed':'Completed Tasks'};
  document.getElementById('statsModalTitle').textContent = titles[type]||'Tasks';
  const now = localDateStr(new Date());
  const items = [];
  for (const c of clients) for (const task of c.tasks) {
    let m = false;
    if (type==='outstanding' && isOpenTask(task)) m=true;
    if (type==='in-progress' && task.task_status==='in-progress') m=true;
    if (type==='completed' && task.task_status==='done') m=true;
    if (type==='overdue' && task.deadline && task.deadline<now && isOpenTask(task)) m=true;
    if (type==='waiting' && (task.task_status==='waiting-on-client'||task.task_status==='waiting-on-me')) m=true;
    if (type==='inbox' && task.task_status==='inbox') m=true;
    if (m) items.push({task,client:c});
  }
  const ct = document.getElementById('statsModalContent');
  ct.innerHTML = items.length===0 ? '<div style="padding:24px;text-align:center;color:var(--text-secondary)">None</div>' :
    items.map(({task,client})=>`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--border);cursor:pointer" onclick="navigateToTask(${client.id},${task.id})">
        <div>
          <div style="font-weight:600;font-size:13px">${esc(task.title)}</div>
          <div style="font-size:11px;color:var(--text-secondary)">${esc(client.name)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="status-badge status-${task.task_status}">${statusLabel(task.task_status)}</span>
          ${task.deadline?`<span style="font-size:11px" class="${getDeadlineClass(task.deadline,task.progress)}">${fmtDate(task.deadline)}</span>`:''}
        </div>
      </div>`).join('');
  openModal('statsModal');
}

// ─── Workload Summary ──────────────────────────────────
async function loadWorkloadSummary() {
  try {
    const s = await api('/api/tasks/summary');
    const el = document.getElementById('workloadSummary');
    if (!el) return;

    const fmt = (h) => h % 1 === 0 ? h : h.toFixed(1);

    // Person breakdown (top 5 by this week hours)
    const people = Object.entries(s.byPerson)
      .sort((a, b) => b[1].thisWeek - a[1].thisWeek)
      .slice(0, 5);
    const personRows = people.map(([name, d]) =>
      `<div class="wl-person-row">
        <span class="wl-person-name">${esc(name)}</span>
        <span class="wl-person-hours">${fmt(d.thisWeek)}h this wk / ${fmt(d.nextWeek)}h next</span>
      </div>`
    ).join('');

    el.innerHTML = `
      <div class="workload-card wl-today" onclick="showWorkloadDetail('today','Today')" style="cursor:pointer">
        <div class="wl-label">Today</div>
        <div class="wl-hours">${fmt(s.today.hours)}<span>hrs</span></div>
        <div class="wl-tasks">${s.today.tasks} task${s.today.tasks !== 1 ? 's' : ''}</div>
      </div>
      <div class="workload-card wl-completed" onclick="showWorkloadDetail('completed-today','Completed Today')" style="cursor:pointer">
        <div class="wl-label">Done Today</div>
        <div class="wl-hours">${fmt(s.completedToday.hours)}<span>hrs</span></div>
        <div class="wl-tasks">${s.completedToday.tasks} task${s.completedToday.tasks !== 1 ? 's' : ''} completed</div>
      </div>
      <div class="workload-card" onclick="showWorkloadDetail('tomorrow','Tomorrow')" style="cursor:pointer">
        <div class="wl-label">Tomorrow</div>
        <div class="wl-hours">${fmt(s.tomorrow.hours)}<span>hrs</span></div>
        <div class="wl-tasks">${s.tomorrow.tasks} task${s.tomorrow.tasks !== 1 ? 's' : ''}</div>
      </div>
      <div class="workload-card" onclick="showWorkloadDetail('this-week','This Week')" style="cursor:pointer">
        <div class="wl-label">This Week</div>
        <div class="wl-hours">${fmt(s.thisWeek.hours)}<span>hrs</span></div>
        <div class="wl-tasks">${s.thisWeek.tasks} task${s.thisWeek.tasks !== 1 ? 's' : ''}</div>
      </div>
      <div class="workload-card" onclick="showWorkloadDetail('next-week','Next Week')" style="cursor:pointer">
        <div class="wl-label">Next Week</div>
        <div class="wl-hours">${fmt(s.nextWeek.hours)}<span>hrs</span></div>
        <div class="wl-tasks">${s.nextWeek.tasks} task${s.nextWeek.tasks !== 1 ? 's' : ''}</div>
      </div>
      ${s.overdue ? `<div class="workload-card wl-overdue" onclick="showWorkloadDetail('overdue','Overdue')" style="cursor:pointer">
        <div class="wl-label">Overdue</div>
        <div class="wl-hours">${s.overdue}</div>
        <div class="wl-tasks">task${s.overdue !== 1 ? 's' : ''} past due</div>
      </div>` : ''}
      ${people.length ? `<div class="workload-people">
        <div class="wl-label">Team Workload</div>
        ${personRows}
      </div>` : ''}
    `;
    el.style.display = 'flex';
  } catch (e) {
    console.error('Workload summary error:', e);
  }
}

async function showWorkloadDetail(category, title) {
  document.getElementById('workloadDetailTitle').textContent = title;
  const dp = document.getElementById('workloadDatePicker');
  dp.value = '';
  dp.style.display = category === 'date' ? '' : '';
  const ct = document.getElementById('workloadDetailContent');
  ct.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-secondary)">Loading...</div>';
  openModal('workloadDetailModal');

  const data = await api(`/api/tasks/workload-detail?category=${category}`);
  renderWorkloadDetailTasks(data, ct, category);
}

document.getElementById('workloadDatePicker').addEventListener('change', async function() {
  const date = this.value;
  if (!date) return;
  const d = new Date(date + 'T00:00:00');
  document.getElementById('workloadDetailTitle').textContent = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const ct = document.getElementById('workloadDetailContent');
  ct.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-secondary)">Loading...</div>';
  const data = await api(`/api/tasks/workload-detail?category=date&date=${date}`);
  renderWorkloadDetailTasks(data, ct, 'date');
});

function renderWorkloadDetailTasks(data, ct, category) {
  const isDateView = category === 'date';
  const tasks = isDateView ? [...(data.planned || []), ...(data.completed || [])] : (Array.isArray(data) ? data : []);

  if (!tasks.length) {
    ct.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-secondary)">No tasks</div>';
    return;
  }

  // Group by assignee
  const groups = {};
  for (const t of tasks) {
    const a = t.assignee || 'Unassigned';
    if (!groups[a]) groups[a] = { tasks: [], hours: 0 };
    groups[a].tasks.push(t);
    groups[a].hours += t.estimated_hours || 0;
  }
  const totalHours = tasks.reduce((s, t) => s + (t.estimated_hours || 0), 0);
  const fmt = h => h % 1 === 0 ? h : h.toFixed(1);

  let html = `<div style="padding:12px 16px;font-size:12px;color:var(--text-secondary);border-bottom:1px solid var(--border)">${tasks.length} task${tasks.length !== 1 ? 's' : ''} &middot; ${fmt(totalHours)} hours total</div>`;

  for (const [assignee, g] of Object.entries(groups)) {
    const mem = findUser(assignee);
    html += `<div style="padding:10px 16px;background:var(--bg-glass);font-weight:600;font-size:13px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border)">
      ${userAvatar(mem, 24)}<span>${esc(assignee)}</span>
      <span style="margin-left:auto;font-weight:500;color:var(--text-secondary);font-size:12px">${fmt(g.hours)}h &middot; ${g.tasks.length} task${g.tasks.length !== 1 ? 's' : ''}</span>
    </div>`;
    html += g.tasks.map(t => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--border);cursor:pointer" onclick="closeModal('workloadDetailModal');setTimeout(()=>editTask(${t.id}),200)">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px">
            ${t.task_band?`<span class="band-badge ${bandClass(t.task_band)}">${bandLabel(t.task_band)}</span>`:''}
            <span style="font-weight:600;font-size:13px">${esc(t.title)}</span>
          </div>
          <div style="font-size:11px;color:var(--text-secondary)">${t.client_code ? '[' + esc(t.client_code) + '] ' : ''}${esc(t.client_name)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          ${t.estimated_hours ? `<span style="font-size:12px;color:var(--text-secondary)">${t.estimated_hours}h</span>` : ''}
          <span class="status-badge status-${t.task_status}">${statusLabel(t.task_status)}</span>
          ${t.deadline || t.planned_date ? `<span style="font-size:11px;color:var(--text-secondary)">${fmtDate(t.planned_date || t.deadline)}</span>` : ''}
        </div>
      </div>
    `).join('');
  }
  ct.innerHTML = html;
}

function navigateToTask(cid,tid) {
  closeModal('statsModal');
  if (currentView!=='clients') { document.querySelector('[data-view="clients"]').click(); }
  renderClients();
  setTimeout(()=>{ const el=document.querySelector(`[data-task-id="${tid}"]`); if(el){el.scrollIntoView({behavior:'smooth',block:'center'}); el.classList.add('highlight'); setTimeout(()=>{el.classList.remove('highlight');},2000);} },100);
}

// ─── Helpers ────────────────────────────────────────────
// HTML-escape for BOTH element and attribute contexts. The old textContent
// trick did not escape quotes, which left value="${...}" attributes injectable.
function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
// For values interpolated into inline JS strings (onclick="f('...')") —
// entity-escaping doesn't survive attribute decoding, so allow-list instead.
function jsSafe(s){return String(s||'').replace(/[^A-Za-z0-9._-]/g,'');}
function localDateStr(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function taskRef(id) { return 'NB' + String(id).padStart(3, '0'); }
function userAvatar(user, size) {
  const s = size || 20;
  if (!user) return '';
  // Colour lands in an inline style attribute — accept hex only.
  const raw = user.avatar_color || '';
  const color = /^#[0-9a-fA-F]{3,8}$/.test(raw) ? raw : '#3eaf84';
  if (user.avatar_url) {
    return `<img src="${esc(user.avatar_url)}" style="width:${s}px;height:${s}px;border-radius:50%;object-fit:cover;border:2px solid ${color};flex-shrink:0" alt="">`;
  }
  return `<span style="width:${s}px;height:${s}px;border-radius:50%;background:${color};display:inline-flex;align-items:center;justify-content:center;font-size:${Math.round(s*0.45)}px;color:#fff;font-weight:600;flex-shrink:0">${(user.display_name||user.name||'?')[0]}</span>`;
}
function findUser(name) { return appUsers.find(u=>u.display_name===name)||teamMembers.find(m=>m.name===name)||null; }
function fmtDate(d){if(!d)return'';return new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}
function fmtDateShort(d){if(!d)return'';return new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});}
function getDeadlineClass(dl,prog){if(!dl||prog==='completed'||prog==='invoiced')return'';const now=new Date();now.setHours(0,0,0,0);const diff=(new Date(dl+'T00:00:00')-now)/864e5;return diff<0?'overdue':diff<=3?'due-soon':'';}
function progressLabel(p){return{'not-started':'Not Started','in-progress':'In Progress','completed':'Completed','stuck':'Stuck','awaiting-client':'Awaiting Client','awaiting-manager':'Awaiting Manager','ready-to-invoice':'Ready to Invoice','invoiced':'Invoiced'}[p]||p;}
function priorityLabel(p){return{'critical':'Critical','high':'High','medium':'Medium','low':'Low'}[p]||p;}

// ─── Client Control Board enums (canonical) ─────────────────────────────
const TASK_STATUS = {
  'inbox':             { label: 'Inbox',             cls: 'st-inbox' },
  'scheduled':         { label: 'Scheduled',         cls: 'st-scheduled' },
  'in-progress':       { label: 'In Progress',       cls: 'st-in-progress' },
  'waiting-on-client': { label: 'Waiting on Client', cls: 'st-waiting-client' },
  'waiting-on-me':     { label: 'Waiting on Me',     cls: 'st-waiting-me' },
  'done':              { label: 'Done',              cls: 'st-done' },
  'cancelled':         { label: 'Cancelled',         cls: 'st-cancelled' },
};
const TASK_BAND = {
  'today':     { label: 'Today',     cls: 'bd-today' },
  'this-week': { label: 'This Week', cls: 'bd-this-week' },
  'scheduled': { label: 'Scheduled', cls: 'bd-scheduled' },
  'waiting':   { label: 'Waiting',   cls: 'bd-waiting' },
  'someday':   { label: 'Someday',   cls: 'bd-someday' },
};
const TASK_TYPE = {
  'recurring': 'Recurring', 'ad-hoc': 'Ad Hoc', 'urgent': 'Urgent',
  'sales': 'Sales', 'admin': 'Admin', 'waiting': 'Waiting', 'idea': 'Idea',
};
const CONTROL_STATUS = {
  'green': { label: 'Under control',  cls: 'rag-green' },
  'amber': { label: 'Needs attention', cls: 'rag-amber' },
  'red':   { label: 'Urgent / overdue', cls: 'rag-red' },
  'blue':  { label: 'Waiting on client', cls: 'rag-blue' },
};
const RISK = { 'low': 'Low', 'medium': 'Medium', 'high': 'High' };
const STATUS_ORDER = ['inbox','scheduled','in-progress','waiting-on-client','waiting-on-me','done','cancelled'];
const BAND_ORDER = ['today','this-week','scheduled','waiting','someday'];
const BAND_RANK = { 'today':0,'this-week':1,'scheduled':2,'waiting':3,'someday':4 };
const TYPE_ORDER = ['recurring','ad-hoc','urgent','sales','admin','waiting','idea'];

function statusLabel(s){ return (TASK_STATUS[s]||{}).label || s || ''; }
function statusClass(s){ return (TASK_STATUS[s]||{}).cls || ''; }
function bandLabel(b){ return (TASK_BAND[b]||{}).label || ''; }
function bandClass(b){ return (TASK_BAND[b]||{}).cls || ''; }
function typeLabel(t){ return TASK_TYPE[t] || ''; }
function isOpenTask(t){ return t.task_status !== 'done' && t.task_status !== 'cancelled'; }
function statusOptions(sel){ return STATUS_ORDER.map(s=>`<option value="${s}" ${sel===s?'selected':''}>${statusLabel(s)}</option>`).join(''); }
function bandOptions(sel){ return ['',...BAND_ORDER].map(b=>`<option value="${b}" ${sel===b?'selected':''}>${b?bandLabel(b):'—'}</option>`).join(''); }
function typeSelectOptions(sel){ return ['',...TYPE_ORDER].map(t=>`<option value="${t}" ${sel===t?'selected':''}>${t?typeLabel(t):'—'}</option>`).join(''); }
function timeAgo(ds){if(!ds)return'';const now=new Date(),d=new Date(ds.replace(' ','T')+(ds.includes('T')||ds.includes(' ')?'Z':'T00:00:00Z')),m=Math.floor((now-d)/6e4);if(isNaN(m))return'';if(m<1)return'just now';if(m<60)return m+'m ago';const h=Math.floor(m/60);if(h<24)return h+'h ago';const dd=Math.floor(h/24);if(dd<7)return dd+'d ago';return d.toLocaleDateString('en-GB',{day:'numeric',month:'short'});}
function fmtDateTime(ds){if(!ds)return'';const d=new Date(ds.replace(' ','T')+(ds.includes('T')||ds.includes(' ')?'Z':'T00:00:00Z'));if(isNaN(d))return'';return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+' at '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});}
function fmtFileSize(bytes){if(bytes<1024)return bytes+'B';if(bytes<1048576)return(bytes/1024).toFixed(1)+'KB';return(bytes/1048576).toFixed(1)+'MB';}

// ─── Toggles ────────────────────────────────────────────
function toggleCompletedTasks(key){showCompletedTasks.has(key)?showCompletedTasks.delete(key):showCompletedTasks.add(key);renderClients();}

// ─── Modal ──────────────────────────────────────────────
function openModal(id){document.getElementById(id).classList.add('active');document.getElementById('modalBackdrop').classList.add('active');}
// Unsaved-edit protection for the task modal: an interruption (Esc, backdrop
// click, X) shouldn't silently throw away half-entered work.
let taskFormSnapshot = '';
let taskModalOrigin = null;   // client id when the modal was opened from a client detail view

function taskFormSerialize() {
  const ids = ['taskTitle','taskClientSelect','taskStatus','taskBand','taskDeadline','taskNotes','taskAssignee','taskSecondaryAssignee','taskType','taskPlannedDate','taskEstHours','taskSuggestedBlock','taskReferences'];
  return ids.map(id => document.getElementById(id)?.value ?? '').join('|') + '|' + (document.getElementById('taskRecurring')?.checked ? 1 : 0);
}
function taskFormDirty() {
  return taskFormSnapshot !== '' && document.getElementById('taskModal').classList.contains('active') && taskFormSerialize() !== taskFormSnapshot;
}

function closeModal(id){
  if (id === 'taskModal') {
    if (taskFormDirty() && !confirm('Discard unsaved changes to this task?')) return;
    taskFormSnapshot = '';
    const origin = taskModalOrigin; taskModalOrigin = null;
    document.getElementById(id).classList.remove('active');
    if(!document.querySelector('.modal.active'))document.getElementById('modalBackdrop').classList.remove('active');
    // Breadcrumb behaviour: return to the client you came from.
    if (origin) setTimeout(() => openClientDetail(origin), 80);
    return;
  }
  document.getElementById(id).classList.remove('active');
  if(!document.querySelector('.modal.active'))document.getElementById('modalBackdrop').classList.remove('active');
}
function closeAllModals(){
  if (taskFormDirty() && !confirm('Discard unsaved changes to this task?')) return;
  taskFormSnapshot = ''; taskModalOrigin = null;
  document.querySelectorAll('.modal.active').forEach(m=>m.classList.remove('active'));
  document.getElementById('modalBackdrop').classList.remove('active');
}
document.getElementById('modalBackdrop').addEventListener('click',closeAllModals);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAllModals();});

// ─── Render Flat Task List (Default Home View) ─────────
function renderClients() {
  const ct = document.getElementById('clientList');
  if (!clients.length) { ct.innerHTML='<div class="empty-state"><img src="/NBM%20Logo%20No%20NG%20Light%20Lines.png" alt="" style="width:80px;opacity:0.3;margin-bottom:16px"><p>No clients yet. Click + to add one.</p></div>'; return; }

  const today = localDateStr(new Date());
  const myName = currentUser?.display_name || '';
  const clientFilterId = document.getElementById('clientFilter')?.value;
  const personFilterVal = document.getElementById('personFilter')?.value;
  const statusFilterVal = document.getElementById('statusFilter')?.value;

  const allTasks = [];
  for (const c of clients) {
    if (clientFilterId && String(c.id) !== clientFilterId) continue;
    for (const t of c.tasks) {
      if (myTasksFilter && t.assignee !== myName && t.secondary_assignee !== myName) continue;
      if (personFilterVal && t.assignee !== personFilterVal && t.secondary_assignee !== personFilterVal) continue;
      if (statusFilterVal && t.task_status !== statusFilterVal) continue;
      allTasks.push({ ...t, client_name: c.name, client_code: c.code, client_logo: c.logo_url, client_id: c.id });
    }
  }

  const active = allTasks.filter(isOpenTask);
  const done = allTasks.filter(t => !isOpenTask(t));

  active.sort((a, b) => {
    if ((b.is_pinned||0) !== (a.is_pinned||0)) return (b.is_pinned||0) - (a.is_pinned||0);
    const aDate = a.deadline || a.planned_date || '9999';
    const bDate = b.deadline || b.planned_date || '9999';
    const aOverdue = aDate < today ? 0 : 1;
    const bOverdue = bDate < today ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    if (aDate !== bDate) return aDate < bDate ? -1 : 1;
    return (BAND_RANK[a.task_band] ?? 2) - (BAND_RANK[b.task_band] ?? 2);
  });

  const overdue = active.filter(t => { const d = t.deadline || t.planned_date; return d && d < today; });
  const totalH = active.reduce((s, t) => s + (t.estimated_hours || 0), 0);
  const fmt = h => h % 1 === 0 ? h : h.toFixed(1);

  let html = `<div class="flat-tasks-header">
    <div style="display:flex;align-items:center;gap:14px;font-size:12px;color:var(--text-secondary)">
      <span style="font-weight:600;color:var(--text)">${active.length} active</span>
      <span>${fmt(totalH)}h total</span>
      ${overdue.length ? `<span style="color:var(--danger)">${overdue.length} overdue</span>` : ''}
      ${done.length ? `<span>${done.length} done</span>` : ''}
    </div>
  </div>`;

  if (overdue.length && myTasksFilter) {
    html += `<div class="reschedule-bar">
      <span style="color:var(--danger);font-weight:600">${overdue.length} overdue</span>
      <span>&mdash; push forward by</span>
      <select id="rescheduleAmount" style="background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius);padding:4px 8px;font-size:12px;color:var(--text);font-family:inherit">
        <option value="1">1 day</option><option value="2">2 days</option><option value="3">3 days</option><option value="7" selected>1 week</option><option value="14">2 weeks</option><option value="custom">Pick a date...</option>
      </select>
      <input type="date" id="rescheduleDate" style="display:none;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius);padding:4px 8px;font-size:12px;color:var(--text);font-family:inherit">
      <button class="btn btn-primary btn-sm" onclick="rescheduleOverdue()">Reschedule Overdue</button>
    </div>`;
  }

  html += '<div class="flat-tasks-list">';

  function flatTaskRow(t, isDone) {
    const dc = getDeadlineClass(t.deadline, t.progress);
    const mem = findUser(t.assignee);
    const sel = selectedTasks.has(t.id);
    return `<div class="flat-task-row ${isDone ? 'completed' : ''} ${sel ? 'task-selected' : ''}" data-task-id="${t.id}">
      <input type="checkbox" class="task-checkbox" ${sel?'checked':''} onclick="event.stopPropagation();toggleTaskSelect(${t.id})" title="Select">
      <div class="flat-task-client">
        ${t.client_logo ? `<img src="${esc(t.client_logo)}" alt="">` : `<span class="client-code-badge">${esc(t.client_code || t.client_name.substring(0,3))}</span>`}
        <span class="flat-task-client-name">${esc(t.client_name)}</span>
      </div>
      <div class="flat-task-info">
        <div style="display:flex;align-items:center;gap:6px">
          <span class="task-ref" title="Ref: ${taskRef(t.id)}">${taskRef(t.id)}</span>
          ${t.task_band?`<span class="band-badge ${bandClass(t.task_band)}" title="When: ${bandLabel(t.task_band)}">${bandLabel(t.task_band)}</span>`:''}
          <span class="task-title" onclick="editTask(${t.id})">${esc(t.title)}</span>
          ${t.task_type?`<span class="type-badge" title="Type">${typeLabel(t.task_type)}</span>`:''}
          ${t.is_pinned?'<span style="color:var(--primary);font-size:11px">&#9733;</span>':''}
          ${t.is_recurring?'<span class="recurring-badge" title="Recurring">&#8635;</span>':''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;min-width:80px">
        ${userAvatar(mem, 22)}<span style="font-size:12px">${esc(t.assignee||'')}</span>
      </div>
      <div style="min-width:110px"><input type="date" class="inline-date ${dc}" value="${esc(t.deadline||'')}" onchange="inlineFieldChange(${t.id},'deadline',this.value)" onclick="event.stopPropagation()" title="Deadline"></div>
      <div style="min-width:110px"><input type="date" class="inline-date" value="${esc(t.planned_date||'')}" onchange="inlineFieldChange(${t.id},'planned_date',this.value)" onclick="event.stopPropagation()" title="Planned date"></div>
      <div style="min-width:50px"><input type="number" class="inline-hours" value="${esc(t.estimated_hours||'')}" min="0" step="0.5" onchange="inlineFieldChange(${t.id},'estimated_hours',parseFloat(this.value)||0)" onclick="event.stopPropagation()" title="Est. hours"></div>
      <div><select class="quick-status status-${t.task_status}" onchange="quickStatusChange(${t.id},this.value)" onclick="event.stopPropagation()">
        ${statusOptions(t.task_status)}
      </select></div>
      <div class="task-actions">
        <button class="btn-icon" onclick="editTask(${t.id})" title="Full edit">&#128196;</button>
        <button class="btn-icon" onclick="archiveTask(${t.id})" title="Archive">&#128230;</button>
      </div>
    </div>`;
  }

  html += active.map(t => flatTaskRow(t, false)).join('');

  if (!active.length) {
    html += '<div style="padding:24px;text-align:center;color:var(--text-secondary)">No active tasks matching filters</div>';
  }

  if (done.length) {
    const showDone = showCompletedTasks.has(0);
    html += `<div style="padding:10px 14px;cursor:pointer;font-size:12px;color:var(--text-secondary);border-top:1px solid var(--border)" onclick="toggleCompletedTasks(0)">
      ${showDone?'&#9660;':'&#9654;'} ${done.length} completed
    </div>`;
    if (showDone) html += done.map(t => flatTaskRow(t, true)).join('');
  }

  html += '</div>';

  // Filter notice
  const fn = document.getElementById('filterNotice');
  if (fn) {
    const activeFilter = myTasksFilter ? 'myTasks' : currentFilter !== 'all' ? currentFilter : null;
    if (activeFilter && filterQuips[activeFilter]) {
      const quips = filterQuips[activeFilter];
      const quip = quips[Math.floor(Math.random() * quips.length)];
      fn.innerHTML = `<div style="text-align:center;padding:12px 20px;font-size:12px;color:var(--text-secondary);font-style:italic;border-top:1px solid var(--border)">${quip} <a href="#" onclick="clearAllFilters();return false" style="color:var(--primary);text-decoration:underline;font-style:normal">Show everything</a></div>`;
      fn.style.display = 'block';
    } else { fn.style.display = 'none'; }
  }

  ct.innerHTML = html;

  const sel = document.getElementById('rescheduleAmount');
  const datePicker = document.getElementById('rescheduleDate');
  if (sel && datePicker) {
    sel.addEventListener('change', () => { datePicker.style.display = sel.value === 'custom' ? '' : 'none'; });
  }
}


async function inlineFieldChange(taskId, field, value) {
  const body = {};
  body[field] = value;
  await api(`/api/tasks/${taskId}`, { method: 'PUT', body });
  // Update local data without full reload for snappier feel
  for (const c of clients) {
    const t = c.tasks.find(x => x.id === taskId);
    if (t) { t[field] = value; break; }
  }
}

async function quickStatusChange(taskId, newStatus) {
  const oldTask = findTaskById(taskId);
  const wasDone = oldTask && oldTask.task_status === 'done';
  await api(`/api/tasks/${taskId}`, {method:'PUT', body:{task_status:newStatus}});
  await loadClients();
  if (currentView === 'dashboard') loadDashboard();
  // Celebrate when completing a task
  if (!wasDone && newStatus === 'done') celebrate();
}

// ─── Archive ────────────────────────────────────────────
async function archiveClient(id){const c=clients.find(x=>x.id===id);if(!confirm(`Archive "${c?.name}"?`))return;await api(`/api/clients/${id}/archive`,{method:'PUT'});await loadClients();}
async function deleteClient(id){const c=clients.find(x=>x.id===id);const name=c?c.name:'this client';if(!confirm(`Permanently delete "${name}" and all its tasks? This cannot be undone.`))return;if(!confirm(`Are you sure? This will delete ALL data for "${name}".`))return;await api(`/api/clients/${id}`,{method:'DELETE'});await loadClients();}
async function archiveTask(id){await api(`/api/tasks/${id}/archive`,{method:'PUT'});await loadClients();}
async function deleteTask(id){const t=findTaskById(id);const title=t?t.title:'this task';if(!confirm(`Permanently delete "${title}"? This cannot be undone.`))return;await api(`/api/tasks/${id}`,{method:'DELETE'});await loadClients();}

// ─── Batch Select & Move ──────────────────────────────
function toggleTaskSelect(taskId) {
  if (selectedTasks.has(taskId)) selectedTasks.delete(taskId);
  else selectedTasks.add(taskId);
  renderBatchBar();
  // Update checkbox and highlight without full re-render
  const row = document.querySelector(`[data-task-id="${taskId}"]`);
  if (row) {
    row.classList.toggle('task-selected', selectedTasks.has(taskId));
    const cb = row.querySelector('.task-checkbox');
    if (cb) cb.checked = selectedTasks.has(taskId);
  }
}

function clearTaskSelection() {
  selectedTasks.clear();
  document.querySelectorAll('.task-selected').forEach(el => el.classList.remove('task-selected'));
  document.querySelectorAll('.task-checkbox').forEach(cb => cb.checked = false);
  renderBatchBar();
}

function renderBatchBar() {
  let bar = document.getElementById('batchBar');
  if (!selectedTasks.size) { if (bar) bar.style.display = 'none'; return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'batchBar';
    bar.className = 'batch-bar';
    document.body.appendChild(bar);
  }
  bar.style.display = 'flex';
  bar.innerHTML = `
    <span><strong>${selectedTasks.size}</strong> task${selectedTasks.size > 1 ? 's' : ''} selected</span>
    <button class="btn btn-primary btn-sm" onclick="openMoveModal()">Move to...</button>
    <button class="btn btn-ghost btn-sm" onclick="batchDuplicate()">Duplicate</button>
    <button class="btn btn-ghost btn-sm" onclick="batchDelete()" style="color:var(--danger)">Delete</button>
    <button class="btn btn-ghost btn-sm" onclick="clearTaskSelection()">Cancel</button>
  `;
}

function openMoveModal() {
  let html = '<div class="form-error" id="moveFormError" style="display:none"></div>';
  html += '<div class="move-tree">';
  for (const c of clients) {
    html += `<label class="move-project-option"><input type="radio" name="moveTarget" value="${c.id}"> <strong>${esc(c.name)}</strong> <span style="color:var(--text-secondary);font-size:12px">[${esc(c.code||'')}]</span></label>`;
  }
  html += '</div>';
  html += `<div class="form-actions" style="margin-top:16px">
    <button class="btn btn-ghost" onclick="closeModal('moveModal')">Cancel</button>
    <button class="btn btn-primary" onclick="executeBatchMove()">Move ${selectedTasks.size} task${selectedTasks.size > 1 ? 's' : ''}</button>
  </div>`;

  let modal = document.getElementById('moveModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'moveModal';
    modal.className = 'modal';
    modal.style.maxWidth = '500px';
    modal.innerHTML = `<div class="modal-header"><h2>Move Tasks to Client</h2><button class="modal-close" onclick="closeModal('moveModal')">&times;</button></div><div id="moveModalBody" style="padding:20px 28px"></div>`;
    document.body.appendChild(modal);
  }
  document.getElementById('moveModalBody').innerHTML = html;
  openModal('moveModal');
}

async function executeBatchMove() {
  const selected = document.querySelector('input[name="moveTarget"]:checked');
  if (!selected) {
    const err = document.getElementById('moveFormError');
    err.textContent = 'Select a destination client';
    err.style.display = 'block';
    return;
  }
  const targetId = +selected.value;
  const ids = [...selectedTasks];
  try {
    await api('/api/tasks/batch-move', { method: 'POST', body: { task_ids: ids, target_client_id: targetId } });
    closeModal('moveModal');
    clearTaskSelection();
    await loadClients();
  } catch (err) {
    const errEl = document.getElementById('moveFormError');
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
}

async function batchDelete() {
  const count = selectedTasks.size;
  if (!confirm(`Delete ${count} task${count > 1 ? 's' : ''}? This cannot be undone.`)) return;
  const ids = [...selectedTasks];
  for (const id of ids) {
    await api(`/api/tasks/${id}`, { method: 'DELETE' });
  }
  clearTaskSelection();
  await loadClients();
}

async function batchDuplicate() {
  const ids = [...selectedTasks];
  for (const id of ids) {
    await api(`/api/tasks/${id}/duplicate`, { method: 'POST' });
  }
  clearTaskSelection();
  await loadClients();
}

async function restoreTask(id){await api(`/api/tasks/${id}/archive`,{method:'PUT'});await loadClients();}
async function restoreClient(id){await api(`/api/clients/${id}/archive`,{method:'PUT'});await loadClients();await showArchiveModal();}
async function permanentDeleteClient(id){if(!confirm('Permanently delete? Cannot be undone.'))return;await api(`/api/clients/${id}`,{method:'DELETE'});await loadClients();await showArchiveModal();}

document.getElementById('viewArchiveBtn').addEventListener('click',showArchiveModal);
async function showArchiveModal(){
  const archived=await api('/api/archived/clients');
  document.getElementById('archiveContent').innerHTML=!archived.length?'<div style="padding:24px;text-align:center;color:var(--text-secondary)">No archived items</div>':
    archived.map(c=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--border)"><div><div style="font-weight:600">${esc(c.name)}</div><div style="font-size:11px;color:var(--text-secondary)">${c.agreement_type}</div></div><div style="display:flex;gap:6px"><button class="btn btn-ghost btn-sm" onclick="restoreClient(${c.id})">Restore</button><button class="btn btn-danger btn-sm" onclick="permanentDeleteClient(${c.id})">Delete</button></div></div>`).join('');
  openModal('archiveModal');
}

// ─── Client CRUD ────────────────────────────────────────
document.getElementById('addClientBtn').addEventListener('click',()=>{
  document.getElementById('clientModalTitle').textContent='New Client';
  document.getElementById('clientFormError').style.display='none';
  ['clientId','clientName','clientCode','clientNotes','clientGmail','clientDrive','clientMonthlyValue','clientAgreementSummary','clientRecurringDeliverables','clientLastContact','clientNextScheduled','clientContacts'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('clientType').value='recurring';
  document.getElementById('clientTypeBand').value='retainer';
  document.getElementById('clientControlStatus').value='';
  document.getElementById('clientRiskLevel').value='';
  document.getElementById('clientLogo').value='';
  document.getElementById('clientPrivate').checked=false;
  document.getElementById('privateClientGroup').style.display=currentUser?.role==='owner'?'':'none';
  window._croppedLogo=null;
  openModal('clientModal');
});
function editClient(id){
  const c=clients.find(x=>x.id===id);if(!c)return;
  document.getElementById('clientModalTitle').textContent='Edit Client';
  document.getElementById('clientFormError').style.display='none';
  document.getElementById('clientId').value=c.id;
  document.getElementById('clientName').value=c.name;
  document.getElementById('clientCode').value=c.code||'';
  document.getElementById('clientType').value=c.agreement_type;
  document.getElementById('clientTypeBand').value=c.client_type||'retainer';
  document.getElementById('clientMonthlyValue').value=c.monthly_value||'';
  document.getElementById('clientAgreementSummary').value=c.agreement_summary||'';
  document.getElementById('clientRecurringDeliverables').value=c.recurring_deliverables||'';
  document.getElementById('clientLastContact').value=c.last_contact_date||'';
  document.getElementById('clientNextScheduled').value=c.next_scheduled_date||'';
  document.getElementById('clientControlStatus').value=c.control_status||'';
  document.getElementById('clientRiskLevel').value=c.risk_level||'';
  document.getElementById('clientContacts').value=c.important_contacts||'';
  document.getElementById('clientNotes').value=c.notes||'';
  document.getElementById('clientGmail').value=c.gmail_link||'';
  document.getElementById('clientDrive').value=c.drive_link||'';
  document.getElementById('clientLogo').value='';
  document.getElementById('clientPrivate').checked=!!c.is_private;
  document.getElementById('privateClientGroup').style.display=currentUser?.role==='owner'?'':'none';
  openModal('clientModal');
}
document.getElementById('clientForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const errEl=document.getElementById('clientFormError');
  errEl.style.display='none';
  const id=document.getElementById('clientId').value;
  const data={name:document.getElementById('clientName').value,code:document.getElementById('clientCode').value,agreement_type:document.getElementById('clientType').value,notes:document.getElementById('clientNotes').value,gmail_link:document.getElementById('clientGmail').value,drive_link:document.getElementById('clientDrive').value,is_private:document.getElementById('clientPrivate').checked,
    client_type:document.getElementById('clientTypeBand').value,
    monthly_value:parseFloat(document.getElementById('clientMonthlyValue').value)||0,
    agreement_summary:document.getElementById('clientAgreementSummary').value,
    recurring_deliverables:document.getElementById('clientRecurringDeliverables').value,
    last_contact_date:document.getElementById('clientLastContact').value,
    next_scheduled_date:document.getElementById('clientNextScheduled').value,
    control_status:document.getElementById('clientControlStatus').value,
    risk_level:document.getElementById('clientRiskLevel').value,
    important_contacts:document.getElementById('clientContacts').value};
  if (!data.name.trim()) { errEl.textContent='Client name is required.'; errEl.style.display='block'; return; }
  if (!data.code || data.code.length !== 3) { errEl.textContent='Client code must be exactly 3 letters.'; errEl.style.display='block'; return; }
  data.code = data.code.toUpperCase();
  const btn=e.target.querySelector('[type="submit"]');
  setSaving(btn, true);
  try {
    let r;if(id){r=await api(`/api/clients/${id}`,{method:'PUT',body:data});}else{r=await api('/api/clients',{method:'POST',body:data});}
    if(window._croppedLogo){const fd=new FormData();fd.append('logo',window._croppedLogo,'logo.jpg');const lr=await fetch(`/api/clients/${r.id}/logo`,{method:'POST',body:fd});if(!lr.ok){const le=await lr.text();console.error('Logo upload failed:',le);}window._croppedLogo=null;}
    closeModal('clientModal');await loadClients();
  } catch(err) { errEl.textContent=err.message; errEl.style.display='block'; }
  finally { setSaving(btn, false); }
});

// ─── Task CRUD ──────────────────────────────────────────
function setTaskMore(open) {
  document.getElementById('taskMoreSection').style.display = open ? '' : 'none';
  document.getElementById('taskMoreArrow').innerHTML = open ? '&#9662;' : '&#9656;';
}
function toggleTaskMore() {
  setTaskMore(document.getElementById('taskMoreSection').style.display === 'none');
}
function updateTaskCrumb() {
  const crumb = document.getElementById('taskBackCrumb');
  const c = taskModalOrigin ? clients.find(x => x.id === taskModalOrigin) : null;
  crumb.style.display = c ? '' : 'none';
  if (c) document.getElementById('taskBackName').textContent = c.name;
}

function openTaskModal(cid){
  taskModalOrigin = null; updateTaskCrumb();
  document.getElementById('taskModalTitle').textContent='New Task';
  document.getElementById('taskFormError').style.display='none';
  ['taskId','taskTitle','taskDeadline','taskPlannedDate','taskEstHours','taskReferences','taskNotes','taskSuggestedBlock'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('taskClientId').value=cid;
  document.getElementById('taskClientSelect').innerHTML = clientSelectOptions(cid ? +cid : '');
  document.getElementById('taskStatus').value='inbox';
  document.getElementById('taskBand').value='';
  document.getElementById('taskType').value='';
  document.getElementById('taskRecurring').checked=false;
  document.getElementById('recurOptions').style.display='none';
  document.getElementById('taskRecurInterval').value='1';
  document.getElementById('taskRecurUnit').value='months';
  document.getElementById('taskAttachmentsList').innerHTML='';
  document.getElementById('taskFiles').value='';
  currentChecklist = [];
  renderChecklist();
  populateAssigneeDropdown('', '');
  setTaskMore(false);
  document.getElementById('taskMoreHint').textContent = '';
  openModal('taskModal');
  taskFormSnapshot = taskFormSerialize();
}

function findTaskById(id) {
  for(const c of clients) {
    let t = c.tasks.find(x=>x.id===id);
    if(t) return t;
    if(c.archivedTasks) { t = c.archivedTasks.find(x=>x.id===id); if(t) return t; }
  }
  return null;
}

function editTask(id){
  const t=findTaskById(id);
  if(!t)return;
  taskModalOrigin = null; updateTaskCrumb();
  document.getElementById('taskModalTitle').textContent = 'Edit Task — ' + taskRef(t.id);
  document.getElementById('taskFormError').style.display='none';
  document.getElementById('taskId').value=t.id;
  document.getElementById('taskClientId').value=t.client_id;
  document.getElementById('taskClientSelect').innerHTML = clientSelectOptions(t.client_id);
  document.getElementById('taskTitle').value=t.title;
  document.getElementById('taskDeadline').value=t.deadline||'';
  document.getElementById('taskPlannedDate').value=t.planned_date||'';
  document.getElementById('taskEstHours').value=t.estimated_hours||'';
  document.getElementById('taskStatus').value=t.task_status||'inbox';
  document.getElementById('taskBand').value=t.task_band||'';
  document.getElementById('taskType').value=t.task_type||'';
  document.getElementById('taskSuggestedBlock').value=t.suggested_block||'';
  document.getElementById('taskReferences').value=t.references_text||'';
  document.getElementById('taskNotes').value=t.notes||'';
  document.getElementById('taskRecurring').checked=!!t.is_recurring;
  document.getElementById('recurOptions').style.display=t.is_recurring?'block':'none';
  document.getElementById('taskRecurInterval').value=t.recur_interval||1;
  document.getElementById('taskRecurUnit').value=t.recur_unit||'months';
  document.getElementById('taskFiles').value='';
  // Show existing attachments
  const al=document.getElementById('taskAttachmentsList');
  al.innerHTML=(t.attachments||[]).map(a=>`<div class="attachment-item"><span>&#128206; ${esc(a.original_name)} (${fmtFileSize(a.file_size)})</span><button type="button" class="btn-icon" onclick="deleteAttachment(${a.id})" title="Remove">&times;</button></div>`).join('');
  populateAssigneeDropdown(t.assignee||'', t.secondary_assignee||'');
  loadChecklist(t.id);
  // Auto-expand "More options" only when it holds something relevant — otherwise stay slim.
  const advancedSet = !!(t.assignee || t.secondary_assignee || t.task_type || t.planned_date ||
    t.estimated_hours || t.suggested_block || t.references_text || t.is_recurring || (t.attachments||[]).length);
  setTaskMore(advancedSet);
  const hints = [];
  if (t.assignee) hints.push(t.assignee);
  if (t.task_type) hints.push(typeLabel(t.task_type));
  if (t.is_recurring) hints.push('recurring');
  if ((t.attachments||[]).length) hints.push(`${t.attachments.length} file${t.attachments.length>1?'s':''}`);
  document.getElementById('taskMoreHint').textContent = advancedSet && hints.length ? `(${hints.slice(0,3).join(' · ')})` : '';
  openModal('taskModal');
  taskFormSnapshot = taskFormSerialize();
}

// Open a task with a breadcrumb back to the client detail it came from —
// interruption recovery: saving/closing returns you to where you were.
function openTaskFromClient(clientId, taskId) {
  document.getElementById('clientDetailModal').classList.remove('active');
  editTask(taskId);
  taskModalOrigin = clientId;
  updateTaskCrumb();
}
function newTaskFromClient(clientId) {
  document.getElementById('clientDetailModal').classList.remove('active');
  openTaskModal(clientId);
  taskModalOrigin = clientId;
  updateTaskCrumb();
}

function populateAssigneeDropdown(cur, secondaryCur){
  // Pool + the current value even if it's no longer in the pool, so opening
  // a task never silently shows (and later saves) "Unassigned".
  const opts = (blank, val) => `<option value="">${blank}</option>`
    + (val && !assigneePool.includes(val) ? `<option value="${esc(val)}" selected>${esc(val)}</option>` : '')
    + assigneePool.map(n=>`<option value="${esc(n)}" ${n===val?'selected':''}>${esc(n)}</option>`).join('');
  document.getElementById('taskAssignee').innerHTML = opts('Unassigned', cur);
  document.getElementById('taskSecondaryAssignee').innerHTML = opts('None', secondaryCur || '');
}

// Recurring toggle
document.getElementById('taskRecurring').addEventListener('change',function(){
  document.getElementById('recurOptions').style.display=this.checked?'block':'none';
});

document.getElementById('taskForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const errEl=document.getElementById('taskFormError');
  errEl.style.display='none';
  const id=document.getElementById('taskId').value;
  const isRecurring=document.getElementById('taskRecurring').checked;
  const title=document.getElementById('taskTitle').value.trim();
  if (!title) { errEl.textContent='Task title is required.'; errEl.style.display='block'; return; }
  // Customer picker wins; fall back to the hidden field it was opened with.
  const pickedClient = document.getElementById('taskClientSelect').value;
  const data={
    client_id: pickedClient ? +pickedClient : +document.getElementById('taskClientId').value,
    title,
    assignee:document.getElementById('taskAssignee').value,
    secondary_assignee:document.getElementById('taskSecondaryAssignee').value,
    deadline:document.getElementById('taskDeadline').value,
    planned_date:document.getElementById('taskPlannedDate').value,
    estimated_hours:parseFloat(document.getElementById('taskEstHours').value)||0,
    task_status:document.getElementById('taskStatus').value,
    task_band:document.getElementById('taskBand').value,
    task_type:document.getElementById('taskType').value,
    suggested_block:document.getElementById('taskSuggestedBlock').value,
    references_text:document.getElementById('taskReferences').value,
    notes:document.getElementById('taskNotes').value,
    is_recurring:isRecurring,
    recur_interval:isRecurring?parseInt(document.getElementById('taskRecurInterval').value)||1:0,
    recur_unit:isRecurring?document.getElementById('taskRecurUnit').value:'',
  };
  const btn=e.target.querySelector('[type="submit"]');
  setSaving(btn, true);
  const oldTask = id ? findTaskById(parseInt(id)) : null;
  try {
    let taskId;
    if(id){
      await api(`/api/tasks/${id}`,{method:'PUT',body:data});
      taskId=id;
    }else{
      const r=await api('/api/tasks',{method:'POST',body:data});
      taskId=r.id;
      // Show the new task ref
      document.getElementById('taskModalTitle').textContent = 'Task Created — ' + taskRef(taskId);
    }
    // Upload files
    const files=document.getElementById('taskFiles').files;
    if(files.length>0 && taskId){
      const fd=new FormData();
      for(let i=0;i<files.length;i++) fd.append('files',files[i]);
      await fetch(`/api/tasks/${taskId}/attachments`,{method:'POST',body:fd});
    }
    // Saving is a clean close: clear the dirty snapshot and handle the breadcrumb
    // ourselves after data reloads (so the reopened client detail shows fresh state).
    taskFormSnapshot = '';
    const origin = taskModalOrigin; taskModalOrigin = null;
    closeModal('taskModal');await loadClients();
    // Refresh current view
    if (currentView === 'today') loadTodayView();
    if (currentView === 'focus') loadFocusView();
    if (currentView === 'dashboard') loadDashboard();
    if (origin) openClientDetail(origin);
    // Celebrate if task was just completed
    const wasDone = oldTask && oldTask.task_status === 'done';
    if (!wasDone && data.task_status === 'done') celebrate();
  } catch(err) { errEl.textContent=err.message; errEl.style.display='block'; }
  finally { setSaving(btn, false); }
});

async function deleteAttachment(aid){
  await api(`/api/attachments/${aid}`,{method:'DELETE'});
  // Re-open current task to refresh
  const tid=document.getElementById('taskId').value;
  if(tid){await loadClients();editTask(parseInt(tid));}
}

// ─── Comments ───────────────────────────────────────────
async function addComment(e,tid){e.preventDefault();const inp=e.target.querySelector('input');const c=inp.value.trim();if(!c)return;await api(`/api/tasks/${tid}/comments`,{method:'POST',body:{content:c}});inp.value='';await loadClients();}

// ─── Client History ─────────────────────────────────────
function renderHistoryLogs(logs) {
  return !logs.length?'<div style="padding:12px;color:var(--text-secondary)">No activity yet.</div>':
    logs.map(l=>{
      const actionColor=l.action==='created'?'var(--success)':l.action==='archived'?'var(--warning)':l.action==='deleted'?'var(--danger)':'var(--primary)';
      const user=findUser(l.author);
      return`<div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:36px;padding-top:2px">
          <div style="width:8px;height:8px;border-radius:50%;background:${actionColor};flex-shrink:0"></div>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            ${userAvatar(user,18)}
            <strong style="font-size:13px">${esc(l.author)}</strong>
            <span style="font-size:12px">${esc(l.action)}</span>
            <span style="font-size:12px;color:var(--text-secondary)">${esc(l.entity_type)}</span>
          </div>
          ${l.details?`<div style="font-size:12px;color:var(--text-secondary);margin-top:3px">${esc(l.details)}</div>`:''}
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${fmtDateTime(l.created_at)} (${timeAgo(l.created_at)})</div>
        </div>
      </div>`;
    }).join('');
}

document.getElementById('globalHistoryBtn').addEventListener('click', async () => {
  document.getElementById('historyModalTitle').textContent='Activity Log';
  const logs = await api('/api/history?limit=200');
  document.getElementById('historyContent').innerHTML = renderHistoryLogs(logs);
  openModal('historyModal');
});

async function showClientHistory(cid,name){
  document.getElementById('historyModalTitle').textContent='History \u2014 '+name;
  const logs=await api(`/api/clients/${cid}/history?limit=100`);
  document.getElementById('historyContent').innerHTML=renderHistoryLogs(logs);
  openModal('historyModal');
}

// ─── Team ───────────────────────────────────────────────
document.getElementById('manageTeamBtn').addEventListener('click',()=>{renderTeamList();openModal('teamModal');});
function renderTeamList(){
  const ct=document.getElementById('teamList');
  ct.innerHTML=!appUsers.length?'<div class="empty-state"><p>No team members.</p></div>':
    appUsers.map(u=>`<div class="team-member"><div style="display:flex;align-items:center;gap:10px">${userAvatar(u,32)}<div><div style="font-weight:600;font-size:13px">${esc(u.display_name)}</div><div style="font-size:11px;color:var(--text-secondary)">${esc(u.role||'')}</div></div></div></div>`).join('');
}

// ─── Filters ────────────────────────────────────────────
document.querySelectorAll('.filter-btn[data-filter]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.filter-btn[data-filter]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    if (myTasksFilter) document.getElementById('myTasksBtn')?.classList.add('active');
    currentFilter=btn.dataset.filter;loadClients();
  });
});

document.getElementById('clientFilter')?.addEventListener('change', () => renderClients());
document.getElementById('personFilter')?.addEventListener('change', () => renderClients());
document.getElementById('statusFilter')?.addEventListener('change', () => renderClients());

// ─── My Tasks Filter ──────────────────────────────────
function toggleMyTasks() {
  myTasksFilter = !myTasksFilter;
  const btn = document.getElementById('myTasksBtn');
  if (btn) btn.classList.toggle('active', myTasksFilter);
  renderClients();
}

async function rescheduleOverdue() {
  await doReschedule(true);
}

function getMyActiveTasks() {
  const myName = currentUser?.display_name || '';
  const tasks = [];
  for (const c of clients) for (const t of c.tasks) {
    if ((t.assignee === myName || t.secondary_assignee === myName) && isOpenTask(t)) {
      tasks.push(t);
    }
  }
  return tasks;
}

async function doReschedule(overdueOnly) {
  const sel = document.getElementById('rescheduleAmount');
  const datePicker = document.getElementById('rescheduleDate');
  if (!sel) return;

  const today = localDateStr(new Date());
  const myName = currentUser?.display_name || '';
  const tasks = getMyActiveTasks();
  const toUpdate = overdueOnly
    ? tasks.filter(t => { const d = t.deadline || t.planned_date; return d && d < today; })
    : tasks;

  if (!toUpdate.length) return;

  let shiftDays = 0;
  let targetDate = '';

  if (sel.value === 'custom') {
    targetDate = datePicker?.value;
    if (!targetDate) { alert('Pick a target date'); return; }
  } else {
    shiftDays = parseInt(sel.value) || 7;
  }

  for (const t of toUpdate) {
    const body = {};
    if (targetDate) {
      if (t.deadline) body.deadline = targetDate;
      if (t.planned_date) body.planned_date = targetDate;
      if (!t.deadline && !t.planned_date) body.planned_date = targetDate;
    } else {
      if (t.deadline) body.deadline = shiftDate(t.deadline, shiftDays);
      if (t.planned_date) body.planned_date = shiftDate(t.planned_date, shiftDays);
      if (!t.deadline && !t.planned_date) body.planned_date = shiftDate(today, shiftDays);
    }
    await api(`/api/tasks/${t.id}`, { method: 'PUT', body });
  }

  await loadClients();
}

function shiftDate(dateStr, days) {
  // UTC math only — parsing 'YYYY-MM-DDT00:00:00' as local then reading it back
  // via toISOString() drops (or adds) a day in any non-UTC timezone. In BST the
  // old version made "+1 day" a silent no-op. Calendar days are TZ-agnostic.
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split('T')[0];
}

function clearAllFilters() {
  myTasksFilter = false;
  currentFilter = 'all';
  document.getElementById('myTasksBtn')?.classList.remove('active');
  document.getElementById('clientFilter').value = '';
  document.getElementById('personFilter').value = '';
  document.getElementById('statusFilter').value = '';
  document.querySelectorAll('.filter-btn[data-filter]').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === 'all');
  });
  loadClients();
}

const filterQuips = {
  myTasks: [
    "Psst... you're only seeing your own tasks. The rest of the team is probably fine. Probably.",
    "Filtered to just your tasks. Out of sight, out of mind, right?",
    "Showing only your tasks. Everyone else's problems are blissfully hidden.",
    "My Tasks mode: because ignorance is bliss (until the deadline).",
    "You're in your own little task bubble. It's nice here.",
    "Only showing your tasks. What the others are up to is none of your business.",
    "Filtered view active. The tasks you can't see can't hurt you... yet.",
    "Just your tasks. The chaos of everyone else's workload has been conveniently swept under the rug.",
  ],
  recurring: [
    "Showing recurring clients only. The ad-hoc lot are off having a break somewhere.",
    "Recurring clients — the ones who keep coming back for more. Can't blame them.",
    "Just the regulars. Like your favourite pub, but with more invoices.",
    "Only recurring clients. The rest are playing hard to get.",
    "Filtered to retainers only. The ad-hoc ones will be back... probably.",
  ],
  'ad-hoc': [
    "Ad-hoc clients only. The one-night stands of the business world.",
    "Showing one-off projects. Commitment issues? We don't judge.",
    "Just the ad-hoc clients. Here today, invoiced tomorrow.",
    "Ad-hoc only. No strings attached... except the contract.",
    "The non-regulars. They'll be back when they need us. They always come back.",
  ],
};

// ─── Search ────────────────────────────────────────────
const searchInput = document.getElementById('taskSearch');
let searchTimeout;
if (searchInput) {
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      const q = searchInput.value.trim();
      if (!q) { document.getElementById('searchResults').style.display = 'none'; return; }
      const results = await api(`/api/tasks/search?q=${encodeURIComponent(q)}`);
      const sr = document.getElementById('searchResults');
      if (!results.length) {
        sr.innerHTML = '<div style="padding:16px;color:var(--text-secondary);font-size:13px">No tasks found</div>';
      } else {
        sr.innerHTML = results.map(t => `
          <div class="search-result-item" onclick="navigateToTaskFromSearch(${t.id})" style="cursor:pointer">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="task-ref">${taskRef(t.id)}</span>
              ${t.task_band?`<span class="band-badge ${bandClass(t.task_band)}">${bandLabel(t.task_band)}</span>`:''}
              <span style="font-weight:600;font-size:13px">${esc(t.title)}</span>
              ${t.archived ? '<span style="font-size:10px;color:var(--text-muted)">(archived)</span>' : ''}
            </div>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">
              ${esc(t.client_name)} · ${esc(t.assignee || 'Unassigned')} · <span class="status-badge status-${t.task_status}">${statusLabel(t.task_status)}</span>
            </div>
          </div>
        `).join('');
      }
      sr.style.display = 'block';
    }, 300);
  });

  // Close search results when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
      document.getElementById('searchResults').style.display = 'none';
    }
  });
}

function navigateToTaskFromSearch(taskId) {
  document.getElementById('searchResults').style.display = 'none';
  document.getElementById('taskSearch').value = '';
  // Try to find in loaded clients first
  for (const c of clients) {
    const t = c.tasks.find(x => x.id === taskId);
    if (t) {
      if (currentView !== 'clients') document.querySelector('[data-view="clients"]').click();
      renderClients();
      setTimeout(() => {
        const el = document.querySelector(`[data-task-id="${taskId}"]`);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('highlight'); setTimeout(() => el.classList.remove('highlight'), 2000); }
      }, 100);
      return;
    }
  }
  // If not found in current view, just open the edit modal
  editTask(taskId);
}

// ─── Today View ─────────────────────────────────────────
async function loadTodayView(){
  const dateEl=document.getElementById('todayDate');
  if(!dateEl.value)dateEl.value=localDateStr(new Date());
  const date=dateEl.value;
  const person=document.getElementById('todayPerson').value;
  const params=new URLSearchParams({date});
  if(person)params.set('assignee',person);
  let tasks=await api(`/api/tasks/by-date?${params}`);
  // For "today" also include band=today, overdue and due-today tasks (which may carry
  // no planned_date), per the Today spec — merged from loaded clients, deduped by id.
  const todayStr=localDateStr(new Date());
  if(date===todayStr){
    const ids=new Set(tasks.map(t=>t.id));
    const extra=allTasksFlat().filter(t=>{
      if(!isOpenTask(t)||ids.has(t.id)) return false;
      if(person && t.assignee!==person && t.secondary_assignee!==person) return false;
      const overdue=t.deadline && t.deadline<todayStr;
      const dueToday=(t.planned_date||t.deadline)===todayStr;
      return t.task_band==='today'||overdue||dueToday;
    });
    tasks=tasks.concat(extra);
  }
  const d=new Date(date+'T00:00:00');
  document.getElementById('todayTitle').textContent=d.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const ct=document.getElementById('todayContent');
  if(!tasks.length){ct.innerHTML='<div class="empty-state"><img src="/NBM%20Logo%20No%20NG%20Light%20Lines.png" alt="" style="width:60px;opacity:0.25;margin-bottom:12px"><p>No tasks planned for this date</p></div>';return;}
  // Solo mode: when everything belongs to one person, an assignee header is noise —
  // group by client instead so the day reads as "what, for whom".
  const soloMode = new Set(tasks.map(t=>t.assignee||'')).size <= 1;
  const groups={};
  for(const t of tasks){const k=soloMode?(t.client_name||'No client'):(t.assignee||'Unassigned');if(!groups[k])groups[k]=[];groups[k].push(t);}
  let html='';
  for(const [groupName,gTasks] of Object.entries(groups)){
    const mem=soloMode?null:findUser(groupName);
    const totalH=gTasks.reduce((s,t)=>s+(t.estimated_hours||0),0);
    html+=`<div class="today-group"><div class="today-group-header">${mem?userAvatar(mem,28):''}<span style="font-weight:600">${esc(groupName)}</span><span style="font-size:12px;color:var(--text-secondary);margin-left:auto">${totalH?totalH+'h planned':gTasks.length+' task'+(gTasks.length>1?'s':'')}</span></div>`;
    html+=gTasks.map(t=>`<div class="today-task" onclick="editTask(${t.id})" style="cursor:pointer">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px">${esc(t.title)}</div>
        <div style="font-size:11px;color:var(--text-secondary)">${t.client_code?'['+esc(t.client_code)+'] ':''}${esc(t.client_name)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        ${t.task_band?`<span class="band-badge ${bandClass(t.task_band)}">${bandLabel(t.task_band)}</span>`:''}
        <span style="font-size:12px;min-width:40px">${t.estimated_hours?t.estimated_hours+'h':''}</span>
        <select class="quick-status status-${t.task_status}" onchange="event.stopPropagation();quickStatusChange(${t.id},this.value).then(()=>loadTodayView())" onclick="event.stopPropagation()">
          ${statusOptions(t.task_status)}
        </select>
      </div>
    </div>`).join('');
    html+='</div>';
  }
  html += `<form class="today-quick-add" onsubmit="todayQuickAdd(event);return false;">
    <input type="text" id="todayQuickTitle" placeholder="Quick add task for this day..." required>
    <select id="todayQuickClient" required style="min-width:160px">
      <option value="">Client...</option>
      ${clients.map(c => `<option value="${c.id}">${esc(c.code || c.name.substring(0,3))} — ${esc(c.name)}</option>`).join('')}
    </select>
    <button type="submit" class="btn btn-primary btn-sm">+ Add</button>
  </form>`;

  ct.innerHTML=html;
}
document.getElementById('todayDate').addEventListener('change',loadTodayView);
document.getElementById('todayPerson').addEventListener('change',loadTodayView);

// ─── Calendar View ──────────────────────────────────────
function calendarPrev(){calendarDate.setMonth(calendarDate.getMonth()-1);loadCalendarView();}
function calendarNext(){calendarDate.setMonth(calendarDate.getMonth()+1);loadCalendarView();}

async function loadCalendarView(){
  const y=calendarDate.getFullYear(),m=calendarDate.getMonth();
  document.getElementById('calendarTitle').textContent=calendarDate.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  const firstDay=new Date(y,m,1);
  const lastDay=new Date(y,m+1,0);
  const startDow=(firstDay.getDay()+6)%7;
  const startDate=new Date(firstDay);startDate.setDate(startDate.getDate()-startDow);
  const endDate=new Date(lastDay);const endDow=(lastDay.getDay()+6)%7;endDate.setDate(endDate.getDate()+(6-endDow));
  const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const person=document.getElementById('calendarPerson').value;
  const params=new URLSearchParams({start:fmt(startDate),end:fmt(endDate)});
  if(person)params.set('assignee',person);
  const tasks=await api(`/api/tasks/calendar?${params}`);
  const byDate={};
  const todayStr=localDateStr(new Date());
  for(const t of tasks){
    const displayDate = t.planned_date || t.deadline;
    if(displayDate){if(!byDate[displayDate])byDate[displayDate]=[];byDate[displayDate].push({...t,dateType:t.planned_date?'planned':'deadline'});}
  }
  let html='';
  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(d=>{html+=`<div class="cal-header">${d}</div>`;});
  const cur=new Date(startDate);
  while(cur<=endDate){
    const ds=fmt(cur);
    const isOther=cur.getMonth()!==m;
    const isToday=ds===todayStr;
    const dayTasks=byDate[ds]||[];
    html+=`<div class="cal-day ${isOther?'other-month':''} ${isToday?'today':''}">
      <div class="cal-day-number">${cur.getDate()}</div>
      ${dayTasks.slice(0,3).map(t=>{
        const isOverdue=t.dateType==='deadline'&&getDeadlineClass(t.deadline,t.progress)==='overdue';
        return`<div class="cal-task ${isOverdue?'overdue':t.dateType}" onclick="editTask(${t.id})" title="${esc(t.title)} (${esc(t.client_name)})">
          <div class="cal-task-client">${t.client_logo?`<img src="${esc(t.client_logo)}" style="width:14px;height:14px;border-radius:50%;object-fit:cover">`:''}${esc(t.client_code||'')}</div>
          <span class="cal-task-title">${esc(t.title)}</span>
        </div>`;
      }).join('')}
      ${dayTasks.length>3?`<div style="font-size:10px;color:var(--text-secondary);padding:1px 4px">+${dayTasks.length-3} more</div>`:''}
    </div>`;
    cur.setDate(cur.getDate()+1);
  }
  document.getElementById('calendarGrid').innerHTML=html;
}
document.getElementById('calendarPerson').addEventListener('change',loadCalendarView);

// ─── User Management ───────────────────────────────────
document.getElementById('manageUsersBtn').addEventListener('click', () => {
  if (currentUser?.role !== 'owner') { alert('Only the owner can manage users.'); return; }
  renderUsersList();
  openModal('usersModal');
});

async function renderUsersList() {
  const users = await api('/api/users');
  const ct = document.getElementById('usersList');
  ct.innerHTML = users.map(u => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="position:relative">
          ${userAvatar(u, 44)}
          <label style="position:absolute;bottom:-2px;right:-2px;width:20px;height:20px;border-radius:50%;background:var(--bg-glass);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:10px" title="Upload photo">
            &#128247;
            <input type="file" accept="image/*" style="display:none" onchange="uploadUserAvatar(${u.id}, this)">
          </label>
        </div>
        <div>
          <div style="font-weight:600;font-size:14px">${esc(u.display_name)}</div>
          <div style="font-size:12px;color:var(--text-secondary)">${esc(u.email)}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <select onchange="updateUserRole(${u.id}, this.value)" style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:6px 12px;font-size:12px;color:var(--text);cursor:pointer">
          <option value="owner" ${u.role==='owner'?'selected':''}>Owner</option>
          <option value="editor" ${u.role==='editor'?'selected':''}>Editor</option>
          <option value="viewer" ${u.role==='viewer'?'selected':''}>Viewer</option>
        </select>
        <button class="btn btn-ghost btn-sm" onclick="changeUserPassword(${u.id}, '${esc(u.display_name)}')" title="Change Password">&#128274;</button>
        ${u.id !== currentUser.id ? `<button class="btn-icon" onclick="deleteUser(${u.id}, '${esc(u.display_name)}')" style="color:var(--danger)" title="Delete">&#128465;</button>` : ''}
      </div>
    </div>
  `).join('') + `
    <div style="padding-top:20px">
      <button class="btn btn-primary btn-sm" onclick="document.getElementById('addUserSection').style.display='block'">+ Add User</button>
    </div>`;
}

async function uploadUserAvatar(userId, input) {
  if (!input.files.length) return;
  const file = input.files[0];
  input.value = '';
  openCropModal(file, 'Crop Avatar', 1, async (blob) => {
    const fd = new FormData();
    fd.append('avatar', blob, 'avatar.jpg');
    await fetch(`/api/users/${userId}/avatar`, { method: 'POST', body: fd });
    await renderUsersList();
    if (userId === currentUser.id) await loadCurrentUser();
  });
}

async function updateUserRole(userId, newRole) {
  await api(`/api/users/${userId}`, { method: 'PUT', body: { role: newRole } });
}

async function changeUserPassword(userId, name) {
  const pw = prompt(`New password for ${name}:`);
  if (!pw) return;
  if (pw.length < 8) { alert('Password must be at least 8 characters with uppercase, lowercase, and a number'); return; }
  const body = { password: pw };
  // Changing your own password requires re-entering the current one.
  if (currentUser && userId === currentUser.id) {
    const cur = prompt('Confirm your CURRENT password:');
    if (!cur) return;
    body.current_password = cur;
  }
  try {
    await api(`/api/users/${userId}/password`, { method: 'PUT', body });
    alert('Password updated');
  } catch (e) { alert(e.message || 'Password change failed'); }
}

async function deleteUser(userId, name) {
  if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
  await api(`/api/users/${userId}`, { method: 'DELETE' });
  await renderUsersList();
}

document.getElementById('addUserForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    display_name: document.getElementById('newUserName').value,
    username: document.getElementById('newUserUsername').value,
    email: document.getElementById('newUserEmail').value,
    password: document.getElementById('newUserPassword').value,
    role: document.getElementById('newUserRole').value
  };
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (res.ok) {
    document.getElementById('addUserSection').style.display = 'none';
    document.getElementById('addUserForm').reset();
    await renderUsersList();
    await loadTeam();
  } else {
    const err = await res.json();
    alert(err.error || 'Failed to create user');
  }
});

// ─── Backup Management ────────────────────────────────
document.getElementById('manageBackupsBtn').addEventListener('click', () => {
  if (currentUser?.role !== 'owner') return;
  loadBackupsList();
  openModal('backupsModal');
});

async function loadBackupsList() {
  const backups = await api('/api/backups');
  const ct = document.getElementById('backupsList');
  if (!backups.length) { ct.innerHTML = '<p style="color:var(--text-secondary)">No backups found.</p>'; return; }
  ct.innerHTML = backups.map(b => {
    const size = b.size ? (b.size / 1024 / 1024).toFixed(1) + ' MB' : '?';
    const date = b.modified ? new Date(b.modified).toLocaleString() : '?';
    const badge = b.type === 'pre-migration' ? '<span style="background:var(--warning);color:#000;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700">PRE-MIGRATION</span>' : '';
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);gap:10px">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.file)} ${badge}</div>
        <div style="font-size:11px;color:var(--text-secondary)">${date} &middot; ${size} &middot; ${b.tasks ?? '?'} tasks</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-ghost btn-sm" onclick="downloadBackup('${jsSafe(b.file)}')" title="Download">&#11015;</button>
        <button class="btn btn-ghost btn-sm" onclick="restoreBackup('${jsSafe(b.file)}')" title="Restore" style="color:var(--warning)">&#8634;</button>
      </div>
    </div>`;
  }).join('');
}

function downloadBackup(file) {
  window.open(`/api/backups/download/${encodeURIComponent(file)}`, '_blank');
}

function exportExcel() {
  window.open('/api/export/excel', '_blank');
}

async function restoreBackup(file) {
  if (!confirm(`RESTORE from backup "${file}"?\n\nThis will REPLACE all current data with the backup. This cannot be undone.\n\nAre you sure?`)) return;
  if (!confirm('FINAL WARNING: All current tasks and comments will be overwritten. Continue?')) return;
  const res = await api('/api/backups/restore', { method: 'POST', body: { file } });
  if (res.success) {
    alert('Backup restored successfully. Reloading...');
    location.reload();
  } else {
    alert('Restore failed: ' + (res.error || 'Unknown error'));
  }
}

async function triggerBackup() {
  await api('/api/backups', { method: 'POST' });
  alert('Backup started. It will appear in the list shortly.');
  setTimeout(loadBackupsList, 2000);
}

// ─── Image Cropper ─────────────────────────────────────
let _cropCallback = null;
window._cropper = null;

function openCropModal(file, title, aspectRatio, callback) {
  _cropCallback = callback;
  document.getElementById('cropModalTitle').textContent = title || 'Crop Image';
  const img = document.getElementById('cropImage');
  const reader = new FileReader();
  reader.onload = (e) => {
    img.src = e.target.result;
    document.getElementById('cropModalBackdrop').style.display = 'flex';
    document.getElementById('cropZoom').value = 1;
    // Small delay to let the image render before initializing cropper
    setTimeout(() => {
      if (window._cropper) window._cropper.destroy();
      window._cropper = new Cropper(img, {
        aspectRatio: aspectRatio || 1,
        viewMode: 1,
        autoCropArea: 0.85,
        responsive: true,
        guides: true,
        center: true,
        background: false,
        dragMode: 'move',
        zoom: (e) => {
          document.getElementById('cropZoom').value = e.detail.ratio;
        }
      });
    }, 100);
  };
  reader.readAsDataURL(file);
}

function closeCropModal() {
  document.getElementById('cropModalBackdrop').style.display = 'none';
  if (window._cropper) { window._cropper.destroy(); window._cropper = null; }
  _cropCallback = null;
}

function applyCrop() {
  if (!window._cropper || !_cropCallback) return;
  const canvas = window._cropper.getCroppedCanvas({ width: 400, height: 400, imageSmoothingQuality: 'high' });
  canvas.toBlob((blob) => {
    if (blob && _cropCallback) _cropCallback(blob);
    closeCropModal();
  }, 'image/jpeg', 0.9);
}

// Intercept client logo file input
document.getElementById('clientLogo').addEventListener('change', function(e) {
  if (!this.files.length) return;
  const file = this.files[0];
  openCropModal(file, 'Crop Client Logo', 1, (blob) => {
    // Store the cropped blob for form submission
    window._croppedLogo = blob;
  });
  // Clear the input so the raw file isn't used
  this.value = '';
});

// ─── Celebration ───────────────────────────────────────
const celebMessages = [
  'Done!', 'Nailed it!', 'Smashed it!', 'Another one down!',
  'Boom!', 'Nice one!', 'Crushed it!', 'On fire!',
];
function celebrate() {
  const overlay = document.getElementById('celebrationOverlay');
  const colors = ['#3eaf84','#4fc494','#fbbf24','#60a5fa','#a855f7','#f87171','#2dd4bf','#fb923c'];
  // Confetti
  for (let i = 0; i < 30; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = (15 + Math.random() * 70) + '%';
    c.style.top = (5 + Math.random() * 20) + '%';
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDelay = (Math.random() * 0.4) + 's';
    c.style.animationDuration = (1 + Math.random() * 1) + 's';
    c.style.width = (6 + Math.random() * 6) + 'px';
    c.style.height = (6 + Math.random() * 6) + 'px';
    overlay.appendChild(c);
  }
  // Text
  const msg = celebMessages[Math.floor(Math.random() * celebMessages.length)];
  const txt = document.createElement('div');
  txt.className = 'celebration-text';
  txt.textContent = msg;
  overlay.appendChild(txt);
  setTimeout(() => { overlay.innerHTML = ''; }, 1800);
}

// ─── Focus Mode ────────────────────────────────────────
async function loadFocusView() {
  const myName = currentUser?.display_name || '';
  const today = localDateStr(new Date());
  // Get all tasks across clients
  const allTasks = [];
  for (const c of clients) {
    for (const t of c.tasks) {
      allTasks.push({ ...t, client_name: c.name, client_code: c.code });
    }
  }
  // Include tasks where user is primary OR secondary assignee (sign-off tasks)
  const mine = myName ? allTasks.filter(t => t.assignee === myName || t.secondary_assignee === myName) : allTasks;

  const now = mine.filter(t => t.task_status === 'in-progress');
  const blocked = mine.filter(t => t.task_status === 'waiting-on-client' || t.task_status === 'waiting-on-me');
  // Sign-off tasks (where I'm secondary and the task is waiting on me)
  const signOff = myName ? allTasks.filter(t => t.secondary_assignee === myName && t.task_status === 'waiting-on-me' && t.assignee !== myName) : [];
  const next = mine.filter(t => t.task_status === 'inbox' || t.task_status === 'scheduled')
    .sort((a, b) => (BAND_RANK[a.task_band] ?? 2) - (BAND_RANK[b.task_band] ?? 2)).slice(0, 8);

  function focusCard(t, isSignOff) {
    const fromLabel = isSignOff ? `<span style="font-size:11px;background:var(--warning);color:#000;padding:1px 6px;border-radius:4px;font-weight:600">Sign-off from ${esc(t.assignee)}</span>` : '';
    return `<div class="focus-card" onclick="editTask(${t.id})" ${isSignOff ? 'style="border-left:3px solid var(--warning)"' : ''}>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px">
          ${t.task_band?`<span class="band-badge ${bandClass(t.task_band)}">${bandLabel(t.task_band)}</span>`:''}
          <span style="font-weight:600;font-size:14px">${esc(t.title)}</span>
          ${fromLabel}
        </div>
        <div class="focus-meta">${esc(t.client_code || '')} ${esc(t.client_name)}${t.deadline ? ' &middot; Due ' + fmtDateShort(t.deadline) : ''}${t.secondary_assignee && !isSignOff ? ' &middot; +' + esc(t.secondary_assignee) : ''}</div>
      </div>
      <div class="focus-actions">
        <select class="quick-status status-${t.task_status}" onchange="quickStatusChange(${t.id},this.value).then(()=>loadFocusView())" onclick="event.stopPropagation()">
          ${statusOptions(t.task_status)}
        </select>
        <button class="btn-icon" onclick="event.stopPropagation();toggleInlineComment(${t.id})" title="Quick comment">&#128172;</button>
      </div>
    </div><div id="focusComment${t.id}" style="display:none" class="inline-edit-row">
      <input type="text" placeholder="Quick note..." onkeydown="if(event.key==='Enter'){addQuickComment(${t.id},this);event.preventDefault();}">
      <button class="btn btn-primary btn-sm" onclick="addQuickComment(${t.id},this.previousElementSibling)">Post</button>
    </div>`;
  }

  document.getElementById('focusNow').innerHTML = now.length ? now.map(t => focusCard(t, false)).join('') : '<div style="color:var(--text-muted);font-size:13px;padding:8px">Nothing in progress. Pick something from "Up Next"!</div>';
  document.getElementById('focusNext').innerHTML = next.length ? next.map(t => focusCard(t, false)).join('') : '<div style="color:var(--text-muted);font-size:13px;padding:8px">Queue is empty.</div>';
  document.getElementById('focusBlocked').innerHTML = blocked.length ? blocked.map(t => focusCard(t, false)).join('') : '<div style="color:var(--text-muted);font-size:13px;padding:8px">Nothing blocked. Smooth sailing!</div>';
  // Sign-off section — only shown if there are tasks awaiting manager sign-off
  const signOffEl = document.getElementById('focusSignOff');
  const signOffSection = document.getElementById('focusSignOffSection');
  if (signOff.length) {
    if (signOffSection) signOffSection.style.display = '';
    if (signOffEl) signOffEl.innerHTML = signOff.map(t => focusCard(t, true)).join('');
  } else {
    if (signOffSection) signOffSection.style.display = 'none';
  }
}

function toggleInlineComment(tid) {
  const el = document.getElementById('focusComment' + tid);
  if (el) { el.style.display = el.style.display === 'none' ? 'flex' : 'none'; if (el.style.display === 'flex') el.querySelector('input').focus(); }
}

async function addQuickComment(tid, input) {
  const content = input.value.trim();
  if (!content) return;
  await api(`/api/tasks/${tid}/comments`, { method: 'POST', body: { content } });
  input.value = '';
  const el = input.closest('.inline-edit-row');
  if (el) el.style.display = 'none';
}

// ─── Inline Quick Updates ──────────────────────────────
function showInlineEdit(taskId) {
  const existing = document.getElementById('inlineEdit' + taskId);
  if (existing) { existing.remove(); return; }
  const row = document.querySelector(`[data-task-id="${taskId}"]`);
  if (!row) return;
  const t = findTaskById(taskId);
  if (!t) return;
  const div = document.createElement('div');
  div.id = 'inlineEdit' + taskId;
  div.className = 'inline-edit-row';
  div.innerHTML = `
    <input type="text" placeholder="Quick note..." onkeydown="if(event.key==='Enter'){submitInlineNote(${taskId},this);event.preventDefault();}">
    <input type="date" value="${esc(t.planned_date || '')}" onchange="inlineDateChange(${taskId},this.value)" style="width:130px" title="Planned date">
    <select onchange="inlineAssigneeChange(${taskId},this.value)" style="width:110px">
      <option value="">Unassigned</option>
      ${t.assignee && !assigneePool.includes(t.assignee) ? `<option value="${esc(t.assignee)}" selected>${esc(t.assignee)}</option>` : ''}
      ${assigneePool.map(n => `<option value="${esc(n)}" ${n === t.assignee ? 'selected' : ''}>${esc(n)}</option>`).join('')}
    </select>
    <button class="btn btn-ghost btn-sm" onclick="quickStatusChange(${taskId},'stuck')" title="Mark blocked" style="color:var(--danger)">&#9888;</button>
    <button class="btn btn-ghost btn-sm" onclick="this.closest('.inline-edit-row').remove()">&#10005;</button>
  `;
  div.onclick = (e) => e.stopPropagation();
  row.after(div);
  div.querySelector('input').focus();
}

async function submitInlineNote(taskId, input) {
  const content = input.value.trim();
  if (!content) return;
  await api(`/api/tasks/${taskId}/comments`, { method: 'POST', body: { content } });
  input.value = '';
  input.placeholder = 'Posted!';
  setTimeout(() => { const el = document.getElementById('inlineEdit' + taskId); if (el) el.remove(); }, 800);
}

async function inlineDateChange(taskId, date) {
  await api(`/api/tasks/${taskId}`, { method: 'PUT', body: { planned_date: date } });
  await loadClients();
}

async function inlineAssigneeChange(taskId, assignee) {
  await api(`/api/tasks/${taskId}`, { method: 'PUT', body: { assignee } });
  await loadClients();
}

// ─── Checklists ────────────────────────────────────────
let currentChecklist = [];

async function loadChecklist(taskId) {
  if (!taskId) { currentChecklist = []; renderChecklist(); return; }
  try { currentChecklist = await api(`/api/tasks/${taskId}/checklist`); } catch { currentChecklist = []; }
  renderChecklist();
}

function renderChecklist() {
  const ct = document.getElementById('taskChecklist');
  if (!ct) return;
  const total = currentChecklist.length;
  const done = currentChecklist.filter(i => i.checked).length;
  ct.innerHTML = (total ? `<div class="checklist-progress"><div class="checklist-progress-fill" style="width:${Math.round(done / total * 100)}%"></div></div>` : '') +
    currentChecklist.map(item => `
      <div class="checklist-item ${item.checked ? 'checked' : ''}">
        <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="toggleChecklistItem(${item.id}, ${item.task_id}, this.checked)">
        <span class="checklist-label">${esc(item.label)}</span>
        <button class="checklist-delete" onclick="deleteChecklistItem(${item.id}, ${item.task_id})">&times;</button>
      </div>
    `).join('');
}

async function addChecklistItem() {
  const input = document.getElementById('checklistNewItem');
  const label = input.value.trim();
  if (!label) return;
  const taskId = document.getElementById('taskId').value;
  if (!taskId) return;
  await api(`/api/tasks/${taskId}/checklist`, { method: 'POST', body: { label } });
  input.value = '';
  await loadChecklist(taskId);
}

async function toggleChecklistItem(itemId, taskId, checked) {
  await api(`/api/tasks/${taskId}/checklist/${itemId}`, { method: 'PUT', body: { checked } });
  await loadChecklist(taskId);
}

async function deleteChecklistItem(itemId, taskId) {
  await api(`/api/tasks/${taskId}/checklist/${itemId}`, { method: 'DELETE' });
  await loadChecklist(taskId);
}

// Enter key on checklist input
document.getElementById('checklistNewItem')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); }
});

// ─── Pins ──────────────────────────────────────────────
let userPins = [];

async function loadPins() {
  try { userPins = await api('/api/pins'); } catch { userPins = []; }
  renderPinnedDashboard();
}

function isPinned(type, id) {
  return userPins.some(p => p.entity_type === type && p.entity_id === id);
}

async function togglePin(type, id, event) {
  if (event) event.stopPropagation();
  if (isPinned(type, id)) {
    await api(`/api/pins/${type}/${id}`, { method: 'DELETE' });
  } else {
    await api('/api/pins', { method: 'POST', body: { entity_type: type, entity_id: id } });
  }
  await loadPins();
}

function renderPinnedDashboard() {
  const ct = document.getElementById('pinnedDashboard');
  if (!ct || !userPins.length) { if (ct) ct.style.display = 'none'; return; }

  const cards = userPins.map(pin => {
    let label = '', icon = '', onclick = '';
    if (pin.entity_type === 'client') {
      const c = clients.find(x => x.id === pin.entity_id);
      if (!c) return '';
      label = c.name;
      icon = c.logo_url ? `<img src="${esc(c.logo_url)}" style="width:18px;height:18px;border-radius:4px;object-fit:cover">` : '';
      onclick = `document.getElementById('clientFilter').value='${c.id}';renderClients();`;
    } else if (pin.entity_type === 'task') {
      const t = findTaskById(pin.entity_id);
      if (!t) return '';
      label = t.title;
      onclick = `editTask(${t.id})`;
    }
    if (!label) return '';
    return `<div class="pinned-card" onclick="${onclick}">
      ${icon}<span>${esc(label)}</span>
      <span class="pinned-type">${pin.entity_type}</span>
      <button class="pin-btn pinned" onclick="event.stopPropagation();togglePin('${pin.entity_type}',${pin.entity_id})" title="Unpin">&#9733;</button>
    </div>`;
  }).filter(Boolean);

  if (!cards.length) { ct.style.display = 'none'; return; }
  ct.style.display = 'block';
  ct.innerHTML = `<div class="pinned-grid">${cards.join('')}</div>`;
}

// ─── Client Timeline ───────────────────────────────────
async function showClientTimeline(clientId, clientName) {
  document.getElementById('timelineModalTitle').textContent = 'Timeline \u2014 ' + clientName;
  const logs = await api(`/api/clients/${clientId}/timeline?limit=50`);
  const ct = document.getElementById('timelineContent');
  if (!logs.length) { ct.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">No activity yet</div>'; openModal('timelineModal'); return; }

  const actionColors = { created: 'var(--success)', completed: 'var(--green)', updated: 'var(--blue)', archived: 'var(--warning)', restored: 'var(--teal)', commented: 'var(--purple)', deleted: 'var(--danger)' };
  const actionIcons = { created: '+', completed: '\u2713', updated: '\u270E', archived: '\u25BC', restored: '\u25B2', commented: '\u270D', deleted: '\u2717' };

  // Group by date
  const groups = {};
  for (const l of logs) {
    const d = l.created_at ? l.created_at.split(' ')[0] || l.created_at.split('T')[0] : 'Unknown';
    if (!groups[d]) groups[d] = [];
    groups[d].push(l);
  }

  let html = '';
  for (const [date, items] of Object.entries(groups)) {
    html += `<div class="timeline-group-date">${fmtDate(date)}</div>`;
    for (const l of items) {
      const color = actionColors[l.action] || 'var(--text-muted)';
      html += `<div class="timeline-item">
        <div class="timeline-dot" style="background:${color}"></div>
        <div class="timeline-content">
          <div class="timeline-action">${esc(l.author)} ${esc(l.action)} ${esc(l.entity_type)}${l.entity_name ? ': ' + esc(l.entity_name) : ''}</div>
          ${l.details ? `<div class="timeline-detail">${esc(l.details)}</div>` : ''}
          <div class="timeline-time">${timeAgo(l.created_at)}</div>
        </div>
      </div>`;
    }
  }
  ct.innerHTML = html;
  openModal('timelineModal');
}

// ─── Quick Add from Today View ─────────────────────────
async function todayQuickAdd(e) {
  e.preventDefault();
  const title = document.getElementById('todayQuickTitle')?.value.trim();
  const clientId = document.getElementById('todayQuickClient')?.value;
  if (!title || !clientId) return;
  const date = document.getElementById('todayDate').value || localDateStr(new Date());
  const person = document.getElementById('todayPerson').value;
  await api('/api/tasks', { method: 'POST', body: { client_id: +clientId, title, planned_date: date, assignee: person || '' } });
  document.getElementById('todayQuickTitle').value = '';
  await loadClients();
  await loadTodayView();
}

// ─── Pin Star Tasks ────────────────────────────────────
async function toggleTaskPin(taskId, event) {
  if (event) event.stopPropagation();
  await api(`/api/tasks/${taskId}/pin`, { method: 'PUT' });
  await loadClients();
}

// ─── Init ───────────────────────────────────────────────
(async function(){
  try {
    applyViewVisibility();            // hide Tasks-view chrome on the default Dashboard landing
    await loadCurrentUser();
    await loadServerPrefs();          // server-synced format/prefs — same on every device
    await loadTeam();
    await loadClients();              // populates clients + renders the Control Board (currentView==='dashboard')
    await loadPins();
    document.getElementById('todayDate').value=localDateStr(new Date());
    // Interruption insurance: reopen where you left off, not back at square one.
    try {
      const savedView = appPrefs.nbm_view || localStorage.getItem('nbm_view');
      if (savedView && savedView !== 'dashboard' && document.querySelector(`[data-view="${savedView}"]`)) switchView(savedView);
    } catch {}
  } catch(e) {
    console.error('Init error:', e);
    document.getElementById('clientList').innerHTML='<div class="empty-state"><p>Error loading data. Please refresh.</p></div>';
  }
})();

// ─── Gmail Integration ───────────────────────────────────
let gmailConnected = false;
let gmailServerConfigured = false;
let gmailNextPageToken = null;
let gmailLabelsLoaded = false;
let gmailCurrentThread = null;

async function checkGmailStatus() {
  try {
    const s = await api('/api/gmail/status');
    gmailServerConfigured = !!s.configured;
    if (s.configured) {
      document.getElementById('emailNavTab').style.display = '';
      gmailConnected = s.connected;
      if (s.connected && s.email) {
        const el = document.getElementById('emailConnectedAs');
        if (el) el.textContent = s.email;
      }
      if (window.location.hash === '#email') {
        document.querySelector('[data-view="email"]').click();
      }
    }
    // The dashboard first paints before this status arrives — re-evaluate the email widget.
    if (currentView === 'dashboard') loadDashEmails();
  } catch {}
}

function loadEmailView() {
  if (!gmailConnected) {
    document.getElementById('emailList').style.display = 'none';
    document.getElementById('emailThreadView').style.display = 'none';
    document.getElementById('emailLoadMore').style.display = 'none';
    document.getElementById('emailConnect').style.display = '';
    return;
  }
  document.getElementById('emailConnect').style.display = 'none';
  document.getElementById('emailList').style.display = '';
  document.getElementById('emailThreadView').style.display = 'none';
  if (!gmailLabelsLoaded) loadGmailLabels();
  loadGmailInbox();
}

async function loadGmailLabels() {
  try {
    const data = await api('/api/gmail/labels');
    const select = document.getElementById('emailLabelFilter');
    select.innerHTML = '';
    for (const l of data.labels) {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = l.name;
      select.appendChild(opt);
    }
    gmailLabelsLoaded = true;
  } catch {}
}

async function loadGmailInbox(more) {
  const list = document.getElementById('emailList');
  const label = document.getElementById('emailLabelFilter').value || 'INBOX';
  if (!more) { list.innerHTML = '<div class="email-loading">Loading...</div>'; gmailNextPageToken = null; }

  try {
    const params = new URLSearchParams({ label });
    if (gmailNextPageToken && more) params.set('pageToken', gmailNextPageToken);
    const data = await api(`/api/gmail/inbox?${params}`);
    if (!more) list.innerHTML = '';

    if (!data.messages?.length && !more) {
      list.innerHTML = '<div class="email-empty">No emails found</div>';
      document.getElementById('emailLoadMore').style.display = 'none';
      return;
    }

    for (const m of data.messages) {
      list.insertAdjacentHTML('beforeend', renderEmailRow(m));
    }

    gmailNextPageToken = data.nextPageToken;
    document.getElementById('emailLoadMore').style.display = data.nextPageToken ? '' : 'none';
  } catch (err) {
    if (err.message?.includes('not connected') || err.message?.includes('expired')) {
      gmailConnected = false;
      loadEmailView();
      return;
    }
    list.innerHTML = `<div class="email-empty" style="color:var(--error)">${esc(err.message || 'Failed to load')}</div>`;
  }
}

async function searchGmail() {
  const q = document.getElementById('emailSearchInput').value.trim();
  if (!q) { loadGmailInbox(); return; }
  const list = document.getElementById('emailList');
  list.innerHTML = '<div class="email-loading">Searching...</div>';

  try {
    const data = await api(`/api/gmail/inbox?q=${encodeURIComponent(q)}`);
    list.innerHTML = '';
    if (!data.messages?.length) {
      list.innerHTML = '<div class="email-empty">No results</div>';
      return;
    }
    for (const m of data.messages) {
      list.insertAdjacentHTML('beforeend', renderEmailRow(m));
    }
    document.getElementById('emailLoadMore').style.display = data.nextPageToken ? '' : 'none';
    gmailNextPageToken = data.nextPageToken;
  } catch (err) {
    list.innerHTML = `<div class="email-empty" style="color:var(--error)">${esc(err.message)}</div>`;
  }
}

async function disconnectGmail() {
  if (!confirm('Disconnect your Gmail from the Console?')) return;
  try {
    await api('/api/gmail/disconnect', { method: 'POST' });
    gmailConnected = false;
    gmailLabelsLoaded = false;
    loadEmailView();
  } catch {}
}

function renderEmailRow(m) {
  const fromName = m.from.replace(/<[^>]+>/g, '').trim() || m.from;
  const d = new Date(m.date);
  const isToday = d.toDateString() === new Date().toDateString();
  const dateStr = isToday ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const unreadClass = m.unread ? 'email-row-unread' : '';

  return `<div class="email-row ${unreadClass}" onclick="openEmailThread('${jsSafe(m.threadId)}')">
    <div class="email-row-from">${esc(fromName)}</div>
    <div class="email-row-content">
      <span class="email-row-subject">${esc(m.subject || '(no subject)')}</span>
      <span class="email-row-snippet"> — ${esc(m.snippet)}</span>
    </div>
    <div class="email-row-date">${dateStr}</div>
  </div>`;
}

async function openEmailThread(threadId) {
  document.getElementById('emailList').style.display = 'none';
  document.getElementById('emailLoadMore').style.display = 'none';
  document.getElementById('emailThreadView').style.display = '';
  const content = document.getElementById('emailThreadContent');
  content.innerHTML = '<div class="email-loading">Loading thread...</div>';
  document.getElementById('emailReplyText').value = '';

  try {
    const data = await api(`/api/gmail/thread/${threadId}`);
    gmailCurrentThread = { threadId, messages: data.messages };
    content.innerHTML = '';
    for (const m of data.messages) {
      const fromName = m.from.replace(/<[^>]+>/g, '').trim() || m.from;
      const d = new Date(m.date);
      const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const isHtml = m.mimeType === 'text/html' || m.body.includes('<div') || m.body.includes('<p');
      const bodyHtml = isHtml
        ? `<iframe class="email-body-frame" srcdoc="${esc(m.body).replace(/"/g, '&quot;')}" sandbox="allow-same-origin"></iframe>`
        : `<pre class="email-body-text">${esc(m.body)}</pre>`;

      content.insertAdjacentHTML('beforeend', `<div class="email-thread-msg">
        <div class="email-thread-header">
          <strong>${esc(fromName)}</strong>
          <span class="email-thread-date">${dateStr}</span>
        </div>
        <div class="email-thread-subject">${esc(m.subject)}</div>
        <div class="email-thread-body">${bodyHtml}</div>
      </div>`);
    }
  } catch (err) {
    content.innerHTML = `<div class="email-empty" style="color:var(--error)">${esc(err.message)}</div>`;
  }
}

function closeEmailThread() {
  document.getElementById('emailThreadView').style.display = 'none';
  document.getElementById('emailList').style.display = '';
  document.getElementById('emailLoadMore').style.display = gmailNextPageToken ? '' : 'none';
  gmailCurrentThread = null;
}

async function sendReply() {
  if (!gmailCurrentThread?.messages?.length) return;
  const body = document.getElementById('emailReplyText').value.trim();
  if (!body) return;
  const last = gmailCurrentThread.messages[gmailCurrentThread.messages.length - 1];
  const replyTo = last.from.match(/<([^>]+)>/)?.[1] || last.from;

  try {
    await api('/api/gmail/reply', { method: 'POST', body: {
      threadId: gmailCurrentThread.threadId,
      messageId: last.id,
      to: replyTo,
      subject: last.subject,
      body,
    }});
    document.getElementById('emailReplyText').value = '';
    openEmailThread(gmailCurrentThread.threadId);
  } catch (err) {
    alert('Failed to send: ' + (err.message || 'Unknown error'));
  }
}

function openComposeModal() {
  document.getElementById('composeTo').value = '';
  document.getElementById('composeSubject').value = '';
  document.getElementById('composeBody').value = '';
  document.getElementById('composeModal').style.display = '';
  document.getElementById('composeTo').focus();
}

function closeComposeModal() {
  document.getElementById('composeModal').style.display = 'none';
}

async function sendComposedEmail() {
  const to = document.getElementById('composeTo').value.trim();
  const subject = document.getElementById('composeSubject').value.trim();
  const body = document.getElementById('composeBody').value.trim();
  if (!to) return;

  const btn = document.getElementById('composeSendBtn');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    await api('/api/gmail/send', { method: 'POST', body: { to, subject, body } });
    closeComposeModal();
  } catch (err) {
    alert('Failed to send: ' + (err.message || 'Unknown error'));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send';
  }
}

setTimeout(() => { checkGmailStatus(); }, 600);

// ─── AI Assistant ───────────────────────────────────────
let aiHistory = [];      // Full message list sent to API (role + content arrays)
let aiAvailable = false;
let aiBusy = false;
let aiPendingImage = null;   // { file, dataUrl }
let aiRecording = false;
let aiMediaRecorder = null;
let aiAudioChunks = [];
let aiSpeechRecognition = null;

async function checkAIAvailable() {
  try {
    const s = await api('/api/ai/status');
    aiAvailable = !!s.available;
    const btn = document.getElementById('aiLauncher');
    if (btn) btn.style.display = aiAvailable ? '' : 'none';
  } catch {}
}

function toggleAI() {
  const panel = document.getElementById('aiPanel');
  const launcher = document.getElementById('aiLauncher');
  if (panel.style.display === 'none') {
    panel.style.display = 'flex';
    launcher.style.display = 'none';
    if (!aiHistory.length) renderAIEmpty();
    setTimeout(() => document.getElementById('aiInput')?.focus(), 50);
  } else {
    panel.style.display = 'none';
    launcher.style.display = '';
  }
}

function renderAIEmpty() {
  const name = currentUser?.display_name?.split(' ')[0] || 'there';
  document.getElementById('aiMessages').innerHTML = `
    <div class="ai-empty">
      <span class="ai-empty-icon">&#128059;</span>
      Hi ${esc(name)} — I'm The Bear. I can create tasks, plan your week, find things, and update work on your behalf.
      <br><br>
      Try: <em>"Create a task for me to edit the reel for MHC by Friday, 3 hours"</em>
    </div>`;
}

function resetAIChat() {
  aiHistory = [];
  clearAIMedia();
  if (aiRecording) stopVoiceRecording();
  renderAIEmpty();
  document.getElementById('aiSuggestions').style.display = '';
}

function renderAIHistory() {
  const box = document.getElementById('aiMessages');
  box.innerHTML = '';
  for (const m of aiHistory) {
    if (m.role === 'user' && typeof m.content === 'string') {
      let html = '';
      if (m._media === 'image') html = '<div class="ai-media-tag">&#128247; Image attached</div>';
      else if (m._media === 'audio') html = '<div class="ai-media-tag">&#127908; Voice note</div>';
      box.insertAdjacentHTML('beforeend', `<div class="ai-msg ai-msg-user">${html}${esc(m.content)}</div>`);
    } else if (m.role === 'user' && Array.isArray(m.content)) {
      let html = '';
      for (const block of m.content) {
        if (block.type === 'image') html += '<div class="ai-media-tag">&#128247; Image attached</div>';
        else if (block.type === 'text' && block.text.startsWith('[Voice transcription]')) html += '<div class="ai-media-tag">&#127908; Voice note</div>';
        if (block.type === 'text') html += esc(block.text);
      }
      box.insertAdjacentHTML('beforeend', `<div class="ai-msg ai-msg-user">${html}</div>`);
    } else if (m.role === 'assistant' && Array.isArray(m.content)) {
      const texts = m.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      const tools = m.content.filter(b => b.type === 'tool_use');
      if (tools.length) {
        box.insertAdjacentHTML('beforeend', renderToolLogHTML(tools));
      }
      if (texts) {
        box.insertAdjacentHTML('beforeend', `<div class="ai-msg ai-msg-assistant">${formatMarkdownish(texts)}</div>`);
      }
    }
  }
  box.scrollTop = box.scrollHeight;
}

function renderToolLogHTML(toolUses) {
  const rows = toolUses.map(t => {
    const label = prettyToolLabel(t.name, t.input);
    return `<div class="ai-tool-row"><span class="ai-tool-name">&rarr;</span> ${esc(label)}</div>`;
  }).join('');
  return `<div class="ai-msg-tools">${rows}</div>`;
}

function prettyToolLabel(name, input) {
  switch (name) {
    case 'create_task': return `Creating task "${input.title || ''}"`;
    case 'update_task': return `Updating task #${input.task_id}`;
    case 'list_clients': return 'Looking up clients';
    case 'list_team_members': return 'Looking up team members';
    case 'search_tasks': return `Searching tasks: "${input.query}"`;
    case 'get_workload_summary': return 'Checking workload';
    case 'list_tasks_for_user': return `Listing tasks for ${input.assignee}`;
    default: return name;
  }
}

function formatMarkdownish(text) {
  // Minimal inline formatting: bold **x**, code `x`, preserve newlines via white-space:pre-wrap (already set)
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px;font-size:12px">$1</code>');
}

function sendAIPrompt(text) {
  const input = document.getElementById('aiInput');
  input.value = text;
  input.focus();
  // Only auto-send if the prompt doesn't end with "..."
  if (!text.endsWith('...') && !text.endsWith(': ')) sendAIMessage();
}

function handleAIImageSelect(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const reader = new FileReader();
  reader.onload = () => {
    aiPendingImage = { file, dataUrl: reader.result };
    showAIMediaPreview();
  };
  reader.readAsDataURL(file);
}

function showAIMediaPreview() {
  const preview = document.getElementById('aiMediaPreview');
  if (!aiPendingImage) { preview.style.display = 'none'; return; }
  preview.style.display = 'flex';
  preview.innerHTML = `<img src="${aiPendingImage.dataUrl}" class="ai-preview-thumb"><span class="ai-preview-name">${esc(aiPendingImage.file.name)}</span><button type="button" class="ai-preview-remove" onclick="clearAIMedia()">&times;</button>`;
}

function clearAIMedia() {
  aiPendingImage = null;
  document.getElementById('aiMediaPreview').style.display = 'none';
}

function toggleVoiceRecording() {
  if (aiRecording) { stopVoiceRecording(); return; }
  startVoiceRecording();
}

async function startVoiceRecording() {
  const micBtn = document.getElementById('aiMicBtn');

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    // Fallback: record audio blob without live transcription
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      aiAudioChunks = [];
      aiMediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' });
      aiMediaRecorder.ondataavailable = e => { if (e.data.size > 0) aiAudioChunks.push(e.data); };
      aiMediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(aiAudioChunks, { type: aiMediaRecorder.mimeType });
        finishVoiceRecording(null, blob);
      };
      aiMediaRecorder.start();
      aiRecording = true;
      micBtn.classList.add('ai-recording');
      micBtn.innerHTML = '&#9632;';
      micBtn.title = 'Stop recording';
    } catch (err) {
      alert('Microphone access denied. Please allow microphone access to use voice notes.');
    }
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    aiAudioChunks = [];
    aiMediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' });
    aiMediaRecorder.ondataavailable = e => { if (e.data.size > 0) aiAudioChunks.push(e.data); };
    aiMediaRecorder.onstop = () => { stream.getTracks().forEach(t => t.stop()); };
    aiMediaRecorder.start();
  } catch (err) {
    alert('Microphone access denied. Please allow microphone access to use voice notes.');
    return;
  }

  aiSpeechRecognition = new SpeechRecognition();
  aiSpeechRecognition.continuous = true;
  aiSpeechRecognition.interimResults = false;
  aiSpeechRecognition.lang = 'en-GB';
  let transcript = '';
  aiSpeechRecognition.onresult = e => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) transcript += e.results[i][0].transcript + ' ';
    }
  };
  aiSpeechRecognition.onerror = () => {};
  aiSpeechRecognition.start();

  aiRecording = true;
  micBtn.classList.add('ai-recording');
  micBtn.innerHTML = '&#9632;';
  micBtn.title = 'Stop recording';

  aiSpeechRecognition._getTranscript = () => transcript.trim();
}

function stopVoiceRecording() {
  const micBtn = document.getElementById('aiMicBtn');
  aiRecording = false;
  micBtn.classList.remove('ai-recording');
  micBtn.innerHTML = '&#127908;';
  micBtn.title = 'Voice note';

  let transcript = '';
  if (aiSpeechRecognition) {
    transcript = aiSpeechRecognition._getTranscript ? aiSpeechRecognition._getTranscript() : '';
    aiSpeechRecognition.stop();
    aiSpeechRecognition = null;
  }

  if (aiMediaRecorder && aiMediaRecorder.state !== 'inactive') {
    const rec = aiMediaRecorder;
    const origOnStop = rec.onstop;
    rec.onstop = () => {
      rec.stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(aiAudioChunks, { type: rec.mimeType });
      finishVoiceRecording(transcript, blob);
    };
    rec.stop();
  }
}

function finishVoiceRecording(transcript, audioBlob) {
  const input = document.getElementById('aiInput');
  if (transcript) {
    input.value = transcript;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    input.focus();
  } else {
    input.value = '[Voice note attached — see audio]';
    sendAIMediaMessage(audioBlob, 'audio', '');
  }
}

async function sendAIMessage() {
  if (aiBusy) return;
  const input = document.getElementById('aiInput');
  const text = input.value.trim();

  if (aiPendingImage) {
    const img = aiPendingImage;
    clearAIMedia();
    input.value = '';
    input.style.height = 'auto';
    sendAIMediaMessage(img.file, 'image', text);
    return;
  }

  if (!text) return;

  aiHistory.push({ role: 'user', content: text });
  input.value = '';
  input.style.height = 'auto';
  document.getElementById('aiSuggestions').style.display = 'none';
  renderAIHistory();
  showAIThinking(true);
  aiBusy = true;
  document.getElementById('aiSendBtn').disabled = true;

  try {
    const resp = await api('/api/ai/chat', { method: 'POST', body: { messages: aiHistory } });
    if (resp.assistant_content) {
      aiHistory.push({ role: 'assistant', content: resp.assistant_content });
    } else if (resp.reply) {
      aiHistory.push({ role: 'assistant', content: [{ type: 'text', text: resp.reply }] });
    }
    showAIThinking(false);
    renderAIHistory();
    const didMutate = (resp.tool_calls || []).some(tc => ['create_task', 'update_task'].includes(tc.tool));
    if (didMutate) {
      try { await loadClients(); await loadWorkloadSummary(); } catch {}
    }
  } catch (err) {
    showAIThinking(false);
    const box = document.getElementById('aiMessages');
    box.insertAdjacentHTML('beforeend', `<div class="ai-msg-error">${esc(err.message || 'Error')}</div>`);
    box.scrollTop = box.scrollHeight;
  } finally {
    aiBusy = false;
    document.getElementById('aiSendBtn').disabled = false;
    input.focus();
  }
}

async function sendAIMediaMessage(file, type, text) {
  if (aiBusy) return;

  const label = type === 'image' ? (text || 'Sent an image') : (text || 'Sent a voice note');
  aiHistory.push({ role: 'user', content: label, _media: type });
  document.getElementById('aiSuggestions').style.display = 'none';
  renderAIHistory();
  showAIThinking(true);
  aiBusy = true;
  document.getElementById('aiSendBtn').disabled = true;

  try {
    const fd = new FormData();
    fd.append('media', file);
    fd.append('text', text || '');
    fd.append('mediaType', type);
    const historyForServer = aiHistory.slice(0, -1).map(m => {
      if (m._media) return { role: m.role, content: typeof m.content === 'string' ? m.content : m.content };
      return { role: m.role, content: m.content };
    });
    fd.append('messages', JSON.stringify(historyForServer));

    const token = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('nbm_session='));
    const resp = await fetch('/api/ai/chat-media', { method: 'POST', body: fd, credentials: 'same-origin' });
    if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error || 'Request failed'); }
    const data = await resp.json();

    if (data.user_content) {
      aiHistory[aiHistory.length - 1] = { role: 'user', content: data.user_content };
    }

    if (data.assistant_content) {
      aiHistory.push({ role: 'assistant', content: data.assistant_content });
    } else if (data.reply) {
      aiHistory.push({ role: 'assistant', content: [{ type: 'text', text: data.reply }] });
    }
    showAIThinking(false);
    renderAIHistory();
    const didMutate = (data.tool_calls || []).some(tc => ['create_task', 'update_task'].includes(tc.tool));
    if (didMutate) {
      try { await loadClients(); await loadWorkloadSummary(); } catch {}
    }
  } catch (err) {
    showAIThinking(false);
    const box = document.getElementById('aiMessages');
    box.insertAdjacentHTML('beforeend', `<div class="ai-msg-error">${esc(err.message || 'Error')}</div>`);
    box.scrollTop = box.scrollHeight;
  } finally {
    aiBusy = false;
    document.getElementById('aiSendBtn').disabled = false;
    document.getElementById('aiInput').focus();
  }
}

function showAIThinking(on) {
  const box = document.getElementById('aiMessages');
  const existing = box.querySelector('.ai-thinking');
  if (existing) existing.remove();
  if (on) {
    box.insertAdjacentHTML('beforeend', '<div class="ai-thinking"><span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span> Thinking...</div>');
    box.scrollTop = box.scrollHeight;
  }
}

// Auto-grow textarea and submit on Enter (Shift+Enter for newline)
document.addEventListener('DOMContentLoaded', () => {
  const ta = document.getElementById('aiInput');
  if (!ta) return;
  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendAIMessage();
    }
  });
});

// Kick off availability check after user loads
(async function initAI() {
  // Wait a moment so loadCurrentUser has a chance to run
  setTimeout(() => { checkAIAvailable(); }, 500);
})();
