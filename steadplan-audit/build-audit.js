const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow,
  TableCell, WidthType, BorderStyle, ShadingType, LevelFormat, ImageRun, PageBreak,
  convertInchesToTwip,
} = require('docx');

const GREEN = '3EAF84';
const DARK = '151B25';
const GREY = '5A6572';
const LIGHT = 'F2F6F4';

const logo = fs.readFileSync('/tmp/claude-0/-home-user-nbm/93a7fe94-e487-5d20-a725-67f1bc85a609/scratchpad/nbm-logo-doc.png');

const bullets = { config: [{ reference: 'b', levels: [{ level: 0, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 200 } } } }] }] };

const P = (text, opts = {}) => new Paragraph({
  spacing: { after: 140, line: 276 },
  children: [new TextRun({ text, size: 21, color: '222222', ...opts.run })], ...opts.para,
});
const B = (text) => new Paragraph({
  numbering: { reference: 'b', level: 0 }, spacing: { after: 80, line: 264 },
  children: runs(text),
});
// **bold** inline support
function runs(text) {
  const parts = text.split('**');
  return parts.map((t, i) => new TextRun({ text: t, size: 21, color: '222222', bold: i % 2 === 1 }));
}
const PR = (text) => new Paragraph({ spacing: { after: 140, line: 276 }, children: runs(text) });

const H1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1, spacing: { before: 340, after: 160 },
  children: [new TextRun({ text, size: 32, bold: true, color: DARK })],
});
const H2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2, spacing: { before: 260, after: 120 },
  children: [new TextRun({ text, size: 25, bold: true, color: GREEN })],
});

const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const thin = { style: BorderStyle.SINGLE, size: 4, color: 'D8DEDA' };

function findingsTable(rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const head = new TableRow({
    tableHeader: true,
    children: rows[0].map((h, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: DARK },
      margins: { top: 80, bottom: 80, left: 110, right: 110 },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 19, color: 'FFFFFF' })] })],
    })),
  });
  const body = rows.slice(1).map((r, ri) => new TableRow({
    children: r.map((c, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: ri % 2 ? LIGHT : 'FFFFFF' },
      margins: { top: 70, bottom: 70, left: 110, right: 110 },
      children: [new Paragraph({ children: runs(c).map(tr => { tr.root; return tr; }) })],
    })),
  }));
  return new Table({
    columnWidths: widths, width: { size: total, type: WidthType.DXA },
    borders: { top: thin, bottom: thin, left: thin, right: thin, insideHorizontal: thin, insideVertical: thin },
    rows: [head, ...body],
  });
}

const gap = (h = 200) => new Paragraph({ spacing: { after: h }, children: [] });

const cover = [
  gap(1800),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: logo, transformation: { width: 300, height: 140 } })], spacing: { after: 600 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: 'STEADPLAN', size: 60, bold: true, color: DARK })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: 'SEO Audit & Growth Strategy', size: 34, color: GREEN, bold: true })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 1200 }, children: [new TextRun({ text: 'steadplan.co.uk', size: 22, color: GREY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: 'Prepared for Hal Jackson, Steadplan Group', size: 21, color: GREY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: 'North Bear Media  ·  August 2026', size: 21, color: GREY })] }),
  new Paragraph({ children: [new PageBreak()] }),
];

const exec = [
  H1('Executive summary'),
  PR('Steadplan’s website is a strong asset: a modern, well-designed site with a genuine vehicle showroom fed live from your stock system, clear service pages and a working enquiry pipeline. The foundation Hal described is real — our full crawl and code-level review confirms the structure is sound, every core page loads cleanly, and there is nothing that needs rebuilding.'),
  PR('What has held it back is maintenance and momentum, which matches your experience with the previous arrangement. We found a set of specific technical faults that have been quietly limiting Google’s view of the site — including a fault that puts **two competing page titles on every single page**, the **news section being hidden from Google entirely** (marked “noindex”), and vehicle pages whose titles **omit the make and model** (“MAN TGE” appears in the page but not in the title Google reads). None of these are visible to a visitor; all of them matter to a search engine.'),
  PR('The blog stopped in February 2026, which removed the main engine Holdens were relying on for organic growth. And the single biggest untapped opportunity is local: Steadplan trades from **Leeds, Rochdale and Burnley**, but the website has **no page for any of the three locations** — so Google has nothing to rank when local businesses search for a van dealer or commercial vehicle workshop near them.'),
  PR('The move to our hosting is complete and fully tested, which unblocks everything above: we now control the code and can fix, measure and publish at will. This document sets out exactly what we found, what has already been fixed during the move, and a 90-day plan in priority order. Everything listed maps to the Growth retainer deliverables agreed in June.'),
];

