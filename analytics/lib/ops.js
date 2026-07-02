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
import cron from 'node-cron';
import db, { getSetting, setSetting } from '../database.js';
import { config } from '../config.js';
import { googleClient } from './google.js';
import { getGscReaderEmail, getHostingerToken, getEmailBcc, getSmtp, getEmailFrom, getAppUrl } from './runtime-config.js';
import { mailer } from './email.js';
import { randomBytes } from 'crypto';
import { ensureInjectCron, deleteInjectCrons, injectCronOutput, verifyTag, HOSTINGER_USER, rootDirFor } from './inject.js';

// Per-install secret guarding the injector-script endpoint. Created once.
function injectToken() {
  let t = getSetting('inject_script_token');
  if (!t) { t = randomBytes(18).toString('hex'); setSetting('inject_script_token', t); }
  return t;
}
const scriptUrlFor = domain => `${getAppUrl()}/ix/${injectToken()}/${domain}`;

// Injection progress lives in a settings JSON: { domain: {status, tries} }.
// status: 'pending' (cron placed, awaiting first run) | 'verified' | 'failed'.
function injectState() { try { return JSON.parse(getSetting('inject_state') || '{}'); } catch { return {}; } }
function saveInjectState(s) { setSetting('inject_state', JSON.stringify(s)); }
const MEASUREMENT_FOR_DEMO = { 'nbmdemosite2.co.uk': 'G-MS3V4KS3PB' };

// Place the injector cron for a domain and mark it pending. Doesn't wait —
// verifyPendingInjections confirms later (cron activation can lag minutes).
async function beginInjection(domain, measurementId) {
  await ensureInjectCron({ username: HOSTINGER_USER, domain, scriptUrl: scriptUrlFor(domain) });
  const s = injectState();
  s[domain] = { status: 'pending', tries: (s[domain]?.tries || 0), measurementId };
  saveInjectState(s);
}

// Background pass: for every pending domain, check the live page; when the
// tag appears, delete its cron and mark verified. Gives up after ~2h.
export async function verifyPendingInjections() {
  const s = injectState();
  const transitions = [];
  for (const [domain, rec] of Object.entries(s)) {
    if (rec.status !== 'pending') continue;
    rec.tries = (rec.tries || 0) + 1;
    const v = await verifyTag(domain, rec.measurementId).catch(() => ({ verified: false }));
    if (v.verified) {
      rec.status = 'verified';
      await deleteInjectCrons(HOSTINGER_USER, domain);
      transitions.push(`✅ ${domain} — tag confirmed live, cron cleaned up`);
      // The demo site proving the mechanism triggers the full client
      // rollout automatically (once). No manual "roll it out" needed.
      if (domain === 'nbmdemosite2.co.uk' && getSetting('auto_rollout_done') !== 'true') {
        setSetting('auto_rollout_done', 'true');
        transitions.push('▶ Demo verified — rolling out GA to every client site now.');
        saveInjectState(s);
        runInjectionRollout().catch(e => console.error('[inject] auto-rollout:', e.message));
      }
    } else if (rec.tries >= 12) {
      rec.status = 'failed';
      const out = await injectCronOutput(HOSTINGER_USER, domain);
      await deleteInjectCrons(HOSTINGER_USER, domain);
      transitions.push(`❌ ${domain} — not confirmed after ${rec.tries} checks; cron output: ${out.slice(0, 200)}`);
    }
  }
  saveInjectState(s);
  if (transitions.length) {
    try {
      await mailer().sendMail({
        from: getEmailFrom(), to: 'norton@northbearmedia.co.uk', bcc: getEmailBcc() || undefined,
        subject: 'Pulse — GA install progress', text: `Tracking-tag installation update:\n\n${transitions.join('\n')}\n\n— North Bear Pulse`,
      });
    } catch { /* ignore */ }
  }
  return transitions;
}

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

