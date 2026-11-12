// Branded report emails via SMTP (works out of the box with a Hostinger
// mailbox). The logo is embedded as a cid attachment so it shows without
// remote-image warnings.
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getSmtp, getEmailFrom, getEmailBcc, getAppUrl, getOwnerEmail, getReplyTo } from './runtime-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGO = join(__dirname, '..', 'public', 'assets', 'nbm-logo-light-trimmed.png');

let transport = null;
let transportKey = '';

export function mailer() {
  const smtp = getSmtp();
  if (!smtp.host || !smtp.user) throw new Error('Email is not set up yet — open the setup wizard in the admin console');
  const key = `${smtp.host}:${smtp.port}:${smtp.user}:${smtp.pass}:${smtp.secure}`;
  if (!transport || transportKey !== key) {
    transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      // Without implicit TLS (port 465) insist on a STARTTLS upgrade: never
      // fall back to a plaintext session carrying the mailbox password and
      // client PDFs.
      requireTLS: !smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
      // Fail fast with a clear error instead of hanging for minutes when
      // a host is typo'd or unreachable.
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 60_000,
    });
    transportKey = key;
  }
  return transport;
}

const nf = new Intl.NumberFormat('en-GB');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The report email leads with the same story as the PDF: the verdict,
// the wins, then the numbers, then what happens next. Change notes come
// from the story layer, so a wobble inside normal variation reads as
// "level" in grey instead of a red arrow, and red is never used for a
// figure that merely went down.
const INK = '#0f1012', PAPER = '#f1eee7', GREEN = '#4db88c', GREEN_INK = '#1e6b4a', MUTED = '#575b61', SOFT = '#d5d8db';
const SANS = "Arial,'Helvetica Neue',Helvetica,sans-serif";
const label = (text, color = MUTED) => `<div style="font-family:${SANS};font-size:10px;font-weight:bold;letter-spacing:1.6px;text-transform:uppercase;color:${color};">${text}</div>`;

function changeNote(t, prevWord) {
  if (!t || t.dir === 'none') return '';
  const pct = t.pct == null ? '' : ` ${Math.abs(t.pct).toFixed(0)}%`;
  if (t.dir === 'up') return `<div style="font-family:${SANS};font-size:11px;font-weight:bold;color:${GREEN_INK};margin-top:4px;">up${pct}</div>`;
  if (t.dir === 'down') return `<div style="font-family:${SANS};font-size:11px;color:${MUTED};margin-top:4px;">down${pct}</div>`;
  return `<div style="font-family:${SANS};font-size:11px;color:#8a8e94;margin-top:4px;">level with ${prevWord}</div>`;
}

function stat(name, value, note = '') {
  return `<td valign="top" width="25%" style="padding:14px 10px 14px 0;border-top:2px solid ${INK};">
    ${label(name)}
    <div style="font-family:${SANS};font-size:26px;font-weight:bold;color:${INK};line-height:1.1;margin-top:6px;">${value}</div>
    ${note}
  </td>`;
}

function listRows(items, marker) {
  return items.map((it, k) => `<tr>
    <td valign="top" width="26" style="padding:0 0 12px;font-family:${SANS};font-size:12px;font-weight:bold;color:${GREEN_INK};">${marker(k)}</td>
    <td valign="top" style="padding:0 0 12px;font-family:${SANS};font-size:14px;line-height:1.5;color:#16181b;">
      <strong>${esc(it.title)}</strong><br><span style="color:${MUTED};">${esc(it.detail)}</span></td>
  </tr>`).join('');
}

const firstName = site => String(site.contact_name || '').trim().split(/\s+/)[0] || '';

