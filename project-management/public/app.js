// ─── State ──────────────────────────────────────────────
let clients = [];
let teamMembers = [];
let appUsers = [];
let currentUser = null;
let currentFilter = 'all';
let currentView = 'clients';
let expandedClients = new Set();
let expandedProjects = new Set();
let expandedComments = new Set();
let showCompletedTasks = new Set();
let showArchivedProjects = new Set();
let showArchivedTasks = new Set();
let calendarDate = new Date();
let draggedClientId = null;
let myTasksFilter = false;
let clientSortMode = 'manual';
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
  renderStats();
  if (currentView === 'clients') renderClients();
}

async function loadTeam() {
  try { appUsers = await api('/api/users'); } catch(e) { appUsers = []; }
  if (!Array.isArray(appUsers)) appUsers = [];
  teamMembers = appUsers.map(u => ({ id: u.id, name: u.display_name, role: u.role, avatar_color: u.avatar_color, avatar_url: u.avatar_url }));
  updateUserSelector();
  updatePersonDropdowns();
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

// ─── View Switching ─────────────────────────────────────
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentView = tab.dataset.view;
    document.getElementById('clientsView').style.display = currentView === 'clients' ? '' : 'none';
    document.getElementById('todayView').style.display = currentView === 'today' ? '' : 'none';
    document.getElementById('calendarView').style.display = currentView === 'calendar' ? '' : 'none';
    document.getElementById('focusView').style.display = currentView === 'focus' ? '' : 'none';
    document.getElementById('clientSubBar').style.display = currentView === 'clients' ? '' : 'none';
    if (currentView === 'today') loadTodayView();
    if (currentView === 'calendar') loadCalendarView();
    if (currentView === 'focus') loadFocusView();
  });
});

// ─── Stats ──────────────────────────────────────────────
function renderStats() {
  const t = { total: 0, outstanding: 0, inProgress: 0, overdue: 0, stuck: 0, completed: 0, awaitingManager: 0 };
  for (const c of clients) {
    t.total += c.stats.totalTasks;
    t.outstanding += c.stats.outstandingTasks;
    t.inProgress += c.stats.inProgressTasks;
    t.overdue += c.stats.overdueTasks;
    t.stuck += c.stats.blockedTasks;
    t.completed += c.stats.completedTasks;
    t.awaitingManager += c.stats.awaitingManager || 0;
  }
  document.getElementById('statsBar').innerHTML = `
    <div class="stat-card" onclick="showStatPopup('outstanding')"><div class="stat-number">${t.outstanding}</div><div class="stat-label">Outstanding</div></div>
    <div class="stat-card" onclick="showStatPopup('in-progress')"><div class="stat-number">${t.inProgress}</div><div class="stat-label">In Progress</div></div>
    <div class="stat-card" onclick="showStatPopup('overdue')"><div class="stat-number">${t.overdue}</div><div class="stat-label">Overdue</div></div>
    <div class="stat-card" onclick="showStatPopup('stuck')"><div class="stat-number">${t.stuck}</div><div class="stat-label">Stuck</div></div>
    <div class="stat-card ${t.awaitingManager?'stat-awaiting':''}" onclick="showStatPopup('awaiting-manager')"><div class="stat-number" style="color:${t.awaitingManager?'var(--danger)':'var(--text-secondary)'}">${t.awaitingManager}</div><div class="stat-label" style="color:${t.awaitingManager?'var(--danger)':'var(--text-secondary)'}">Awaiting You</div></div>`;
}

function showStatPopup(type) {
  const titles = {'outstanding':'Outstanding Tasks','in-progress':'In Progress','overdue':'Overdue Tasks','stuck':'Stuck Tasks','completed':'Completed Tasks','awaiting-manager':'Awaiting Your Sign-off'};
  document.getElementById('statsModalTitle').textContent = titles[type]||'Tasks';
  const now = localDateStr(new Date());
  const items = [];
  for (const c of clients) for (const p of c.projects) for (const task of p.tasks) {
    let m = false;
    if (type==='outstanding' && task.progress!=='completed' && task.progress!=='invoiced') m=true;
    if (type==='in-progress' && task.progress==='in-progress') m=true;
    if (type==='completed' && (task.progress==='completed'||task.progress==='invoiced')) m=true;
    if (type==='overdue' && task.deadline && task.deadline<now && task.progress!=='completed' && task.progress!=='invoiced') m=true;
    if (type==='stuck' && task.progress==='stuck') m=true;
    if (type==='awaiting-manager' && task.progress==='awaiting-manager') m=true;
    if (m) items.push({task,project:p,client:c});
  }
  const ct = document.getElementById('statsModalContent');
  ct.innerHTML = items.length===0 ? '<div style="padding:24px;text-align:center;color:var(--text-secondary)">None</div>' :
    items.map(({task,project,client})=>`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--border);cursor:pointer" onclick="navigateToTask(${client.id},${project.id},${task.id})">
        <div>
          <div style="font-weight:600;font-size:13px">${esc(task.title)}</div>
          <div style="font-size:11px;color:var(--text-secondary)">${esc(client.name)} &rarr; ${esc(project.name)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="status-badge status-${task.progress}">${progressLabel(task.progress)}</span>
          ${task.deadline?`<span style="font-size:11px" class="${getDeadlineClass(task.deadline,task.progress)}">${fmtDate(task.deadline)}</span>`:''}
        </div>
      </div>`).join('');
  openModal('statsModal');
}

