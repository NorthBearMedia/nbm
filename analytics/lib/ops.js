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
import db, { getSetting, setSetting, newDashboardToken } from '../database.js';
import { config } from '../config.js';
import { nextRunAt, addDays, todayISO } from './dates.js';
import { googleClient } from './google.js';
import { getGscReaderEmail, getHostingerToken, getEmailBcc, getSmtp, getEmailFrom, getAppUrl } from './runtime-config.js';
import { mailer } from './email.js';
import { randomBytes } from 'crypto';
import { ensureInjectCron, deleteInjectCrons, injectCronOutput, verifyTag, ensureCron, cronOutputMatching, deleteCronsMatching, HOSTINGER_USER, rootDirFor, SNIPPET_VERSION } from './inject.js';

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
// What each business actually IS, in a line — fed to the report writer so
// its recommendations are about what the client sells, not guessed from URL
// slugs. Loaded into a BLANK "About this business" field only; anything the
// owner types there is never overwritten. Facts only, from public sources.
const BUSINESS_ABOUT = {
  'steadplan.co.uk': 'Commercial vehicle dealership across the north of England: authorised MAN dealer (new and used truck and van sales, leasing, servicing and repairs with genuine parts) and official Ford van converter, including custom seating.',
};

const CLIENT_EMAILS = {
  'williscooper.com': 'emma@williscooper.com',
  'active-personnel.co.uk': 'Ashley@active-personnel.co.uk',
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
  'williscooper.com': 'G-3P870GR1ZQ',
  'active-personnel.co.uk': 'G-27R2729ZBK',
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

// GA4 PROPERTY IDs, keyed by domain — read from NBM's GA4 account (the
// numeric property behind each measurement ID). The report data fetch
// queries by property ID; sites loaded with only a measurement ID showed
// "analytics not connected" on their dashboards because this was blank.
const GA_PROPERTY = {
  'williscooper.com': '544325864',
  'active-personnel.co.uk': '544332915',
  'iwpg.co.uk': '526989557',
  'northbearmedia.co.uk': '526994009',
  'caringplacesltd.co.uk': '533120439',
  'primeprandmarketing.co.uk': '541248640',
  'rcmhomeimprovements.co.uk': '541257675',
  'richfordvehiclesales.co.uk': '541271955',
  'maxus-evc.co.uk': '541282763',
  'alphashunt.co.uk': '541294057',
  'ivyhouseresidentialhome.co.uk': '541295397',
  'pslimited.uk': '541298626',
  'rmbgarage.co.uk': '541299194',
  'wowstays.co.uk': '541299533',
  'evccitysprint.co.uk': '541301551',
  'greenpathgardencare.co.uk': '541303151',
  'swanwickkidsclub.co.uk': '541307695',
  'muskengineering.co.uk': '541328965',
  'woodlandwalkdaycare.co.uk': '541334500',
  'melanieparker.co.uk': '541335650',
};

// Starter target keywords per site — the searches each business plausibly
// wants to win, grounded in their real Search Console queries + brand terms.
// Seeded ONCE into blank fields (flag below); the owner refines them in
// Edit site → Target keywords, and his edits/clears are never overwritten.
const TARGET_KEYWORDS = {
  'northbearmedia.co.uk': 'brand photographer derbyshire, commercial videographer derby, content marketing agency derbyshire, north bear media',
  'caringplacesltd.co.uk': 'day services for adults with disabilities, supported living derbyshire, respite care derby, caring places',
  'iwpg.co.uk': 'industrial warehouse group, industrial units to let, warehouse space to rent, iwpg',
  'primeprandmarketing.co.uk': 'pr agency derby, marketing agency derbyshire, pr and marketing agency, prime pr',
  'rcmhomeimprovements.co.uk': 'home improvements derby, builder derby, rcm home improvements',
  'richfordvehiclesales.co.uk': 'used recovery truck for sale, recovery trucks for sale uk, richford vehicle sales',
  'maxus-evc.co.uk': 'maxus electric van dealer, electric commercial vehicles, electric van dealership uk',
  'alphashunt.co.uk': 'shunter vehicle hire, terminal tractor hire, alpha shunt',
  'ivyhouseresidentialhome.co.uk': 'care home mickleover, residential care home derby, ivy house care home',
  'pslimited.uk': 'personnel solutions, recruitment agency derby, ps limited',
  'rmbgarage.co.uk': 'garage ambergate, mot ambergate, mechanics near me, rmb garage',
  'wowstays.co.uk': 'wow stays, luxury holiday lets, self catering holiday accommodation',
  'evccitysprint.co.uk': 'electric van company, electric van leasing, evc city sprint',
  'greenpathgardencare.co.uk': 'gardener allestree, garden maintenance derby, greenpath garden care',
  'swanwickkidsclub.co.uk': 'holiday club swanwick, childcare swanwick, kids club derbyshire',
  'muskengineering.co.uk': 'process services peterborough, industrial pipework contractors, musk engineering',
  'woodlandwalkdaycare.co.uk': 'day nursery bottesford, childcare bottesford, woodland walk daycare',
  'melanieparker.co.uk': 'physiotherapy belper, home visit physio derbyshire, private physiotherapist derby',
  'williscooper.com': 'willis cooper',
  'active-personnel.co.uk': 'recruitment agency, active personnel',
  'ensohr.co.uk': 'enso hr, hr consultant',
  'cn-maintenance.com': 'cn maintenance, property maintenance',
};

// Sites the owner manages but whose DOMAINS he doesn't control (so no
// Hostinger DNS / no sc-domain). Rows are created here if missing; GA ids
// and contacts fill from the maps above; Search Console verifies via the
// GA tag (see verifyManagedSitesGsc) as a URL-prefix property.
const MANAGED_SITES = [
  { name: 'Willis Cooper', domain: 'williscooper.com' },
  { name: 'Active Personnel', domain: 'active-personnel.co.uk' },
];

// New client sites to bring into the fleet: rows are created held
// (owner-only reports until reviewed), then onboardNewSites() wires up
// GA4 (find or CREATE the property), Search Console (DNS route when the
// domain is on our Hostinger, tag route otherwise) and the tag install —
// all hands-off. Add a name+domain here and the machinery does the rest.
const NEW_SITES = [
  { name: 'Enso HR', domain: 'ensohr.co.uk' },
  { name: 'CN Maintenance', domain: 'cn-maintenance.com' },
];

function ensureManagedSites() {
  // Managed sites are held until their GSC verifies (verifyManagedSitesGsc
  // releases); new fleet sites are held until the owner reviews and
  // unticks "Hold back" — either way nothing half-set-up reaches a client.
  const wanted = [
    ...MANAGED_SITES.map(m => ({ ...m, note: 'Managed site (domain not ours) — added by ops' })),
    ...NEW_SITES.map(m => ({ ...m, note: 'New site — auto-onboarding by ops' })),
  ];
  for (const m of wanted) {
    const existing = db.prepare("SELECT id FROM sites WHERE lower(replace(domain,'www.','')) = ?").get(m.domain);
    if (existing) continue;
    db.prepare(`INSERT INTO sites (client_name, domain, report_frequency, notes, dashboard_token, next_report_at, delivery_hold)
                VALUES (?, ?, 'monthly', ?, ?, ?, 1)`)
      .run(m.name, m.domain, m.note, newDashboardToken(), nextRunAt('monthly'));
    console.log('[ops] site created (delivery held):', m.domain);
  }
}

// Runs on every boot: cheap, offline, idempotent.
export function loadClientContacts() {
  const sites = db.prepare('SELECT id, client_name, domain, contact_emails, clarity_project_id, ga4_measurement_id, ga4_property_id, notes FROM sites WHERE active = 1').all();
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
    const pid = GA_PROPERTY[d];
    if (pid && !site.ga4_property_id) {
      db.prepare('UPDATE sites SET ga4_property_id = ? WHERE id = ?').run(pid, site.id);
      console.log(`[ops] GA property ID loaded: ${site.client_name} → ${pid}`);
    }
    const about = BUSINESS_ABOUT[d];
    if (about && !(site.notes || '').trim()) {
      db.prepare('UPDATE sites SET notes = ? WHERE id = ?').run(about, site.id);
      console.log(`[ops] business description loaded: ${site.client_name}`);
    }
  }
  // Target keywords: seed starter values into BLANK fields, re-running
  // only when the map itself changes (new sites added) — keyed on the
  // map's domains so the owner's edits/clears are never overwritten by
  // a mere reboot.
  const seedKey = Object.keys(TARGET_KEYWORDS).sort().join(',');
  if (getSetting('target_keywords_seed_hash') !== seedKey) {
    for (const site of sites) {
      const d = (site.domain || '').toLowerCase().replace(/^www\./, '');
      const kws = TARGET_KEYWORDS[d];
      if (!kws) continue;
      const cur = db.prepare('SELECT target_keywords FROM sites WHERE id = ?').get(site.id);
      if (cur && !cur.target_keywords) {
        db.prepare('UPDATE sites SET target_keywords = ? WHERE id = ?').run(kws, site.id);
        // Record the seed as OURS, so deriveTargetKeywords may later
        // upgrade it from real Search Console data — while still never
        // overwriting anything the owner types himself.
        try {
          const auto = JSON.parse(getSetting('target_keywords_auto') || '{}');
          auto[d] = kws;
          setSetting('target_keywords_auto', JSON.stringify(auto));
        } catch { /* non-fatal */ }
        console.log(`[ops] target keywords seeded: ${site.client_name}`);
      }
    }
    setSetting('target_keywords_seed_hash', seedKey);
  }
  return loaded;
}

