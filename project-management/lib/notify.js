// lib/notify.js — review-flow notifications: in-app rows + best-effort email.
//
// Emails send through a connected Gmail account (the actor's if they've linked
// one, else any owner's) — no external email service needed. If nobody has
// Gmail connected, notifications are in-app only and email is skipped quietly.

import { google } from 'googleapis';
import { gmailClientForUser } from '../routes/gmail.js';

// event: 'requested' (→ notify owners) | 'approved' | 'returned' (→ notify the task's assignee)
export function notifyReview(db, actor, task, event, origin) {
  let recipients = [];
  if (event === 'requested') {
    recipients = db.prepare("SELECT id, email, display_name FROM users WHERE role='owner'").all()
      .filter(u => u.id !== actor.id);
  } else if (task.assignee) {
    const u = db.prepare('SELECT id, email, display_name FROM users WHERE display_name = ?').get(task.assignee);
    if (u && u.id !== actor.id) recipients = [u];
  }
  if (!recipients.length) return;

  const ref = 'NB' + String(task.id).padStart(3, '0');
  const message = event === 'requested'
    ? `${actor.display_name} asked you to review “${task.title}” (${ref})`
    : event === 'approved'
      ? `${actor.display_name} approved “${task.title}” (${ref}) ✓`
      : `${actor.display_name} sent “${task.title}” (${ref}) back from review`;

  const ins = db.prepare('INSERT INTO notifications (user_id, type, task_id, message) VALUES (?, ?, ?, ?)');
  for (const r of recipients) ins.run(r.id, 'review-' + event, task.id, message);

  // Email is best-effort and must never block or fail the task write.
  emailRecipients(db, actor, recipients, message, origin)
    .catch(err => console.error('[Notify] email failed:', err.message));
}

async function emailRecipients(db, actor, recipients, message, origin) {
  let auth = gmailClientForUser(actor.id);
  if (!auth) {
    for (const row of db.prepare("SELECT u.id FROM users u JOIN gmail_tokens g ON g.user_id = u.id WHERE u.role='owner'").all()) {
      auth = gmailClientForUser(row.id);
      if (auth) break;
    }
  }
  if (!auth) return;   // no connected mailbox — in-app only

  const gmail = google.gmail({ version: 'v1', auth });
  const url = origin || process.env.APP_URL || 'https://nbmconsole.pro';
  const subject = '=?UTF-8?B?' + Buffer.from(message).toString('base64') + '?=';
  for (const r of recipients) {
    if (!r.email) continue;
    const raw = Buffer.from([
      `To: ${r.email}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      message,
      '',
      `Open the console: ${url}`,
      '',
      '— North Bear Console',
    ].join('\r\n')).toString('base64url');
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
  }
}