function navigateToTask(cid,pid,tid) {
  closeModal('statsModal');
  if (currentView!=='clients') { document.querySelector('[data-view="clients"]').click(); }
  expandedClients.add(cid); expandedProjects.add(pid); renderClients();
  setTimeout(()=>{ const el=document.querySelector(`[data-task-id="${tid}"]`); if(el){el.scrollIntoView({behavior:'smooth',block:'center'}); el.classList.add('highlight'); setTimeout(()=>{el.classList.remove('highlight');},2000);} },100);
}

// ─── Helpers ────────────────────────────────────────────
function esc(s){if(!s)return'';const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function localDateStr(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function taskRef(id) { return 'NB' + String(id).padStart(3, '0'); }
function userAvatar(user, size) {
  const s = size || 20;
  if (!user) return '';
  const color = user.avatar_color || '#3eaf84';
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
function timeAgo(ds){if(!ds)return'';const now=new Date(),d=new Date(ds.replace(' ','T')+(ds.includes('T')||ds.includes(' ')?'Z':'T00:00:00Z')),m=Math.floor((now-d)/6e4);if(isNaN(m))return'';if(m<1)return'just now';if(m<60)return m+'m ago';const h=Math.floor(m/60);if(h<24)return h+'h ago';const dd=Math.floor(h/24);if(dd<7)return dd+'d ago';return d.toLocaleDateString('en-GB',{day:'numeric',month:'short'});}
function fmtDateTime(ds){if(!ds)return'';const d=new Date(ds.replace(' ','T')+(ds.includes('T')||ds.includes(' ')?'Z':'T00:00:00Z'));if(isNaN(d))return'';return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+' at '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});}
function fmtFileSize(bytes){if(bytes<1024)return bytes+'B';if(bytes<1048576)return(bytes/1024).toFixed(1)+'KB';return(bytes/1048576).toFixed(1)+'MB';}

// ─── Toggles ────────────────────────────────────────────
function toggleClient(id){expandedClients.has(id)?expandedClients.delete(id):expandedClients.add(id);saveExpandedState();renderClients();}
function toggleProject(id){expandedProjects.has(id)?expandedProjects.delete(id):expandedProjects.add(id);saveExpandedState();renderClients();}
function saveExpandedState(){try{localStorage.setItem('nbm_expandedClients',JSON.stringify([...expandedClients]));localStorage.setItem('nbm_expandedProjects',JSON.stringify([...expandedProjects]));}catch{}}
function toggleComments(tid){expandedComments.has(tid)?expandedComments.delete(tid):expandedComments.add(tid);renderClients();}
function toggleCompletedTasks(pid){showCompletedTasks.has(pid)?showCompletedTasks.delete(pid):showCompletedTasks.add(pid);renderClients();}
function toggleArchivedProjects(cid){showArchivedProjects.has(cid)?showArchivedProjects.delete(cid):showArchivedProjects.add(cid);renderClients();}
function toggleArchivedTasks(pid){showArchivedTasks.has(pid)?showArchivedTasks.delete(pid):showArchivedTasks.add(pid);renderClients();}

// ─── Modal ──────────────────────────────────────────────
function openModal(id){document.getElementById(id).classList.add('active');document.getElementById('modalBackdrop').classList.add('active');}
function closeModal(id){document.getElementById(id).classList.remove('active');if(!document.querySelector('.modal.active'))document.getElementById('modalBackdrop').classList.remove('active');}
function closeAllModals(){document.querySelectorAll('.modal.active').forEach(m=>m.classList.remove('active'));document.getElementById('modalBackdrop').classList.remove('active');}
document.getElementById('modalBackdrop').addEventListener('click',closeAllModals);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAllModals();});

