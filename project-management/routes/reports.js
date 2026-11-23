// routes/reports.js — monthly client reports (owner only).
//
// Draft (gather tasks + Pulse + Metricool, Claude words it) → the owner edits
// → preview the PDF → email it to the client from the owner's Gmail with the
// PDF attached. Every draft and send is kept in client_reports.

import { Router } from 'express';
import { randomBytes } from 'crypto';
import { google } from 'googleapis';
import db from '../database.js';
import { requireAuth, requireRole } from '../middleware.js';
import { logActivity } from '../lib/activity.js';
import { draftReport, cleanDraft, buildReportPdf, reportFileName, metricoolBrands, pulseCodeOk } from '../lib/report.js';
import { gmailClientForUser } from './gmail.js';

const router = Router();
const ownerOnly = [requireAuth, requireRole('owner')];

const parse = s => { try { return JSON.parse(s || '{}'); } catch { return null; } };
const loadReport = id => {
  const row = db.prepare('SELECT * FROM client_reports WHERE id = ?').get(id);
  if (!row) return null;
  const content = parse(row.content);
  return content ? { row, content } : null;
};
const summary = r => ({ id: r.id, client_id: r.client_id, period: r.period, created_by: r.created_by,
  created_at: r.created_at, sent_at: r.sent_at, sent_to: r.sent_to });

// Pulse checks Console's one-time code here before it sends the clients'
// dashboard links (lib/report.js#linkPulseSites). No login: the code is the proof.
router.get('/pulse/verify/:code', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!pulseCodeOk(String(req.params.code || ''))) return res.status(404).json({ ok: false });
  res.json({ ok: true });
});

router.get('/api/reports', ...ownerOnly, (req, res) => {
  const cid = +req.query.client_id;
  if (!cid) return res.status(400).json({ error: 'client_id required' });
  res.json(db.prepare(`SELECT * FROM client_reports WHERE client_id = ? ORDER BY period DESC, id DESC LIMIT 36`).all(cid).map(summary));
});

// Gather + write a draft. Re-drafting an unsent month replaces that draft
// rather than piling up copies; a sent report is never overwritten.
let drafting = 0;
router.post('/api/reports/draft', ...ownerOnly, async (req, res) => {
  const cid = +req.body?.client_id;
  const period = String(req.body?.period || '');
  if (!cid) return res.status(400).json({ error: 'client_id required' });
  if (drafting >= 2) return res.status(429).json({ error: 'Two reports are already being drafted — try again in a minute' });
  drafting++;
  try {
    const content = await draftReport(cid, period);
    const existing = db.prepare(`SELECT id FROM client_reports WHERE client_id = ? AND period = ? AND (sent_at IS NULL OR sent_at = '')
      ORDER BY id DESC LIMIT 1`).get(cid, period);
    let id;
    if (existing) {
      db.prepare(`UPDATE client_reports SET content = ?, created_by = ?, created_at = datetime('now') WHERE id = ?`)
        .run(JSON.stringify(content), req.user.display_name, existing.id);
      id = existing.id;
    } else {
      id = db.prepare('INSERT INTO client_reports (client_id, period, content, created_by) VALUES (?, ?, ?, ?)')
        .run(cid, period, JSON.stringify(content), req.user.display_name).lastInsertRowid;
    }
    res.json({ ...summary(db.prepare('SELECT * FROM client_reports WHERE id = ?').get(id)), content });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  } finally {
    drafting--;
  }
});

router.get('/api/reports/:id', ...ownerOnly, (req, res) => {
  const r = loadReport(+req.params.id);
  if (!r) return res.status(404).json({ error: 'Report not found' });
  res.json({ ...summary(r.row), content: r.content });
});

// Save the owner's edits to the wording (the figures stay as gathered).
router.put('/api/reports/:id', ...ownerOnly, (req, res) => {
  const r = loadReport(+req.params.id);
  if (!r) return res.status(404).json({ error: 'Report not found' });
  r.content.draft = cleanDraft(req.body?.draft || {}, r.content.facts);
  r.content.edited_at = new Date().toISOString();
  db.prepare('UPDATE client_reports SET content = ? WHERE id = ?').run(JSON.stringify(r.content), r.row.id);
  res.json({ ok: true, draft: r.content.draft });
});

