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
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/[‐‑]/g, '-')
    .replace(/[^ -~ -ÿ‘’“”•…€™]/g, '')
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
  return { text: `${t.dir === 'up' ? 'Up' : 'Down'} ${Math.abs(t.pct).toFixed(0)}%`, kind: t.dir };
}
function change(cur, prev, { lowerIsBetter = false } = {}) {
  if (cur == null || prev == null || !isFinite(cur) || !isFinite(prev) || prev === 0) return null;
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 12) return { text: 'Level', kind: 'level' };
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

// ---------- text primitives ----------
function fit(doc, text, maxW, spacing = 0) {
  if (doc.widthOfString(text, { characterSpacing: spacing }) <= maxW) return text;
  let t = text;
  while (t.length > 1 && doc.widthOfString(t + '…', { characterSpacing: spacing }) > maxW) t = t.slice(0, -1);
  return t.replace(/[\s,.;:]+$/, '') + '…';
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
function newPage(ctx) {
  const { doc, data } = ctx;
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
  return y + need <= LIMIT ? y : newPage(ctx);
}

// Section opener: heavy rule, teletext page number block, condensed
// headline, optional standfirst. `need` is the height of the first block
// of the section, so a headline is never left alone at the foot of a page.
function opener(ctx, y, code, title, standfirst, need = 150) {
  const { doc } = ctx;
  const sfH = standfirst ? paraH(doc, standfirst, { size: 9.5, width: span(9), lineGap: 2.5 }) + 8 : 0;
  if (y > TOP + 1) y += 26;
  ctx.tag = code;
  if (y + 44 + sfH + need > LIMIT) y = newPage(ctx);
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
function monthBars(doc, th, x, y, w, h, months, field, color, title, data) {
  label(doc, title, x, y, { color: th.fg, font: 'monoM', width: w });
  const rows = months.filter(m => m[field] != null || true);
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
      doc.save();
      doc.rect(bx, by, bw, bh).clip();
      doc.lineWidth(0.8).strokeColor(color);
      for (let k = -bh; k < bw + bh; k += 4) doc.moveTo(bx + k, by + bh).lineTo(bx + k + bh, by).stroke();
      doc.restore();
      doc.rect(bx + 0.4, by + 0.4, bw - 0.8, Math.max(0.5, bh - 0.4)).lineWidth(0.8).stroke(color);
    } else {
      doc.save().fillOpacity(inPeriod(m) ? 1 : 0.42).rect(bx, by, bw, bh).fill(color).restore();
    }
    label(doc, fmtBig(v), cx - slot / 2, by - 11, { color: inPeriod(m) ? th.fg : th.faint, width: slot, align: 'center', size: small ? 5.5 : 6.5, spacing: small ? 0 : 0.4 });
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
function hBars(doc, th, x, y, w, rows, { labelW = 120, rowH = 19, color = C.greenInk } = {}) {
  const max = Math.max(...rows.map(r => r.value), 1);
  const total = rows.reduce((a, r) => a + r.value, 0) || 1;
  const figW = 74;
  const barW = w - labelW - figW;
  rows.forEach((r, i) => {
    const ry = y + i * rowH;
    line(doc, r.label, x, ry + 2, { font: 'med', size: 9, color: th.fg, width: labelW - 10 });
    doc.rect(x + labelW, ry + 4, barW, 6).fill(th.track);
    doc.rect(x + labelW, ry + 4, Math.max((barW * r.value) / max, 2), 6).fill(color);
    line(doc, fmtInt(r.value), x + labelW + barW, ry + 2, { font: 'semi', size: 9, color: th.fg, width: 42, align: 'right' });
    label(doc, `${Math.round((r.value / total) * 100)}%`, x + labelW + barW + 42, ry + 3.5, { color: th.faint, width: figW - 42, align: 'right', spacing: 0.3 });
  });
  return y + rows.length * rowH;
}

// A simple ruled table. Columns give either a key and format, or a draw
// function for anything richer than text.
function table(doc, th, x, y, cols, rows, { rowH = 20 } = {}) {
  let cx = x;
  cols.forEach(col => {
    label(doc, col.label, cx + (col.align === 'right' ? 0 : 0), y, { color: th.faint, width: col.width - 8, align: col.align || 'left' });
    cx += col.width;
  });
  const w = cols.reduce((a, c) => a + c.width, 0);
  hRule(doc, x, y + 13, w, th.fg, 0.9);
  let ry = y + 13;
  rows.forEach(row => {
    let px = x;
    cols.forEach(col => {
      if (col.draw) col.draw(row, px, ry, col.width);
      else {
        const raw = row[col.key];
        const val = col.format ? col.format(raw, row) : String(raw ?? '');
        line(doc, val, px, ry + 5.5, {
          font: col.font || 'reg', size: col.size || 9, width: col.width - 8, align: col.align || 'left',
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
function friendlyDevice(d) {
  const s = String(d || '').toLowerCase();
  if (s === 'mobile' || s === 'phone') return 'Phone';
  if (s === 'desktop') return 'Computer';
  if (s === 'tablet') return 'Tablet';
  return cap(s) || 'Other';
}

// The day visitor tracking began, when that is well inside the period: a
// month-long report may then hold only days of measurement, and a low
// number would read as a broken site unless the report says so.
function trackingStart(data) {
  const first = data.ga4?.timeseries?.[0]?.date;
  if (!first || first <= data.period.start) return null;
  const daysIn = Math.round((Date.parse(first) - Date.parse(data.period.start)) / 86400000);
  return daysIn >= 5 ? first : null;
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
  while (nameSize > 18 && doc.fontSize(nameSize).widthOfString(name) > CW) nameSize -= 1;
  display(doc, name, M, y, nameSize, th.fg, { width: CW });
  y += nameSize * CAP_H + 22;

  const verdict = clean(story?.verdict?.label || 'Your website report').toUpperCase();
  doc.font('black');
  let vSize = 100;
  while (vSize > 40 && doc.fontSize(vSize).widthOfString(verdict) > CW) vSize -= 1;
  line(doc, verdict, M, y - vSize * CAP_OFF, { font: 'black', size: vSize, color: C.green, width: CW });
  y += vSize * CAP_H + 18;

  const standfirst = ins?.headline || story?.verdict?.line || '';
  if (standfirst) {
    y += para(doc, standfirst, M, y, { font: 'reg', size: 12.5, width: span(10), lineGap: 3.5, color: th.sub, maxLines: 4 }) + 4;
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
  const targets = (data.search?.targets || []).filter(t => t.position != null);
  const cells = [];
  if (o) cells.push({ label: 'Visits', value: fmtBig(o.sessions), note: headlineNote(data, 'visits', o.sessions, po.sessions) });
  if (s) {
    cells.push({ label: 'Clicks from Google', value: fmtBig(s.clicks), note: headlineNote(data, 'clicks', s.clicks, ps.clicks) });
    cells.push({ label: 'Times shown on Google', value: fmtBig(s.impressions), note: headlineNote(data, 'shown', s.impressions, ps.impressions) });
  }
  if (targets.length) {
    const p1 = targets.filter(t => t.position <= 10.5).length;
    cells.push({ label: 'Key searches on page one', value: String(p1), unit: `of ${targets.length}`, hint: 'Positions 1 to 10' });
  }
  if (cells.length < 4 && s && s.position) {
    cells.push({ label: 'Average Google position', value: s.position.toFixed(1), note: moveNote(ps.position ? ps.position - s.position : null), hint: 'Lower is better' });
  }
  if (cells.length < 4 && data.uptime) {
    cells.push({ label: 'Website uptime', value: `${data.uptime.uptimePct}%`, hint: data.uptime.outages ? `${data.uptime.outages} outage${data.uptime.outages === 1 ? '' : 's'}` : 'No downtime' });
  }
  if (cells.length < 4 && o) cells.push({ label: 'Pages viewed', value: fmtBig(o.screenPageViews), note: change(o.screenPageViews, po.screenPageViews) });
  if (cells.length) {
    label(doc, 'The headline numbers', M, y, { color: th.fg, font: 'monoM' });
    label(doc, `Change is against ${period.prev}`, M + CW / 2, y, { color: th.faint, width: CW / 2, align: 'right' });
    y += 14;
    y = statRow(doc, th, M, y, CW, cells.slice(0, 4), { valueSize: 40 }) + 22;
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

  // The long view (or, without monthly history, the daily trend)
  const months = data.history?.months || [];
  const hasV = months.some(m => m.visits != null), hasC = months.some(m => m.clicks != null), hasI = months.some(m => m.impressions != null);
  const space = LIMIT - y - winsH - (wins.length ? 20 : 0);
  if (months.length >= 2 && (hasV || hasC) && space >= 110) {
    const h = Math.max(110, Math.min(176, space));
    label(doc, 'The long view', M, y, { color: th.fg, font: 'monoM' });
    label(doc, `Month by month${months.some(m => m.partial) ? ' // * part month so far' : ''}`, M + CW / 2, y, { color: th.faint, width: CW / 2, align: 'right' });
    hRule(doc, M, y + 13, CW, th.rule);
    const charts = [];
    if (hasV) charts.push(['visits', C.green, `Visits${data.history.visitsSource ? '' : ''}`]);
    if (hasC) charts.push(['clicks', C.cyan, 'Clicks from Google']);
    if (!hasV && hasI) charts.push(['impressions', C.green, 'Times shown on Google']);
    const cw = charts.length === 2 ? span(6) - 8 : CW;
    charts.slice(0, 2).forEach(([field, color, title], i) => {
      monthBars(doc, th, M + i * (span(6) + GUT + 8), y + 24, cw, h - 24, months, field, color, title, data);
    });
    y += h + 20;
  } else if (trusted && (data.ga4.timeseries || []).length > 2 && space >= 100) {
    const h = Math.max(100, Math.min(160, space));
    label(doc, 'Visits day by day', M, y, { color: th.fg, font: 'monoM' });
    hRule(doc, M, y + 13, CW, th.rule);
    dayChart(doc, th, M, y + 18, CW, h - 18, data.ga4.timeseries, C.green);
    y += h + 20;
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
  if (!actions.length && !watch.length && !ins?.summary) return y;

  y = opener(ctx, y, 'P200', 'Where we go from here', null, 160);
  if (ins?.summary) {
    y += para(doc, ins.summary, M, y + 4, { font: 'reg', size: 12, width: span(10), lineGap: 4, color: th.fg }) + 18;
  }

  if (actions.length) {
    y = room(ctx, y, 90);
    y = subhead(doc, th, M, y, CW, 'What we recommend next', 'Who it sits with');
    const textX = colX(1) + 6, textW = span(8) - 6;
    actions.forEach((a, i) => {
      const hT = paraH(doc, a.title, { font: 'semi', size: 12, width: textW, lineGap: 1.5 });
      const hD = paraH(doc, a.detail, { size: 9.5, width: textW, lineGap: 2.5 });
      const rowH = Math.max(40, hT + hD + 6) + 18;
      y = room(ctx, y, rowH);
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
      hRule(doc, M, y - 9, CW, th.rule, 0.5);
    });
    y += 6;
  }

  if (ins?.ask) {
    const h = paraH(doc, ins.ask, { font: 'med', size: 12, width: CW - 48, lineGap: 3 });
    y = room(ctx, y, h + 52);
    doc.rect(M, y, CW, h + 46).fill(C.ink);
    doc.rect(M + 18, y + 16, 6, 6).fill(C.yellow);
    label(doc, 'One thing from you', M + 30, y + 15.5, { color: C.yellow, font: 'monoM' });
    para(doc, ins.ask, M + 18, y + 30, { font: 'med', size: 12, width: CW - 48, lineGap: 3, color: C.white });
    y += h + 46 + 22;
  }

  if (watch.length) {
    const w2 = span(6) - 18;
    const itemH = w => paraH(doc, w.title, { font: 'semi', size: 10, width: w2, lineGap: 1.5 })
      + paraH(doc, w.detail, { size: 9, width: w2, lineGap: 2 }) + 4;
    const rowHs = [];
    for (let i = 0; i < watch.length; i += 2) rowHs.push(Math.max(itemH(watch[i]), watch[i + 1] ? itemH(watch[i + 1]) : 0) + 14);
    y = room(ctx, y, 24 + rowHs[0]);
    y = subhead(doc, th, M, y, CW, 'Worth watching', 'Not problems, just things we are keeping an eye on');
    for (let i = 0, r = 0; i < watch.length; i += 2, r++) {
      y = room(ctx, y, rowHs[r]);
      [watch[i], watch[i + 1]].forEach((w, k) => {
        if (!w) return;
        const x = k ? colX(6) + 4 : M;
        doc.rect(x + 0.5, y + 3.5, 5, 5).lineWidth(1).stroke(C.text);
        const h1 = para(doc, w.title, x + 16, y, { font: 'semi', size: 10, width: w2, lineGap: 1.5, color: th.fg });
        para(doc, w.detail, x + 16, y + h1 + 2, { size: 9, width: w2, lineGap: 2, color: th.sub });
      });
      y += rowHs[r];
    }
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
  const cells = [{ label: 'Visits', value: fmtBig(o.sessions), note: headlineNote(data, 'visits', o.sessions, p.sessions) }];
  if (ga.visitorsSameAsVisits === false) cells.push({ label: 'Visitors', value: fmtBig(o.totalUsers), note: change(o.totalUsers, p.totalUsers) });
  cells.push({ label: 'Pages viewed', value: fmtBig(o.screenPageViews), note: change(o.screenPageViews, p.screenPageViews) });
  if (o.newUsers != null) cells.push({ label: 'New visitors', value: fmtBig(o.newUsers), note: change(o.newUsers, p.newUsers) });
  else cells.push({ label: 'Pages per visit', value: ppv.toFixed(1), note: change(ppv, pppv) });
  cells.push({ label: 'Engaged visits', value: fmtPct(o.engagementRate * 100, 0), note: change(o.engagementRate, p.engagementRate) });
  cells.push({ label: 'Average visit', value: fmtDur(o.averageSessionDuration), note: change(o.averageSessionDuration, p.averageSessionDuration) });
  y = statRow(doc, th, M, y, CW, cells, { valueSize: cells.length > 5 ? 22 : 26 }) + 22;

  // Day by day
  if ((ga.timeseries || []).length > 1) {
    y = room(ctx, y, 172);
    y = subhead(doc, th, M, y, CW, 'Visits day by day', `${fmtInt(o.sessions)} in total`);
    dayChart(doc, th, M, y, CW, 126, ga.timeseries, C.greenInk);
    y += 134;
    const started = trackingStart(data);
    if (started) {
      doc.rect(M, y + 3, 5, 5).fill(C.yellow);
      y += para(doc, `Visitor tracking began on ${formatDate(started)}, so these figures cover from that date. They will build to a full picture over the coming weeks.`, M + 12, y, { size: 8.5, width: CW - 12, color: th.sub }) + 4;
    }
    y += 14;
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
    y = Math.max(yBars, yDev) + 20;
  }

  // Most viewed pages
  const pages = (ga.topPages || []).slice(0, 7);
  if (pages.length) {
    y = room(ctx, y, 40 + pages.length * 20);
    y = subhead(doc, th, M, y, CW, 'Most viewed pages');
    const maxViews = Math.max(...pages.map(r => r.views), 1);
    const nameW = CW - 250;
    y = table(doc, th, M, y, [
      { label: 'Page', width: nameW, draw: (r, x, ry, w) => {
        const title = r.title && r.title !== '(not set)' ? r.title : '';
        const name = r.path === '/' ? 'Homepage' : pageLabel(r.path, title);
        const used = line(doc, name, x, ry + 5.5, { font: 'semi', size: 9, color: th.fg, width: w * 0.62 });
        if (r.path && r.path !== '/') label(doc, r.path, x + used + 8, ry + 7.5, { color: th.quiet, width: w - used - 20, spacing: 0.2, upper: false, size: 6 });
      } },
      { label: '', width: 110, draw: (r, x, ry) => {
        doc.rect(x, ry + 7, 96, 6).fill(th.track);
        doc.rect(x, ry + 7, Math.max(2, (96 * r.views) / maxViews), 6).fill(C.greenInk);
      } },
      { label: 'Views', key: 'views', width: 70, align: 'right', font: 'semi', format: fmtInt },
      { label: 'Visits', key: 'sessions', width: 70, align: 'right', format: fmtInt },
    ], pages) + 20;
  }

  // Visits from AI assistants
  if (data.aiTraffic) {
    const ai = data.aiTraffic;
    y = room(ctx, y, 58);
    hRule(doc, M, y, CW, th.rule);
    doc.rect(M, y + 15, 6, 6).fill(C.cyan);
    label(doc, 'Visits from AI assistants', M + 12, y + 14.5, { color: th.fg, font: 'monoM' });
    label(doc, 'ChatGPT, Perplexity, Gemini, Copilot and others', M + CW / 2 - 40, y + 14.5, { color: th.faint, width: CW / 2 + 40, align: 'right' });
    const text = ai.visits > 0
      ? `${fmtInt(ai.visits)} visit${ai.visits === 1 ? '' : 's'}`
        + (ai.sharePct != null ? ` (${ai.sharePct}% of all visits)` : '')
        + ((ai.top || []).length ? `, from ${ai.top.map(t => `${t.source} ${fmtInt(t.visits)}`).join(', ')}` : '')
        + (ai.prevVisits != null && ai.prevVisits !== ai.visits ? `. ${cap(period.prev)}: ${fmtInt(ai.prevVisits)}.` : '.')
      : 'None recorded in this period, which is normal today. As more people search with AI tools, the visitors they send will show here.';
    line(doc, text, M, y + 31, { font: 'reg', size: 9.5, color: th.sub, width: CW });
    hRule(doc, M, y + 50, CW, th.rule);
    y += 50;
  }
  return y;
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
  const lx = x + w - pad - 168;
  doc.circle(lx + 3, y + 17.5, 3).fill(C.green);
  label(doc, 'Now', lx + 10, y + 14, { color: th.faint });
  doc.circle(lx + 48, y + 17.5, 2.6).lineWidth(0.9).stroke(th.faint);
  label(doc, 'Last period', lx + 55, y + 14, { color: th.faint });

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
    { label: 'Clicks from Google', value: fmtBig(s.clicks), note: headlineNote(data, 'clicks', s.clicks, p.clicks) },
    { label: 'Times shown on Google', value: fmtBig(s.impressions), note: headlineNote(data, 'shown', s.impressions, p.impressions) },
    { label: 'Click rate', value: fmtPct(s.ctr * 100), note: change(s.ctr, p.ctr), hint: 'Share who clicked' },
    { label: 'Average position', value: s.position ? s.position.toFixed(1) : 'n/a', note: moveNote(s.position && p.position ? p.position - s.position : null) },
  ]) + 22;

  const targets = sr.targets || [];
  if (targets.length) {
    const H = 62 + targets.length * 21 + 16;
    y = room(ctx, y, H + 30);
    y = ladder(doc, M, y, CW, targets) + 8;
    y += para(doc, 'These are the searches you have told us matter most. Position is the average across every search containing the phrase. "Not showing yet" means Google did not show the site for it in this period, which makes it a clear opportunity.', M, y, { size: 8, width: CW, color: th.quiet, lineGap: 1.5 }) + 16;
  }

  const queries = (sr.topQueries || []).slice(0, 8);
  if (queries.length) {
    y = room(ctx, y, 42 + queries.length * 20);
    y = subhead(doc, th, M, y, CW, 'The searches people found you with', 'Top by clicks');
    const mv = r => (r.positionChange == null ? (r.prevPosition == null ? { text: 'New', kind: 'up' } : null) : moveNote(r.positionChange));
    y = table(doc, th, M, y, [
      { label: 'Search', key: 'query', width: CW - 300, font: 'semi' },
      { label: 'Clicks', key: 'clicks', width: 56, align: 'right', format: fmtInt },
      { label: 'Times shown', key: 'impressions', width: 78, align: 'right', format: fmtInt },
      { label: 'Position', width: 82, align: 'right', draw: (r, x, ry, w) => {
        const on1 = r.position <= 10.5;
        line(doc, r.position.toFixed(1), x, ry + 5.5, { font: 'semi', size: 9, color: th.fg, width: w - 8 - (on1 ? 30 : 0), align: 'right' });
        if (on1) {
          doc.rect(x + w - 34, ry + 5, 26, 10.5).fill(C.green);
          label(doc, 'PG 1', x + w - 34, ry + 5 + (10.5 - 5.5 * MONO_H) / 2 - 5.5 * MONO_OFF, { font: 'monoM', size: 5.5, color: C.ink, width: 26, align: 'center', spacing: 0.3 });
        }
      } },
      { label: 'Movement', width: 84, align: 'right', draw: (r, x, ry, w) => {
        const m = mv(r);
        line(doc, m ? m.text : 'No earlier figure', x, ry + 5.5, { font: 'med', size: 8.5, color: m ? noteColor(th, m.kind) : th.quiet, width: w - 2, align: 'right' });
      } },
    ], queries) + 8;
    y += para(doc, 'Movement is places gained or lost on Google against the period before. "PG 1" marks a search where you appear on the first page.', M, y, { size: 8, width: CW, color: th.quiet, lineGap: 1.5 });
  }
  return y;
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
  if (cl && (cl.sessions > 0 || cl.daysCovered > 0)) {
    const pc = data.prevClarity && data.prevClarity.sessions > 0 ? data.prevClarity : null;
    const humans = cl.humanSessions != null ? cl.humanSessions : cl.sessions;
    const prevHumans = pc ? (pc.humanSessions != null ? pc.humanSessions : pc.sessions) : null;
    y = subhead(doc, th, M, y, CW, 'How people used the site', `Microsoft Clarity // ${cl.daysCovered} day${cl.daysCovered === 1 ? '' : 's'} measured`);
    y = statRow(doc, th, M, y - 9, CW, [
      { label: 'Visits watched', value: fmtBig(humans), note: pc ? change(humans, prevHumans) : null, hint: 'Real people, bots left out' },
      { label: 'How far they scrolled', value: cl.avgScrollDepth != null ? fmtPct(cl.avgScrollDepth, 0) : 'n/a', note: pc ? change(cl.avgScrollDepth, pc.avgScrollDepth) : null, hint: 'Average depth of page' },
      { label: 'Dead clicks', value: fmtBig(cl.deadClicks), note: pc ? change(cl.deadClicks, pc.deadClicks, { lowerIsBetter: true }) : null, hint: 'Lower is better' },
      { label: 'Frustrated clicks', value: fmtBig(cl.rageClicks), note: pc ? change(cl.rageClicks, pc.rageClicks, { lowerIsBetter: true }) : null, hint: 'Lower is better' },
    ]) + 8;
    y += para(doc, `A dead click is a click on something that did nothing. A frustrated click is rapid repeated clicking in one spot.${cl.quickBacks ? ` ${fmtInt(cl.quickBacks)} visitor${cl.quickBacks === 1 ? '' : 's'} left a page straight after arriving on it.` : ''}`, M, y, { size: 8, width: CW, color: th.quiet, lineGap: 1.5 }) + 20;
  } else if (cl) {
    y = noteBox(doc, y, 'Behaviour tracking', 'Microsoft Clarity is connected but has not recorded any visits for this period yet. Once it does, you will see how people use your pages here.') + 20;
  } else {
    y = noteBox(doc, y, 'Not connected yet', 'Microsoft Clarity is not connected for this site yet. Once it is, you will see how people actually use your pages: scrolling, clicks and signs of frustration.') + 20;
  }

  // Site health (Google PageSpeed, tested as a phone)
  if (hasScores) {
    y = room(ctx, y, 130);
    y = subhead(doc, th, M, y, CW, 'Site health check', 'Scored out of 100 by Google, tested as a phone');
    const grade = v => (v == null ? 'Not scored' : v >= 90 ? 'Excellent' : v >= 50 ? 'Room to improve' : 'Needs attention');
    const items = [
      ['Loading speed', sh.performance, 'How quickly pages appear'],
      ['Google friendliness', sh.seo, 'Built so Google can read it'],
      ['Built to best practice', sh.bestPractices, 'Modern, safe code'],
    ];
    const cw = CW / 3;
    items.forEach(([name, score, hint], i) => {
      const x = M + i * cw;
      if (i) vRule(doc, x, y + 2, y + 66, th.rule);
      ring(doc, th, x + (i ? 14 : 0) + 30, y + 34, 27, score);
      const tx = x + (i ? 14 : 0) + 72;
      line(doc, name, tx, y + 14, { font: 'semi', size: 10, color: th.fg, width: cw - 86 - (i ? 14 : 0) });
      line(doc, grade(score), tx, y + 29, { font: 'med', size: 8.5, color: score != null && score >= 90 ? th.up : th.sub, width: cw - 86 });
      line(doc, hint, tx, y + 42, { font: 'reg', size: 8, color: th.quiet, width: cw - 86 });
    });
    y += 72;
    hRule(doc, M, y, CW, th.rule);
    y += 22;
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
  const gH = glossary.reduce((a, [, d]) => a + Math.max(15, paraH(doc, d, { size: 8.5, width: gw - 120 }) + 3), 0);
  const blockH = 22 + Math.max(gH, sources.length * 15) + 18;
  const contactH = 64;
  const total = blockH + contactH + 20;

  if (y > TOP + 1) y += 26;
  if (y + total > LIMIT) y = newPage(ctx);
  // Sit the closing matter at the foot of the page when there is spare
  // room, so the last page ends on purpose rather than trailing off.
  const anchored = LIMIT - total + 4;
  if (anchored > y) y = Math.min(anchored, Math.max(y, anchored));

  const gx = M, sx = colX(7) + 8;
  let gy = subhead(doc, th, gx, y, gw, 'In plain words');
  glossary.forEach(([term, def]) => {
    line(doc, term, gx, gy, { font: 'semi', size: 8.5, color: th.fg, width: 112 });
    const h = para(doc, def, gx + 120, gy, { size: 8.5, width: gw - 120, color: th.sub });
    gy += Math.max(15, h + 3);
  });
  let sy = subhead(doc, th, sx, y, sw - 8, 'Where the numbers come from');
  sources.forEach(([what, where]) => {
    line(doc, what, sx, sy, { font: 'semi', size: 8.5, color: th.fg, width: 84 });
    line(doc, where, sx + 88, sy, { font: 'reg', size: 8.5, color: th.sub, width: sw - 8 - 88 });
    sy += 15;
  });
  y = Math.max(gy, sy) + 18;

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

export async function generateReportPdf(data) {
  const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 0, bufferPages: true, info: {
    Title: `Website report: ${clean(data.site.clientName)}`,
    Author: 'North Bear Media',
  } });
  // The font files are all cut from one variable font and still carry its
  // internal name. PDFKit files each loaded font under that name as well
  // as ours, so every weight would quietly resolve to whichever loaded
  // first. Loading each once and dropping the shared-name entry keeps
  // them distinct.
  for (const [name, file] of Object.entries(FONTS)) {
    doc.registerFont(name, join(FONT_DIR, file));
    doc.font(name);
    if (doc._font?.name && doc._fontFamilies) delete doc._fontFamilies[doc._font.name];
  }
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  const done = new Promise(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const ctx = { doc, data, tags: [], tag: 'P100' };
  summaryPage(ctx);

  ctx.tag = 'P200';
  let y = newPage(ctx);
  y = nextStepsSection(ctx, y);
  y = visitorsSection(ctx, y);
  y = googleSection(ctx, y);
  y = healthSection(ctx, y);
  closing(ctx, y);

  footers(ctx);
  doc.end();
  return done;
}
