import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { google } from 'googleapis';
import db from '../database.js';
import { requireAuth, requireWrite, aiMediaUpload } from '../middleware.js';
import { logActivity } from '../lib/activity.js';
import { statusToProgress, bandToPriority, isValidStatus, isValidBand, isValidType } from '../lib/taskmap.js';
import { gmailClientForUser } from './gmail.js';

const router = Router();

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const TOOLS = [
  {
    name: 'list_clients',
    description: 'List all active clients. Returns id, name, code, agreement type. Use this to find a client when creating tasks.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'list_team_members',
    description: 'List all team member names to use as valid values for assignee / secondary_assignee.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'create_task',
    description: 'Create a new task for a client. Use YYYY-MM-DD for dates. status defaults to "inbox". band is when it needs doing (today/this-week/scheduled/waiting/someday). task_type categorises it.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'integer', description: 'Client ID — use list_clients to find it' },
        title: { type: 'string' },
        assignee: { type: 'string', description: 'Display name of team member — use list_team_members first' },
        secondary_assignee: { type: 'string', description: 'Optional second assignee' },
        deadline: { type: 'string', description: 'YYYY-MM-DD' },
        planned_date: { type: 'string', description: 'YYYY-MM-DD — day you plan to work on it' },
        estimated_hours: { type: 'number' },
        status: { type: 'string', enum: ['inbox', 'scheduled', 'in-progress', 'waiting-on-client', 'waiting-on-me', 'done', 'cancelled'], description: 'Defaults to inbox' },
        band: { type: 'string', enum: ['today', 'this-week', 'scheduled', 'waiting', 'someday'], description: 'When it needs doing' },
        task_type: { type: 'string', enum: ['recurring', 'ad-hoc', 'urgent', 'sales', 'admin', 'waiting', 'idea'] },
        notes: { type: 'string' },
        references_text: { type: 'string', description: 'URLs or reference info' }
      },
      required: ['client_id', 'title']
    }
  },
  {
    name: 'create_tasks',
    description: 'Create MANY tasks in one call. Always use this instead of repeated create_task calls when the user gives a list — a pasted email, bullet points, meeting notes, or several tasks in one message. Each item takes the same fields as create_task. Duplicates of existing open tasks (same client, same title) are skipped and reported back.',
    input_schema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              client_id: { type: 'integer', description: 'Client ID — use list_clients to find it' },
              title: { type: 'string' },
              assignee: { type: 'string' },
              secondary_assignee: { type: 'string' },
              deadline: { type: 'string', description: 'YYYY-MM-DD' },
              planned_date: { type: 'string', description: 'YYYY-MM-DD' },
              estimated_hours: { type: 'number' },
              status: { type: 'string', enum: ['inbox', 'scheduled', 'in-progress', 'waiting-on-client', 'waiting-on-me', 'done', 'cancelled'] },
              band: { type: 'string', enum: ['today', 'this-week', 'scheduled', 'waiting', 'someday'] },
              task_type: { type: 'string', enum: ['recurring', 'ad-hoc', 'urgent', 'sales', 'admin', 'waiting', 'idea'] },
              notes: { type: 'string' },
              references_text: { type: 'string' }
            },
            required: ['client_id', 'title']
          }
        }
      },
      required: ['tasks']
    }
  },
  {
    name: 'update_task',
    description: 'Update fields on an existing task. Only pass fields you want to change. Setting status to "done" completes it (and spawns the next occurrence if recurring).',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'integer' },
        title: { type: 'string' },
        assignee: { type: 'string' },
        secondary_assignee: { type: 'string' },
        deadline: { type: 'string' },
        planned_date: { type: 'string' },
        estimated_hours: { type: 'number' },
        band: { type: 'string', enum: ['today', 'this-week', 'scheduled', 'waiting', 'someday'] },
        status: { type: 'string', enum: ['inbox', 'scheduled', 'in-progress', 'waiting-on-client', 'waiting-on-me', 'done', 'cancelled'] },
        task_type: { type: 'string', enum: ['recurring', 'ad-hoc', 'urgent', 'sales', 'admin', 'waiting', 'idea'] },
        notes: { type: 'string' }
      },
      required: ['task_id']
    }
  },
  {
    name: 'search_tasks',
    description: 'Search tasks by a text query against title/notes/assignee. Returns up to 20 matches with ids, titles, and client context.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_workload_summary',
    description: 'Get a summary of the current workload: hours planned today, tomorrow, this week, next week, overdue counts, plus per-person breakdown.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'list_recent_emails',
    description: 'List the user\'s recent Gmail messages (metadata + snippet only). Use when asked to check the inbox, e.g. to compare emails against console tasks and find what\'s missing. Requires Gmail to be connected in the Email tab.',
    input_schema: {
      type: 'object',
      properties: {
        max: { type: 'integer', description: 'How many messages (default 20, max 40)' },
        query: { type: 'string', description: 'Optional Gmail search query, e.g. "newer_than:14d -category:promotions"' }
      }
    }
  },
  {
    name: 'read_email_thread',
    description: 'Read the full text of one Gmail thread by thread_id (from list_recent_emails). Use to pull task details out of a specific email.',
    input_schema: {
      type: 'object',
      properties: {
        thread_id: { type: 'string' }
      },
      required: ['thread_id']
    }
  },
  {
    name: 'get_activity_patterns',
    description: 'Compute behavioural patterns from the task data and activity log: tasks repeatedly pushed, stale inbox items, clients gone quiet, overdue clusters, long-waiting chases, overdue recurring tasks, and the completion-by-weekday rhythm. Use when asked what you notice, for suggestions, or proactively when a weekly-review type question comes up. Interpret the signals — do not just recite them.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'list_tasks_for_user',
    description: 'List all active (not completed/invoiced) tasks assigned to a given person. Use to review someone\'s workload.',
    input_schema: {
      type: 'object',
      properties: {
        assignee: { type: 'string', description: 'Display name' }
      },
      required: ['assignee']
    }
  }
];

