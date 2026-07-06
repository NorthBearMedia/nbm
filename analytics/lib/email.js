// Branded report emails via SMTP (works out of the box with a Hostinger
// mailbox). The logo is embedded as a cid attachment so it shows without
// remote-image warnings.
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getSmtp, getEmailFrom, getEmailBcc, getAppUrl, getDeliveryMode } from './runtime-config.js';

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

function trendHtml(pct, invert = false) {
  if (pct == null || !isFinite(pct)) return '';
  const good = invert ? pct <= 0 : pct >= 0;
  const color = good ? '#1e8a61' : '#d9534f';
  const arrow = pct >= 0 ? '\u25b2' : '\u25bc';
  return `<div style="font-size:11px;font-weight:bold;color:${color};font-family:Arial,sans-serif;margin-top:3px;">${arrow} ${Math.abs(pct).toFixed(1)}%</div>`;
}

function stat(label, value, trend = '') {
  return `<td align="center" style="padding:14px 8px;background:#f5f6f8;border-radius:8px;">
    <div style="font-size:22px;font-weight:bold;color:#23262c;font-family:Arial,sans-serif;">${value}</div>
    ${trend}
    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;font-family:Arial,sans-serif;margin-top:4px;">${label}</div>
  </td>`;
}

function pctOf(cur, prev) {
  if (prev == null || cur == null || !prev) return null;
  return ((cur - prev) / prev) * 100;
}

export function reportEmailHtml(site, data, periodText) {
  const o = data.ga4?.overview, po = data.ga4?.prevOverview || {};
  const s = data.search?.summary, ps = data.search?.prevSummary || {};
  const dashUrl = `${getAppUrl()}/r/${site.dashboard_token}`;
  const stats = [];
  if (o) {
    stats.push(stat('Visits', nf.format(Math.round(o.sessions)), trendHtml(pctOf(o.sessions, po.sessions))));
    stats.push(stat('Visitors', nf.format(Math.round(o.totalUsers)), trendHtml(pctOf(o.totalUsers, po.totalUsers))));
  }
  if (s) stats.push(stat('Google clicks', nf.format(Math.round(s.clicks)), trendHtml(pctOf(s.clicks, ps.clicks))));
  if (s && s.position) {
    // Rank movement in places — plain English, not a percentage.
    const move = ps.position ? ps.position - s.position : null;
    const moveHtml = move == null ? ''
      : `<div style="font-size:11px;font-weight:bold;color:${move >= 0 ? '#1e8a61' : '#d9534f'};font-family:Arial,sans-serif;margin-top:3px;">${move >= 0 ? '\u25b2 up' : '\u25bc down'} ${Math.abs(move).toFixed(1)} places</div>`;
    stats.push(stat('Google position', s.position.toFixed(1), moveHtml));
  }

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
  const realTo = site.contact_emails.split(',').map(e => e.trim()).filter(Boolean);
  if (!realTo.length) throw new Error('No contact email set for this client');
  // Test mode (default): the full report is produced on the real schedule
  // but delivered ONLY to the owner, tagged with its intended recipients.
  // Flipping Settings → Delivery mode to Live is the owner's arming action.
  const test = getDeliveryMode() !== 'live';
  const to = test ? ['norton@northbearmedia.co.uk'] : realTo;
  const subject = (test ? `[TEST — would send to ${realTo.join(', ')}] ` : '')
    + `Your website report — ${site.client_name} (${periodText})`;
  await mailer().sendMail({
    from: getEmailFrom(),
    to,
    bcc: test ? undefined : (getEmailBcc() || undefined),
    subject,
    html: reportEmailHtml(site, data, periodText),
    attachments: [
      { filename, content: pdfBuffer, contentType: 'application/pdf' },
      { filename: 'nbm-logo.png', path: LOGO, cid: 'nbmlogo' },
    ],
  });
  return test ? realTo.map(e => `TEST→${e}`) : realTo;
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
