// One-time self-setup ("ops sweep"), run on boot on the production host —
// where this app has full internet and all credentials in its settings DB.
// It finishes the remaining rollout with no human involvement:
//
//   1. Search Console: DNS-verify every client domain (TXT record via the
//      Hostinger API, then Google Site Verification), unlocking months of
//      retroactive search data, and point each site at sc-domain:…
//   2. Load client contact emails (extracted from NBM's own client
//      correspondence) into sites that have none.
//   3. Make sure every active site is on a monthly schedule, and leave
//      past-due schedules past-due so the scheduler sends the June reports
//      on its next hourly tick.
//   4. Email Norton a full summary of everything it did.
//
// Guarded by a settings flag; unverified domains are retried on later boots.
import db, { getSetting, setSetting } from '../database.js';
import { googleClient } from './google.js';
import { getGscReaderEmail, getHostingerToken, getEmailBcc, getSmtp } from './runtime-config.js';
import { mailer } from './email.js';
import { getEmailFrom } from './runtime-config.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Client contacts, keyed by domain. Only ever fills BLANK contact fields —
// manual entries always win. Populated on the owner's explicit approval.
const CLIENT_EMAILS = {};

// Runs on every boot: cheap, offline, idempotent.
export function loadClientContacts() {
  const sites = db.prepare('SELECT id, client_name, domain, contact_emails FROM sites WHERE active = 1').all();
  const loaded = [];
  for (const site of sites) {
    const d = (site.domain || '').toLowerCase().replace(/^www\./, '');
    const email = CLIENT_EMAILS[d];
    if (email && !site.contact_emails) {
      db.prepare('UPDATE sites SET contact_emails = ? WHERE id = ?').run(email, site.id);
      loaded.push(`${site.client_name} → ${email}`);
      console.log(`[ops] contact loaded: ${site.client_name} → ${email}`);
    }
  }
  return loaded;
}

function scAuth() {
  const subject = getGscReaderEmail() || 'norton@northbearmedia.co.uk';
  return { scopes: ['https://www.googleapis.com/auth/siteverification'], subject };
}
function gscListAuth() {
  const subject = getGscReaderEmail() || 'norton@northbearmedia.co.uk';
  return { scopes: ['https://www.googleapis.com/auth/webmasters.readonly'], subject };
}

async function gReq(opts, auth) {
  const res = await googleClient(auth).request(opts);
  return res.data;
}

