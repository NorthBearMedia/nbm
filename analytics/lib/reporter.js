// Orchestrates one report run: gather data → render PDF → email → record.
import { writeFileSync } from 'fs';
import { join } from 'path';
import db from '../database.js';
import { config } from '../config.js';
import { gatherReportData } from './report-data.js';
import { generateReportPdf } from './pdf.js';
import { sendReportEmail } from './email.js';
import { periodFor, formatDate } from './dates.js';

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'site';
}

export async function runReport(site, { trigger = 'scheduled', period } = {}) {
  const p = period || periodFor(site.report_frequency, trigger === 'scheduled' ? 'scheduled' : 'requested');
  const periodText = p.label || `${formatDate(p.start)} – ${formatDate(p.end)}`;
  try {
    const data = await gatherReportData(site, p.start, p.end);
    // Never send a client an empty report: search-only reports must have
    // at least some search presence to be worth anyone's inbox.
    const searchMeaningless = !data.search ||
      (!(data.search.summary?.impressions > 0) && !(data.search.summary?.clicks > 0));
    if (!data.ga4 && !data.clarity && searchMeaningless) {
      throw new Error(`No meaningful data for this period. ${data.warnings.join(' | ') || 'No sources configured or nothing recorded yet.'}`);
    }
    const pdf = await generateReportPdf(data);
    const filename = `${slug(site.client_name)}-report-${p.start}-to-${p.end}.pdf`;
    const storedName = `${site.id}-${Date.now()}-${filename}`;
    writeFileSync(join(config.reportsDir, storedName), pdf);

    const sentTo = await sendReportEmail(site, data, pdf, periodText, filename);
    db.prepare(`INSERT INTO reports (site_id, period_start, period_end, period_label, pdf_path, sent_to, trigger_type, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'sent')`)
      .run(site.id, p.start, p.end, periodText, storedName, sentTo.join(', '), trigger);
    console.log(`[report] sent ${site.client_name} (${periodText}) → ${sentTo.join(', ')}`);
    return { ok: true, sentTo, periodText, warnings: data.warnings };
  } catch (err) {
    db.prepare(`INSERT INTO reports (site_id, period_start, period_end, period_label, sent_to, trigger_type, status, error)
                VALUES (?, ?, ?, ?, ?, ?, 'failed', ?)`)
      .run(site.id, p.start, p.end, periodText, site.contact_emails, trigger, err.message);
    console.error(`[report] FAILED ${site.client_name}: ${err.message}`);
    return { ok: false, error: err.message, periodText };
  }
}

// PDF only — used by the admin "preview" button (no email, no record).
export async function previewReportPdf(site, period) {
  const p = period || periodFor(site.report_frequency, 'requested');
  const data = await gatherReportData(site, p.start, p.end);
  return generateReportPdf(data);
}