// ─── Render Clients ─────────────────────────────────────
function renderClients() {
  const ct = document.getElementById('clientList');
  if (!clients.length) { ct.innerHTML='<div class="empty-state"><img src="/NBM%20Logo%20No%20NG%20Light%20Lines.png" alt="" style="width:80px;opacity:0.3;margin-bottom:16px"><p>No clients yet. Click + to add one.</p></div>'; return; }
  // Sort clients
  const sorted = [...clients];
  if (clientSortMode === 'alpha') sorted.sort((a,b) => a.name.localeCompare(b.name));
  else if (clientSortMode === 'alpha-desc') sorted.sort((a,b) => b.name.localeCompare(a.name));
  else if (clientSortMode === 'recent') sorted.sort((a,b) => (b.updated_at||b.created_at||'').localeCompare(a.updated_at||a.created_at||''));
  else if (clientSortMode === 'outstanding') sorted.sort((a,b) => b.stats.outstandingTasks - a.stats.outstandingTasks);
  const canDrag = clientSortMode === 'manual';
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
  ct.innerHTML = sorted.map(c => {
    const ex = expandedClients.has(c.id);
    const s = c.stats;
    const pct = s.totalTasks ? Math.round(s.completedTasks/s.totalTasks*100) : 0;
    const links=[];
    if(c.gmail_link)links.push(`<a href="${esc(c.gmail_link)}" target="_blank" class="client-link" onclick="event.stopPropagation()" title="Gmail">&#9993;</a>`);
    if(c.drive_link)links.push(`<a href="${esc(c.drive_link)}" target="_blank" class="client-link" onclick="event.stopPropagation()" title="Drive">&#128193;</a>`);
    return `<div class="client-row ${ex?'expanded':''}" data-client-id="${c.id}" ${canDrag?`draggable="true" ondragstart="onDragStart(event,${c.id})" ondragover="onDragOver(event)" ondrop="onDrop(event,${c.id})" ondragend="onDragEnd(event)" ondragleave="onDragLeave(event)"`:''}>
      <div class="client-summary" onclick="toggleClient(${c.id})">
        <div class="client-info">
          ${canDrag?'<span class="drag-handle" onclick="event.stopPropagation()">&#9776;</span>':''}
          <div class="client-logo">${c.logo_url?`<img src="${esc(c.logo_url)}" alt="">`:esc(c.code||c.name.substring(0,3).toUpperCase())}</div>
          <div>
            <div class="client-name">${c.is_private?'<span title="Private — only visible to you" style="font-size:12px;margin-right:4px">&#128274;</span>':''}${esc(c.name)} <span class="client-code">${esc(c.code||'')}</span></div>
            <div style="display:flex;gap:6px;align-items:center">${links.join('')}</div>
          </div>
        </div>
        <div><span class="client-type-badge type-${c.agreement_type}">${c.agreement_type==='recurring'?'Recurring':'Ad Hoc'}</span></div>
        <div style="text-align:center">${c.projects.length}</div>
        <div style="text-align:center"><span class="${s.outstandingTasks>0?(s.overdueTasks>0?'overdue':''):'completed'}" style="font-weight:600">${s.outstandingTasks}</span></div>
        <div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          <div style="font-size:10px;color:var(--text-secondary);margin-top:2px">${s.completedTasks}/${s.totalTasks}</div>
        </div>
        <div class="client-actions" onclick="event.stopPropagation()">
          <button class="btn-icon" onclick="editClient(${c.id})" title="Edit">&#9998;</button>
          <button class="btn-icon" onclick="openProjectModal(${c.id})" title="Add Project">+</button>
          <button class="btn-icon" onclick="showClientTimeline(${c.id},'${esc(c.name)}')" title="Timeline">&#128200;</button>
          <button class="btn-icon" onclick="showClientHistory(${c.id},'${esc(c.name)}')" title="History">&#128337;</button>
          <button class="pin-btn ${isPinned('client',c.id)?'pinned':''}" onclick="togglePin('client',${c.id},event)" title="${isPinned('client',c.id)?'Unpin':'Pin'}">${isPinned('client',c.id)?'&#9733;':'&#9734;'}</button>
          <button class="btn-icon" onclick="archiveClient(${c.id})" title="Archive">&#128230;</button>
          ${currentUser?.role==='owner'?`<button class="btn-icon" onclick="deleteClient(${c.id})" title="Delete" style="color:var(--danger)">&#128465;</button>`:''}
        </div>
      </div>
      <div class="client-projects">
        <div class="client-projects-inner">
          ${c.projects.map(p=>renderProject(p,c.id)).join('')}
          ${renderArchivedProjects(c)}
          <div style="padding:8px 16px"><button class="btn btn-ghost btn-sm" onclick="openProjectModal(${c.id})">+ Add Project</button></div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderArchivedProjects(c) {
  if(!c.archivedProjects||!c.archivedProjects.length)return'';
  const show=showArchivedProjects.has(c.id);
  return `<div style="padding:4px 16px">
    <button class="btn btn-ghost btn-sm" onclick="toggleArchivedProjects(${c.id})">${show?'&#9660;':'&#9654;'} ${c.archivedProjects.length} archived project${c.archivedProjects.length!==1?'s':''}</button>
    ${show?c.archivedProjects.map(p=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 12px;opacity:0.6"><span>${esc(p.name)}</span><button class="btn btn-ghost btn-sm" onclick="restoreProject(${p.id})">Restore</button></div>`).join(''):''}
  </div>`;
}

function renderProject(p, cid) {
  const ex=expandedProjects.has(p.id);
  const myName=currentUser?.display_name||'';
  const allTasks=myTasksFilter?p.tasks.filter(t=>t.assignee===myName):p.tasks;
  const active=allTasks.filter(t=>t.progress!=='completed'&&t.progress!=='invoiced').sort((a,b)=>(b.is_pinned||0)-(a.is_pinned||0));
  const done=allTasks.filter(t=>t.progress==='completed'||t.progress==='invoiced');
  const arch=p.archivedTasks||[];
  const showDone=showCompletedTasks.has(p.id), showArch=showArchivedTasks.has(p.id);
  return `<div class="project-section ${ex?'expanded':''}" data-project-id="${p.id}">
    <div class="project-header" onclick="toggleProject(${p.id})">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:10px;transition:transform 0.2s;transform:rotate(${ex?'90':'0'}deg)">&#9654;</span>
        <span style="font-weight:600">${esc(p.name)}</span>
        <span class="status-badge status-${p.status}">${p.status}</span>
        <span style="font-size:11px;color:var(--text-secondary)">${active.length} active${done.length?', '+done.length+' done':''}</span>
      </div>
      <div onclick="event.stopPropagation()" style="display:flex;gap:4px">
        <button class="btn-icon" onclick="editProject(${p.id},${cid})" title="Edit">&#9998;</button>
        <button class="btn-icon" onclick="duplicateProject(${p.id})" title="Duplicate">&#128203;</button>
        <button class="btn-icon" onclick="completeProject(${p.id})" title="Mark Completed">&#10003;</button>
        <button class="btn-icon" onclick="archiveProject(${p.id})" title="Archive">&#128230;</button>
        ${currentUser?.role==='owner'?`<button class="btn-icon" onclick="deleteProject(${p.id})" title="Delete" style="color:var(--danger)">&#128465;</button>`:''}
      </div>
    </div>
    <div class="project-tasks">
      <div class="project-tasks-inner">
        ${active.map(t=>renderTask(t)).join('')}
        ${!active.length?'<div style="padding:12px 16px;color:var(--text-secondary);font-size:13px">No active tasks</div>':''}
        <div style="padding:6px 16px"><button class="btn btn-ghost btn-sm" onclick="openTaskModal(${p.id})">+ Add Task</button></div>
        ${done.length?`<div style="padding:4px 16px"><button class="btn btn-ghost btn-sm" onclick="toggleCompletedTasks(${p.id})">${showDone?'&#9660;':'&#9654;'} ${done.length} completed</button>${showDone?done.map(t=>renderTask(t,true)).join(''):''}</div>`:''}
        ${arch.length?`<div style="padding:4px 16px"><button class="btn btn-ghost btn-sm" onclick="toggleArchivedTasks(${p.id})">${showArch?'&#9660;':'&#9654;'} ${arch.length} archived</button>${showArch?arch.map(t=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;opacity:0.5;font-size:13px"><span>${esc(t.title)}</span><button class="btn btn-ghost btn-sm" onclick="restoreTask(${t.id})">Restore</button></div>`).join(''):''}</div>`:''}
      </div>
    </div>
  </div>`;
}