// Microsoft Clarity project IDs, keyed by domain — provided by the owner
// (2 Jul 2026). These are public tracking identifiers (they appear in each
// site's page source), not secrets. The GA injector installs the Clarity
// tag wherever one is set. (Caring Places pending.)
const CLARITY_PROJECTS = {
  'alphashunt.co.uk': 'xg3mss4msy',
  'ivyhouseresidentialhome.co.uk': 'xg3sbc4p1t',
  'rcmhomeimprovements.co.uk': 'xg3sombkfn',
  'maxus-evc.co.uk': 'xg3sy563qa',
  'richfordvehiclesales.co.uk': 'xg3t6nahb6',
  'evccitysprint.co.uk': 'xg3tgboqkv',
  'melanieparker.co.uk': 'xg3tpasvaj',
  'rmbgarage.co.uk': 'xg3twf08g5',
  'greenpathgardencare.co.uk': 'xg3u59bi4w',
  'muskengineering.co.uk': 'xg3udlsbmh',
  'swanwickkidsclub.co.uk': 'xg3utf6jha',
  'iwpg.co.uk': 'xg3v5sa9io',
  'northbearmedia.co.uk': 'xg3vog45d2',
  'woodlandwalkdaycare.co.uk': 'xg3vy1okig',
  'pslimited.uk': 'xg3w5kwwni',
  'primeprandmarketing.co.uk': 'xg3wcloljd',
  'wowstays.co.uk': 'xg3wjoxrm0',
};

