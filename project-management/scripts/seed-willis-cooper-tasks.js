// scripts/seed-willis-cooper-tasks.js
//
// One-off: drafts the July 2026 content list into Willis Cooper tasks.
//
//   node scripts/seed-willis-cooper-tasks.js            # apply
//   node scripts/seed-willis-cooper-tasks.js --dry-run  # preview only
//
// Same safety pattern as seed-current-workload.js: matches the client by name,
// skips tasks whose titles already exist (idempotent), never deletes anything,
// writes canonical status/band/type with legacy shadows via lib/taskmap.js.

import db from '../database.js';
import { statusToProgress, bandToPriority } from '../lib/taskmap.js';

const DRY = process.argv.includes('--dry-run');

const client = db.prepare("SELECT id, name FROM clients WHERE lower(name) = 'willis cooper' AND is_system = 0").get();
if (!client) { console.error('Willis Cooper client not found — aborting (nothing written).'); process.exit(1); }

const TASKS = [
  {
    title: 'IHT content onto socials', deadline: '2026-07-09',
    status: 'scheduled', band: 'this-week', type: 'ad-hoc',
    notes: 'Inheritance tax content going onto socials — Thursday 9 July.',
  },
  {
    title: 'World Cup social updates — quarter-finals onwards', deadline: '2026-07-09',
    status: 'scheduled', band: 'this-week', type: 'ad-hoc',
    notes: 'Cover the World Cup from the quarter-finals through the final. CONFIRM: "who is on" — who’s still in / staff picks / who posts?',
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
    notes: 'Get the blogs onto the website along with the videos. CONFIRM: one-off backlog or a recurring rhythm?',
  },
  {
    title: 'Lucie back from trip — welcome-back post',
    status: 'inbox', band: '', type: 'ad-hoc',
    notes: 'Welcome-back content when Lucie returns. CONFIRM: return date TBC.',
  },
  {
    title: 'Fortnightly Tuesday 14:00 slot', planned: '2026-07-07',
    status: 'scheduled', band: 'scheduled', type: 'recurring',
    recurring: { interval: 2, unit: 'weeks' },
    notes: '14:00 every other Tuesday. CONFIRM: which Tuesday anchors it (7th or 14th?) and what the slot is (catch-up call / content drop?).',
  },
];

const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const existing = db.prepare('SELECT title FROM tasks WHERE client_id = ? AND archived = 0').all(client.id).map(r => norm(r.title));

function ensureProject(clientId) {
  let proj = db.prepare('SELECT id FROM projects WHERE client_id = ? ORDER BY id LIMIT 1').get(clientId);
  if (proj) return proj.id;
  const r = db.prepare("INSERT INTO projects (client_id, name, status) VALUES (?, 'General', 'active')").run(clientId);
  return r.lastInsertRowid;
}

let created = 0; const skipped = [];
const run = () => {
  const projectId = ensureProject(client.id);
  for (const t of TASKS) {
    if (existing.some(e => e === norm(t.title))) { skipped.push(t.title); continue; }
    if (!DRY) {
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
DRY ? run() : db.transaction(run)();

console.log(`\nWillis Cooper content list ${DRY ? '(DRY RUN)' : ''}`);
console.log(`  client: #${client.id} ${client.name}`);
console.log(`  tasks created: ${created}`);
console.log(`  skipped as already present: ${skipped.length}${skipped.length ? ' — ' + skipped.join(' | ') : ''}\n`);
process.exit(0);