const normTitle = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Shared by create_task and create_tasks. Throws on bad client / permission.
function createOneTask(input, user, isOwner) {
  const cl = db.prepare('SELECT is_private FROM clients WHERE id = ?').get(input.client_id);
  if (!cl) throw new Error(`Client ${input.client_id} not found`);
  if (cl.is_private && !isOwner) throw new Error('Access denied');
  let proj = db.prepare('SELECT id FROM projects WHERE client_id = ? ORDER BY id LIMIT 1').get(input.client_id);
  if (!proj) {
    const pr = db.prepare('INSERT INTO projects (client_id, name, status) VALUES (?, ?, ?)').run(input.client_id, 'General', 'active');
    proj = { id: pr.lastInsertRowid };
  }
  const status = isValidStatus(input.status) ? input.status : 'inbox';
  const band = isValidBand(input.band) ? input.band : '';
  const ttype = isValidType(input.task_type) ? input.task_type : 'ad-hoc';
  const progress = statusToProgress(status);
  const priorityShadow = band ? bandToPriority(band) : 'medium';
  const r = db.prepare(
    'INSERT INTO tasks (project_id, client_id, title, assignee, secondary_assignee, deadline, planned_date, estimated_hours, progress, priority, task_status, task_band, task_type, references_text, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    proj.id, input.client_id, input.title,
    input.assignee || '', input.secondary_assignee || '',
    input.deadline || '', input.planned_date || '',
    input.estimated_hours || 0, progress, priorityShadow,
    status, band, ttype,
    input.references_text || '', input.notes || ''
  );
  logActivity('task', r.lastInsertRowid, 'created', user.display_name, `Created task "${input.title}" (via AI assistant)`);
  return { task_id: r.lastInsertRowid, ref: 'NB' + String(r.lastInsertRowid).padStart(3, '0'), title: input.title };
}

