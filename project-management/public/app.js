// ─── State ──────────────────────────────────────────────
let clients = [];
let teamMembers = [];
let currentFilter = 'all';
let expandedClients = new Set();
let expandedProjects = new Set();
let expandedComments = new Set();
let showCompletedTasks = new Set();
let showArchivedProjects = new Set();
let showArchivedTasks = new Set();

// ─── Current User ───────────────────────────────────────
function getCurrentUser() {
  return document.getElementById('currentUser').value || 'System';
}

// ─── API Helpers ────────────────────────────────────────
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return res.json();
}

// ─── Data Loading ───────────────────────────────────────
async function loadClients() {
  const filterParam = currentFilter !== 'all' ? `?filter=${currentFilter}` : '';
  clients = await api(`/api/clients${filterParam}`);
  renderStats();
  renderClients();
}

async function loadTeam() {
  teamMembers = await api('/api/team');
  updateUserSelector();
}

function updateUserSelector() {
  const sel = document.getElementById('currentUser');
  const current = sel.value;
  sel.innerHTML = teamMembers.map(m =>
    `<option value="${escapeHtml(m.name)}" ${m.name === current ? 'selected' : ''}>${escapeHtml(m.name)}</option>`
  ).join('');
  if (!current && teamMembers.length) sel.value = teamMembers[0].name;
}

// ─── Stats Bar (clickable) ─────────────────────────────
function renderStats() {
  const totals = { clients: clients.length, outstanding: 0, inProgress: 0, overdue: 0, completed: 0, blocked: 0 };
  for (const c of clients) {
    totals.outstanding += c.stats.outstandingTasks;
    totals.inProgress += c.stats.inProgressTasks;
    totals.overdue += c.stats.overdueTasks;
    totals.completed += c.stats.completedTasks;
    totals.blocked += c.stats.blockedTasks;
  }

  document.getElementById('statsBar').innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${totals.clients}</div>
      <div class="stat-label">Active Clients</div>
    </div>
    <div class="stat-card warning clickable" onclick="showStatPopup('outstanding')">
      <div class="stat-value">${totals.outstanding}</div>
      <div class="stat-label">Outstanding Tasks</div>
    </div>
    <div class="stat-card blue clickable" onclick="showStatPopup('in-progress')">
      <div class="stat-value">${totals.inProgress}</div>
      <div class="stat-label">In Progress</div>
    </div>
    <div class="stat-card danger clickable" onclick="showStatPopup('overdue')">
      <div class="stat-value">${totals.overdue}</div>
      <div class="stat-label">Overdue</div>
    </div>
    <div class="stat-card success clickable" onclick="showStatPopup('completed')">
      <div class="stat-value">${totals.completed}</div>
      <div class="stat-label">Completed</div>
    </div>`;
}

// ─── Stats Popup ────────────────────────────────────────
function showStatPopup(type) {
  const titles = {
    'outstanding': 'Outstanding Tasks',
    'in-progress': 'In Progress Tasks',
    'overdue': 'Overdue Tasks',
    'completed': 'Completed Tasks',
    'blocked': 'Blocked Tasks'
  };
  document.getElementById('statsModalTitle').textContent = titles[type] || 'Tasks';

  const now = new Date().toISOString().split('T')[0];
  const matchingTasks = [];

  for (const client of clients) {
    for (const project of client.projects) {
      for (const task of project.tasks) {
        let match = false;
        if (type === 'outstanding' && task.progress !== 'completed') match = true;
        if (type === 'in-progress' && task.progress === 'in-progress') match = true;
        if (type === 'completed' && task.progress === 'completed') match = true;
        if (type === 'blocked' && task.progress === 'blocked') match = true;
        if (type === 'overdue' && task.deadline && task.deadline < now && task.progress !== 'completed') match = true;

        if (match) {
          matchingTasks.push({ task, project, client });
        }
      }
    }
  }

  const container = document.getElementById('statsModalContent');
  if (matchingTasks.length === 0) {
    container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted)">No tasks found</div>';
  } else {
    container.innerHTML = matchingTasks.map(({ task, project, client }) => {
      const member = teamMembers.find(m => m.name === task.assignee);
      const deadlineClass = getDeadlineClass(task.deadline, task.progress);
      const progressLabel = { 'not-started': 'Not Started', 'in-progress': 'In Progress', 'completed': 'Completed', 'blocked': 'Blocked' }[task.progress];

      return `
        <div class="popup-task-item" onclick="navigateToTask(${client.id}, ${project.id}, ${task.id})">
          <div class="popup-task-left">
            <div class="popup-task-title">${escapeHtml(task.title)}</div>
            <div class="popup-task-context">${escapeHtml(client.name)} &rarr; ${escapeHtml(project.name)}</div>
          </div>
          <div class="popup-task-right">
            ${task.assignee ? `<span class="task-assignee">${member ? `<span class="assignee-dot" style="background:${member.avatar_color}">${member.name[0]}</span>` : ''}${escapeHtml(task.assignee)}</span>` : ''}
            <span class="task-deadline ${deadlineClass}">${formatDeadline(task.deadline)}</span>
            <span class="progress-badge progress-${task.progress}"><span class="progress-dot"></span>${progressLabel}</span>
          </div>
        </div>`;
    }).join('');
  }

  openModal('statsModal');
}

function navigateToTask(clientId, projectId, taskId) {
  closeModal('statsModal');
  expandedClients.add(clientId);
  expandedProjects.add(projectId);
  renderClients();
  // Scroll to and flash the task
  setTimeout(() => {
    const el = document.querySelector(`[data-task-id="${taskId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.background = '#eef2ff';
      setTimeout(() => { el.style.background = ''; }, 2000);
    }
  }, 100);
}

