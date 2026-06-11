// Branded report emails via SMTP (works out of the box with a Hostinger
// mailbox). The logo is embedded as a cid attachment so it shows without
// remote-image warnings.
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from '../config.js';
import { formatDate } from './dates.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGO = join(__dirname, '..', 'public', 'assets', 'nbm-logo-light-trimmed.png');

let transport = null;
export function mailer() {
  if (!config.smtp.host || !config.smtp.user) throw new Error('SMTP is not configured — see .env.example');
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transport;
}

const nf = new Intl.NumberFormat('en-GB');

function stat(label, value) {
  return `<td align="center" style="padding:14px 8px;background:#f5f6f8;border-radius:8px;">
    <div style="font-size:22px;font-weight:bold;color:#23262c;font-family:Arial,sans-serif;">${value}</div>
    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;font-family:Arial,sans-serif;margin-top:4px;">${label}</div>
  </td>`;
}

export function reportEmailHtml(site, data, periodText) {
  const o = data.ga4?.overview;
  const s = data.search?.summary;
  const dashUrl = `${config.appUrl}/r/${site.dashboard_token}`;
  const stats = [];
  if (o) {
    stats.push(stat('Visits', nf.format(Math.round(o.sessions))));
    stats.push(stat('Visitors', nf.format(Math.round(o.totalUsers))));
  }
  if (s) stats.push(stat('Google clicks', nf.format(Math.round(s.clicks))));

  return `<!doctype html><html><body style="margin:0;padding:0;background:#eef0f3;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f3;padding:24px 0;"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#221f20;padding:28px 32px;border-bottom:3px solid #2eaa7b;">
        <img src="cid:nbmlogo" alt="North Bear Media" height="44" style="display:block;">
      </td></tr>
      <tr><td style="padding:32px;">
        <h1 style="font-family:Arial,sans-serif;font-size:20px;color:#23262c;margin:0 0 6px;">Your website report is ready</h1>
        <p style="font-family:Arial,sans-serif;font-size:14px;color:#5c6470;margin:0 0 20px;line-height:1.6;">
          Hi${site.contact_name ? ' ' + site.contact_name.split(' ')[0] : ''}, here's the performance report for
          <strong>${site.domain || site.client_name}</strong> covering <strong>${periodText}</strong>.
          The full report is attached as a PDF.
        </p>
        ${stats.length ? `<table width="100%" cellpadding="0" cellspacing="8"><tr>${stats.join('')}</tr></table>` : ''}
        <table cellpadding="0" cellspacing="0" style="margin:24px auto 8px;"><tr><td style="border-radius:8px;background:#2eaa7b;">
          <a href="${dashUrl}" style="display:inline-block;padding:13px 28px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">View your live dashboard</a>
        </td></tr></table>
        <p style="font-family:Arial,sans-serif;font-size:12px;color:#98a0ac;text-align:center;margin:8px 0 0;">
          Want an up-to-the-minute report? Open your dashboard and tap <strong>"Email me a fresh report"</strong> any time.
        </p>
      </td></tr>
      <tr><td style="background:#f5f6f8;padding:20px 32px;">
        <p style="font-family:Arial,sans-serif;font-size:11px;color:#98a0ac;margin:0;text-align:center;">
          North Bear Media · northbearmedia.co.uk · info@northbearmedia.co.uk
        </p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export async function sendReportEmail(site, data, pdfBuffer, periodText, filename) {
  const to = site.contact_emails.split(',').map(e => e.trim()).filter(Boolean);
  if (!to.length) throw new Error('No contact email set for this client');
  await mailer().sendMail({
    from: config.emailFrom,
    to,
    bcc: config.emailBcc || undefined,
    subject: `Your website report — ${site.client_name} (${periodText})`,
    html: reportEmailHtml(site, data, periodText),
    attachments: [
      { filename, content: pdfBuffer, contentType: 'application/pdf' },
      { filename: 'nbm-logo.png', path: LOGO, cid: 'nbmlogo' },
    ],
  });
  return to;
}

export async function testSmtp() {
  await mailer().verify();
  return true;
}