function renderTask(t, isDone) {
  const dc=getDeadlineClass(t.deadline,t.progress);
  const mem=findUser(t.assignee);
  const cc=t.comments?t.comments.length:0;
  const ac=t.attachments?t.attachments.length:0;
  const sc=expandedComments.has(t.id);
  const sel=selectedTasks.has(t.id);
  return `<div class="task-row ${isDone?'completed':''} ${sel?'task-selected':''}" data-task-id="${t.id}">
    <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1">
      <input type="checkbox" class="task-checkbox" ${sel?'checked':''} onclick="event.stopPropagation();toggleTaskSelect(${t.id})" title="Select for batch actions">
      <span class="task-ref" title="Ref: ${taskRef(t.id)}">${taskRef(t.id)}</span>
      <span class="priority-badge priority-${t.priority}" title="${priorityLabel(t.priority)}"></span>
      <span class="task-title" onclick="editTask(${t.id})" style="cursor:pointer">${esc(t.title)}</span>
      ${t.is_recurring?'<span class="recurring-badge" title="Recurring">&#8635;</span>':''}
      ${cc?`<span style="font-size:11px;color:var(--text-secondary);cursor:pointer" onclick="toggleComments(${t.id})">&#128172;${cc}</span>`:''}
      ${ac?`<span style="font-size:11px;color:var(--text-secondary)">&#128206;${ac}</span>`:''}
    </div>
    <div style="display:flex;align-items:center;gap:4px;min-width:80px">
      ${userAvatar(mem, 22)}<span style="font-size:12px">${esc(t.assignee||'')}</span>
    </div>
    <div style="font-size:12px;min-width:70px" class="${dc}">${fmtDateShort(t.deadline)}</div>
    <div style="font-size:12px;min-width:70px;color:var(--text-secondary)">${fmtDateShort(t.planned_date)}</div>
    <div style="font-size:12px;color:var(--text-secondary);min-width:40px">${t.estimated_hours?t.estimated_hours+'h':''}</div>
    <div><select class="quick-status" onchange="quickStatusChange(${t.id},this.value)" onclick="event.stopPropagation()">
      ${['not-started','in-progress','completed','stuck','awaiting-client','awaiting-manager','ready-to-invoice','invoiced'].map(s=>`<option value="${s}" ${t.progress===s?'selected':''}>${progressLabel(s)}</option>`).join('')}
    </select></div>
    <div class="task-actions">
      <button class="btn-icon" onclick="event.stopPropagation();showInlineEdit(${t.id})" title="Quick edit">&#9998;</button>
      <button class="btn-icon" onclick="editTask(${t.id})" title="Full edit">&#128196;</button>
      <button class="pin-btn ${t.is_pinned?'pinned':''}" onclick="toggleTaskPin(${t.id},event)" title="${t.is_pinned?'Unpin':'Pin'}">${t.is_pinned?'&#9733;':'&#9734;'}</button>
      <button class="btn-icon" onclick="archiveTask(${t.id})" title="Archive">&#128230;</button>
      ${currentUser?.role==='owner'?`<button class="btn-icon" onclick="deleteTask(${t.id})" title="Delete" style="color:var(--danger)">&#128465;</button>`:''}
    </div>
  </div>${sc?renderCommentThread(t):''}`;
}

async function quickStatusChange(taskId, newStatus) {
  const oldTask = findTaskById(taskId);
  const wasComplete = oldTask && (oldTask.progress === 'completed' || oldTask.progress === 'invoiced');
  await api(`/api/tasks/${taskId}`, {method:'PUT', body:{progress:newStatus}});
  await loadClients();
  // Celebrate when completing a task
  if (!wasComplete && (newStatus === 'completed' || newStatus === 'invoiced')) celebrate();
}

function renderCommentThread(t) {
  const cs=t.comments||[];
  return `<div class="comment-section">
    ${!cs.length?'<div style="font-size:12px;color:var(--text-secondary);padding:4px 0">No comments yet</div>':''}
    ${cs.map(c=>{const m=findUser(c.author);return`<div class="comment">${userAvatar(m,24)||`<span style="width:24px;height:24px;border-radius:50%;background:#64748b;display:inline-flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:600;flex-shrink:0">${(c.author||'?')[0].toUpperCase()}</span>`}<div style="flex:1;min-width:0"><div style="font-size:11px"><strong>${esc(c.author)}</strong> <span style="color:var(--text-secondary)">${timeAgo(c.created_at)}</span></div><div style="font-size:13px;margin-top:2px">${esc(c.content)}</div></div></div>`;}).join('')}
    <form class="comment-form" onsubmit="addComment(event,${t.id})"><input type="text" placeholder="Write a comment..." required><button type="submit" class="btn btn-primary btn-sm">Post</button></form>
  </div>`;
}

// ─── Drag & Drop ────────────────────────────────────────
function onDragStart(e,id){draggedClientId=id;e.target.closest('.client-row').classList.add('dragging');e.dataTransfer.effectAllowed='move';}
function onDragOver(e){e.preventDefault();e.dataTransfer.dropEffect='move';e.target.closest('.client-row')?.classList.add('drag-over');}
function onDragLeave(e){e.target.closest('.client-row')?.classList.remove('drag-over');}
function onDragEnd(e){document.querySelectorAll('.dragging,.drag-over').forEach(el=>{el.classList.remove('dragging','drag-over');});draggedClientId=null;}
async function onDrop(e,targetId){
  e.preventDefault();
  document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));
  if(!draggedClientId||draggedClientId===targetId)return;
  const order=clients.map(c=>c.id);
  const fromIdx=order.indexOf(draggedClientId);
  const toIdx=order.indexOf(targetId);
  if(fromIdx===-1||toIdx===-1)return;
  order.splice(fromIdx,1);
  order.splice(toIdx,0,draggedClientId);
  draggedClientId=null;
  await api('/api/clients/reorder',{method:'PUT',body:{order}});
  await loadClients();
}

// ─── Archive ────────────────────────────────────────────
async function archiveClient(id){const c=clients.find(x=>x.id===id);if(!confirm(`Archive "${c?.name}"?`))return;await api(`/api/clients/${id}/archive`,{method:'PUT'});expandedClients.delete(id);await loadClients();}
async function deleteClient(id){const c=clients.find(x=>x.id===id);const name=c?c.name:'this client';if(!confirm(`Permanently delete "${name}" and all its projects/tasks? This cannot be undone.`))return;if(!confirm(`Are you sure? This will delete ALL data for "${name}".`))return;await api(`/api/clients/${id}`,{method:'DELETE'});expandedClients.delete(id);await loadClients();}
async function archiveProject(id){if(!confirm('Archive this project?'))return;await api(`/api/projects/${id}/archive`,{method:'PUT'});expandedProjects.delete(id);await loadClients();}
async function completeProject(id){if(!confirm('Mark this project as completed?'))return;await api(`/api/projects/${id}`,{method:'PUT',body:{status:'completed'}});await loadClients();}
async function deleteProject(id){let name='this project';for(const c of clients)for(const p of c.projects)if(p.id===id){name=p.name;break;}if(!confirm(`Permanently delete "${name}" and all its tasks? This cannot be undone.`))return;if(!confirm(`Are you sure? All tasks in "${name}" will be lost forever.`))return;await api(`/api/projects/${id}`,{method:'DELETE'});expandedProjects.delete(id);await loadClients();}
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
    <button class="btn btn-ghost btn-sm" onclick="clearTaskSelection()">Cancel</button>
  `;
}