export async function executeTool(name, input, user) {
  const isOwner = user.role === 'owner';
  const canWrite = user.role === 'owner' || user.role === 'editor';
  const priv = isOwner ? '' : 'AND c.is_private = 0';

  try {
    switch (name) {
      case 'list_clients': {
        const rows = db.prepare(`SELECT id, name, code, agreement_type FROM clients c WHERE archived=0 ${priv} ORDER BY name`).all();
        return { clients: rows };
      }

      case 'list_team_members': {
        const team = db.prepare('SELECT name, role FROM team_members ORDER BY name').all();
        const users = db.prepare("SELECT display_name as name, role FROM users WHERE status='active'").all();
        const byName = {};
        for (const t of team) byName[t.name] = t;
        for (const u of users) if (!byName[u.name]) byName[u.name] = u;
        return { members: Object.values(byName) };
      }

      case 'create_task': {
        if (!canWrite) return { error: 'No write permission' };
        const created = createOneTask(input, user, isOwner);
        return { success: true, ...created };
      }

      case 'create_tasks': {
        if (!canWrite) return { error: 'No write permission' };
        if (!Array.isArray(input.tasks) || !input.tasks.length) return { error: 'tasks array required' };
        if (input.tasks.length > 100) return { error: 'Too many tasks in one call (max 100)' };
        const created = [], skipped_duplicates = [], errors = [];
        db.transaction(() => {
          for (const t of input.tasks) {
            try {
              if (!t.title || !t.client_id) { errors.push({ title: t.title || '(untitled)', error: 'client_id and title required' }); continue; }
              const dupe = db.prepare(
                "SELECT id, title FROM tasks WHERE client_id = ? AND archived = 0 AND task_status NOT IN ('done','cancelled')"
              ).all(t.client_id).find(row => normTitle(row.title) === normTitle(t.title));
              if (dupe) { skipped_duplicates.push({ title: t.title, existing_ref: 'NB' + String(dupe.id).padStart(3, '0') }); continue; }
              created.push(createOneTask(t, user, isOwner));
            } catch (err) {
              errors.push({ title: t.title || '(untitled)', error: err.message });
            }
          }
        })();
        return { success: true, created_count: created.length, created, skipped_duplicates, errors };
      }

      case 'update_task': {
        if (!canWrite) return { error: 'No write permission' };
        const old = db.prepare('SELECT t.*, c.is_private FROM tasks t JOIN clients c ON t.client_id=c.id WHERE t.id=?').get(input.task_id);
        if (!old) return { error: 'Task not found' };
        if (old.is_private && !isOwner) return { error: 'Access denied' };

        // Canonical status/band drive the legacy progress/priority shadows.
        let status = isValidStatus(input.status) ? input.status : null;
        let band = isValidBand(input.band) ? input.band : null;
        let ttype = isValidType(input.task_type) ? input.task_type : null;
        const progress = status !== null ? statusToProgress(status) : null;
        const priorityShadow = band !== null ? bandToPriority(band) : null;

        const wasDone = old.task_status === 'done';
        const nowDone = status === 'done';
        let completedAt = undefined;
        if (status !== null) {
          if (nowDone && !wasDone) completedAt = new Date().toISOString().split('T')[0];
          else if (!nowDone && wasDone) completedAt = '';
        }

        db.prepare(
          'UPDATE tasks SET title=COALESCE(?,title), assignee=COALESCE(?,assignee), secondary_assignee=COALESCE(?,secondary_assignee), deadline=COALESCE(?,deadline), planned_date=COALESCE(?,planned_date), estimated_hours=COALESCE(?,estimated_hours), progress=COALESCE(?,progress), priority=COALESCE(?,priority), task_status=COALESCE(?,task_status), task_band=COALESCE(?,task_band), task_type=COALESCE(?,task_type), notes=COALESCE(?,notes), completed_at=COALESCE(?,completed_at) WHERE id=?'
        ).run(
          input.title ?? null, input.assignee ?? null, input.secondary_assignee ?? null,
          input.deadline ?? null, input.planned_date ?? null, input.estimated_hours ?? null,
          progress, priorityShadow, status, band, ttype, input.notes ?? null,
          completedAt ?? null, input.task_id
        );

        // Recurring auto-create on the canonical "done" transition.
        if (nowDone && !wasDone && old.is_recurring && old.recur_interval > 0) {
          const d = new Date((old.deadline || old.planned_date || new Date().toISOString().split('T')[0]) + 'T00:00:00');
          const u = old.recur_unit, n = old.recur_interval;
          if (u === 'days') d.setDate(d.getDate() + n);
          else if (u === 'weeks') d.setDate(d.getDate() + n * 7);
          else if (u === 'months') d.setMonth(d.getMonth() + n);
          else if (u === 'years') d.setFullYear(d.getFullYear() + n);
          const nextDate = d.toISOString().split('T')[0];
          const nt = db.prepare(
            "INSERT INTO tasks (project_id, client_id, title, assignee, deadline, planned_date, estimated_hours, progress, priority, task_status, task_band, task_type, references_text, notes, is_recurring, recur_interval, recur_unit) VALUES (?, ?, ?, ?, ?, ?, ?, 'not-started', ?, 'scheduled', ?, ?, ?, ?, 1, ?, ?)"
          ).run(old.project_id, old.client_id, old.title, old.assignee, nextDate, nextDate, old.estimated_hours, old.priority, old.task_band || '', old.task_type || 'recurring', old.references_text, old.notes, old.recur_interval, old.recur_unit);
          logActivity('task', nt.lastInsertRowid, 'created', 'System', `Auto-created recurring task "${old.title}" (next: ${nextDate})`);
        }

        logActivity('task', input.task_id, 'updated', user.display_name, `Updated via AI assistant`);
        return { success: true, task_id: input.task_id };
      }

      case 'search_tasks': {
        const q = input.query;
        const refMatch = q.match(/^(?:NB)?(\d+)$/i);
        let rows;
        if (refMatch) {
          rows = db.prepare(`SELECT t.id, t.title, t.assignee, t.deadline, t.planned_date, t.progress, t.priority, c.name as client_name FROM tasks t JOIN clients c ON t.client_id=c.id WHERE t.id=? ${priv}`).all(parseInt(refMatch[1]));
        } else {
          rows = db.prepare(`SELECT t.id, t.title, t.assignee, t.deadline, t.planned_date, t.progress, t.priority, c.name as client_name FROM tasks t JOIN clients c ON t.client_id=c.id WHERE t.archived=0 AND (t.title LIKE ? OR t.notes LIKE ? OR t.assignee LIKE ?) ${priv} ORDER BY t.created_at DESC LIMIT 20`).all(`%${q}%`, `%${q}%`, `%${q}%`);
        }
        return { tasks: rows };
      }

      case 'get_workload_summary': {
        const tasks = db.prepare(`
          SELECT t.assignee, t.estimated_hours, t.planned_date, t.deadline
          FROM tasks t JOIN clients c ON t.client_id=c.id
          WHERE t.archived=0 AND t.progress NOT IN ('completed','invoiced') ${priv}
        `).all();
        const today = new Date().toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        const now = new Date();
        const dayOfWeek = now.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const weekStart = new Date(now); weekStart.setDate(now.getDate() + mondayOffset);
        const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
        const wsStr = weekStart.toISOString().split('T')[0];
        const weStr = weekEnd.toISOString().split('T')[0];
        let today_hours = 0, tomorrow_hours = 0, week_hours = 0, total_hours = 0, overdue = 0;
        const byPerson = {};
        for (const t of tasks) {
          const h = t.estimated_hours || 0;
          const d = t.planned_date || t.deadline || '';
          total_hours += h;
          if (d && d < today) overdue++;
          if (d === today) today_hours += h;
          if (d === tomorrow) tomorrow_hours += h;
          if (d >= wsStr && d <= weStr) week_hours += h;
          const name = t.assignee || 'Unassigned';
          if (!byPerson[name]) byPerson[name] = 0;
          byPerson[name] += h;
        }
        return { today_hours, tomorrow_hours, week_hours, total_hours, overdue_tasks: overdue, hours_by_person: byPerson };
      }

      case 'get_activity_patterns': {
        const today = new Date().toISOString().split('T')[0];
        const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString().split('T')[0];

        // Tasks whose deadline has been moved 3+ times (open only)
        const often_pushed = db.prepare(`
          SELECT t.id, t.title, c.name AS client, t.deadline, COUNT(*) AS times_moved
          FROM activity_log a
          JOIN tasks t ON t.id = a.entity_id AND a.entity_type = 'task'
          JOIN clients c ON c.id = t.client_id
          WHERE a.action = 'updated' AND (a.details LIKE '%deadline changed%' OR a.details LIKE '%planned date changed%')
            AND t.archived = 0 AND t.task_status NOT IN ('done','cancelled') ${priv}
          GROUP BY t.id HAVING times_moved >= 3
          ORDER BY times_moved DESC LIMIT 10
        `).all();

        // Inbox items sitting untriaged for over a week
        const stale_inbox = db.prepare(`
          SELECT t.id, t.title, c.name AS client, t.created_at
          FROM tasks t JOIN clients c ON c.id = t.client_id
          WHERE t.archived = 0 AND t.task_status = 'inbox' AND t.created_at < ? ${priv}
          ORDER BY t.created_at ASC LIMIT 15
        `).all(daysAgo(7));

        // Clients with open work but no activity in 14+ days
        const quiet_clients = db.prepare(`
          SELECT c.id, c.name, c.last_contact_date,
            (SELECT COUNT(*) FROM tasks t WHERE t.client_id = c.id AND t.archived = 0 AND t.task_status NOT IN ('done','cancelled')) AS open_tasks,
            (SELECT MAX(a.created_at) FROM activity_log a JOIN tasks t2 ON t2.id = a.entity_id AND a.entity_type='task' WHERE t2.client_id = c.id) AS last_activity
          FROM clients c
          WHERE c.archived = 0 AND c.is_system = 0 ${isOwner ? '' : 'AND c.is_private = 0'}
        `).all().filter(c => c.open_tasks > 0 && (!c.last_activity || c.last_activity < daysAgo(14))).slice(0, 10);

        // Clients with 3+ overdue open tasks
        const overdue_clusters = db.prepare(`
          SELECT c.name AS client, COUNT(*) AS overdue_count
          FROM tasks t JOIN clients c ON c.id = t.client_id
          WHERE t.archived = 0 AND t.task_status NOT IN ('done','cancelled')
            AND t.deadline != '' AND t.deadline < ? ${priv}
          GROUP BY c.id HAVING overdue_count >= 3
          ORDER BY overdue_count DESC
        `).all(today);

        // Waiting-on-client for 14+ days (chase candidates), judged by last update
        const stuck_waiting = db.prepare(`
          SELECT t.id, t.title, c.name AS client,
            (SELECT MAX(a.created_at) FROM activity_log a WHERE a.entity_type='task' AND a.entity_id = t.id) AS last_touched
          FROM tasks t JOIN clients c ON c.id = t.client_id
          WHERE t.archived = 0 AND t.task_status = 'waiting-on-client' ${priv}
        `).all().filter(t => !t.last_touched || t.last_touched < daysAgo(14)).slice(0, 10);

        // Recurring tasks running late
        const late_recurring = db.prepare(`
          SELECT t.id, t.title, c.name AS client, t.deadline, t.planned_date
          FROM tasks t JOIN clients c ON c.id = t.client_id
          WHERE t.archived = 0 AND t.task_status NOT IN ('done','cancelled')
            AND (t.is_recurring = 1 OR t.task_type = 'recurring')
            AND ((t.deadline != '' AND t.deadline < ?) OR (t.deadline = '' AND t.planned_date != '' AND t.planned_date < ?)) ${priv}
          LIMIT 10
        `).all(today, today);

        // Completion rhythm: which weekdays things actually get done (last 60d)
        const rhythm = {};
        for (const r of db.prepare(`
          SELECT t.completed_at FROM tasks t JOIN clients c ON c.id = t.client_id
          WHERE t.completed_at != '' AND t.completed_at >= ? ${priv}
        `).all(daysAgo(60))) {
          const d = new Date(r.completed_at + 'T12:00:00Z');
          const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()];
          rhythm[day] = (rhythm[day] || 0) + 1;
        }

        return {
          as_of: today,
          often_pushed, stale_inbox, quiet_clients, overdue_clusters,
          stuck_waiting, late_recurring, completions_by_weekday: rhythm,
        };
      }

      case 'list_recent_emails': {
        const auth = gmailClientForUser(user.id);
        if (!auth) return { error: 'Gmail is not connected — connect it from the Email tab first.' };
        const gmail = google.gmail({ version: 'v1', auth });
        const max = Math.min(Math.max(parseInt(input.max) || 20, 1), 40);
        const list = await gmail.users.messages.list({
          userId: 'me',
          labelIds: input.query ? undefined : ['INBOX'],
          q: input.query || undefined,
          maxResults: max,
        });
        if (!list.data.messages?.length) return { messages: [] };
        const details = await Promise.all(list.data.messages.map(m =>
          gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] })
        ));
        return {
          messages: details.map(d => {
            const headers = d.data.payload?.headers || [];
            const get = n => headers.find(h => h.name.toLowerCase() === n.toLowerCase())?.value || '';
            return {
              thread_id: d.data.threadId,
              from: get('From'), subject: get('Subject'), date: get('Date'),
              snippet: d.data.snippet,
              unread: (d.data.labelIds || []).includes('UNREAD'),
            };
          })
        };
      }

      case 'read_email_thread': {
        const auth = gmailClientForUser(user.id);
        if (!auth) return { error: 'Gmail is not connected — connect it from the Email tab first.' };
        const gmail = google.gmail({ version: 'v1', auth });
        const thread = await gmail.users.threads.get({ userId: 'me', id: input.thread_id, format: 'full' });
        const messages = (thread.data.messages || []).map(m => {
          const headers = m.payload?.headers || [];
          const get = n => headers.find(h => h.name.toLowerCase() === n.toLowerCase())?.value || '';
          let body = '';
          if (m.payload?.body?.data) body = Buffer.from(m.payload.body.data, 'base64url').toString('utf-8');
          else if (m.payload?.parts) {
            const p = m.payload.parts.find(x => x.mimeType === 'text/plain') || m.payload.parts.find(x => x.mimeType === 'text/html');
            if (p?.body?.data) body = Buffer.from(p.body.data, 'base64url').toString('utf-8');
          }
          // Strip tags from HTML bodies and cap length — the model needs the
          // words, not 200KB of markup.
          body = body.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 6000);
          return { from: get('From'), date: get('Date'), subject: get('Subject'), body };
        });
        return { messages };
      }

      case 'list_tasks_for_user': {
        const rows = db.prepare(`SELECT t.id, t.title, t.deadline, t.planned_date, t.estimated_hours, t.priority, t.progress, c.name as client_name FROM tasks t JOIN clients c ON t.client_id=c.id WHERE t.archived=0 AND t.progress NOT IN ('completed','invoiced') AND (t.assignee=? OR t.secondary_assignee=?) ${priv} ORDER BY COALESCE(NULLIF(t.planned_date,''), t.deadline), t.priority`).all(input.assignee, input.assignee);
        return { tasks: rows };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err.message };
  }
}

