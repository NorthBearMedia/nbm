#!/usr/bin/env node
// Regenerate the events listing inside events.html from events.json.
//
//   node sites/williscooper/build-events.mjs                  # real events
//   node sites/williscooper/build-events.mjs events.sample.json --out demo.html
//
// Why a generator: the event cards are written into events.html as plain
// static HTML, so they render (and are indexed) without JavaScript — the whole
// reason this site was rebuilt was a JS-dependent page that went blank. JS on
// the page only *enhances*: it re-checks which events have passed, and powers
// the filter/sort controls.
//
// Past/upcoming is decided here at build time AND again in the browser on each
// visit, so a card greys itself the day after its event without a redeploy.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const OUT_NAME = outFlag !== -1 ? args[outFlag + 1] : 'events.html';
const DATA_NAME = args.find((a, i) => !a.startsWith('--') && i !== outFlag + 1) || 'events.json';

const DATA_PATH = resolve(DIR, DATA_NAME);
const PAGE_PATH = join(DIR, 'events.html');
const OUT_PATH = join(DIR, OUT_NAME);
const IS_DEMO = /sample|demo/i.test(DATA_NAME);

const ACCENTS = new Set(['teal', 'blue', 'plum', 'gold', 'rose']);
const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// Today at midnight — an event is "past" only once its whole day is over.
const today = new Date();
today.setHours(0, 0, 0, 0);

const parseDay = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return d;
};

const LONG = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
const fmtDate = d => d.toLocaleDateString('en-GB', LONG);

const raw = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
const list = Array.isArray(raw) ? raw : raw.events;
if (!Array.isArray(list)) throw new Error(`${DATA_NAME}: expected an "events" array`);

const events = list.map((e, i) => {
  for (const field of ['title', 'type', 'date']) {
    if (!e[field]) throw new Error(`Event ${i + 1} (${e.title || 'untitled'}) is missing "${field}"`);
  }
  const start = parseDay(e.date);
  if (!start) throw new Error(`Event "${e.title}": date must be YYYY-MM-DD, got "${e.date}"`);
  const end = parseDay(e.endDate) || start;
  if (e.accent && !ACCENTS.has(e.accent)) {
    throw new Error(`Event "${e.title}": accent must be one of ${[...ACCENTS].join(', ')}`);
  }
  return { ...e, start, end, isPast: end < today, accent: e.accent || 'blue' };
});

// Upcoming first (soonest at the top), then past (most recent first). The
// browser re-applies this same order, so it stays right as dates roll past.
events.sort((a, b) =>
  a.isPast !== b.isPast ? (a.isPast ? 1 : -1)
    : a.isPast ? b.start - a.start : a.start - b.start);

const icon = {
  date: '<path d="M7 2v3M17 2v3M3.5 9h17M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5Z"/>',
  time: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
  place: '<path d="M12 21s6.5-5.6 6.5-10.4A6.5 6.5 0 0 0 5.5 10.6C5.5 15.4 12 21 12 21Z"/><circle cx="12" cy="10.5" r="2.4"/>',
  cost: '<circle cx="12" cy="12" r="8.5"/><path d="M14.6 9.3a3 3 0 0 0-5.1 2.1c0 2.6 5.2 2 5.2 4.3a3 3 0 0 1-5.2 1.4M12 6.6v10.8"/>',
};

const fact = (kind, label, valueHtml) => valueHtml
  ? `<div class="wc-ev-fact"><svg class="wc-ev-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icon[kind]}</svg>`
    + `<span class="wc-ev-fact-label">${esc(label)}</span><span class="wc-ev-fact-value">${valueHtml}</span></div>`
  : '';

