# Willis Cooper LIVE deploy report — 2026-07-29

Deployed branch `claude/deploy-williscooper-staging-qs5mz2` at commit
`7d70174` to williscooper.com (docroot
`/home/u275789987/domains/williscooper.com/public_html`, order 1005262292).

Build: `node sites/williscooper/make-staging.mjs /tmp/wc-live --production`
produced 25 HTML pages + 190 assets (215 files, ~38MB on disk). Uploaded as a
zip via Hostinger MCP deployStaticWebsite (dotfiles included), server cache
purged after. The deploy replaces the docroot contents, which also handled
the stale-file removal below.

## The five gotchas from the brief

1. `.htaccess` uploaded and ACTIVE — proven by behaviour, not just presence:
   trailing-slash 301, extensionless rewrites, gzip, security headers and the
   404 ErrorDocument all work (see below).
2. `assets/css/cookieconsent.CpXrOrr9.css` — GONE from the server (the deploy
   replaced the docroot; a filesystem-level check confirmed the file absent,
   and it now returns 404).
3. New files landed: `/404.html` (serves) and
   `/assets/docs/wc-privacy-policy.pdf` (200, application/pdf, 160,119 bytes).
4. Nothing else deleted.
5. Certificate checked BEFORE deploying (strict TLS fetch passed), so the
   force-HTTPS block is safe and live.

## Verification results (all measured, none assumed)

