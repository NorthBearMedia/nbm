// Branded A4 portrait PDF report, drawn with PDFKit (pure JS, no headless
// browser). All positioning is absolute; ensureSpace() starts a new page
// with a slim header if a section would overflow.
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pctChange } from './report-data.js';
import { formatDate } from './dates.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGO = join(__dirname, '..', 'public', 'assets', 'nbm-logo-light-trimmed.png');

const A4 = { w: 595.28, h: 841.89 };
const M = 40;
const CW = A4.w - M * 2;
const FOOTER_Y = A4.h - 46;

const C = {
  charcoal: '#221F20',
  green: '#2EAA7B',
  greenDark: '#1E8A61',
  greenTint: '#EAF7F1',
  ink: '#23262C',
  sub: '#5C6470',
  faint: '#98A0AC',
  card: '#F5F6F8',
  border: '#E6E9EE',
  zebra: '#F8F9FB',
  red: '#D9534F',
  white: '#FFFFFF',
  headerSub: '#B9BFC9',
};

const nf = new Intl.NumberFormat('en-GB');
const nfc = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });
const fmtInt = n => nf.format(Math.round(n || 0));
const fmtCompact = n => nfc.format(n || 0);
const fmtPct = (p, dp = 1) => `${(p || 0).toFixed(dp)}%`;
function fmtDur(seconds) {
  const s = Math.round(seconds || 0);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function periodLabel(data) {
  return `${formatDate(data.period.start)} – ${formatDate(data.period.end)}`;
}

// ─── building blocks ─────────────────────────────────────────────

function fullHeader(doc, data) {
  doc.rect(0, 0, A4.w, 150).fill(C.charcoal);
  doc.rect(0, 150, A4.w, 3).fill(C.green);
  doc.image(LOGO, M, 42, { height: 62 });

  const rx = 250, rw = A4.w - rx - M;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.green)
    .text('WEBSITE PERFORMANCE REPORT', rx, 42, { width: rw, align: 'right', characterSpacing: 1.6 });
  doc.font('Helvetica-Bold').fontSize(21).fillColor(C.white)
    .text(data.site.clientName, rx, 56, { width: rw, align: 'right', lineBreak: false, ellipsis: true, height: 26 });
  doc.font('Helvetica').fontSize(10).fillColor(C.headerSub)
    .text(data.site.domain || '', rx, 84, { width: rw, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C.white)
    .text(periodLabel(data), rx, 104, { width: rw, align: 'right' });
  doc.font('Helvetica').fontSize(8.5).fillColor(C.headerSub)
    .text(`Prepared by North Bear Media · ${formatDate(new Date().toISOString().slice(0, 10))}`, rx, 121, { width: rw, align: 'right' });
  return 176;
}

function slimHeader(doc, data) {
  doc.rect(0, 0, A4.w, 56).fill(C.charcoal);
  doc.rect(0, 56, A4.w, 2).fill(C.green);
  doc.image(LOGO, M, 15, { height: 26 });
  doc.font('Helvetica').fontSize(9).fillColor(C.headerSub)
    .text(`${data.site.clientName} · ${periodLabel(data)}`, 200, 24, { width: A4.w - 200 - M, align: 'right' });
  return 82;
}

function ensureSpace(doc, data, y, needed) {
  if (y + needed <= FOOTER_Y - 12) return y;
  doc.addPage();
  return slimHeader(doc, data);
}

function sectionTitle(doc, y, title, subtitle) {
  doc.font('Helvetica-Bold').fontSize(13).fillColor(C.ink).text(title, M, y);
  doc.rect(M, y + 18, 26, 2.5).fill(C.green);
  let h = 30;
  if (subtitle) {
    doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(C.sub).text(subtitle, M, y + 26, { width: CW });
    h += doc.heightOfString(subtitle, { width: CW }) + 2;
  }
  return y + h;
}

function drawDelta(doc, x, y, pct, { invert = false, suffix = 'vs previous period' } = {}) {
  if (pct == null) {
    doc.font('Helvetica').fontSize(7.5).fillColor(C.faint).text(`— ${suffix}`, x, y);
    return;
  }
  const good = invert ? pct <= 0 : pct >= 0;
  const color = pct === 0 ? C.faint : (good ? C.greenDark : C.red);
  const up = pct >= 0;
  // small solid triangle (vector — keeps us inside WinAnsi-safe text)
  doc.save().fillColor(color);
  if (up) doc.moveTo(x, y + 6).lineTo(x + 6, y + 6).lineTo(x + 3, y + 1).fill();
  else doc.moveTo(x, y + 1).lineTo(x + 6, y + 1).lineTo(x + 3, y + 6).fill();
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(color)
    .text(`${Math.abs(pct).toFixed(1)}%`, x + 9, y, { continued: false, lineBreak: false });
  const w = doc.widthOfString(`${Math.abs(pct).toFixed(1)}%`);
  doc.font('Helvetica').fontSize(7.5).fillColor(C.faint).text(` ${suffix}`, x + 9 + w, y, { lineBreak: false });
}

// Plain-English rank movement ("up 2.3 places") with the same coloured
// triangle as drawDelta — for ranking positions, where a percentage
// change means nothing to a business owner.
function drawMove(doc, x, y, places, { suffix = 'vs previous period' } = {}) {
  if (places == null || !isFinite(places)) {
    doc.font('Helvetica').fontSize(7.5).fillColor(C.faint).text(`— ${suffix}`, x, y);
    return;
  }
  const good = places >= 0; // positive = moved UP the rankings
  const color = Math.abs(places) < 0.05 ? C.faint : (good ? C.greenDark : C.red);
  doc.save().fillColor(color);
  if (good) doc.moveTo(x, y + 6).lineTo(x + 6, y + 6).lineTo(x + 3, y + 1).fill();
  else doc.moveTo(x, y + 1).lineTo(x + 6, y + 1).lineTo(x + 3, y + 6).fill();
  doc.restore();
  const word = Math.abs(places) < 0.05 ? 'no change' : `${good ? 'up' : 'down'} ${Math.abs(places).toFixed(1)} place${Math.abs(places).toFixed(1) === '1.0' ? '' : 's'}`;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(color).text(word, x + 9, y, { lineBreak: false });
  const w = doc.widthOfString(word);
  doc.font('Helvetica').fontSize(7.5).fillColor(C.faint).text(` ${suffix}`, x + 9 + w, y, { lineBreak: false });
}

function kpiCards(doc, y, cards, { perRow = 3, cardH = 70 } = {}) {
  const gap = 10;
  const cardW = (CW - gap * (perRow - 1)) / perRow;
  cards.forEach((card, i) => {
    const cx = M + (i % perRow) * (cardW + gap);
    const cy = y + Math.floor(i / perRow) * (cardH + gap);
    doc.roundedRect(cx, cy, cardW, cardH, 6).fill(C.card);
    doc.roundedRect(cx, cy, cardW, cardH, 6).lineWidth(0.75).stroke(C.border);
    doc.rect(cx, cy + 6, 2.5, cardH - 12).fill(C.green);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.sub)
      .text(card.label.toUpperCase(), cx + 12, cy + 11, { width: cardW - 20, characterSpacing: 0.8, lineBreak: false, ellipsis: true });
    doc.font('Helvetica-Bold').fontSize(19).fillColor(C.ink)
      .text(card.value, cx + 12, cy + 24, { width: cardW - 20, lineBreak: false, ellipsis: true, height: 24 });
    if (card.move !== undefined) drawMove(doc, cx + 12, cy + 50, card.move);
    else if (card.delta !== undefined) drawDelta(doc, cx + 12, cy + 50, card.delta, { invert: card.invert });
    else if (card.note) doc.font('Helvetica').fontSize(7.5).fillColor(C.faint).text(card.note, cx + 12, cy + 50, { width: cardW - 20, lineBreak: false, ellipsis: true });
  });
  const rows = Math.ceil(cards.length / perRow);
  return y + rows * cardH + (rows - 1) * gap + 14;
}