function buildSystemPrompt(user) {
  const today = new Date().toISOString().split('T')[0];
  return `You are "The Bear" — the in-house AI assistant embedded in the North Bear Console. North Bear Media is a creative production company. You help ${user.display_name} (${user.role}) manage clients and tasks.

Today's date is ${today}.

Identity: If asked who or what you are, you are The Bear, North Bear Media's built-in assistant. Don't refer to yourself as Claude or mention Anthropic unless directly asked about the underlying model.

Guidelines:
- Be concise and action-oriented. This is a working tool, not a chat companion.
- When the user asks to create tasks, use the tools to do it directly rather than just describing what you would do.
- Always look up the right client_id before creating tasks — use list_clients.
- For assignees, use list_team_members to get valid display names. If unclear, ask once rather than guess.
- Use YYYY-MM-DD for all dates. Interpret relative dates ("next Tuesday", "end of week") against today's date.
- When the user says "I" or "me", they mean ${user.display_name}.
- After creating items, confirm briefly with the NB### reference number.
- If a request is ambiguous (e.g. which client), ask a short clarifying question before acting.
- Do not invent clients — always look them up first. If one doesn't exist, tell the user and suggest creating it.
- Task status flow: inbox (just captured) → scheduled → in-progress → done. Use waiting-on-client or waiting-on-me when blocked, and cancelled to drop a task. New captures default to "inbox".
- Task band = when it needs doing: today, this-week, scheduled, waiting, someday. Use this instead of urgency words.
- Task type categorises work: recurring, ad-hoc, urgent, sales, admin, waiting, idea.
- When the user dumps a quick task without detail, just capture it to the inbox (status inbox) — don't over-question.

Pasted task lists (emails, bullet points, meeting notes — typed or pasted text):
- When the user pastes a list, parse EVERY line/item into a task and create them all in ONE create_tasks call. Never loop create_task per line, and never ask line-by-line questions.
- Create directly — do NOT ask for confirmation first. The user pastes lists precisely so they get banged straight in. (The confirm-first rule below applies only to voice notes and images.)
- Work out the client ONCE from context — the email sender, a heading, or the user saying "for X" — via list_clients, matching loosely on name. Apply it to the whole list unless a line clearly names a different client. If you genuinely can't tell which client, ask that one question first, then create everything.
- Titles: short and action-led. Everything else from the line (context, sender asks, caveats) goes into notes — don't lose detail, don't bloat titles.
- Dates: convert anything like "Thursday 9th", "end of month", "next week" to YYYY-MM-DD against today's date. Items with a date → status "scheduled" (+ band "today"/"this-week" if it falls there); undated items → status "inbox".
- Make sensible assumptions rather than asking; record any assumption in that task's notes so the user can correct it later.
- Afterwards, reply with a tight summary: one line per task (NB ref — title — date), plus any skipped duplicates or failures.

Noticing patterns ("what do you notice?", "any suggestions?", weekly-review questions):
- Call get_activity_patterns and INTERPRET it — never recite the raw lists. Pick the 3-5 signals that matter most right now and turn each into one concrete, kind suggestion with an action you can do: a task pushed 4 times probably wants breaking into a smaller first step, rescheduling to a realistic day, or cancelling honestly; a stale inbox wants a 5-minute triage offer; a quiet client wants a check-in task; a cluster of overdue tasks for one client wants a bulk reshuffle offer.
- ${user.display_name} has ADHD: patterns are information, not failings. No guilt-tripping, no "you should have". Frame suggestions as easy next moves, lead with the single highest-value one.
- Offer the action, then act on a yes using your normal tools (update_task, create_task, create_tasks). For anything touching more than 3 tasks, list what you'd change and confirm once first.
- If the data shows no meaningful pattern, say so — a short "nothing worrying this week" is a perfectly good answer.

Checking the inbox against the console ("what's missing from my console"):
- Use list_recent_emails (filter noise with a query like "newer_than:14d -category:promotions -category:social"). Read full threads with read_email_thread only for emails that look like they contain real work.
- Ignore newsletters, receipts, notifications and anything purely informational. You're hunting for asks, promises, deadlines and follow-ups involving ${user.display_name} or clients.
- Compare against existing open tasks (search_tasks per candidate, matching loosely on topic — a differently-worded task for the same piece of work counts as covered).
- Reply with a short list of what's genuinely missing — sender, the ask, suggested client + deadline — and ask ONE question: "Shall I add these?" Create them with create_tasks only after a yes. (Unlike a pasted list, a scanned inbox is your interpretation — confirm before writing.)

Voice / Image input:
- When the user sends a voice transcription or an image, interpret the content and present your understanding as a clear summary BEFORE creating any tasks.
- For voice notes: extract the tasks/intentions, list them out with proposed client, assignee, deadline, and band, then ask "Shall I go ahead and create these?" Wait for confirmation before using create_task.
- For images (e.g. screenshots of briefs, whiteboards, task lists): describe what you see, extract actionable items, propose tasks, then ask for confirmation before creating them.
- Only proceed to create tasks after the user confirms or says something like "yes", "go ahead", "do it", "looks good".`;
}

