import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import db from '../database.js';
import { requireAuth, requireWrite } from '../middleware.js';
import { logActivity } from '../lib/activity.js';

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
    description: 'Create a new task for a client. Use YYYY-MM-DD for dates. priority must be critical/high/medium/low. Progress defaults to not-started.',
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
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        notes: { type: 'string' },
        references_text: { type: 'string', description: 'URLs or reference info' }
      },
      required: ['client_id', 'title']
    }
  },
  {
    name: 'update_task',
    description: 'Update fields on an existing task. Only pass fields you want to change.',
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
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        progress: { type: 'string', enum: ['not-started', 'in-progress', 'completed', 'stuck', 'awaiting-client', 'awaiting-manager', 'ready-to-invoice', 'invoiced'] },
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

function executeTool(name, input, user) {
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
        const cl = db.prepare('SELECT is_private FROM clients WHERE id = ?').get(input.client_id);
        if (!cl) return { error: 'Client not found' };
        if (cl.is_private && !isOwner) return { error: 'Access denied' };
        const r = db.prepare(
          'INSERT INTO tasks (client_id, title, assignee, secondary_assignee, deadline, planned_date, estimated_hours, priority, references_text, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
          input.client_id, input.title,
          input.assignee || '', input.secondary_assignee || '',
          input.deadline || '', input.planned_date || '',
          input.estimated_hours || 0, input.priority || 'medium',
          input.references_text || '', input.notes || ''
        );
        logActivity('task', r.lastInsertRowid, 'created', user.display_name, `Created task "${input.title}" (via AI assistant)`);
        return { success: true, task_id: r.lastInsertRowid, ref: 'NB' + String(r.lastInsertRowid).padStart(3, '0'), title: input.title };
      }

      case 'update_task': {
        if (!canWrite) return { error: 'No write permission' };
        const old = db.prepare('SELECT t.*, c.is_private FROM tasks t JOIN clients c ON t.client_id=c.id WHERE t.id=?').get(input.task_id);
        if (!old) return { error: 'Task not found' };
        if (old.is_private && !isOwner) return { error: 'Access denied' };

        let completedAt = undefined;
        if (input.progress && (input.progress === 'completed' || input.progress === 'invoiced') && old.progress !== 'completed' && old.progress !== 'invoiced') {
          completedAt = new Date().toISOString().split('T')[0];
        } else if (input.progress && input.progress !== 'completed' && input.progress !== 'invoiced' && (old.progress === 'completed' || old.progress === 'invoiced')) {
          completedAt = '';
        }

        db.prepare(
          'UPDATE tasks SET title=COALESCE(?,title), assignee=COALESCE(?,assignee), secondary_assignee=COALESCE(?,secondary_assignee), deadline=COALESCE(?,deadline), planned_date=COALESCE(?,planned_date), estimated_hours=COALESCE(?,estimated_hours), progress=COALESCE(?,progress), priority=COALESCE(?,priority), notes=COALESCE(?,notes), completed_at=COALESCE(?,completed_at) WHERE id=?'
        ).run(
          input.title ?? null, input.assignee ?? null, input.secondary_assignee ?? null,
          input.deadline ?? null, input.planned_date ?? null, input.estimated_hours ?? null,
          input.progress ?? null, input.priority ?? null, input.notes ?? null,
          completedAt ?? null, input.task_id
        );
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
- Priority guide: "critical" = must-do-now blocker, "high" = time-sensitive, "medium" = default, "low" = nice-to-have.`;
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
        const result = executeTool(tu.name, tu.input || {}, req.user);
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

router.get('/api/ai/status', requireAuth, (req, res) => {
  res.json({ available: !!process.env.ANTHROPIC_API_KEY });
});

export default router;