function lineChart(doc, y, points, { height = 132 } = {}) {
  const chartX = M + 34, chartW = CW - 38, chartH = height - 28;
  const max = Math.max(...points.map(p => p.sessions), 1);
  const niceMax = Math.ceil(max / 4) * 4 || 4;

  for (let i = 0; i <= 4; i++) {
    const gy = y + chartH - (chartH * i) / 4;
    doc.moveTo(chartX, gy).lineTo(chartX + chartW, gy).lineWidth(0.5).stroke(i === 0 ? '#D5DAE1' : '#EDF0F4');
    doc.font('Helvetica').fontSize(7).fillColor(C.faint)
      .text(fmtCompact((niceMax * i) / 4), M, gy - 3, { width: 30, align: 'right' });
  }

  const px = i => chartX + (points.length === 1 ? chartW / 2 : (chartW * i) / (points.length - 1));
  const py = v => y + chartH - (chartH * v) / niceMax;

  if (points.length > 1) {
    doc.save();
    doc.moveTo(px(0), py(points[0].sessions));
    points.forEach((p, i) => doc.lineTo(px(i), py(p.sessions)));
    doc.lineTo(px(points.length - 1), y + chartH).lineTo(px(0), y + chartH).closePath();
    doc.fillOpacity(0.12).fill(C.green);
    doc.restore();

    doc.moveTo(px(0), py(points[0].sessions));
    points.forEach((p, i) => doc.lineTo(px(i), py(p.sessions)));
    doc.lineWidth(1.6).stroke(C.green);
  }
  if (points.length <= 35) {
    points.forEach((p, i) => doc.circle(px(i), py(p.sessions), 1.6).fill(C.greenDark));
  }

  const labelIdx = points.length > 2
    ? [0, Math.floor((points.length - 1) / 2), points.length - 1]
    : points.map((_, i) => i);
  new Set(labelIdx).forEach(i => {
    const align = i === 0 ? 'left' : i === points.length - 1 ? 'right' : 'center';
    const lx = align === 'left' ? px(i) : align === 'right' ? px(i) - 70 : px(i) - 35;
    doc.font('Helvetica').fontSize(7).fillColor(C.faint)
      .text(formatDate(points[i].date, { day: 'numeric', month: 'short' }), lx, y + chartH + 6, { width: 70, align });
  });
  return y + height;
}