router.get('/api/reports/:id/pdf', ...ownerOnly, async (req, res) => {
  const r = loadReport(+req.params.id);
  if (!r) return res.status(404).json({ error: 'Report not found' });
  try {
    const pdf = await buildReportPdf(r.content);
    const name = reportFileName(r.content);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${name.replace(/[^\x20-\x7e]/g, '-').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ error: `Couldn’t build the PDF: ${err.message}` });
  }
});

// ─── Email it from the owner's Gmail, PDF attached ──────────────────────────
const EMAIL = /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[^@\s,;<>"]+$/;
const noBreaks = s => String(s || '').replace(/[\r\n]+/g, ' ').trim();
// RFC 2047: non-ASCII subjects as short base64 words, folded onto lines.
const encodeHeader = s => {
  if (!/[^\x20-\x7e]/.test(s)) return s;
  const words = [];
  let cur = '';
  for (const ch of s) {
    if (Buffer.byteLength(cur + ch) > 45) { words.push(cur); cur = ''; }
    cur += ch;
  }
  if (cur) words.push(cur);
  return words.map(w => `=?UTF-8?B?${Buffer.from(w).toString('base64')}?=`).join('\r\n ');
};
const b64lines = buf => buf.toString('base64').replace(/(.{76})/g, '$1\r\n');

router.post('/api/reports/:id/send', ...ownerOnly, async (req, res) => {
  const r = loadReport(+req.params.id);
  if (!r) return res.status(404).json({ error: 'Report not found' });
  const to = noBreaks(req.body?.to).split(/[,;\s]+/).filter(Boolean);
  if (!to.length || to.length > 5 || !to.every(e => EMAIL.test(e))) {
    return res.status(400).json({ error: 'Add up to five proper email addresses, separated by commas' });
  }
  const subject = noBreaks(req.body?.subject).slice(0, 200) || `Your ${r.content.label} report — North Bear Media`;
  const message = String(req.body?.message || '').slice(0, 10000);
  const auth = gmailClientForUser(req.user.id);
  const from = db.prepare('SELECT email FROM gmail_tokens WHERE user_id = ?').get(req.user.id)?.email;
  if (!auth || !from) return res.status(400).json({ error: 'Connect your Gmail first (More → Email) so the report goes from your own address' });

  try {
    const pdf = await buildReportPdf(r.content);
    const name = reportFileName(r.content);
    const asciiName = name.replace(/[^\x20-\x7e]/g, '-').replace(/"/g, '');
    const boundary = `nbm_${randomBytes(12).toString('hex')}`;
    const raw = [
      `From: ${from}`,
      `To: ${to.join(', ')}`,
      `Subject: ${encodeHeader(subject)}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64lines(Buffer.from(message, 'utf8')),
      `--${boundary}`,
      `Content-Type: application/pdf; name="${asciiName}"`,
      `Content-Disposition: attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Content-Transfer-Encoding: base64',
      '',
      b64lines(pdf),
      `--${boundary}--`,
      '',
    ].join('\r\n');
    const gmail = google.gmail({ version: 'v1', auth });
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw: Buffer.from(raw).toString('base64url') } });
    db.prepare(`UPDATE client_reports SET sent_at = datetime('now'), sent_to = ? WHERE id = ?`).run(to.join(', '), r.row.id);
    // Recipients stay on the owner-only report row; the activity log is visible to staff.
    logActivity('client', r.row.client_id, 'updated', req.user.display_name, `Sent the ${r.content.label} report to the client`);
    res.json({ ok: true, sent_to: to.join(', ') });
  } catch (err) {
    const msg = /invalid_grant|unauthorized|401/i.test(String(err?.message)) ? 'Gmail needs reconnecting (More → Email)' : err.message;
    res.status(502).json({ error: `Not sent — ${msg}` });
  }
});

// Brand list for linking a client to its Metricool brand.
router.get('/api/metricool/brands', ...ownerOnly, async (req, res) => {
  try {
    res.json(await metricoolBrands());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