// ─── Rendering ──────────────────────────────────────────
function renderClients() {
  const container = document.getElementById('clientList');

  if (clients.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No clients yet. Click <strong>+ New Client</strong> to get started.</p></div>`;
    return;
  }

  container.innerHTML = clients.map(client => {
    const isExpanded = expandedClients.has(client.id);
    const initials = client.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    const s = client.stats;

    let pillClass = 'all-done';
    let pillText = 'All done';
    if (s.overdueTasks > 0) { pillClass = 'has-overdue'; pillText = `${s.outstandingTasks} outstanding`; }
    else if (s.outstandingTasks > 0) { pillClass = 'has-tasks'; pillText = `${s.outstandingTasks} outstanding`; }

    // Links
    const links = [];
    if (client.gmail_link) links.push(`<a href="${escapeHtml(client.gmail_link)}" target="_blank" class="client-link" title="Open Gmail label" onclick="event.stopPropagation()">&#9993; Gmail</a>`);
    if (client.drive_link) links.push(`<a href="${escapeHtml(client.drive_link)}" target="_blank" class="client-link" title="Open Google Drive folder" onclick="event.stopPropagation()">&#128193; Drive</a>`);

    return `
      <div class="client-row ${isExpanded ? 'expanded' : ''}" data-client-id="${client.id}" data-type="${client.agreement_type}">
        <div class="client-summary" onclick="toggleClient(${client.id})">
          <div class="client-info">
            <span class="chevron">&#9654;</span>
            <div class="client-logo">
              ${client.logo_url ? `<img src="${escapeHtml(client.logo_url)}" alt="">` : initials}
            </div>
            <div>
              <div class="client-name">${escapeHtml(client.name)}</div>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:2px">
                ${client.notes ? `<span class="client-notes-preview">${escapeHtml(client.notes)}</span>` : ''}
                ${links.join(' ')}
              </div>
            </div>
          </div>
          <div>
            <span class="badge badge-${client.agreement_type}">${client.agreement_type === 'recurring' ? 'Recurring' : 'Ad Hoc'}</span>
          </div>
          <div class="project-count">${client.projects.length} project${client.projects.length !== 1 ? 's' : ''}</div>
          <div>
            <span class="outstanding-pill ${pillClass}">${pillText}</span>
            ${s.overdueTasks > 0 ? `<span class="overdue-count">&#9888; ${s.overdueTasks} overdue</span>` : ''}
          </div>
          <div style="font-size:12px;color:var(--text-secondary)">${s.completedTasks}/${s.totalTasks} done</div>
          <div class="client-actions" onclick="event.stopPropagation()">
            <button class="btn-icon" onclick="showClientHistory(${client.id}, '${escapeHtml(client.name)}')" title="History">&#128337;</button>
            <button class="btn-icon" onclick="editClient(${client.id})" title="Edit">&#9998;</button>
            <button class="btn-icon" onclick="archiveClient(${client.id})" title="Archive" style="color:var(--warning)">&#128230;</button>
          </div>
        </div>
        <div class="client-expanded">
          <div class="client-detail-bar">
            <div><strong>Agreement:</strong> ${client.agreement_type === 'recurring' ? 'Recurring' : 'One-off / Ad Hoc'}</div>
            ${client.notes ? `<div><strong>Notes:</strong> ${escapeHtml(client.notes)}</div>` : ''}
            ${links.length > 0 ? `<div style="display:flex;gap:6px">${links.join('')}</div>` : '<div style="color:var(--text-muted);font-size:12px">No Gmail or Drive links set — edit client to add them</div>'}
          </div>
          ${client.projects.map(project => renderProject(project, client.id)).join('')}
          ${renderArchivedProjects(client)}
          <button class="btn btn-ghost btn-sm add-project-btn" onclick="openProjectModal(${client.id})">+ Add Project</button>
        </div>
      </div>`;
  }).join('');
}

function renderArchivedProjects(client) {
  if (!client.archivedProjects || client.archivedProjects.length === 0) return '';
  const show = showArchivedProjects.has(client.id);
  return `
    <div style="margin-left:16px;margin-top:8px">
      <button class="history-toggle" onclick="toggleArchivedProjects(${client.id})">
        <span style="font-size:10px">${show ? '&#9660;' : '&#9654;'}</span>
        &#128230; ${client.archivedProjects.length} archived project${client.archivedProjects.length !== 1 ? 's' : ''}
      </button>
      ${show ? client.archivedProjects.map(p => `
        <div class="archive-item" style="margin-left:16px;opacity:0.7">
          <div class="archive-item-info">
            <div class="archive-item-name">${escapeHtml(p.name)}</div>
            <div class="archive-item-type">${p.tasks.length} tasks</div>
          </div>
          <button class="btn-restore" onclick="restoreProject(${p.id})">Restore</button>
        </div>`).join('') : ''}
    </div>`;
}

function renderProject(project, clientId) {
  const isExpanded = expandedProjects.has(project.id);
  const activeTasks = project.tasks.filter(t => t.progress !== 'completed');
  const completedTasks = project.tasks.filter(t => t.progress === 'completed');
  const archivedTasks = project.archivedTasks || [];
  const showCompleted = showCompletedTasks.has(project.id);
  const showArchived = showArchivedTasks.has(project.id);

  return `
    <div class="project-section ${isExpanded ? 'expanded' : ''}" data-project-id="${project.id}" data-status="${project.status}">
      <div class="project-header" onclick="toggleProject(${project.id})">
        <div class="project-title">
          <span class="chevron">&#9654;</span>
          ${escapeHtml(project.name)}
          <span class="badge badge-${project.status}">${project.status}</span>
        </div>
        <div class="project-meta" onclick="event.stopPropagation()">
          <span style="font-size:12px;color:var(--text-muted)">${activeTasks.length} active${completedTasks.length > 0 ? `, ${completedTasks.length} done` : ''}</span>
          <button class="btn-icon" onclick="editProject(${project.id}, ${clientId})" title="Edit">&#9998;</button>
          <button class="btn-icon" onclick="archiveProject(${project.id})" title="Archive" style="color:var(--warning)">&#128230;</button>
        </div>
      </div>
      <div class="project-tasks">
        <div class="task-table">
          <div class="task-table-header">
            <div>Task</div>
            <div>Assigned To</div>
            <div>Deadline</div>
            <div>Progress</div>
            <div>References</div>
            <div></div>
          </div>
          ${activeTasks.map(task => renderTask(task)).join('')}
          ${activeTasks.length === 0 ? '<div style="padding:12px 14px;color:var(--text-muted);font-size:13px">No active tasks</div>' : ''}
          <div class="add-task-row">
            <button class="add-task-btn" onclick="openTaskModal(${project.id})">+ Add task...</button>
          </div>
        </div>
        ${completedTasks.length > 0 ? `
          <div style="margin-top:6px">
            <button class="history-toggle" onclick="toggleCompletedTasks(${project.id})" style="margin-left:4px">
              <span style="font-size:10px">${showCompleted ? '&#9660;' : '&#9654;'}</span>
              &#9989; ${completedTasks.length} completed task${completedTasks.length !== 1 ? 's' : ''}
            </button>
            ${showCompleted ? `
              <div class="task-table" style="opacity:0.75;margin-top:4px">
                ${completedTasks.map(task => renderTask(task)).join('')}
              </div>
            ` : ''}
          </div>
        ` : ''}
        ${archivedTasks.length > 0 ? `
          <div style="margin-top:4px">
            <button class="history-toggle" onclick="toggleArchivedTasks(${project.id})" style="margin-left:4px">
              <span style="font-size:10px">${showArchived ? '&#9660;' : '&#9654;'}</span>
              &#128230; ${archivedTasks.length} archived task${archivedTasks.length !== 1 ? 's' : ''}
            </button>
            ${showArchived ? `
              <div style="margin-top:4px;opacity:0.6">
                ${archivedTasks.map(task => `
                  <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 14px;border-bottom:1px solid var(--border-light);font-size:13px">
                    <span>${escapeHtml(task.title)}</span>
                    <button class="btn-restore" onclick="restoreTask(${task.id})">Restore</button>
                  </div>`).join('')}
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
    </div>`;
}

function renderTask(task) {
  const deadlineClass = getDeadlineClass(task.deadline, task.progress);
  const member = teamMembers.find(m => m.name === task.assignee);
  const progressLabel = { 'not-started': 'Not Started', 'in-progress': 'In Progress', 'completed': 'Completed', 'blocked': 'Blocked' }[task.progress] || task.progress;
  const showComments = expandedComments.has(task.id);
  const commentCount = task.comments ? task.comments.length : 0;

  return `
    <div class="task-row" data-task-id="${task.id}">
      <div class="task-title-cell">
        <span class="task-title" onclick="editTask(${task.id})">${escapeHtml(task.title)}</span>
        ${commentCount > 0 ? `<span class="comment-count" onclick="toggleComments(${task.id})">&#128172; ${commentCount}</span>` : ''}
      </div>
      <div class="task-assignee">
        ${member ? `<span class="assignee-dot" style="background:${member.avatar_color}">${member.name[0]}</span>` : ''}
        ${escapeHtml(task.assignee || 'Unassigned')}
      </div>
      <div class="task-deadline ${deadlineClass}">${formatDeadline(task.deadline)}</div>
      <div>
        <span class="progress-badge progress-${task.progress}">
          <span class="progress-dot"></span>
          ${progressLabel}
        </span>
      </div>
      <div class="task-refs" title="${escapeHtml(task.references_text || '')}">${escapeHtml(task.references_text || '—')}</div>
      <div class="task-actions">
        <button class="btn-icon" onclick="toggleComments(${task.id})" title="Comments">&#128172;</button>
        <button class="btn-icon" onclick="archiveTask(${task.id})" title="Archive" style="color:var(--warning)">&#128230;</button>
      </div>
    </div>
    ${showComments ? renderCommentThread(task) : ''}`;
}

function renderCommentThread(task) {
  const comments = task.comments || [];
  return `
    <div class="comment-thread">
      ${comments.length === 0 ? '<div style="font-size:12px;color:var(--text-muted);padding:4px 0">No comments yet</div>' : ''}
      ${comments.map(c => {
        const member = teamMembers.find(m => m.name === c.author);
        const color = member ? member.avatar_color : '#94a3b8';
        return `
          <div class="comment-item">
            <div class="comment-avatar" style="background:${color}">${(c.author || '?')[0].toUpperCase()}</div>
            <div class="comment-body">
              <span class="comment-author">${escapeHtml(c.author)}<span class="comment-time">${timeAgo(c.created_at)}</span></span>
              <div class="comment-text">${escapeHtml(c.content)}</div>
            </div>
          </div>`;
      }).join('')}
      <form class="comment-form" onsubmit="addComment(event, ${task.id})">
        <input type="text" placeholder="Write a comment..." required>
        <button type="submit" class="btn btn-primary btn-sm">Post</button>
      </form>
    </div>`;
}

// ─── Helpers ────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDeadline(date) {
  if (!date) return '—';
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getDeadlineClass(deadline, progress) {
  if (!deadline || progress === 'completed') return '';
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(deadline + 'T00:00:00');
  const diff = (d - now) / (1000 * 60 * 60 * 24);
  if (diff < 0) return 'overdue';
  if (diff <= 3) return 'soon';
  return '';
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
  const diffMs = now - d;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ─── Toggle Expand/Collapse ─────────────────────────────
function toggleClient(id) {
  expandedClients.has(id) ? expandedClients.delete(id) : expandedClients.add(id);
  renderClients();
}

function toggleProject(id) {
  expandedProjects.has(id) ? expandedProjects.delete(id) : expandedProjects.add(id);
  renderClients();
}

function toggleComments(taskId) {
  expandedComments.has(taskId) ? expandedComments.delete(taskId) : expandedComments.add(taskId);
  renderClients();
}

function toggleCompletedTasks(projectId) {
  showCompletedTasks.has(projectId) ? showCompletedTasks.delete(projectId) : showCompletedTasks.add(projectId);
  renderClients();
}

function toggleArchivedProjects(clientId) {
  showArchivedProjects.has(clientId) ? showArchivedProjects.delete(clientId) : showArchivedProjects.add(clientId);
  renderClients();
}

function toggleArchivedTasks(projectId) {
  showArchivedTasks.has(projectId) ? showArchivedTasks.delete(projectId) : showArchivedTasks.add(projectId);
  renderClients();
}

// ─── Modal Management ───────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('active');
  document.getElementById('modalBackdrop').classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  document.getElementById('modalBackdrop').classList.remove('active');
}

document.getElementById('modalBackdrop').addEventListener('click', () => {
  document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
  document.getElementById('modalBackdrop').classList.remove('active');
});

// ─── Archive Functions ──────────────────────────────────
async function archiveClient(id) {
  const client = clients.find(c => c.id === id);
  if (!confirm(`Archive "${client?.name}"? It can be restored later.`)) return;
  await api(`/api/clients/${id}/archive`, { method: 'PUT', body: { author: getCurrentUser() } });
  expandedClients.delete(id);
  await loadClients();
}

async function archiveProject(id) {
  if (!confirm('Archive this project? It can be restored later.')) return;
  await api(`/api/projects/${id}/archive`, { method: 'PUT', body: { author: getCurrentUser() } });
  expandedProjects.delete(id);
  await loadClients();
}

async function archiveTask(id) {
  await api(`/api/tasks/${id}/archive`, { method: 'PUT', body: { author: getCurrentUser() } });
  await loadClients();
}

async function restoreProject(id) {
  await api(`/api/projects/${id}/archive`, { method: 'PUT', body: { author: getCurrentUser() } });
  await loadClients();
}

async function restoreTask(id) {
  await api(`/api/tasks/${id}/archive`, { method: 'PUT', body: { author: getCurrentUser() } });
  await loadClients();
}

async function restoreClient(id) {
  await api(`/api/clients/${id}/archive`, { method: 'PUT', body: { author: getCurrentUser() } });
  await loadClients();
  await showArchiveModal();
}

// ─── Archive Modal ──────────────────────────────────────
document.getElementById('viewArchiveBtn').addEventListener('click', showArchiveModal);

async function showArchiveModal() {
  const archived = await api('/api/archived/clients');
  const container = document.getElementById('archiveContent');

  if (archived.length === 0) {
    container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted)">No archived items</div>';
  } else {
    container.innerHTML = `
      <div class="archive-section-title">Archived Clients</div>
      ${archived.map(c => `
        <div class="archive-item">
          <div class="archive-item-info">
            <div class="archive-item-name">${escapeHtml(c.name)}</div>
            <div class="archive-item-type">${c.agreement_type === 'recurring' ? 'Recurring' : 'Ad Hoc'}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn-restore" onclick="restoreClient(${c.id})">Restore</button>
            <button class="btn-icon danger" onclick="permanentDeleteClient(${c.id})" title="Permanently delete">&#128465;</button>
          </div>
        </div>`).join('')}`;
  }
  openModal('archiveModal');
}

async function permanentDeleteClient(id) {
  if (!confirm('Permanently delete this client? This cannot be undone.')) return;
  await api(`/api/clients/${id}`, { method: 'DELETE', body: { author: getCurrentUser() } });
  await loadClients();
  await showArchiveModal();
}

// ─── Client CRUD ────────────────────────────────────────
document.getElementById('addClientBtn').addEventListener('click', () => {
  document.getElementById('clientModalTitle').textContent = 'New Client';
  document.getElementById('clientId').value = '';
  document.getElementById('clientName').value = '';
  document.getElementById('clientType').value = 'recurring';
  document.getElementById('clientNotes').value = '';
  document.getElementById('clientGmail').value = '';
  document.getElementById('clientDrive').value = '';
  document.getElementById('clientLogo').value = '';
  openModal('clientModal');
});

function editClient(id) {
  const client = clients.find(c => c.id === id);
  if (!client) return;
  document.getElementById('clientModalTitle').textContent = 'Edit Client';
  document.getElementById('clientId').value = client.id;
  document.getElementById('clientName').value = client.name;
  document.getElementById('clientType').value = client.agreement_type;
  document.getElementById('clientNotes').value = client.notes || '';
  document.getElementById('clientGmail').value = client.gmail_link || '';
  document.getElementById('clientDrive').value = client.drive_link || '';
  document.getElementById('clientLogo').value = '';
  openModal('clientModal');
}

document.getElementById('clientForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('clientId').value;
  const data = {
    name: document.getElementById('clientName').value,
    agreement_type: document.getElementById('clientType').value,
    notes: document.getElementById('clientNotes').value,
    gmail_link: document.getElementById('clientGmail').value,
    drive_link: document.getElementById('clientDrive').value,
    author: getCurrentUser(),
  };

  let clientResult;
  if (id) {
    clientResult = await api(`/api/clients/${id}`, { method: 'PUT', body: data });
  } else {
    clientResult = await api('/api/clients', { method: 'POST', body: data });
  }

  const logoInput = document.getElementById('clientLogo');
  if (logoInput.files.length > 0) {
    const formData = new FormData();
    formData.append('logo', logoInput.files[0]);
    await fetch(`/api/clients/${clientResult.id}/logo`, { method: 'POST', body: formData });
  }

  closeModal('clientModal');
  await loadClients();
});

// ─── Project CRUD ───────────────────────────────────────
function openProjectModal(clientId) {
  document.getElementById('projectModalTitle').textContent = 'New Project';
  document.getElementById('projectId').value = '';
  document.getElementById('projectClientId').value = clientId;
  document.getElementById('projectName').value = '';
  document.getElementById('projectStatus').value = 'active';
  document.getElementById('projectNotes').value = '';
  openModal('projectModal');
}

function editProject(projectId, clientId) {
  const client = clients.find(c => c.id === clientId);
  const project = client?.projects.find(p => p.id === projectId);
  if (!project) return;
  document.getElementById('projectModalTitle').textContent = 'Edit Project';
  document.getElementById('projectId').value = project.id;
  document.getElementById('projectClientId').value = clientId;
  document.getElementById('projectName').value = project.name;
  document.getElementById('projectStatus').value = project.status;
  document.getElementById('projectNotes').value = project.notes || '';
  openModal('projectModal');
}

document.getElementById('projectForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('projectId').value;
  const data = {
    client_id: parseInt(document.getElementById('projectClientId').value),
    name: document.getElementById('projectName').value,
    status: document.getElementById('projectStatus').value,
    notes: document.getElementById('projectNotes').value,
    author: getCurrentUser(),
  };

  if (id) {
    await api(`/api/projects/${id}`, { method: 'PUT', body: data });
  } else {
    await api('/api/projects', { method: 'POST', body: data });
  }

  closeModal('projectModal');
  await loadClients();
});

// ─── Task CRUD ──────────────────────────────────────────
function openTaskModal(projectId) {
  document.getElementById('taskModalTitle').textContent = 'New Task';
  document.getElementById('taskId').value = '';
  document.getElementById('taskProjectId').value = projectId;
  document.getElementById('taskTitle').value = '';
  document.getElementById('taskDeadline').value = '';
  document.getElementById('taskProgress').value = 'not-started';
  document.getElementById('taskReferences').value = '';
  document.getElementById('taskNotes').value = '';
  populateAssigneeDropdown('');
  openModal('taskModal');
}

function editTask(id) {
  let task = null;
  for (const client of clients) {
    for (const project of client.projects) {
      task = project.tasks.find(t => t.id === id);
      if (task) break;
    }
    if (task) break;
  }
  if (!task) return;

  document.getElementById('taskModalTitle').textContent = 'Edit Task';
  document.getElementById('taskId').value = task.id;
  document.getElementById('taskProjectId').value = task.project_id;
  document.getElementById('taskTitle').value = task.title;
  document.getElementById('taskDeadline').value = task.deadline || '';
  document.getElementById('taskProgress').value = task.progress;
  document.getElementById('taskReferences').value = task.references_text || '';
  document.getElementById('taskNotes').value = task.notes || '';
  populateAssigneeDropdown(task.assignee || '');
  openModal('taskModal');
}

function populateAssigneeDropdown(currentValue) {
  const select = document.getElementById('taskAssignee');
  select.innerHTML = '<option value="">Unassigned</option>' +
    teamMembers.map(m => `<option value="${escapeHtml(m.name)}" ${m.name === currentValue ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('');
}

document.getElementById('taskForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('taskId').value;
  const data = {
    project_id: parseInt(document.getElementById('taskProjectId').value),
    title: document.getElementById('taskTitle').value,
    assignee: document.getElementById('taskAssignee').value,
    deadline: document.getElementById('taskDeadline').value,
    progress: document.getElementById('taskProgress').value,
    references_text: document.getElementById('taskReferences').value,
    notes: document.getElementById('taskNotes').value,
    author: getCurrentUser(),
  };

  if (id) {
    await api(`/api/tasks/${id}`, { method: 'PUT', body: data });
  } else {
    await api('/api/tasks', { method: 'POST', body: data });
  }

  closeModal('taskModal');
  await loadClients();
});

// ─── Comments ───────────────────────────────────────────
async function addComment(e, taskId) {
  e.preventDefault();
  const input = e.target.querySelector('input');
  const content = input.value.trim();
  if (!content) return;

  await api(`/api/tasks/${taskId}/comments`, {
    method: 'POST',
    body: { author: getCurrentUser(), content }
  });

  input.value = '';
  await loadClients();
}

// ─── Client-Level History ───────────────────────────────
async function showClientHistory(clientId, clientName) {
  document.getElementById('historyModalTitle').textContent = `History — ${clientName}`;
  const logs = await api(`/api/clients/${clientId}/history?limit=100`);

  const container = document.getElementById('historyContent');
  if (logs.length === 0) {
    container.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:13px">No activity recorded yet.</div>';
  } else {
    container.innerHTML = logs.map(log => `
      <div class="history-item">
        <div class="history-dot ${log.action}"></div>
        <div class="history-content">
          <div>
            <span class="history-author">${escapeHtml(log.author)}</span>
            <span class="history-action">${log.action}</span>
            <span class="history-entity-badge ${log.entity_type}">${log.entity_type}</span>
            <span class="history-time">${timeAgo(log.created_at)}</span>
          </div>
          ${log.details ? `<div class="history-details">${escapeHtml(log.details)}</div>` : ''}
        </div>
      </div>`).join('');
  }
  openModal('historyModal');
}

// ─── Team Management ────────────────────────────────────
document.getElementById('manageTeamBtn').addEventListener('click', () => {
  renderTeamList();
  openModal('teamModal');
});

function renderTeamList() {
  const container = document.getElementById('teamList');
  if (teamMembers.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No team members yet.</p></div>';
    return;
  }
  container.innerHTML = teamMembers.map(m => `
    <div class="team-member">
      <div class="team-member-info">
        <div class="team-avatar" style="background:${m.avatar_color}">${m.name[0].toUpperCase()}</div>
        <div>
          <div style="font-size:13px;font-weight:600">${escapeHtml(m.name)}</div>
          ${m.role ? `<div style="font-size:11px;color:var(--text-muted)">${escapeHtml(m.role)}</div>` : ''}
        </div>
      </div>
      <button class="btn-icon danger" onclick="deleteTeamMember(${m.id})">&#128465;</button>
    </div>`).join('');
}

document.getElementById('teamForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('teamMemberName').value.trim();
  if (!name) return;
  await api('/api/team', {
    method: 'POST',
    body: {
      name,
      role: document.getElementById('teamMemberRole').value.trim(),
      avatar_color: document.getElementById('teamMemberColor').value,
    }
  });
  document.getElementById('teamMemberName').value = '';
  document.getElementById('teamMemberRole').value = '';
  await loadTeam();
  renderTeamList();
});

async function deleteTeamMember(id) {
  await api(`/api/team/${id}`, { method: 'DELETE' });
  await loadTeam();
  renderTeamList();
}

// ─── Filter Buttons ─────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    loadClients();
  });
});

// ─── Keyboard ───────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
    document.getElementById('modalBackdrop').classList.remove('active');
  }
});

// ─── Init ───────────────────────────────────────────────
(async function init() {
  await loadTeam();
  await loadClients();
})();