const card = e => {
  const dateHtml = `<time datetime="${esc(e.date)}">${esc(fmtDate(e.start))}</time>`
    + (e.endDate && e.endDate !== e.date ? ` – <time datetime="${esc(e.endDate)}">${esc(fmtDate(e.end))}</time>` : '');
  const ctaLabel = e.isPast ? (e.pastCtaLabel || 'Ask about the next one') : (e.ctaLabel || 'Register your interest');

  return `        <article class="wc-ev-card${e.isPast ? ' is-past' : ''}" data-type="${esc(e.type)}" data-accent="${esc(e.accent)}" data-date="${esc(e.date)}" data-end="${esc(e.endDate || e.date)}"${e.id ? ` id="event-${esc(e.id)}"` : ''}>
          <p class="wc-ev-stripe" aria-hidden="true"></p>
          <div class="wc-ev-body">
            <div class="wc-ev-top">
              <span class="wc-ev-type">${esc(e.type)}</span>
              <span class="wc-ev-badge" data-upcoming="Upcoming" data-past="Completed">${e.isPast ? 'Completed' : 'Upcoming'}</span>
            </div>
            <h2 class="wc-ev-title">${esc(e.title)}</h2>
            <div class="wc-ev-facts">
${[fact('date', 'Date', dateHtml),
    fact('time', 'Time', e.timeLabel ? esc(e.timeLabel) : ''),
    fact('place', 'Location', e.location ? esc(e.location) : ''),
    fact('cost', 'Cost', e.cost ? esc(e.cost) : '')].filter(Boolean).map(s => '              ' + s).join('\n')}
            </div>
${e.description ? `            <p class="wc-ev-desc"${e.isPast && e.pastNote ? ' hidden' : ''}>${esc(e.description)}</p>\n` : ''}${e.pastNote ? `            <p class="wc-ev-note"${e.isPast ? '' : ' hidden'}>${esc(e.pastNote)}</p>\n` : ''}            <a class="wc-ev-cta" href="${esc(e.ctaUrl || '/contact-us')}" data-upcoming="${esc(e.ctaLabel || 'Register your interest')}" data-past="${esc(e.pastCtaLabel || 'Ask about the next one')}">${esc(ctaLabel)}</a>
          </div>
        </article>`;
};

const cardsHtml = events.map(card).join('\n');

const ldJson = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Events and workshops from Willis Cooper Chartered Accountants',
  itemListElement: events.map((e, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'Event',
      name: e.title,
      startDate: e.startTime ? `${e.date}T${e.startTime}` : e.date,
      ...(e.endDate ? { endDate: e.endDate } : {}),
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      ...(e.description ? { description: e.description } : {}),
      ...(e.id ? { url: `https://williscooper.com/events#event-${e.id}` } : {}),
      location: {
        '@type': 'Place',
        name: 'Willis Cooper Chartered Accountants',
        address: {
          '@type': 'PostalAddress',
          streetAddress: 'Unit 6, Heritage Business Centre, Derby Road',
          addressLocality: 'Belper', addressRegion: 'Derbyshire',
          postalCode: 'DE56 1SW', addressCountry: 'GB',
        },
      },
      organizer: { '@type': 'Organization', name: 'Willis Cooper Chartered Accountants', url: 'https://williscooper.com/' },
      ...(/free/i.test(e.cost || '')
        ? { offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP', availability: 'https://schema.org/InStock', url: 'https://williscooper.com/events' } }
        : {}),
    },
  })),
});

const between = (html, marker, body) => {
  const start = `<!-- ${marker}:START -->`;
  const end = `<!-- ${marker}:END -->`;
  const i = html.indexOf(start);
  const j = html.indexOf(end);
  if (i === -1 || j === -1) throw new Error(`events.html is missing the ${marker} markers — has the section been overwritten?`);
  return html.slice(0, i + start.length) + '\n' + body + '\n' + html.slice(j);
};

let page = readFileSync(PAGE_PATH, 'utf8');
page = between(page, 'WC-EVENTS', cardsHtml);
page = between(page, 'WC-EVENTS-LD', `<script type="application/ld+json">${ldJson}</script>`);
page = page.replace(/<p class="wc-ev-demo"[^>]*>/,
  IS_DEMO ? '<p class="wc-ev-demo">' : '<p class="wc-ev-demo" hidden>');

const upcoming = events.filter(e => !e.isPast).length;

// Bake the "nothing in the diary" notice so it is right with JS off too.
page = page.replace(/<p class="wc-ev-noupcoming"[^>]*>/,
  upcoming === 0 ? '<p class="wc-ev-noupcoming">' : '<p class="wc-ev-noupcoming" hidden>');

writeFileSync(OUT_PATH, page);
console.log(`${OUT_NAME} updated from ${DATA_NAME}${IS_DEMO ? '  [DEMO DATA — never deploy this]' : ''}`);
console.log(`  events: ${events.length}  (${upcoming} upcoming, ${events.length - upcoming} past)`);
for (const e of events) console.log(`   ${e.isPast ? 'past    ' : 'upcoming'}  ${e.date}  ${e.type.padEnd(12)} ${e.title}`);
