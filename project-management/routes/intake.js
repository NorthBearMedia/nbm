// routes/intake.js — the robot's suggestion tray, settings and capture link.
//
// Everything here is owner-only: suggestions quote the owner's (possibly
// personal) messages. The one exception is the capture link (/capture/:token),
// which needs no login but only ever ADDS a note for the robot to read —
// whatever it produces still waits in the tray for the owner.

import express, { Router } from 'express';
import { randomBytes, timingSafeEqual, createHash } from 'crypto';
import db from '../database.js';
import { requireAuth, requireRole } from '../middleware.js';
import { logActivity } from '../lib/activity.js';
import { createTaskCore, updateTaskCore } from './tasks.js';
import {
  runIntake, intakeBusy, getMeta, setMeta, getSecret, scheduleCaptureRun, inOfficeHours, ukToday, ownerUser,
} from '../lib/intake.js';
import { getClaude, currentModel } from '../lib/claude.js';
import { metricoolBrands } from '../lib/report.js';

const router = Router();
// The robot reads ONE person's messages (the first owner account — whose
// Gmail, WhatsApp and meetings it was connected to), so its tray, quotes and
// settings are theirs alone, even if another account is later made owner.
const robotOwner = (req, res, next) =>
  (req.user.id === ownerUser()?.id ? next() : res.status(403).json({ error: 'Only the account the robot reads for can see this' }));
const ownerOnly = [requireAuth, requireRole('owner'), robotOwner];

const originOf = req => `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.headers.host}`;

function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
// Where an accepted task lands: due soon → today / this week, otherwise scheduled.
function bandFor(deadline) {
  if (!deadline) return '';
  const today = ukToday();
  if (deadline <= today) return 'today';
  if (deadline <= addDaysISO(today, 6)) return 'this-week';
  return 'scheduled';
}

// Accepting teaches the robot who's who: this sender/chat belongs to this client.
function learnContact(contact, clientId) {
  if (!contact || !clientId) return;
  const c = db.prepare('SELECT is_system FROM clients WHERE id = ?').get(clientId);
  if (!c || c.is_system) return;
  db.prepare(`INSERT INTO contact_map (identifier, client_id, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(identifier) DO UPDATE SET client_id = excluded.client_id, updated_at = excluded.updated_at`)
    .run(String(contact).toLowerCase().slice(0, 200), clientId);
}

// complete/update suggestions whose task has since been closed or deleted by
// hand are moot — expire them so the tray never asks about finished work.
function expireStale() {
  db.prepare(`UPDATE suggestions SET status = 'expired', decided_at = datetime('now'), decided_by = 'System'
    WHERE status = 'pending' AND kind IN ('complete', 'update') AND (
      task_id NOT IN (SELECT id FROM tasks)
      OR task_id IN (SELECT id FROM tasks WHERE archived = 1 OR task_status IN ('done', 'cancelled')))`).run();
}

const SUGGESTION_SELECT = `SELECT s.*, c.name AS client_name, c.code AS client_code, c.logo_url AS client_logo, c.is_system AS client_is_system,
    t.title AS task_title, t.task_status AS task_status, t.deadline AS task_deadline
  FROM suggestions s LEFT JOIN clients c ON c.id = s.client_id LEFT JOIN tasks t ON t.id = s.task_id`;

router.get('/api/suggestions', ...ownerOnly, (req, res) => {
  expireStale();
  const status = ['pending', 'accepted', 'dismissed'].includes(req.query.status) ? req.query.status : 'pending';
  const rows = db.prepare(`${SUGGESTION_SELECT} WHERE s.status = ?
    ORDER BY CASE s.confidence WHEN 'high' THEN 0 ELSE 1 END, s.id DESC LIMIT 200`).all(status);
  res.json(rows);
});

router.get('/api/suggestions/count', ...ownerOnly, (req, res) => {
  expireStale();
  res.json({ pending: db.prepare("SELECT COUNT(*) AS n FROM suggestions WHERE status = 'pending'").get().n });
});

