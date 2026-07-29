#!/usr/bin/env node
// Generate the location landing pages from locations.json.
//
//   node sites/williscooper/build-locations.mjs
//
// Each page reuses the real site shell (head, header nav, footer) taken from an
// existing page, so navigation and branding can never drift, and drops in
// location-specific content between them. The copy per town lives in
// locations.json and is deliberately distinct: near-identical location pages
// are doorway pages and Google filters them.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const DONOR = join(DIR, 'taxcover.html');
const SITE = 'https://williscooper.com';

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const donor = readFileSync(DONOR, 'utf8');

// --- split the shell -------------------------------------------------------
const OPEN = '<div class="page__blocks"><!--[-->';
const FOOT = '<section id="zSiG-O"';
const openAt = donor.indexOf(OPEN);
const footAt = donor.indexOf(FOOT);
if (openAt === -1 || footAt === -1) throw new Error('Could not find the shell split points in taxcover.html');
let head = donor.slice(0, openAt + OPEN.length);
const tailRaw = donor.slice(footAt);

// The shared organisation schema lives after the footer and is reused as-is.
// The donor's own WebPage (head) and BreadcrumbList (tail) are page-specific,
// so both are replaced per location.
head = head.replace(/<script type="application\/ld\+json">.*?<\/script>/gs, '');
const crumbInTail = [...tailRaw.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
  .find(m => m[1].includes('"@type":"BreadcrumbList"'));
if (!crumbInTail) throw new Error('Could not find the BreadcrumbList schema in the donor tail');

const SERVICES = [
  ['Accounts and bookkeeping', 'accounting', 'Year-end accounts, bookkeeping and management figures you can actually use.'],
  ['Tax', 'tax', 'Self assessment, corporation tax and VAT, handled properly and filed on time.'],
  ['Payroll', 'payroll', 'Payroll runs, RTI, CIS and auto-enrolment, off your desk entirely.'],
  ['Cloud accounting', 'cloud-accounting', 'Xero setup, migration and support, including Making Tax Digital.'],
  ['Business advice', 'business-advice', 'A straight answer before the decision, not after it.'],
  ['Audit', 'auditing', 'Independent statutory and voluntary audits where they are needed.'],
  ['R&D tax relief', 'research-and-development', 'Identifying and evidencing claims that stand up to scrutiny.'],
  ['Finance and funding', 'finance', 'Cash flow, forecasting and support raising finance.'],
];

const CSS = `<style>
/* North Bear: location landing pages. */
.wc-loc{--navy:#022733;--teal:#1a9b8f;--blue:#5fb8d9;--plum:#6b3a5e;--gold:#f0b042;--rose:#c23360;
  font-family:'Montserrat',system-ui,sans-serif;color:#2f3337;}
.wc-loc-wrap{max-width:1224px;margin:0 auto;padding:0 16px;}
.wc-loc-hero{background:var(--navy);color:#fff;padding:60px 0 56px;}
.wc-loc-bar{display:flex;gap:8px;max-width:240px;margin:0 0 20px;height:4px;}
.wc-loc-bar span{border-radius:2px}.wc-loc-bar i:nth-child(n){display:none}
.wc-loc-b1{flex:.7;background:var(--plum)}.wc-loc-b2{flex:1;background:var(--blue)}
.wc-loc-b3{flex:1;background:var(--teal)}.wc-loc-b4{flex:1;background:var(--gold)}
.wc-loc-b5{flex:.7;background:var(--rose)}
.wc-loc-h1{margin:0 0 16px;font-size:clamp(30px,4vw,46px);line-height:1.15;font-weight:700;}
.wc-loc-lede{margin:0 0 26px;max-width:70ch;font-size:17px;line-height:1.75;color:#dfe7ea;}
.wc-loc-cta{display:flex;flex-wrap:wrap;gap:12px;}
.wc-loc-btn{display:inline-flex;align-items:center;padding:12px 24px;border-radius:999px;font-size:15px;font-weight:700;text-decoration:none;border:1px solid transparent;transition:background .18s,color .18s;}
.wc-loc-btn--primary{background:var(--teal);color:#fff;}
.wc-loc-btn--primary:hover{background:#15887d;}
.wc-loc-btn--ghost{border-color:rgba(255,255,255,.45);color:#fff;}
.wc-loc-btn--ghost:hover{background:rgba(255,255,255,.12);}
.wc-loc-sec{padding:52px 0;}
.wc-loc-sec--alt{background:#f6f8f9;}
.wc-loc-h2{margin:0 0 18px;font-size:clamp(22px,2.4vw,30px);line-height:1.25;font-weight:700;color:var(--navy);}
.wc-loc-p{margin:0 0 16px;max-width:72ch;font-size:16px;line-height:1.75;color:#4b5563;}
.wc-loc-grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));margin-top:26px;}
.wc-loc-card{display:block;background:#fff;border:1px solid #e6e9ec;border-left:4px solid var(--teal);border-radius:10px;padding:18px 20px;text-decoration:none;transition:transform .18s,box-shadow .18s;}
.wc-loc-card:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(2,39,51,.08);}
.wc-loc-card-t{margin:0 0 6px;font-size:16px;font-weight:700;color:var(--navy);}
.wc-loc-card-d{margin:0;font-size:14px;line-height:1.6;color:#56585e;}
.wc-loc-faq{margin-top:24px;max-width:80ch;}
.wc-loc-q{margin:0 0 6px;font-size:16.5px;font-weight:700;color:var(--navy);}
.wc-loc-a{margin:0 0 22px;font-size:16px;line-height:1.75;color:#4b5563;}
.wc-loc-near{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px;}
.wc-loc-pill{display:inline-block;padding:9px 18px;border-radius:999px;border:1px solid #d7dde2;background:#fff;color:#41474d;font-size:14px;font-weight:600;text-decoration:none;transition:border-color .18s,color .18s;}
.wc-loc-pill:hover{border-color:var(--teal);color:var(--navy);}
.wc-loc-contact{background:var(--navy);color:#fff;padding:48px 0;}
.wc-loc-contact .wc-loc-h2{color:#fff;}
.wc-loc-contact a{color:#8fd4e8;}
@media (max-width:760px){.wc-loc-hero{padding:44px 0 40px}.wc-loc-sec{padding:38px 0}.wc-loc-grid{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){.wc-loc-card{transition:none}.wc-loc-card:hover{transform:none}}
</style>`;

const data = JSON.parse(readFileSync(join(DIR, 'locations.json'), 'utf8'));
const all = data.locations;

for (const loc of all) {
  const { slug, town, distance, direction, intro, localContext, journey, faqExtra } = loc;
  const url = `${SITE}/accountants-in-${slug}`;
  const title = `Accountants in ${town} | Willis Cooper Chartered Accountants`;
  const desc = `ICAEW Chartered Accountants ${distance} from ${town}. Accounts, tax, payroll, VAT and Xero support for ${town} businesses and individuals. Call 01773 881 045.`;

  const faqs = [
    { q: `Do I have to come to your office in Belper?`,
      a: `No. Most of what we do runs by email, phone and shared access to your Xero file, so plenty of clients rarely visit. The office is in Belper, ${distance} from ${town}, if you would rather meet in person, and we run free Xero drop-in sessions there through the year.` },
    { q: `How far is Willis Cooper from ${town}?`,
      a: `${town} is ${distance} ${direction}. Our office is Unit 6, Heritage Business Centre, Derby Road, Belper, DE56 1SW, open 8.30am to 5pm Monday to Thursday and 8.30am to 2pm on Friday.` },
    faqExtra,
    { q: `Do you work with sole traders as well as limited companies?`,
      a: `Yes. We act for limited companies, sole traders, partnerships, landlords and individuals, and we are just as happy with a first self assessment as with a group of companies.` },
  ];

  const others = all.filter(o => o.slug !== slug);

  const content = `<section class="wc-loc">
  <div class="wc-loc-hero">
    <div class="wc-loc-wrap">
      <div class="wc-loc-bar" aria-hidden="true"><span class="wc-loc-b1"></span><span class="wc-loc-b2"></span><span class="wc-loc-b3"></span><span class="wc-loc-b4"></span><span class="wc-loc-b5"></span></div>
      <h1 class="wc-loc-h1">Accountants in ${esc(town)}</h1>
      <p class="wc-loc-lede">${esc(intro)}</p>
      <div class="wc-loc-cta">
        <a class="wc-loc-btn wc-loc-btn--primary" href="/contact-us">Talk to us</a>
        <a class="wc-loc-btn wc-loc-btn--ghost" href="tel:+441773881045">01773 881 045</a>
      </div>
    </div>
  </div>

  <div class="wc-loc-sec">
    <div class="wc-loc-wrap">
      <h2 class="wc-loc-h2">Accountancy for ${esc(town)} businesses and individuals</h2>
      <p class="wc-loc-p">${esc(localContext)}</p>
      <p class="wc-loc-p">Willis Cooper has been advising businesses and individuals across Derbyshire and the East Midlands since 2000. We are ICAEW Chartered Accountants, which means the firm is regulated and our work is held to the institute's standards. Whatever you need handling, you deal with the same small team rather than a new name each time.</p>
      <div class="wc-loc-grid">
${SERVICES.map(([n, s, d]) => `        <a class="wc-loc-card" href="/${s}">
          <p class="wc-loc-card-t">${esc(n)}</p>
          <p class="wc-loc-card-d">${esc(d)}</p>
        </a>`).join('\n')}
      </div>
    </div>
  </div>

  <div class="wc-loc-sec wc-loc-sec--alt">
    <div class="wc-loc-wrap">
      <h2 class="wc-loc-h2">Getting to us from ${esc(town)}</h2>
      <p class="wc-loc-p">${esc(journey)}</p>
      <p class="wc-loc-p">Our office is Unit 6, Heritage Business Centre, Derby Road, Belper, DE56 1SW. We are open 8.30am to 5pm Monday to Thursday and 8.30am to 2pm on Friday. If it is easier to talk than to travel, call <a href="tel:+441773881045">01773 881 045</a> or email <a href="mailto:info@williscooper.com">info@williscooper.com</a>.</p>
      <h2 class="wc-loc-h2" style="margin-top:34px">Common questions from ${esc(town)}</h2>
      <div class="wc-loc-faq">
${faqs.map(f => `        <p class="wc-loc-q">${esc(f.q)}</p>\n        <p class="wc-loc-a">${esc(f.a)}</p>`).join('\n')}
      </div>
    </div>
  </div>

  <div class="wc-loc-sec">
    <div class="wc-loc-wrap">
      <h2 class="wc-loc-h2">Other areas we cover</h2>
      <p class="wc-loc-p">We work with clients across Amber Valley, Derbyshire and the wider East Midlands.</p>
      <div class="wc-loc-near">
        <a class="wc-loc-pill" href="/">Belper</a>
${others.map(o => `        <a class="wc-loc-pill" href="/accountants-in-${o.slug}">${esc(o.town)}</a>`).join('\n')}
        <a class="wc-loc-pill" href="/events">Events and workshops</a>
      </div>
    </div>
  </div>

  <div class="wc-loc-contact">
    <div class="wc-loc-wrap">
      <h2 class="wc-loc-h2">Thinking about changing accountants?</h2>
      <p class="wc-loc-p" style="color:#dfe7ea">Moving is more straightforward than most people expect: we handle the professional clearance and collect what we need from your previous accountant. Have a chat first and see whether we are a good fit.</p>
      <div class="wc-loc-cta">
        <a class="wc-loc-btn wc-loc-btn--primary" href="/contact-us">Get in touch</a>
        <a class="wc-loc-btn wc-loc-btn--ghost" href="/testimonials">Read what clients say</a>
      </div>
    </div>
  </div>
</section>`;

  const crumb = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: `Accountants in ${town}`, item: url },
    ],
  });
  const tail = tailRaw.replace(crumbInTail[1], crumb);

  const ld = [
    JSON.stringify({
      '@context': 'https://schema.org', '@type': 'WebPage',
      name: title, url, description: desc, inLanguage: 'en-GB',
      isPartOf: { '@type': 'WebSite', url: SITE + '/' },
      about: { '@id': SITE + '/#organization' },
    }),
    JSON.stringify({
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: faqs.map(f => ({
        '@type': 'Question', name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    }),
  ].map(b => `<script type="application/ld+json">${b}</script>`).join('');

  let page = head
    .replace(/<title>.*?<\/title>/s, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[\s\S]*?">/, `<meta name="description" content="${esc(desc)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`)
    .replace(/<meta content="[^"]*" property="og:url">/, `<meta content="${url}" property="og:url">`)
    .replace(/<meta content="[^"]*" property="og:title">/, `<meta content="${esc(title)}" property="og:title">`)
    .replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${esc(title)}">`)
    .replace(/<meta content="[^"]*" property="og:image:alt">/, `<meta content="${esc('Willis Cooper Chartered Accountants, Belper')}" property="og:image:alt">`)
    .replace(/<meta content="[^"]*" name="twitter:image:alt">/, `<meta content="${esc('Willis Cooper Chartered Accountants, Belper')}" name="twitter:image:alt">`)
    .replace(/<link[^>]*rel="alternate"[^>]*>/g, `<link rel="alternate" hreflang="x-default" href="${url}">`)
    .replace('</head>', ld + CSS + '</head>');

  // og:description / twitter:description are not in the donor head; add them.
  if (!/property="og:description"/.test(page)) {
    page = page.replace('</head>',
      `<meta content="${esc(desc)}" property="og:description"><meta name="twitter:description" content="${esc(desc)}"></head>`);
  }

  writeFileSync(join(DIR, `accountants-in-${slug}.html`), page + content + tail);
  console.log(`  accountants-in-${slug}.html  ${town}`);
}
console.log(`${all.length} location pages generated`);
