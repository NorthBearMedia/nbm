// scripts/seed-richford-tasks.js
//
// Drafts Norton's July 2026 rough list into Richford Motor Services tasks.
//
//   node scripts/seed-richford-tasks.js            # apply
//   node scripts/seed-richford-tasks.js --dry-run  # preview only
//
// Also exported as seedRichford(db) so server.js can run it once at boot
// (guarded by an app_meta flag) — no Railway shell step needed.
//
// Same safety pattern as seed-willis-cooper-tasks.js: matches the client by
// name, skips tasks whose titles already exist (idempotent), never deletes
// anything, writes canonical status/band/type with legacy shadows.

import { statusToProgress, bandToPriority } from '../lib/taskmap.js';

const TASKS = [
  {
    title: 'World Cup truck images + write-up to Pro Rec',
    aliases: ['1966 World Cup truck — imagery + write-up to Professional Recovery'],
    status: 'scheduled', band: 'this-week', type: 'ad-hoc',
    notes: 'Send the World Cup truck images and write-up to Paul Gregory and David at Pro Rec for editorial.',
  },
  {
    title: 'Change contact number on First Mover ad', assignee: 'Norton',
    status: 'scheduled', band: 'this-week', type: 'ad-hoc',
    notes: 'Update the contact number on the First Mover ad.',
  },
  {
    title: 'Change contact number on Birdgehill ad', assignee: 'Norton',
    aliases: ['Change contact number on Bridgehill ad'],
    status: 'scheduled', band: 'this-week', type: 'ad-hoc',
    notes: 'Update the number on the Birdgehill ad. (Name as written in notes — check spelling Birdgehill/Bridgehill.)',
  },
  {
    title: 'Contact AVRO mag — new ads, updated numbers, Avro Connect', assignee: 'Norton',
    status: 'scheduled', band: 'this-week', type: 'ad-hoc',
    notes: 'Talk to AVRO magazine about new ads, get the existing ads updated with the new phone numbers, and look into Avro Connect.',
  },
  {
    title: 'Push First Mover videos — tag vehicle manufacturers', assignee: 'Norton',
    status: 'scheduled', band: '', type: 'ad-hoc',
    notes: 'Push the First Mover videos out and see if we can tag the vehicle manufacturer (Ferrari etc.) for extra reach.',
  },
  {
    title: 'Remove Bristol Port image from all ads', assignee: 'Norton',
    status: 'scheduled', band: 'this-week', type: 'ad-hoc',
    notes: 'Ensure the Bristol Port image is removed from every ad.',
  },
  {
    title: 'Push Fire Blanket sales',
    status: 'inbox', band: '', type: 'ad-hoc',
    notes: 'Marketing push on fire blanket sales. Channels TBC — assume socials + ads unless told otherwise.',
  },
  {
    title: 'Create Richford Motors YouTube channel',
    status: 'inbox', band: '', type: 'ad-hoc',
    notes: 'Set up a YouTube channel for Richford Motors (home for First Mover videos, truck walkarounds etc.).',
  },
  {
    title: 'Website changes — brief Dan',
    aliases: ['RMS website changes (Dan’s list)'],
    status: 'scheduled', band: 'this-week', type: 'ad-hoc',
    notes: 'Changes needed: 1) remove the press brake machine pics; 2) take the pressure tester machine pic off; 3) engineering side needs its list going on the page; 4) move the pressure-testing content to the mechanic side; 5) CAD / SolidWorks design facilities (assume: add these to the engineering page). CONFIRM: is Dan making these changes or are we doing them and briefing him?',
  },
  {
    title: 'Visit RMS Derby — images + walkaround video of truck 66',
    aliases: ['Visit RMS Derby — shoot the 1966 World Cup tribute truck'],
    status: 'inbox', band: '', type: 'ad-hoc',
    notes: 'Visit RMS Derby and capture images plus walkaround video footage. CONFIRM: truck fleet number 66, or 66 trucks?',
  },
  {
    title: 'Link Prolux and fire blankets',
    status: 'inbox', band: '', type: 'idea',
    notes: 'Idea from the notes (was a question): explore tying Prolux and the fire blankets together as an offer.',
  },
  {
    title: 'RMS social posts — min 2 per week', planned: '2026-07-13',
    status: 'scheduled', band: 'scheduled', type: 'recurring',
    recurring: { interval: 1, unit: 'weeks' },
    notes: 'Regular social posts for Richford — at least two per week, every week.',
  },
  {
    title: 'Add new depots to website — Rother Valley Way (S20 3RW) + Shilo Way',
    status: 'scheduled', band: 'this-week', type: 'ad-hoc',
    notes: 'Add the new depots: Rother Valley Way, Sheffield S20 3RW, and Shilo Way. Assume website + anywhere else depots are listed (Google Business etc.).',
  },
  {
    title: 'Contact ports & airports re First Mover sales',
    status: 'inbox', band: '', type: 'sales',
    notes: 'Prospecting: contact ports and airports about First Mover sales (was a question in the notes — treat as a lead to explore).',
  },
  {
    title: 'Keep driver + controller jobs live on websites', planned: '2026-07-13',
    status: 'scheduled', band: 'scheduled', type: 'recurring',
    recurring: { interval: 1, unit: 'weeks' },
    notes: 'Standing weekly check: Driver jobs and Controller roles must be constantly live on the websites.',
  },
  {
    title: 'Mention RMS key cutting services',
    status: 'inbox', band: '', type: 'ad-hoc',
    notes: 'Get the key cutting service mentioned — assume a social post + a line on the website unless told otherwise.',
  },
  {
    title: 'Tow Show ad campaign — run-up',
    status: 'inbox', band: '', type: 'ad-hoc',
    notes: 'Build and run the ad campaign in the run-up to the Tow Show. CONFIRM: date of the show, so the run-up can be scheduled.',
  },
  {
    title: 'Check tasks from David Lerpiniere email', assignee: 'Norton',
    status: 'scheduled', band: 'this-week', type: 'admin',
    notes: 'Go through David Lerpiniere’s email and pull the tasks out of it (paste it into the console chat and they can be drafted automatically).',
  },
  {
    title: "'Meet the Professionals' — capitalise + pass to Pro Rec",
    status: 'scheduled', band: 'this-week', type: 'ad-hoc',
    notes: 'Ensure “Meet the Professionals” is capitalised; pass on to Pro Rec.',
  },
  {
    title: 'Inside front cover ad placement — take up opportunity',
    aliases: ['Professional Recovery — take up inside-front-cover positioning'],
    status: 'inbox', band: '', type: 'sales',
    notes: 'Opportunity to put both ads inside the front cover. CONFIRM which magazine (AVRO?). Context from the meeting: Operator Focus is paid placement — that’s why RMS has never been in it.',
  },
];

