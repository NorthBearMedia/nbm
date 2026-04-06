// ─── State ──────────────────────────────────────────────
let clients = [];
let teamMembers = [];
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

function getCurrentUser() { return document.getElementById('currentUser').value || 'System'; }

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return res.json();
}

async function loadClients() {
  const fp = currentFilter !== 'all' ? `?filter=${currentFilter}` : '';
  clients = await api(`/api/clients${fp}`);
  renderStats();
  if (currentView === 'clients') renderClients();
}

async function loadTeam() {
  teamMembers = await api('/api/team');
  updateUserSelector();
  updatePersonDropdowns();
}

function updateUserSelector() {
  const sel = document.getElementById('currentUser');
  const cur = sel.value;
  sel.innerHTML = teamMembers.map(m => `<option value="${esc(m.name)}" ${m.name===cur?'selected':''}>${esc(m.name)}</option>`).join('');
  if (!cur && teamMembers.length) sel.value = teamMembers[0].name;
}

function updatePersonDropdowns() {
  ['todayPerson','calendarPerson'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">Everyone</option>' + teamMembers.map(m => `<option value="${esc(m.name)}" ${m.name===cur?'selected':''}>${esc(m.name)}</option>`).join('');
  });
}

// ─── View Switching ─────────────────────────────────────
document.querySelectorAll('.view-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentView = tab.dataset.view;
    document.getElementById('clientsView').style.display = currentView === 'clients' ? '' : 'none';
    document.getElementById('todayView').style.display = currentView === 'today' ? '' : 'none';
    document.getElementById('calendarView').style.display = currentView === 'calendar' ? '' : 'none';
    document.getElementById('clientFilters').style.display = currentView === 'clients' ? '' : 'none';
    document.getElementById('addClientBtn').style.display = currentView === 'clients' ? '' : 'none';
    if (currentView === 'today') loadTodayView();
    if (currentView === 'calendar') loadCalendarView();
  });
});

// ─── Stats ──────────────────────────────────────────────
function renderStats() {
  const t = { clients: clients.length, outstanding: 0, inProgress: 0, overdue: 0, completed: 0 };
  for (const c of clients) { t.outstanding += c.stats.outstandingTasks; t.inProgress += c.stats.inProgressTasks; t.overdue += c.stats.overdueTasks; t.completed += c.stats.completedTasks; }
  document.getElementById('statsBar').innerHTML = `
    <div class="stat-card"><div class="stat-value">${t.clients}</div><div class="stat-label">Clients</div></div>
    <div class="stat-card warning clickable" onclick="showStatPopup('outstanding')"><div class="stat-value">${t.outstanding}</div><div class="stat-label">Outstanding</div></div>
    <div class="stat-card blue clickable" onclick="showStatPopup('in-progress')"><div class="stat-value">${t.inProgress}</div><div class="stat-label">In Progress</div></div>
    <div class="stat-card danger clickable" onclick="showStatPopup('overdue')"><div class="stat-value">${t.overdue}</div><div class="stat-label">Overdue</div></div>
    <div class="stat-card success clickable" onclick="showStatPopup('completed')"><div class="stat-value">${t.completed}</div><div class="stat-label">Completed</div></div>`;
}

function showStatPopup(type) {
  const titles = {'outstanding':'Outstanding Tasks','in-progress':'In Progress','overdue':'Overdue Tasks','completed':'Completed Tasks'};
  document.getElementById('statsModalTitle').textContent = titles[type]||'Tasks';
  const now = new Date().toISOString().split('T')[0];
  const items = [];
  for (const c of clients) for (const p of c.projects) for (const task of p.tasks) {
    let m = false;
    if (type==='outstanding' && task.progress!=='completed' && task.progress!=='invoiced') m=true;
    if (type==='in-progress' && task.progress==='in-progress') m=true;
    if (type==='completed' && (task.progress==='completed'||task.progress==='invoiced')) m=true;
    if (type==='overdue' && task.deadline && task.deadline<now && task.progress!=='completed' && task.progress!=='invoiced') m=true;
    if (m) items.push({task,project:p,client:c});
  }
  const ct = document.getElementById('statsModalContent');
  ct.innerHTML = items.length===0 ? '<div style="padding:24px;text-align:center;color:var(--text-muted)">None</div>' :
    items.map(({task,project,client})=>`
      <div class="popup-task-item" onclick="navigateToTask(${client.id},${project.id},${task.id})">
        <div class="popup-task-left">
          <div class="popup-task-title">${esc(task.title)}</div>
          <div class="popup-task-context">${esc(client.name)} → ${esc(project.name)}</div>
        </div>
        <div class="popup-task-right">
          <span class="task-deadline ${getDeadlineClass(task.deadline,task.progress)}">${fmtDate(task.deadline)}</span>
          <span class="progress-badge progress-${task.progress}"><span class="progress-dot"></span>${progressLabel(task.progress)}</span>
        </div>
      </div>`).join('');
  openModal('statsModal');
}