// One-shot after the property-ID fix: generate the owner's own site
// report and email it with a per-source connection summary — the
// requested sense check proving GA + GSC + Clarity + AI all work.
async function sendSenseCheckReport() {
  if (getSetting('sense_check_v1_sent') === 'true') return;
  const site = db.prepare("SELECT * FROM sites WHERE active = 1 AND lower(domain) LIKE '%northbearmedia.co.uk%'").get();
  if (!site) return;
  const { gatherReportData } = await import('./report-data.js');
  const { generateReportPdf } = await import('./pdf.js');
  const { addDays, todayISO } = await import('./dates.js');
  const end = addDays(todayISO(), -1), start = addDays(end, -29);
  const data = await gatherReportData(site, start, end);
  const pdf = await generateReportPdf(data);
  const cl = data.clarity;
  const lines = [
    data.ga4?.overview
      ? `Google Analytics: ✓ connected — ${Math.round(data.ga4.overview.sessions)} visit(s) in the period (your own tag only went live 3 Jul, so numbers build from now)`
      : 'Google Analytics: ✗ NOT returning data',
    data.search?.summary
      ? `Google Search Console: ✓ connected — ${Math.round(data.search.summary.clicks)} Google clicks, avg position ${(data.search.summary.position || 0).toFixed(1)}, ${(data.search.topQueries || []).length} top search terms`
      : 'Google Search Console: ✗ NOT returning data',
    cl
      ? `Microsoft Clarity: ✓ connected — ${cl.daysCovered} day(s) of behaviour data so far`
      : 'Microsoft Clarity: token saved, no data yet — first sync runs tonight at 03:40, behaviour sections fill from tomorrow',
    data.siteHealth && data.siteHealth.performance != null
      ? `Site health (Google PageSpeed): ✓ scored — speed ${data.siteHealth.performance}/100, SEO ${data.siteHealth.seo ?? '—'}/100`
      : 'Site health (Google PageSpeed): pending — scores are fetched and cached on report runs',
    data.insights?.source === 'ai'
      ? 'AI insights (Anthropic): ✓ WORKING — the "What this means" section in the attached report was written by the AI using your key'
      : 'AI insights (Anthropic): ✗ not used — the report fell back to rules-based recommendations (check the key in Settings)',
    (data.warnings || []).length ? `Warnings: ${data.warnings.join(' | ')}` : 'Warnings: none',
  ];
  try {
    await mailer().sendMail({
      from: getEmailFrom(), to: 'norton@northbearmedia.co.uk', bcc: getEmailBcc() || undefined,
      subject: 'Pulse — sense check: North Bear Media report + connection status',
      text: `Full end-to-end sense check for northbearmedia.co.uk (${start} to ${end}). The attached PDF is exactly what a client would receive.

CONNECTIONS
${lines.map(l => '  • ' + l).join('\n')}

— North Bear Pulse`,
      attachments: [{ filename: `sense-check-north-bear-media-${end}.pdf`, content: pdf, contentType: 'application/pdf' }],
    });
    setSetting('sense_check_v1_sent', 'true');
    console.log('[ops] sense-check report sent');
  } catch (e) { console.error('[ops] sense check email failed:', e.message); }
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

  // 3 ── Everyone on monthly, scheduled at the next natural send date (the
  //      3rd, lag-aware). A brand-new/managed site must NOT fire the moment
  //      it's given an email — it waits for the next period boundary, giving
  //      time to finish keywords/Clarity and review the data first.
  for (const site of sites) {
    if (site.report_frequency === 'none') {
      db.prepare("UPDATE sites SET report_frequency = 'monthly', next_report_at = COALESCE(NULLIF(next_report_at, ''), ?) WHERE id = ?").run(nextRunAt('monthly'), site.id);
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
  // Only mark the sweep fully done when nothing is left unverified —
  // otherwise leave it re-runnable so a partially-failed sweep retries on
  // the next boot instead of being stranded forever.
  setSetting('ops_v2_done', unverified.length ? 'partial' : 'true');
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

// New sites aren't in the July survey above — onboardNewSites() classifies
// them from the Hostinger website inventory (builder = no files to edit)
// and records file-hosted ones here. The injector is harmless on a false
// positive (NBM-NO-DOCROOT diagnostic, exit 0), so this errs inclusive.
// Exact host of a GA4 web stream's default URI. Substring matching adopted
// the wrong property: "steadplan.co.uk" is inside "dev.steadplan.co.uk" and
// "personnel.co.uk" inside "active-personnel.co.uk".
function streamHost(uri) {
  try { return new URL(uri || '').hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

function isAutoTaggable(domain) {
  if (AUTO_TAGGABLE.has(domain)) return true;
  try { return JSON.parse(getSetting('file_hosted_extra') || '[]').includes(domain); }
  catch { return false; }
}

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
    if (domain === 'nbmdemosite2.co.uk') continue;
    const rec = state[domain];
    if (rec && (rec.status === 'verified' || rec.status === 'pending')) continue;
    // Nothing at all to install? Skip. But a site with Clarity/Fathom and no
    // GA yet gets those two now — GA follows automatically when its ID
    // arrives (the want-hash changes and the block is replaced).
    if (!site.ga4_measurement_id && !site.clarity_project_id && !site.fathom_site_id) { noId.push(domain); continue; }
    if (isAutoTaggable(domain)) {
      try {
        await ensureInjectCron({ username: HOSTINGER_USER, domain, scriptUrl: scriptUrlFor(domain) });
        state[domain] = { ...(state[domain] || {}), status: 'pending', tries: 0, measurementId: site.ga4_measurement_id, at: Date.now() };
        placed.push(domain);
      } catch (e) { console.error('[reconcile]', domain, e.message); }
    } else {
      // Builder-hosted (Horizons etc.): nothing to inject, but the owner
      // pastes the tag in the site builder — WATCH the live page so that
      // paste still earns its ✅ confirmation email. No crons placed.
      state[domain] = { ...(state[domain] || {}), status: 'pending', tries: 0, measurementId: site.ga4_measurement_id, at: Date.now(), watchOnly: true };
    }
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

// ── Tag retrofit: keep every file-hosted site's live page matching the
// snippet it SHOULD have — GA present, Clarity present when the site has a
// project ID, consent banner present exactly when the owner's toggle is on.
// The original rollout was one-shot per site, so a Clarity ID added later
// (or the banner toggle) would otherwise never reach the page. Uses the
// same cron+injector machinery (which now replaces existing blocks), runs
// hourly, retries capped, all state in settings. Console-only: results
// show in the Connections panel, not the inbox.
async function fetchLivePage(domain) {
  for (const url of [`https://${domain}/?nbmv=${Date.now()}`, `https://www.${domain}/?nbmv=${Date.now()}`]) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'NorthBearPulse/1.0', 'Cache-Control': 'no-cache' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (res.ok) return (await res.text()).slice(0, 2_000_000);
    } catch { /* try next */ }
  }
  return null;
}

export async function retrofitTags() {
  if (!getHostingerToken()) return { skipped: 'no Hostinger token' };
  if (injectState()['nbmdemosite2.co.uk']?.status !== 'verified') return { skipped: 'demo not verified' };
  const banner = getSetting('consent_banner') === 'true';
  let state = {};
  try { state = JSON.parse(getSetting('retrofit_state') || '{}'); } catch { /* fresh */ }
  // The success criteria changed (a tool that is demonstrably delivering
  // data now counts as installed), so sites that exhausted their retries
  // under the old, unsatisfiable rule deserve a fresh assessment.
  if (getSetting('retrofit_criteria_v2') !== 'true') {
    for (const rec of Object.values(state)) if (rec && rec.tries >= 4) { rec.tries = 0; rec.done = false; }
    setSetting('retrofit_criteria_v2', 'true');
    console.log('[retrofit] criteria updated — stuck sites reset for reassessment');
  }
  const sites = db.prepare("SELECT * FROM sites WHERE active = 1 AND domain != '' AND (ga4_measurement_id != '' OR clarity_project_id != '' OR fathom_site_id != '')").all();
  let checked = 0, placed = 0;
  for (const site of sites) {
    const domain = (site.domain || '').toLowerCase().replace(/^www\./, '');
    if (!isAutoTaggable(domain)) continue;
    // Includes SNIPPET_VERSION so a change to the tag CODE (not just the
    // IDs) re-deploys to sites already marked done.
    const want = `v${SNIPPET_VERSION}|${site.ga4_measurement_id}|${site.clarity_project_id || ''}|${banner ? 1 : 0}|${site.fathom_site_id || ''}`;
    const rec = state[domain] || {};
    if (rec.want !== want) { state[domain] = { want, tries: 0, done: false }; }
    const cur = state[domain];
    if (cur.done) continue;
    // Exhausted sites get a fresh look once a day rather than being written
    // off forever: the owner may have pasted the code by hand since (live:
    // richfordvehiclesales was pasted manually but stayed flagged "missing
    // Fathom" because the counter had already hit its limit).
    if (cur.tries >= 15) {
      if (Date.now() - (cur.at || 0) < 24 * 3600_000) continue;
      cur.tries = 0;
      console.log('[retrofit]', domain, 'daily re-check after previous attempts were exhausted');
    }
    cur.at = Date.now();
    checked++;
    const html = await fetchLivePage(domain);
    if (html == null) { continue; } // unreachable right now — try next pass, doesn't burn a retry
    // A tool is SATISFIED if its ID is in the page HTML *or* it is
    // demonstrably delivering data — a tag loaded via Tag Manager, a
    // plugin or the site builder never appears as a literal string, so
    // demanding it made the check unsatisfiable and the installer spent
    // all its retries chasing a tool that was already working (live:
    // richfordvehiclesales, 15 wasted tries over a Clarity tag that was
    // feeding 22 days of data). Only genuinely absent tools are chased.
    const clarityWorking = site.clarity_project_id
      ? db.prepare("SELECT COUNT(*) AS n FROM clarity_snapshots WHERE site_id = ? AND snapshot_date >= ?").get(site.id, addDays(todayISO(), -10)).n > 0
      : true;
    const gaOk = !site.ga4_measurement_id || html.includes(site.ga4_measurement_id);
    const clarityOk = !site.clarity_project_id || html.includes(site.clarity_project_id) || clarityWorking;
    const fathomOk = !site.fathom_site_id || html.includes(site.fathom_site_id);
    const ok = gaOk && clarityOk && fathomOk && (banner === html.includes('nbmConsent'));
    if (ok) {
      cur.done = true;
      cur.tries = 0;
      cur.missing = undefined;
      await deleteInjectCrons(HOSTINGER_USER, domain).catch(() => {});
      console.log('[retrofit]', domain, 'live page matches desired tags ✓');
    } else {
      // Record WHICH tags are missing from the live page — the difference
      // between "not installed yet" and "we keep installing but visitors
      // never see it" (docroot the injector edits isn't what's served,
      // e.g. the site moved to the builder). Surfaced in Connections.
      cur.missing = [
        !gaOk ? 'Google Analytics' : null,
        !clarityOk ? 'Clarity' : null,
        !fathomOk ? 'Fathom' : null,
      ].filter(Boolean);
      // The injector reports a hand-pasted block wrapped across lines as
      // NBM-MULTILINE-BLOCK: its line-bound replace cannot touch it, so
      // retrying is pointless. Stop, and let Connections say what to do.
      if (cur.tries > 0) {
        const lastOut = await injectCronOutput(HOSTINGER_USER, domain).catch(() => '');
        if (String(lastOut).includes('NBM-MULTILINE-BLOCK')) {
          cur.multiline = true; cur.tries = 15;
          await deleteInjectCrons(HOSTINGER_USER, domain).catch(() => {});
          console.log('[retrofit]', domain, 'hand-pasted block spans several lines — installer cannot replace it; stopped');
          continue;
        }
      }
      cur.multiline = undefined;
      try {
        await ensureInjectCron({ username: HOSTINGER_USER, domain, scriptUrl: scriptUrlFor(domain) });
        cur.tries++;
        placed++;
        console.log('[retrofit]', domain, `mismatch — injector placed (try ${cur.tries})`, cur.missing.join('+'));
      } catch (e) { console.error('[retrofit]', domain, e.message.slice(0, 90)); }
    }
  }
  setSetting('retrofit_state', JSON.stringify(state));
  return { checked, placed };
}

// ── Generic new-site onboarding: any active site missing its GA4 or
// Search Console wiring gets completed hands-off, hourly, idempotently.
// GA4: adopt an existing property whose web stream matches the domain, or
// CREATE property + web stream in the agency's GA account (delegated).
// GSC: register sc-domain if already verified; else plant a DNS TXT via
// Hostinger and verify (domains on our DNS); else fall back to the tag
// route (META/ANALYTICS, both hosts) like the managed sites. Platform is
// classified from the Hostinger website inventory so file-hosted sites
// flow into the tag injector automatically.
async function onboardNewSites() {
  const sites = db.prepare("SELECT * FROM sites WHERE active = 1 AND domain != ''").all()
    .map(s => ({ ...s, d: (s.domain || '').toLowerCase().replace(/^www\./, '') }))
    .filter(s => s.d !== 'nbmdemosite2.co.uk')
    .filter(s => !MANAGED_SITES.some(m => m.domain === s.d) || s.ga4_property_id === '');
  const needy = sites.filter(s => !s.ga4_property_id || !s.ga4_measurement_id || !s.gsc_site_url);
  const subject = getGscReaderEmail() || 'norton@northbearmedia.co.uk';
  let state = {};
  try { state = JSON.parse(getSetting('onboard_state') || '{}'); } catch { /* fresh */ }
  const save = () => setSetting('onboard_state', JSON.stringify(state));

  // Platform classification, retried hourly until the inventory answers, for
  // EVERY unclassified site — not just the "needy" ones. Tying it to needy
  // meant one failed inventory call during a site's first pass left it
  // unclassified for good once its IDs were filled in, so the injector
  // never touched it.
  const unknown = sites.filter(s => !isAutoTaggable(s.d) && !(state[s.d] || {}).classified);
  if (unknown.length && getHostingerToken()) {
    try {
      const inv = await hostingerWebsiteInventory();
      const extra = new Set(JSON.parse(getSetting('file_hosted_extra') || '[]'));
      for (const s of unknown) {
        const row = (inv || []).find(w => (w.domain || '').toLowerCase().replace(/^www\./, '') === s.d);
        const builder = row && /builder|horizons/i.test(String(row.type || row.platform || ''));
        if (row && !builder) extra.add(s.d);
        state[s.d] = { ...(state[s.d] || {}), classified: true, platform: row ? String(row.type || row.platform || 'unknown') : 'not-on-hostinger' };
        console.log('[onboard]', s.d, 'platform:', state[s.d].platform, builder ? '(builder — tag via paste)' : '(file injector eligible)');
      }
      setSetting('file_hosted_extra', JSON.stringify([...extra]));
      save();
    } catch (e) { console.log('[onboard] inventory failed:', e.message.slice(0, 80)); }
  }
  if (!needy.length) return { done: true };

  // GA4 — adopt or create. Every outcome is recorded per domain in
  // onboard_state.ga4 so Connections and the diagnostic can say WHY a site
  // still has no property, instead of a bare "no property ID" (live:
  // steadplan.co.uk sat on that message with no way to tell whether the
  // hourly job was failing or simply hadn't run yet).
  for (const s of needy.filter(x => !x.ga4_property_id || !x.ga4_measurement_id)) {
    const st = state[s.d] = state[s.d] || {};
    const note = patch => { st.ga4 = { ...(st.ga4 || {}), ...patch, at: new Date().toISOString() }; save(); };
    const auth = { scopes: ['https://www.googleapis.com/auth/analytics.edit'], subject };
    try {
      // A property that exists but has no measurement ID yet — Pulse created
      // it and the follow-up stream call failed, or the stream was removed.
      // Finish THAT property. Before this, a failed stream call left the
      // property ID unsaved, so every hour created another orphan property.
      if (s.ga4_property_id && !s.ga4_measurement_id) {
        const streams = (await gReq({ url: `https://analyticsadmin.googleapis.com/v1beta/properties/${s.ga4_property_id}/dataStreams`, method: 'GET' }, auth).catch(() => ({}))).dataStreams || [];
        let web = streams.find(x => x.type === 'WEB_DATA_STREAM' && streamHost(x.webStreamData?.defaultUri) === s.d)
          || streams.find(x => x.type === 'WEB_DATA_STREAM');
        if (!web) {
          web = await gReq({
            url: `https://analyticsadmin.googleapis.com/v1beta/properties/${s.ga4_property_id}/dataStreams`, method: 'POST',
            data: { type: 'WEB_DATA_STREAM', displayName: s.client_name || s.d, webStreamData: { defaultUri: 'https://' + s.d } },
          }, auth);
        }
        const mid = web.webStreamData?.measurementId || '';
        if (!mid) throw new Error('web stream has no measurement ID yet');
        db.prepare('UPDATE sites SET ga4_measurement_id = ? WHERE id = ?').run(mid, s.id);
        note({ ok: st.ga4?.ok || 'created', property: String(s.ga4_property_id), error: '' });
        console.log('[onboard]', s.d, 'completed property', s.ga4_property_id, 'stream', mid);
        continue;
      }

      const summaries = (await gReq({ url: 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200', method: 'GET' }, auth)).accountSummaries || [];
      // Adopt: an existing property whose web stream is for EXACTLY this
      // host. A property previously released for carrying another site's
      // traffic is never adopted again.
      const rejected = new Set((st.ga4?.rejected || []).map(String));
      let adopted = false;
      outer: for (const acc of summaries) {
        for (const p of (acc.propertySummaries || [])) {
          const pid = p.property.replace('properties/', '');
          if (rejected.has(pid)) continue;
          const streams = (await gReq({ url: `https://analyticsadmin.googleapis.com/v1beta/${p.property}/dataStreams`, method: 'GET' }, auth).catch(() => ({}))).dataStreams || [];
          const web = streams.find(x => x.type === 'WEB_DATA_STREAM' && streamHost(x.webStreamData?.defaultUri) === s.d);
          if (web) {
            db.prepare('UPDATE sites SET ga4_property_id = ?, ga4_measurement_id = ? WHERE id = ?')
              .run(pid, web.webStreamData.measurementId || '', s.id);
            note({ ok: 'adopted', property: pid, error: '' });
            console.log('[onboard]', s.d, 'adopted existing GA4 property', p.property);
            adopted = true; break outer;
          }
        }
      }
      if (adopted) continue;
      // Create: in the account that owns the agency's own property.
      const home = summaries.find(a => (a.propertySummaries || []).some(p => p.property === 'properties/526994009')) || summaries[0];
      if (!home) { note({ error: `no Google Analytics account is visible to ${subject} — cannot create a property` }); console.log('[onboard]', s.d, 'no GA account visible — cannot create property'); continue; }
      const prop = await gReq({
        url: 'https://analyticsadmin.googleapis.com/v1beta/properties', method: 'POST',
        data: { parent: home.account, displayName: s.client_name || s.d, timeZone: 'Europe/London', currencyCode: 'GBP' },
      }, auth);
      const pid = prop.name.replace('properties/', '');
      // Persist the property the moment it exists, so a failure in the next
      // call resumes on this property next hour instead of creating another.
      db.prepare('UPDATE sites SET ga4_property_id = ? WHERE id = ?').run(pid, s.id);
      note({ ok: 'created', property: pid, error: '' });
      const stream = await gReq({
        url: `https://analyticsadmin.googleapis.com/v1beta/${prop.name}/dataStreams`, method: 'POST',
        data: { type: 'WEB_DATA_STREAM', displayName: s.client_name || s.d, webStreamData: { defaultUri: 'https://' + s.d } },
      }, auth);
      const mid = stream.webStreamData?.measurementId || '';
      db.prepare('UPDATE sites SET ga4_measurement_id = ? WHERE id = ?').run(mid, s.id);
      console.log('[onboard]', s.d, 'created GA4 property', prop.name, 'stream', mid);
    } catch (e) {
      note({ error: String(e.message || e).slice(0, 140) });
      console.log('[onboard] GA4 failed for', s.d, ':', String(e.message || e).slice(0, 100));
    }
  }

  // Search Console — sc-domain register → DNS TXT → tag-route fallback.
  for (const s of needy.filter(x => !x.gsc_site_url && !MANAGED_SITES.some(m => m.domain === x.d))) {
    const st = state[s.d] = state[s.d] || {};
    try {
      const auth = { scopes: ['https://www.googleapis.com/auth/siteverification', 'https://www.googleapis.com/auth/webmasters'], subject };
      try {
        await gReq({ url: 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent('sc-domain:' + s.d), method: 'PUT' }, auth);
        // Only keep it if it genuinely reads — an unverified property
        // "adds" successfully and then denies every query.
        const stored = await storeReadableGscProperty(s.id, s.d, 'sc-domain:' + s.d);
        if (stored) { console.log('[onboard]', s.d, 'Search Console linked:', stored); continue; }
      } catch { /* not verified yet — earn it below */ }
      if (!st.txtPlanted && !st.noDns) {
        try {
          const tok = await gReq({ url: 'https://www.googleapis.com/siteVerification/v1/token', method: 'POST',
            data: { verificationMethod: 'DNS_TXT', site: { type: 'INET_DOMAIN', identifier: s.d } } }, auth);
          await hostingerAddTxt(s.d, tok.token);
          st.txtPlanted = true; save();
          console.log('[onboard]', s.d, 'DNS TXT planted — verification on next pass');
        } catch (e) {
          st.noDns = true; save(); // domain not on our Hostinger DNS — tag route below
          console.log('[onboard]', s.d, 'DNS route unavailable (' + String(e.message || e).slice(0, 60) + ') — using tag route');
        }
      }
      if (st.txtPlanted) {
        await gReq({ url: 'https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=DNS_TXT', method: 'POST',
          data: { site: { type: 'INET_DOMAIN', identifier: s.d } } }, auth);
        await gReq({ url: 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent('sc-domain:' + s.d), method: 'PUT' }, auth);
        await storeReadableGscProperty(s.id, s.d, 'sc-domain:' + s.d);
        setSetting('managed_gsc_last_' + s.d, '');
        console.log('[onboard]', s.d, 'Search Console VERIFIED via DNS + linked');
      } else if (st.noDns) {
        // Tag route (same as managed sites): both hosts × META/ANALYTICS.
        let verifiedUrl = null, lastErr = '';
        for (const host of [s.d, 'www.' + s.d]) {
          for (const method of ['META', 'ANALYTICS']) {
            try {
              await gReq({ url: 'https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=' + method,
                method: 'POST', data: { site: { type: 'SITE', identifier: `https://${host}/` } } }, auth);
              verifiedUrl = `https://${host}/`; break;
            } catch (e) { lastErr = `${host}/${method}: ${String(e.message || e).slice(0, 60)}`; }
          }
          if (verifiedUrl) break;
        }
        if (verifiedUrl) {
          await gReq({ url: 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(verifiedUrl), method: 'PUT' }, auth);
          db.prepare('UPDATE sites SET gsc_site_url = ? WHERE id = ?').run(verifiedUrl, s.id);
          setSetting('managed_gsc_last_' + s.d, '');
          console.log('[onboard]', s.d, 'Search Console verified via tag + linked:', verifiedUrl);
        } else {
          setSetting('managed_gsc_last_' + s.d, lastErr);
          st.metaFallback = true; save(); // surfaces in the Connections diagnosis
        }
      }
    } catch (e) { setSetting('managed_gsc_last_' + s.d, String(e.message || e).slice(0, 80)); console.log('[onboard] GSC pending for', s.d, ':', String(e.message || e).slice(0, 80)); }
  }
  return { pending: needy.length };
}

// ── Fathom everywhere: every active site gets a Fathom site created in
// the agency account (match an existing one by name first, else create
// via the API) and its ID stored. The retrofit loop then serves the
// Fathom script on file-hosted sites automatically; builder sites get it
// in their Tracking-code block. Hourly, idempotent, quiet. A read-only
// API key can't create — the error is stored and shown in Connections.
async function ensureFathomSites() {
  const { getFathomToken: tok } = await import('./runtime-config.js');
  if (!tok()) return { skipped: 'no API key' };
  const missing = db.prepare("SELECT * FROM sites WHERE active = 1 AND domain != '' AND (fathom_site_id = '' OR fathom_site_id IS NULL)").all()
    .filter(s => (s.domain || '') !== 'nbmdemosite2.co.uk');
  if (!missing.length) { setSetting('fathom_ensure_last', ''); return { done: true }; }
  const { listSites, createSite } = await import('./fathom.js');
  let existing = [];
  try { existing = await listSites(); } catch (e) { setSetting('fathom_ensure_last', 'list failed: ' + e.message.slice(0, 80)); return { error: true }; }
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // A Fathom site ID belongs to exactly ONE client. Two sites sharing one
  // means a client's report shows another client's traffic — found live
  // (CN Maintenance was carrying Melanie Parker's numbers). Never hand out
  // an ID another site already holds.
  const taken = new Set(db.prepare("SELECT fathom_site_id FROM sites WHERE fathom_site_id != '' AND fathom_site_id IS NOT NULL").all().map(r => String(r.fathom_site_id)));
  for (const site of missing) {
    const d = (site.domain || '').toLowerCase().replace(/^www\./, '');
    try {
      const match = existing.find(f => !taken.has(String(f.id)) && (norm(f.name) === norm(site.client_name) || norm(f.name) === norm(d)));
      const id = String(match ? match.id : await createSite(site.client_name || d));
      if (taken.has(id)) { console.log('[fathom-ensure]', d, 'skipped — id', id, 'already belongs to another site'); continue; }
      db.prepare('UPDATE sites SET fathom_site_id = ? WHERE id = ?').run(id, site.id);
      taken.add(id);
      setSetting('fathom_ensure_last', '');
      console.log('[fathom-ensure]', d, match ? 'matched existing Fathom site' : 'created Fathom site', id);
    } catch (e) {
      setSetting('fathom_ensure_last', String(e.message || e).slice(0, 120));
      console.log('[fathom-ensure]', d, 'failed:', String(e.message || e).slice(0, 100));
      break; // a key-permission problem will fail for every site — stop, retry next hour
    }
  }
  return { done: true };
}

// Repair Fathom IDs shared by more than one site. A shared ID is not a
// heuristic judgement — it is definitively wrong for at least one of them,
// and means a client sees another client's visitor numbers. The site whose
// Fathom site NAME matches keeps it (else the earliest-created one); the
// others are released so ensureFathomSites gives them their own.
export async function fixDuplicateFathomIds() {
  const dupes = db.prepare(`SELECT fathom_site_id AS id, COUNT(*) AS n FROM sites
    WHERE fathom_site_id != '' AND fathom_site_id IS NOT NULL AND active = 1
    GROUP BY fathom_site_id HAVING n > 1`).all();
  if (!dupes.length) return { duplicates: 0 };
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let names = [];
  try { const { listSites } = await import('./fathom.js'); names = await listSites(); } catch { /* name hint optional */ }
  let released = 0;
  for (const dupe of dupes) {
    const sites = db.prepare('SELECT * FROM sites WHERE fathom_site_id = ? AND active = 1 ORDER BY id').all(dupe.id);
    const fathomName = names.find(f => String(f.id) === String(dupe.id))?.name;
    const keeper = (fathomName && sites.find(s => norm(s.client_name) === norm(fathomName)
      || norm((s.domain || '').replace(/^www\./, '')) === norm(fathomName))) || sites[0];
    for (const s of sites) {
      if (s.id === keeper.id) continue;
      db.prepare("UPDATE sites SET fathom_site_id = '' WHERE id = ?").run(s.id);
      released++;
      console.log('[fathom-dupe]', s.domain, 'released shared Fathom id', dupe.id,
        `(kept by ${keeper.domain}${fathomName ? ` — Fathom site is named "${fathomName}"` : ''}); a fresh site will be created`);
    }
  }
  setSetting('fathom_dupes_fixed', String(released));
  return { duplicates: dupes.length, released };
}

// ── Make the tag on the page match the property reports are READ from.
// The measurement IDs were seeded from a hand-built map; if one is stale
// or belongs to a different property, the site tags itself with an ID
// whose data lands somewhere Pulse never looks — the page looks correctly
// tagged and the property stays empty forever. (Live: northbearmedia.co.uk
// — corrected block confirmed on the page, Fathom in the SAME block
// reporting 26 visits, yet GA property 526994009 reads 0.)
// The property is authoritative because that is what reports query, so
// ask GA for ITS web stream's measurement ID and correct the site.
// Changing the ID also changes the retrofit's want-hash, so the page is
// automatically re-tagged with the right one.
export async function healGa4MeasurementIds() {
  const subject = getGscReaderEmail() || 'norton@northbearmedia.co.uk';
  const auth = { scopes: ['https://www.googleapis.com/auth/analytics.readonly'], subject };
  const sites = db.prepare("SELECT * FROM sites WHERE active = 1 AND ga4_property_id != ''").all()
    .filter(s => (s.domain || '') !== 'nbmdemosite2.co.uk');
  let fixed = 0;
  for (const site of sites) {
    const d = (site.domain || '').toLowerCase().replace(/^www\./, '');
    try {
      const streams = (await gReq({ url: `https://analyticsadmin.googleapis.com/v1beta/properties/${site.ga4_property_id}/dataStreams`, method: 'GET' }, auth)).dataStreams || [];
      const web = streams.filter(s => s.type === 'WEB_DATA_STREAM' && s.webStreamData?.measurementId);
      if (!web.length) { console.log('[ga-mid]', d, 'property', site.ga4_property_id, 'has no web stream'); continue; }
      // Prefer the stream whose configured URL matches this domain.
      const best = web.find(s => streamHost(s.webStreamData.defaultUri) === d) || web[0];
      const real = best.webStreamData.measurementId;
      if (real && real !== site.ga4_measurement_id) {
        db.prepare('UPDATE sites SET ga4_measurement_id = ? WHERE id = ?').run(real, site.id);
        fixed++;
        console.log('[ga-mid]', d, `tag was ${site.ga4_measurement_id || '(none)'} but property ${site.ga4_property_id} uses ${real} — corrected; page will be re-tagged`);
      }
    } catch (e) { console.log('[ga-mid]', d, 'lookup failed:', String(e.message || e).slice(0, 80)); }
  }
  return { fixed };
}

// ── The tag is on the page, but the property reports nothing.
// That combination means the stored ga4_property_id does NOT own the
// measurement ID the site is actually sending to — data is pouring into a
// different property while reports read an empty one. (Live case: North
// Bear Media, tag verified on the page, property returning 0 visits.)
// Asks GA which property owns that measurement ID and repoints the site.
export async function healGa4Properties() {
  const subject = getGscReaderEmail() || 'norton@northbearmedia.co.uk';
  const auth = { scopes: ['https://www.googleapis.com/auth/analytics.readonly'], subject };
  const end = addDays(todayISO(), -1), start = addDays(end, -13);
  const sites = db.prepare("SELECT * FROM sites WHERE active = 1 AND ga4_measurement_id != '' AND ga4_property_id != ''").all()
    .filter(s => (s.domain || '') !== 'nbmdemosite2.co.uk');
  let fixed = 0, streamCache = null;
  for (const site of sites) {
    // Only investigate silent properties — a property with traffic is fine.
    let silent = false;
    try {
      const rep = await gReq({
        url: `https://analyticsdata.googleapis.com/v1beta/properties/${site.ga4_property_id}:runReport`,
        method: 'POST',
        data: { dateRanges: [{ startDate: start, endDate: end }], metrics: [{ name: 'sessions' }] },
      }, auth);
      silent = !Number(rep.rows?.[0]?.metricValues?.[0]?.value || 0);
    } catch { continue; }
    if (!silent) continue;
    // Which property actually owns this measurement ID?
    if (!streamCache) {
      streamCache = new Map();
      try {
        const summaries = (await gReq({ url: 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200', method: 'GET' },
          { scopes: ['https://www.googleapis.com/auth/analytics.readonly'], subject })).accountSummaries || [];
        for (const acc of summaries) {
          for (const p of (acc.propertySummaries || [])) {
            const streams = (await gReq({ url: `https://analyticsadmin.googleapis.com/v1beta/${p.property}/dataStreams`, method: 'GET' }, auth).catch(() => ({}))).dataStreams || [];
            for (const st of streams) {
              const mid = st.webStreamData?.measurementId;
              if (mid) streamCache.set(mid, p.property.replace('properties/', ''));
            }
          }
        }
      } catch (e) { console.log('[ga-heal] could not list properties:', String(e.message || e).slice(0, 70)); return { fixed }; }
    }
    const owner = streamCache.get(site.ga4_measurement_id);
    if (owner && owner !== String(site.ga4_property_id)) {
      db.prepare('UPDATE sites SET ga4_property_id = ? WHERE id = ?').run(owner, site.id);
      fixed++;
      console.log('[ga-heal]', site.domain, `property ${site.ga4_property_id} reports nothing but ${site.ga4_measurement_id} belongs to ${owner} — repointed`);
    }
  }
  return { fixed };
}

// ── Source integrity: prove, machine-side, that each connected source is
// really carrying THIS domain's traffic — the question a human would
// otherwise have to answer with view-source or a GA Realtime self-test.
// GA4 and Fathom both record the serving hostname with every hit, so ask
// them. Verdicts land in the Connections panel; a Fathom source feeding a
// DIFFERENT domain's data is disconnected on the spot (wrong numbers in a
// client report is the one unforgivable failure), falling back to GA.
async function verifySourceIntegrity() {
  const subject = getGscReaderEmail() || 'norton@northbearmedia.co.uk';
  const sites = db.prepare("SELECT * FROM sites WHERE active = 1 AND domain != ''").all();
  let verdicts = {};
  try { verdicts = JSON.parse(getSetting('source_integrity') || '{}'); } catch { /* fresh */ }
  const end = addDays(todayISO(), -1), start = addDays(end, -13);
  for (const site of sites) {
    const d = (site.domain || '').toLowerCase().replace(/^www\./, '');
    if (!d || d === 'nbmdemosite2.co.uk') continue;
    const v = verdicts[d] = verdicts[d] || {};
    const own = rows => rows.filter(r => r.host === d || r.host.endsWith('.' + d)).reduce((a, r) => a + r.n, 0);
    if (site.ga4_property_id) {
      try {
        const rep = await gReq({
          url: `https://analyticsdata.googleapis.com/v1beta/properties/${site.ga4_property_id}:runReport`,
          method: 'POST',
          data: { dateRanges: [{ startDate: start, endDate: end }], dimensions: [{ name: 'hostName' }], metrics: [{ name: 'sessions' }], limit: 10 },
        }, { scopes: ['https://www.googleapis.com/auth/analytics.readonly'], subject });
        const rows = (rep.rows || [])
          .map(r => ({ host: String(r.dimensionValues?.[0]?.value || '').toLowerCase().replace(/^www\./, ''), n: Number(r.metricValues?.[0]?.value || 0) }))
          .filter(r => r.host);
        const total = rows.reduce((a, r) => a + r.n, 0);
        v.ga = !total ? { status: 'no-data' }
          : own(rows) / total >= 0.5 ? { status: 'verified' }
          : { status: 'mismatch', hosts: rows.slice(0, 3).map(r => r.host) };
        if (v.ga.status === 'mismatch') {
          console.log('[integrity]', d, 'GA property carries traffic for', v.ga.hosts.join(','));
          // A property Pulse ADOPTED (never one the owner typed, never one
          // Pulse created) that carries another site's traffic is released
          // so the next onboarding pass creates a clean one — and remembered
          // so it is never adopted again. Before this the flag was raised
          // and nothing ever acted on it.
          try {
            const ob = JSON.parse(getSetting('onboard_state') || '{}');
            const g = ob[d]?.ga4;
            if (g && g.ok === 'adopted' && String(g.property) === String(site.ga4_property_id)) {
              db.prepare("UPDATE sites SET ga4_property_id = '', ga4_measurement_id = '' WHERE id = ?").run(site.id);
              ob[d].ga4 = { ...g, ok: '', rejected: [...new Set([...(g.rejected || []), String(g.property)])],
                error: `released property ${g.property} — its traffic is from ${v.ga.hosts.join(', ')}; a fresh one is created on the next pass`, at: new Date().toISOString() };
              setSetting('onboard_state', JSON.stringify(ob));
              v.ga = { status: 'released' };
              console.log('[integrity]', d, 'released wrongly adopted property', g.property);
            }
          } catch { /* non-fatal */ }
        }
      } catch (e) { v.ga = { status: 'error', err: String(e.message || e).slice(0, 60) }; }
    } else v.ga = undefined;
    if (site.fathom_site_id && getFathomToken()) {
      try {
        const { fathomHostnames } = await import('./fathom.js');
        const rows = await fathomHostnames(site.fathom_site_id, start, end);
        const total = rows.reduce((a, r) => a + r.n, 0);
        const share = total ? own(rows) / total : 0;
        // NEVER delete the connection. An earlier version wiped
        // fathom_site_id on a single failed check — one unexpected API
        // response shape (or a site legitimately serving several
        // hostnames) would silently tear Fathom off a client, which is
        // both destructive and the opposite of "every site has Fathom".
        // Flag instead; report-data refuses to USE a mismatched source,
        // so wrong numbers still never reach a report, and the connection
        // repairs itself the moment the data looks right again.
        if (!total) v.fathom = { status: 'no-data' };
        else if (share >= 0.5) v.fathom = { status: 'verified' };
        else if (share > 0.02) v.fathom = { status: 'shared', hosts: rows.slice(0, 3).map(r => r.host) };
        else {
          // Essentially NONE of this Fathom site's traffic is this domain,
          // on meaningful volume — the ID really is pointing elsewhere.
          v.fathom = total >= 20
            ? { status: 'mismatch', hosts: rows.slice(0, 3).map(r => r.host) }
            : { status: 'unclear', hosts: rows.slice(0, 3).map(r => r.host) };
          if (v.fathom.status === 'mismatch') console.log('[integrity]', d, 'Fathom site carries', v.fathom.hosts.join(','), '— flagged; reports will use GA until corrected (connection kept)');
        }
      } catch (e) { v.fathom = { status: 'error', err: String(e.message || e).slice(0, 60) }; }
    } else if (!site.fathom_site_id) v.fathom = undefined;
  }
  setSetting('source_integrity', JSON.stringify(verdicts));
  return verdicts;
}

// ── Target keywords, learned from the site's OWN Google data.
//
// Hand-written keyword guesses are worthless to a client paying for SEO:
// only Google knows what a business is actually being searched for. This
// reads 90 days of real Search Console queries per site and picks the
// terms worth reporting on and chasing:
//   · "striking distance" (position ~4-40): real commercial opportunity —
//     already visible, one push from page one. These are the money terms.
//   · a couple of established winners (top 3) so progress is visible.
//   · multi-word/local phrases preferred over vague one-word heads.
// Junk is stripped (search operators, URLs, gibberish, single characters).
//
// PROVENANCE-SAFE: a value is only ever replaced when the current field is
// blank or is exactly what we last wrote ourselves. The moment the owner
// edits a site's keywords by hand, this stops touching that site forever.
const KW_JUNK = /(^|\s)(-site|site:|https?:|www\.|\.com|\.co\.uk)|[<>{}[\]|\\^~`]/i;

// Significant words of a search: punctuation stripped, plurals folded,
// filler dropped — the basis for both the relevance gate and duplicate
// detection, so the two always agree on what a query is "about".
const KW_STOP = new Set(['the', 'and', 'for', 'near', 'best', 'top', 'in', 'me', 'my', 'uk', 'a', 'of', 'to', 'what', 'do', 'is', 'are', 'you', 'your']);
function sigWords(q) {
  return new Set(String(q).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .map(w => w.replace(/s$/, '')).filter(w => w.length > 2 && !KW_STOP.has(w)));
}

function pickKeywords(rows, domain, clientName) {
  const brandWords = new Set(String(clientName || '').toLowerCase().split(/\s+/).filter(w => w.length > 2)
    .concat(domain.replace(/\.(co\.uk|com|uk|net|org)$/,'').split(/[-.]/).filter(w => w.length > 2)));
  const clean = (rows || [])
    .map(r => ({ ...r, q: String(r.query || '').trim().toLowerCase() }))
    .filter(r => r.q.length >= 6 && r.q.length <= 60 && !KW_JUNK.test(r.q) && /[a-z]/.test(r.q))
    .filter(r => r.impressions >= 3);
  const words = q => q.split(/\s+/).length;
  const isBrand = q => [...brandWords].some(b => q.includes(b));

  // RELEVANCE GATE. Impressions alone are not evidence a search matters to
  // the business: a site picks up accidental rankings for anything nearby.
  // Alphashunt (shunter vehicle hire) was targeting "what to do in belper"
  // and "belper river gardens play area"; Ivy House (a care home) was
  // targeting "ivy grove nursing home" and "ivy meadow childcare" — a
  // rival's name, in a report headed "your target searches".
  //
  // What the business is actually about is revealed by the searches that
  // EARNED CLICKS, plus its own name. A candidate must share a meaningful
  // word with that vocabulary to qualify.
  const vocab = new Set(brandWords);
  for (const r of clean) {
    if (r.clicks > 0) for (const w of sigWords(r.q)) vocab.add(w);
  }
  const relevant = q => [...sigWords(q)].some(w => vocab.has(w));

  // Opportunity: visible, plausibly reachable, and genuinely about this
  // business. Position capped at 25 — beyond that it is an accident, not a
  // target worth putting in front of a client.
  const striking = clean.filter(r => r.position > 3.5 && r.position <= 25 && !isBrand(r.q) && relevant(r.q))
    .sort((a, b) => (b.impressions * (words(b.q) > 1 ? 1.6 : 1)) - (a.impressions * (words(a.q) > 1 ? 1.6 : 1)));
  // Established: already strong, worth showing as retained ground.
  const winning = clean.filter(r => r.position <= 3.5)
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
  // Near-duplicate collapse. Substring matching alone let "web design
  // derby", "website design derby", "derby web design", "web designer
  // derby" and "web designers derby" all through — eight rows of one
  // keyword, useless in a client report. Compare the significant words
  // instead: heavy overlap means the same search intent, so keep only the
  // strongest and spend the remaining slots on the client's other
  // services. (Validated against North Bear Media's own 705-query export.)
  const sameIntent = (a, b) => {
    // "kids club" / "kid's club" / "kidsclub" are one search intent; the
    // apostrophe and the missing space were letting all three through.
    if (a.replace(/[^a-z0-9]/g, '') === b.replace(/[^a-z0-9]/g, '')) return true;
    const A = sigWords(a), B = sigWords(b);
    if (!A.size || !B.size) return false;
    let shared = 0;
    for (const w of A) if (B.has(w)) shared++;
    return shared / Math.min(A.size, B.size) >= 0.6;
  };
  const out = [];
  const push = q => { if (out.length < 8 && !out.some(x => sameIntent(x, q))) out.push(q); };
  striking.slice(0, 40).forEach(r => push(r.q));
  winning.slice(0, 4).forEach(r => push(r.q));
  return out;
}

export async function deriveTargetKeywords() {
  const sites = db.prepare("SELECT * FROM sites WHERE active = 1 AND gsc_site_url != '' AND gsc_site_url IS NOT NULL").all()
    .filter(s => (s.domain || '') !== 'nbmdemosite2.co.uk');
  if (!sites.length) return { checked: 0 };
  const { fetchTopQueries } = await import('./gsc.js');
  const end = addDays(todayISO(), -3); // Search Console lags ~2-3 days
  const start = addDays(end, -89);
  let auto = {};
  try { auto = JSON.parse(getSetting('target_keywords_auto') || '{}'); } catch { /* fresh */ }
  let updated = 0;
  for (const site of sites) {
    const d = (site.domain || '').toLowerCase().replace(/^www\./, '');
    const current = (site.target_keywords || '').trim();
    // Owner-edited? Never touch it again. But a value identical to the
    // hardcoded starter list IS ours, even when it predates the auto
    // register — otherwise every originally-seeded site was treated as
    // hand-written and skipped forever. That is why northbearmedia.co.uk
    // still carried guesses of mine that its Search Console data shows it
    // has never once been searched for.
    const isOurSeed = current && current === (TARGET_KEYWORDS[d] || '').trim();
    if (current && !isOurSeed && auto[d] !== undefined && current !== auto[d]) continue;
    if (current && !isOurSeed && auto[d] === undefined) continue; // genuinely hand-written
    let rows = [];
    try { rows = await fetchTopQueries(site.gsc_site_url, start, end, 500); }
    catch (e) { console.log('[keywords]', d, 'query fetch failed:', String(e.message || e).slice(0, 70)); continue; }
    const picked = pickKeywords(rows, d, site.client_name);
    // Any genuinely relevant keyword beats a longer list of irrelevant
    // ones. Requiring three would have left Alphashunt advertising
    // "what to do in belper" to a shunter-hire client simply because the
    // honest replacement was shorter.
    if (!picked.length) continue;
    const value = picked.join(', ');
    if (value === current) continue;
    db.prepare('UPDATE sites SET target_keywords = ? WHERE id = ?').run(value, site.id);
    auto[d] = value;
    updated++;
    console.log('[keywords]', d, '→', value);
  }
  setSetting('target_keywords_auto', JSON.stringify(auto));
  return { checked: sites.length, updated };
}

// ── Self-heal a wrong Search Console property. Google exposes a site as
// up to four separate "properties" — https / http × bare / www — plus a
// domain property (sc-domain:) that needs DNS verification. Only some are
// actually verified for us. finalizeSearchConsole could store the
// sc-domain form because Google's "add site" call SUCCEEDS even while the
// property stays unverified — so every read then fails "insufficient
// permission" (hit live on evccitysprint: its sc-domain never verified,
// but its https URL-prefix property is owned). This probes the stored
// property and, if reads are denied, switches gsc_site_url to whichever
// form actually reads. Generic, so it fixes any such mismatch, forever.
// "Can this Search Console property actually be READ?" — the only proof
// that matters. Injectable so the selection logic is directly testable
// (it has caused three separate live incidents, so it earns real tests).
async function defaultGscReader() {
  const { fetchSummary } = await import('./gsc.js');
  const end = addDays(todayISO(), -3), start = addDays(end, -6);
  return async url => { try { await fetchSummary(url, start, end); return true; } catch { return false; } };
}

// Store a Search Console property ONLY if it can actually be read.
// Google's "add site" PUT succeeds even when the property is UNVERIFIED,
// so trusting it wrote an unreadable sc-domain: value over a perfectly
// good URL-prefix one — every hour, undoing healGscProperties and leaving
// "User does not have sufficient permission" on the panel forever.
// Returns the stored value, or null when nothing readable exists yet
// (leaving the field empty so the verification path keeps trying).
async function storeReadableGscProperty(siteId, domain, preferred, readsFn = null) {
  const reads = readsFn || await defaultGscReader();
  const candidates = [preferred, `https://${domain}/`, `https://www.${domain}/`, `sc-domain:${domain}`, `http://${domain}/`, `http://www.${domain}/`]
    .filter((c, i, a) => c && a.indexOf(c) === i);
  for (const c of candidates) {
    if (await reads(c)) {
      db.prepare('UPDATE sites SET gsc_site_url = ? WHERE id = ?').run(c, siteId);
      if (c !== preferred) console.log('[gsc]', domain, 'stored readable property', c, '(preferred', preferred, 'was not readable)');
      return c;
    }
  }
  console.log('[gsc]', domain, 'no readable property yet — leaving unset so verification keeps trying');
  return null;
}

export async function healGscProperties({ reads: readsFn = null } = {}) {
  const sites = db.prepare("SELECT * FROM sites WHERE active = 1 AND gsc_site_url != '' AND gsc_site_url IS NOT NULL").all();
  if (!sites.length) return { checked: 0 };
  const reads = readsFn || await defaultGscReader();
  // SAFETY: clearing a property is only valid when Google is definitely
  // reachable and our credentials work. Without this, one transient outage,
  // quota block or auth hiccup makes every read fail and the deadlock
  // breaker below wipes the Search Console link off the ENTIRE fleet.
  // A single successful read anywhere proves the pipe is healthy.
  let googleHealthy = false;
  for (const site of sites) {
    if (await reads(site.gsc_site_url)) { googleHealthy = true; break; }
  }
  if (!googleHealthy) {
    console.log('[gsc-heal] no property read successfully — treating as a Google/auth problem, changing nothing');
    return { checked: sites.length, fixed: 0, skipped: 'google unreachable' };
  }
  let fixed = 0;
  for (const site of sites) {
    if (await reads(site.gsc_site_url)) continue; // current property is fine
    const d = (site.domain || '').toLowerCase().replace(/^www\./, '');
    if (!d) continue;
    const candidates = [`https://${d}/`, `https://www.${d}/`, `sc-domain:${d}`, `http://${d}/`, `http://www.${d}/`]
      .filter(c => c !== site.gsc_site_url);
    let switched = false;
    for (const c of candidates) {
      if (await reads(c)) {
        db.prepare('UPDATE sites SET gsc_site_url = ? WHERE id = ?').run(c, site.id);
        setSetting('managed_gsc_last_' + d, '');
        console.log('[gsc-heal]', d, 'unreadable property', site.gsc_site_url, '→ switched to working', c);
        fixed++; switched = true;
        break;
      }
    }
    // DEADLOCK BREAKER: nothing readable. Leaving the dead value looks
    // harmless but strands the site forever — onboardNewSites only tries
    // to VERIFY sites whose property is empty, so a site holding a broken
    // property is skipped by the very job that could fix it (live: CN
    // Maintenance and Enso HR sat unreadable for a day). Clear it so the
    // verification path picks the site up on its next pass.
    if (!switched) {
      db.prepare("UPDATE sites SET gsc_site_url = '' WHERE id = ?").run(site.id);
      console.log('[gsc-heal]', d, 'no readable property — cleared', site.gsc_site_url, 'so verification retries');
    }
  }
  return { checked: sites.length, fixed };
}

// Search Console diagnosis for managed (no-DNS) sites, shown in the
// Connections panel while unlinked. Goes far beyond "here's the tag":
// fetches the LIVE page, reports which verification tag is actually being
// served and whether it's in <head> (Google requires that), spots
// bare-domain → www serving mismatches, compares served vs expected token,
// and includes the last verification error. Turns "still connecting?!"
// into a specific, one-line instruction.
async function metaTokenFor(client, identifier) {
  const cacheKey = `managed_meta_${identifier}`;
  let tag = getSetting(cacheKey);
  if (tag) return tag;
  try {
    const res = await client.request({
      url: 'https://www.googleapis.com/siteVerification/v1/token',
      method: 'POST',
      data: { verificationMethod: 'META', site: { type: 'SITE', identifier } },
    });
    tag = res?.data?.token || '';
    if (tag) setSetting(cacheKey, tag);
  } catch (e) { console.log('[gsc-managed] meta token fetch failed:', identifier, String(e.message || e).slice(0, 80)); }
  return tag;
}

export async function managedGscDiagnosis() {
  const out = {};
  let client = null;
  // Managed sites, plus any onboarded site that fell back to the tag route
  // (domain not on our DNS) — both verify through the served page.
  let onboardState = {};
  try { onboardState = JSON.parse(getSetting('onboard_state') || '{}'); } catch { /* none */ }
  const targets = [
    ...MANAGED_SITES,
    ...Object.entries(onboardState).filter(([, v]) => v.metaFallback).map(([domain]) => ({ domain })),
  ];
  for (const m of targets) {
    const row = db.prepare("SELECT gsc_site_url FROM sites WHERE lower(replace(domain,'www.','')) = ?").get(m.domain);
    if (!row || row.gsc_site_url) continue; // linked (or absent) — nothing to diagnose
    if (!client) {
      try {
        client = googleClient({ scopes: ['https://www.googleapis.com/auth/siteverification'], subject: getGscReaderEmail() || 'norton@northbearmedia.co.uk' });
      } catch { client = null; }
    }
    const d = { domain: m.domain, findings: [] };
    // 1 — what is the live page actually serving, and from which host?
    let html = null, finalHost = '';
    for (const url of [`https://${m.domain}/?nbmv=${Date.now()}`, `https://www.${m.domain}/?nbmv=${Date.now()}`]) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'NorthBearPulse/1.0', 'Cache-Control': 'no-cache' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
        if (res.ok) { html = (await res.text()).slice(0, 2_000_000); finalHost = new URL(res.url).host; break; }
      } catch { /* try next */ }
    }
    const apexToken = client ? await metaTokenFor(client, `https://${m.domain}/`) : '';
    const wwwToken = client ? await metaTokenFor(client, `https://www.${m.domain}/`) : '';
    if (html == null) {
      d.findings.push('Could not fetch the live page just now — will keep retrying hourly.');
    } else {
      if (finalHost.replace(/^www\./, '') === m.domain && finalHost !== m.domain) {
        d.findings.push(`Site serves at ${finalHost} (redirect) — verification now tries both hosts automatically.`);
      }
      const metas = [...html.matchAll(/<meta[^>]*google-site-verification[^>]*content=["']([^"']+)["']/gi)].map(x => x[1]);
      const headEnd = html.indexOf('</head>');
      const firstIdx = html.search(/google-site-verification/i);
      if (!metas.length) {
        d.findings.push('NO verification tag found on the served page — the paste may not have published, or the builder stripped it. Re-paste the tag below into the builder’s HEAD custom-code section and publish.');
      } else {
        const inHead = firstIdx !== -1 && headEnd !== -1 && firstIdx < headEnd;
        if (!inHead) d.findings.push('A verification tag IS on the page but sits in the BODY, and Google only accepts it inside <head>. In the builder, move the custom code to the Head section and publish.');
        const expected = [apexToken, wwwToken].map(t => (t.match(/content=["']([^"']+)["']/) || [])[1]).filter(Boolean);
        const match = metas.some(mv => expected.includes(mv));
        if (inHead && !match && expected.length) {
          d.findings.push(`A tag is in <head> but its value doesn’t match what Google expects from your account (found "${metas[0].slice(0, 12)}…"). Replace it with the tag below and publish.`);
        }
        if (inHead && match) d.findings.push('Tag looks correct and in <head> — Google should verify on the next hourly pass. If this persists a day, tell North Bear.');
      }
    }
    const lastErr = getSetting('managed_gsc_last_' + m.domain) || '';
    if (lastErr) d.findings.push(`Last Google response: ${lastErr}`);
    // Offer the token for the host the site actually serves from — Google's
    // tokens are per-URL, so the www site needs the www token.
    d.tag = (finalHost.startsWith('www.') ? (wwwToken || apexToken) : (apexToken || wwwToken)) || '';
    out[m.domain] = d;
  }
  return out;
}

// One-shot probe: does Hostinger expose website traffic/visitor stats
// anywhere our API token can reach, and do raw access logs exist on the
// server? The hPanel Analytics data would give visitor HISTORY that
// pre-dates our GA tags. Emails whatever it finds.
async function probeHostingerAnalytics() {
  if (getSetting('hostinger_analytics_probe_done') === 'true') return;
  const token = getHostingerToken();
  if (!token) return;
  const lines = [];
  const tryGet = async (label, path) => {
    try {
      const r = await fetch('https://developers.hostinger.com' + path, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
      const body = (await r.text()).slice(0, 300).replace(/\s+/g, ' ');
      lines.push(`${r.status}  ${label}  ${path}\n      ${body}`);
    } catch (e) { lines.push(`ERR  ${label}  ${path} — ${e.message.slice(0, 80)}`); }
  };
  const d = 'northbearmedia.co.uk';
  await tryGet('website detail (full fields)', `/api/hosting/v1/websites/${d}`);
  await tryGet('website analytics', `/api/hosting/v1/websites/${d}/analytics`);
  await tryGet('website statistics', `/api/hosting/v1/websites/${d}/statistics`);
  await tryGet('website traffic', `/api/hosting/v1/websites/${d}/traffic`);
  await tryGet('website visitors', `/api/hosting/v1/websites/${d}/visitors`);
  await tryGet('account statistics', `/api/hosting/v1/accounts/${HOSTINGER_USER}/statistics`);
  await tryGet('account analytics', `/api/hosting/v1/accounts/${HOSTINGER_USER}/analytics`);
  // Server-side: do access logs exist on the hosting account?
  try {
    await ensureCron(HOSTINGER_USER, `find /home/${HOSTINGER_USER} -maxdepth 4 -iname *access*log* -o -maxdepth 4 -iname *.log`);
    await sleep(8 * 60_000);
    const out = await cronOutputMatching(HOSTINGER_USER, '-iname');
    await deleteCronsMatching(HOSTINGER_USER, '-iname');
    lines.push('SERVER LOG FILES FOUND:\n' + (out ? out.slice(0, 1200) : '(none captured — cron may not have run yet; will not retry)'));
  } catch (e) { lines.push('log survey failed: ' + e.message.slice(0, 80)); }
  setSetting('hostinger_analytics_probe_done', 'true');
  try {
    await mailer().sendMail({
      from: getEmailFrom(), to: 'norton@northbearmedia.co.uk', bcc: getEmailBcc() || undefined,
      subject: 'Pulse — Hostinger analytics probe results',
      text: `Probing whether Hostinger exposes historical visitor data to the API (and whether raw access logs exist on the server):\n\n${lines.join('\n\n')}\n\n— North Bear Pulse`,
    });
  } catch (e) { console.error('[probe] email failed:', e.message); }
}

// One-shot: verify Fathom is pulling for every site the owner has
// wired a fathom_site_id into — 30-day traffic + how far back the data
// reaches, straight from the Fathom API with the stored key.
async function fathomCheck() {
  if (getSetting('fathom_check_v2_done') === 'true') return;
  const sites = db.prepare("SELECT * FROM sites WHERE active = 1 AND fathom_site_id != '' AND fathom_site_id IS NOT NULL").all();
  if (!sites.length) return;
  // No account API key yet? Stay quiet and retry next boot + hourly —
  // the check completes itself the moment the owner saves the key.
  const { getFathomToken } = await import('./runtime-config.js');
  if (!getFathomToken()) { console.log('[fathom-check] waiting for API key in Settings'); return; }
  setSetting('fathom_check_v2_done', 'true');
  const { gatherFathom } = await import('./fathom.js');
  const { addDays, todayISO } = await import('./dates.js');
  const end = addDays(todayISO(), -1);
  const lines = [];
  for (const site of sites) {
    try {
      const m = await gatherFathom(site.fathom_site_id, addDays(end, -29), end);
      const o = m?.overview;
      if (!o) { lines.push(`✗ ${site.domain} (${site.fathom_site_id}): connected but returned no data`); continue; }
      // how far back does history reach? probe a full year
      let since = '(unknown)';
      try {
        const y = await gatherFathom(site.fathom_site_id, addDays(end, -364), end);
        const first = y?.timeseries?.find(t => t.sessions > 0);
        if (first) since = first.date;
      } catch { /* year probe optional */ }
      lines.push(`✓ ${site.domain} (${site.fathom_site_id}): ${Math.round(o.sessions)} visits / ${Math.round(o.totalUsers)} visitors in the last 30 days · history reaches back to ${since}`);
    } catch (e) { lines.push(`✗ ${site.domain} (${site.fathom_site_id}): ${e.message.slice(0, 120)}`); }
  }
  try {
    await mailer().sendMail({
      from: getEmailFrom(), to: 'norton@northbearmedia.co.uk', bcc: getEmailBcc() || undefined,
      subject: 'Pulse — Fathom connection check',
      text: `Sites with a Fathom site ID, checked live against the Fathom API:\n\n${lines.map(l => '  ' + l).join('\n')}\n\nWhere Fathom is connected it becomes the site's traffic source (bot-filtered, with history) and the dashboard/report will say "Source: Fathom Analytics".\n\n— North Bear Pulse`,
    });
  } catch (e) { console.error('[fathom-check] email failed:', e.message); }
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
      // The PUT succeeding proves nothing — only a successful READ does.
      // Whichever property form actually reads is the one worth storing.
      const stored = await storeReadableGscProperty(site.id, d, 'sc-domain:' + d);
      if (stored) added.push(stored === 'sc-domain:' + d ? d : `${d} (${stored})`);
      else failed.push(`${d} (added but not verified yet)`);
    } catch (e) {
      const stored = await storeReadableGscProperty(site.id, d, null);
      if (stored) added.push(`${d} (${stored})`);
      else failed.push(`${d} (${e.message.slice(0, 50)})`);
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

// Search Console for managed sites without DNS control: once their GA
// tag is live, Google can verify ownership THROUGH the tag (ANALYTICS
// method) for a URL-prefix property — no DNS records needed. Retries
// hourly until each verifies, then registers the property and points
// gsc_site_url at it. Silent; state visible in the Connections panel.
async function verifyManagedSitesGsc() {
  const pending = MANAGED_SITES.filter(m => {
    const row = db.prepare("SELECT gsc_site_url FROM sites WHERE lower(replace(domain,'www.','')) = ?").get(m.domain);
    return row && !row.gsc_site_url;
  });
  if (!pending.length) return;
  let client;
  try {
    client = googleClient({ scopes: ['https://www.googleapis.com/auth/siteverification', 'https://www.googleapis.com/auth/webmasters'], subject: getGscReaderEmail() || 'norton@northbearmedia.co.uk' });
    await client.getAccessToken();
  } catch (e) { console.log('[gsc-managed] scopes unavailable:', e.message.slice(0, 60)); return; }
  for (const m of pending) {
    // Google's checks are exact-URL: a site that SERVES at www while we
    // verify the bare domain (or vice versa) fails forever even with a
    // perfect tag. Try both hosts × both methods (META first — the
    // ANALYTICS method doesn't work with Hostinger-builder GA4 tags).
    let verifiedUrl = null, lastErr = '';
    for (const host of [m.domain, 'www.' + m.domain]) {
      const siteUrl = 'https://' + host + '/';
      for (const method of ['META', 'ANALYTICS']) {
        try {
          await client.request({
            url: 'https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=' + method,
            method: 'POST',
            data: { site: { type: 'SITE', identifier: siteUrl } },
          });
          verifiedUrl = siteUrl; break;
        } catch (e) { lastErr = `${host}/${method}: ${String(e.message || e).slice(0, 70)}`; }
      }
      if (verifiedUrl) break;
    }
    if (!verifiedUrl) {
      setSetting('managed_gsc_last_' + m.domain, lastErr);
      console.log('[gsc-managed]', m.domain, 'not verifiable yet —', lastErr);
      continue;
    }
    try {
      await client.request({ url: 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(verifiedUrl), method: 'PUT' });
      // Verified at last: link the property AND release the delivery hold so
      // this site now behaves exactly like the rest of the fleet.
      db.prepare("UPDATE sites SET gsc_site_url = ?, delivery_hold = 0 WHERE lower(replace(domain,'www.','')) = ?").run(verifiedUrl, m.domain);
      setSetting('managed_gsc_last_' + m.domain, '');
      console.log('[gsc-managed] verified + registered + delivery released:', verifiedUrl);
    } catch (e) {
      setSetting('managed_gsc_last_' + m.domain, 'verified but register failed: ' + String(e.message || e).slice(0, 70));
      console.log('[gsc-managed]', m.domain, 'register failed:', String(e.message || e).slice(0, 90));
    }
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
  try { ensureManagedSites(); } catch (e) { console.error('[ops] managed sites:', e.message); }
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
    // QUIET MODE (owner's ask — too many emails): the boot status email
    // only goes out when there's a real signal — a newly recorded crash.
    // Routine deploys boot silently; the Connections panel in the admin
    // console replaces diagnostics-by-email.
    const crash = getSetting('last_crash') || '';
    if (!crash || crash === (getSetting('boot_email_crash_seen') || '')) return;
    setSetting('boot_email_crash_seen', crash);
    const last = Number(getSetting('boot_email_at') || 0);
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
  setTimeout(() => sendSenseCheckReport().catch(e => console.error('[ops] sense check:', e.message)), 210_000);
  setTimeout(() => probeHostingerAnalytics().catch(e => console.error('[probe]', e.message)), 240_000);
  setTimeout(() => fathomCheck().catch(e => console.error('[fathom-check]', e.message)), 180_000);
  try {
    cron.schedule('11 * * * *', () => fathomCheck().catch(e => console.error('[fathom-check]', e.message)), { timezone: config.timezone });
  } catch (e) { console.error('[fathom-check] schedule failed:', e.message); }
  setTimeout(() => runDocrootSurvey().catch(e => console.error('[ops] docroot survey:', e.message)), 300_000);
  setTimeout(() => runStagedFilePeek().catch(e => console.error('[ops] staged peek:', e.message)), 330_000);
  // Search Console finalizer: cheap no-op until the webmasters scope is
  // granted, then completes GSC for every site in one pass.
  setTimeout(() => finalizeSearchConsole().catch(e => console.error('[gsc]', e.message)), 150_000);
  setTimeout(() => verifyManagedSitesGsc().catch(e => console.error('[gsc-managed]', e.message)), 165_000);
  try {
    cron.schedule('7 * * * *', () => { finalizeSearchConsole().catch(e => console.error('[gsc]', e.message)); verifyManagedSitesGsc().catch(e => console.error('[gsc-managed]', e.message)); healGscProperties().catch(e => console.error('[gsc-heal]', e.message)); }, { timezone: config.timezone });
  } catch (e) { console.error('[gsc] schedule failed:', e.message); }
  setTimeout(() => healGscProperties().catch(e => console.error('[gsc-heal]', e.message)), 120_000);
  // Keep live pages matching their intended tag set (Clarity added later,
  // consent banner toggled) — hourly, offset from the GSC pass.
  try {
    cron.schedule('23 * * * *', () => retrofitTags().catch(e => console.error('[retrofit]', e.message)), { timezone: config.timezone });
  } catch (e) { console.error('[retrofit] schedule failed:', e.message); }
  setTimeout(() => retrofitTags().catch(e => console.error('[retrofit]', e.message)), 480_000);
  // Complete the wiring for any site added to the fleet (GA4 adopt/create,
  // Search Console DNS-or-tag, platform classification) — hourly.
  try {
    cron.schedule('37 * * * *', () => onboardNewSites().catch(e => console.error('[onboard]', e.message)), { timezone: config.timezone });
  } catch (e) { console.error('[onboard] schedule failed:', e.message); }
  setTimeout(() => onboardNewSites().catch(e => console.error('[onboard]', e.message)), 240_000);
  // Prove each source carries the right domain's traffic — hourly.
  try {
    cron.schedule('43 * * * *', () => verifySourceIntegrity().catch(e => console.error('[integrity]', e.message)), { timezone: config.timezone });
  } catch (e) { console.error('[integrity] schedule failed:', e.message); }
  setTimeout(() => verifySourceIntegrity().catch(e => console.error('[integrity]', e.message)), 300_000);
  // Fathom on every site: create/match Fathom sites and store IDs — the
  // retrofit then serves the script on file-hosted sites automatically.
  try {
    cron.schedule('53 * * * *', () => ensureFathomSites().catch(e => console.error('[fathom-ensure]', e.message)), { timezone: config.timezone });
  } catch (e) { console.error('[fathom-ensure] schedule failed:', e.message); }
  setTimeout(() => ensureFathomSites().catch(e => console.error('[fathom-ensure]', e.message)), 270_000);
  // Repair shared Fathom IDs (one client seeing another's numbers) and GA
  // properties that report nothing because the tag feeds a different one.
  try {
    cron.schedule('47 * * * *', () => { fixDuplicateFathomIds().catch(e => console.error('[fathom-dupe]', e.message)); healGa4MeasurementIds().catch(e => console.error('[ga-mid]', e.message)).then(() => healGa4Properties().catch(e => console.error('[ga-heal]', e.message))); }, { timezone: config.timezone });
  } catch (e) { console.error('[heal] schedule failed:', e.message); }
  setTimeout(() => fixDuplicateFathomIds().catch(e => console.error('[fathom-dupe]', e.message)), 90_000);
  setTimeout(() => healGa4MeasurementIds().catch(e => console.error('[ga-mid]', e.message))
    .then(() => healGa4Properties().catch(e => console.error('[ga-heal]', e.message))), 200_000);
  // Learn each site's real target keywords from its own Search Console
  // queries — daily (the data moves slowly) plus once after boot.
  try {
    cron.schedule('20 6 * * *', () => deriveTargetKeywords().catch(e => console.error('[keywords]', e.message)), { timezone: config.timezone });
  } catch (e) { console.error('[keywords] schedule failed:', e.message); }
  setTimeout(() => deriveTargetKeywords().catch(e => console.error('[keywords]', e.message)), 420_000);
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