router.post('/api/ai/chat', requireAuth, requireWrite, async (req, res) => {
  const c = getClient();
  if (!c) return res.status(503).json({ error: 'AI assistant unavailable — ANTHROPIC_API_KEY not configured on server' });

  const { messages } = req.body;
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const conversation = messages.map(m => {
    if (m.role === 'user' && typeof m.content === 'string') return { role: 'user', content: m.content };
    if (m.role === 'assistant' && Array.isArray(m.content)) return { role: 'assistant', content: m.content };
    if (m.role === 'user' && Array.isArray(m.content)) return { role: 'user', content: m.content };
    return null;
  }).filter(Boolean);

  const toolLog = [];

  try {
    let iteration = 0;
    const maxIterations = 15;

    while (iteration++ < maxIterations) {
      const response = await c.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 8192,
        system: buildSystemPrompt(req.user),
        tools: TOOLS,
        messages: conversation,
        thinking: { type: 'adaptive' }
      });

      conversation.push({ role: 'assistant', content: response.content });

      if (response.stop_reason !== 'tool_use') {
        const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
        return res.json({
          reply: text,
          assistant_content: response.content,
          tool_calls: toolLog,
          usage: response.usage
        });
      }

      const toolUses = response.content.filter(b => b.type === 'tool_use');
      const toolResults = [];
      for (const tu of toolUses) {
        const result = await executeTool(tu.name, tu.input || {}, req.user);
        toolLog.push({ tool: tu.name, input: tu.input, result });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result)
        });
      }
      conversation.push({ role: 'user', content: toolResults });
    }

    return res.json({
      reply: 'Stopped after maximum tool iterations. Please rephrase your request.',
      tool_calls: toolLog
    });
  } catch (err) {
    console.error('[AI]', err);
    return res.status(500).json({ error: err.message || 'AI request failed' });
  }
});