function hBars(doc, x, y, width, rows, { labelW = 118, rowH = 18 } = {}) {
  const max = Math.max(...rows.map(r => r.value), 1);
  const barW = width - labelW - 46;
  rows.forEach((r, i) => {
    const ry = y + i * rowH;
    doc.font('Helvetica').fontSize(8).fillColor(C.ink)
      .text(r.label, x, ry + 3, { width: labelW - 8, lineBreak: false, ellipsis: true });
    doc.roundedRect(x + labelW, ry + 3, barW, 8, 4).fill('#ECEFF3');
    const w = Math.max((barW * r.value) / max, 2);
    doc.roundedRect(x + labelW, ry + 3, w, 8, 4).fill(C.green);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.sub)
      .text(fmtInt(r.value), x + labelW + barW + 6, ry + 3, { width: 40 });
  });
  return y + rows.length * rowH;
}

function table(doc, y, cols, rows, { rowH = 16 } = {}) {
  let x = M;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.sub);
  cols.forEach(col => {
    doc.text(col.label.toUpperCase(), x, y + 3, { width: col.width, align: col.align || 'left', characterSpacing: 0.6 });
    x += col.width;
  });
  doc.moveTo(M, y + 15).lineTo(M + CW, y + 15).lineWidth(1).stroke(C.green);
  let ry = y + 18;
  rows.forEach((row, i) => {
    if (i % 2 === 1) doc.rect(M, ry - 2, CW, rowH).fill(C.zebra);
    let cx = M;
    cols.forEach(col => {
      const raw = row[col.key];
      const val = col.format ? col.format(raw, row) : String(raw ?? '');
      const color = col.color ? (col.color(raw, row) || C.ink) : C.ink;
      doc.font(col.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(color)
        .text(val, cx + (col.align === 'right' ? 0 : 2), ry + 1.5, {
          width: col.width - 6, align: col.align || 'left', lineBreak: false, ellipsis: true, height: rowH,
        });
      cx += col.width;
    });
    ry += rowH;
  });
  return ry + 6;
}

function emptyNote(doc, y, text) {
  doc.roundedRect(M, y, CW, 40, 6).fill(C.card);
  doc.font('Helvetica-Oblique').fontSize(9).fillColor(C.sub)
    .text(text, M + 14, y + 14, { width: CW - 28 });
  return y + 52;
}

function footers(doc, data) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.rect(M, FOOTER_Y, CW, 1.5).fill(C.green);
    doc.font('Helvetica').fontSize(7.5).fillColor(C.faint)
      .text('North Bear Media · northbearmedia.co.uk · info@northbearmedia.co.uk', M, FOOTER_Y + 8, { width: CW / 2, lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, M + CW / 2, FOOTER_Y + 8, { width: CW / 2, align: 'right' });
  }
}

