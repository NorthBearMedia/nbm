// The client report: an A4 portrait PDF drawn with PDFKit (pure JS, no
// headless browser), set in the North Bear brand: Archivo condensed
// headlines, Martian Mono labels, ink and paper surfaces, teletext-style
// page tags (P100, P200 ...).
//
// Page 1 (P100) is the whole story on one dark page: the verdict, the
// headline numbers, the long view and what went well. The pages after it
// flow section by section on paper: where we go from here (P200),
// visitors (P300), Google (P400), behaviour and health (P500).
//
// Rules this file keeps, each learned on a real client report:
//  - A change only gets a colour when it is big enough to mean something
//    (story.js decides for the headline numbers; under 12% is "level"
//    for the rest). Up is green, level is quiet grey, down is a calm
//    muted note. Red is kept for genuine faults such as downtime.
//  - When the visitor counter is proven to be under-counting
//    (ga4.unreliable) its figures are hidden, with an honest note.
//  - A source that started part-way through the period says so.
//  - Every source can be missing; each has a plain empty state.
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { formatDate } from './dates.js';
import { pageLabel, periodNoun, trend } from './story.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGO = join(__dirname, '..', 'public', 'assets', 'nbm-logo-light-trimmed.png');
const FONT_DIR = join(__dirname, '..', 'assets', 'fonts');
const FONTS = {
  disp: 'Archivo-Display.ttf',
  black: 'Archivo-DisplayBlack.ttf',
  reg: 'Archivo-Regular.ttf',
  med: 'Archivo-Medium.ttf',
  semi: 'Archivo-SemiBold.ttf',
  mono: 'MartianMono-Regular.ttf',
  monoM: 'MartianMono-Medium.ttf',
};

// ---------- page geometry: a 12-column ruled grid ----------
const A4 = { w: 595.28, h: 841.89 };
const M = 38;
const CW = A4.w - M * 2;
const GUT = 12;
const COL = (CW - GUT * 11) / 12;
const colX = i => M + i * (COL + GUT);
const span = n => COL * n + GUT * (n - 1);
const BAND_H = 46;          // ink band across the top of the paper pages
const TOP = BAND_H + 26;    // where content starts on a paper page
const FOOT_Y = A4.h - 38;
const LIMIT = FOOT_Y - 16;  // content never runs below this

const C = {
  ink: '#0F1012',
  char: '#17191C',
  paper: '#F1EEE7',
  paperDeep: '#E6E2D9',
  white: '#FFFFFF',
  green: '#4DB88C',
  greenDk: '#3FA77C',
  greenInk: '#1E6B4A',
  cyan: '#58C3DA',
  yellow: '#F2C230',
  red: '#E4573F',
  text: '#16181B',
  muted: '#575B61',
  mutedD: '#A6ABB1',
  softD: '#D5D8DB',
  ruleD: '#333437',
  ruleP: '#CAC7C2',
};
const DARK = { fg: C.white, sub: C.softD, faint: C.mutedD, quiet: '#8B9096', rule: C.ruleD, track: '#26292D', up: C.green, accent: C.green };
const PAPER = { fg: C.text, sub: C.muted, faint: C.muted, quiet: '#6F7377', rule: C.ruleP, track: '#DDD9D0', up: C.greenInk, accent: C.greenInk };

// Archivo: the top of a capital sits 0.192 em below the top of the line
// box, and capitals are 0.686 em tall. Martian Mono: 0.2 and 0.8.
const CAP_OFF = 0.192, CAP_H = 0.686, MONO_OFF = 0.2, MONO_H = 0.8;