const doneAlready = [
  H1('Already done during the migration'),
  PR('The following was completed as part of moving the site to North Bear Media’s hosting, before this audit was issued:'),
  B('**Full site migration** to fast UK hosting under Steadplan/NBM control — files, database and vehicle stock integration verified working end-to-end on a private test link (all pages, showroom, vehicle pages, enquiry forms).'),
  B('**Server modernised**: PHP updated to the correct supported version, debug mode switched off (it was left on, writing errors to disk), and 85MB of accumulated log junk removed from the site.'),
  B('**Security tidy-up**: the previous host’s leftover configuration removed; firewall (Wordfence) re-pointed correctly so it protects the new server.'),
  B('**Meta Pixel installed** site-wide for Sam’s ad campaigns, so ad conversion tracking is ready the moment the domain switches.'),
  B('**Monitoring live**: Google Search Console and Analytics access is in place and already alerting (it flagged indexing errors on 18 July — addressed in the plan below).'),
  B('**Site credit updated** to North Bear Media.'),
];

const tech = [
  H1('Technical findings'),
  PR('Ordered by impact. “Fix” items are quick, definite wins; none require design changes.'),
  findingsTable([
    ['Finding', 'Why it matters', 'Priority'],
    ['Every page carries two title tags — the theme hardcodes a second, generic “Steadplan” title after the real one', 'The page title is the single strongest on-page signal; a duplicate makes Google pick unpredictably', 'Critical'],
    ['The News listing page is marked noindex, and a duplicate “Blog” page competes with it', 'Your blog — the content Holdens relied on for growth — has its index page hidden from Google', 'Critical'],
    ['Vehicle page titles and web addresses omit make & model (e.g. no “MAN TGE”)', 'Vehicle stock is invisible for the exact searches buyers use; this is the flagship keyword set', 'Critical'],
    ['Two pages fight over /showroom/ (a page and the vehicle archive share the same address)', 'Google gets an ambiguous answer for your most commercial page', 'High'],
    ['Old staging copy of the site still indexed by Google (flagged in June)', 'A duplicate of the whole site competes with the real one in search results', 'High'],
    ['Search Console reporting pages blocked by 4xx errors (18 July alerts)', 'Pages Google cannot fetch cannot rank; needs the error list working through', 'High'],
    ['No browser caching for CSS/JS (rules present but switched off) and no caching plugin', 'Slower repeat visits; page speed is a ranking and conversion factor', 'Medium'],
    ['Duplicate and render-blocking scripts in the page head; one library loaded from an unversioned third-party source', 'Wasted load time and a stability/security risk we don’t control', 'Medium'],
    ['/sitemap.xml returns “not found” (the real sitemap lives at a different address); one listed sitemap is empty', 'Minor crawl friction; easy tidy', 'Low'],
    ['Old config-file copies left in the web root by the previous developer', 'Server configuration files should never be publicly reachable — removing at go-live', 'Housekeeping'],
  ], [3600, 3800, 1300]),
  gap(120),
  PR('All “Critical” items are code-level fixes we can now make directly, since the site is on our hosting — the two-title fault is already fixed at the time of writing.'),
];

const content = [
  H1('Content findings'),
  H2('Blog'),
  PR('18 published articles, on a healthy monthly rhythm through 2025 — then nothing since **26 February 2026**. The content itself is good (MAN TGE guides, industry pieces, local angles), which makes the stall the problem, not the quality. Google rewards sites that keep publishing; five stale months is why organic growth flattened.'),
  H2('Page descriptions'),
  PR('Meta descriptions (the text Google shows under your listing) exist on **9 of 15 pages**, and on **none of the 18 blog posts or 30 vehicle pages**. Where they exist they are well-written; the gaps mean Google improvises your shop-window text for most of the site.'),
  H2('Images'),
  PR('Roughly **1 in 4 images** (76 of 298) has alt text — the description Google reads. Vehicle and conversion photography is a genuine strength of the site; most of it is currently invisible to image search.'),
  H2('Small tidy-ups'),
  B('The careers section’s Google title reads “Careers Archive” — a leftover technical default.'),
  B('One article has a broken web address (“/2565-2/” instead of a readable one).'),
  B('The homepage’s internal name is still “sample-page” — cosmetic, but worth fixing while we’re in.'),
];

const local = [
  H1('The local opportunity — Leeds, Rochdale, Burnley'),
  PR('This is the largest single gap. Steadplan operates from three sites across the north of England, but the website has **no dedicated page for any location** — the branches exist only as an address block in the footer. When someone in Leeds searches “van dealer Leeds” or a Rochdale operator searches “commercial vehicle servicing near me”, Google has no Steadplan page to show.'),
  PR('The fix is a proper landing page per branch — local team, services at that site, directions, opening hours, local stock — each connected to its **Google Business Profile**, which we’ll manage as part of the retainer (posts, photos, reviews, Q&A). Three well-built location pages plus active profiles is how a genuinely local business beats the national marketplaces in its own towns.'),
  H1('Vehicle pages & rich results'),
  PR('Each vehicle already has its own real page — which is excellent and unusual (many dealers have one JavaScript page Google can’t read). But the pages carry **no vehicle structured data**: the machine-readable price, mileage, make and model that lets Google show rich results. Adding Vehicle and AutoDealer markup, and putting make & model into titles and addresses, turns 30 stock pages into 30 search landing pages that refresh themselves every time stock updates.'),
];