// ─── the report itself ───────────────────────────────────────────

function plainEnglishSummary(data) {
  const lines = [];
  const o = data.ga4?.overview;
  if (o) {
    const delta = pctChange(o.sessions, data.ga4.prevOverview?.sessions);
    let s = `Your website was visited ${fmtInt(o.sessions)} times by ${fmtInt(o.totalUsers)} people`;
    if (delta != null && isFinite(delta)) s += ` — ${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(1)}% on the previous period`;
    lines.push(s + '.');
    // Freshly-tagged site: GA can't see back before its tag was installed,
    // so a month-long report may only contain days of measurement. Say so,
    // or a low number reads as broken data.
    const first = data.ga4.timeseries?.[0]?.date;
    if (first && first > data.period.start) {
      const daysIn = Math.round((Date.parse(first) - Date.parse(data.period.start)) / 86400000);
      if (daysIn >= 5) lines.push(`(Your visitor tracking was installed on ${formatDate(first)}, so traffic numbers only cover from that date — they'll build to a full picture over the coming weeks.)`);
    }
  }
  const sSum = data.search?.summary;
  if (sSum && sSum.impressions > 0) {
    lines.push(`It appeared in Google search results ${fmtInt(sSum.impressions)} times, earning ${fmtInt(sSum.clicks)} visits, with an average ranking position of ${sSum.position.toFixed(1)}.`);
    const page1 = (data.search.topQueries || []).filter(q => q.position && q.position <= 10).length;
    if (page1 > 0) lines.push(`${page1} of your top search terms rank${page1 === 1 ? 's' : ''} on page 1 of Google.`);
  }
  return lines.join(' ');
}