// Shown only on copies that go to the owner (previews and held reports):
// what the sense check found. Never part of an email a client receives.
function ownerBanner(check, held, realTo) {
  if (!check || (!held && !check.holds.length && !check.notes.length)) return '';
  const li = items => items.map(t => `<li style="margin:0 0 6px;">${esc(t)}</li>`).join('');
  const title = held ? 'Held back: this report has NOT gone to the client'
    : check.holds.length ? 'Sense check: this would be held if the site were live' : 'Sense check: passed, with notes';
  return `<tr><td style="background:#fff7dc;border-bottom:3px solid #f2c230;padding:18px 32px;font-family:${SANS};font-size:13px;line-height:1.5;color:#16181b;">
    <strong style="font-size:14px;">${title}</strong>
    ${check.holds.length ? `<div style="margin:10px 0 4px;font-weight:bold;">Why:</div><ul style="margin:0;padding-left:18px;">${li(check.holds)}</ul>` : ''}
    ${check.notes.length ? `<div style="margin:10px 0 4px;font-weight:bold;">Notes:</div><ul style="margin:0;padding-left:18px;">${li(check.notes)}</ul>` : ''}
    ${held ? `<div style="margin-top:10px;">It would have gone to ${esc(realTo.join(', '))}. To send it as it is, open Pulse, find the site, open History and press <strong>Send to client</strong>. Nothing else will be sent for this period until you do.</div>` : ''}
  </td></tr>`;
}

export function reportEmailHtml(site, data, periodText, banner = '') {
  const trusted = data.ga4?.overview && !data.ga4.unreliable;
  const o = trusted ? data.ga4.overview : null;
  const s = data.search && !data.search.empty ? data.search.summary : null;
  const story = data.story, ins = data.insights;
  const prevWord = story?.period?.prev || 'the period before';
  const dashUrl = `${getAppUrl()}/r/${site.dashboard_token}`;
  const name = firstName(site);

  const stats = [];
  if (o) stats.push(stat('Visits', nf.format(Math.round(o.sessions)), changeNote(story?.trends?.visits, prevWord)));
  if (s) stats.push(stat('Google clicks', nf.format(Math.round(s.clicks)), changeNote(story?.trends?.clicks, prevWord)));
  if (s) stats.push(stat('Shown on Google', nf.format(Math.round(s.impressions)), changeNote(story?.trends?.shown, prevWord)));
  if (story?.pageOne) stats.push(stat('Page-one searches', `${story.pageOne.count} of ${story.pageOne.of}`));

  const wins = (ins?.wins?.length ? ins.wins : (story?.wins || [])).slice(0, 3);
  const actions = (ins?.actions || []).slice(0, 2);
  const work = (data.workDone || []).slice(0, 4);
  const verdict = story?.verdict?.label || 'Your website report';
  const standfirst = ins?.headline || story?.verdict?.line || '';

  return `<!doctype html><html><body style="margin:0;padding:0;background:${PAPER};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:24px 0;"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;">
      ${banner}
      <tr><td style="background:${INK};padding:26px 32px 0;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td><img src="cid:nbmlogo" alt="North Bear Media" height="40" style="display:block;"></td>
          <td align="right">${label('Website report', GREEN)}<div style="height:3px;"></div>${label(esc(periodText), SOFT)}</td>
        </tr></table>
      </td></tr>
      <tr><td style="background:${INK};padding:30px 32px 30px;border-bottom:4px solid ${GREEN};">
        ${label(esc(site.client_name), '#a6abb1')}
        <h1 style="font-family:'Arial Narrow',${SANS};font-size:34px;line-height:1.02;font-weight:bold;text-transform:uppercase;letter-spacing:.3px;color:#ffffff;margin:8px 0 12px;">${esc(verdict)}</h1>
        ${standfirst ? `<p style="font-family:${SANS};font-size:15px;line-height:1.55;color:${SOFT};margin:0;">${esc(standfirst)}</p>` : ''}
      </td></tr>
      <tr><td style="padding:28px 32px 6px;">
        <p style="font-family:${SANS};font-size:14px;color:#16181b;margin:0 0 20px;line-height:1.6;">
          ${name ? `Hi ${esc(name)},` : 'Hello,'} here is the report for <strong>${esc(site.domain || site.client_name)}</strong>
          covering <strong>${esc(periodText)}</strong>. The full report is attached as a PDF.
        </p>
        ${stats.length ? `<table width="100%" cellpadding="0" cellspacing="0"><tr>${stats.join('')}</tr></table>` : ''}
      </td></tr>
      ${wins.length ? `<tr><td style="padding:18px 32px 4px;">
        ${label('What went well', GREEN_INK)}
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">${listRows(wins, () => '&#9632;')}</table>
      </td></tr>` : ''}
      ${work.length ? `<tr><td style="padding:10px 32px 4px;">
        ${label('What we did for you', GREEN_INK)}
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">${work.map(w => `<tr>
          <td valign="top" width="26" style="padding:0 0 10px;font-family:${SANS};font-size:12px;font-weight:bold;color:${GREEN_INK};">&#10003;</td>
          <td valign="top" style="padding:0 0 10px;font-family:${SANS};font-size:14px;line-height:1.5;color:#16181b;">${esc(w.title)}</td></tr>`).join('')}</table>
      </td></tr>` : ''}
      ${actions.length ? `<tr><td style="padding:10px 32px 4px;">
        ${label('Where we go from here', GREEN_INK)}
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">${listRows(actions, k => `0${k + 1}`)}</table>
      </td></tr>` : ''}
      <tr><td style="padding:14px 32px 30px;">
        <table cellpadding="0" cellspacing="0"><tr><td style="background:${GREEN};">
          <a href="${dashUrl}" style="display:inline-block;padding:14px 26px;font-family:${SANS};font-size:12px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:${INK};text-decoration:none;">Open your live dashboard</a>
        </td></tr></table>
        <p style="font-family:${SANS};font-size:12px;color:${MUTED};margin:14px 0 0;line-height:1.5;">
          Your dashboard is always up to date. Have a question about anything here? Just reply to this email.
        </p>
      </td></tr>
      <tr><td style="background:${PAPER};padding:18px 32px;border-top:1px solid #d9d5cc;">
        <p style="font-family:${SANS};font-size:11px;color:${MUTED};margin:0;">
          North Bear Media · northbearmedia.co.uk · info@northbearmedia.co.uk
        </p>
        <p style="font-family:${SANS};font-size:11px;color:#8a8e94;margin:6px 0 0;">
          You are receiving this because North Bear Media looks after your website.
          To change how often you get reports, or to stop them, just reply to this email.
        </p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