const keywords = [
  H1('Keyword strategy — fight where we can win'),
  PR('We will not chase generic terms like “used vans for sale” — those results are owned by AutoTrader, eBay and Gumtree, and budget spent there is wasted. The strategy targets three groups Steadplan can genuinely own:'),
  B('**MAN TGE and model terms** — “MAN TGE dealer”, “new MAN TGE for sale”, “MAN TGE crew van”: high buying intent, thin competition, and Steadplan’s actual specialism.'),
  B('**Conversions and services** — “van conversions north west”, “fridge van conversion”, “commercial vehicle maintenance contract”, “van leasing 3–7 years”: service pages already exist and need targeting, depth and internal links.'),
  B('**Local terms × three towns** — “van dealer / van servicing / MAN dealer + Leeds / Rochdale / Burnley”: delivered by the location pages and Google Business Profiles above.'),
  PR('The blog restarts in service of these terms (two posts per month), and every vehicle page reinforces the model terms automatically once titles and markup are fixed.'),
];

const measure = [
  H1('Measurement — from visits to vans sold'),
  PR('Analytics (GA4) and Search Console are connected, and the Meta Pixel is installed for Sam’s campaigns. The next step is wiring **enquiry tracking**: every form submission and phone-number tap recorded as a conversion, attributed to the page and channel that produced it.'),
  PR('That gives us the numbers that matter: how many visitors it takes to produce an enquiry, and — with your close rates — how many enquiries it takes to sell a vehicle. Monthly reporting will show rankings and traffic, but it will be built around **enquiries and calls**, so you can judge the retainer on business produced, not graphs.'),
];

const roadmap = [
  H1('90-day roadmap'),
  findingsTable([
    ['When', 'Work', 'Outcome'],
    ['Weeks 1–2', 'Domain switch-over with full checks · remove staging site from Google · fix the 4xx indexing errors · two-title fault (done) · un-hide the news section · resolve the /showroom/ conflict · descriptions on the six missing pages', 'Clean, fully-indexable site on fast hosting; Search Console errors cleared'],
    ['Month 1', 'Vehicle titles & addresses carry make/model · Vehicle + AutoDealer structured data · speed pass (caching on, scripts tidied) · alt text across commercial pages', '30 stock pages become search landing pages; measurably faster site'],
    ['Month 2', 'Three location pages built (Leeds, Rochdale, Burnley) · Google Business Profiles optimised and actively managed · blog restarted at two posts/month against the keyword plan', 'Local visibility in all three towns; publishing momentum back'],
    ['Month 3', 'Link building (local press, industry directories, supplier partners) · enquiry tracking live in reports · first full ranking & enquiry report vs. this baseline', 'Authority building; results measured in enquiries, not just positions'],
  ], [1300, 4300, 3100]),
  gap(120),
  PR('From month 3 the retainer settles into its ongoing rhythm: content, local management, technical care and link building, reported monthly against enquiries. Paid spend can begin tapering as agreed once organic enquiries demonstrably replace it — that decision stays yours, made on the numbers.'),
  gap(200),
  new Paragraph({ spacing: { before: 300, after: 80 }, children: [new TextRun({ text: 'North Bear Media', bold: true, size: 22, color: DARK })] }),
  P('Norton Hunt · info@northbearmedia.co.uk · 07985 345 147 · northbearmedia.co.uk', { run: { color: GREY, size: 19 } }),
];

const doc = new Document({
  numbering: bullets,
  styles: { default: { document: { run: { font: 'Calibri' } } } },
  sections: [{
    properties: { page: { margin: { top: convertInchesToTwip(0.9), bottom: convertInchesToTwip(0.9), left: convertInchesToTwip(0.95), right: convertInchesToTwip(0.95) } } },
    children: [...cover, ...exec, ...doneAlready, ...tech, ...content, ...local, ...keywords, ...measure, ...roadmap],
  }],
});

Packer.toBuffer(doc).then(b => {
  fs.writeFileSync('/tmp/claude-0/-home-user-nbm/93a7fe94-e487-5d20-a725-67f1bc85a609/scratchpad/audit/Steadplan_SEO_Audit_NorthBearMedia.docx', b);
  console.log('written', b.length, 'bytes');
});
