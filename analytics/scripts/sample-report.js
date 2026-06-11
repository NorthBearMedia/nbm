// Generates data/sample-report.pdf with realistic demo data — no API keys
// needed. Run with: npm run sample-report
import { writeFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { generateReportPdf } from '../lib/pdf.js';

function demoTimeseries(days, base) {
  const out = [];
  const end = new Date('2026-05-31T12:00:00Z');
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    const weekend = [0, 6].includes(d.getUTCDay()) ? 0.6 : 1;
    const sessions = Math.round(base * weekend * (0.75 + Math.random() * 0.5));
    out.push({ date: d.toISOString().slice(0, 10), sessions, users: Math.round(sessions * 0.82) });
  }
  return out;
}

const data = {
  site: { id: 0, clientName: 'RMS Fire Protection', domain: 'rmsfireprotection.co.uk' },
  period: { start: '2026-05-01', end: '2026-05-31' },
  previousPeriod: { start: '2026-04-01', end: '2026-04-30' },
  warnings: [],
  ga4: {
    overview: { sessions: 2847, totalUsers: 2156, newUsers: 1893, screenPageViews: 7412, engagementRate: 0.5832, averageSessionDuration: 134 },
    prevOverview: { sessions: 2453, totalUsers: 1998, newUsers: 1734, screenPageViews: 6890, engagementRate: 0.5510, averageSessionDuration: 141 },
    timeseries: demoTimeseries(31, 92),
    topPages: [
      { path: '/', title: 'Home — RMS Fire Protection', views: 2103, sessions: 1842 },
      { path: '/fire-risk-assessments', title: 'Fire Risk Assessments', views: 1245, sessions: 1009 },
      { path: '/services', title: 'Our Services', views: 987, sessions: 814 },
      { path: '/fire-extinguisher-servicing', title: 'Fire Extinguisher Servicing', views: 743, sessions: 622 },
      { path: '/contact', title: 'Contact Us', views: 689, sessions: 590 },
      { path: '/about', title: 'About RMS', views: 412, sessions: 367 },
      { path: '/fire-blankets', title: 'Fire Blankets', views: 388, sessions: 301 },
    ],
    channels: [
      { channel: 'Organic Search', sessions: 1422 },
      { channel: 'Direct', sessions: 731 },
      { channel: 'Organic Social', sessions: 312 },
      { channel: 'Referral', sessions: 218 },
      { channel: 'Paid Search', sessions: 109 },
      { channel: 'Email', sessions: 55 },
    ],
    devices: [
      { device: 'mobile', sessions: 1689 },
      { device: 'desktop', sessions: 1004 },
      { device: 'tablet', sessions: 154 },
    ],
  },
  search: {
    summary: { clicks: 489, impressions: 21480, ctr: 0.0228, position: 8.4 },
    prevSummary: { clicks: 401, impressions: 18230, ctr: 0.0220, position: 9.6 },
    topQueries: [
      { query: 'fire risk assessment near me', clicks: 87, impressions: 2110, ctr: 0.041, position: 3.2 },
      { query: 'rms fire protection', clicks: 64, impressions: 410, ctr: 0.156, position: 1.1 },
      { query: 'fire extinguisher servicing kent', clicks: 52, impressions: 1820, ctr: 0.029, position: 4.8 },
      { query: 'fire blanket regulations uk', clicks: 41, impressions: 3400, ctr: 0.012, position: 7.3 },
      { query: 'commercial fire safety checks', clicks: 33, impressions: 1530, ctr: 0.022, position: 6.1 },
      { query: 'fire alarm maintenance company', clicks: 28, impressions: 2960, ctr: 0.009, position: 9.8 },
      { query: 'who can do a fire risk assessment', clicks: 22, impressions: 1980, ctr: 0.011, position: 8.9 },
      { query: 'fire safety certificate cost', clicks: 18, impressions: 2400, ctr: 0.008, position: 11.2 },
    ],
  },
  clarity: {
    daysCovered: 28, sessions: 2540, botSessions: 182, deadClicks: 64, rageClicks: 9,
    quickBacks: 31, scriptErrors: 3, avgScrollDepth: 61.4, avgActiveTimeSeconds: 87,
  },
};

const pdf = await generateReportPdf(data);
const out = join(config.dataDir, 'sample-report.pdf');
writeFileSync(out, pdf);
console.log(`Sample report written to ${out}`);
