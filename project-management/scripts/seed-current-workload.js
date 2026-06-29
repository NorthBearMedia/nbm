// scripts/seed-current-workload.js
//
// One-time, safe import of the current real workload into the Client Control Board.
//
//   node scripts/seed-current-workload.js            # apply changes
//   node scripts/seed-current-workload.js --dry-run  # preview only, write nothing
//
// Safety guarantees:
//   • Never deletes anything. Only INSERTs and conditional UPDATEs.
//   • Matches existing clients by name (+ aliases); updates new CCB fields only when
//     they are currently blank, so it never clobbers values you've already set.
//   • Skips creating a task if a similar (non-archived) task already exists for that client.
//   • Writes through the same structure the routes use: canonical task_status/task_band/
//     task_type plus the legacy progress/priority shadow (via lib/taskmap.js) and an
//     auto-created "General" project per client — so legacy sync and the UI stay correct.
//   • Idempotent: running it twice produces no duplicates.
//
// Prints a summary: clients created / updated, tasks created / skipped, manual-review items.

import db from '../database.js';
import {
  statusToProgress, bandToPriority,
  isValidStatus, isValidBand, isValidType,
  isValidClientType, isValidControlStatus, isValidRisk,
} from '../lib/taskmap.js';

const DRY = process.argv.includes('--dry-run');

// ─── Helpers ────────────────────────────────────────────
function thisWeeksWednesday() {
  // Wednesday of the current Monday-anchored week, as YYYY-MM-DD.
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const dow = now.getDay();                 // 0=Sun..6=Sat
  const monOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now); monday.setDate(now.getDate() + monOffset);
  const wed = new Date(monday); wed.setDate(monday.getDate() + 2);
  return wed.toISOString().split('T')[0];
}