router.post('/api/ai/chat-media', requireAuth, requireWrite, (req, res, next) => {
  aiMediaUpload.single('media')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  const c = getClient();
  if (!c) return res.status(503).json({ error: 'AI assistant unavailable' });

  let history;
  try { history = JSON.parse(req.body.messages || '[]'); } catch { history = []; }
  const text = req.body.text || '';
  const mediaType = req.body.mediaType || '';

  const userContent = [];

  if (req.file) {
    const base64 = req.file.buffer.toString('base64');
    const mime = req.file.mimetype;
    if (mime.startsWith('image/')) {
      userContent.push({ type: 'image', source: { type: 'base64', media_type: mime, data: base64 } });
      userContent.push({ type: 'text', text: text || 'I sent you an image. Please interpret it and suggest tasks based on what you see.' });
    } else {
      userContent.push({ type: 'text', text: `[Voice transcription]: ${text || '(no transcription available)'}` });
    }
  } else if (text) {
    userContent.push({ type: 'text', text });
  } else {
    return res.status(400).json({ error: 'No media or text provided' });
  }

  const conversation = history.map(m => {
    if (m.role === 'user' && typeof m.content === 'string') return { role: 'user', content: m.content };
    if (m.role === 'assistant' && Array.isArray(m.content)) return { role: 'assistant', content: m.content };
    if (m.role === 'user' && Array.isArray(m.content)) return { role: 'user', content: m.content };
    return null;
  }).filter(Boolean);

  conversation.push({ role: 'user', content: userContent });

  const toolLog = [];

  try {
    let iteration = 0;
    const maxIterations = 15;

    while (iteration++ < maxIterations) {
      const response = await c.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 8192,
        system: buildSystemPrompt(req.user),
        tools: TOOLS,
        messages: conversation,
        thinking: { type: 'adaptive' }
      });

      conversation.push({ role: 'assistant', content: response.content });

      if (response.stop_reason !== 'tool_use') {
        const textOut = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
        return res.json({
          reply: textOut,
          assistant_content: response.content,
          user_content: userContent,
          tool_calls: toolLog,
          usage: response.usage
        });
      }

      const toolUses = response.content.filter(b => b.type === 'tool_use');
      const toolResults = [];
      for (const tu of toolUses) {
        const result = await executeTool(tu.name, tu.input || {}, req.user);
        toolLog.push({ tool: tu.name, input: tu.input, result });
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) });
      }
      conversation.push({ role: 'user', content: toolResults });
    }

    return res.json({ reply: 'Stopped after maximum tool iterations.', tool_calls: toolLog });
  } catch (err) {
    console.error('[AI media]', err);
    return res.status(500).json({ error: err.message || 'AI request failed' });
  }
});

router.get('/api/ai/status', requireAuth, (req, res) => {
  res.json({ available: !!process.env.ANTHROPIC_API_KEY });
});

export default router;
