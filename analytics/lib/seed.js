// First-run seeding: on an empty database, North Bear Media's own website
// is created as customer #1 so there's a real site to see the moment the
// app first opens — then auto-connect runs in the background to wire up
// whatever it can reach. Disable with SEED_FIRST_SITE=false.
import db, { newDashboardToken } from '../database.js';
import { nextRunAt } from './dates.js';
import { autoConnectSite } from './autoconnect.js';

const FIRST_CUSTOMER = {
  client_name: 'North Bear Media',
  contact_name: 'Norton',
  contact_emails: 'norton@northbearmedia.co.uk',
  domain: 'northbearmedia.co.uk',
  report_frequency: 'monthly',
  notes: 'First customer — created automatically on first run.',
};

export function seedFirstCustomer() {
  if (String(process.env.SEED_FIRST_SITE).toLowerCase() === 'false') return null;
  const count = db.prepare('SELECT COUNT(*) AS n FROM sites').get().n;
  if (count > 0) return null;

  const info = db.prepare(`INSERT INTO sites
      (client_name, contact_name, contact_emails, domain, report_frequency, notes, dashboard_token, next_report_at)
      VALUES (@client_name, @contact_name, @contact_emails, @domain, @report_frequency, @notes, @token, @next)`)
    .run({ ...FIRST_CUSTOMER, token: newDashboardToken(), next: nextRunAt(FIRST_CUSTOMER.report_frequency) });
  const siteId = info.lastInsertRowid;
  console.log(`[seed] created first customer: ${FIRST_CUSTOMER.client_name} (${FIRST_CUSTOMER.domain}) → reports to ${FIRST_CUSTOMER.contact_emails}`);

  // Fire-and-forget: fill in whatever can be discovered. Never blocks boot.
  autoConnectSite(siteId)
    .then(({ filled, notes }) => {
      const got = Object.keys(filled);
      if (got.length) console.log(`[seed] auto-connected ${FIRST_CUSTOMER.domain}: ${got.join(', ')}`);
      notes.forEach(n => console.log(`[seed] note: ${n}`));
    })
    .catch(err => console.log(`[seed] auto-connect will be available from the admin console (${err.message})`));

  return siteId;
}
