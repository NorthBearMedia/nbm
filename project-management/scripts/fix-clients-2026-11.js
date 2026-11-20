// scripts/fix-clients-2026-11.js
//
// Norton's corrections, 20 Nov 2026 ("it's wrong on a few bits"):
//   - Keto & Clarity is Sasha Lonsgren, also called Uni Nutrition — near-daily
//     contact, and billed £1,850 a month in Xero (Uni Nutrition Ltd).
//   - Ginger Butchers (Xero: New Close Farm Ltd, £1,000/month) and Isis Rescue
//     (Xero: Isis Rescue Limited, £450/month) are missing.
//   - Caring Places can come off.
//
// Exported as fixClientsNov2026(db) so server.js runs it once at boot (guarded
// by an app_meta flag) — no Railway shell step. Safe to run twice: it matches
// clients by name, restores an archived match rather than creating a
// duplicate, never deletes anything (Caring Places is ARCHIVED — restorable
// from Archive), and logs every change.
//
//   node scripts/fix-clients-2026-11.js            # apply (local DB)
//   node scripts/fix-clients-2026-11.js --dry-run  # preview only

const UK_TODAY = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

// The Xero contact ids these retainers are billed under (from the repeating
// invoices; with the link set, the monthly value then follows Xero) and their
// Metricool brands (for the monthly report's social figures).
const CLIENTS = [
  {
    name: 'Keto & Clarity', match: /keto\s*(&|and)\s*clarity|uni\s*nutrition|sasha\s*lonsgren/i,
    aliases: ['Sasha Lonsgren', 'Uni Nutrition'], xero: '9bee1e52-e848-4dc0-8e43-c2f52e894e01', monthly: 1850, metricool: '8153720',
    lastContactToday: true,   // "almost daily contact"
  },
  {
    name: 'Ginger Butchers', match: /ginger\s*butcher|new\s*close\s*farm/i,
    aliases: ['New Close Farm'], xero: 'fc9ac084-8c07-47db-99a6-c0e81a1a4ff9', monthly: 1000, metricool: '7057405',
  },
  {
    name: 'Isis Rescue', match: /isis\s*rescue/i,
    aliases: [], xero: 'b144569d-9bd9-4ff3-89d8-97822b90a227', monthly: 450, metricool: '7689647',
  },
];
const TAKE_OFF = [{ name: 'Caring Places', match: /caring\s*places/i }];

function log(db, clientId, detail, author) {
  db.prepare(`INSERT INTO activity_log (entity_type, entity_id, action, author, details, created_at)
    VALUES ('client', ?, ?, ?, ?, datetime('now'))`).run(clientId, detail.startsWith('Created') ? 'created' : 'updated', author, detail);
}

function mergeAliases(existing, add) {
  const list = String(existing || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const a of add) if (!list.some(x => x.toLowerCase() === a.toLowerCase())) list.push(a);
  return list.join(', ');
}

function codeFor(db, name) {
  const base = name.replace(/&/g, ' ').split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().replace(/[^A-Z]/g, '');
  let code = (base + 'XXX').slice(0, 3);
  for (let i = 0; db.prepare('SELECT 1 FROM clients WHERE code = ?').get(code) && i < 26; i++) code = code.slice(0, 2) + String.fromCharCode(65 + i);
  return code;
}

export function fixClientsNov2026(db, { dry = false } = {}) {
  const owner = db.prepare("SELECT display_name FROM users WHERE role = 'owner' ORDER BY id LIMIT 1").get();
  const author = `${owner?.display_name || 'Norton'}`;
  const all = db.prepare('SELECT * FROM clients WHERE is_system = 0').all();
  const hits = re => all.filter(c => re.test(`${c.name} ${c.aliases || ''}`));
  const report = { updated: [], created: [], restored: [], archived: [] };
  const today = UK_TODAY();

  const run = () => {
    for (const want of CLIENTS) {
      const found = hits(want.match);
      let c = found.find(x => !x.archived) || found[0];
      if (!c) {
        const res = db.prepare(`INSERT INTO clients (name, code, agreement_type, client_type, monthly_value, aliases, xero_contact_id, metricool_blog_id, last_contact_date)
          VALUES (?, ?, 'recurring', 'retainer', ?, ?, ?, ?, ?)`).run(want.name, codeFor(db, want.name), want.monthly,
          want.aliases.join(', '), want.xero, want.metricool || '', want.lastContactToday ? today : '');
        log(db, res.lastInsertRowid, `Created client "${want.name}" — £${want.monthly}/month, linked to Xero (Norton's correction, 20 Nov)`, author);
        report.created.push(want.name);
        continue;
      }
      const changes = [];
      if (c.archived) { db.prepare('UPDATE clients SET archived = 0 WHERE id = ?').run(c.id); changes.push('restored from Archive'); report.restored.push(c.name); }
      const aliases = mergeAliases(c.aliases, want.aliases);
      if (aliases !== (c.aliases || '')) { db.prepare('UPDATE clients SET aliases = ? WHERE id = ?').run(aliases, c.id); changes.push(`also known as: ${aliases}`); }
      if (!c.xero_contact_id) { db.prepare('UPDATE clients SET xero_contact_id = ? WHERE id = ?').run(want.xero, c.id); changes.push('linked to Xero'); }
      if (want.metricool && !c.metricool_blog_id) { db.prepare('UPDATE clients SET metricool_blog_id = ? WHERE id = ?').run(want.metricool, c.id); changes.push('linked to Metricool'); }
      if (Math.abs((c.monthly_value || 0) - want.monthly) >= 0.5) {
        db.prepare('UPDATE clients SET monthly_value = ? WHERE id = ?').run(want.monthly, c.id);
        changes.push(`monthly value £${c.monthly_value || 0} → £${want.monthly} (Xero)`);
      }
      if (c.client_type !== 'retainer') { db.prepare("UPDATE clients SET client_type = 'retainer' WHERE id = ?").run(c.id); changes.push('type → retainer'); }
      if (want.lastContactToday && (c.last_contact_date || '') < today) {
        db.prepare('UPDATE clients SET last_contact_date = ? WHERE id = ?').run(today, c.id);
        changes.push('last contact → today');
      }
      if (changes.length) {
        log(db, c.id, `${changes.join('; ')} (Norton's correction, 20 Nov)`, author);
        report.updated.push(`${c.name}: ${changes.join('; ')}`);
      }
    }
    for (const off of TAKE_OFF) {
      for (const c of hits(off.match).filter(x => !x.archived)) {
        db.prepare('UPDATE clients SET archived = 1 WHERE id = ?').run(c.id);
        log(db, c.id, `Archived "${c.name}" — taken off (Norton's correction, 20 Nov). Restore from Archive if needed.`, author);
        report.archived.push(c.name);
      }
    }
  };
  if (dry) {
    // Preview: run inside a transaction and roll it back.
    try { db.transaction(() => { run(); throw new Error('dry-run'); })(); } catch (e) { if (e.message !== 'dry-run') throw e; }
  } else {
    db.transaction(run)();
  }
  return report;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const { default: db } = await import('../database.js');
  const dry = process.argv.includes('--dry-run');
  console.log(JSON.stringify(fixClientsNov2026(db, { dry }), null, 2), dry ? '(dry run — nothing saved)' : '');
}