function openMoveModal() {
  // Build a client → project tree for the picker
  let html = '<div class="form-error" id="moveFormError" style="display:none"></div>';
  html += '<div class="move-tree">';
  for (const c of clients) {
    html += `<div class="move-client"><strong>${esc(c.name)}</strong>`;
    for (const p of c.projects) {
      html += `<label class="move-project-option"><input type="radio" name="moveTarget" value="${p.id}"> ${esc(p.name)}</label>`;
    }
    html += '</div>';
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
    modal.innerHTML = `<div class="modal-header"><h2>Move Tasks to Project</h2><button class="modal-close" onclick="closeModal('moveModal')">&times;</button></div><div id="moveModalBody" style="padding:20px 28px"></div>`;
    document.body.appendChild(modal);
  }
  document.getElementById('moveModalBody').innerHTML = html;
  openModal('moveModal');
}

async function executeBatchMove() {
  const selected = document.querySelector('input[name="moveTarget"]:checked');
  if (!selected) {
    const err = document.getElementById('moveFormError');
    err.textContent = 'Select a destination project';
    err.style.display = 'block';
    return;
  }
  const targetId = +selected.value;
  const ids = [...selectedTasks];
  try {
    const res = await api('/api/tasks/batch-move', { method: 'POST', body: { task_ids: ids, target_project_id: targetId } });
    closeModal('moveModal');
    clearTaskSelection();
    await loadClients();
  } catch (err) {
    const errEl = document.getElementById('moveFormError');
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
}
async function restoreProject(id){await api(`/api/projects/${id}/archive`,{method:'PUT'});await loadClients();}
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
  ['clientId','clientName','clientCode','clientNotes','clientGmail','clientDrive'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('clientType').value='recurring';
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
  const data={name:document.getElementById('clientName').value,code:document.getElementById('clientCode').value,agreement_type:document.getElementById('clientType').value,notes:document.getElementById('clientNotes').value,gmail_link:document.getElementById('clientGmail').value,drive_link:document.getElementById('clientDrive').value,is_private:document.getElementById('clientPrivate').checked};
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

// ─── Project CRUD ───────────────────────────────────────
function openProjectModal(cid){
  document.getElementById('projectModalTitle').textContent='New Project';
  document.getElementById('projectFormError').style.display='none';
  document.getElementById('projectId').value='';
  document.getElementById('projectClientId').value=cid;
  document.getElementById('projectName').value='';
  document.getElementById('projectStatus').value='active';
  document.getElementById('projectNotes').value='';
  openModal('projectModal');
}
function editProject(pid,cid){
  const c=clients.find(x=>x.id===cid);const p=c?.projects.find(x=>x.id===pid);if(!p)return;
  document.getElementById('projectModalTitle').textContent='Edit Project';
  document.getElementById('projectFormError').style.display='none';
  document.getElementById('projectId').value=p.id;
  document.getElementById('projectClientId').value=cid;
  document.getElementById('projectName').value=p.name;
  document.getElementById('projectStatus').value=p.status;
  document.getElementById('projectNotes').value=p.notes||'';
  openModal('projectModal');
}
document.getElementById('projectForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const errEl=document.getElementById('projectFormError');
  errEl.style.display='none';
  const id=document.getElementById('projectId').value;
  const data={client_id:+document.getElementById('projectClientId').value,name:document.getElementById('projectName').value,status:document.getElementById('projectStatus').value,notes:document.getElementById('projectNotes').value};
  if (!data.name.trim()) { errEl.textContent='Project name is required.'; errEl.style.display='block'; return; }
  const btn=e.target.querySelector('[type="submit"]');
  setSaving(btn, true);
  try {
    if(id)await api(`/api/projects/${id}`,{method:'PUT',body:data});else await api('/api/projects',{method:'POST',body:data});
    closeModal('projectModal');await loadClients();
  } catch(err) { errEl.textContent=err.message; errEl.style.display='block'; }
  finally { setSaving(btn, false); }
});

// ─── Task CRUD ──────────────────────────────────────────
function openTaskModal(pid){
  document.getElementById('taskModalTitle').textContent='New Task';
  document.getElementById('taskFormError').style.display='none';
  ['taskId','taskTitle','taskDeadline','taskPlannedDate','taskEstHours','taskReferences','taskNotes'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('taskProjectId').value=pid;
  document.getElementById('taskProgress').value='not-started';
  document.getElementById('taskPriority').value='medium';
  document.getElementById('taskRecurring').checked=false;
  document.getElementById('recurOptions').style.display='none';
  document.getElementById('taskRecurInterval').value='1';
  document.getElementById('taskRecurUnit').value='months';
  document.getElementById('taskAttachmentsList').innerHTML='';
  document.getElementById('taskFiles').value='';
  currentChecklist = [];
  renderChecklist();
  populateAssigneeDropdown('');
  openModal('taskModal');
}

function findTaskById(id) {
  for(const c of clients) for(const p of c.projects) {
    let t = p.tasks.find(x=>x.id===id);
    if(t) return t;
    if(p.archivedTasks) { t = p.archivedTasks.find(x=>x.id===id); if(t) return t; }
  }
  return null;
}

function editTask(id){
  const t=findTaskById(id);
  if(!t)return;
  document.getElementById('taskModalTitle').textContent = 'Edit Task — ' + taskRef(t.id);
  document.getElementById('taskFormError').style.display='none';
  document.getElementById('taskId').value=t.id;
  document.getElementById('taskProjectId').value=t.project_id;
  document.getElementById('taskTitle').value=t.title;
  document.getElementById('taskDeadline').value=t.deadline||'';
  document.getElementById('taskPlannedDate').value=t.planned_date||'';
  document.getElementById('taskEstHours').value=t.estimated_hours||'';
  document.getElementById('taskProgress').value=t.progress;
  document.getElementById('taskPriority').value=t.priority||'medium';
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
  populateAssigneeDropdown(t.assignee||'');
  loadChecklist(t.id);
  openModal('taskModal');
}

function populateAssigneeDropdown(cur){
  document.getElementById('taskAssignee').innerHTML='<option value="">Unassigned</option>'+appUsers.map(u=>`<option value="${esc(u.display_name)}" ${u.display_name===cur?'selected':''}>${esc(u.display_name)}</option>`).join('');
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
  const data={
    project_id:+document.getElementById('taskProjectId').value,
    title,
    assignee:document.getElementById('taskAssignee').value,
    deadline:document.getElementById('taskDeadline').value,
    planned_date:document.getElementById('taskPlannedDate').value,
    estimated_hours:parseFloat(document.getElementById('taskEstHours').value)||0,
    progress:document.getElementById('taskProgress').value,
    priority:document.getElementById('taskPriority').value,
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
    closeModal('taskModal');await loadClients();
    // Celebrate if task was just completed
    const wasComplete = oldTask && (oldTask.progress === 'completed' || oldTask.progress === 'invoiced');
    if (!wasComplete && (data.progress === 'completed' || data.progress === 'invoiced')) celebrate();
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

// ─── Sort ─────────────────────────────────────────────
document.getElementById('clientSort').addEventListener('change', function() {
  clientSortMode = this.value;
  renderClients();
});

// ─── My Tasks Filter ──────────────────────────────────
function toggleMyTasks() {
  myTasksFilter = !myTasksFilter;
  const btn = document.getElementById('myTasksBtn');
  if (btn) btn.classList.toggle('active', myTasksFilter);
  renderClients();
}

function clearAllFilters() {
  myTasksFilter = false;
  currentFilter = 'all';
  document.getElementById('myTasksBtn')?.classList.remove('active');
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
              <span class="priority-badge priority-${t.priority}"></span>
              <span style="font-weight:600;font-size:13px">${esc(t.title)}</span>
              ${t.archived ? '<span style="font-size:10px;color:var(--text-muted)">(archived)</span>' : ''}
            </div>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">
              ${esc(t.client_name)} → ${esc(t.project_name)} · ${esc(t.assignee || 'Unassigned')} · <span class="status-badge status-${t.progress}">${progressLabel(t.progress)}</span>
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
    for (const p of c.projects) {
      const t = p.tasks.find(x => x.id === taskId);
      if (t) {
        if (currentView !== 'clients') document.querySelector('[data-view="clients"]').click();
        expandedClients.add(c.id);
        expandedProjects.add(p.id);
        renderClients();
        setTimeout(() => {
          const el = document.querySelector(`[data-task-id="${taskId}"]`);
          if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('highlight'); setTimeout(() => el.classList.remove('highlight'), 2000); }
        }, 100);
        return;
      }
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
  const tasks=await api(`/api/tasks/by-date?${params}`);
  const d=new Date(date+'T00:00:00');
  document.getElementById('todayTitle').textContent=d.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const ct=document.getElementById('todayContent');
  if(!tasks.length){ct.innerHTML='<div class="empty-state"><img src="/NBM%20Logo%20No%20NG%20Light%20Lines.png" alt="" style="width:60px;opacity:0.25;margin-bottom:12px"><p>No tasks planned for this date</p></div>';return;}
  const groups={};
  for(const t of tasks){const a=t.assignee||'Unassigned';if(!groups[a])groups[a]=[];groups[a].push(t);}
  let html='';
  for(const [assignee,gTasks] of Object.entries(groups)){
    const mem=findUser(assignee);
    const totalH=gTasks.reduce((s,t)=>s+(t.estimated_hours||0),0);
    html+=`<div class="today-group"><div class="today-group-header">${userAvatar(mem,28)}<span style="font-weight:600">${esc(assignee)}</span><span style="font-size:12px;color:var(--text-secondary);margin-left:auto">${totalH}h planned</span></div>`;
    html+=gTasks.map(t=>`<div class="today-task" onclick="editTask(${t.id})" style="cursor:pointer">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px">${esc(t.title)}</div>
        <div style="font-size:11px;color:var(--text-secondary)">${t.client_code?'['+esc(t.client_code)+'] ':''}${esc(t.client_name)} &rarr; ${esc(t.project_name)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <span class="priority-badge priority-${t.priority}"></span>
        <span style="font-size:12px;min-width:40px">${t.estimated_hours?t.estimated_hours+'h':''}</span>
        <span class="status-badge status-${t.progress}">${progressLabel(t.progress)}</span>
      </div>
    </div>`).join('');
    html+='</div>';
  }
  // Build project options for quick-add
  const projOpts = [];
  for (const c of clients) for (const p of c.projects) if (!p.archived) projOpts.push({ id: p.id, label: `${c.code || c.name.substring(0,3)} / ${p.name}` });

  html += `<form class="today-quick-add" onsubmit="todayQuickAdd(event);return false;">
    <input type="text" id="todayQuickTitle" placeholder="Quick add task for this day..." required>
    <select id="todayQuickProject" required style="min-width:160px">
      <option value="">Project...</option>
      ${projOpts.map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join('')}
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
  await api(`/api/users/${userId}/password`, { method: 'PUT', body: { password: pw } });
  alert('Password updated');
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
        <button class="btn btn-ghost btn-sm" onclick="downloadBackup('${esc(b.file)}')" title="Download">&#11015;</button>
        <button class="btn btn-ghost btn-sm" onclick="restoreBackup('${esc(b.file)}')" title="Restore" style="color:var(--warning)">&#8634;</button>
      </div>
    </div>`;
  }).join('');
}

function downloadBackup(file) {
  window.open(`/api/backups/download/${encodeURIComponent(file)}`, '_blank');
}

async function restoreBackup(file) {
  if (!confirm(`RESTORE from backup "${file}"?\n\nThis will REPLACE all current data with the backup. This cannot be undone.\n\nAre you sure?`)) return;
  if (!confirm('FINAL WARNING: All current tasks, projects, and comments will be overwritten. Continue?')) return;
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
    for (const p of c.projects) {
      for (const t of p.tasks) {
        allTasks.push({ ...t, project_name: p.name, client_name: c.name, client_code: c.code });
      }
    }
  }
  const mine = myName ? allTasks.filter(t => t.assignee === myName) : allTasks;

  const now = mine.filter(t => t.progress === 'in-progress');
  const blocked = mine.filter(t => t.progress === 'stuck' || t.progress === 'awaiting-client' || t.progress === 'awaiting-manager');
  const next = mine.filter(t => t.progress === 'not-started')
    .sort((a, b) => {
      const pa = { critical: 0, high: 1, medium: 2, low: 3 };
      return (pa[a.priority] || 2) - (pa[b.priority] || 2);
    }).slice(0, 8);

  function focusCard(t) {
    return `<div class="focus-card" onclick="editTask(${t.id})">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px">
          <span class="priority-badge priority-${t.priority}"></span>
          <span style="font-weight:600;font-size:14px">${esc(t.title)}</span>
        </div>
        <div class="focus-meta">${esc(t.client_code || '')} ${esc(t.client_name)} &rarr; ${esc(t.project_name)}${t.deadline ? ' &middot; Due ' + fmtDateShort(t.deadline) : ''}</div>
      </div>
      <div class="focus-actions">
        <select class="quick-status" onchange="quickStatusChange(${t.id},this.value);loadFocusView()" onclick="event.stopPropagation()">
          ${['not-started','in-progress','completed','stuck','awaiting-client','awaiting-manager','ready-to-invoice','invoiced'].map(s => `<option value="${s}" ${t.progress === s ? 'selected' : ''}>${progressLabel(s)}</option>`).join('')}
        </select>
        <button class="btn-icon" onclick="event.stopPropagation();toggleInlineComment(${t.id})" title="Quick comment">&#128172;</button>
      </div>
    </div><div id="focusComment${t.id}" style="display:none" class="inline-edit-row">
      <input type="text" placeholder="Quick note..." onkeydown="if(event.key==='Enter'){addQuickComment(${t.id},this);event.preventDefault();}">
      <button class="btn btn-primary btn-sm" onclick="addQuickComment(${t.id},this.previousElementSibling)">Post</button>
    </div>`;
  }

  document.getElementById('focusNow').innerHTML = now.length ? now.map(focusCard).join('') : '<div style="color:var(--text-muted);font-size:13px;padding:8px">Nothing in progress. Pick something from "Up Next"!</div>';
  document.getElementById('focusNext').innerHTML = next.length ? next.map(focusCard).join('') : '<div style="color:var(--text-muted);font-size:13px;padding:8px">Queue is empty.</div>';
  document.getElementById('focusBlocked').innerHTML = blocked.length ? blocked.map(focusCard).join('') : '<div style="color:var(--text-muted);font-size:13px;padding:8px">Nothing blocked. Smooth sailing!</div>';
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
    <input type="date" value="${t.planned_date || ''}" onchange="inlineDateChange(${taskId},this.value)" style="width:130px" title="Planned date">
    <select onchange="inlineAssigneeChange(${taskId},this.value)" style="width:110px">
      <option value="">Unassigned</option>
      ${appUsers.map(u => `<option value="${esc(u.display_name)}" ${u.display_name === t.assignee ? 'selected' : ''}>${esc(u.display_name)}</option>`).join('')}
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
      onclick = `toggleClient(${c.id});expandedClients.add(${c.id});renderClients();`;
    } else if (pin.entity_type === 'project') {
      for (const c of clients) { const p = c.projects.find(x => x.id === pin.entity_id); if (p) { label = p.name; onclick = `expandedClients.add(${c.id});expandedProjects.add(${p.id});renderClients();`; break; } }
      if (!label) return '';
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

// ─── Duplicate Project ─────────────────────────────────
async function duplicateProject(pid) {
  if (!confirm('Duplicate this project with all its tasks?')) return;
  await api(`/api/projects/${pid}/duplicate`, { method: 'POST' });
  await loadClients();
}

// ─── Quick Add from Today View ─────────────────────────
async function todayQuickAdd(e) {
  e.preventDefault();
  const title = document.getElementById('todayQuickTitle')?.value.trim();
  const projectId = document.getElementById('todayQuickProject')?.value;
  if (!title || !projectId) return;
  const date = document.getElementById('todayDate').value || localDateStr(new Date());
  const person = document.getElementById('todayPerson').value;
  await api('/api/tasks', { method: 'POST', body: { project_id: +projectId, title, planned_date: date, assignee: person || '' } });
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
    await loadCurrentUser();
    await loadTeam();
    await loadClients();
    await loadPins();
    // Restore expanded state from localStorage
    try {
      const ec = JSON.parse(localStorage.getItem('nbm_expandedClients') || '[]');
      const ep = JSON.parse(localStorage.getItem('nbm_expandedProjects') || '[]');
      ec.forEach(id => expandedClients.add(id));
      ep.forEach(id => expandedProjects.add(id));
      if (ec.length || ep.length) renderClients();
    } catch {}
    document.getElementById('todayDate').value=localDateStr(new Date());
  } catch(e) {
    console.error('Init error:', e);
    document.getElementById('clientList').innerHTML='<div class="empty-state"><p>Error loading data. Please refresh.</p></div>';
  }
})();