function normTitle(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function genCode(name) {
  const letters = name.replace(/[^a-zA-Z ]/g, ' ').split(/\s+/).filter(Boolean).map(w => w[0]).join('');
  return (letters || name.replace(/[^a-zA-Z]/g, '')).substring(0, 3).toUpperCase().padEnd(3, 'X');
}

function findClient(spec) {
  const candidates = [spec.name, ...(spec.aliases || [])];
  for (const n of candidates) {
    const row = db.prepare('SELECT * FROM clients WHERE lower(name) = lower(?) AND is_system = 0').get(n.trim());
    if (row) return row;
  }
  return null;
}

function ensureProject(clientId) {
  let proj = db.prepare('SELECT id FROM projects WHERE client_id = ? ORDER BY id LIMIT 1').get(clientId);
  if (proj) return proj.id;
  if (DRY) return -1;
  const r = db.prepare('INSERT INTO projects (client_id, name, status) VALUES (?, ?, ?)').run(clientId, 'General', 'active');
  return r.lastInsertRowid;
}

function taskExistsLike(clientId, title) {
  const want = normTitle(title);
  const rows = db.prepare('SELECT title FROM tasks WHERE client_id = ? AND archived = 0').all(clientId);
  return rows.some(r => {
    const have = normTitle(r.title);
    return have === want || (have.length > 6 && want.length > 6 && (have.includes(want) || want.includes(have)));
  });
}

const report = {
  clientsCreated: [], clientsUpdated: [], tasksCreated: 0,
  tasksSkipped: [], manualReview: [],
};

// ─── Upsert a client ────────────────────────────────────
function upsertClient(spec) {
  const fields = {
    client_type: isValidClientType(spec.client_type) ? spec.client_type : 'ad-hoc',
    monthly_value: spec.monthly_value || 0,
    agreement_summary: spec.agreement_summary || '',
    recurring_deliverables: spec.recurring_deliverables || '',
    control_status: isValidControlStatus(spec.control_status || '') ? (spec.control_status || '') : '',
    risk_level: isValidRisk(spec.risk_level || '') ? (spec.risk_level || '') : '',
    notes: spec.notes || '',
    important_contacts: spec.important_contacts || '',
  };

  const existing = findClient(spec);
  if (existing) {
    // Only fill fields that are currently blank/zero — never clobber existing values.
    const sets = [], vals = [], changed = [];
    const fillText = (col) => {
      if (fields[col] && (existing[col] === null || existing[col] === '' || existing[col] === undefined)) {
        sets.push(`${col} = ?`); vals.push(fields[col]); changed.push(col);
      }
    };
    ['client_type', 'agreement_summary', 'recurring_deliverables', 'control_status', 'risk_level', 'notes', 'important_contacts'].forEach(fillText);
    if (fields.monthly_value && !existing.monthly_value) { sets.push('monthly_value = ?'); vals.push(fields.monthly_value); changed.push('monthly_value'); }

    if (sets.length && !DRY) {
      vals.push(existing.id);
      db.prepare(`UPDATE clients SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    }
    if (existing.notes && spec.notes && normTitle(existing.notes) !== normTitle(spec.notes) && !changed.includes('notes')) {
      report.manualReview.push(`Client "${existing.name}" already had notes — left untouched; review whether to merge the seed context.`);
    }
    report.clientsUpdated.push({ name: existing.name, id: existing.id, changed });
    return existing.id;
  }

  // Create new client
  if (DRY) { report.clientsCreated.push({ name: spec.name, id: '(dry-run)' }); return -1; }
  const r = db.prepare(
    `INSERT INTO clients (name, code, agreement_type, client_type, monthly_value, agreement_summary,
       recurring_deliverables, control_status, risk_level, notes, important_contacts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    spec.name, genCode(spec.name),
    fields.client_type === 'retainer' ? 'recurring' : 'ad-hoc',   // legacy agreement_type
    fields.client_type, fields.monthly_value, fields.agreement_summary,
    fields.recurring_deliverables, fields.control_status, fields.risk_level,
    fields.notes, fields.important_contacts
  );
  report.clientsCreated.push({ name: spec.name, id: r.lastInsertRowid });
  return r.lastInsertRowid;
}

// ─── Create a task (dedup-aware) ────────────────────────
function createTask(clientId, clientName, t) {
  if (!isValidStatus(t.status)) { report.manualReview.push(`Task "${t.title}" (${clientName}): invalid status "${t.status}" — skipped.`); return; }
  if (t.band && !isValidBand(t.band)) { report.manualReview.push(`Task "${t.title}" (${clientName}): invalid band "${t.band}".`); }
  const band = isValidBand(t.band) ? t.band : '';
  const type = isValidType(t.type) ? t.type : 'ad-hoc';

  if (clientId !== -1 && taskExistsLike(clientId, t.title)) {
    report.tasksSkipped.push(`${clientName}: "${t.title}"`);
    return;
  }

  const progress = statusToProgress(t.status);
  const priority = band ? bandToPriority(band) : 'medium';
  if (DRY) { report.tasksCreated++; return; }

  const projectId = ensureProject(clientId);
  db.prepare(
    `INSERT INTO tasks (project_id, client_id, title, deadline, planned_date, estimated_hours,
       progress, priority, task_status, task_band, task_type, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    projectId, clientId, t.title, t.deadline || '', t.planned_date || '', t.estimated_hours || 0,
    progress, priority, t.status, band, type, t.notes || ''
  );
  report.tasksCreated++;
}

// ─── Workload data ──────────────────────────────────────
const WED = thisWeeksWednesday();

const WORKLOAD = [
  {
    name: 'Arnold House', client_type: 'project', control_status: 'red', risk_level: 'high',
    agreement_summary: 'Filming project — London. One filming day completed; another upcoming.',
    notes: 'Filming coming up on Wednesday. One day already completed. Need to present existing footage to Charlie and Steph, prep & charge kit, travel to London, review shot list and schedule for a full filming day.',
    important_contacts: 'Charlie · Steph (clients)',
    tasks: [
      { title: 'Share existing Arnold House footage with Charlie and Steph', type: 'ad-hoc', band: 'today', status: 'inbox', notes: 'Prepare shared file/link of footage already filmed and send to Charlie and Steph before Wednesday.' },
      { title: 'Prep Arnold House filming kit', type: 'urgent', band: 'today', status: 'inbox', notes: 'Charge cameras, batteries, audio, lights and anything needed for London filming day.' },
      { title: 'Review Arnold House shot list', type: 'urgent', band: 'today', status: 'inbox', notes: 'Refresh planned shots before Wednesday filming.' },
      { title: 'Review Arnold House schedule', type: 'urgent', band: 'today', status: 'inbox', notes: 'Make sure the full filming day schedule is understood before travel.' },
      { title: 'Arnold House filming day in London', type: 'ad-hoc', band: 'scheduled', status: 'scheduled', planned_date: WED, notes: `Wednesday filming day, full day, travel to London. Planned for Wednesday this week (${WED}).` },
    ],
  },
  {
    name: 'Willis Cooper', client_type: 'retainer', control_status: 'red', risk_level: 'high',
    agreement_summary: 'Both our accountant and a customer. Meeting tomorrow.',
    notes: 'Willis Cooper are both my accountant and a customer. Seeing them tomorrow. Outstanding client tasks to finish before the meeting, then plan the next mission. Separate internal finance/admin items relate to PAYE/payroll/NI.',
    tasks: [
      { title: 'Complete outstanding Willis Cooper client tasks before meeting', type: 'urgent', band: 'today', status: 'inbox', notes: 'Finish enough outstanding Willis Cooper work before tomorrow’s meeting so the relationship feels controlled and professional.' },
      { title: 'Prepare Willis Cooper meeting plan', type: 'ad-hoc', band: 'today', status: 'inbox', notes: 'Review completed work, remaining tasks and next mission before meeting.' },
      { title: 'Separate Willis Cooper customer work from accountant/payroll admin', type: 'admin', band: 'this-week', status: 'inbox', notes: 'Make sure client delivery tasks and internal accounting/payroll tasks are not mixed up.' },
    ],
  },
  {
    name: 'North Bear Internal/Admin', client_type: 'ad-hoc', control_status: 'red', risk_level: 'high',
    agreement_summary: 'Internal business admin, finance, recurring invoicing and reporting automation.',
    notes: 'Internal business admin, finance, recurring invoicing and reporting automation.',
    tasks: [
      { title: 'Pay PAYE NI contribution', type: 'admin', band: 'today', status: 'inbox', notes: 'PAYE/NI contribution needs paying or scheduling.' },
      { title: 'Pay outstanding National Insurance balance', type: 'admin', band: 'today', status: 'inbox', notes: 'Outstanding NI balance needs paying or scheduling.' },
      { title: 'Review recurring invoices', type: 'admin', band: 'this-week', status: 'inbox', notes: 'Check recurring invoices are set up correctly, especially for clients with ongoing support.' },
      { title: 'Set up website analytics reporting automation', type: 'admin', band: 'this-week', status: 'inbox', notes: 'Customers with websites need automated analytics reports. Started but not finished.' },
      { title: 'Schedule weekly accounting/admin block', type: 'recurring', band: 'scheduled', status: 'inbox', notes: 'Create a regular weekly block for Xero/accounting/general business admin.' },
      { title: 'Schedule North Bear own social media block', type: 'recurring', band: 'scheduled', status: 'inbox', notes: 'Own socials are needed but should not override urgent paid client work.' },
    ],
  },
  {
    name: 'Keith Sims / Maxus', aliases: ['Maxus', 'Keith Sims'], client_type: 'retainer', monthly_value: 345,
    control_status: 'amber', risk_level: 'medium',
    agreement_summary: 'SEO retainer agreed at £345/month (not yet set up) + 7 blog posts requested.',
    notes: 'Maxus website built previously. Ian Barnes emailed: seven blog posts needed. New SEO agreement at £345/month but nothing set up yet. June newsletter proposal came back with typo feedback.',
    important_contacts: 'Ian Barnes · Keith Sims',
    tasks: [
      { title: 'Fix typos in June newsletter proposal', type: 'urgent', band: 'today', status: 'inbox', notes: 'Keith replied saying there are a few typos. Fix and resend.' },
      { title: 'Create seven Maxus blog posts', type: 'ad-hoc', band: 'this-week', status: 'inbox', notes: 'Ian Barnes requested seven blog posts for the Maxus website.' },
      { title: 'Start Maxus SEO onboarding', type: 'recurring', band: 'this-week', status: 'inbox', notes: 'SEO retainer agreed at £345/month but currently only written on a scrap of paper. Needs proper setup.' },
      { title: 'Build first month Maxus SEO plan', type: 'recurring', band: 'this-week', status: 'inbox', notes: 'Create first month SEO plan, access checklist, keywords/pages/actions and reporting rhythm.' },
    ],
  },
  {
    name: 'Sasha / Keto and Clarity', aliases: ['Keto and Clarity', 'Keto & Clarity', 'Sasha'], client_type: 'project',
    control_status: 'amber', risk_level: 'medium',
    agreement_summary: 'YouTube channel trial — filming & editing, hopefully ongoing.',
    notes: 'New YouTube channel trial. Doing filming and editing, hopefully leading to ongoing work. First cut done, Sasha liked it and sent edits. Edits are a relatively long job and need doing while momentum is good.',
    important_contacts: 'Sasha',
    tasks: [
      { title: 'Apply Sasha video edit changes', type: 'ad-hoc', band: 'today', status: 'inbox', notes: 'First cut was liked. Edits have been sent over. Apply edits and prepare revised cut.' },
      { title: 'Send revised Keto and Clarity cut to Sasha', type: 'ad-hoc', band: 'this-week', status: 'inbox', notes: 'Send revised version after edits are complete.' },
      { title: 'Create possible ongoing YouTube workflow', type: 'sales', band: 'someday', status: 'inbox', notes: 'If trial goes well, consider regular filming/editing workflow and pricing.' },
    ],
  },
  {
    name: 'Evergreen', client_type: 'prospect', control_status: 'amber', risk_level: 'medium',
    agreement_summary: 'Potential longer-term opportunity — proposal to watch.',
    notes: 'Potential longer term opportunity. There is a proposal to look out for and someone wants to work with me on something longer term.',
    tasks: [
      { title: 'Follow up Evergreen proposal/opportunity', type: 'sales', band: 'this-week', status: 'inbox', notes: 'Check status of proposal and next steps for longer term work.' },
    ],
  },
  {
    name: 'Prime PR Marketing', client_type: 'project', control_status: 'red', risk_level: 'high',
    agreement_summary: 'Website updates outstanding for 12 days.',
    notes: 'Website updates have been waiting for 12 days and nothing has been done yet.',
    tasks: [
      { title: 'Complete Prime PR Marketing website updates', type: 'urgent', band: 'today', status: 'inbox', notes: 'Website updates have been outstanding for 12 days. Complete them or send a clear update.' },
    ],
  },
  {
    name: 'Smartmove Homes', client_type: 'retainer', monthly_value: 500, control_status: 'amber', risk_level: 'medium',
    agreement_summary: 'Estate agent — £125/week property video & content support.',
    recurring_deliverables: 'Weekly property video/content support.\nMonthly meeting.\nLast-minute edits may need triage/delegation.',
    notes: 'Estate agent client paying £125/week. Property video edits and related support. Scope has changed a little. Outstanding tasks from the last monthly meeting; next monthly meeting needs scheduling. Often sends last-minute video work needing quick turnaround. Hayley can help with overflow edits remotely.',
    important_contacts: 'Hayley (overflow edits)',
    tasks: [
      { title: 'Review Smartmove outstanding meeting tasks', type: 'ad-hoc', band: 'this-week', status: 'inbox', notes: 'Review tasks from last monthly meeting and finish or schedule them.' },
      { title: 'Schedule next Smartmove monthly meeting', type: 'recurring', band: 'this-week', status: 'inbox', notes: 'Check diary and book next monthly meeting.' },
      { title: 'Set Smartmove last minute video overflow process', type: 'admin', band: 'this-week', status: 'inbox', notes: 'Define when to do edits personally and when to forward to Hayley.' },
      { title: 'Weekly Smartmove video/content block', type: 'recurring', band: 'scheduled', status: 'inbox', notes: 'Create a recurring weekly block for Smartmove work.' },
    ],
  },
  {
    name: 'Caring Places', client_type: 'retainer', monthly_value: 200, control_status: 'amber', risk_level: 'medium',
    agreement_summary: '£200/month — light social media and SEO support.',
    recurring_deliverables: 'Light social media and SEO support.',
    notes: 'Paying £200/month for a small amount of social media and SEO support. Not much done yet. Needs a regular schedule so it stays up to date.',
    tasks: [
      { title: 'Create Caring Places monthly support schedule', type: 'recurring', band: 'this-week', status: 'inbox', notes: 'Build a simple monthly rhythm for social and SEO support.' },
      { title: 'Complete first Caring Places support block', type: 'recurring', band: 'this-week', status: 'inbox', notes: 'Do first batch of support work and make sure the client is being looked after.' },
    ],
  },
  {
    name: 'CN Maintenance', client_type: 'project', control_status: 'blue', risk_level: 'low',
    agreement_summary: 'Website build — waiting on customer to go live & transfer domain.',
    notes: 'Website build in progress. Waiting for customer to come back. Need to transfer the domain and get the site live.',
    tasks: [
      { title: 'Chase CN Maintenance for website go live/domain response', type: 'waiting', band: 'waiting', status: 'waiting-on-client', notes: 'Waiting for customer. Need confirmation to transfer domain and go live.' },
      { title: 'Transfer CN Maintenance domain and put website live', type: 'ad-hoc', band: 'scheduled', status: 'waiting-on-client', notes: 'Do this once customer provides what is needed.' },
    ],
  },
  {
    name: 'Enzo HR', client_type: 'project', control_status: 'blue', risk_level: 'low',
    agreement_summary: 'Website in production — awaiting customer response.',
    notes: 'Website in production. Waiting for customer to come back. No response yet.',
    tasks: [
      { title: 'Chase Enzo HR website response', type: 'waiting', band: 'waiting', status: 'waiting-on-client', notes: 'Waiting for customer response on website build.' },
      { title: 'Continue Enzo HR website build after feedback', type: 'ad-hoc', band: 'scheduled', status: 'waiting-on-client', notes: 'Resume once client replies.' },
    ],
  },
  {
    name: 'Ivy House', client_type: 'retainer', control_status: 'red', risk_level: 'high',
    agreement_summary: 'Residential care home — social support; not yet invoiced.',
    recurring_deliverables: 'Social support/content.',
    notes: 'Residential care home client. Doing a little social support. Not invoiced yet. Need to get on top of recurring invoices and a regular work rhythm.',
    tasks: [
      { title: 'Invoice Ivy House', type: 'admin', band: 'today', status: 'inbox', notes: 'They have not been invoiced. Send invoice and check recurring setup.' },
      { title: 'Create Ivy House social content rhythm', type: 'recurring', band: 'this-week', status: 'inbox', notes: 'Diarise regular social support so work goes out consistently.' },
      { title: 'Complete first Ivy House scheduled social support block', type: 'recurring', band: 'this-week', status: 'inbox', notes: 'Do first support block after schedule is created.' },
    ],
  },
  {
    name: 'Richford Motor Services', aliases: ['Richford'], client_type: 'retainer', control_status: 'amber', risk_level: 'medium',
    agreement_summary: 'Long-standing customer — work slipped, outstanding invoice. Plan TBC after meeting. (Status TBC after this morning’s 11am meeting.)',
    notes: 'Meeting this morning at 11. Decent customer for a while, but some work has slipped and there is an outstanding invoice. Work has slowed; need to pick it back up. Plan depends on today’s meeting. Status TBC after meeting.',
    tasks: [
      { title: 'Prepare for Richford meeting', type: 'urgent', band: 'today', status: 'inbox', notes: 'Review slipped work, outstanding invoice and desired next step before 11am meeting.' },
      { title: 'Create Richford follow up plan after meeting', type: 'ad-hoc', band: 'today', status: 'inbox', notes: 'After meeting, define ongoing work, invoice position and next actions.' },
      { title: 'Check Richford outstanding invoice', type: 'admin', band: 'today', status: 'inbox', notes: 'Confirm what is outstanding and discuss/follow up appropriately.' },
    ],
  },
  {
    name: 'Steadplan', client_type: 'retainer', monthly_value: 1200, control_status: 'amber', risk_level: 'high',
    agreement_summary: 'SEO setup at £1,200/month — awaiting details from Hal (MD).',
    notes: 'SEO setup at £1,200/month. Waiting for details from Hal, the MD. Big job — needs proper onboarding, planning and delivery.',
    important_contacts: 'Hal (MD)',
    tasks: [
      { title: 'Chase/check Steadplan details from Hal', type: 'waiting', band: 'waiting', status: 'waiting-on-client', notes: 'Waiting for details from Hal before full SEO setup can start.' },
      { title: 'Create Steadplan SEO onboarding checklist', type: 'recurring', band: 'this-week', status: 'inbox', notes: 'High value £1,200/month SEO account needs proper onboarding checklist.' },
      { title: 'Build first month Steadplan SEO plan', type: 'recurring', band: 'this-week', status: 'inbox', notes: 'Create baseline, access list, keyword/page priorities, reporting structure and first month actions.' },
      { title: 'Schedule Steadplan monthly SEO review rhythm', type: 'recurring', band: 'scheduled', status: 'inbox', notes: 'Monthly review/reporting rhythm needed because this is a high value account.' },
    ],
  },
  {
    name: 'Sales Pipeline', client_type: 'prospect', control_status: 'amber', risk_level: 'medium',
    agreement_summary: 'Live enquiries + cross-sell opportunities to follow up.',
    notes: 'Two or three enquiries on the bubble and some customers that could be cross sold to. These need follow up rather than sitting in my head.',
    tasks: [
      { title: 'List current enquiries on the bubble', type: 'sales', band: 'this-week', status: 'inbox', notes: 'Identify the two or three current enquiries that need follow up.' },
      { title: 'Follow up warm enquiries', type: 'sales', band: 'this-week', status: 'inbox', notes: 'Send follow ups to live prospects.' },
      { title: 'Identify cross sell opportunities', type: 'sales', band: 'this-week', status: 'inbox', notes: 'List existing customers where cross sell makes sense.' },
      { title: 'Create cross sell follow up tasks', type: 'sales', band: 'scheduled', status: 'inbox', notes: 'Turn cross sell ideas into specific client follow ups.' },
    ],
  },
];

// ─── Run ────────────────────────────────────────────────
function run() {
  for (const spec of WORKLOAD) {
    const clientId = upsertClient(spec);
    for (const t of (spec.tasks || [])) createTask(clientId, spec.name, t);
  }
}

if (DRY) {
  run();
} else {
  db.transaction(run)();   // atomic: all-or-nothing
}

// ─── Summary ────────────────────────────────────────────
const line = '─'.repeat(60);
console.log(`\n${line}\n  SEED CURRENT WORKLOAD ${DRY ? '(DRY RUN — nothing written)' : '— COMPLETE'}\n${line}`);
console.log(`\nClients created (${report.clientsCreated.length}):`);
report.clientsCreated.forEach(c => console.log(`  + ${c.name}  [#${c.id}]`));
console.log(`\nClients updated (${report.clientsUpdated.length}):`);
report.clientsUpdated.forEach(c => console.log(`  ~ ${c.name}  [#${c.id}]${c.changed.length ? '  fields: ' + c.changed.join(', ') : '  (no blank fields to fill)'}`));
console.log(`\nTasks created: ${report.tasksCreated}`);
console.log(`Tasks skipped as likely duplicates (${report.tasksSkipped.length}):`);
report.tasksSkipped.forEach(t => console.log(`  · ${t}`));
console.log(`\nNeeds manual review (${report.manualReview.length}):`);
report.manualReview.forEach(m => console.log(`  ! ${m}`));
console.log(`\n${line}`);
if (DRY) console.log('  Re-run without --dry-run to apply.');
console.log('');

process.exit(0);