| Check | Result |
|---|---|
| https://williscooper.com/ valid cert | PASS (strict fetch 200) |
| http -> https 301 | PASS (`301 -> https://williscooper.com/`) |
| www -> non-www 301 | PASS (https://www 301 -> apex; http://www 301s to https://www then apex, two hops) |
| /about-us /our-services /meet-the-team /taxcover /privacy-policy | PASS (all 200) |
| /about-us/ trailing slash | PASS (301 -> /about-us) |
| /privacy-policy as page text | PASS (2,281 words of visible text, not a PDF viewer) |
| "Download this policy as a PDF" | PASS (PDF serves 200) |
| /events Completed badge + struck-through date | PASS (grey COMPLETED badge; "Wednesday 16th July 2026" renders line-through, verified computed style) |
| Footer (c) 2026 + "Unit 6, Heritage Business Centre" | PASS (both in served homepage) |
| Facebook feed not cut mid-sentence | PASS (12 posts, zero clipped elements; long posts show SociableKIT's own "Show more" control; post images still missing per the known SociableKIT cache issue, untouched as instructed) |
| /no-such-page branded 404 | PASS (404 status, title "Page not found | Willis Cooper") |
| Content-Encoding: gzip on HTML + CSS | PASS |
| X-Content-Type-Options / Strict-Transport-Security | PASS (nosniff; HSTS max-age=31536000; also Referrer-Policy + Permissions-Policy) |
| GA G-3P870GR1ZQ + Fathom GATBBBHW in source | PASS |
| CSS long-cache | PASS (max-age=31536000 + Expires 2027) |

## Notes for a human

- SociableKIT post images: still broken at their CDN (their cache for embed
  25656041). Fix is in the SociableKIT dashboard, not the site.
- wcpreview.northbearmedia.co.uk and its DNS A record can be torn down once
  Norton is happy live is stable (both were created 2026-07-27; see
  WILLIS-COOPER-PRESTAGE-STATUS.md cleanup section).
- HSTS is now cached by browsers for a year; if HTTPS ever has to come off,
  follow the comment in `.htaccess` (remove redirect + HSTS together) and
  expect stragglers.
- A transient self-deleting cleanup script (`nbm-tidy-*.php`) was used to
  confirm the stale CSS removal; verified deleted (404).


---

# Events page rebuilt — 2026-07-29 (second deploy)

Replaced the single hard-coded event on /events with a data-driven listing:
one uniform card per event, colour-coded by type, that greys itself out once
the date has passed.

**How it is built.** Events live in `sites/williscooper/events.json`;
`sites/williscooper/build-events.mjs` regenerates the cards and the
schema.org Event data inside events.html between marker comments. Full
instructions in `sites/williscooper/EVENTS.md`.

**Deliberately not JavaScript-dependent.** The cards are written into the page
as static HTML and past/upcoming is baked in at build time, so the listing
renders and is indexable with JS off — the failure mode that took the old
builder site down. The script only enhances: it re-checks dates on each visit
(so a card greys the morning after an event, with no redeploy) and powers the
filter and sort controls.

**Verified on the live site:** /events 200; H1 "Events & Workshops"; card
present with baked `is-past`; struck-through date; COMPLETED badge; Event
schema present; GA + Fathom intact; demo banner hidden. Filters, all four
sort modes, hide-past, and the empty state were exercised against a six-event
demo build locally (screenshots taken); no console errors on either build.
Internal files (`events.json`, `events.sample.json`, `build-events.mjs`,
`events-demo.html`) are excluded from `make-staging.mjs` and all 404 on the
live site. Homepage, about-us, our-services, meet-the-team, privacy-policy and
the 404 page all re-checked and unchanged.

**For a human:** the page currently shows one past event and a "nothing in the
diary" notice. That notice and the filter/sort bar appear and disappear on
their own as events are added — nothing to switch on.


---

# Events: Upcoming / Past sections + full diary — 2026-07-29 (third deploy)

Split the listing into **Upcoming events** and **Past events** sections, each
with its own heading and count, and loaded the real diary: 4 upcoming, 3 past.

New generator features (all optional, documented in EVENTS.md):
- `precision: "month"` — for "September 2026, date TBC". Prints the month only,
  and treats the **last day of that month** as the end date, so the event stays
  in Upcoming for the whole month instead of dropping out on the 2nd.
- `dateNote` — small italic note after the date ("date to be confirmed").
- `logo` / `logoAlt` — logo on the card. The two Xero drop-ins and the past
  Xero session use `assets/images/xero-logo.png`, resized to 128px from the
  official brand asset in Google Drive (01_Brand/Graphics/xero-logo-hires-RGB.png).
  Logos desaturate along with the rest of a past card.

Fixed along the way: the logo was being stretched to full card width — the card
body is a column flexbox, which stretches block children, so the logo now sets
`align-self:flex-start`.

**Verified on the live site:** /events 200; 4 upcoming + 3 past cards with the
past ones baked grey; 2 group sections; 5 logo references; 3 TBC notes; 7
schema.org Event entries; correct order (soonest upcoming first, most recent
past first); xero-logo.png serves (6,273 bytes). Filters (All / Drop-in /
Workshop), hide-past, all four sort modes and the section headings/counts
exercised locally on desktop and mobile with no console errors. events.json,
events.sample.json, build-events.mjs and events-demo.html all 404.

**For a human:** two events show "date to be confirmed" (MTD for Income Tax,
September; Payroll and Benefits, November) and the Autumn Xero Drop-In shows
"Time to be confirmed". Norton's internal note said the Autumn slot is either
10:00–12:00 or 14:00–16:00 — that was deliberately not published; swap
`timeLabel` once Emma confirms. Same for the two September/November dates:
replace `precision`/`dateNote` with the real date when known.

---

# Fixes — 2026-07-29 (fourth deploy)

**1. Events filters did nothing (reported by Norton).** The script set
`hidden` on filtered-out cards correctly, but `.wc-ev-card{display:flex}` in my
own CSS beat the browser's built-in `[hidden]{display:none}`, so every card
stayed on screen. My earlier check read the DOM attribute rather than what was
rendered, which is why it passed. Fixed section-wide with
`.wc-ev-section [hidden]{display:none!important}` so this cannot recur for any
element in the section. Verified on the live site by computed visibility, not
attributes: filtering to Workshop leaves 4 visible and 3 genuinely hidden.

**2. Homepage hero text ran underneath the dogs.** The two dog illustrations
sit in grid columns that overlap the subtitle's (2/5 and 6/9 vs 3/7) and their
widths are set in `vw`, so they grew into the text as the viewport widened —
worse on large screens. Capped both at 196px and held the subtitle to the clear
space between them (max-width 552px, centred, from 921px up; mobile stacks and
was unaffected). Measured live: 35px clearance left, 7px right.
Also removed the em-dash from the subtitle per Norton's house style — it now
reads as two sentences: "Chartered Accountants in Belper, Derbyshire.
Specialists in accounts, tax, payroll, VAT and business support."

**3. Facebook feed was 2,205px tall.** An earlier fix removed the height cap to
stop cards being sliced mid-sentence, which left all 12 posts stacked down the
page. Now trimmed to the first row only: a script inside the iframe measures the
first row, hides the rest and sets the masonry container height to match (the
widget positions posts absolutely inside a fixed inline height, so hiding cards
alone does nothing). Cards stay whole. Live height is now 888px, 3 posts shown.

## Needs Norton, cannot be fixed from the site

- **The feed has not updated since 18 February 2026.** SociableKIT's cached
  copy of the Facebook page stopped syncing five months ago; post images are
  broken for the same reason. Fixing it means re-syncing or reconnecting the
  page in the SociableKIT dashboard (embed id 25656041). Until then the
  homepage shows five-month-old posts — worth either fixing or hiding the
  section.
- **"Facebook Feed Widget by SociableKIT" now shows** under the posts. The
  widget writes `display:block !important` as an inline style, which no
  stylesheet can override. It was deliberately left alone rather than scripted
  around, since attribution is a licence condition on SociableKIT's free tier;
  it can be switched off properly in their dashboard on a paid plan.

---

# Hero + feed follow-up — 2026-07-29 (fifth/sixth deploy)

**Hero, properly diagnosed this time.** The tinted panels behind the hero text
are two fixed decorative rectangles (builder GridShapes `zg2wvz` and
`z3fiqe`). The subtitle's panel is **812 x 112px** — sized for the two-line
strapline the design was built around. The longer SEO subtitle added earlier
needed **five lines** once held clear of the dogs, so it overflowed the panel
and spilled onto the photograph. No font size fixed that: measured at 26px it
still overflowed by 65px.

Resolution: restored the subtitle to the strapline the panel fits —
"Specialists in accounts, tax, payroll, VAT and business support." — which
renders as 2 lines wholly inside the panel with 36px/7px clearance from the
dogs. Dogs stay capped at 196px; type scales with `clamp(20px, 2.1vw, 32px)`
so the fit holds as the viewport changes. The "Chartered Accountants in
Belper, Derbyshire" wording is dropped from the hero only; it remains in the
page title, meta description, H1 (Derbyshire), schema and footer, so the SEO
value is retained.

Known and out of scope: around 1000px wide the builder's fixed panels are too
small for their text and the **H1 overflows its own panel too** — pre-existing
behaviour of the export at tablet widths, not introduced here.

**Feed.** Norton re-synced SociableKIT: posts are current again (newest 27 July
2026) and images now load. Post photos came through at full height, making each
card very tall, so they are capped at 170px with `object-fit: cover`. Section
height is now **1,198px, three posts** (from 2,205px showing twelve stale ones).

---

# SEO pass — 2026-07-29 (seventh deploy)

Audited all 25 pages first. The earlier SEO work holds up well: unique titles
and descriptions within length, exactly one H1 per page, canonicals, Open
Graph and Twitter cards everywhere, BreadcrumbList/Service/Article/FAQPage
schema, every image carrying an alt attribute, a noindex 404, a sitemap
covering all 24 indexable URLs, and a robots.txt that explicitly welcomes AI
crawlers. Three real gaps remained.

**1. llms.txt had drifted from the pages.** 8 of 24 entries still carried the
old builder copy that the pages themselves had already moved past — including
the swapped Careers/Contact descriptions fixed earlier in HTML but never in
llms.txt (Careers was described as "Get in touch with Willis Cooper..."). All
8 are now regenerated from each page's real meta description. This matters
because robots.txt actively invites AI assistants and points them at llms.txt.

**2. No service catalogue in the organisation schema.** Added
`hasOfferCatalog` to the AccountingService block on all 25 pages, listing the
eight real services with descriptions, URLs, provider @id and area served.
Built from the actual service pages, so nothing is invented. All 85 JSON-LD
blocks re-validated as parseable afterwards.

**3. The five articles were near-orphans** with a single inbound link each
(the blog index), which buries them for readers and crawlers alike. Added a
styled "Related reading" block to 8 pages with contextual pairings only:
payroll -> Staffology; business-advice -> Companies House fees, director
verification, bank scams; accounting -> both Companies House pieces; tax ->
fees; finance -> bank scams; cloud-accounting -> Staffology; careers and
meet-the-team -> Jess's trainee-to-Chartered story. Re-audit shows no page
below 2 inbound internal links.

Verified live: all pages 200, 404 still 404, related-reading renders above the
footer, hasOfferCatalog and the corrected llms.txt served.

Note: the first deploy attempt returned a 500 from Hostinger's extract step.
The live site was checked immediately and was untouched and healthy (the
previous version still serving); a re-upload succeeded. Worth knowing that a
failed deploy leaves the old site intact rather than a half-written docroot.

## Left for Norton (need facts I should not invent)

- **`geo` coordinates and `priceRange`** are the two remaining local-SEO
  fields. Exact lat/long should come from the Google Business Profile rather
  than a guess, since a wrong pin actively hurts. priceRange is a commercial
  decision.
- **Thin pages:** home (208 words), contact-us (180), taxcover (214),
  meet-the-team (216), our-services (229). These would benefit from more copy,
  but that is a writing job about a real business, not something to auto-fill.
- **Google Business Profile** is the biggest remaining local-search lever and
  lives entirely outside the site.

---

# Location landing pages — 2026-07-29 (eighth deploy)

Five pages covering the towns around Belper, at `/accountants-in-<town>`:
Duffield, Ripley, Alfreton, Heanor and Derby. Generated from
`locations.json` by `build-locations.mjs`; how-to in `LOCATIONS.md`.

Each page reuses the real site shell (head, header nav, footer) lifted from an
existing page, so navigation and branding cannot drift, with location content
dropped in between. Per page: ~730 words, one H1, unique title (58-61 chars)
and meta description (156-162), correct canonical, Open Graph and Twitter
tags, and WebPage + BreadcrumbList + FAQPage + the shared AccountingService
schema. FAQs are real questions with FAQPage markup, so they are eligible for
rich results.

Wired in rather than left as orphans: added to sitemap.xml, given an "Areas we
cover" section in llms.txt, cross-linked between themselves, and linked from
the homepage, contact-us and our-services via a new "Areas we cover" block.

Caught before it stuck: the first generated FAQ said "the office is about 5
miles north east of Belper" (the office *is* in Belper) and repeated "We are
on Derby Road in Belper" twice in one answer. Reworded so the distance is
stated from the town's perspective.

## Honest limits, and what would make these much stronger

- Roughly 200 of the ~730 words per page are genuinely town-specific; the rest
  is shared scaffolding. That is defensible, but it is the number to watch.
  **A real client quote per town is the single biggest improvement available**
  and needs Willis Cooper to supply it.
- Nothing claims existing clients in any town, and no case studies, client
  counts or testimonials were invented. Local colour is limited to plainly
  verifiable geography.
- These pages support the map pack, they do not replace it. Google Business
  Profile and review volume remain the larger levers for local search.

---

# North Bear Media credit patch — 2026-07-29 (ninth deploy)

A woven clothing-tag credit below the footer on all 29 content pages, linking
to northbearmedia.co.uk in a new tab.

Built as CSS rather than an image so it stays crisp at any size: a dark panel
with a woven cross-hatch texture, a dashed inner border for stitching, inner
and outer shadows so it reads as raised, and a 0.75 degree tilt so it looks
sewn on rather than placed. On hover or keyboard focus it straightens, lifts
2px and a diagonal light sweep runs across it once (`nbm-shimmer`, 0.95s).
Verified firing on the live DOM, not just assumed from the CSS.

Logo: `assets/images/north-bear-media.png`, taken from the brand asset
"NBM Logo No BG Light Lines.png" in Drive, alpha-trimmed from 3000x3000 to
its bounding box and resized to 420x196 (30KB). The light-lines version is the
one that reads on a dark patch; the standard dark-line logo would have
disappeared.

Accessibility and performance: `rel="noopener"`, a descriptive aria-label
noting it opens in a new tab, a visible focus ring, the shimmer and tilt both
dropped under `prefers-reduced-motion`, and the logo lazy-loaded since it sits
below the fold.

Two things caught while checking rather than after: the logo was illegible at
30px because the brand mark is thin-stroked, so it went to 42px; and the 404
page centres its content with flexbox, which squashed the strip to 750px. The
404 has no footer, so the patch was removed from it entirely rather than
bodged.

Both generators preserve it: `build-events.mjs` only rewrites between markers,
and `build-locations.mjs` takes its shell from taxcover.html, which now
carries the patch.

Note for Norton: the link is a normal followed link, which is standard for an
agency credit. If Willis Cooper ever object to passing link equity, adding
rel="nofollow" is a one-line change.

---

# Event structured data — 2026-07-30 (tenth deploy)

Search Console flagged 5 non-critical Event improvements. Also worth noting:
this confirms **Search Console is verified and crawling the new site**, which
had been an open question after the domain move.

Fixed for all 7 events (verified live):
- **endDate** - from `endTime` where known (Summer Xero Drop-In now ends
  16:00, matching its published 2pm to 4pm), the month for month-precision
  events, otherwise the event's own day.
- **image** - defaults to the site's own Belper photograph; per-event override
  via `image`.
- **performer** - Willis Cooper as host Organization, plus named guest
  speakers. The IHT workshop now credits David Atack of B3 Wealth Management,
  which the page copy already stated.

**offers / validFrom: fixed only where the price is documented.** Just one
event (IHT and Pensions, "Free to attend") carries a cost, so only it gets an
Offer. The other six were deliberately left rather than assumed free: a
published price is a promise to whoever turns up, and Norton's source material
did not state one. Evidence points to free (the past events say so, and the
Facebook invite mentions no charge) but that needs confirming, after which it
is `"cost": "Free to attend"` per event and a rebuild.

Note: the scratchpad working copy was cleared mid-task. Everything had been
committed and pushed, so the repo was re-cloned from 435ff41 with no loss.

---

# Xero Gold Partner badges — 2026-07-30 (eleventh deploy)

Norton supplied Xero Gold Partner badges in
`Clients/Willis Cooper/01_Brand/Gold Xero/` (capsule, block, block-whiteout,
block-secondary, all vector PDF). This is a credential, not decoration, so it
replaces the plain Xero branding rather than sitting alongside it.

Converted with `pdftocairo -png -transp` (ImageMagick could not read the PDFs;
Ghostscript is not installed on this machine), trimmed and resized:
- `assets/images/xero-gold-partner.png` — capsule, 900x244, 33KB
- `assets/images/xero-gold-partner-block.png` — block, 600x600, 46KB

Placed:
- **Homepage partner strip** — the plain blue Xero circle is replaced by the
  Gold Partner block. Square-for-square so the layout is undisturbed.
- **Event cards** — the three Xero events now carry the capsule, which reads
  far better than a small square on a wide card.

Two bugs fixed in passing:
- The old Xero circle's alt text read **"Willis Cooper Chartered Accountants
  logo"**, which was wrong for both screen readers and image search. Now
  "Xero Gold Partner".
- The builder gives partner-logo slots `object-fit:cover` inside a 129x87 box,
  which sliced the top off a 1:1 badge. A scoped `object-fit:contain` rule
  letterboxes it instead. Caught by screenshotting rather than trusting the
  markup.

Verified live: 2 block refs on the homepage, 0 remaining references to the old
circle, 3 capsule refs on /events, both assets serving, corrected alt text and
the object-fit rule present.

## Available but unused

`Gold block - whiteout.pdf` (mono white, for dark backgrounds) and
`Gold block - secondary.pdf` are converted in scratch but not deployed. The
whiteout version would be the right choice if the badge is ever placed on the
navy footer or a dark hero.

Not done, worth considering: /cloud-accounting carries no Xero branding at
all, and it is the page where Gold Partner status is most persuasive. That
would be an addition rather than a swap, so it was left for a decision.

---

# Homepage service cards restyled — 2026-07-30 (twelfth deploy)

Rounded corners (16px), a soft drop shadow, and a whole-card lift-and-scale on
hover for the five service cards.

**Why it needed JS.** A "card" is not one element. The builder renders each as
four or five separate grid items sharing a column range: the coloured panel,
the heading, a rule, and the body text. Nothing wraps them, so there is no
element to round, shadow or scale. The panel itself is an SVG `<path>` with
`preserveAspectRatio="none"`, so rounding its geometry would give elliptical
corners; instead the radius and `overflow:hidden` go on the panel's container,
which clips the SVG to true circular corners.

The hover applies a class to every member of the card via a listener delegated
from `document`, and gives all members **one shared transform-origin** computed
from the card's combined bounding box. Without that, scaling four independent
boxes about their own centres makes the pieces drift apart instead of reading
as one card growing.

Gated behind `(hover:hover)` so touch devices do not get a stuck hover state,
and the scale is dropped under `prefers-reduced-motion`.

## Three traps found by testing rather than assuming

1. **The builder re-renders the section on resize**, discarding any classes or
   listeners bound to its elements. Hence delegation from `document` rather
   than per-element listeners.
2. **Inline styles change shape after hydration.** The shipped HTML has
   `--grid-row:2/10`; the builder's JS re-serialises it as
   `--grid-row: 2/10` with a space. The attribute selectors are doubled to
   match both, and the JS regexes are whitespace-tolerant. The first attempt
   silently styled nothing because of this.
3. **`</body>` appears twice on the homepage** — the first belongs to the
   Facebook iframe's `srcdoc` document. Inserting before the first occurrence
   put the script inside the iframe, where it ran against a DOM that has no
   cards and did nothing. It now goes before the last `</body>`.

Also needed `!important` on the hover transform: the static-build animation
fallback sets `transform:none !important` on `.transition` elements that never
received an active animation state.

Verified on the live page: 16px radius and shadow present, script in the main
document, hover applies to all members of a card with `scale(1.035)` and clears
on leave. All other pages still 200, 404 still 404.

---

# Search Console indexing report — 2026-08-10 (thirteenth deploy)

Norton forwarded a Coverage export. Scale first, because the email overstates
it: **5 URLs total** across three reasons, against 18 indexed pages and ~100
impressions a day. None of it was urgent.

The export is a summary and does not list URLs, so the affected addresses were
worked out by testing rather than read off. All 29 sitemap URLs return a clean
200 with zero redirects, so nothing submitted is broken; the flagged URLs were
discovered elsewhere.

**Not found (404) - 1 page. Fixed.** `/favicon.ico` was returning 404. Every
crawler requests it whether or not the HTML declares icons, and this site only
declared PNG icons. Generated a real multi-size `favicon.ico` (16/32/48/64,
32KB) from the Willis Cooper logo. Now returns 200 as `image/x-icon`.

**Page with redirect - 2 pages. No action needed.** These are the deliberate
canonical redirects: `http` to `https`, `www` to non-www, and trailing slash to
non-slash. All still verified working. Google reports redirected URLs as "not
indexed" because it indexes the destination instead, which is the intended
outcome.

**Crawled - currently not indexed - 2 pages.** Normal for recently published
pages. The location pages are days old and the site changed hosting a fortnight
ago. No action beyond waiting.

## Also tightened while in there

`.html` URLs served 200 alongside their clean equivalents, so every page had
two working addresses. Canonicals pointed at the clean one, but it wasted crawl
budget and risked Google picking the wrong address. Added a 301 from
`/page.html` to `/page` (and `/index.html` to `/`).

The rule matches on `THE_REQUEST`, the original request line, so the internal
extensionless-to-`.html` rewrite further down cannot re-trigger it and there is
no loop. That mattered: a mistake here breaks every URL on the site.

Intended to stage this on wcpreview first, but that site no longer exists in
Hostinger (the vhost answers 403; the API reports no such website). Deployed to
live with an immediate verification pass and a rollback ready instead.

Verified after deploy: all 29 sitemap URLs 200 with **zero** redirect hops (no
loops), `/about-us.html`, `/index.html`, `/taxcover.html` and `/events.html` all
301 to their clean forms, the branded 404 still returns a real 404, favicon 200,
and http/www/trailing-slash redirects all still correct. Assets, robots.txt,
sitemap.xml and llms.txt unaffected.

---

# New article: Summer VAT reduction — 2026-08-11 (fourteenth deploy)

Published Norton's copy at `/summer-vat-reduction-2026`. 1,193 words, one H1,
8 H2s, 3 H3s, bullet and numbered lists, published 10 August 2026, 5 min read.

Built from an existing article as the template so the blog header, byline and
meta block match the other posts exactly, with the head, canonical, Open Graph,
Twitter and Article/BreadcrumbList schema all rewritten for this piece. The
builder styles paragraphs but leaves headings and lists unstyled, and this post
leans on both, so it carries a scoped stylesheet for h2/h3/ul/ol in the site's
existing type and colours.

**Cover image.** The other posts each have their own, and there was no still
for this one. Norton had already produced a social video for this exact article
(`03_Video/Blog to video /VAT summer`), so a landscape band was cropped from a
frame above the burned-in caption, brightened to lift the video's darkening
overlay, and saved with 480/800 variants. Subject matter is a family walking
into a theme park, which fits the piece. **Worth checking the stock licence
covers still use as well as video**; easy to swap if not.

Wired in: card at the top of /blog-list, sitemap, llms.txt, and related-reading
links from tax, business-advice, cloud-accounting and accounting, so it has six
inbound links rather than launching as an orphan.

Copy is Norton's, reproduced faithfully. No em-dashes, per house style. No
figures, dates or claims were added; the piece states a temporary 5% rate from
25 June to 1 September 2026 and a return to normal treatment on 2 September.

Verified live: page 200 with the right title and schema, cover image serving,
`.html` form 301s to the clean URL, present in blog-list, sitemap and llms.txt,
and the rest of the site still healthy.