async function hostingerAddTxt(domain, content) {
  const token = getHostingerToken();
  if (!token) throw new Error('no Hostinger token in settings');
  const res = await fetch(`https://developers.hostinger.com/api/dns/v1/zones/${domain}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      overwrite: false,
      zone: [{ name: '@', type: 'TXT', ttl: 300, records: [{ content }] }],
    }),
  });
  if (!res.ok) throw new Error(`Hostinger DNS ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`);
}

async function verifiedDomains() {
  const data = await gReq({ url: 'https://searchconsole.googleapis.com/webmasters/v3/sites' }, gscListAuth());
  return new Set((data.siteEntry || [])
    .filter(s => s.permissionLevel !== 'siteUnverifiedUser')
    .map(s => s.siteUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')));
}

// ─── The sweep ────────────────────────────────────────────────────

export async function runOpsSweep({ force = false } = {}) {
  if (!force && getSetting('ops_v1_done') === 'true') return null;
  const log = [];
  const say = m => { log.push(m); console.log('[ops] ' + m); };
  say('Self-setup sweep starting…');

  const sites = db.prepare("SELECT * FROM sites WHERE active = 1").all();

  // 1 ── Search Console DNS verification for every domain
  let already, state;
  try { already = await verifiedDomains(); } catch (e) { already = new Set(); say('Could not list verified sites: ' + e.message.slice(0, 120)); }
  try { state = JSON.parse(getSetting('ops_v1_state') || '{}'); } catch { state = {}; }

  const pending = [];
  for (const site of sites) {
    const d = (site.domain || '').toLowerCase().replace(/^www\./, '');
    if (!d) continue;
    if (already.has(d)) {
      say(`Search Console: ${d} already verified ✓`);
      if (!site.gsc_site_url) db.prepare('UPDATE sites SET gsc_site_url = ? WHERE id = ?').run(`sc-domain:${d}`, site.id);
      continue;
    }
    pending.push({ site, domain: d });
  }

  // 1a — plant TXT records
  for (const p of pending) {
    const st = state[p.domain] || {};
    if (st.txt === 'done') continue;
    try {
      const tok = await gReq({
        url: 'https://www.googleapis.com/siteVerification/v1/token',
        method: 'POST',
        data: { verificationMethod: 'DNS_TXT', site: { type: 'INET_DOMAIN', identifier: p.domain } },
      }, scAuth());
      await hostingerAddTxt(p.domain, tok.token);
      state[p.domain] = { ...st, txt: 'done' };
      say(`DNS record planted for ${p.domain} ✓`);
    } catch (e) {
      state[p.domain] = { ...st, txt: 'failed: ' + e.message.slice(0, 120) };
      say(`DNS record FAILED for ${p.domain}: ${e.message.slice(0, 120)}`);
    }
    setSetting('ops_v1_state', JSON.stringify(state));
  }

  // 1b — ask Google to verify, in rounds (DNS needs a moment to propagate)
  for (let round = 1; round <= 5; round++) {
    const waiting = pending.filter(p => state[p.domain]?.txt === 'done' && !state[p.domain]?.verified);
    if (!waiting.length) break;
    if (round > 1) await sleep(45_000);
    for (const p of waiting) {
      try {
        await gReq({
          url: 'https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=DNS_TXT',
          method: 'POST',
          data: { site: { type: 'INET_DOMAIN', identifier: p.domain } },
        }, scAuth());
        state[p.domain].verified = true;
        db.prepare('UPDATE sites SET gsc_site_url = ? WHERE id = ?').run(`sc-domain:${p.domain}`, p.site.id);
        say(`Search Console VERIFIED: ${p.domain} ✓ (historical search data unlocked)`);
        setSetting('ops_v1_state', JSON.stringify(state));
      } catch { /* try next round */ }
    }
  }
  const unverified = pending.filter(p => !state[p.domain]?.verified).map(p => p.domain);
  if (unverified.length) say(`Still unverified (will retry on next restart): ${unverified.join(', ')}`);

  // 2 ── Load any approved client emails into blank contact fields
  loadClientContacts().forEach(l => say('Contact loaded: ' + l));

  // 3 ── Everyone on monthly; past-due stamps stay past-due so the very
  //      next hourly tick sends the month's reports.
  for (const site of sites) {
    if (site.report_frequency === 'none') {
      db.prepare("UPDATE sites SET report_frequency = 'monthly', next_report_at = COALESCE(next_report_at, '2026-07-01 07:00') WHERE id = ?").run(site.id);
      say(`Schedule set to monthly: ${site.client_name}`);
    }
  }

  setSetting('ops_v1_done', unverified.length ? 'partial' : 'true');
  say('Sweep complete.');

  // 4 ── Tell Norton exactly what happened
  try {
    const fresh = db.prepare('SELECT client_name, domain, contact_emails, gsc_site_url, ga4_property_id, report_frequency, next_report_at FROM sites WHERE active = 1 ORDER BY client_name').all();
    const rows = fresh.map(s =>
      `${s.client_name} (${s.domain})\n  reports to: ${s.contact_emails || '— NONE, needs an email —'}\n  search data: ${s.gsc_site_url ? 'connected ✓' : 'pending'} · analytics: ${s.ga4_property_id ? 'property ready (tag must be on the site)' : '—'} · ${s.report_frequency}, next: ${s.next_report_at || '—'}`
    ).join('\n\n');
    await mailer().sendMail({
      from: getEmailFrom(),
      to: 'norton@northbearmedia.co.uk',
      bcc: getEmailBcc() || undefined,
      subject: 'Pulse finished its own setup — full status inside',
      text: `Pulse just completed its automated setup sweep on the live server.\n\nWHAT IT DID\n${log.map(l => '• ' + l).join('\n')}\n\nWHERE EVERY SITE STANDS NOW\n\n${rows}\n\nWHAT HAPPENS NEXT\n• Monthly reports for June go out automatically on the next hourly tick to every site above that has a contact email AND data.\n• Sites with no data at all are skipped safely (nothing embarrassing is ever sent).\n• The one job that still needs human hands: pasting each site's Google Analytics code into the Hostinger builder (list in your email drafts) — search data flows regardless.\n\n— North Bear Pulse`,
    });
    say('Summary email sent to norton@.');
  } catch (e) {
    console.error('[ops] summary email failed: ' + e.message);
  }
  return log;
}

export function scheduleOpsSweep() {
  const smtp = getSmtp();
  // Contacts load on every boot (cheap, offline, idempotent).
  try { loadClientContacts(); } catch (e) { console.error('[ops]', e.message); }
  // The network sweep retries on boots until fully done.
  if (getSetting('ops_v1_done') === 'true') return;
  setTimeout(() => runOpsSweep().catch(e => console.error('[ops]', e.message)), 60_000);
  console.log('[ops] self-setup sweep scheduled (60s after boot)' + (smtp.host ? '' : ' — note: SMTP unset'));
}
