// ─── State ──────────────────────────────────────────────
let clients = [];
let teamMembers = [];
let currentFilter = 'all';
let expandedClients = new Set();
let expandedProjects = new Set();

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
  renderClients();
}

async function loadTeam() {
  teamMembers = await api('/api/team');
}

// ─── Rendering ──────────────────────────────────────────
function renderClients() {
  const container = document.getElementById('clientList');

  if (clients.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No clients yet. Click <strong>+ New Client</strong> to get started.</p>
      </div>`;
    return;
  }

  container.innerHTML = clients.map(client => {
    const isExpanded = expandedClients.has(client.id);
    const totalTasks = client.projects.reduce((sum, p) => sum + p.tasks.length, 0);
    const completedTasks = client.projects.reduce((sum, p) => sum + p.tasks.filter(t => t.progress === 'completed').length, 0);
    const initials = client.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

    return `
      <div class="client-row ${isExpanded ? 'expanded' : ''}" data-client-id="${client.id}">
        <div class="client-summary" onclick="toggleClient(${client.id})">
          <div class="client-info">
            <span class="chevron">&#9654;</span>
            <div class="client-logo">
              ${client.logo_url ? `<img src="${escapeHtml(client.logo_url)}" alt="">` : initials}
            </div>
            <div>
              <div class="client-name">${escapeHtml(client.name)}</div>
              ${client.notes ? `<div class="client-notes-preview">${escapeHtml(client.notes)}</div>` : ''}
            </div>
          </div>
          <div>
            <span class="badge badge-${client.agreement_type}">${client.agreement_type === 'recurring' ? 'Recurring' : 'Ad Hoc'}</span>
          </div>
          <div class="project-count">${client.projects.length} project${client.projects.length !== 1 ? 's' : ''}</div>
          <div class="status-summary">${completedTasks}/${totalTasks} tasks</div>
          <div class="client-actions" onclick="event.stopPropagation()">
            <button class="btn-icon" onclick="editClient(${client.id})" title="Edit client">&#9998;</button>
            <button class="btn-icon danger" onclick="deleteClient(${client.id})" title="Delete client">&#128465;</button>
          </div>
        </div>
        <div class="client-expanded">
          ${client.notes ? `
            <div class="client-detail-bar">
              <div><strong>Agreement:</strong> ${client.agreement_type === 'recurring' ? 'Recurring' : 'One-off / Ad Hoc'}</div>
              <div><strong>Notes:</strong> ${escapeHtml(client.notes)}</div>
            </div>
          ` : ''}
          ${client.projects.map(project => renderProject(project, client.id)).join('')}
          <button class="btn btn-ghost btn-sm add-project-btn" onclick="openProjectModal(${client.id})">+ Add Project</button>
        </div>
      </div>`;
  }).join('');
}

function renderProject(project, clientId) {
  const isExpanded = expandedProjects.has(project.id);
  const completedCount = project.tasks.filter(t => t.progress === 'completed').length;
  const statusClass = project.status;

  return `
    <div class="project-section ${isExpanded ? 'expanded' : ''}" data-project-id="${project.id}">
      <div class="project-header" onclick="toggleProject(${project.id})">
        <div class="project-title">
          <span class="chevron">&#9654;</span>
          ${escapeHtml(project.name)}
          <span class="badge badge-${statusClass}">${project.status}</span>
        </div>
        <div class="project-meta" onclick="event.stopPropagation()">
          <span style="font-size:12px;color:var(--text-muted)">${completedCount}/${project.tasks.length} tasks</span>
          <button class="btn-icon" onclick="editProject(${project.id}, ${clientId})" title="Edit project">&#9998;</button>
          <button class="btn-icon danger" onclick="deleteProject(${project.id})" title="Delete project">&#128465;</button>
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
          ${project.tasks.map(task => renderTask(task)).join('')}
          <div class="add-task-row">
            <button class="add-task-btn" onclick="openTaskModal(${project.id})">+ Add task...</button>
          </div>
        </div>
      </div>
    </div>`;
}

function renderTask(task) {
  const deadlineClass = getDeadlineClass(task.deadline, task.progress);
  const assignee = teamMembers.find(m => m.name === task.assignee);
  const progressLabel = {
    'not-started': 'Not Started',
    'in-progress': 'In Progress',
    'completed': 'Completed',
    'blocked': 'Blocked'
  }[task.progress] || task.progress;

  return `
    <div class="task-row" data-task-id="${task.id}">
      <div class="task-title" onclick="editTask(${task.id})">${escapeHtml(task.title)}</div>
      <div class="task-assignee">
        ${assignee ? `<span class="assignee-dot" style="background:${assignee.avatar_color}"></span>` : ''}
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
      <div>
        <button class="btn-icon danger" onclick="deleteTask(${task.id})" title="Delete task">&#128465;</button>
      </div>
    </div>`;
}

// ─── Helpers ────────────────────────────────────────────
function escapeHtml(str) {
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

// ─── Toggle Expand/Collapse ─────────────────────────────
function toggleClient(id) {
  if (expandedClients.has(id)) {
    expandedClients.delete(id);
  } else {
    expandedClients.add(id);
  }
  renderClients();
}

function toggleProject(id) {
  if (expandedProjects.has(id)) {
    expandedProjects.delete(id);
  } else {
    expandedProjects.add(id);
  }
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

// Close modal on backdrop click
document.getElementById('modalBackdrop').addEventListener('click', () => {
  document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
  document.getElementById('modalBackdrop').classList.remove('active');
});

// ─── Client CRUD ────────────────────────────────────────
document.getElementById('addClientBtn').addEventListener('click', () => {
  document.getElementById('clientModalTitle').textContent = 'New Client';
  document.getElementById('clientId').value = '';
  document.getElementById('clientName').value = '';
  document.getElementById('clientType').value = 'recurring';
  document.getElementById('clientNotes').value = '';
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
  };

  let clientResult;
  if (id) {
    clientResult = await api(`/api/clients/${id}`, { method: 'PUT', body: data });
  } else {
    clientResult = await api('/api/clients', { method: 'POST', body: data });
  }

  // Upload logo if provided
  const logoInput = document.getElementById('clientLogo');
  if (logoInput.files.length > 0) {
    const formData = new FormData();
    formData.append('logo', logoInput.files[0]);
    await fetch(`/api/clients/${clientResult.id}/logo`, { method: 'POST', body: formData });
  }

  closeModal('clientModal');
  await loadClients();
});

async function deleteClient(id) {
  const client = clients.find(c => c.id === id);
  if (!confirm(`Delete "${client?.name}" and all its projects/tasks?`)) return;
  await api(`/api/clients/${id}`, { method: 'DELETE' });
  expandedClients.delete(id);
  await loadClients();
}

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
  };

  if (id) {
    await api(`/api/projects/${id}`, { method: 'PUT', body: data });
  } else {
    await api('/api/projects', { method: 'POST', body: data });
  }

  closeModal('projectModal');
  await loadClients();
});

async function deleteProject(id) {
  if (!confirm('Delete this project and all its tasks?')) return;
  await api(`/api/projects/${id}`, { method: 'DELETE' });
  expandedProjects.delete(id);
  await loadClients();
}

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
  };

  if (id) {
    await api(`/api/tasks/${id}`, { method: 'PUT', body: data });
  } else {
    await api('/api/tasks', { method: 'POST', body: data });
  }

  closeModal('taskModal');
  await loadClients();
});

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  await api(`/api/tasks/${id}`, { method: 'DELETE' });
  await loadClients();
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
          <div style="font-size:13px;font-weight:500">${escapeHtml(m.name)}</div>
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

// ─── Keyboard Shortcut ──────────────────────────────────
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