export function acceptSuggestion(id, overrides, user, origin) {
  const s = db.prepare('SELECT * FROM suggestions WHERE id = ?').get(id);
  if (!s) return { status: 404, json: { error: 'Suggestion not found' } };
  if (s.status !== 'pending') return { status: 409, json: { error: 'That suggestion was already handled' } };
  const o = overrides || {};
  let result;
  if (s.kind === 'new_task') {
    const title = String(o.title ?? s.title).replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!title) return { status: 400, json: { error: 'Title required' } };
    const clientId = o.client_id !== undefined ? (o.client_id ? +o.client_id : null) : s.client_id;
    if (clientId && !db.prepare('SELECT 1 FROM clients WHERE id = ?').get(clientId)) {
      return { status: 400, json: { error: 'Unknown client' } };
    }
    const deadline = o.deadline !== undefined ? String(o.deadline || '') : s.deadline;
    // Tasks can be handed to staff: a quote from a work email / chat / meeting
    // helps whoever does it, but nothing from personal WhatsApp or a personal
    // mailbox travels into the task (it stays on the owner-only suggestion).
    const mainMailbox = (db.prepare('SELECT email FROM gmail_tokens WHERE user_id = ?').get(user.id)?.email || '').toLowerCase();
    const personal = s.source === 'periskope' || (s.source === 'gmail' && String(s.source_ref).split(':')[0] !== mainMailbox);
    const provenance = [s.notes, personal ? '— Suggested by the robot from your messages'
      : `— Suggested by the robot from ${s.source_label}${s.evidence ? `:\n“${s.evidence}”` : ''}`].filter(Boolean).join('\n\n');
    result = createTaskCore({
      title, client_id: clientId, deadline,
      task_status: deadline ? 'scheduled' : 'inbox', task_band: bandFor(deadline),
      assignee: o.assignee || '',
      notes: o.notes !== undefined ? String(o.notes) : provenance,
      references_text: personal ? '' : (s.source_url || ''),
    }, user);
  } else {
    // A tick-off / update for a task that's since been closed would reopen
    // it (and a recurring one would leave two copies) — clear it instead.
    const t = db.prepare('SELECT task_status, archived FROM tasks WHERE id = ?').get(s.task_id);
    if (!t || t.archived || ['done', 'cancelled'].includes(t.task_status)) {
      db.prepare(`UPDATE suggestions SET status = 'expired', decided_at = datetime('now'), decided_by = 'System' WHERE id = ?`).run(s.id);
      return { status: 409, json: { error: 'That task is already closed — suggestion cleared', expired: true } };
    }
    if (s.kind === 'complete') {
      result = updateTaskCore(s.task_id, { task_status: 'done' }, user, origin);
    } else {
      const body = {};
      if (s.new_status) body.task_status = s.new_status;
      if (s.deadline) body.deadline = s.deadline;
      result = updateTaskCore(s.task_id, body, user, origin);
    }
  }
  if (result.status !== 200) return result;
  const task = result.json;
  db.prepare(`UPDATE suggestions SET status = 'accepted', decided_at = datetime('now'), decided_by = ?, result_task_id = ?
    WHERE id = ?`).run(user.display_name, task.id, s.id);
  // The newest word on a task wins: older pending tick-offs / updates for the
  // same task are moot once one has been accepted.
  if (s.kind !== 'new_task') {
    db.prepare(`UPDATE suggestions SET status = 'expired', decided_at = datetime('now'), decided_by = 'System'
      WHERE status = 'pending' AND id != ? AND task_id = ? AND kind IN ('complete', 'update')`).run(s.id, s.task_id);
  }
  learnContact(s.contact, task.client_id);
  // Who/what it came from stays off the activity log, which staff can see.
  logActivity('task', task.id, 'updated', user.display_name, `Accepted the robot's suggestion (${s.kind.replace('_', ' ')})`);
  return { status: 200, json: { ok: true, task } };
}