function navigateToTask(cid,pid,tid) {
  closeModal('statsModal');
  if (currentView!=='clients') { document.querySelector('[data-view="clients"]').click(); }
  expandedClients.add(cid); expandedProjects.add(pid); renderClients();
  setTimeout(()=>{ const el=document.querySelector(`[data-task-id="${tid}"]`); if(el){el.scrollIntoView({behavior:'smooth',block:'center'}); el.style.background='#eef2ff'; setTimeout(()=>{el.style.background='';},2000);} },100);
}

// ─── Helpers ────────────────────────────────────────────
function esc(s){if(!s)return'';const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function fmtDate(d){if(!d)return'—';return new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}
function fmtDateShort(d){if(!d)return'—';return new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});}
function getDeadlineClass(dl,prog){if(!dl||prog==='completed'||prog==='invoiced')return'';const now=new Date();now.setHours(0,0,0,0);const diff=(new Date(dl+'T00:00:00')-now)/864e5;return diff<0?'overdue':diff<=3?'soon':'';}
function progressLabel(p){return{'not-started':'Not Started','in-progress':'In Progress','completed':'Completed','blocked':'Blocked','ready-to-invoice':'Ready to Invoice','invoiced':'Invoiced'}[p]||p;}
function timeAgo(ds){if(!ds)return'';const now=new Date(),d=new Date(ds+(ds.includes('T')?'':'T00:00:00')),m=Math.floor((now-d)/6e4);if(m<1)return'just now';if(m<60)return m+'m ago';const h=Math.floor(m/60);if(h<24)return h+'h ago';const dd=Math.floor(h/24);if(dd<7)return dd+'d ago';return d.toLocaleDateString('en-GB',{day:'numeric',month:'short'});}

// ─── Toggles ────────────────────────────────────────────
function toggleClient(id){expandedClients.has(id)?expandedClients.delete(id):expandedClients.add(id);renderClients();}
function toggleProject(id){expandedProjects.has(id)?expandedProjects.delete(id):expandedProjects.add(id);renderClients();}
function toggleComments(tid){expandedComments.has(tid)?expandedComments.delete(tid):expandedComments.add(tid);renderClients();}
function toggleCompletedTasks(pid){showCompletedTasks.has(pid)?showCompletedTasks.delete(pid):showCompletedTasks.add(pid);renderClients();}
function toggleArchivedProjects(cid){showArchivedProjects.has(cid)?showArchivedProjects.delete(cid):showArchivedProjects.add(cid);renderClients();}
function toggleArchivedTasks(pid){showArchivedTasks.has(pid)?showArchivedTasks.delete(pid):showArchivedTasks.add(pid);renderClients();}

// ─── Modal ──────────────────────────────────────────────
function openModal(id){document.getElementById(id).classList.add('active');document.getElementById('modalBackdrop').classList.add('active');}
function closeModal(id){document.getElementById(id).classList.remove('active');document.getElementById('modalBackdrop').classList.remove('active');}
document.getElementById('modalBackdrop').addEventListener('click',()=>{document.querySelectorAll('.modal.active').forEach(m=>m.classList.remove('active'));document.getElementById('modalBackdrop').classList.remove('active');});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.querySelectorAll('.modal.active').forEach(m=>m.classList.remove('active'));document.getElementById('modalBackdrop').classList.remove('active');}});

