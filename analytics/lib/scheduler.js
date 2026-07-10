// Background jobs:
//  · hourly  — send any reports whose next_report_at has passed
//  · 03:40   — snapshot yesterday's Microsoft Clarity numbers for every site
// Times run in the configured timezone (default Europe/London).
import cron from 'node-cron';
import db, { backupDatabase, getSetting, setSetting } from '../database.js';
import { config } from '../config.js';
import { runReport } from './reporter.js';
import { syncSite } from './clarity.js';
import { nextRunAt, addDays, todayISO } from './dates.js';

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
  // One-shot repair: schedules stamped under the old timing (1st/Monday)
  // move to the new lag-aware dates (3rd/Wednesday) — including any date
  // stuck in the past on sites that had no contact email.
  if (getSetting('schedule_repair_v1_done') !== 'true') {
    const all = db.prepare(`SELECT * FROM sites WHERE report_frequency != 'none' AND next_report_at IS NOT NULL`).all();
    for (const site of all) {
      db.prepare('UPDATE sites SET next_report_at = ? WHERE id = ?').run(nextRunAt(site.report_frequency), site.id);
    }
    setSetting('schedule_repair_v1_done', 'true');
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
    const result = await runReport(site, { trigger: 'scheduled' });
    // Failed (no data yet, SMTP down, bad address…)? Retry tomorrow morning
    // instead of skipping a whole period — but only a few times: after 4
    // failures in a week, park it at the next natural date so a broken site
    // can't fail-and-retry daily forever. Failures stay visible in the
    // admin console (Connections panel + setup status).
    if (!result.ok) {
      const failsThisWeek = db.prepare(`SELECT COUNT(*) AS n FROM reports WHERE site_id = ? AND status = 'failed' AND trigger_type = 'scheduled' AND created_at > datetime('now', '-7 day')`).get(site.id).n;
      if (failsThisWeek < 4) {
        const tomorrow = `${addDays(todayISO(), 1)} 07:00`;
        db.prepare('UPDATE sites SET next_report_at = ? WHERE id = ?').run(tomorrow, site.id);
        console.log(`[scheduler] ${site.client_name}: failed (${failsThisWeek + 1} this week) — will retry ${tomorrow}`);
      } else {
        console.log(`[scheduler] ${site.client_name}: failed ${failsThisWeek} times this week — parked until next scheduled date`);
      }
    }
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
  // Clarity's API only exposes yesterday, so a day the 03:40 run is missed
  // (redeploy, API blip) would be a permanent hole — the 13:40 pass and the
  // boot catch-up are second and third chances at the same snapshot.
  cron.schedule('40 3 * * *', () => syncAllClarity().catch(e => console.error('[clarity]', e)), { timezone: config.timezone });
  cron.schedule('40 13 * * *', () => syncAllClarity().catch(e => console.error('[clarity]', e)), { timezone: config.timezone });
  setTimeout(() => syncAllClarity().catch(e => console.error('[clarity]', e)), 15_000);
  // Hourly rolling database backups (kept: last 48) + one shortly after boot.
  cron.schedule('50 * * * *', () => backupDatabase().catch(e => console.error('[backup]', e)), { timezone: config.timezone });
  setTimeout(() => backupDatabase('boot').catch(e => console.error('[backup]', e)), 30_000);
  console.log(`[scheduler] running (timezone ${config.timezone}) — reports hourly, Clarity 03:40+13:40, DB backup hourly`);
}