router.post('/api/suggestions/:id/accept', ...ownerOnly, (req, res) => {
  const r = acceptSuggestion(+req.params.id, req.body, req.user, originOf(req));
  res.status(r.status).json(r.json);
});

router.post('/api/suggestions/accept-all', ...ownerOnly, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger).slice(0, 100) : [];
  let accepted = 0;
  const errors = [];
  // Newest first, so when two suggestions touch the same task the latest wins
  // and the older one is cleared rather than applied on top.
  let cleared = 0;
  for (const id of [...ids].sort((a, b) => b - a)) {
    const r = acceptSuggestion(id, {}, req.user, originOf(req));
    if (r.status === 200) accepted++;
    else if (r.status === 409) cleared++;      // already handled / overtaken — not an error
    else errors.push({ id, error: r.json.error });
  }
  res.json({ accepted, cleared, errors });
});

router.post('/api/suggestions/:id/dismiss', ...ownerOnly, (req, res) => {
  const r = db.prepare(`UPDATE suggestions SET status = 'dismissed', decided_at = datetime('now'), decided_by = ?
    WHERE id = ? AND status = 'pending'`).run(req.user.display_name, +req.params.id);
  if (!r.changes) return res.status(409).json({ error: 'That suggestion was already handled' });
  res.json({ ok: true });
});

