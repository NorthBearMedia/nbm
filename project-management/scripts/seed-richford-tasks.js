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
    status: 'scheduled', band: 'this-week', type: 'ad-hoc',
    notes: 'Changes needed: 1) remove the press brake machine pics; 2) take the pressure tester machine pic off; 3) engineering side needs its list going on the page; 4) move the pressure-testing content to the mechanic side; 5) CAD / SolidWorks design facilities (assume: add these to the engineering page). CONFIRM: is Dan making these changes or are we doing them and briefing him?',
  },
  {
    title: 'Visit RMS Derby — images + walkaround video of truck 66',
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

// CLI entrypoint (kept for manual runs in the Railway shell)
if (process.argv[1] && process.argv[1].endsWith('seed-richford-tasks.js')) {
  const { default: db } = await import('../database.js');
  const DRY = process.argv.includes('--dry-run');
  const report = seedRichford(db, { dry: DRY });
  if (!report) { console.error('Richford client not found — aborting (nothing written).'); process.exit(1); }
  console.log(`\nRichford Motor Services list ${DRY ? '(DRY RUN)' : ''}`);
  console.log(`  client: #${report.client.id} ${report.client.name}`);
  console.log(`  tasks created: ${report.created}`);
  console.log(`  skipped as already present: ${report.skipped.length}${report.skipped.length ? ' — ' + report.skipped.join(' | ') : ''}\n`);
  process.exit(0);
}
