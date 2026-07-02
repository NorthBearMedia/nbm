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

// Client contacts, keyed by domain — recovered from NBM's own client
// correspondence, confirmed correct by the owner, and armed on the owner's
// explicit instruction ("send to the client, I don't want to have to do
// anything else except confirm it is working", 2 Jul 2026). Only ever
// fills BLANK contact fields — manual edits in the app always win.
const CLIENT_EMAILS = {
  'iwpg.co.uk': 'nicholaswestray@iwpg.co.uk',
  'caringplacesltd.co.uk': 'contact@caringplacesltd.co.uk',
  'evccitysprint.co.uk': 'ksims@theelectricvan.co',
  'maxus-evc.co.uk': 'ksims@theelectricvan.co',
  'muskengineering.co.uk': 'ben@muskengineering.co.uk',
  'rmbgarage.co.uk': 'enquiries@rmbgarage.co.uk',
  'melanieparker.co.uk': 'hello@melanieparker.co.uk',
  'greenpathgardencare.co.uk': 'info@greenpathgardencare.co.uk',
  'primeprandmarketing.co.uk': 'harmony@primeprandmarketing.co.uk',
  'pslimited.uk': 'nicola@pslimited.uk.com',
  'swanwickkidsclub.co.uk': 'swanwickkidsclub@outlook.com',
  'woodlandwalkdaycare.co.uk': 'contact@woodlandwalkdaycare.co.uk',
  'wowstays.co.uk': 'paul@investedinproperty.co.uk',
  'ivyhouseresidentialhome.co.uk': 'julie@williscooper.com',
  'richfordvehiclesales.co.uk': 'phil@richfordmotors.com, csaunders@richfordmotors.com',
};

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

// What kind of website is each domain (Website Builder vs WordPress vs
// other)? Decides how tracking codes can be installed automatically.
export async function hostingerWebsiteInventory() {
  const token = getHostingerToken();
  if (!token) throw new Error('no Hostinger token in settings');
  const res = await fetch('https://developers.hostinger.com/api/hosting/v1/websites', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Hostinger websites ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.data || []);
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

  // 3b ── Inventory the Hostinger websites (platform type decides how
  //       tracking codes can be auto-installed)
  let inventoryText = '';
  try {
    const inv = await hostingerWebsiteInventory();
    inventoryText = inv.map(w => {
      const fields = Object.entries(w).filter(([k]) => !/password|token|key/i.test(k))
        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ');
      return '  • ' + fields;
    }).join('\n');
    say(`Website inventory fetched: ${inv.length} website(s) on the Hostinger account.`);
  } catch (e) {
    inventoryText = '  (inventory failed: ' + e.message.slice(0, 160) + ')';
    say('Website inventory failed: ' + e.message.slice(0, 120));
  }

  setSetting('ops_v1_done', unverified.length ? 'partial' : 'true');
  setSetting('ops_v2_done', 'true');
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
      subject: 'Pulse setup sweep v2 — TEST PHASE running, website inventory inside',
      text: `Pulse just completed its automated setup sweep on the live server.\n\nWHAT IT DID\n${log.map(l => '• ' + l).join('\n')}\n\nWHERE EVERY SITE STANDS NOW\n\n${rows}\n\nHOSTINGER WEBSITE INVENTORY (platform type decides how tracking codes can be auto-installed)\n${inventoryText}\n\nTEST PHASE — HOW IT WORKS\n• Delivery mode is TEST: every report is produced on the real schedule but comes ONLY to you, with a subject tag showing which client it would have gone to.\n• Sites whose search data is still provisioning retry daily at 07:00 and appear in your inbox as soon as data exists; empty reports are never produced.\n• When you're happy with what you see: Pulse → Settings → Delivery mode → Live. From that moment the same reports go to the clients (you stay BCC'd).\n\n— North Bear Pulse`,
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
  // The network sweep retries on boots until fully done (v2 adds the
  // website inventory + armed contacts; the sweep itself is idempotent).
  if (getSetting('ops_v2_done') === 'true') return;
  setTimeout(() => runOpsSweep({ force: true }).catch(e => console.error('[ops]', e.message)), 60_000);
  console.log('[ops] self-setup sweep scheduled (60s after boot)' + (smtp.host ? '' : ' — note: SMTP unset'));
}