// ─── Runs ────────────────────────────────────────────────────────────────────
router.post('/api/intake/run', ...ownerOnly, async (req, res) => {
  if (!getClaude()) return res.status(503).json({ error: 'The robot needs ANTHROPIC_API_KEY set on the server.' });
  try {
    res.json(await runIntake({ trigger: 'manual' }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Paste anything (a Grok/Claude answer, meeting scribbles, a forwarded list) and
// get suggestions back straight away.
router.post('/api/intake/paste', ...ownerOnly, async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Paste something first' });
  if (text.length > 20000) return res.status(400).json({ error: 'That is a lot of text — paste under 20,000 characters at a time' });
  if (!getClaude()) return res.status(503).json({ error: 'The robot needs ANTHROPIC_API_KEY set on the server.' });
  db.prepare('INSERT INTO intake_captures (text, label) VALUES (?, ?)').run(text, String(req.body?.label || 'Pasted').slice(0, 120));
  try {
    const run = await runIntake({ trigger: 'paste', only: ['capture'] });
    const suggestions = db.prepare(`${SUGGESTION_SELECT} WHERE s.run_id = ? AND s.status = 'pending' ORDER BY s.id`).all(run.runId);
    res.json({ ...run, created: suggestions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Status + settings ───────────────────────────────────────────────────────
function captureToken() {
  let t = getMeta('capture_token', '');
  if (!t) { t = randomBytes(18).toString('hex'); setMeta('capture_token', t); }
  return t;
}

router.get('/api/intake/status', ...ownerOnly, (req, res) => {
  const safe = s => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
  const last = db.prepare('SELECT * FROM intake_runs ORDER BY id DESC LIMIT 1').get();
  const monthStart = `${ukToday().slice(0, 7)}-01`;
  const main = db.prepare('SELECT email FROM gmail_tokens WHERE user_id = ?').get(req.user.id);
  expireStale();
  res.json({
    enabled: getMeta('intake_enabled', '1') === '1',
    hasApiKey: !!getClaude(),
    model: currentModel(),
    busy: intakeBusy(),
    inOfficeHours: inOfficeHours(),
    lastRun: last ? { ...last, detail: safe(last.detail) } : null,
    lastSuccess: getMeta('intake_last_success', ''),
    recentRuns: db.prepare(`SELECT id, trigger_type, started_at, status, items, suggestions, touches
      FROM intake_runs ORDER BY id DESC LIMIT 8`).all(),
    month: db.prepare(`SELECT COUNT(*) AS runs, COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens, COALESCE(SUM(suggestions), 0) AS suggestions
      FROM intake_runs WHERE started_at >= ?`).get(monthStart),
    pending: db.prepare("SELECT COUNT(*) AS n FROM suggestions WHERE status = 'pending'").get().n,
    gmailOAuthConfigured: !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET),
    sources: {
      gmail: main?.email || '',
      mailboxes: db.prepare('SELECT id, email, status, created_at FROM intake_mailboxes ORDER BY id').all(),
      whatsappNumbers: db.prepare('SELECT COUNT(*) AS n FROM whatsapp_config WHERE enabled = 1').get().n,
      periskope: {
        configured: !!getSecret('periskope_api_key', 'PERISKOPE_API_KEY'),
        fromEnv: !!process.env.PERISKOPE_API_KEY,
        phone: getSecret('periskope_phone', 'PERISKOPE_PHONE'),
      },
      granola: { configured: !!getSecret('granola_api_key', 'GRANOLA_API_KEY'), fromEnv: !!process.env.GRANOLA_API_KEY },
    },
    metricool: {
      configured: !!getSecret('metricool_token', 'METRICOOL_TOKEN'),
      fromEnv: !!process.env.METRICOOL_TOKEN,
      userId: getSecret('metricool_user_id', 'METRICOOL_USER_ID'),
    },
    captureUrl: `${originOf(req)}/capture/${captureToken()}`,
    connectorUrl: `${originOf(req)}/mcp/${captureToken()}`,
  });
});

// Keys are write-only: saved here, never sent back to the browser.
router.put('/api/intake/settings', ...ownerOnly, (req, res) => {
  const b = req.body || {};
  if (b.enabled !== undefined) setMeta('intake_enabled', b.enabled ? '1' : '0');
  for (const k of ['periskope_api_key', 'granola_api_key', 'metricool_token']) {
    if (typeof b[k] === 'string') setMeta(k, b[k].trim().slice(0, 500));
  }
  if (typeof b.periskope_phone === 'string') setMeta('periskope_phone', b.periskope_phone.replace(/\D/g, '').slice(0, 20));
  if (typeof b.metricool_user_id === 'string') setMeta('metricool_user_id', b.metricool_user_id.replace(/\D/g, '').slice(0, 20));
  if (b.regenerate_capture_token) setMeta('capture_token', randomBytes(18).toString('hex'));
  res.json({ ok: true });
});

router.delete('/api/intake/mailboxes/:id', ...ownerOnly, (req, res) => {
  db.prepare('DELETE FROM intake_mailboxes WHERE id = ?').run(+req.params.id);
  res.json({ ok: true });
});

// Quick "does this key work?" checks for the settings panel.
router.post('/api/intake/test/:service', ...ownerOnly, async (req, res) => {
  const get = async (url, headers) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(url, { headers, signal: ctrl.signal });
      const text = await r.text();
      return { ok: r.ok, status: r.status, text };
    } finally { clearTimeout(t); }
  };
  try {
    if (req.params.service === 'periskope') {
      const key = getSecret('periskope_api_key', 'PERISKOPE_API_KEY');
      if (!key) return res.json({ ok: false, detail: 'No Periskope API key saved yet' });
      const phone = getSecret('periskope_phone', 'PERISKOPE_PHONE').replace(/\D/g, '');
      const r = await get('https://api.periskope.app/v1/chats?limit=1', { Authorization: `Bearer ${key}`, ...(phone ? { 'x-phone': phone } : {}) });
      return res.json({ ok: r.ok, detail: r.ok ? 'Connected — chats are readable' : `Periskope said ${r.status}: ${r.text.slice(0, 160)}` });
    }
    if (req.params.service === 'metricool') {
      try {
        const brands = await metricoolBrands();
        return res.json({ ok: true, detail: `Connected — ${brands.length} brand${brands.length === 1 ? '' : 's'} on the account` });
      } catch (err) {
        return res.json({ ok: false, detail: /^401|^403/.test(err.message) ? 'Metricool turned the key down — check the API token and user ID' : err.message });
      }
    }
    if (req.params.service === 'granola') {
      const key = getSecret('granola_api_key', 'GRANOLA_API_KEY');
      if (!key) return res.json({ ok: false, detail: 'No Granola API key saved yet' });
      const r = await get('https://public-api.granola.ai/v1/notes?page_size=1', { Authorization: `Bearer ${key}` });
      return res.json({ ok: r.ok, detail: r.ok ? 'Connected — meeting notes are readable' : `Granola said ${r.status}: ${r.text.slice(0, 160)}` });
    }
    res.status(400).json({ error: 'Unknown service' });
  } catch (err) {
    res.json({ ok: false, detail: `Couldn't reach it: ${err.message}` });
  }
});

// ─── Capture link (no login) ─────────────────────────────────────────────────
// POST text (JSON {text, title} / form / plain text) from an iPhone Shortcut, a
// share sheet, or another AI tool; GET serves a tiny paste page for the phone.
const captureHits = new Map();
function captureLimited(ip) {
  const now = Date.now();
  const list = (captureHits.get(ip) || []).filter(t => now - t < 3600_000);
  list.push(now);
  captureHits.set(ip, list);
  return list.length > 60;
}
function tokenOk(given) {
  const t = getMeta('capture_token', '');
  if (!t || typeof given !== 'string') return false;
  const h = v => createHash('sha256').update(v).digest();
  return timingSafeEqual(h(given), h(t));
}
const capturePage = (msg = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Send to Console</title><style>
body{font-family:-apple-system,system-ui,sans-serif;background:#231f20;color:#eee;margin:0;padding:24px}
h1{font-size:20px;margin:0 0 6px}p{color:#aaa;font-size:14px;margin:0 0 16px}
textarea{width:100%;box-sizing:border-box;height:260px;font-size:16px;border-radius:10px;border:1px solid #444;background:#2d292a;color:#eee;padding:12px}
button{margin-top:12px;width:100%;padding:14px;font-size:17px;font-weight:700;border:0;border-radius:10px;background:#3eaf84;color:#fff}
.ok{background:#1f3a2f;border:1px solid #3eaf84;padding:12px;border-radius:10px;margin-bottom:14px}</style></head>
<body><h1>🐻 Send to North Bear Console</h1><p>Paste anything — a to-do list, an AI chat answer, meeting scribbles. The robot turns it into suggestions for your Inbox.</p>
${msg ? `<div class="ok">${msg}</div>` : ''}<form method="post"><textarea name="text" placeholder="Paste here…" required></textarea>
<button type="submit">Send to Console</button></form></body></html>`;

router.get('/capture/:token', (req, res) => {
  if (!tokenOk(req.params.token)) return res.status(404).send('Not found');
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(capturePage());
});

router.post('/capture/:token',
  express.text({ type: ['text/*'], limit: '64kb' }),
  express.urlencoded({ extended: false, limit: '64kb' }),
  (req, res) => {
    if (!tokenOk(req.params.token)) return res.status(404).json({ error: 'Not found' });
    if (captureLimited(req.ip || 'unknown')) return res.status(429).json({ error: 'Too many captures — try again later' });
    const b = req.body;
    const text = String(typeof b === 'string' ? b : (b?.text || b?.body || b?.content || '')).trim();
    if (!text) return res.status(400).json({ error: 'No text' });
    if (text.length > 20000) return res.status(413).json({ error: 'Too long (20,000 characters max)' });
    const label = String((typeof b === 'object' && (b.title || b.subject)) || req.get('X-Capture-Source') || 'Captured').slice(0, 120);
    db.prepare('INSERT INTO intake_captures (text, label) VALUES (?, ?)').run(text, label);
    scheduleCaptureRun();
    if (req.is('application/x-www-form-urlencoded')) {
      return res.type('html').send(capturePage('Captured ✓ — suggestions will appear in your Console Inbox in a minute.'));
    }
    res.json({ ok: true, message: 'Captured — the robot will turn it into suggestions shortly.' });
  });

// ─── Claude connector (MCP) ──────────────────────────────────────────────────
// Claude can't share chat history with other apps, so Console plugs into
// Claude instead: added as a custom connector (claude.ai → Settings →
// Connectors, or `claude mcp add` in Claude Code), every conversation gets a
// send_to_console tool. What it sends joins the capture queue, so the robot
// turns it into suggestions that still wait for Norton's yes — same secret
// token as the capture link, same write-only reach (nothing can be read).
// Streamable HTTP transport, plain JSON responses, stateless.
const MCP_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MCP_TOOL = {
  name: 'send_to_console',
  title: 'Send to North Bear Console',
  description: "Send an update to North Bear Console, Norton's task list for North Bear Media. Use it whenever the conversation " +
    'produces something for the list: a new task or action point, a deadline, something finished, something now waiting on a ' +
    'client, or a decision about a client. Name the client and include dates. Console turns it into suggestions Norton approves.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The update in plain words: the tasks, decisions, deadlines or what was done. Name the client.' },
      title: { type: 'string', description: 'Optional short label, e.g. the conversation topic.' },
    },
    required: ['text'],
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
};
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

function mcpHandle(m, ip) {
  const ok = result => ({ jsonrpc: '2.0', id: m.id, result });
  switch (m.method) {
    case 'initialize': {
      const asked = m.params?.protocolVersion;
      return ok({
        protocolVersion: MCP_VERSIONS.includes(asked) ? asked : MCP_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'north-bear-console', title: 'North Bear Console', version: '1.0.0' },
        instructions: "Whenever a conversation produces tasks, decisions, deadlines or updates for one of Norton's North Bear Media " +
          'clients, send them to North Bear Console with send_to_console.',
      });
    }
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: [MCP_TOOL] });
    case 'resources/list': return ok({ resources: [] });
    case 'prompts/list': return ok({ prompts: [] });
    case 'tools/call': {
      if (m.params?.name !== MCP_TOOL.name) return rpcError(m.id, -32602, `Unknown tool: ${m.params?.name}`);
      const args = m.params?.arguments || {};
      const text = String(args.text || '').trim();
      const fail = msg => ok({ content: [{ type: 'text', text: msg }], isError: true });
      if (!text) return fail('Nothing to send — the text was empty.');
      if (text.length > 20000) return fail('Too long — send under 20,000 characters at a time.');
      if (captureLimited(ip)) return fail('Too many sends in the last hour — try again later.');
      const label = `Claude · ${String(args.title || 'conversation').replace(/\s+/g, ' ').trim().slice(0, 100)}`;
      db.prepare('INSERT INTO intake_captures (text, label) VALUES (?, ?)').run(text, label);
      scheduleCaptureRun();
      return ok({ content: [{ type: 'text', text: "Sent to North Bear Console. It becomes suggestions in Norton's Inbox within a minute, for him to approve." }] });
    }
    default: return rpcError(m.id, -32601, `Method not found: ${m.method}`);
  }
}

router.post('/mcp/:token', (req, res) => {
  if (!tokenOk(req.params.token)) return res.status(404).json(rpcError(null, -32001, 'Not found'));
  const batch = Array.isArray(req.body);
  const msgs = batch ? req.body : [req.body];
  const out = [];
  for (const m of msgs) {
    if (!m || typeof m !== 'object' || m.jsonrpc !== '2.0' || typeof m.method !== 'string') {
      out.push(rpcError(m?.id, -32600, 'Invalid request'));
      continue;
    }
    if (m.id === undefined || m.id === null) continue;            // a notification: nothing to answer
    out.push(mcpHandle(m, req.ip || 'unknown'));
  }
  if (!out.length) return res.status(202).end();
  res.json(batch ? out : out[0]);
});
// No server-initiated stream and no sessions to end.
router.get('/mcp/:token', (req, res) => res.status(405).set('Allow', 'POST').end());
router.delete('/mcp/:token', (req, res) => res.status(405).set('Allow', 'POST').end());

export default router;