// ─── Render Clients ─────────────────────────────────────
function renderClients() {
  const ct = document.getElementById('clientList');
  if (!clients.length) { ct.innerHTML='<div class="empty-state"><p>No clients yet.</p></div>'; return; }
  ct.innerHTML = clients.map(c => {
    const ex = expandedClients.has(c.id);
    const ini = c.name.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
    const s = c.stats;
    let pill='all-done',pillT='All done';
    if(s.overdueTasks>0){pill='has-overdue';pillT=s.outstandingTasks+' outstanding';}
    else if(s.outstandingTasks>0){pill='has-tasks';pillT=s.outstandingTasks+' outstanding';}
    const links=[];
    if(c.gmail_link)links.push(`<a href="${esc(c.gmail_link)}" target="_blank" class="client-link" onclick="event.stopPropagation()">&#9993; Gmail</a>`);
    if(c.drive_link)links.push(`<a href="${esc(c.drive_link)}" target="_blank" class="client-link" onclick="event.stopPropagation()">&#128193; Drive</a>`);
    return `<div class="client-row ${ex?'expanded':''}" data-client-id="${c.id}" data-type="${c.agreement_type}" draggable="true" ondragstart="onDragStart(event,${c.id})" ondragover="onDragOver(event)" ondrop="onDrop(event,${c.id})" ondragend="onDragEnd(event)" ondragleave="onDragLeave(event)">
      <div class="client-summary" onclick="toggleClient(${c.id})">
        <div class="client-info">
          <span class="drag-handle" onclick="event.stopPropagation()">&#9776;</span>
          <span class="chevron">&#9654;</span>
          <div class="client-logo">${c.logo_url?`<img src="${esc(c.logo_url)}" alt="">`:ini}</div>
          <div>
            <div class="client-name">${esc(c.name)}</div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:2px">
              ${c.notes?`<span class="client-notes-preview">${esc(c.notes)}</span>`:''}
              ${links.join(' ')}
            </div>
          </div>
        </div>
        <div><span class="badge badge-${c.agreement_type}">${c.agreement_type==='recurring'?'Recurring':'Ad Hoc'}</span></div>
        <div class="project-count">${c.projects.length} project${c.projects.length!==1?'s':''}</div>
        <div><span class="outstanding-pill ${pill}">${pillT}</span>${s.overdueTasks>0?`<span class="overdue-count">&#9888; ${s.overdueTasks} overdue</span>`:''}</div>
        <div style="font-size:12px;color:var(--text-secondary)">${s.completedTasks}/${s.totalTasks} done</div>
        <div class="client-actions" onclick="event.stopPropagation()">
          <button class="btn-icon" onclick="showClientHistory(${c.id},'${esc(c.name)}')" title="History">&#128337;</button>
          <button class="btn-icon" onclick="editClient(${c.id})" title="Edit">&#9998;</button>
          <button class="btn-icon" onclick="archiveClient(${c.id})" title="Archive" style="color:var(--warning)">&#128230;</button>
        </div>
      </div>
      <div class="client-expanded">
        <div class="client-detail-bar">
          <div><strong>Agreement:</strong> ${c.agreement_type==='recurring'?'Recurring':'Ad Hoc'}</div>
          ${c.notes?`<div><strong>Notes:</strong> ${esc(c.notes)}</div>`:''}
          ${links.length?`<div style="display:flex;gap:6px">${links.join('')}</div>`:'<div style="color:var(--text-muted);font-size:12px">No Gmail/Drive links — edit to add</div>'}
        </div>
        ${c.projects.map(p=>renderProject(p,c.id)).join('')}
        ${renderArchivedProjects(c)}
        <button class="btn btn-ghost btn-sm add-project-btn" onclick="openProjectModal(${c.id})">+ Add Project</button>
      </div>
    </div>`;
  }).join('');
}

function renderArchivedProjects(c) {
  if(!c.archivedProjects||!c.archivedProjects.length)return'';
  const show=showArchivedProjects.has(c.id);
  return `<div style="margin-left:16px;margin-top:8px">
    <button class="history-toggle" onclick="toggleArchivedProjects(${c.id})"><span style="font-size:10px">${show?'&#9660;':'&#9654;'}</span> &#128230; ${c.archivedProjects.length} archived</button>
    ${show?c.archivedProjects.map(p=>`<div class="archive-item" style="margin-left:16px;opacity:0.7"><div class="archive-item-info"><div class="archive-item-name">${esc(p.name)}</div></div><button class="btn-restore" onclick="restoreProject(${p.id})">Restore</button></div>`).join(''):''}
  </div>`;
}

function renderProject(p, cid) {
  const ex=expandedProjects.has(p.id);
  const active=p.tasks.filter(t=>t.progress!=='completed'&&t.progress!=='invoiced');
  const done=p.tasks.filter(t=>t.progress==='completed'||t.progress==='invoiced');
  const arch=p.archivedTasks||[];
  const showDone=showCompletedTasks.has(p.id), showArch=showArchivedTasks.has(p.id);
  return `<div class="project-section ${ex?'expanded':''}" data-project-id="${p.id}" data-status="${p.status}">
    <div class="project-header" onclick="toggleProject(${p.id})">
      <div class="project-title"><span class="chevron">&#9654;</span>${esc(p.name)}<span class="badge badge-${p.status}">${p.status}</span></div>
      <div class="project-meta" onclick="event.stopPropagation()">
        <span style="font-size:12px;color:var(--text-muted)">${active.length} active${done.length?`, ${done.length} done`:''}</span>
        <button class="btn-icon" onclick="editProject(${p.id},${cid})" title="Edit">&#9998;</button>
        <button class="btn-icon" onclick="archiveProject(${p.id})" title="Archive" style="color:var(--warning)">&#128230;</button>
      </div>
    </div>
    <div class="project-tasks">
      <div class="task-table">
        <div class="task-table-header-ext"><div>Task</div><div>Assignee</div><div>Deadline</div><div>Planned</div><div>Est Hrs</div><div>Progress</div><div>Refs / Created</div><div></div></div>
        ${active.map(t=>renderTask(t)).join('')}
        ${!active.length?'<div style="padding:12px 14px;color:var(--text-muted);font-size:13px">No active tasks</div>':''}
        <div class="add-task-row"><button class="add-task-btn" onclick="openTaskModal(${p.id})">+ Add task...</button></div>
      </div>
      ${done.length?`<div style="margin-top:6px"><button class="history-toggle" onclick="toggleCompletedTasks(${p.id})" style="margin-left:4px"><span style="font-size:10px">${showDone?'&#9660;':'&#9654;'}</span> &#9989; ${done.length} completed</button>${showDone?`<div class="task-table" style="opacity:0.7;margin-top:4px"><div class="task-table-header-ext"><div>Task</div><div>Assignee</div><div>Deadline</div><div>Planned</div><div>Est Hrs</div><div>Progress</div><div>Refs / Created</div><div></div></div>${done.map(t=>renderTask(t)).join('')}</div>`:''}</div>`:''}
      ${arch.length?`<div style="margin-top:4px"><button class="history-toggle" onclick="toggleArchivedTasks(${p.id})" style="margin-left:4px"><span style="font-size:10px">${showArch?'&#9660;':'&#9654;'}</span> &#128230; ${arch.length} archived</button>${showArch?`<div style="margin-top:4px;opacity:0.6">${arch.map(t=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 14px;border-bottom:1px solid var(--border-light);font-size:13px"><span>${esc(t.title)}</span><button class="btn-restore" onclick="restoreTask(${t.id})">Restore</button></div>`).join('')}</div>`:''}</div>`:''}
    </div>
  </div>`;
}

function renderTask(t) {
  const dc=getDeadlineClass(t.deadline,t.progress);
  const mem=teamMembers.find(m=>m.name===t.assignee);
  const cc=t.comments?t.comments.length:0;
  const sc=expandedComments.has(t.id);
  return `<div class="task-row-ext" data-task-id="${t.id}">
    <div class="task-title-cell"><span class="task-title" onclick="editTask(${t.id})">${esc(t.title)}</span>${cc?`<span class="comment-count" onclick="toggleComments(${t.id})">&#128172; ${cc}</span>`:''}</div>
    <div class="task-assignee">${mem?`<span class="assignee-dot" style="background:${mem.avatar_color}">${mem.name[0]}</span>`:''}${esc(t.assignee||'—')}</div>
    <div class="task-deadline ${dc}">${fmtDateShort(t.deadline)}</div>
    <div class="task-deadline">${fmtDateShort(t.planned_date)}</div>
    <div class="task-est">${t.estimated_hours?t.estimated_hours+'h':'—'}</div>
    <div><span class="progress-badge progress-${t.progress}"><span class="progress-dot"></span>${progressLabel(t.progress)}</span></div>
    <div><div class="task-refs" title="${esc(t.references_text||'')}">${esc(t.references_text||'')}</div><div class="task-created">${fmtDateShort(t.created_at?t.created_at.split(' ')[0]:'')} created</div></div>
    <div class="task-actions"><button class="btn-icon" onclick="toggleComments(${t.id})" title="Comments">&#128172;</button><button class="btn-icon" onclick="archiveTask(${t.id})" title="Archive" style="color:var(--warning)">&#128230;</button></div>
  </div>${sc?renderCommentThread(t):''}`;
}

function renderCommentThread(t) {
  const cs=t.comments||[];
  return `<div class="comment-thread">
    ${!cs.length?'<div style="font-size:12px;color:var(--text-muted);padding:4px 0">No comments yet</div>':''}
    ${cs.map(c=>{const m=teamMembers.find(x=>x.name===c.author);return`<div class="comment-item"><div class="comment-avatar" style="background:${m?m.avatar_color:'#94a3b8'}">${(c.author||'?')[0].toUpperCase()}</div><div class="comment-body"><span class="comment-author">${esc(c.author)}<span class="comment-time">${timeAgo(c.created_at)}</span></span><div class="comment-text">${esc(c.content)}</div></div></div>`;}).join('')}
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
  order.splice(fromIdx,1);
  order.splice(toIdx,0,draggedClientId);
  await api('/api/clients/reorder',{method:'PUT',body:{order}});
  await loadClients();
}

// ─── Archive ────────────────────────────────────────────
async function archiveClient(id){const c=clients.find(x=>x.id===id);if(!confirm(`Archive "${c?.name}"?`))return;await api(`/api/clients/${id}/archive`,{method:'PUT',body:{author:getCurrentUser()}});expandedClients.delete(id);await loadClients();}
async function archiveProject(id){if(!confirm('Archive this project?'))return;await api(`/api/projects/${id}/archive`,{method:'PUT',body:{author:getCurrentUser()}});expandedProjects.delete(id);await loadClients();}
async function archiveTask(id){await api(`/api/tasks/${id}/archive`,{method:'PUT',body:{author:getCurrentUser()}});await loadClients();}
async function restoreProject(id){await api(`/api/projects/${id}/archive`,{method:'PUT',body:{author:getCurrentUser()}});await loadClients();}
async function restoreTask(id){await api(`/api/tasks/${id}/archive`,{method:'PUT',body:{author:getCurrentUser()}});await loadClients();}
async function restoreClient(id){await api(`/api/clients/${id}/archive`,{method:'PUT',body:{author:getCurrentUser()}});await loadClients();await showArchiveModal();}
async function permanentDeleteClient(id){if(!confirm('Permanently delete? Cannot be undone.'))return;await api(`/api/clients/${id}`,{method:'DELETE',body:{author:getCurrentUser()}});await loadClients();await showArchiveModal();}

document.getElementById('viewArchiveBtn').addEventListener('click',showArchiveModal);
async function showArchiveModal(){
  const archived=await api('/api/archived/clients');
  document.getElementById('archiveContent').innerHTML=!archived.length?'<div style="padding:24px;text-align:center;color:var(--text-muted)">No archived items</div>':
    `<div class="archive-section-title">Archived Clients</div>${archived.map(c=>`<div class="archive-item"><div class="archive-item-info"><div class="archive-item-name">${esc(c.name)}</div><div class="archive-item-type">${c.agreement_type}</div></div><div style="display:flex;gap:6px"><button class="btn-restore" onclick="restoreClient(${c.id})">Restore</button><button class="btn-icon danger" onclick="permanentDeleteClient(${c.id})">&#128465;</button></div></div>`).join('')}`;
  openModal('archiveModal');
}

// ─── Client CRUD ────────────────────────────────────────
document.getElementById('addClientBtn').addEventListener('click',()=>{
  document.getElementById('clientModalTitle').textContent='New Client';
  ['clientId','clientName','clientNotes','clientGmail','clientDrive'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('clientType').value='recurring';
  document.getElementById('clientLogo').value='';
  openModal('clientModal');
});
function editClient(id){
  const c=clients.find(x=>x.id===id);if(!c)return;
  document.getElementById('clientModalTitle').textContent='Edit Client';
  document.getElementById('clientId').value=c.id;
  document.getElementById('clientName').value=c.name;
  document.getElementById('clientType').value=c.agreement_type;
  document.getElementById('clientNotes').value=c.notes||'';
  document.getElementById('clientGmail').value=c.gmail_link||'';
  document.getElementById('clientDrive').value=c.drive_link||'';
  document.getElementById('clientLogo').value='';
  openModal('clientModal');
}
document.getElementById('clientForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const id=document.getElementById('clientId').value;
  const data={name:document.getElementById('clientName').value,agreement_type:document.getElementById('clientType').value,notes:document.getElementById('clientNotes').value,gmail_link:document.getElementById('clientGmail').value,drive_link:document.getElementById('clientDrive').value,author:getCurrentUser()};
  let r;if(id){r=await api(`/api/clients/${id}`,{method:'PUT',body:data});}else{r=await api('/api/clients',{method:'POST',body:data});}
  const li=document.getElementById('clientLogo');
  if(li.files.length>0){const fd=new FormData();fd.append('logo',li.files[0]);await fetch(`/api/clients/${r.id}/logo`,{method:'POST',body:fd});}
  closeModal('clientModal');await loadClients();
});

// ─── Project CRUD ───────────────────────────────────────
function openProjectModal(cid){
  document.getElementById('projectModalTitle').textContent='New Project';
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
  document.getElementById('projectId').value=p.id;
  document.getElementById('projectClientId').value=cid;
  document.getElementById('projectName').value=p.name;
  document.getElementById('projectStatus').value=p.status;
  document.getElementById('projectNotes').value=p.notes||'';
  openModal('projectModal');
}
document.getElementById('projectForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const id=document.getElementById('projectId').value;
  const data={client_id:+document.getElementById('projectClientId').value,name:document.getElementById('projectName').value,status:document.getElementById('projectStatus').value,notes:document.getElementById('projectNotes').value,author:getCurrentUser()};
  if(id)await api(`/api/projects/${id}`,{method:'PUT',body:data});else await api('/api/projects',{method:'POST',body:data});
  closeModal('projectModal');await loadClients();
});

// ─── Task CRUD ──────────────────────────────────────────
function openTaskModal(pid){
  document.getElementById('taskModalTitle').textContent='New Task';
  ['taskId','taskTitle','taskDeadline','taskPlannedDate','taskEstHours','taskReferences','taskNotes'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('taskProjectId').value=pid;
  document.getElementById('taskProgress').value='not-started';
  populateAssigneeDropdown('');
  openModal('taskModal');
}
function editTask(id){
  let t=null;
  for(const c of clients)for(const p of c.projects){t=p.tasks.find(x=>x.id===id);if(t)break;if(t)break;}
  if(!t)return;
  document.getElementById('taskModalTitle').textContent='Edit Task';
  document.getElementById('taskId').value=t.id;
  document.getElementById('taskProjectId').value=t.project_id;
  document.getElementById('taskTitle').value=t.title;
  document.getElementById('taskDeadline').value=t.deadline||'';
  document.getElementById('taskPlannedDate').value=t.planned_date||'';
  document.getElementById('taskEstHours').value=t.estimated_hours||'';
  document.getElementById('taskProgress').value=t.progress;
  document.getElementById('taskReferences').value=t.references_text||'';
  document.getElementById('taskNotes').value=t.notes||'';
  populateAssigneeDropdown(t.assignee||'');
  openModal('taskModal');
}
function populateAssigneeDropdown(cur){
  document.getElementById('taskAssignee').innerHTML='<option value="">Unassigned</option>'+teamMembers.map(m=>`<option value="${esc(m.name)}" ${m.name===cur?'selected':''}>${esc(m.name)}</option>`).join('');
}
document.getElementById('taskForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const id=document.getElementById('taskId').value;
  const data={project_id:+document.getElementById('taskProjectId').value,title:document.getElementById('taskTitle').value,assignee:document.getElementById('taskAssignee').value,deadline:document.getElementById('taskDeadline').value,planned_date:document.getElementById('taskPlannedDate').value,estimated_hours:parseFloat(document.getElementById('taskEstHours').value)||0,progress:document.getElementById('taskProgress').value,references_text:document.getElementById('taskReferences').value,notes:document.getElementById('taskNotes').value,author:getCurrentUser()};
  if(id)await api(`/api/tasks/${id}`,{method:'PUT',body:data});else await api('/api/tasks',{method:'POST',body:data});
  closeModal('taskModal');await loadClients();
});

// ─── Comments ───────────────────────────────────────────
async function addComment(e,tid){e.preventDefault();const inp=e.target.querySelector('input');const c=inp.value.trim();if(!c)return;await api(`/api/tasks/${tid}/comments`,{method:'POST',body:{author:getCurrentUser(),content:c}});inp.value='';await loadClients();}

// ─── Client History ─────────────────────────────────────
async function showClientHistory(cid,name){
  document.getElementById('historyModalTitle').textContent='History — '+name;
  const logs=await api(`/api/clients/${cid}/history?limit=100`);
  document.getElementById('historyContent').innerHTML=!logs.length?'<div style="padding:12px;color:var(--text-muted)">No activity yet.</div>':
    logs.map(l=>`<div class="history-item"><div class="history-dot ${l.action}"></div><div class="history-content"><div><span class="history-author">${esc(l.author)}</span> <span class="history-action">${l.action}</span> <span class="history-entity-badge ${l.entity_type}">${l.entity_type}</span> <span class="history-time">${timeAgo(l.created_at)}</span></div>${l.details?`<div class="history-details">${esc(l.details)}</div>`:''}</div></div>`).join('');
  openModal('historyModal');
}

// ─── Team ───────────────────────────────────────────────
document.getElementById('manageTeamBtn').addEventListener('click',()=>{renderTeamList();openModal('teamModal');});
function renderTeamList(){
  const ct=document.getElementById('teamList');
  ct.innerHTML=!teamMembers.length?'<div class="empty-state"><p>No team members.</p></div>':
    teamMembers.map(m=>`<div class="team-member"><div class="team-member-info"><div class="team-avatar" style="background:${m.avatar_color}">${m.name[0].toUpperCase()}</div><div><div style="font-size:13px;font-weight:600">${esc(m.name)}</div>${m.role?`<div style="font-size:11px;color:var(--text-muted)">${esc(m.role)}</div>`:''}</div></div><button class="btn-icon danger" onclick="deleteTeamMember(${m.id})">&#128465;</button></div>`).join('');
}
document.getElementById('teamForm').addEventListener('submit',async e=>{
  e.preventDefault();const n=document.getElementById('teamMemberName').value.trim();if(!n)return;
  await api('/api/team',{method:'POST',body:{name:n,role:document.getElementById('teamMemberRole').value.trim(),avatar_color:document.getElementById('teamMemberColor').value}});
  document.getElementById('teamMemberName').value='';document.getElementById('teamMemberRole').value='';
  await loadTeam();renderTeamList();
});
async function deleteTeamMember(id){await api(`/api/team/${id}`,{method:'DELETE'});await loadTeam();renderTeamList();}

// ─── Filters ────────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');currentFilter=btn.dataset.filter;loadClients();
  });
});