// ---------- formatting ----------
const nf = new Intl.NumberFormat('en-GB');
const nfc = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });
const fmtInt = n => nf.format(Math.round(n || 0));
const fmtCompact = n => nfc.format(n || 0);
const fmtBig = n => (Math.abs(n || 0) >= 100000 ? fmtCompact(n) : fmtInt(n));
const fmtPct = (p, dp = 1) => `${(p || 0).toFixed(dp)}%`;
function fmtDur(seconds) {
  const s = Math.round(seconds || 0);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

// The fonts carry Latin text and common punctuation only. Anything else
// (and any long dash, which the house style does not use) is tidied
// before it reaches the page, so no empty boxes are ever printed.
function clean(v) {
  return String(v ?? '')
    .replace(/\s*[\u2014\u2013]\s*/g, ', ')
    .replace(/[\u2010\u2011]/g, '-')
    .replace(/[^\u0020-\u007E\u00A0-\u00FF\u2018\u2019\u201C\u201D\u2022\u2026\u20AC\u2122]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function periodText(data) {
  const { start, end } = data.period;
  if (periodNoun(start, end).noun === 'month') return formatDate(start, { month: 'long', year: 'numeric' });
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${formatDate(start, sameYear ? { day: 'numeric', month: 'short' } : undefined)} to ${formatDate(end)}`;
}

// ---------- change notes ----------
// { text, kind } where kind is up (green), level (quiet grey) or down
// (calm muted text). Never an arrow, never red.
function headlineNote(data, key, cur, prev) {
  const t = data.story?.trends?.[key] || trend(cur, prev);
  if (!t || t.dir === 'none') return null;
  if (t.dir === 'level') return { text: 'Level', kind: 'level' };
  if (t.pct == null) return { text: t.dir === 'up' ? 'Up from zero' : 'Down', kind: t.dir };
  // Under 50 the two numbers say it better than "up 228%".
  if (prev != null && prev < 50) return { text: `${t.dir === 'up' ? 'Up' : 'Down'} from ${fmtInt(prev)}`, kind: t.dir };
  return { text: `${t.dir === 'up' ? 'Up' : 'Down'} ${Math.abs(t.pct).toFixed(0)}%`, kind: t.dir };
}
// `count` marks a whole-number tally (clicks, visits): small tallies swing
// wildly in percentage terms, so they must also move by at least 8.
function change(cur, prev, { lowerIsBetter = false, count = false } = {}) {
  if (cur == null || prev == null || !isFinite(cur) || !isFinite(prev) || prev === 0) return null;
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 12 || (count && Math.abs(cur - prev) < 8)) return { text: 'Level', kind: 'level' };
  const rose = pct > 0;
  return { text: `${rose ? 'Up' : 'Down'} ${Math.abs(pct).toFixed(0)}%`, kind: (lowerIsBetter ? !rose : rose) ? 'up' : 'down' };
}
// Ranking movement in places (positive = moved up the page).
function moveNote(places) {
  if (places == null || !isFinite(places)) return null;
  if (Math.abs(places) < 0.5) return { text: 'Level', kind: 'level' };
  const n = Math.abs(places) >= 10 ? Math.abs(places).toFixed(0) : Math.abs(places).toFixed(1).replace(/\.0$/, '');
  return { text: `${places > 0 ? 'Up' : 'Down'} ${n} place${n === '1' ? '' : 's'}`, kind: places > 0 ? 'up' : 'down' };
}
const noteColor = (th, kind) => (kind === 'up' ? th.up : kind === 'level' ? th.quiet : th.faint);
// Clicks a page earned against the period before. A page with none
// before is new; under 50 the earlier number says more than a percentage.
function clicksNote(now, before) {
  if (before == null) return null;
  if (!before) return now > 0 ? { text: 'New', kind: 'up' } : null;
  const c = change(now, before, { count: true });
  if (!c || c.kind === 'level' || before >= 50) return c;
  return { text: `${now > before ? 'Up' : 'Down'} from ${fmtInt(before)}`, kind: c.kind };
}
// One calm sentence setting the month against the same month a year ago.
function yoyText(yoy) {
  if (!yoy) return '';
  const part = (name, side) => {
    if (!side) return null;
    if (side.dir === 'level') return `${name} level`;
    if (side.dir !== 'up' && side.dir !== 'down') return null;
    if (side.pct == null || side.then < 50) return `${name} ${side.dir} to ${fmtInt(side.now)} from ${fmtInt(side.then)}`;
    return `${name} ${side.dir} ${Math.abs(side.pct).toFixed(0)}%`;
  };
  const parts = [part('visits', yoy.visits), part('clicks from Google', yoy.clicks)].filter(Boolean);
  return parts.length ? `Against ${yoy.label}: ${parts.join(', ')}.` : '';
}
function shortDate(iso) {
  return /^\d{4}-\d{2}-\d{2}/.test(String(iso || '')) ? formatDate(String(iso).slice(0, 10), { day: 'numeric', month: 'short' }) : '';
}

// ---------- text primitives ----------
function fit(doc, text, maxW, spacing = 0) {
  if (doc.widthOfString(text, { characterSpacing: spacing }) <= maxW) return text;
  let t = text;
  while (t.length > 1 && doc.widthOfString(t + '\u2026', { characterSpacing: spacing }) > maxW) t = t.slice(0, -1);
  return t.replace(/[\s,.;:]+$/, '') + '\u2026';
}

// One line of text, cut with an ellipsis if a width is given. Returns
// the drawn width.
function line(doc, text, x, y, o = {}) {
  const { font = 'reg', size = 9, color = C.text, spacing = 0, align = 'left', width, upper = false } = o;
  let t = clean(text);
  if (upper) t = t.toUpperCase();
  doc.font(font).fontSize(size);
  if (width != null) t = fit(doc, t, width, spacing);
  const w = doc.widthOfString(t, { characterSpacing: spacing });
  let dx = x;
  if (width != null && align === 'right') dx = x + width - w;
  else if (width != null && align === 'center') dx = x + (width - w) / 2;
  doc.fillColor(color).text(t, dx, y, { lineBreak: false, characterSpacing: spacing });
  return w;
}

// Small uppercase letter-spaced label in Martian Mono.
function label(doc, text, x, y, o = {}) {
  return line(doc, text, x, y, { font: 'mono', size: 6.5, spacing: 0.9, upper: true, ...o });
}

// Headline or numeral in the condensed display face, placed by the top
// of its capitals so it lines up with blocks and rules.
function display(doc, text, x, capTop, size, color, o = {}) {
  return line(doc, text, x, capTop - size * CAP_OFF, { font: 'disp', size, color, upper: true, ...o });
}

function paraOpts(o) {
  return { width: o.width, lineGap: o.lineGap ?? 2, characterSpacing: o.spacing || 0 };
}
function paraH(doc, text, o = {}) {
  const t = clean(text);
  doc.font(o.font || 'reg').fontSize(o.size || 9.5);
  let h = doc.heightOfString(t, paraOpts(o));
  if (o.maxLines) h = Math.min(h, (doc.currentLineHeight(true) + (o.lineGap ?? 2)) * o.maxLines);
  return h;
}
// Wrapped paragraph. Returns its height.
function para(doc, text, x, y, o = {}) {
  const t = clean(text);
  doc.font(o.font || 'reg').fontSize(o.size || 9.5);
  const opts = paraOpts(o);
  let h = doc.heightOfString(t, opts);
  if (o.maxLines) {
    const capH = (doc.currentLineHeight(true) + (o.lineGap ?? 2)) * o.maxLines;
    if (h > capH + 0.5) { opts.height = capH; opts.ellipsis = true; h = capH; }
  }
  doc.fillColor(o.color || C.text).text(t, x, y, opts);
  return h;
}

function hRule(doc, x, y, w, color, weight = 0.6) {
  doc.moveTo(x, y).lineTo(x + w, y).lineWidth(weight).stroke(color);
}
function vRule(doc, x, y1, y2, color, weight = 0.6) {
  doc.moveTo(x, y1).lineTo(x, y2).lineWidth(weight).stroke(color);
}

// The row of solid colour blocks, a nod to a teletext page header.
function blocks(doc, right, y, size = 7, colors = [C.green, C.cyan, C.yellow, C.white]) {
  colors.forEach((c, i) => doc.rect(right - (colors.length - i) * (size + 3) + 3, y, size, size).fill(c));
}

// ---------- page furniture ----------
function newPage(ctx, fromY) {
  const { doc, data } = ctx;
  // Space left unused above a page break, so the layout passes can be
  // compared (see generateReportPdf).
  if (fromY != null) ctx.waste += Math.max(0, LIMIT - fromY);
  doc.addPage();
  doc.rect(0, 0, A4.w, A4.h).fill(C.paper);
  doc.rect(0, 0, A4.w, BAND_H).fill(C.ink);
  doc.image(LOGO, M, 9, { height: 28 });
  blocks(doc, A4.w - M, 20, 6, [C.green, C.cyan, C.yellow]);
  label(doc, `${data.site.clientName} // ${periodText(data)}`, M + 80, 20, { color: C.mutedD, width: CW - 80 - 40, align: 'right' });
  ctx.tags.push(ctx.tag);
  return TOP;
}

// Start a new page unless `need` points still fit below y.
function room(ctx, y, need) {
  return y + need <= LIMIT ? y : newPage(ctx, y);
}

// Section opener: heavy rule, teletext page number block, condensed
// headline, optional standfirst. `need` is the height of the first block
// of the section, so a headline is never left alone at the foot of a page.
function opener(ctx, y, code, title, standfirst, need = 150) {
  const { doc } = ctx;
  const sfH = standfirst ? paraH(doc, standfirst, { size: 9.5, width: span(9), lineGap: 2.5 }) + 8 : 0;
  const from = y;
  if (y > TOP + 1) y += ctx.d.openerGap;
  ctx.tag = code;
  if (y + 44 + sfH + need > LIMIT) y = newPage(ctx, from);
  if (y <= TOP + 1) ctx.tags[ctx.tags.length - 1] = code;
  doc.rect(M, y, CW, 2).fill(C.text);
  doc.rect(M, y + 12, 38, 18).fill(C.green);
  label(doc, code, M, y + 12 + (18 - 7 * MONO_H) / 2 - 7 * MONO_OFF, { font: 'monoM', size: 7, color: C.ink, width: 38, align: 'center', spacing: 0.6 });
  display(doc, title, M + 48, y + 12 + (18 - 26 * CAP_H) / 2, 26, C.text, { width: CW - 48 });
  y += 42;
  if (standfirst) {
    para(doc, standfirst, M, y, { size: 9.5, width: span(9), lineGap: 2.5, color: C.muted });
    y += sfH;
  }
  return y + 4;
}

// Small mono sub-heading with a hairline under it.
function subhead(doc, th, x, y, w, text, right) {
  label(doc, text, x, y, { color: th.fg, font: 'monoM', width: right ? w * 0.6 : w });
  if (right) label(doc, right, x + w * 0.4, y, { color: th.faint, width: w * 0.6, align: 'right' });
  hRule(doc, x, y + 13, w, th.rule);
  return y + 22;
}

// A ruled row of figures: label, big numeral, change note. Numerals are
// shrunk together until the widest fits its cell, and a label too long
// for one line takes two.
function statRow(doc, th, x, y, w, cells, { valueSize = 26 } = {}) {
  const n = cells.length;
  const cw = w / n;
  const inner = i => cw - (i ? 12 : 0) - 10;
  let size = valueSize;
  const widthAt = (c, sz) => {
    doc.font('disp').fontSize(sz);
    let vw = doc.widthOfString(clean(c.value).toUpperCase());
    if (c.unit) vw += 4 + doc.fontSize(sz * 0.5).widthOfString(clean(c.unit).toUpperCase());
    return vw;
  };
  while (size > valueSize * 0.55 && cells.some((c, i) => widthAt(c, size) > inner(i))) size -= 1;
  doc.font('mono').fontSize(6.5);
  const twoLine = cells.some((c, i) => doc.widthOfString(clean(c.label).toUpperCase(), { characterSpacing: 0.9 }) > inner(i));
  const labelH = twoLine ? 20 : 9;
  const vTop = y + 10 + labelH + 6;
  const H = vTop - y + size * CAP_H + 24;
  hRule(doc, x, y, w, th.rule);
  cells.forEach((c, i) => {
    const cx = x + i * cw + (i ? 12 : 0);
    const iw = inner(i);
    if (i) vRule(doc, x + i * cw, y + 8, y + H - 8, th.rule);
    if (twoLine) para(doc, clean(c.label).toUpperCase(), cx, y + 10, { font: 'mono', size: 6.5, spacing: 0.9, width: iw, lineGap: 2, color: th.faint, maxLines: 2 });
    else label(doc, c.label, cx, y + 10, { color: th.faint, width: iw });
    const vw = display(doc, c.value, cx, vTop, size, c.color || th.fg, { width: iw });
    if (c.unit) display(doc, c.unit, cx + vw + 4, vTop + size * CAP_H - size * 0.5 * CAP_H, size * 0.5, th.faint, { width: Math.max(10, iw - vw - 4) });
    const ny = vTop + size * CAP_H + 7;
    if (c.note) line(doc, c.note.text, cx, ny, { font: 'med', size: 8, color: noteColor(th, c.note.kind), width: iw });
    else if (c.hint) line(doc, c.hint, cx, ny, { font: 'reg', size: 8, color: th.quiet, width: iw });
  });
  hRule(doc, x, y + H, w, th.rule);
  return y + H;
}

// A plain note for a source that is missing or has nothing to show yet.
function noteBox(doc, y, heading, text) {
  const h = paraH(doc, text, { size: 9.5, width: CW - 36, lineGap: 2.5 });
  doc.rect(M, y, CW, h + 40).fill(C.paperDeep);
  doc.rect(M, y, 3, h + 40).fill(C.yellow);
  label(doc, heading, M + 18, y + 13, { color: C.text, font: 'monoM' });
  para(doc, text, M + 18, y + 28, { size: 9.5, width: CW - 36, lineGap: 2.5, color: C.muted });
  return y + h + 40;
}

// ---------- charts ----------
function niceMax(v) {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 8 ? 8 : 10) * p;
}

// One figure per calendar month as bars. Months inside the reporting
// period are solid, earlier months are dimmed, a part month is hatched.
// The month visitor tracking began is a part month too (the tag went
// live part-way through), so it is hatched the other way: drawn solid it
// reads as a leap in traffic that never happened.
const trackingBegan = (m, field) => field === 'visits' && Boolean(m.firstTracked) && !m.partial && m.visits != null;
function hatch(doc, bx, by, bw, bh, color, backward = false) {
  doc.save();
  doc.rect(bx, by, bw, bh).clip();
  doc.lineWidth(0.8).strokeColor(color);
  for (let k = -bh; k < bw + bh; k += 4) {
    if (backward) doc.moveTo(bx + k, by).lineTo(bx + k + bh, by + bh).stroke();
    else doc.moveTo(bx + k, by + bh).lineTo(bx + k + bh, by).stroke();
  }
  doc.restore();
  doc.rect(bx + 0.4, by + 0.4, bw - 0.8, Math.max(0.5, bh - 0.4)).lineWidth(0.8).stroke(color);
}
function monthBars(doc, th, x, y, w, h, months, field, color, title, data) {
  label(doc, title, x, y, { color: th.fg, font: 'monoM', width: w });
  // A source that began part-way through the year has nothing before its
  // first month, so the chart starts there instead of showing a gap.
  const first = months.findIndex(m => m[field] != null);
  const rows = months.slice(Math.max(0, first));
  const top = y + 30, base = y + h - 16;
  const areaH = base - top;
  const max = Math.max(...rows.map(m => m[field] || 0), 1);
  const slot = w / rows.length;
  const bw = Math.min(30, slot * 0.6);
  const inPeriod = m => m.month >= data.period.start.slice(0, 7) && m.month <= data.period.end.slice(0, 7);
  hRule(doc, x, base, w, th.rule);
  const small = rows.length > 8;
  rows.forEach((m, i) => {
    const cx = x + slot * i + slot / 2;
    const v = m[field];
    const mLabel = `${m.label}${m.partial ? '*' : ''}`;
    label(doc, mLabel, cx - slot / 2, base + 6, { color: inPeriod(m) ? th.fg : th.faint, width: slot, align: 'center', size: small ? 5.5 : 6.5, spacing: small ? 0.3 : 0.9 });
    if (v == null) return;
    const bh = Math.max(1.5, (v / max) * areaH);
    const bx = cx - bw / 2, by = base - bh;
    if (m.partial) {
      hatch(doc, bx, by, bw, bh, color);
    } else if (trackingBegan(m, field)) {
      doc.save().strokeOpacity(inPeriod(m) ? 1 : 0.6);
      hatch(doc, bx, by, bw, bh, color, true);
      doc.restore();
    } else {
      doc.save().fillOpacity(inPeriod(m) ? 1 : 0.42).rect(bx, by, bw, bh).fill(color).restore();
    }
    // With many months there is no room for a figure on every bar, so
    // only the first, the highest and the months being reported get one.
    if (!small || inPeriod(m) || i === 0 || v === max) {
      const lw = small ? slot * 2.4 : slot;
      label(doc, fmtBig(v), cx - lw / 2, by - 11, { color: inPeriod(m) ? th.fg : th.faint, width: lw, align: 'center', size: small ? 6 : 6.5, spacing: small ? 0.2 : 0.4 });
    }
  });
}

// Visits day by day as a line over a soft fill, with the busiest day
// called out.
function dayChart(doc, th, x, y, w, h, points, color, { callout = true } = {}) {
  const left = 26;
  const cx0 = x + left, cw = w - left;
  const top = y + 12, base = y + h - 16;
  const ch = base - top;
  const peak = points.reduce((a, p) => (p.sessions > a.sessions ? p : a), points[0]);
  const max = niceMax(Math.max(peak.sessions, 1));
  [0, 0.5, 1].forEach(f => {
    const gy = base - ch * f;
    hRule(doc, cx0, gy, cw, th.rule, f === 0 ? 0.8 : 0.4);
    label(doc, fmtCompact(max * f), x, gy - 3, { color: th.faint, width: left - 6, align: 'right', size: 6, spacing: 0 });
  });
  const px = i => cx0 + (points.length === 1 ? cw / 2 : (cw * i) / (points.length - 1));
  const py = v => base - (ch * v) / max;
  if (points.length > 1) {
    doc.save();
    doc.moveTo(px(0), py(points[0].sessions));
    points.forEach((p, i) => doc.lineTo(px(i), py(p.sessions)));
    doc.lineTo(px(points.length - 1), base).lineTo(px(0), base).closePath();
    doc.fillOpacity(0.16).fill(color);
    doc.restore();
    doc.moveTo(px(0), py(points[0].sessions));
    points.forEach((p, i) => doc.lineTo(px(i), py(p.sessions)));
    doc.lineWidth(1.5).lineJoin('round').stroke(color);
  }
  const idx = points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.map((_, i) => i);
  [...new Set(idx)].forEach(i => {
    const align = i === 0 ? 'left' : i === points.length - 1 ? 'right' : 'center';
    const lx = align === 'left' ? px(i) : align === 'right' ? px(i) - 70 : px(i) - 35;
    label(doc, formatDate(points[i].date, { day: 'numeric', month: 'short' }), lx, base + 6, { color: th.faint, width: 70, align, size: 6 });
  });
  if (callout && peak.sessions > 0 && points.length > 2) {
    const i = points.indexOf(peak);
    doc.circle(px(i), py(peak.sessions), 2.6).fill(th.fg);
    const text = `Busiest day // ${formatDate(peak.date, { day: 'numeric', month: 'short' })} // ${fmtInt(peak.sessions)}`;
    doc.font('mono').fontSize(6);
    const tw = doc.widthOfString(text.toUpperCase(), { characterSpacing: 0.6 });
    const right = px(i) + 8 + tw <= cx0 + cw;
    label(doc, text, right ? px(i) + 8 : px(i) - 8 - tw, Math.max(y, py(peak.sessions) - 9), { color: th.fg, size: 6, spacing: 0.6 });
  }
}

// Horizontal bars: name, bar, figure, share.
function hBars(doc, th, x, y, w, rows, { labelW = 120, rowH = 19, color = C.greenInk, share = true } = {}) {
  const max = Math.max(...rows.map(r => r.value), 1);
  const total = rows.reduce((a, r) => a + r.value, 0) || 1;
  const figW = share ? 74 : 42;
  const barW = w - labelW - figW;
  rows.forEach((r, i) => {
    const ry = y + i * rowH;
    line(doc, r.label, x, ry + 2, { font: 'med', size: 9, color: th.fg, width: labelW - 10 });
    doc.rect(x + labelW, ry + 4, barW, 6).fill(th.track);
    doc.rect(x + labelW, ry + 4, Math.max((barW * r.value) / max, 2), 6).fill(color);
    line(doc, fmtInt(r.value), x + labelW + barW, ry + 2, { font: 'semi', size: 9, color: th.fg, width: 42, align: 'right' });
    if (share) label(doc, `${Math.round((r.value / total) * 100)}%`, x + labelW + barW + 42, ry + 3.5, { color: th.faint, width: figW - 42, align: 'right', spacing: 0.3 });
  });
  return y + rows.length * rowH;
}

// A simple ruled table. Columns give either a key and format, or a draw
// function for anything richer than text. A table that reaches the foot
// of the page carries on overleaf under a repeated heading row.
function table(ctx, th, x, y, cols, rows, { rowH = 20 } = {}) {
  const { doc } = ctx;
  const w = cols.reduce((a, c) => a + c.width, 0);
  const head = top => {
    let cx = x;
    cols.forEach(col => {
      const right = col.align === 'right';
      label(doc, col.label, cx, top, { color: th.faint, width: col.width - (right ? col.headPad || 0 : 8), align: col.align || 'left' });
      cx += col.width;
    });
    hRule(doc, x, top + 13, w, th.fg, 0.9);
    return top + 13;
  };
  let ry = head(y);
  // These are "top N" lists, so when only a row or two would spill onto
  // the next page the list is cut to what fits rather than leaving a
  // stray row under a repeated heading.
  const fits = Math.floor((LIMIT - ry) / rowH);
  if (rows.length - fits > 0 && rows.length - fits <= 2 && fits >= 3) rows = rows.slice(0, fits);
  rows.forEach(row => {
    if (ry + rowH > LIMIT) ry = head(newPage(ctx, ry));
    let px = x;
    cols.forEach(col => {
      if (col.draw) col.draw(row, px, ry, col.width);
      else {
        const raw = row[col.key];
        const val = col.format ? col.format(raw, row) : String(raw ?? '');
        line(doc, val, px, ry + (rowH - 9) / 2, {
          font: col.font || 'reg', size: col.size || 9, width: col.width - (col.align === 'right' ? 0 : 8), align: col.align || 'left',
          color: col.color ? col.color(raw, row) : th.fg,
        });
      }
      px += col.width;
    });
    ry += rowH;
    hRule(doc, x, ry, w, th.rule, 0.5);
  });
  return ry;
}

function arcPath(doc, cx, cy, r, fromDeg, toDeg) {
  const steps = Math.max(2, Math.ceil(Math.abs(toDeg - fromDeg) / 4));
  for (let i = 0; i <= steps; i++) {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / steps) * Math.PI) / 180;
    const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
    if (i) doc.lineTo(px, py); else doc.moveTo(px, py);
  }
}

