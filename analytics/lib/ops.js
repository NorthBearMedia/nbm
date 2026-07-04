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
import { ensureInjectCron, deleteInjectCrons, injectCronOutput, verifyTag, ensureCron, cronOutputMatching, deleteCronsMatching, HOSTINGER_USER, rootDirFor } from './inject.js';

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
  // Fresh attempt: tries resets to 0; spread keeps failure history
  // (lastFailSig) so repeat identical failures stay email-suppressed.
  s[domain] = { ...(s[domain] || {}), status: 'pending', tries: 0, measurementId, at: Date.now() };
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
    } else if (rec.tries >= 36) { // ~6h — Hostinger runs custom crons far less often than every minute
      rec.status = 'failed';
      const out = await injectCronOutput(HOSTINGER_USER, domain);
      await deleteInjectCrons(HOSTINGER_USER, domain);
      // A site stuck for a known reason (e.g. builder-served page while
      // the owner's paste is pending) retries every ~6h — announce each
      // DISTINCT failure once, not the same one four times a day.
      const sig = String(out).slice(0, 120);
      if (rec.lastFailSig !== sig) {
        rec.lastFailSig = sig;
        transitions.push(`❌ ${domain} — not confirmed after ${rec.tries} checks; cron output: ${out.slice(0, 200)}`);
      } else {
        console.log('[inject] repeat failure, email suppressed:', domain);
      }
    }
  }
  saveInjectState(s);
  if (transitions.length) {
    // These emails are the only visibility into the install pipeline —
    // don't swallow a send failure, retry once then log loudly.
    const msg = {
      from: getEmailFrom(), to: 'norton@northbearmedia.co.uk', bcc: getEmailBcc() || undefined,
      subject: 'Pulse — GA install progress', text: `Tracking-tag installation update:\n\n${transitions.join('\n')}\n\n— North Bear Pulse`,
    };
    try { await mailer().sendMail(msg); }
    catch (e1) {
      console.error('[inject] progress email failed, retrying in 30s:', e1.message);
      await sleep(30_000);
      try { await mailer().sendMail(msg); }
      catch (e2) { console.error('[inject] progress email failed twice — transitions were:', transitions.join(' | '), '—', e2.message); }
    }
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
  'caringplacesltd.co.uk': 'wc1ztw49v3',
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

// GA4 web measurement IDs, keyed by domain — read directly from NBM's own
// GA4 account (each property's web data stream). Like Clarity IDs these
// are PUBLIC (they appear in every page's source), not secrets. The
// in-app GA4 discovery was leaving these blank, which stalled the tag
// rollout ("waiting on a GA measurement ID"); loading them from this
// owner-confirmed map fills every blank deterministically. Manual edits
// in the app always win (only BLANK fields are filled).
const GA_MEASUREMENT = {
  'iwpg.co.uk': 'G-QHLC82Q1KW',
  'northbearmedia.co.uk': 'G-9NX0CJ85CL',
  'caringplacesltd.co.uk': 'G-57BCDN5VTS',
  'primeprandmarketing.co.uk': 'G-ETTX5ZCWYW',
  'rcmhomeimprovements.co.uk': 'G-MGEREL8SFQ',
  'richfordvehiclesales.co.uk': 'G-Z5RX27WP2V',
  'maxus-evc.co.uk': 'G-T7CFY4BNKZ',
  'alphashunt.co.uk': 'G-3YKJX05JJ4',
  'ivyhouseresidentialhome.co.uk': 'G-JDE3V1EFV2',
  'pslimited.uk': 'G-PPYF902922',
  'rmbgarage.co.uk': 'G-5WT1S570JR',
  'wowstays.co.uk': 'G-B13EC6D2GG',
  'evccitysprint.co.uk': 'G-TEZ0FFLV2T',
  'greenpathgardencare.co.uk': 'G-NMSX1W8JPM',
  'swanwickkidsclub.co.uk': 'G-LWMK96TY1W',
  'muskengineering.co.uk': 'G-ZFNRCD6V17',
  'woodlandwalkdaycare.co.uk': 'G-29XJD64544',
  'melanieparker.co.uk': 'G-5VJGBD4YWR',
};

// Runs on every boot: cheap, offline, idempotent.
export function loadClientContacts() {
  const sites = db.prepare('SELECT id, client_name, domain, contact_emails, clarity_project_id, ga4_measurement_id FROM sites WHERE active = 1').all();
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
    const mid = GA_MEASUREMENT[d];
    if (mid && !site.ga4_measurement_id) {
      db.prepare('UPDATE sites SET ga4_measurement_id = ? WHERE id = ?').run(mid, site.id);
      console.log(`[ops] GA measurement ID loaded: ${site.client_name} → ${mid}`);
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
// quiet: boot-time retries skip the "started" email (the boot status email
// carries the same info) — errors always email.
export async function runInjectionTest({ quiet = false } = {}) {
  if (getSetting('inject_demo_done') === 'true') return null;
  const domain = 'nbmdemosite2.co.uk';
  let err = null;
  try { await beginInjection(domain, MEASUREMENT_FOR_DEMO[domain]); }
  catch (e) { err = e.message; }
  setSetting('inject_demo_done', err ? 'error' : 'true');
  if (err || !quiet) {
    try {
      await mailer().sendMail({
        from: getEmailFrom(), to: 'norton@northbearmedia.co.uk', bcc: getEmailBcc() || undefined,
        subject: 'Pulse — GA auto-install started on demo site',
        text: `${err ? 'ERROR placing injector: ' + err : 'Injector cron placed on the demo site ' + domain + '.'}\n\n`
          + `Hostinger takes a few minutes to activate a new cron job, so Pulse now checks the live page in the background every 10 minutes and will email you the moment the tag is confirmed (then clean up the cron automatically).\n\n`
          + `This proves the mechanism end-to-end. The moment the demo tag is confirmed live, Pulse rolls GA + Clarity out to every client site automatically — each file backed up first, fully idempotent.\n\n— North Bear Pulse`,
      });
    } catch (e) { console.error('[inject] test email failed:', e.message); }
  }
  return { started: true, err };
}

// Roll the GA (+ Clarity) tag out to real client sites. Explicit trigger
// only. Resolves+persists each site's measurement ID, places the injector
// cron, and marks it pending; verifyPendingInjections confirms + cleans up.
export async function runInjectionRollout({ onlyDomain = null } = {}) {
  const sites = db.prepare("SELECT * FROM sites WHERE active = 1 AND domain != ''").all()
    .filter(s => !onlyDomain || (s.domain || '').toLowerCase() === onlyDomain.toLowerCase());

  // Fill any missing measurement IDs from GA4 discovery so both this loop
  // and the /ix script endpoint have them. Time-boxed: discovery hanging
  // must never stall the whole rollout (it did — the "rollout started"
  // email and every cron placement sat behind an un-timed-out await).
  let scan = null;
  try {
    const { discoverAll } = await import('./discovery.js');
    scan = await Promise.race([
      discoverAll(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('discovery timed out')), 25_000)),
    ]);
  } catch (e) { console.error('[inject] discovery skipped:', e.message); }
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

// File-hosted domains (from the server docroot survey, 3 Jul): the only
// sites the file injector can tag. Builder-hosted (Horizons) sites have
// no editable files — their tag goes in via the site builder, so placing
// injector crons for them is pointless churn that can only end in a
// failure email.
const AUTO_TAGGABLE = new Set([
  'northbearmedia.co.uk', 'richfordvehiclesales.co.uk', 'wowstays.co.uk',
  'ivyhouseresidentialhome.co.uk', 'primeprandmarketing.co.uk',
  'rcmhomeimprovements.co.uk', 'rmbgarage.co.uk', 'evccitysprint.co.uk',
  'melanieparker.co.uk',
]);

// Self-healing rollout reconciler. Runs every 10 min once the demo has
// proven the mechanism. For every file-hosted client site that has a GA
// measurement ID and isn't already verified or mid-attempt, make sure an
// injector cron is placed and the site is marked pending. Idempotent
// (ensureInjectCron dedupes) — this recovers a rollout that hung or
// errored (e.g. GA4 discovery stalled) WITHOUT depending on the one-shot
// auto_rollout_done flag. A FAILED attempt is retried with a fresh
// window (whatever failed it may since be fixed — it was), so no site is
// ever permanently stranded. Emits one summary the first time it places.
export async function reconcileRolloutCrons() {
  if (injectState()['nbmdemosite2.co.uk']?.status !== 'verified') return { skipped: 'demo not verified' };
  const sites = db.prepare("SELECT * FROM sites WHERE active = 1 AND domain != ''").all();
  const state = injectState();
  const placed = [], noId = [];
  for (const site of sites) {
    const domain = (site.domain || '').toLowerCase().replace(/^www\./, '');
    if (domain === 'nbmdemosite2.co.uk' || !AUTO_TAGGABLE.has(domain)) continue;
    const rec = state[domain];
    if (rec && (rec.status === 'verified' || rec.status === 'pending')) continue;
    if (!site.ga4_measurement_id) { noId.push(domain); continue; }
    try {
      await ensureInjectCron({ username: HOSTINGER_USER, domain, scriptUrl: scriptUrlFor(domain) });
      state[domain] = { ...(state[domain] || {}), status: 'pending', tries: 0, measurementId: site.ga4_measurement_id, at: Date.now() };
      placed.push(domain);
    } catch (e) { console.error('[reconcile]', domain, e.message); }
  }
  saveInjectState(state);
  if (placed.length && getSetting('reconcile_announced') !== 'true') {
    setSetting('reconcile_announced', 'true');
    try {
      await mailer().sendMail({
        from: getEmailFrom(), to: 'norton@northbearmedia.co.uk', bcc: getEmailBcc() || undefined,
        subject: 'Pulse — GA rollout resumed across client sites',
        text: `The demo is verified, so Pulse is installing GA + Clarity on your client sites.\n\n`
          + `Injector cron placed on ${placed.length} site(s):\n${placed.map(d => '  • ' + d).join('\n')}\n\n`
          + (noId.length ? `Waiting on a GA measurement ID (skipped for now): ${noId.join(', ')}\n\n` : '')
          + `Each is confirmed on its live page every 10 minutes; you'll get a ✅ as each goes live. Builder-hosted (Horizons) sites won't have editable files and will need the tag added in their builder — separate note to follow.\n\n— North Bear Pulse`,
      });
    } catch (e) { console.error('[reconcile] email failed:', e.message); }
  }
  return { placed: placed.length, noId: noId.length };
}

// Search Console finalizer. Ownership of every client domain was DNS-
// verified on 3 Jul, but registering the sc-domain PROPERTY (what the
// report queries) needs the webmasters WRITE scope, which the Workspace
// delegation may not include yet. Retry on a timer: the moment the scope
// is granted in admin.google.com, every property registers itself, each
// site's gsc_site_url is pointed at it, and months of Google rankings
// data flow into the reports — with no further human step. Idempotent.
async function finalizeSearchConsole() {
  if (getSetting('gsc_finalized') === 'true') return;
  const subject = getGscReaderEmail() || 'norton@northbearmedia.co.uk';
  let client;
  try {
    client = googleClient({ scopes: ['https://www.googleapis.com/auth/webmasters'], subject });
    await client.getAccessToken(); // throws unauthorized_client until the scope is granted
  } catch (e) { console.log('[gsc] webmasters scope not granted yet (' + e.message.slice(0, 60) + ')'); return; }
  const sites = db.prepare("SELECT * FROM sites WHERE active = 1 AND domain != ''").all();
  const added = [], failed = [];
  for (const site of sites) {
    const d = (site.domain || '').toLowerCase().replace(/^www\./, '');
    if (!d || d === 'nbmdemosite2.co.uk') continue;
    try {
      await client.request({ url: 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent('sc-domain:' + d), method: 'PUT' });
      db.prepare('UPDATE sites SET gsc_site_url = ? WHERE id = ?').run('sc-domain:' + d, site.id);
      added.push(d);
    } catch (e) {
      // evccitysprint's sc-domain never verified, but its URL-prefix
      // property exists and is owned — use that instead.
      if (d === 'evccitysprint.co.uk') {
        db.prepare('UPDATE sites SET gsc_site_url = ? WHERE id = ?').run('https://evccitysprint.co.uk/', site.id);
        added.push(d + ' (url-prefix)');
      } else failed.push(`${d} (${e.message.slice(0, 50)})`);
    }
  }
  if (added.length) {
    setSetting('gsc_finalized', 'true');
    try {
      await mailer().sendMail({
        from: getEmailFrom(), to: 'norton@northbearmedia.co.uk', bcc: getEmailBcc() || undefined,
        subject: 'Pulse — Google Search Console connected for all sites',
        text: `The webmasters scope is live, so Pulse just registered Search Console for your sites — Google rankings data (including months of history) now flows into every report and dashboard.\n\n`
          + `Connected (${added.length}):\n${added.map(x => '  ✅ ' + x).join('\n')}\n`
          + (failed.length ? `\nNot connected (${failed.length}):\n${failed.map(x => '  ⚠️ ' + x).join('\n')}\n` : '')
          + `\n— North Bear Pulse`,
      });
    } catch (e) { console.error('[gsc] finalize email failed:', e.message); }
  }
}

// Survey command: lists every index.html under the domains tree (depth:
// domains/<domain>/public_html/index.html). Single program invocation,
// no shell metacharacters (Hostinger execs cron commands without a shell)
// and no wildcards.
const SURVEY_CMD = `find /home/${HOSTINGER_USER}/domains -maxdepth 3 -name index.html`;

async function runDocrootSurvey() {
  if (getSetting('docroot_survey_done') === 'true') return;
  await ensureCron(HOSTINGER_USER, SURVEY_CMD);
  await sleep(8 * 60_000); // give Hostinger time to activate + run it
  const out = await cronOutputMatching(HOSTINGER_USER, '-name index.html');
  if (!out) return; // not captured yet — leave the cron, retry next boot
  setSetting('docroot_survey_done', 'true');
  await deleteCronsMatching(HOSTINGER_USER, '-name index.html');
  const found = out.split('\n').map(l => l.trim()).filter(l => l.includes('/domains/'));
  const domainsWithFiles = [...new Set(found.map(l => (l.match(/\/domains\/([^/]+)\//) || [])[1]).filter(Boolean))];
  const sites = db.prepare("SELECT domain FROM sites WHERE active = 1 AND domain != ''").all()
    .map(s => s.domain.toLowerCase().replace(/^www\./, ''));
  const injectable = sites.filter(d => domainsWithFiles.includes(d));
  const builderHosted = sites.filter(d => !domainsWithFiles.includes(d));
  try {
    await mailer().sendMail({
      from: getEmailFrom(), to: 'norton@northbearmedia.co.uk', bcc: getEmailBcc() || undefined,
      subject: 'Pulse — website file survey (which sites can be auto-tagged)',
      text: `Pulse surveyed the hosting server for editable website files.\n\n`
        + `AUTO-TAGGABLE (HTML files on the server — Pulse installs GA + Clarity itself):\n`
        + (injectable.length ? injectable.map(d => `  ✅ ${d}`).join('\n') : '  (none)') + '\n\n'
        + `BUILDER-HOSTED (no editable files — e.g. Hostinger Horizons; the tag must be added in the site's builder settings):\n`
        + (builderHosted.length ? builderHosted.map(d => `  🔧 ${d}`).join('\n') : '  (none)') + '\n\n'
        + `Raw survey output:\n${out.slice(0, 1500)}\n\n— North Bear Pulse`,
    });
  } catch (e) { console.error('[ops] survey email failed:', e.message); }
}

// One-shot: read back the staged file the download cron wrote. Its
// contents identify WHICH server answered the /ix fetch (the file has
// been an HTML page — whose page it is tells us where the public domain
// actually routes).
const PEEK_CMD = `head -30 /home/${HOSTINGER_USER}/nbm-ix-nbmdemosite2.co.uk.sh`;

async function runStagedFilePeek() {
  if (getSetting('staged_peek_done') === 'true') return;
  await ensureCron(HOSTINGER_USER, PEEK_CMD);
  await sleep(8 * 60_000);
  const out = await cronOutputMatching(HOSTINGER_USER, 'head -30');
  if (!out) return; // not captured yet — retry next boot
  setSetting('staged_peek_done', 'true');
  await deleteCronsMatching(HOSTINGER_USER, 'head -30');
  try {
    await mailer().sendMail({
      from: getEmailFrom(), to: 'norton@northbearmedia.co.uk', bcc: getEmailBcc() || undefined,
      subject: 'Pulse — staged installer file contents (diagnostic)',
      text: `First 30 lines of the file the install cron downloaded (identifies which server the public domain routes to):\n\n${out.slice(0, 2500)}\n\n— North Bear Pulse`,
    });
  } catch (e) { console.error('[ops] peek email failed:', e.message); }
}

// Bumped whenever the cron/injection mechanism changes. A mismatch on boot
// wipes non-verified injection state, removes stale crons built with the
// old mechanism, and re-runs the demo proof — no human involvement.
// v2: shell-free cron pair (Hostinger execs cron commands without a shell,
// so the v1 curl|sh pipeline reached curl as literal arguments and failed).
// v3: script URL self-healed from RAILWAY_PUBLIC_DOMAIN — the download
// cron was fetching app_url/ix/…, and a wrong app_url serves an HTML page
// (the staged "script" began with <!DOCTYPE html>, which sh can't run).
// Old crons embed the bad URL, so they must be recreated.
const INJECT_MECH_VERSION = '3';

export function scheduleOpsSweep() {
  const smtp = getSmtp();
  // Self-heal app_url: Railway tells this container its real public
  // domain. If the stored app_url points anywhere else (and isn't a
  // railway.app URL someone set deliberately), correct it — this is what
  // the injector script URL and every email's dashboard link build on.
  const rwDomain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL || '';
  if (rwDomain) {
    const want = 'https://' + rwDomain.replace(/^https?:\/\//, '');
    const cur = getAppUrl();
    if (cur !== want && !cur.includes('railway.app')) {
      setSetting('app_url', want);
      console.log('[ops] app_url self-healed:', cur || '(blank)', '→', want);
    }
  }
  // Contacts load on every boot (cheap, offline, idempotent).
  try { loadClientContacts(); } catch (e) { console.error('[ops]', e.message); }
  // GA auto-install proof on the demo site (never a client site), then a
  // recurring background pass that confirms pending injections + cleans up.
  if (getSetting('inject_mech_version') !== INJECT_MECH_VERSION) {
    setSetting('inject_mech_version', INJECT_MECH_VERSION);
    setSetting('inject_demo_done', 'false');
    setSetting('auto_rollout_done', 'false');
    const s = injectState();
    for (const [d, rec] of Object.entries(s)) if (rec.status !== 'verified') delete s[d];
    saveInjectState(s);
    deleteInjectCrons(HOSTINGER_USER).catch(() => {});
    console.log('[inject] mechanism v' + INJECT_MECH_VERSION + ' — state reset, demo proof will re-run');
  }
  // Retry the demo proof until it actually VERIFIES (the done-flag only
  // means "attempted") — but never restart a LIVE attempt: frequent
  // deploys were resetting the try counter every boot, so the verifier
  // could neither finish nor report. Only begin fresh when there's no
  // attempt, the last one failed, or a pending one has gone stale.
  const demoRec = injectState()['nbmdemosite2.co.uk'];
  const demoStale = !demoRec || demoRec.status === 'failed'
    || (demoRec.status === 'pending' && Date.now() - (demoRec.at || 0) > 3 * 3600_000);
  if (demoRec?.status !== 'verified' && getSetting('auto_rollout_done') !== 'true' && demoStale) {
    const retry = getSetting('inject_demo_done') === 'true'; // not first attempt
    if (retry) setSetting('inject_demo_done', 'false');
    setTimeout(() => runInjectionTest({ quiet: retry }).catch(e => console.error('[inject]', e.message)), 120_000);
  }
  // Boot status email: proof the deploy is alive + where the install
  // pipeline stands, including the demo crons' captured output so a
  // failing install is diagnosable without waiting for the ❌ email.
  // Rate-limited so a crash-looping container can't flood the inbox.
  setTimeout(async () => {
    const last = Number(getSetting('boot_email_at') || 0);
    // 10 min: tight enough to stop a crash-loop flood, loose enough that
    // back-to-back deploys still each confirm themselves + carry fresh
    // cron diagnostics (a 30-min limit left a blind gap today).
    if (Date.now() - last < 10 * 60_000) return;
    setSetting('boot_email_at', String(Date.now()));
    const state = injectState();
    const lines = Object.entries(state).map(([d, r]) => `  ${d}: ${r.status}${r.tries ? ` (${r.tries} checks)` : ''}`);
    // Per-pending-site diagnostics (non-demo): why hasn't each verified?
    // Shows the injector cron's captured output + a live-tag check.
    const pendingDiag = [];
    for (const [d, r] of Object.entries(state)) {
      if (r.status !== 'pending' || d === 'nbmdemosite2.co.uk') continue;
      const out = await injectCronOutput(HOSTINGER_USER, d).catch(e => '(err ' + e.message.slice(0, 40) + ')');
      const lv = await verifyTag(d, r.measurementId).catch(() => ({ verified: false }));
      pendingDiag.push(`  ${d}: live=${lv.verified ? 'TAG ✅' : 'no tag'} | cron: ${String(out).replace(/\n/g, ' ').slice(0, 160)}`);
    }
    const cronOut = await injectCronOutput(HOSTINGER_USER, 'nbmdemosite2.co.uk').catch(e => '(unavailable: ' + e.message.slice(0, 80) + ')');
    const live = await verifyTag('nbmdemosite2.co.uk', MEASUREMENT_FOR_DEMO['nbmdemosite2.co.uk']).catch(() => ({ verified: false }));
    // Fetch our own /ix URL through the public edge — the exact path the
    // Hostinger cron takes. Distinguishes "edge/app broken" (self-fetch
    // fails too) from "Hostinger-side network or cron cadence".
    const selfCheck = await fetch(scriptUrlFor('nbmdemosite2.co.uk'), { redirect: 'follow' })
      .then(async r => `HTTP ${r.status}; body starts: ${JSON.stringify((await r.text()).slice(0, 60))}`)
      .catch(e => 'FAILED: ' + e.message.slice(0, 120));
    mailer().sendMail({
      from: getEmailFrom(), to: 'norton@northbearmedia.co.uk', bcc: getEmailBcc() || undefined,
      subject: 'Pulse status — deploy is live',
      text: `Pulse booted OK on the live server (mechanism v${INJECT_MECH_VERSION}, delivery mode: ${getSetting('delivery_mode') || 'test'}).\n\n`
        + `Tag-install pipeline:\n${lines.length ? lines.join('\n') : '  (demo proof starting — placement email follows if it is the first attempt)'}\n\n`
        + (pendingDiag.length ? `Pending client sites — why not verified yet:\n${pendingDiag.join('\n')}\n\n` : '')
        + `Demo install cron output (diagnostics):\n  ${String(cronOut).slice(0, 800)}\n\n`
        + `Demo live-page check right now: ${live.verified ? 'TAG VISIBLE ✅ (' + live.url + ')' : 'tag not visible yet'}\n`
        + `Self-fetch of the injector URL via public edge: ${selfCheck}\n`
        + `Last recorded crash: ${getSetting('last_crash') || '(none recorded)'}\n`
        + `Injector script URL in use: ${scriptUrlFor('nbmdemosite2.co.uk')}\n`
        + `Railway domain for this container: ${process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL || '(not set)'}\n\n`
        + `Pulse re-checks pending installs every 10 minutes and emails on every change. If you ever stop hearing from Pulse entirely, the app or its email is down — check Railway.\n\n— North Bear Pulse`,
    }).catch(e => console.error('[ops] boot status email failed:', e.message));
  }, 240_000);
  // One-shot docroot survey: which domains actually have editable HTML
  // files on the hosting (injectable) vs builder-hosted sites (Horizons
  // etc.) that need the tag added in their builder settings. Places a
  // single metacharacter-free find cron, reads its captured output a few
  // minutes later, emails the inventory and cleans up. Retries on later
  // boots until output is captured.
  setTimeout(() => runDocrootSurvey().catch(e => console.error('[ops] docroot survey:', e.message)), 300_000);
  setTimeout(() => runStagedFilePeek().catch(e => console.error('[ops] staged peek:', e.message)), 330_000);
  // Search Console finalizer: cheap no-op until the webmasters scope is
  // granted, then completes GSC for every site in one pass.
  setTimeout(() => finalizeSearchConsole().catch(e => console.error('[gsc]', e.message)), 150_000);
  try {
    cron.schedule('7 * * * *', () => finalizeSearchConsole().catch(e => console.error('[gsc]', e.message)), { timezone: config.timezone });
  } catch (e) { console.error('[gsc] schedule failed:', e.message); }
  try {
    cron.schedule('*/10 * * * *', () => verifyPendingInjections().catch(e => console.error('[inject]', e.message)), { timezone: config.timezone });
    // Self-heal a stalled rollout: place crons for any unverified client
    // site. Runs shortly after boot and every 10 min thereafter.
    cron.schedule('*/10 * * * *', () => reconcileRolloutCrons().catch(e => console.error('[reconcile]', e.message)), { timezone: config.timezone });
  } catch (e) { console.error('[inject] schedule failed:', e.message); }
  setTimeout(() => reconcileRolloutCrons().catch(e => console.error('[reconcile]', e.message)), 360_000);
  // The network sweep retries on boots until fully done (v2 adds the
  // website inventory + armed contacts; the sweep itself is idempotent).
  if (getSetting('ops_v2_done') === 'true') return;
  setTimeout(() => runOpsSweep({ force: true }).catch(e => console.error('[ops]', e.message)), 60_000);
  console.log('[ops] self-setup sweep scheduled (60s after boot)' + (smtp.host ? '' : ' — note: SMTP unset'));
}
