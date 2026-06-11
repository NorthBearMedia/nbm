// Date helpers. All report maths works on plain YYYY-MM-DD strings in the
// configured timezone, which keeps SQLite, the Google APIs and PDFKit in sync.
import { config } from '../config.js';

export function toISODate(d) {
  return d.toLocaleDateString('en-CA', { timeZone: config.timezone });
}

export function todayISO() {
  return toISODate(new Date());
}

export function addDays(iso, days) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(startIso, endIso) {
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / 86400000);
}

export function formatDate(iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
}

// The reporting period a given frequency covers, ending yesterday for
// on-demand runs or covering the previous full week/month/quarter for
// scheduled runs.
export function periodFor(frequency, mode = 'scheduled') {
  const yesterday = addDays(todayISO(), -1);
  if (mode === 'requested' || frequency === 'none') {
    return { start: addDays(yesterday, -29), end: yesterday, label: 'Last 30 days' };
  }
  if (frequency === 'weekly') {
    // Previous Monday–Sunday
    const d = new Date(todayISO() + 'T12:00:00Z');
    const dow = d.getUTCDay() || 7; // Mon=1..Sun=7
    const lastSunday = addDays(todayISO(), -dow);
    const lastMonday = addDays(lastSunday, -6);
    return { start: lastMonday, end: lastSunday, label: `Week of ${formatDate(lastMonday, { day: 'numeric', month: 'short' })} – ${formatDate(lastSunday)}` };
  }
  if (frequency === 'quarterly') {
    const now = new Date(todayISO() + 'T12:00:00Z');
    const qStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
    const qStart = new Date(Date.UTC(now.getUTCFullYear(), qStartMonth, 1, 12));
    const prevQStart = new Date(Date.UTC(qStart.getUTCFullYear(), qStart.getUTCMonth() - 3, 1, 12));
    const prevQEnd = addDays(qStart.toISOString().slice(0, 10), -1);
    const start = prevQStart.toISOString().slice(0, 10);
    return { start, end: prevQEnd, label: `${formatDate(start, { month: 'long', year: 'numeric' })} – ${formatDate(prevQEnd, { month: 'long', year: 'numeric' })}` };
  }
  // monthly: previous calendar month
  const now = new Date(todayISO() + 'T12:00:00Z');
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12));
  const prevStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1, 12));
  const start = prevStart.toISOString().slice(0, 10);
  const end = addDays(monthStart.toISOString().slice(0, 10), -1);
  return { start, end, label: formatDate(start, { month: 'long', year: 'numeric' }) };
}

// The equivalent period immediately before [start, end], for "vs previous
// period" comparisons.
export function previousPeriod(start, end) {
  const len = daysBetween(start, end) + 1;
  return { start: addDays(start, -len), end: addDays(start, -1) };
}

// Next scheduled send: weekly → next Monday, monthly → 1st of next month,
// quarterly → next quarter start. Always 07:00 in the configured timezone
// (stored as an ISO date-hour string the scheduler compares against).
export function nextRunAt(frequency, from = new Date()) {
  if (frequency === 'none') return null;
  const today = toISODate(from);
  let dateIso;
  if (frequency === 'weekly') {
    const d = new Date(today + 'T12:00:00Z');
    const dow = d.getUTCDay() || 7;
    dateIso = addDays(today, 8 - dow); // next Monday (always in the future)
  } else if (frequency === 'quarterly') {
    const d = new Date(today + 'T12:00:00Z');
    const nextQMonth = (Math.floor(d.getUTCMonth() / 3) + 1) * 3;
    const nq = new Date(Date.UTC(d.getUTCFullYear(), nextQMonth, 1, 12));
    dateIso = nq.toISOString().slice(0, 10);
  } else {
    const d = new Date(today + 'T12:00:00Z');
    const nm = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 12));
    dateIso = nm.toISOString().slice(0, 10);
  }
  return `${dateIso} 07:00`;
}