// A score out of 100 as a ring.
function ring(doc, th, cx, cy, r, score) {
  doc.circle(cx, cy, r).lineWidth(6).stroke(th.track);
  if (score != null) {
    const color = score >= 90 ? C.green : C.yellow;
    arcPath(doc, cx, cy, r, -90, -90 + 360 * Math.max(0.02, Math.min(1, score / 100)));
    doc.lineWidth(6).lineCap('butt').stroke(color);
  }
  const t = score != null ? String(score) : 'n/a';
  display(doc, t, cx - r, cy - (22 * CAP_H) / 2, 22, th.fg, { width: r * 2, align: 'center' });
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
// Shop and booking systems often end a page address in a long code. The
// folder before it is the readable part ("/c/Meat_Boxes/3a9e..." reads
// as "Meat Boxes").
function pageName(path, title) {
  if (title && title !== '(not set)') return title;
  const parts = String(path || '/').split('?')[0].split('/').filter(Boolean);
  while (parts.length > 1 && /^[0-9a-f-]{16,}$/i.test(parts[parts.length - 1])) parts.pop();
  return parts.length ? pageLabel('/' + parts.join('/'), '') : 'Homepage';
}

function friendlyDevice(d) {
  const s = String(d || '').toLowerCase();
  if (s === 'mobile' || s === 'phone') return 'Phone';
  if (s === 'desktop') return 'Computer';
  if (s === 'tablet') return 'Tablet';
  return cap(s) || 'Other';
}

// The day visitor tracking began, when the source genuinely started
// inside the period (worked out once, in report-data.js): a month-long
// report may then hold only days of measurement, and a low number would
// read as a broken site unless the report says so.
function trackingStart(data) {
  return data.ga4?.trackingFrom || null;
}

// ================================================================
// P100: the summary page
// ================================================================
function summaryPage(ctx) {
  const { doc, data } = ctx;
  const th = DARK;
  const story = data.story, ins = data.insights;
  const period = periodNoun(data.period.start, data.period.end);
  const trusted = data.ga4?.overview && !data.ga4.unreliable;
  const o = trusted ? data.ga4.overview : null;
  const po = trusted ? data.ga4.prevOverview || {} : {};
  const s = data.search?.summary && !data.search.empty ? data.search.summary : null;
  const ps = s ? data.search.prevSummary || {} : {};

  doc.rect(0, 0, A4.w, A4.h).fill(C.ink);
  ctx.tags.push('P100');

  // Masthead
  label(doc, 'P100', M, 26, { color: C.green, font: 'monoM' });
  label(doc, 'North Bear Pulse // Website report', M + 34, 26, { color: th.faint });
  label(doc, `Prepared ${formatDate(new Date().toISOString().slice(0, 10))}`, M + CW / 2, 26, { color: th.faint, width: CW / 2, align: 'right' });
  hRule(doc, M, 41, CW, th.rule);
  doc.image(LOGO, M, 54, { height: 44 });
  blocks(doc, A4.w - M, 58, 9);
  label(doc, periodText(data), M + 120, 78, { color: th.fg, font: 'monoM', size: 8, width: CW - 120, align: 'right', spacing: 1 });
  label(doc, data.site.domain || '', M + 120, 92, { color: th.faint, width: CW - 120, align: 'right' });
  hRule(doc, M, 112, CW, th.rule);

  // Client name, then the verdict as the page's headline
  let y = 128;
  label(doc, 'Website report for', M, y, { color: th.faint });
  y += 15;
  const name = clean(data.site.clientName).toUpperCase();
  doc.font('disp');
  let nameSize = 30;
  while (nameSize > 22 && doc.fontSize(nameSize).widthOfString(name) > CW) nameSize -= 1;
  if (doc.fontSize(nameSize).widthOfString(name) <= CW) {
    display(doc, name, M, y, nameSize, th.fg, { width: CW });
    y += nameSize * CAP_H + 22;
  } else {
    // A very long name takes two lines rather than being cut short.
    const h = para(doc, name, M, y - 22 * CAP_OFF, { font: 'disp', size: 22, width: CW, lineGap: 0.5, color: th.fg, maxLines: 2 });
    y += h - 22 * CAP_OFF + 12;
  }

  const verdict = clean(story?.verdict?.label || 'Your website report').toUpperCase();
  doc.font('black');
  let vSize = 100;
  while (vSize > 40 && doc.fontSize(vSize).widthOfString(verdict) > CW) vSize -= 1;
  line(doc, verdict, M, y - vSize * CAP_OFF, { font: 'black', size: vSize, color: C.green, width: CW });
  y += vSize * CAP_H + 18;

  const standfirst = ins?.headline || story?.verdict?.line || 'The figures for this period are set out on the pages that follow.';
  if (standfirst) {
    y += para(doc, standfirst, M, y, { font: 'reg', size: 12.5, width: span(11), lineGap: 3.5, color: th.sub, maxLines: 4 }) + 4;
  }
  const started = trackingStart(data);
  const caveat = data.ga4?.unreliable
    ? 'The visitor counter is being reconnected on this site, so visit figures are left out of this report. The Google and behaviour figures are complete.'
    : started && trusted ? `Visitor tracking began on ${formatDate(started)}, so the visit figures cover from that date and will build to a full picture.` : '';
  if (caveat) {
    doc.rect(M, y + 5, 5, 5).fill(C.yellow);
    y += para(doc, caveat, M + 12, y + 2, { size: 8.5, width: span(10) - 12, lineGap: 2, color: th.faint }) + 6;
  }
  y += 12;

  // Headline numbers
  // Every key search counts in "5 of 8", including ones not showing yet.
  const allTargets = data.search?.targets || [];
  const cells = [];
  if (o) cells.push({ label: 'Visits', value: fmtBig(o.sessions), note: headlineNote(data, 'visits', o.sessions, po.sessions) });
  if (s) {
    cells.push({ label: 'Clicks from Google', value: fmtBig(s.clicks), note: headlineNote(data, 'clicks', s.clicks, ps.clicks) });
    cells.push({ label: 'Times shown on Google', value: fmtBig(s.impressions), note: headlineNote(data, 'shown', s.impressions, ps.impressions) });
  }
  if (allTargets.length) {
    const p1 = allTargets.filter(t => t.position != null && t.position <= 10.5).length;
    cells.push({ label: 'Key searches on page one', value: String(p1), unit: `of ${allTargets.length}`, hint: 'Positions 1 to 10' });
  }
  if (cells.length < 4 && s && s.position) {
    cells.push({ label: 'Average Google position', value: s.position.toFixed(1), note: positionNote(data, s, ps), hint: 'Lower is better' });
  }
  if (cells.length < 4 && data.uptime) {
    cells.push({ label: 'Website uptime', value: `${data.uptime.uptimePct}%`, hint: data.uptime.outages ? `${data.uptime.outages} outage${data.uptime.outages === 1 ? '' : 's'}` : 'No downtime' });
  }
  if (cells.length < 4 && o) cells.push({ label: 'Pages viewed', value: fmtBig(o.screenPageViews), note: change(o.screenPageViews, po.screenPageViews) });
  if (cells.length) {
    label(doc, 'The headline numbers', M, y, { color: th.fg, font: 'monoM' });
    label(doc, `Change is against ${period.prev}`, M + CW / 2, y, { color: th.faint, width: CW / 2, align: 'right' });
    y += 14;
    y = statRow(doc, th, M, y, CW, cells.slice(0, 4), { valueSize: 40 });
    const lastYear = yoyText(story?.yoy);
    if (lastYear) {
      doc.rect(M, y + 12.5, 5, 5).fill(C.cyan);
      line(doc, lastYear, M + 12, y + 10, { font: 'reg', size: 9.5, color: th.sub, width: CW - 12 });
      y += 20;
    }
    y += 22;
  }

  // What went well: measured first so the chart above it can take the
  // space that is left.
  const wins = ((ins?.wins?.length ? ins.wins : story?.wins) || []).slice(0, 4);
  const winW = span(6) - 16;
  const winH = w => paraH(doc, w.title, { font: 'semi', size: 10.5, width: winW, lineGap: 1.5 })
    + paraH(doc, w.detail, { size: 9, width: winW, lineGap: 2, maxLines: 3 }) + 4;
  const rowHs = [];
  for (let i = 0; i < wins.length; i += 2) rowHs.push(Math.max(winH(wins[i]), wins[i + 1] ? winH(wins[i + 1]) : 0) + 14);
  const winsH = wins.length ? 22 + rowHs.reduce((a, b) => a + b, 0) : 0;

  // The long view (or, without monthly history, the daily trend). It
  // takes the space the rest of the page leaves, up to a sensible height,
  // and any space still spare is shared between the gaps so the page
  // fills to the foot.
  const months = data.history?.months || [];
  // No visit history beside an under-counting visitor tag, whatever the
  // data carries: those are the figures this report is leaving out.
  const hasV = !data.ga4?.unreliable && months.some(m => m.visits != null);
  const hasC = months.some(m => m.clicks != null), hasI = months.some(m => m.impressions != null);
  const space = LIMIT - y - winsH - (wins.length ? 20 : 0);
  const showMonths = months.length >= 2 && (hasV || hasC) && space >= 110;
  const showDays = !showMonths && trusted && (data.ga4.timeseries || []).length > 2 && space >= 100;
  // With neither a monthly nor a daily series (search-only sites), the
  // slot shows the searches that brought the most people in.
  const topQ = (data.search?.topQueries || []).filter(q => q.clicks > 0);
  const showSearches = !showMonths && !showDays && s && topQ.length >= 2 && space >= 90;
  const qRows = showSearches ? topQ.slice(0, Math.max(2, Math.min(8, Math.floor((space - 34) / 19)))) : [];
  const chartH = showMonths ? Math.max(110, Math.min(190, space))
    : showDays ? Math.max(100, Math.min(170, space))
    : showSearches ? 30 + qRows.length * 19 : 0;
  const spare = Math.max(0, Math.min(chartH ? 64 : 0, space - chartH));
  if (showMonths) {
    y += spare * 0.4;
    label(doc, 'The long view', M, y, { color: th.fg, font: 'monoM' });
    // Legend, right to left: the swatch for the month tracking began
    // (only when the visits chart shows one), then the part-month star.
    let legendR = M + CW;
    if (hasV && months.some(m => trackingBegan(m, 'visits'))) {
      const txt = 'Tracking began part way through';
      doc.font('mono').fontSize(6.5);
      const tw = doc.widthOfString(txt.toUpperCase(), { characterSpacing: 0.9 });
      label(doc, txt, legendR - tw, y, { color: th.faint });
      hatch(doc, legendR - tw - 15, y + 0.5, 10, 7, C.green, true);
      label(doc, '//', legendR - tw - 31, y, { color: th.faint });
      legendR -= tw + 38;
    }
    label(doc, `Month by month${months.some(m => m.partial) ? ' // * part month so far' : ''}`, M + 90, y, { color: th.faint, width: legendR - M - 90, align: 'right' });
    hRule(doc, M, y + 13, CW, th.rule);
    const charts = [];
    if (hasV) charts.push(['visits', C.green, 'Visits']);
    if (hasC) charts.push(['clicks', C.cyan, 'Clicks from Google']);
    if (!hasV && hasI) charts.push(['impressions', C.green, 'Times shown on Google']);
    const cw = charts.length >= 2 ? span(6) - 8 : CW;
    charts.slice(0, 2).forEach(([field, color, title], i) => {
      monthBars(doc, th, M + i * (span(6) + GUT + 8), y + 24, cw, chartH - 24, months, field, color, title, data);
    });
    y += chartH + 20 + spare * 0.6;
  } else if (showDays) {
    y += spare * 0.4;
    label(doc, 'Visits day by day', M, y, { color: th.fg, font: 'monoM' });
    hRule(doc, M, y + 13, CW, th.rule);
    dayChart(doc, th, M, y + 18, CW, chartH - 18, data.ga4.timeseries, C.green);
    y += chartH + 20 + spare * 0.6;
  } else if (showSearches) {
    y += spare * 0.4;
    label(doc, 'The searches bringing people in', M, y, { color: th.fg, font: 'monoM' });
    label(doc, 'Clicks from Google', M + CW / 2, y, { color: th.faint, width: CW / 2, align: 'right' });
    hRule(doc, M, y + 13, CW, th.rule);
    hBars(doc, th, M, y + 24, CW, qRows.map(q => ({ label: q.query, value: q.clicks })), { labelW: 200, color: C.cyan, share: false });
    y += chartH + 20 + spare * 0.6;
  }

  if (wins.length) {
    label(doc, 'What went well', M, y, { color: th.fg, font: 'monoM' });
    hRule(doc, M, y + 13, CW, th.rule);
    y += 24;
    for (let i = 0, r = 0; i < wins.length; i += 2, r++) {
      [wins[i], wins[i + 1]].forEach((w, k) => {
        if (!w) return;
        const x = k ? colX(6) + 4 : M;
        doc.rect(x, y + 3, 6, 6).fill(C.green);
        const th1 = para(doc, w.title, x + 16, y, { font: 'semi', size: 10.5, width: winW, lineGap: 1.5, color: th.fg });
        para(doc, w.detail, x + 16, y + th1 + 2, { size: 9, width: winW, lineGap: 2, color: th.faint, maxLines: 3 });
      });
      y += rowHs[r];
    }
  }
}

// ================================================================
// P200: where we go from here
// ================================================================
function nextStepsSection(ctx, y) {
  const { doc, data } = ctx;
  const th = PAPER;
  const ins = data.insights, story = data.story;
  const actions = (ins?.actions?.length ? ins.actions : (ins?.recommendations || []).map(r => ({ ...r, owner: 'us' }))).slice(0, 4);
  const watch = (story?.watch || []).slice(0, 4);
  // The work log: what North Bear did for this client in the period, in
  // the owner's own words.
  const logged = (Array.isArray(data.workDone) ? data.workDone : []).filter(w => w && clean(w.title));
  const work = logged.slice(0, 8);
  if (!actions.length && !watch.length && !ins?.summary && !work.length) return y;

  // Measure everything first and pick the roomiest spacing that still
  // lets the whole section sit on one page: this page is the answer to
  // "what happens next", and it reads best in one piece.
  const textX = colX(1) + 6, textW = span(8) - 6;
  const sumH = ins?.summary ? paraH(doc, ins.summary, { size: 11.5, width: span(11), lineGap: 3.5 }) : 0;
  const actH = actions.map(a => Math.max(34,
    paraH(doc, a.title, { font: 'semi', size: 12, width: textW, lineGap: 1.5 })
    + paraH(doc, a.detail, { size: 9.5, width: textW, lineGap: 2.5 }) + 3));
  const askH = ins?.ask ? paraH(doc, ins.ask, { font: 'med', size: 11.5, width: CW - 48, lineGap: 3 }) : 0;
  const w2 = span(6) - 18;
  const itemH = w => paraH(doc, w.title, { font: 'semi', size: 10, width: w2, lineGap: 1.5 })
    + paraH(doc, w.detail, { size: 9, width: w2, lineGap: 2 }) + 2;
  const watchRows = [];
  for (let i = 0; i < watch.length; i += 2) watchRows.push(Math.max(itemH(watch[i]), watch[i + 1] ? itemH(watch[i + 1]) : 0));
  const workX = M + 72, workW = CW - 72 - 8;
  const workH = work.map(w => paraH(doc, w.title, { font: 'semi', size: 10.5, width: workW, lineGap: 1.5 })
    + (clean(w.detail) ? paraH(doc, w.detail, { size: 9, width: workW, lineGap: 2 }) + 2 : 0));
  const moreWork = logged.length - work.length;
  const PADS = [{ row: 20, sum: 20, ask: 24, watch: 14, work: 13 }, { row: 15, sum: 15, ask: 18, watch: 11, work: 10 }, { row: 11, sum: 12, ask: 14, watch: 8, work: 8 }];
  const workTotal = pd => (work.length ? 22 + workH.reduce((a, h) => a + h + pd.work, 0) + (moreWork > 0 ? 14 : 0) + pd.sum - pd.work / 2 : 0);
  const total = pd => 46
    + (sumH ? sumH + 4 + pd.sum : 0)
    + workTotal(pd)
    + (actions.length ? 22 + actH.reduce((a, h) => a + h + pd.row, 0) + 6 : 0)
    + (askH ? askH + 42 + pd.ask : 0)
    + (watch.length ? 22 + watchRows.reduce((a, h) => a + h + pd.watch, 0) : 0);
  const start = y > TOP + 1 ? y + ctx.d.openerGap : y;
  const pd = PADS.find(c => start + total(c) <= LIMIT) || (TOP + total(PADS[0]) <= LIMIT ? PADS[0] : PADS.find(c => TOP + total(c) <= LIMIT) || PADS[2]);

  y = opener(ctx, y, 'P200', 'Where we go from here', null, Math.min(total(pd) - 46, 300));
  if (ins?.summary) {
    y += para(doc, ins.summary, M, y + 4, { font: 'reg', size: 11.5, width: span(11), lineGap: 3.5, color: th.fg }) + 4 + pd.sum;
  }

  if (work.length) {
    ctx.extended = true;
    // Kept in one piece when it fits on a page; a long log flows on.
    const whole = workTotal(pd);
    y = room(ctx, y, whole <= LIMIT - TOP ? whole : 22 + workH[0] + pd.work);
    y = subhead(doc, th, M, y, CW, 'What we did for you', `Work completed, ${periodText(data)}`);
    work.forEach((w, i) => {
      y = room(ctx, y, workH[i] + pd.work);
      label(doc, shortDate(w.date), M, y + 2.5, { color: th.faint, width: 52 });
      doc.rect(M + 56, y + 3, 6, 6).fill(C.greenInk);
      const h1 = para(doc, w.title, workX, y, { font: 'semi', size: 10.5, width: workW, lineGap: 1.5, color: th.fg });
      if (clean(w.detail)) para(doc, w.detail, workX, y + h1 + 2, { size: 9, width: workW, lineGap: 2, color: th.sub });
      y += workH[i] + pd.work;
      if (i < work.length - 1) hRule(doc, M + 56, y - pd.work / 2, CW - 56, th.rule, 0.5);
    });
    if (moreWork > 0) {
      line(doc, `And ${moreWork} more piece${moreWork === 1 ? '' : 's'} of work this period.`, workX, y - pd.work / 2 + 2, { size: 8.5, color: th.quiet, width: workW });
      y += 14;
    }
    y += pd.sum - pd.work / 2;
  }

  if (actions.length) {
    y = room(ctx, y, 22 + actH[0] + pd.row);
    y = subhead(doc, th, M, y, CW, 'What we recommend next', 'Who it sits with');
    actions.forEach((a, i) => {
      const rowH = actH[i] + pd.row;
      y = room(ctx, y, rowH);
      const hT = paraH(doc, a.title, { font: 'semi', size: 12, width: textW, lineGap: 1.5 });
      display(doc, String(i + 1).padStart(2, '0'), M, y + 2, 30, C.greenInk);
      para(doc, a.title, textX, y, { font: 'semi', size: 12, width: textW, lineGap: 1.5, color: th.fg });
      para(doc, a.detail, textX, y + hT + 3, { size: 9.5, width: textW, lineGap: 2.5, color: th.sub });
      const you = a.owner === 'you';
      const chip = you ? 'You' : 'North Bear';
      const cw = you ? 40 : 76;
      const cx = M + CW - cw;
      doc.rect(cx, y + 1, cw, 16).fill(you ? C.yellow : C.ink);
      label(doc, chip, cx, y + 1 + (16 - 6.5 * MONO_H) / 2 - 6.5 * MONO_OFF, { font: 'monoM', color: you ? C.ink : C.white, width: cw, align: 'center', spacing: 0.7 });
      y += rowH;
      hRule(doc, M, y - pd.row / 2, CW, th.rule, 0.5);
    });
    y += 6;
  }

  if (ins?.ask) {
    y = room(ctx, y, askH + 42 + pd.ask);
    doc.rect(M, y, CW, askH + 42).fill(C.ink);
    doc.rect(M + 18, y + 14, 6, 6).fill(C.yellow);
    label(doc, 'One thing from you', M + 30, y + 13.5, { color: C.yellow, font: 'monoM' });
    para(doc, ins.ask, M + 18, y + 28, { font: 'med', size: 11.5, width: CW - 48, lineGap: 3, color: C.white });
    y += askH + 42 + pd.ask;
  }

  if (watch.length) {
    // Kept together: half a list at the foot of one page and half at the
    // head of the next reads as a mistake.
    y = room(ctx, y, 22 + watchRows.reduce((a, h) => a + h + pd.watch, 0));
    y = subhead(doc, th, M, y, CW, 'Worth watching', 'Not problems, just things we are keeping an eye on');
    for (let i = 0, r = 0; i < watch.length; i += 2, r++) {
      [watch[i], watch[i + 1]].forEach((w, k) => {
        if (!w) return;
        const x = k ? colX(6) + 4 : M;
        doc.rect(x + 0.5, y + 3.5, 5, 5).lineWidth(1).stroke(C.text);
        const h1 = para(doc, w.title, x + 16, y, { font: 'semi', size: 10, width: w2, lineGap: 1.5, color: th.fg });
        para(doc, w.detail, x + 16, y + h1 + 2, { size: 9, width: w2, lineGap: 2, color: th.sub });
      });
      y += watchRows[r] + pd.watch;
    }
    y -= pd.watch;
  }
  return y;
}

// ================================================================
// P300: visitors
// ================================================================
function visitorsSection(ctx, y) {
  const { doc, data } = ctx;
  const th = PAPER;
  const ga = data.ga4;
  const period = periodNoun(data.period.start, data.period.end);

  if (!ga?.overview) {
    y = opener(ctx, y, 'P300', 'Your visitors', null, 80);
    return noteBox(doc, y, 'Not connected yet', 'Visitor counting is not connected for this site yet. Once it is, visits, pages viewed and where people came from will appear here.');
  }
  if (ga.unreliable) {
    y = opener(ctx, y, 'P300', 'Your visitors', null, 90);
    return noteBox(doc, y, 'Visitor counter being reconnected',
      `Visitor tracking is being reconnected on this site, so the visit count is not complete yet and is left out rather than shown wrong. Google Search Console shows your site was found ${fmtInt(ga.independentTraffic)}+ times in this period, and the Google and behaviour figures in this report are fully live.`);
  }

  const o = ga.overview, p = ga.prevOverview || {};
  y = opener(ctx, y, 'P300', 'Your visitors',
    `A visit is one trip to your website. Counted by ${ga.sourceLabel || 'your analytics'}; changes are against ${period.prev}.`, 110);
  const ppv = o.sessions ? o.screenPageViews / o.sessions : 0;
  const pppv = p.sessions ? p.screenPageViews / p.sessions : null;
  // On a handful of visits a rate can halve or double by chance, so the
  // rates carry no change note until there are enough visits to mean it.
  const tiny = o.sessions < 60 || (p.sessions ?? 0) < 60;
  const cells = [{ label: 'Visits', value: fmtBig(o.sessions), note: headlineNote(data, 'visits', o.sessions, p.sessions) }];
  if (ga.visitorsSameAsVisits === false) cells.push({ label: 'Visitors', value: fmtBig(o.totalUsers), note: change(o.totalUsers, p.totalUsers, { count: true }) });
  cells.push({ label: 'Pages viewed', value: fmtBig(o.screenPageViews), note: change(o.screenPageViews, p.screenPageViews, { count: true }) });
  if (o.newUsers != null) cells.push({ label: 'New visitors', value: fmtBig(o.newUsers), note: change(o.newUsers, p.newUsers, { count: true }) });
  else cells.push({ label: 'Pages per visit', value: ppv.toFixed(1), note: tiny ? null : change(ppv, pppv) });
  cells.push({ label: 'Engaged visits', value: fmtPct(o.engagementRate * 100, 0), note: tiny ? null : change(o.engagementRate, p.engagementRate), hint: 'Stayed and browsed' });
  cells.push({ label: 'Average visit', value: fmtDur(o.averageSessionDuration), note: tiny ? null : change(o.averageSessionDuration, p.averageSessionDuration), hint: 'Time on the site' });
  y = statRow(doc, th, M, y, CW, cells, { valueSize: cells.length > 5 ? 22 : 26 }) + ctx.d.gap;

  // Day by day
  if ((ga.timeseries || []).length > 1) {
    const ch = ctx.d.chartH;
    y = room(ctx, y, ch + 46);
    y = subhead(doc, th, M, y, CW, 'Visits day by day', `${fmtInt(o.sessions)} in total`);
    dayChart(doc, th, M, y, CW, ch, ga.timeseries, C.greenInk);
    y += ch + 8;
    const started = trackingStart(data);
    if (started) {
      doc.rect(M, y + 3, 5, 5).fill(C.yellow);
      y += para(doc, `Visitor tracking began on ${formatDate(started)}, so these figures cover from that date. They will build to a full picture over the coming weeks.`, M + 12, y, { size: 8.5, width: CW - 12, color: th.sub }) + 4;
    }
    y += ctx.d.gap - 8;
  }

  // Where they came from, and on what
  const channels = (ga.channels || []).slice(0, 6).map(c => ({ label: friendlyChannel(c.channel), value: c.sessions }));
  const devices = (ga.devices || []).filter(d => d.sessions > 0).slice(0, 3);
  if (channels.length) {
    const blockH = 24 + Math.max(channels.length * 19, devices.length ? 34 + devices.length * 17 : 0) + 8;
    y = room(ctx, y, blockH);
    const leftW = devices.length ? span(7) + 6 : CW;
    const y0 = subhead(doc, th, M, y, leftW, 'Where visitors came from');
    const yBars = hBars(doc, th, M, y0, leftW, channels, { labelW: devices.length ? 128 : 170 });
    let yDev = y0;
    if (devices.length) {
      const dx = colX(8), dw = span(4);
      yDev = subhead(doc, th, dx, y, dw, 'What they browsed on');
      const total = devices.reduce((a, d) => a + d.sessions, 0) || 1;
      const colors = [C.ink, C.green, C.cyan];
      let bx = dx;
      devices.forEach((d, i) => {
        const w = (dw * d.sessions) / total;
        doc.rect(bx, yDev + 1, Math.max(w, 1), 10).fill(colors[i]);
        bx += w;
      });
      yDev += 22;
      devices.forEach((d, i) => {
        doc.rect(dx, yDev + 2.5, 6, 6).fill(colors[i]);
        line(doc, friendlyDevice(d.device), dx + 12, yDev, { font: 'med', size: 9, color: th.fg, width: dw - 60 });
        line(doc, `${Math.round((d.sessions / total) * 100)}%`, dx + dw - 46, yDev, { font: 'semi', size: 9, color: th.fg, width: 46, align: 'right' });
        yDev += 17;
      });
    }
    y = Math.max(yBars, yDev) + ctx.d.gap - 4;
  }

  y = aiStrip(ctx, y);

  // Most viewed pages
  const pages = (ga.topPages || []).slice(0, ctx.d.pageRows);
  if (pages.length) {
    y = room(ctx, y, 40 + Math.min(pages.length, 3) * 20);
    y = subhead(doc, th, M, y, CW, 'Most viewed pages');
    const maxViews = Math.max(...pages.map(r => r.views), 1);
    const nameW = CW - 250;
    y = table(ctx, th, M, y, [
      { label: 'Page', width: nameW, draw: (r, x, ry, w) => {
        const name = r.path === '/' ? 'Homepage' : pageName(r.path, r.title);
        const used = line(doc, name, x, ry + 5.5, { font: 'semi', size: 9, color: th.fg, width: w * 0.62 });
        if (r.path && r.path !== '/') label(doc, r.path, x + used + 8, ry + 7.5, { color: th.quiet, width: w - used - 20, spacing: 0.2, upper: false, size: 6 });
      } },
      { label: '', width: 110, draw: (r, x, ry) => {
        doc.rect(x, ry + 7, 96, 6).fill(th.track);
        doc.rect(x, ry + 7, Math.max(2, (96 * r.views) / maxViews), 6).fill(C.greenInk);
      } },
      { label: 'Views', key: 'views', width: 70, align: 'right', font: 'semi', format: fmtInt },
      { label: 'Visits', key: 'sessions', width: 70, align: 'right', format: fmtInt },
    ], pages);
  }
  return y;
}

// Visits from AI assistants, as one ruled strip.
function aiStrip(ctx, y) {
  const { doc, data } = ctx;
  const th = PAPER;
  const ai = data.aiTraffic;
  if (!ai) return y;
  const period = periodNoun(data.period.start, data.period.end);
  y = room(ctx, y, 52 + ctx.d.gap);
  hRule(doc, M, y, CW, th.rule);
  doc.rect(M, y + 12, 6, 6).fill(C.cyan);
  label(doc, 'Visits from AI assistants', M + 12, y + 11.5, { color: th.fg, font: 'monoM' });
  label(doc, 'ChatGPT, Perplexity, Gemini, Copilot and others', M + CW / 2 - 40, y + 11.5, { color: th.faint, width: CW / 2 + 40, align: 'right' });
  const text = ai.visits > 0
    ? `${fmtInt(ai.visits)} visit${ai.visits === 1 ? '' : 's'}`
      + (ai.sharePct != null ? ` (${ai.sharePct}% of all visits)` : '')
      + ((ai.top || []).length ? `, from ${ai.top.map(t => `${t.source} ${fmtInt(t.visits)}`).join(', ')}` : '')
      + (ai.prevVisits != null && ai.prevVisits !== ai.visits ? `. ${cap(period.prev)}: ${fmtInt(ai.prevVisits)}.` : '.')
    : 'None recorded in this period, which is normal today. As AI search grows, the visitors it sends will show here.';
  line(doc, text, M, y + 27, { font: 'reg', size: 9.5, color: th.sub, width: CW });
  hRule(doc, M, y + 46, CW, th.rule);
  return y + 46 + ctx.d.gap;
}

// ================================================================
// P400: Google
// ================================================================
// The keyword ladder: one row per key search on a scale of Google
// positions, with page one marked, a ring where it stood last period
// and a dot where it stands now.
function ladder(doc, x, y, w, targets) {
  const th = DARK;
  const rows = targets.slice().sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
  const rowH = 21;
  const H = 62 + rows.length * rowH + 16;
  doc.rect(x, y, w, H).fill(C.ink);
  const pad = 16;
  label(doc, 'Where you rank for the searches that matter', x + pad, y + 14, { color: C.white, font: 'monoM', width: w * 0.62 });
  // legend
  const lx = x + w - pad - 118;
  doc.circle(lx + 3, y + 17.5, 3).fill(C.green);
  label(doc, 'Now', lx + 10, y + 14, { color: th.faint });
  doc.circle(lx + 48, y + 17.5, 2.6).lineWidth(0.9).stroke(th.faint);
  label(doc, 'Last period', lx + 55, y + 14, { color: th.faint, width: 64 });

  const nameW = 150, figW = 104;
  const sx = x + pad + nameW, sw = w - pad * 2 - nameW - figW;
  const MAXP = 30;
  const px = p => sx + ((Math.min(Math.max(p, 1), MAXP) - 1) / (MAXP - 1)) * sw;
  const top = y + 34, bottom = top + 22 + rows.length * rowH;
  // page-one zone
  const zoneR = px(10.5);
  doc.save().fillOpacity(0.16).rect(sx - 8, top, zoneR - sx + 8, bottom - top).fill(C.green).restore();
  doc.rect(sx - 8, top, zoneR - sx + 8, 1.2).fill(C.green);
  label(doc, 'Page one', sx - 2, top + 7, { color: C.green, font: 'monoM', size: 6 });
  label(doc, 'Page two', px(10.5) + 6, top + 7, { color: th.quiet, size: 6 });
  label(doc, 'Page three', px(20.5) + 6, top + 7, { color: th.quiet, size: 6 });
  [10.5, 20.5].forEach(p => vRule(doc, px(p), top, bottom, th.rule, 0.6));
  [1, 5, 10, 20, 30].forEach(p => {
    label(doc, p === 30 ? '30+' : String(p), px(p) - 12, bottom + 4, { color: th.quiet, width: 24, align: 'center', size: 5.5, spacing: 0.2 });
  });

  rows.forEach((t, i) => {
    const ry = top + 22 + i * rowH;
    const cy = ry + rowH / 2;
    if (i) hRule(doc, x + pad, ry, w - pad * 2, th.rule, 0.4);
    line(doc, t.keyword, x + pad, cy - 5.5, { font: 'med', size: 9, color: C.white, width: nameW - 18 });
    const fx = x + w - pad - figW;
    if (t.position == null) {
      label(doc, 'Not showing yet', fx, cy - 3.5, { color: th.quiet, width: figW, align: 'right', size: 6 });
      return;
    }
    const on1 = t.position <= 10.5;
    const moved = t.movement != null && Math.abs(t.movement) >= 0.5 && t.prevPosition != null;
    if (moved) {
      const x1 = px(t.prevPosition), x2 = px(t.position);
      if (Math.abs(x2 - x1) > 7) doc.moveTo(x1 + (x2 > x1 ? 3 : -3), cy).lineTo(x2 + (x2 > x1 ? -5 : 5), cy).lineWidth(0.9).stroke(th.faint);
      doc.circle(x1, cy, 2.6).lineWidth(0.9).stroke(th.faint);
    }
    doc.circle(px(t.position), cy, 4).fill(on1 ? C.green : C.white);
    const shown = t.position > MAXP ? '30+' : String(Math.max(1, Math.round(t.position)));
    display(doc, shown, fx, cy - (15 * CAP_H) / 2, 15, on1 ? C.green : C.white, { width: 30, align: 'right' });
    const mv = t.movement == null ? (t.prevPosition == null ? { text: 'New', kind: 'up' } : null) : moveNote(t.movement);
    if (mv) line(doc, mv.text.replace(/ places?$/, ''), fx + 36, cy - 4.5, { font: 'med', size: 8, color: noteColor(th, mv.kind), width: figW - 36, align: 'right' });
  });
  return y + H;
}

// The average position across every search. When the site starts
// showing for many more searches, the new ones begin low down and drag
// the average with them, which is growth, not a slide. Say that rather
// than print "down 22 places" beside a rising site.
function positionNote(data, s, p) {
  const move = s.position && p.position ? p.position - s.position : null;
  const shown = data.story?.trends?.shown?.dir || trend(s.impressions, p.impressions).dir;
  if (move != null && move <= -0.5 && shown === 'up') return { text: 'Seen for more searches', kind: 'level' };
  return moveNote(move);
}

function googleSection(ctx, y) {
  const { doc, data } = ctx;
  const th = PAPER;
  const period = periodNoun(data.period.start, data.period.end);
  const sr = data.search;

  if (!sr?.summary) {
    y = opener(ctx, y, 'P400', 'Found on Google', null, 80);
    return noteBox(doc, y, 'Not connected yet', 'Google Search Console is not connected for this site yet. Once it is, your Google rankings and the searches people find you with will appear here.');
  }
  if (sr.empty) {
    y = opener(ctx, y, 'P400', 'Found on Google', null, 90);
    return noteBox(doc, y, 'Nothing recorded yet', 'Your site is connected to Google Search Console, but Google did not record any searches leading to it in this period. As the site builds authority this section will fill with the searches people find you with.');
  }

  const s = sr.summary, p = sr.prevSummary || {};
  y = opener(ctx, y, 'P400', 'Found on Google',
    `How your website showed up in Google searches. Position is where you rank: lower is better, and 1 to 10 is page one. Changes are against ${period.prev}.`, 110);
  y = statRow(doc, th, M, y, CW, [
    { label: 'Clicks', value: fmtBig(s.clicks), note: headlineNote(data, 'clicks', s.clicks, p.clicks) },
    { label: 'Times shown', value: fmtBig(s.impressions), note: headlineNote(data, 'shown', s.impressions, p.impressions) },
    { label: 'Click rate', value: fmtPct(s.ctr * 100), note: s.impressions < 300 || (p.impressions ?? 0) < 300 ? null : change(s.ctr, p.ctr), hint: 'Share who clicked' },
    { label: 'Average position', value: s.position ? s.position.toFixed(1) : 'n/a', note: positionNote(data, s, p) },
  ]) + ctx.d.gap;

  const targets = sr.targets || [];
  if (targets.length) {
    const H = 62 + targets.length * 21 + 16;
    y = room(ctx, y, H + 30);
    y = ladder(doc, M, y, CW, targets) + 8;
    y += para(doc, 'These are the searches you have told us matter most. Position is the average across every search containing the phrase. "Not showing yet" means Google did not show the site for it in this period, which makes it a clear opportunity.', M, y, { size: 8, width: CW, color: th.quiet, lineGap: 1.5 }) + 16;
  }

  const queries = (sr.topQueries || []).slice(0, ctx.d.queryRows);
  if (queries.length) {
    y = room(ctx, y, 42 + Math.min(queries.length, 3) * 20);
    y = subhead(doc, th, M, y, CW, 'The searches people found you with', 'Top by clicks');
    const mv = r => (r.positionChange == null ? (r.prevPosition == null ? { text: 'New', kind: 'up' } : null) : moveNote(r.positionChange));
    y = table(ctx, th, M, y, [
      { label: 'Search', key: 'query', width: CW - 316, font: 'semi' },
      { label: 'Clicks', key: 'clicks', width: 56, align: 'right', format: fmtInt },
      { label: 'Times shown', key: 'impressions', width: 78, align: 'right', format: fmtInt },
      { label: 'Position', width: 98, align: 'right', headPad: 32, draw: (r, x, ry, w) => {
        const on1 = r.position <= 10.5;
        line(doc, r.position.toFixed(1), x, ry + 5.5, { font: 'semi', size: 9, color: th.fg, width: w - 32, align: 'right' });
        if (on1) {
          doc.rect(x + w - 26, ry + 5, 26, 10.5).fill(C.green);
          label(doc, 'PG 1', x + w - 26, ry + 5 + (10.5 - 5.5 * MONO_H) / 2 - 5.5 * MONO_OFF, { font: 'monoM', size: 5.5, color: C.ink, width: 26, align: 'center', spacing: 0.3 });
        }
      } },
      { label: 'Movement', width: 84, align: 'right', draw: (r, x, ry, w) => {
        const m = mv(r);
        line(doc, m ? m.text : 'No earlier figure', x, ry + 5.5, { font: 'med', size: 8.5, color: m ? noteColor(th, m.kind) : th.quiet, width: w, align: 'right' });
      } },
    ], queries) + 8;
    // The footnote is dropped rather than sent to the next page alone.
    if (y + 12 <= LIMIT) y += para(doc, 'Movement is places gained or lost on Google against the period before. "PG 1" marks a search where you appear on the first page.', M, y, { size: 8, width: CW, color: th.quiet, lineGap: 1.5 });
    else y -= 8;
  }
  return newGround(ctx, y);
}

// New searches the site started showing for, and the pages Google sent
// people to. Two short lists side by side (or one across the page when
// only one has anything to show), kept together as a block.
function newGround(ctx, y) {
  const { doc, data } = ctx;
  const th = PAPER;
  const sr = data.search;
  const period = periodNoun(data.period.start, data.period.end);
  const fresh = (sr.newQueries || []).filter(q => q && clean(q.query)).slice(0, 8);
  const pages = (sr.pages || []).filter(r => r && r.page).slice(0, 8).map(r => {
    let path = String(r.page);
    try { const u = new URL(path); path = u.pathname + (u.hash.length > 2 ? u.hash : ''); } catch { path = path.replace(/^[a-z]+:\/\/[^/]+/i, '') || '/'; }
    return { ...r, path, name: path === '/' ? 'Homepage' : pageName(path, '') };
  });
  if (!fresh.length && !pages.length) return y;
  ctx.extended = true;

  const both = fresh.length && pages.length;
  const colW = both ? span(6) - 10 : CW;
  const during = period.the.startsWith('this') ? period.the : `in ${period.the}`;
  const freshIntro = `Google showed your site for these searches ${during}. It did not show it for any of them in ${period.prev}.`;
  const pagesIntro = `Where people landed when they clicked through from a Google search. Change is against ${period.prev}.`;
  const introOpts = { size: 8.5, width: colW, lineGap: 2, color: th.sub, maxLines: 3 };
  const introH = Math.max(fresh.length ? paraH(doc, freshIntro, introOpts) : 0, pages.length ? paraH(doc, pagesIntro, introOpts) : 0);
  const rowH = 19;
  const rows = Math.max(fresh.length, pages.length);
  const blockH = 22 + introH + 10 + 13 + rows * rowH + 2;

  y = room(ctx, y + ctx.d.gap, blockH);
  const head = (x, top, cols) => {
    let cx = x;
    cols.forEach(c => { label(doc, c.label, cx, top, { color: th.faint, width: c.width - (c.right ? 0 : 6), align: c.right ? 'right' : 'left' }); cx += c.width; });
    hRule(doc, x, top + 13, colW, th.fg, 0.9);
    return top + 13;
  };

  const lists = [];
  if (fresh.length) {
    lists.push(x => {
      const cols = [{ label: 'Search', width: colW - (both ? 98 : 150) }, { label: 'Shown', width: both ? 44 : 80, right: true }, { label: 'Position', width: both ? 54 : 70, right: true }];
      let ry = subhead(doc, th, x, y, colW, 'New searches you appeared for');
      para(doc, freshIntro, x, ry, introOpts);
      ry = head(x, ry + introH + 10, cols);
      fresh.forEach(q => {
        line(doc, q.query, x, ry + 5, { font: 'semi', size: 9, color: th.fg, width: cols[0].width - 8 });
        line(doc, fmtInt(q.impressions), x + cols[0].width, ry + 5, { size: 9, color: th.fg, width: cols[1].width, align: 'right' });
        const on1 = q.position != null && q.position <= 10.5;
        line(doc, q.position != null && isFinite(q.position) ? String(Math.max(1, Math.round(q.position))) : 'n/a', x + cols[0].width + cols[1].width, ry + 5,
          { font: 'semi', size: 9, color: on1 ? th.up : th.fg, width: cols[2].width, align: 'right' });
        ry += rowH;
        hRule(doc, x, ry, colW, th.rule, 0.5);
      });
      return ry;
    });
  }
  if (pages.length) {
    lists.push(x => {
      const cols = [{ label: 'Page', width: colW - (both ? 126 : 170) }, { label: 'Clicks', width: both ? 44 : 70, right: true }, { label: 'Change', width: both ? 82 : 100, right: true }];
      let ry = subhead(doc, th, x, y, colW, 'Pages Google sent people to');
      para(doc, pagesIntro, x, ry, introOpts);
      ry = head(x, ry + introH + 10, cols);
      pages.forEach(r => {
        line(doc, r.name, x, ry + 5, { font: 'semi', size: 9, color: th.fg, width: cols[0].width - 8 });
        line(doc, fmtInt(r.clicks), x + cols[0].width, ry + 5, { font: 'semi', size: 9, color: th.fg, width: cols[1].width, align: 'right' });
        const n = clicksNote(r.clicks, r.prevClicks);
        if (n) line(doc, n.text, x + cols[0].width + cols[1].width, ry + 5.5, { font: 'med', size: 8.5, color: noteColor(th, n.kind), width: cols[2].width, align: 'right' });
        ry += rowH;
        hRule(doc, x, ry, colW, th.rule, 0.5);
      });
      return ry;
    });
  }
  const ends = lists.map((draw, i) => draw(i ? colX(6) + 10 : M));
  return Math.max(...ends);
}

// ================================================================
// P500: behaviour and health
// ================================================================
function healthSection(ctx, y) {
  const { doc, data } = ctx;
  const th = PAPER;
  const cl = data.clarity, sh = data.siteHealth, up = data.uptime;
  const hasScores = sh && (sh.performance != null || sh.seo != null);

  y = opener(ctx, y, 'P500', 'Behaviour and health', 'How people used the site once they arrived, how Google rates the build, and whether the site stayed up.', 110);

  // How people used the site (Microsoft Clarity)
  const humans = cl ? (cl.humanSessions != null ? cl.humanSessions : cl.sessions) : 0;
  if (cl && humans > 0) {
    const pc = data.prevClarity && data.prevClarity.sessions > 0 ? data.prevClarity : null;
    const prevHumans = pc ? (pc.humanSessions != null ? pc.humanSessions : pc.sessions) : null;
    y = subhead(doc, th, M, y, CW, 'How people used the site', `Microsoft Clarity // ${cl.daysCovered} day${cl.daysCovered === 1 ? '' : 's'} measured`);
    y = statRow(doc, th, M, y - 9, CW, [
      { label: 'Visits watched', value: fmtBig(humans), note: pc ? change(humans, prevHumans, { count: true }) : null, hint: 'Real people, bots left out' },
      { label: 'Scroll depth', value: cl.avgScrollDepth != null ? fmtPct(cl.avgScrollDepth, 0) : 'n/a', note: pc && humans >= 30 ? change(cl.avgScrollDepth, pc.avgScrollDepth) : null, hint: 'How far down people got' },
      { label: 'Dead clicks', value: fmtBig(cl.deadClicks), note: pc ? change(cl.deadClicks, pc.deadClicks, { lowerIsBetter: true, count: true }) : null, hint: 'Lower is better' },
      { label: 'Frustrated clicks', value: fmtBig(cl.rageClicks), note: pc ? change(cl.rageClicks, pc.rageClicks, { lowerIsBetter: true, count: true }) : null, hint: 'Lower is better' },
    ]) + 8;
    y += para(doc, `A dead click is a click on something that did nothing. A frustrated click is rapid repeated clicking in one spot.${cl.quickBacks ? ` ${fmtInt(cl.quickBacks)} visitor${cl.quickBacks === 1 ? '' : 's'} left a page straight after arriving on it.` : ''}`, M, y, { size: 8, width: CW, color: th.quiet, lineGap: 1.5 }) + ctx.d.gap - 2;
  } else if (cl) {
    y = noteBox(doc, y, 'Nothing recorded yet', 'Microsoft Clarity is connected but did not record any visits by real people in this period. Once it does, you will see how people use your pages here: scrolling, clicks and signs of frustration.') + 20;
  } else {
    y = noteBox(doc, y, 'Not connected yet', 'Microsoft Clarity is not connected for this site yet. Once it is, you will see how people actually use your pages: scrolling, clicks and signs of frustration.') + 20;
  }

  // Site health (Google PageSpeed, tested as a phone)
  if (hasScores) {
    y = room(ctx, y, 130);
    y = subhead(doc, th, M, y, CW, 'Site health check', 'Scored out of 100 by Google, tested as a phone');
    const grade = v => (v == null ? 'Not scored' : v >= 90 ? 'Excellent' : v >= 50 ? 'Room to improve' : 'Needs attention');
    const items = [
      ['Loading speed', sh.performance, 'How quickly pages appear on a phone'],
      ['Search friendly', sh.seo, 'Built so Google can read it'],
      ['Best practice', sh.bestPractices, 'Modern, safe code'],
    ];
    const cw = CW / 3;
    items.forEach(([name, score, hint], i) => {
      const x = M + i * cw;
      if (i) vRule(doc, x, y + 2, y + 66, th.rule);
      ring(doc, th, x + (i ? 14 : 0) + 30, y + 34, 27, score);
      const tx = x + (i ? 14 : 0) + 72;
      const tw = cw - 80 - (i ? 14 : 0);
      line(doc, name, tx, y + 9, { font: 'semi', size: 10, color: th.fg, width: tw });
      line(doc, grade(score), tx, y + 24, { font: 'med', size: 8.5, color: score != null && score >= 90 ? th.up : th.sub, width: tw });
      para(doc, hint, tx, y + 37, { font: 'reg', size: 8, color: th.quiet, width: tw, lineGap: 1, maxLines: 2 });
    });
    y += 72;
    hRule(doc, M, y, CW, th.rule);
    y += ctx.d.gap;
  }

  // Website availability
  if (up) {
    y = room(ctx, y, 112);
    y = subhead(doc, th, M, y, CW, 'Website availability', 'Checked every 5 minutes, day and night');
    const fault = up.outages > 0;
    y = statRow(doc, th, M, y - 9, CW, [
      { label: 'Uptime', value: `${up.uptimePct}%`, hint: up.uptimePct >= 99.9 ? 'Excellent' : up.uptimePct >= 99 ? 'Good' : 'Needs attention' },
      { label: 'Time offline', value: up.downtimeShort || '0 min', color: fault ? C.red : undefined, hint: 'In this period' },
      { label: 'Outages', value: String(up.outages), color: fault ? C.red : undefined, hint: fault ? (up.outages === 1 ? 'One interruption' : 'Separate interruptions') : 'No interruptions' },
    ]) + 8;
    y += para(doc, `Only outages confirmed by two checks in a row are counted${up.measuredFrom ? `. Monitoring began on ${formatDate(up.measuredFrom)}` : ''}.`, M, y, { size: 8, width: CW, color: th.quiet }) + 4;
  }
  return y;
}

// ================================================================
// Closing matter: sources, plain-words glossary, contact
// ================================================================
function closing(ctx, y) {
  const { doc, data } = ctx;
  const th = PAPER;
  const sources = [];
  if (data.ga4?.overview && !data.ga4.unreliable) sources.push(['Visits and pages', data.ga4.sourceLabel || 'Website analytics']);
  if (data.search?.summary) sources.push(['Google figures', 'Google Search Console']);
  if (data.clarity) sources.push(['Behaviour', 'Microsoft Clarity']);
  if (data.siteHealth) sources.push(['Site health', 'Google PageSpeed']);
  if (data.uptime) sources.push(['Availability', 'North Bear Pulse monitoring']);
  const glossary = [
    ['Visit', 'One trip to your website by one person.'],
    ['Times shown on Google', 'How often your site appeared in search results.'],
    ['Click rate', 'The share of those appearances that led to a click.'],
    ['Position', 'Where you rank on Google. 1 to 10 is page one.'],
    ['Engaged visit', 'A visit where the person stayed or looked further.'],
  ];
  const gw = span(7) - 8, sw = span(5);
  const gH = glossary.reduce((a, [, d]) => a + Math.max(15, paraH(doc, d, { size: 8.5, width: gw - 112 }) + 3), 0);
  const blockH = 22 + Math.max(gH, sources.length * 15) + 18;
  const contactH = 64;
  const total = blockH + contactH + 20;

  // Where it goes, in order of preference: after the content with the
  // usual gap; then, for a report carrying the longer sections (the work
  // log, new searches, pages from Google), with a tighter gap or in a
  // short form (sources on one line, no glossary) when that is what
  // fits. Only then on a page of its own, because a last sheet holding
  // nothing but this reads as a mistake. Reports without those sections
  // are laid out exactly as they always were.
  const from = y;
  const shortH = 24 + contactH;
  let short = false;
  if (y <= TOP + 1 || y + ctx.d.openerGap + total <= LIMIT) { if (y > TOP + 1) y += ctx.d.openerGap; }
  else if (ctx.extended && y + 12 + total - 14 <= LIMIT) y += 12; // `total` carries 20 points of slack below the band
  else if (ctx.extended && sources.length && y + 16 + shortH <= LIMIT) { y += 16; short = true; ctx.closingShort = true; }
  else { y = newPage(ctx, from); ctx.closingAlone = true; }

  if (short) {
    // Sit it at the foot of the page when the gap is small enough.
    const foot = LIMIT - shortH + 4;
    if (foot > y && foot - y <= 150) y = foot;
    hRule(doc, M, y, CW, th.rule);
    label(doc, 'Where the numbers come from', M, y + 8, { color: th.fg, font: 'monoM' });
    line(doc, sources.map(([, where]) => where).filter((v, i, a) => a.indexOf(v) === i).join(', '), M + 170, y + 6.5, { size: 8.5, color: th.sub, width: CW - 170, align: 'right' });
    y += 24;
  } else {
  // Sit the closing matter at the foot of the page when there is spare
  // room, so the last page ends on purpose rather than trailing off.
  // Across a big gap it would leave a hole mid-page, so then it simply
  // follows the content.
  const anchored = LIMIT - total + 4;
  if (anchored > y && anchored - y <= 150 && !ctx.closingAlone) y = anchored;
  else if (anchored > y && y > TOP + 1) y += 10;

  const gx = M, sx = colX(7) + 8;
  let gy = subhead(doc, th, gx, y, gw, 'In plain words');
  glossary.forEach(([term, def]) => {
    line(doc, term, gx, gy, { font: 'semi', size: 8.5, color: th.fg, width: 106 });
    const h = para(doc, def, gx + 112, gy, { size: 8.5, width: gw - 112, color: th.sub });
    gy += Math.max(15, h + 3);
  });
  let sy = sources.length ? subhead(doc, th, sx, y, sw - 8, 'Where the numbers come from') : y;
  sources.forEach(([what, where]) => {
    line(doc, what, sx, sy, { font: 'semi', size: 8.5, color: th.fg, width: 84 });
    line(doc, where, sx + 88, sy, { font: 'reg', size: 8.5, color: th.sub, width: sw - 8 - 88 });
    sy += 15;
  });
  y = Math.max(gy, sy) + 18;
  }

  doc.rect(M, y, CW, contactH).fill(C.ink);
  blocks(doc, M + CW - 18, y + 14, 6, [C.green, C.cyan, C.yellow]);
  display(doc, 'Questions about these numbers?', M + 20, y + 17, 20, C.white, { width: CW - 120 });
  line(doc, 'We are happy to walk you through your report any time.', M + 20, y + 40, { font: 'reg', size: 9.5, color: C.softD, width: span(7) });
  label(doc, 'info@northbearmedia.co.uk', M + CW / 2, y + 42, { font: 'monoM', size: 7.5, color: C.green, width: CW / 2 - 18, align: 'right', upper: false, spacing: 0.4 });
  return y + contactH;
}

function footers(ctx) {
  const { doc } = ctx;
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const dark = i === 0;
    const color = dark ? '#8B9096' : C.muted;
    hRule(doc, M, FOOT_Y, CW, dark ? C.ruleD : C.ruleP);
    label(doc, 'North Bear Media // northbearmedia.co.uk // info@northbearmedia.co.uk', M, FOOT_Y + 10, { color, size: 6, width: CW * 0.7 });
    label(doc, `${ctx.tags[i] || ''} // Page ${i + 1} of ${range.count}`, M + CW * 0.6, FOOT_Y + 10, { color, size: 6, width: CW * 0.4, align: 'right' });
  }
}