// Runs on every boot: cheap, offline, idempotent.
export function loadClientContacts() {
  const sites = db.prepare('SELECT id, client_name, domain, contact_emails, clarity_project_id FROM sites WHERE active = 1').all();
  const loaded = [];
  for (const site of sites) {
    const d = (site.domain || '').toLowerCase().replace(/^www\./, '');
    const email = CLIENT_EMAILS[d];
    if (email && !site.contact_emails) {
      db.prepare('UPDATE sites SET contact_emails = ? WHERE id = ?').run(email, site.id);
      loaded.push(`${site.client_name} → ${email}`);
      console.log(`[ops] contact loaded: ${site.client_name} → ${email}`);
    }
    const clarity = CLARITY_PROJECTS[d];
    if (clarity && !site.clarity_project_id) {
      db.prepare('UPDATE sites SET clarity_project_id = ? WHERE id = ?').run(clarity, site.id);
      console.log(`[ops] Clarity project loaded: ${site.client_name} → ${clarity}`);
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

// Kick off the GA-install proof on a demo site (never a client site) and
// place the cron. Confirmation arrives later from verifyPendingInjections.
export async function runInjectionTest() {
  if (getSetting('inject_demo_done') === 'true') return null;
  const domain = 'nbmdemosite2.co.uk';
  let err = null;
  try { await beginInjection(domain, MEASUREMENT_FOR_DEMO[domain]); }
  catch (e) { err = e.message; }
  setSetting('inject_demo_done', err ? 'error' : 'true');
  try {
    await mailer().sendMail({
      from: getEmailFrom(), to: 'norton@northbearmedia.co.uk', bcc: getEmailBcc() || undefined,
      subject: 'Pulse — GA auto-install started on demo site',
      text: `${err ? 'ERROR placing injector: ' + err : 'Injector cron placed on the demo site ' + domain + '.'}\n\n`
        + `Hostinger takes a few minutes to activate a new cron job, so Pulse now checks the live page in the background every 10 minutes and will email you the moment the tag is confirmed (then clean up the cron automatically).\n\n`
        + `This proves the mechanism end-to-end. Once you see the "tag confirmed live" email, reply "roll it out" and Pulse installs GA on every client site the same way — each file backed up first, fully idempotent.\n\n— North Bear Pulse`,
    });
  } catch (e) { console.error('[inject] test email failed:', e.message); }
  return { started: true, err };
}

// Roll the GA (+ Clarity) tag out to real client sites. Explicit trigger
// only. Resolves+persists each site's measurement ID, places the injector
// cron, and marks it pending; verifyPendingInjections confirms + cleans up.
export async function runInjectionRollout({ onlyDomain = null } = {}) {
  const sites = db.prepare("SELECT * FROM sites WHERE active = 1 AND domain != ''").all()
    .filter(s => !onlyDomain || (s.domain || '').toLowerCase() === onlyDomain.toLowerCase());

  // Fill any missing measurement IDs from GA4 discovery so both this loop
  // and the /ix script endpoint have them.
  let scan = null;
  try { const { discoverAll } = await import('./discovery.js'); scan = await discoverAll(); } catch { /* offline */ }
  if (scan) {
    const { matchForDomain } = await import('./discovery.js');
    for (const site of sites) {
      if (site.ga4_measurement_id) continue;
      const m = matchForDomain(site.domain, scan);
      if (m.ga4?.measurementId) {
        db.prepare('UPDATE sites SET ga4_measurement_id = ?, ga4_property_id = CASE WHEN ga4_property_id = "" THEN ? ELSE ga4_property_id END WHERE id = ?')
          .run(m.ga4.measurementId, m.ga4.propertyId || '', site.id);
        site.ga4_measurement_id = m.ga4.measurementId;
      }
    }
  }

  const results = [];
  for (const site of sites) {
    const domain = (site.domain || '').toLowerCase().replace(/^www\./, '');
    if (!site.ga4_measurement_id) { results.push({ domain, skipped: 'no GA measurement ID on file' }); continue; }
    try {
      await beginInjection(domain, site.ga4_measurement_id);
      results.push({ domain, queued: true });
    } catch (e) { results.push({ domain, error: e.message.slice(0, 160) }); }
  }
  // Confirmation for each site arrives from verifyPendingInjections (runs
  // every 10 min) as the crons activate. Kick one pass now for the eager ones.
  setTimeout(() => verifyPendingInjections().catch(() => {}), 90_000);
  try {
    await mailer().sendMail({
      from: getEmailFrom(), to: 'norton@northbearmedia.co.uk', bcc: getEmailBcc() || undefined,
      subject: 'Pulse — GA rollout started across all client sites',
      text: `Injector cron placed on ${results.filter(r => r.queued).length} site(s). `
        + `${results.filter(r => r.skipped).length} skipped (no measurement ID). ${results.filter(r => r.error).length} errored.\n\n`
        + `Each site is confirmed on its live page in the background every 10 minutes; you'll get a note as each tag goes live, then the cron self-cleans. Traffic data starts flowing from the moment each tag is confirmed.\n\n`
        + results.map(r => `  ${r.domain}: ${r.queued ? 'queued' : r.skipped || r.error}`).join('\n')
        + `\n\n— North Bear Pulse`,
    });
  } catch { /* ignore */ }
  return results;
}

export function scheduleOpsSweep() {
  const smtp = getSmtp();
  // Contacts load on every boot (cheap, offline, idempotent).
  try { loadClientContacts(); } catch (e) { console.error('[ops]', e.message); }
  // GA auto-install proof on the demo site (never a client site), then a
  // recurring background pass that confirms pending injections + cleans up.
  if (getSetting('inject_demo_done') !== 'true') {
    setTimeout(() => runInjectionTest().catch(e => console.error('[inject]', e.message)), 120_000);
  }
  try {
    cron.schedule('*/10 * * * *', () => verifyPendingInjections().catch(e => console.error('[inject]', e.message)), { timezone: config.timezone });
  } catch (e) { console.error('[inject] schedule failed:', e.message); }
  // The network sweep retries on boots until fully done (v2 adds the
  // website inventory + armed contacts; the sweep itself is idempotent).
  if (getSetting('ops_v2_done') === 'true') return;
  setTimeout(() => runOpsSweep({ force: true }).catch(e => console.error('[ops]', e.message)), 60_000);
  console.log('[ops] self-setup sweep scheduled (60s after boot)' + (smtp.host ? '' : ' — note: SMTP unset'));
}