// Plain-text alternative part — HTML-only mail with a PDF attachment from a
// small mailbox is a classic spam-score profile; a text part fixes that and
// serves text-only mail clients.
function reportEmailText(site, data, periodText) {
  const trusted = data.ga4?.overview && !data.ga4.unreliable;
  const o = trusted ? data.ga4.overview : null;
  const s = data.search && !data.search.empty ? data.search.summary : null;
  const story = data.story, ins = data.insights;
  const name = firstName(site);
  const lines = [
    name ? `Hi ${name},` : 'Hello,',
    '',
    `Here is the report for ${site.domain || site.client_name} covering ${periodText}. The full report is attached as a PDF.`,
    '',
  ];
  if (story?.verdict) lines.push(`${story.verdict.label}. ${ins?.headline || story.verdict.line}`, '');
  if (o) lines.push(`Visits: ${nf.format(Math.round(o.sessions))}`);
  if (s) lines.push(`Google clicks: ${nf.format(Math.round(s.clicks))} · Times shown on Google: ${nf.format(Math.round(s.impressions))}`);
  const wins = (ins?.wins?.length ? ins.wins : (story?.wins || [])).slice(0, 3);
  if (wins.length) lines.push('', 'What went well:', ...wins.map(w => `- ${w.title}. ${w.detail}`));
  const actions = (ins?.actions || []).slice(0, 2);
  if ((data.workDone || []).length) lines.push('', 'What we did for you:', ...data.workDone.slice(0, 4).map(w => `- ${w.title}`));
  if (actions.length) lines.push('', 'Where we go from here:', ...actions.map((a, k) => `${k + 1}. ${a.title}. ${a.detail}`));
  lines.push('', `Your live dashboard: ${getAppUrl()}/r/${site.dashboard_token}`, '',
    'North Bear Media · northbearmedia.co.uk · info@northbearmedia.co.uk',
    'To change how often you get reports, or to stop them, just reply to this email.');
  return lines.join('\n');
}