// How tightly a pass sets the flowing pages. The report is laid out at
// each density and the one with the fewest pages wins (roomiest on a
// tie, unless that strands the closing matter alone on a final page), so
// a report never runs to an extra near-empty sheet for a few lines.
const DENSITY = [
  { gap: 22, openerGap: 26, chartH: 124, pageRows: 7, queryRows: 8 },
  { gap: 17, openerGap: 20, chartH: 108, pageRows: 6, queryRows: 7 },
  { gap: 13, openerGap: 16, chartH: 94, pageRows: 5, queryRows: 6 },
];

function build(data, d) {
  const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 0, bufferPages: true, info: {
    Title: `Website report: ${clean(data.site.clientName)}`,
    Author: 'North Bear Media',
  } });
  for (const [name, file] of Object.entries(FONTS)) doc.registerFont(name, join(FONT_DIR, file));
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  const done = new Promise(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const ctx = { doc, data, d, tags: [], tag: 'P100', waste: 0, closingAlone: false, closingShort: false, extended: false };
  summaryPage(ctx);

  ctx.tag = 'P200';
  let y = newPage(ctx);
  y = nextStepsSection(ctx, y);
  y = visitorsSection(ctx, y);
  y = googleSection(ctx, y);
  y = healthSection(ctx, y);
  const endY = closing(ctx, y);

  footers(ctx);
  const pages = doc.bufferedPageRange().count;
  doc.end();
  return { done, pages, alone: ctx.closingAlone, rank: ctx.closingAlone ? 2 : ctx.closingShort ? 1 : 0, waste: ctx.waste, lastFill: (endY - TOP) / (LIMIT - TOP) };
}

export async function generateReportPdf(data) {
  let best = null;
  for (const d of DENSITY) {
    const pass = build(data, d);
    const buffer = await pass.done;
    if (!best || pass.pages < best.pages || (pass.pages === best.pages && pass.rank < best.rank)) best = { ...pass, buffer };
    // A last page that is already half full, with the closing matter in
    // full, cannot be bettered by setting the rest tighter.
    if (pass.rank === 0 && pass.lastFill >= 0.5) break;
  }
  return best.buffer;
}