// ─── Today View ─────────────────────────────────────────
async function loadTodayView(){
  const dateEl=document.getElementById('todayDate');
  if(!dateEl.value)dateEl.value=new Date().toISOString().split('T')[0];
  const date=dateEl.value;
  const person=document.getElementById('todayPerson').value;
  const params=new URLSearchParams({date});
  if(person)params.set('assignee',person);
  const tasks=await api(`/api/tasks/by-date?${params}`);
  const d=new Date(date+'T00:00:00');
  document.getElementById('todayTitle').textContent=d.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const ct=document.getElementById('todayContent');
  if(!tasks.length){ct.innerHTML='<div style="padding:32px;text-align:center;color:var(--text-muted)">No tasks planned for this date</div>';return;}
  // Group by assignee
  const groups={};
  for(const t of tasks){const a=t.assignee||'Unassigned';if(!groups[a])groups[a]=[];groups[a].push(t);}
  let html='';
  for(const [assignee,gTasks] of Object.entries(groups)){
    const mem=teamMembers.find(m=>m.name===assignee);
    const totalH=gTasks.reduce((s,t)=>s+(t.estimated_hours||0),0);
    html+=`<div class="today-group-header">${mem?`<span class="assignee-dot" style="background:${mem.avatar_color}">${mem.name[0]}</span>`:''}${esc(assignee)}<span class="today-total-hours">${totalH}h planned</span></div>`;
    html+=gTasks.map(t=>`<div class="today-task" onclick="editTask(${t.id})">
      <div><div class="today-task-title">${esc(t.title)}</div><div class="today-task-context">${esc(t.client_name)} → ${esc(t.project_name)}</div></div>
      <div class="task-deadline ${getDeadlineClass(t.deadline,t.progress)}">${fmtDateShort(t.deadline)}</div>
      <div class="task-est">${t.estimated_hours?t.estimated_hours+'h':'—'}</div>
      <div><span class="progress-badge progress-${t.progress}"><span class="progress-dot"></span>${progressLabel(t.progress)}</span></div>
      <div style="font-size:12px;color:var(--text-muted)">${esc(t.notes||'').substring(0,40)}</div>
    </div>`).join('');
  }
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
  const startDow=(firstDay.getDay()+6)%7; // Mon=0
  const startDate=new Date(firstDay);startDate.setDate(startDate.getDate()-startDow);
  const endDate=new Date(lastDay);const endDow=(lastDay.getDay()+6)%7;endDate.setDate(endDate.getDate()+(6-endDow));
  const fmt=d=>d.toISOString().split('T')[0];
  const person=document.getElementById('calendarPerson').value;
  const params=new URLSearchParams({start:fmt(startDate),end:fmt(endDate)});
  if(person)params.set('assignee',person);
  const tasks=await api(`/api/tasks/calendar?${params}`);
  const byDate={};
  const todayStr=new Date().toISOString().split('T')[0];
  for(const t of tasks){
    if(t.planned_date){if(!byDate[t.planned_date])byDate[t.planned_date]=[];byDate[t.planned_date].push({...t,type:'planned'});}
    if(t.deadline&&t.deadline!==t.planned_date){if(!byDate[t.deadline])byDate[t.deadline]=[];byDate[t.deadline].push({...t,type:'deadline'});}
  }
  let html='';
  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(d=>{html+=`<div class="calendar-day-header">${d}</div>`;});
  const cur=new Date(startDate);
  while(cur<=endDate){
    const ds=fmt(cur);
    const isOther=cur.getMonth()!==m;
    const isToday=ds===todayStr;
    const dayTasks=byDate[ds]||[];
    html+=`<div class="calendar-day ${isOther?'other-month':''} ${isToday?'today':''}">
      <div class="calendar-day-number">${cur.getDate()}</div>
      ${dayTasks.slice(0,4).map(t=>{
        const cls=t.type==='deadline'&&getDeadlineClass(t.deadline,t.progress)==='overdue'?'overdue':t.type;
        return`<div class="calendar-task ${cls}" onclick="editTask(${t.id})" title="${esc(t.title)} (${esc(t.client_name)})">${esc(t.title)}</div>`;
      }).join('')}
      ${dayTasks.length>4?`<div style="font-size:10px;color:var(--text-muted);padding:0 6px">+${dayTasks.length-4} more</div>`:''}
    </div>`;
    cur.setDate(cur.getDate()+1);
  }
  document.getElementById('calendarGrid').innerHTML=html;
}
document.getElementById('calendarPerson').addEventListener('change',loadCalendarView);

// ─── Init ───────────────────────────────────────────────
(async function(){await loadTeam();await loadClients();})();