const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Returns a report, or null when the Richford client doesn't exist yet
// (so the boot-time caller can retry on a later start instead of flagging done).
export function seedRichford(db, { dry = false } = {}) {
  const client = db.prepare(
    "SELECT id, name FROM clients WHERE is_system = 0 AND (lower(name) LIKE 'richford%' OR code = 'RMS') ORDER BY id LIMIT 1"
  ).get();
  if (!client) return null;

  const existing = db.prepare('SELECT title FROM tasks WHERE client_id = ? AND archived = 0').all(client.id).map(r => norm(r.title));

  const ensureProject = clientId => {
    const proj = db.prepare('SELECT id FROM projects WHERE client_id = ? ORDER BY id LIMIT 1').get(clientId);
    if (proj) return proj.id;
    return db.prepare("INSERT INTO projects (client_id, name, status) VALUES (?, 'General', 'active')").run(clientId).lastInsertRowid;
  };

  let created = 0; const skipped = [];
  const run = () => {
    const projectId = ensureProject(client.id);
    for (const t of TASKS) {
      const names = [t.title, ...(t.aliases || [])].map(norm);
      if (existing.some(e => names.includes(e))) { skipped.push(t.title); continue; }
      if (!dry) {
        db.prepare(
          `INSERT INTO tasks (project_id, client_id, title, assignee, deadline, planned_date, progress, priority,
             task_status, task_band, task_type, notes, is_recurring, recur_interval, recur_unit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          projectId, client.id, t.title, t.assignee || '', t.deadline || '', t.planned || '',
          statusToProgress(t.status), t.band ? bandToPriority(t.band) : 'medium',
          t.status, t.band || '', t.type, t.notes || '',
          t.recurring ? 1 : 0, t.recurring?.interval || 0, t.recurring?.unit || ''
        );
      }
      created++;
    }
  };
  dry ? run() : db.transaction(run)();
  return { client, created, skipped };
}

// ─── v2 amendment: Norton's answers + Dave Lerpiniere's email ─────────────
// The v1 seed may already have run on live before these answers arrived, so
// corrections are applied as in-place UPDATEs (matched by title, client-scoped,
// never touching done/cancelled state except where intended) plus new creates.
// Safe to run any number of times.
const V2_UPDATES = [
  {
    match: 'Visit RMS Derby — images + walkaround video of truck 66',
    title: 'Visit RMS Derby — shoot the 1966 World Cup tribute truck',
    deadline: '2026-07-14', status: 'scheduled', band: 'this-week',
    notes: 'Capture images and walkaround video of the 1966 World Cup Winning Team tribute truck — the imagery feeds the Professional Recovery editorial, which needs everything by 15 July.',
  },
  {
    match: 'Change contact number on Birdgehill ad',
    title: 'Change contact number on Bridgehill ad',
    notes: 'Update the number on the Bridgehill ad.',
  },
  {
    match: 'Website changes — brief Dan',
    title: 'RMS website changes (Dan’s list)', assignee: 'Norton',
    notes: 'We’re making these ourselves: 1) remove the press brake machine pics; 2) take the pressure tester machine pic off; 3) engineering side’s list going on the page; 4) move the pressure-testing content to the mechanic side; 5) add CAD / SolidWorks design facilities to the engineering page.',
  },
  {
    match: 'World Cup truck images + write-up to Pro Rec',
    title: '1966 World Cup truck — imagery + write-up to Professional Recovery', assignee: 'Norton',
    deadline: '2026-07-15', status: 'scheduled', band: 'this-week',
    notes: 'Send imagery plus a written piece on the 1966 World Cup Winning Team branded truck to Professional Recovery — with them by 15 July to make the next issue. Liaise directly with Paul Gregory on the editorial (Dave copied him in).',
  },
  {
    match: 'Tow Show ad campaign — run-up',
    status: 'scheduled', planned: '2026-08-03',
    notes: 'The Tow Show is in September — build the campaign and run it through August. (The Tow Show Guide full-page ad renewal is covered in the Professional Recovery renewals task.)',
  },
  {
    match: 'Inside front cover ad placement — take up opportunity',
    title: 'Professional Recovery — take up inside-front-cover positioning', assignee: 'Norton',
    status: 'scheduled', band: 'this-week',
    notes: 'The Professional Recovery director offered inside-front-cover placement for both RMS ads (conversation last week) — confirm and get it in place alongside the renewals. Context: Operator Focus is paid placement, which is why RMS has never been in it.',
  },
  {
    match: 'Check tasks from David Lerpiniere email',
    status: 'done', completed_at: '2026-07-10',
    notes: 'Done — tasks extracted from Dave’s email onto Console: 15 July editorial deadline, advertising renewals, digital opportunities, advertorial content.',
  },
];

const V2_CREATES = [
  {
    title: 'Professional Recovery renewals — agree with RMS', assignee: 'Norton',
    status: 'scheduled', band: 'this-week', type: 'admin',
    notes: 'Due for renewal per Dave Lerpiniere: 2× half-page ads in every issue of Professional Recovery at £200 per half (18 issues/yr) · full-page in the Tow Show Guide £400 · full-page in the 2027 Yearbook £450 · Gala Awards Dinner table of 10 £700. Forward features plan + group media pack attached to Dave’s email.',
  },
  {
    title: 'Review Professional Recovery digital opportunities',
    status: 'inbox', band: '', type: 'ad-hoc',
    notes: 'Decide with RMS which are worth taking: 60/40 e-newsletter to 19,817 subscribers £475 · social amplification post with 25,000 guaranteed reach £450 · Tow Show interview with 10,000 guaranteed Facebook views £500 · bespoke videos (price on application).',
  },
  {
    title: 'Send advertorial content to Professional Recovery',
    status: 'inbox', band: '', type: 'ad-hoc',
    notes: 'Dave: send over any advertorial content we’d like featured — they’re happy to support with it.',
  },
];

export function amendRichfordV2(db, { dry = false } = {}) {
  const client = db.prepare(
    "SELECT id, name FROM clients WHERE is_system = 0 AND (lower(name) LIKE 'richford%' OR code = 'RMS') ORDER BY id LIMIT 1"
  ).get();
  if (!client) return null;

  const all = () => db.prepare('SELECT * FROM tasks WHERE client_id = ? AND archived = 0').all(client.id);
  const report = { updated: [], created: [], alreadyPresent: [], missing: [] };

  const run = () => {
    for (const u of V2_UPDATES) {
      const t = all().find(r => norm(r.title) === norm(u.match) || (u.title && norm(r.title) === norm(u.title)));
      if (!t) { report.missing.push(u.match); continue; }
      const fields = {
        title: u.title, notes: u.notes, assignee: u.assignee,
        deadline: u.deadline, planned_date: u.planned,
        task_status: u.status, task_band: u.band, completed_at: u.completed_at,
        progress: u.status ? statusToProgress(u.status) : undefined,
        priority: u.band ? bandToPriority(u.band) : undefined,
      };
      const sets = [], vals = [];
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
      }
      if (!sets.length) continue;
      if (!dry) db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals, t.id);
      report.updated.push(u.title || u.match);
    }

    const projectId = (() => {
      const proj = db.prepare('SELECT id FROM projects WHERE client_id = ? ORDER BY id LIMIT 1').get(client.id);
      return proj ? proj.id : db.prepare("INSERT INTO projects (client_id, name, status) VALUES (?, 'General', 'active')").run(client.id).lastInsertRowid;
    })();
    const existing = all().map(r => norm(r.title));
    for (const t of V2_CREATES) {
      if (existing.includes(norm(t.title))) { report.alreadyPresent.push(t.title); continue; }
      if (!dry) {
        db.prepare(
          `INSERT INTO tasks (project_id, client_id, title, assignee, deadline, planned_date, progress, priority,
             task_status, task_band, task_type, notes, is_recurring, recur_interval, recur_unit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, '')`
        ).run(
          projectId, client.id, t.title, t.assignee || '', t.deadline || '', t.planned || '',
          statusToProgress(t.status), t.band ? bandToPriority(t.band) : 'medium',
          t.status, t.band || '', t.type, t.notes || ''
        );
      }
      report.created.push(t.title);
    }
  };
  dry ? run() : db.transaction(run)();
  return { client, ...report };
}

// CLI entrypoint (kept for manual runs in the Railway shell)
if (process.argv[1] && process.argv[1].endsWith('seed-richford-tasks.js')) {
  const { default: db } = await import('../database.js');
  const DRY = process.argv.includes('--dry-run');
  const report = seedRichford(db, { dry: DRY });
  if (!report) { console.error('Richford client not found — aborting (nothing written).'); process.exit(1); }
  console.log(`\nRichford Motor Services list ${DRY ? '(DRY RUN)' : ''}`);
  console.log(`  client: #${report.client.id} ${report.client.name}`);
  console.log(`  tasks created: ${report.created}`);
  console.log(`  skipped as already present: ${report.skipped.length}${report.skipped.length ? ' — ' + report.skipped.join(' | ') : ''}`);
  const v2 = amendRichfordV2(db, { dry: DRY });
  console.log(`\nv2 amendment ${DRY ? '(DRY RUN)' : ''}`);
  console.log(`  updated: ${v2.updated.length}${v2.updated.length ? ' — ' + v2.updated.join(' | ') : ''}`);
  console.log(`  created: ${v2.created.length}${v2.created.length ? ' — ' + v2.created.join(' | ') : ''}`);
  console.log(`  already present: ${v2.alreadyPresent.length}`);
  console.log(`  not found (skipped): ${v2.missing.length}${v2.missing.length ? ' — ' + v2.missing.join(' | ') : ''}\n`);
  process.exit(0);
}
