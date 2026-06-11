// Background jobs:
//  · hourly  — send any reports whose next_report_at has passed
//  · 03:40   — snapshot yesterday's Microsoft Clarity numbers for every site
// Times run in the configured timezone (default Europe/London).
import cron from 'node-cron';
import db from '../database.js';
import { config } from '../config.js';
import { runReport } from './reporter.js';
import { syncSite } from './clarity.js';
import { nextRunAt } from './dates.js';

function nowStamp() {
  // "YYYY-MM-DD HH:mm" in the configured timezone — same format as next_report_at
  const d = new Date();
  const date = d.toLocaleDateString('en-CA', { timeZone: config.timezone });
  const time = d.toLocaleTimeString('en-GB', { timeZone: config.timezone, hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

// Give sites a first schedule, and repair any that lost one.
export function initialiseSchedules() {
  const sites = db.prepare(`SELECT * FROM sites WHERE active = 1 AND report_frequency != 'none' AND (next_report_at IS NULL OR next_report_at = '')`).all();
  for (const site of sites) {
    db.prepare('UPDATE sites SET next_report_at = ? WHERE id = ?').run(nextRunAt(site.report_frequency), site.id);
  }
}

export async function sendDueReports() {
  const now = nowStamp();
  // Sites without a contact email can't receive anything — skip rather
  // than logging a failure every cycle (covers bulk-imported sites that
  // haven't been finished off yet).
  const due = db.prepare(`SELECT * FROM sites WHERE active = 1 AND report_frequency != 'none' AND contact_emails != '' AND next_report_at IS NOT NULL AND next_report_at <= ?`).all(now);
  for (const site of due) {
    // Advance the schedule first so a crash mid-send can't cause an email storm.
    db.prepare('UPDATE sites SET next_report_at = ? WHERE id = ?').run(nextRunAt(site.report_frequency), site.id);
    await runReport(site, { trigger: 'scheduled' });
  }
  return due.length;
}

export async function syncAllClarity() {
  const sites = db.prepare(`SELECT * FROM sites WHERE active = 1 AND clarity_api_token != ''`).all();
  let synced = 0;
  for (const site of sites) {
    try {
      const r = await syncSite(site);
      if (r.synced) synced++;
    } catch (err) {
      console.error(`[clarity] sync failed for ${site.client_name}: ${err.message}`);
    }
  }
  if (synced) console.log(`[clarity] snapshotted ${synced} site(s)`);
  return synced;
}

export function startScheduler() {
  initialiseSchedules();
  cron.schedule('5 * * * *', () => sendDueReports().catch(e => console.error('[scheduler]', e)), { timezone: config.timezone });
  cron.schedule('40 3 * * *', () => syncAllClarity().catch(e => console.error('[clarity]', e)), { timezone: config.timezone });
  // Catch up on Clarity snapshots shortly after boot too (covers restarts/deploys).
  setTimeout(() => syncAllClarity().catch(e => console.error('[clarity]', e)), 15_000);
  console.log(`[scheduler] running (timezone ${config.timezone}) — reports checked hourly, Clarity synced daily 03:40`);
}
