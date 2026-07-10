// scripts/seed-willis-cooper-tasks.js
//
// Drafts the July 2026 content list into Willis Cooper tasks.
//
//   node scripts/seed-willis-cooper-tasks.js            # apply
//   node scripts/seed-willis-cooper-tasks.js --dry-run  # preview only
//
// Also exported as seedWillisCooper(db) so server.js can run it once at boot
// (guarded by an app_meta flag) — no Railway shell step needed.
//
// Same safety pattern as seed-current-workload.js: matches the client by name,
// skips tasks whose titles already exist (idempotent), never deletes anything,
// writes canonical status/band/type with legacy shadows via lib/taskmap.js.

import { statusToProgress, bandToPriority } from '../lib/taskmap.js';

const TASKS = [
  {
    title: 'IHT content onto socials', deadline: '2026-07-09',
    status: 'scheduled', band: 'this-week', type: 'ad-hoc',
    notes: 'Inheritance tax content going onto socials — Thursday 9 July.',
  },
  {
    title: 'World Cup sweepstake updates — who’s still in', deadline: '2026-07-09',
    aliases: ['World Cup social updates — quarter-finals onwards'],
    status: 'scheduled', band: 'this-week', type: 'ad-hoc',
    notes: 'Post who is still in the sweepstake — from the round of 16 through to the final, updating as teams go out.',
  },
  {
    title: 'MTD post (generic) — first quarter ends', deadline: '2026-08-02',
    status: 'scheduled', band: 'today', type: 'ad-hoc',
    notes: 'Making Tax Digital generic post. First quarter ends today — timely now; 2 August is the final deadline.',
  },
  {
    title: 'Payments on account reminder post (personal tax)', deadline: '2026-07-31',
    status: 'scheduled', band: 'scheduled', type: 'ad-hoc',
    notes: 'Payments on account due 31 July — publish the reminder ahead of the deadline.',
  },
  {
    title: "Office puppy 'Guess the name' teaser posts", deadline: '2026-07-27',
    status: 'scheduled', band: 'scheduled', type: 'ad-hoc',
    notes: 'New office puppy: black Lab, name is Zeus (do NOT reveal — public guesses). Run teasers before pickup on 27 July.',
  },
  {
    title: 'Puppy reveal video launch — Zeus the black Lab', deadline: '2026-07-27', planned: '2026-07-27',
    status: 'scheduled', band: 'scheduled', type: 'ad-hoc',
    notes: 'Pickup day is 27 July — launch the reveal video: name announcement (Zeus) + first day at the office.',
  },
  {
    title: "Jess's birthday post", deadline: '2026-07-16',
    status: 'scheduled', band: 'scheduled', type: 'ad-hoc',
    notes: "Jess's birthday — 16 July.",
  },
  {
    title: 'Xero Gold Partner announcement — website + socials',
    status: 'inbox', band: 'this-week', type: 'ad-hoc',
    notes: 'Willis Cooper are now a Xero Gold Partner — announce on the website and across socials.',
  },
  {
    title: 'Publish blogs onto website + videos',
    status: 'inbox', band: '', type: 'ad-hoc',
    notes: 'One-off backlog clear: get the existing blogs onto the website along with the videos.',
  },
  {
    title: 'Lucie back from trip — welcome-back post',
    status: 'scheduled', band: 'this-week', type: 'ad-hoc',
    notes: 'Lucie is back — get the details (and any photos) from her about the trip, then draft the welcome-back post.',
  },
  // Fortnightly Tuesday 14:00 removed — it's a catch-up call already in Norton's diary, not a task.
];

const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Returns a report, or null when the Willis Cooper client doesn't exist yet
// (so the boot-time caller can retry on a later start instead of flagging done).
export function seedWillisCooper(db, { dry = false } = {}) {
  const client = db.prepare("SELECT id, name FROM clients WHERE lower(name) = 'willis cooper' AND is_system = 0").get();
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
          `INSERT INTO tasks (project_id, client_id, title, deadline, planned_date, progress, priority,
             task_status, task_band, task_type, notes, is_recurring, recur_interval, recur_unit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          projectId, client.id, t.title, t.deadline || '', t.planned || '',
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
if (process.argv[1] && process.argv[1].endsWith('seed-willis-cooper-tasks.js')) {
  const { default: db } = await import('../database.js');
  const DRY = process.argv.includes('--dry-run');
  const report = seedWillisCooper(db, { dry: DRY });
  if (!report) { console.error('Willis Cooper client not found — aborting (nothing written).'); process.exit(1); }
  console.log(`\nWillis Cooper content list ${DRY ? '(DRY RUN)' : ''}`);
  console.log(`  client: #${report.client.id} ${report.client.name}`);
  console.log(`  tasks created: ${report.created}`);
  console.log(`  skipped as already present: ${report.skipped.length}${report.skipped.length ? ' — ' + report.skipped.join(' | ') : ''}\n`);
  process.exit(0);
}