export async function generateReportPdf(data) {
  const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 0, bufferPages: true, info: {
    Title: `Website Performance Report — ${data.site.clientName}`,
    Author: 'North Bear Media',
  }});
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  const done = new Promise(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))));

  let y = fullHeader(doc, data);

  // Plain-English intro
  const summary = plainEnglishSummary(data);
  if (summary) {
    doc.font('Helvetica').fontSize(9.5);
    const th = doc.heightOfString(summary, { width: CW - 52, lineGap: 2 });
    doc.roundedRect(M, y, CW, th + 24, 6).fill(C.greenTint);
    doc.rect(M, y + 6, 3, th + 12).fill(C.green);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.greenDark)
      .text('IN PLAIN ENGLISH', M + 16, y + 9, { characterSpacing: 1 });
    doc.font('Helvetica').fontSize(9.5).fillColor(C.ink)
      .text(summary, M + 16, y + 20, { width: CW - 52, lineGap: 2 });
    y += th + 30;
  }

  // ── At a glance (GA4 KPIs) ──
  y = sectionTitle(doc, y, 'Your website at a glance',
    'Visits are the number of times people opened your website; visitors are the individual people behind them.');
  if (data.ga4?.overview) {
    const o = data.ga4.overview, p = data.ga4.prevOverview || {};
    // GA4 reports new visitors; Fathom doesn't, so show pages-per-visit there.
    const thirdCard = o.newUsers != null
      ? { label: 'New visitors', value: fmtInt(o.newUsers), delta: pctChange(o.newUsers, p.newUsers) }
      : { label: 'Pages per visit', value: (o.sessions ? o.screenPageViews / o.sessions : 0).toFixed(1),
          delta: pctChange(o.sessions ? o.screenPageViews / o.sessions : 0, p.sessions ? p.screenPageViews / p.sessions : null) };
    y = kpiCards(doc, y, [
      { label: 'Visits', value: fmtInt(o.sessions), delta: pctChange(o.sessions, p.sessions) },
      { label: 'Visitors', value: fmtInt(o.totalUsers), delta: pctChange(o.totalUsers, p.totalUsers) },
      { label: 'Page views', value: fmtInt(o.screenPageViews), delta: pctChange(o.screenPageViews, p.screenPageViews) },
      thirdCard,
      { label: 'Engagement rate', value: fmtPct(o.engagementRate * 100), delta: pctChange(o.engagementRate, p.engagementRate) },
      { label: 'Avg. visit length', value: fmtDur(o.averageSessionDuration), delta: pctChange(o.averageSessionDuration, p.averageSessionDuration) },
    ]);
    if (data.ga4.sourceLabel) {
      doc.font('Helvetica-Oblique').fontSize(7).fillColor(C.faint)
        .text(`Source: ${data.ga4.sourceLabel}`, M, y - 6, { width: CW });
      y += 6;
    }
  } else {
    y = emptyNote(doc, y, 'Google Analytics is not connected for this site yet — once connected, visits, visitors and engagement will appear here.');
  }

  // ── Daily traffic chart ──
  if (data.ga4?.timeseries?.length > 1) {
    y = ensureSpace(doc, data, y, 180);
    y = sectionTitle(doc, y, 'Daily visits');
    y = lineChart(doc, y + 2, data.ga4.timeseries) + 10;
  }

  // ── Traffic sources + devices ──
  if (data.ga4?.channels?.length) {
    const channels = data.ga4.channels.slice(0, 6).map(c => ({ label: friendlyChannel(c.channel), value: c.sessions }));
    const devices = (data.ga4.devices || []).slice(0, 3);
    const blockH = Math.max(channels.length, devices.length + 1) * 18 + 36;
    y = ensureSpace(doc, data, y, blockH);
    y = sectionTitle(doc, y, 'Where your visits came from');
    const leftW = devices.length ? CW * 0.62 : CW;
    const yAfterBars = hBars(doc, M, y, leftW, channels, { labelW: 110 });
    if (devices.length) {
      const dx = M + leftW + 18;
      const total = devices.reduce((s, d) => s + d.sessions, 0) || 1;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.sub).text('BY DEVICE', dx, y + 2, { characterSpacing: 0.8 });
      devices.forEach((d, i) => {
        const dy = y + 18 + i * 18;
        doc.font('Helvetica').fontSize(8.5).fillColor(C.ink).text(cap(d.device), dx, dy, { width: 70 });
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.greenDark)
          .text(`${((d.sessions / total) * 100).toFixed(0)}%`, dx + 72, dy, { width: 40 });
      });
    }
    y = yAfterBars + 16;
  }

  // ── Page 2: Search performance ──
  doc.addPage();
  y = slimHeader(doc, data);
  y = sectionTitle(doc, y, 'Google search performance',
    'How your website showed up in Google searches. "Average position" is where you ranked — lower is better, and position 1–10 is page one of Google.');
  if (data.search?.summary) {
    const s = data.search.summary, p = data.search.prevSummary || {};
    // Rank movement in places (previous − current: positive = moved UP),
    // not a percentage — percentages of a ranking mean nothing to owners.
    const posMove = (s.position && p.position) ? p.position - s.position : null;
    y = kpiCards(doc, y, [
      { label: 'Google clicks', value: fmtInt(s.clicks), delta: pctChange(s.clicks, p.clicks) },
      { label: 'Times shown', value: fmtInt(s.impressions), delta: pctChange(s.impressions, p.impressions) },
      { label: 'Click rate', value: fmtPct(s.ctr * 100), delta: pctChange(s.ctr, p.ctr) },
      { label: 'Avg. position', value: s.position ? s.position.toFixed(1) : '—', move: posMove },
    ], { perRow: 4 });

    if (data.search.topQueries?.length) {
      const rows = data.search.topQueries.slice(0, 8);
      y = ensureSpace(doc, data, y, 40 + rows.length * 16);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink).text('Top search terms people found you with', M, y);
      const moveText = (v, r) => {
        if (r.positionChange == null) return r.prevPosition == null ? 'new' : '—';
        if (Math.abs(r.positionChange) < 0.05) return 'no change';
        return `${r.positionChange > 0 ? 'up' : 'down'} ${Math.abs(r.positionChange).toFixed(1)}`;
      };
      const moveColor = (v, r) => {
        if (r.positionChange == null) return r.prevPosition == null ? C.greenDark : C.faint;
        if (Math.abs(r.positionChange) < 0.05) return C.faint;
        return r.positionChange > 0 ? C.greenDark : C.red;
      };
      y = table(doc, y + 16, [
        { label: 'Search term', key: 'query', width: CW - 300, bold: true },
        { label: 'Clicks', key: 'clicks', width: 58, align: 'right', format: fmtInt },
        { label: 'Times shown', key: 'impressions', width: 82, align: 'right', format: fmtInt },
        { label: 'Position', key: 'position', width: 68, align: 'right', format: (v, r) => v.toFixed(1) + (v <= 10 ? ' · pg 1' : '') },
        { label: 'Movement', key: 'positionChange', width: 92, align: 'right', bold: true, format: moveText, color: moveColor },
      ], rows) + 8;
      doc.font('Helvetica-Oblique').fontSize(7).fillColor(C.faint)
        .text('"Movement" is places gained or lost on Google vs the previous period · "pg 1" means it appears on the first page of results.', M, y - 4, { width: CW });
      y += 8;
    }

    // ── Target searches: the terms the client actually wants to win ──
    if (data.search.targets?.length) {
      const rows = data.search.targets;
      y = ensureSpace(doc, data, y, 60 + rows.length * 16);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink).text('Where you rank for your target searches', M, y);
      const tMove = (v, r) => {
        if (r.position == null) return r.prevPosition != null ? 'dropped off' : '—';
        if (r.movement == null) return r.prevPosition == null ? 'new' : '—';
        if (Math.abs(r.movement) < 0.05) return 'no change';
        return `${r.movement > 0 ? 'up' : 'down'} ${Math.abs(r.movement).toFixed(1)}`;
      };
      const tColor = (v, r) => {
        if (r.position == null) return r.prevPosition != null ? C.red : C.faint;
        if (r.movement == null) return r.prevPosition == null ? C.greenDark : C.faint;
        if (Math.abs(r.movement) < 0.05) return C.faint;
        return r.movement > 0 ? C.greenDark : C.red;
      };
      y = table(doc, y + 16, [
        { label: 'Target search', key: 'keyword', width: CW - 300, bold: true },
        { label: 'Position', key: 'position', width: 105, align: 'right',
          format: v => v == null ? 'not appearing yet' : v.toFixed(1) + (v <= 10 ? ' · pg 1' : ''),
          color: v => v == null ? C.faint : C.ink },
        { label: 'Times shown', key: 'impressions', width: 80, align: 'right', format: fmtInt },
        { label: 'Movement', key: 'movement', width: 90, align: 'right', bold: true, format: tMove, color: tColor },
      ], rows) + 4;
      doc.font('Helvetica-Oblique').fontSize(7).fillColor(C.faint)
        .text('These are the searches you\u2019ve told us matter most. "Not appearing yet" means Google didn\u2019t show the site for that search this period \u2014 a clear opportunity.', M, y, { width: CW });
      y += 14;
    }
  } else {
    y = emptyNote(doc, y, 'Google Search Console is not connected for this site yet — once connected, your Google rankings and search clicks will appear here.');
  }

  // ── Most viewed pages ──
  if (data.ga4?.topPages?.length) {
    const rows = data.ga4.topPages.slice(0, 7);
    y = ensureSpace(doc, data, y, 60 + rows.length * 16);
    y = sectionTitle(doc, y, 'Most viewed pages');
    y = table(doc, y, [
      { label: 'Page', key: 'path', width: CW - 160, bold: true, format: (v, r) => (r.title && r.title !== '(not set)' ? `${r.title}  ·  ${v}` : v) },
      { label: 'Views', key: 'views', width: 80, align: 'right', format: fmtInt },
      { label: 'Visits', key: 'sessions', width: 80, align: 'right', format: fmtInt },
    ], rows) + 8;
  }

  // ── Clarity / user experience ──
  y = ensureSpace(doc, data, y, 170);
  y = sectionTitle(doc, y, 'User experience insights',
    'Measured by Microsoft Clarity. "Dead clicks" are clicks that did nothing; "rage clicks" are rapid frustrated clicking — low numbers are good.');
  if (data.clarity) {
    const cl = data.clarity, pc = data.prevClarity;
    const humans = cl.humanSessions != null ? cl.humanSessions : cl.sessions;
    const prevHumans = pc ? (pc.humanSessions != null ? pc.humanSessions : pc.sessions) : null;
    const d = (cur, prev) => pc ? pctChange(cur, prev) : undefined; // no history yet → note instead of '—'
    y = kpiCards(doc, y, [
      pc ? { label: 'Sessions analysed', value: fmtInt(humans), delta: d(humans, prevHumans) }
         : { label: 'Sessions analysed', value: fmtInt(humans), note: 'real people, bots excluded' },
      pc ? { label: 'Avg. scroll depth', value: cl.avgScrollDepth != null ? fmtPct(cl.avgScrollDepth, 0) : '—', delta: d(cl.avgScrollDepth, pc.avgScrollDepth) }
         : { label: 'Avg. scroll depth', value: cl.avgScrollDepth != null ? fmtPct(cl.avgScrollDepth, 0) : '—', note: 'how far people scroll' },
      pc ? { label: 'Dead clicks', value: fmtInt(cl.deadClicks), delta: d(cl.deadClicks, pc.deadClicks), invert: true }
         : { label: 'Dead clicks', value: fmtInt(cl.deadClicks), note: 'lower is better' },
      pc ? { label: 'Rage clicks', value: fmtInt(cl.rageClicks), delta: d(cl.rageClicks, pc.rageClicks), invert: true }
         : { label: 'Rage clicks', value: fmtInt(cl.rageClicks), note: 'lower is better' },
    ], { perRow: 4 });
    doc.font('Helvetica-Oblique').fontSize(7).fillColor(C.faint)
      .text(`Based on ${cl.daysCovered} day${cl.daysCovered === 1 ? '' : 's'} of Clarity measurement in this period`
        + (cl.quickBacks ? ` · ${fmtInt(cl.quickBacks)} quick-backs (visitors who left a page straight away)` : '') + '.', M, y - 6, { width: CW });
    y += 8;
  } else {
    y = emptyNote(doc, y, 'Microsoft Clarity is not connected for this site yet — once connected, you’ll see how people actually use your pages (scrolling, clicks and frustration signals).');
  }

  // ── Site health (Google PageSpeed) ──
  const sh = data.siteHealth;
  if (sh && (sh.performance != null || sh.seo != null)) {
    y = ensureSpace(doc, data, y, 150);
    y = sectionTitle(doc, y, 'Site health check',
      'Scored out of 100 by Google PageSpeed (mobile). 90+ is excellent, 50–89 has room to improve.');
    const grade = v => v == null ? '—' : v >= 90 ? 'excellent' : v >= 50 ? 'room to improve' : 'needs attention';
    y = kpiCards(doc, y, [
      { label: 'Speed score', value: sh.performance != null ? String(sh.performance) : '—', note: grade(sh.performance) },
      { label: 'Google-friendliness (SEO)', value: sh.seo != null ? String(sh.seo) : '—', note: grade(sh.seo) },
      { label: 'Built to best practice', value: sh.bestPractices != null ? String(sh.bestPractices) : '—', note: grade(sh.bestPractices) },
    ], { perRow: 3 });
  }

  // ── Insights & recommendations ──
  if (data.insights?.recommendations?.length) {
    const ins = data.insights;
    y = ensureSpace(doc, data, y, 90);
    y = sectionTitle(doc, y, 'What this means & what to do next',
      ins.source === 'ai' ? 'Analysis by North Bear Media.' : '');
    if (ins.headline) {
      doc.font('Helvetica-Oblique').fontSize(10).fillColor(C.ink)
        .text(ins.headline, M, y, { width: CW, lineGap: 1 });
      y += doc.heightOfString(ins.headline, { width: CW, lineGap: 1 }) + 10;
    }
    for (const rec of ins.recommendations) {
      doc.font('Helvetica').fontSize(9);
      const bh = doc.heightOfString(rec.detail, { width: CW - 16, lineGap: 1 });
      y = ensureSpace(doc, data, y, bh + 24);
      doc.circle(M + 3, y + 4, 2.5).fill(C.green);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.ink).text(rec.title, M + 14, y, { width: CW - 14 });
      doc.font('Helvetica').fontSize(9).fillColor(C.sub).text(rec.detail, M + 14, y + 13, { width: CW - 14, lineGap: 1 });
      y += bh + 22;
    }
    y += 4;
  }

  // ── Closing contact box ──
  y = ensureSpace(doc, data, y, 70);
  doc.roundedRect(M, y, CW, 58, 8).fill(C.charcoal);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C.white)
    .text('Questions about these numbers?', M + 18, y + 13);
  doc.font('Helvetica').fontSize(9).fillColor(C.headerSub)
    .text('We’re happy to walk you through your report any time.', M + 18, y + 30);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.green)
    .text('info@northbearmedia.co.uk', M + CW - 200, y + 22, { width: 182, align: 'right' });

  footers(doc, data);
  doc.end();
  return done;
}

function friendlyChannel(ch) {
  const map = {
    'Organic Search': 'Google search',
    'Direct': 'Direct (typed your address)',
    'Organic Social': 'Social media',
    'Paid Social': 'Social media ads',
    'Paid Search': 'Google ads',
    'Referral': 'Other websites',
    'Email': 'Email',
    'Unassigned': 'Other',
  };
  return map[ch] || ch;
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