export async function sendReportEmail(site, data, pdfBuffer, periodText, filename, { check = null, held = false } = {}) {
  const realTo = site.contact_emails.split(',').map(e => e.trim()).filter(Boolean);
  if (!realTo.length) throw new Error('No contact email set for this client');
  // A site reaches its actual CLIENT only when the owner has switched THAT
  // site Live (per-site, from its card in the admin console). Otherwise the
  // full report is produced on its real schedule but delivered to the owner
  // only, tagged as a preview — so nothing ever lands in a client's inbox
  // without a deliberate, per-site, authenticated click. No global switch
  // can release the whole fleet at once.
  const live = site.delivery_live === 1;
  // A report the sense check held goes to the owner only, whatever the
  // site's live switch says.
  const test = !live || held;
  const to = test ? [getOwnerEmail()] : realTo;
  const subject = (held ? `[HELD, needs a look before it goes to ${realTo.join(', ')}] `
    : test ? `[PREVIEW, would send to ${realTo.join(', ')}] ` : '')
    + `Your website report: ${site.client_name} (${periodText})`;
  const banner = test ? ownerBanner(check, held, realTo) : '';
  const replyTo = getReplyTo();
  await mailer().sendMail({
    from: getEmailFrom(),
    to,
    bcc: test ? undefined : (getEmailBcc() || undefined),
    replyTo: replyTo || undefined,
    subject,
    html: reportEmailHtml(site, data, periodText, banner),
    text: reportEmailText(site, data, periodText),
    headers: replyTo ? { 'List-Unsubscribe': `<mailto:${replyTo}?subject=Unsubscribe%20${encodeURIComponent(site.domain || site.client_name)}>` } : undefined,
    attachments: [
      { filename, content: pdfBuffer, contentType: 'application/pdf' },
      { filename: 'nbm-logo.png', path: LOGO, cid: 'nbmlogo' },
    ],
  });
  return held ? realTo.map(e => `HELD→${e}`) : test ? realTo.map(e => `TEST→${e}`) : realTo;
}

export async function testSmtp() {
  await mailer().verify();
  return true;
}

// A real end-to-end test: actually delivers a branded email, so "it works"
// means it genuinely landed in an inbox.
export async function sendTestEmail(to) {
  await mailer().sendMail({
    from: getEmailFrom(),
    to,
    subject: 'North Bear Pulse — test email ✓',
    html: `<!doctype html><html><body style="margin:0;padding:0;background:#eef0f3;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f3;padding:24px 0;"><tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#221f20;padding:24px 28px;border-bottom:3px solid #2eaa7b;">
          <img src="cid:nbmlogo" alt="North Bear Media" height="40" style="display:block;">
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="font-family:Arial,sans-serif;font-size:18px;color:#23262c;margin:0 0 8px;">Email is working 🎉</h1>
          <p style="font-family:Arial,sans-serif;font-size:14px;color:#5c6470;margin:0;line-height:1.6;">
            North Bear Pulse can send email through this mailbox. Client reports will look
            like this — branded, with their PDF attached and a link to their live dashboard.
          </p>
        </td></tr>
      </table>
    </td></tr></table></body></html>`,
    attachments: [{ filename: 'nbm-logo.png', path: LOGO, cid: 'nbmlogo' }],
  });
  return true;
}
