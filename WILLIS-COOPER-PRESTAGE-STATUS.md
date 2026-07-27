# Willis Cooper — pre-stage status (Step 2 of DEPLOY.md complete, site repaired)

Pre-staged, repaired and verified on 2026-07-27 (UK morning). The production
build is live on a temporary NBM-controlled subdomain, ready for the DNS
cutover described in `sites/williscooper/DEPLOY.md`.

## The three key facts

1. **Preview URL:** https://wcpreview.northbearmedia.co.uk/
   (HTTPS valid; Let's Encrypt auto-issued 2026-07-27)
2. **Hosting server IP (origin):** `31.170.164.41`
3. **Docroot:** `/home/u275789987/domains/wcpreview.northbearmedia.co.uk/public_html`

## URGENT context for the cutover email: live williscooper.com is BROKEN

Discovered 2026-07-27: the live Website Builder site serves HTML that
references `/_astro-1781615243579/` JS modules which now return **404 for
every visitor** (verified via plain curl). Result: hydration never runs, and
because the builder reveals text through entrance animations, **the live site
currently renders with no visible text anywhere** (hero, cards, footer, all
pages) — images and background colours only. Its cookie-consent CSS also
404s. This has nothing to do with our preview work; the builder's own asset
store dropped that build. It makes the cutover time-sensitive rather than
cosmetic. Consider telling the IT team plainly: the current site is broken
and the replacement is ready.

## Hosting details

- Hostinger WEB HOSTING plan (hostinger_business), order id `1005262292`,
  account username `u275789987`. NOT the Website Builder.
- `wcpreview.northbearmedia.co.uk` is a standalone **addon website** on that
  plan (created via API 2026-07-27 08:20 UTC), so DEPLOY.md's
  "Change domain -> williscooper.com" step applies to it directly.
- Content deployed via Hostinger MCP `deployStaticWebsite` (zip + extract),
  `index.html` at docroot root. Last deploy: 2026-07-27 ~10:01 UTC.
- Public DNS for the hostname resolves to Hostinger CDN edges (their
  authoritative DNS synthesises CDN answers for hosted vhosts); the origin is
  `31.170.164.41`. The CDN also optimises images (serves smaller variants) —
  first fetch of a cold asset can take a few seconds, then it is fast.
- **For the cutover email:** DEPLOY.md says give the IT team "<IP from
  hPanel>". Confirm what hPanel shows for this website at cutover time; do
  not assume the CDN edge IPs are stable A-record targets.

## DNS state (northbearmedia.co.uk zone)

- One additive A record created this session:
  `wcpreview  A  31.170.164.41  TTL 300`. Everything else verified unchanged
  (www/ftp/ALIAS/TXT/Google MX).

## Repairs made to the site source this session (branch, commit 2)

Norton reviewed the first deploy and flagged that the site must be a faithful
duplicate of williscooper.com. Comparing against live (DOM-level, since live
renders nothing) found four real defects, all now fixed in
`sites/williscooper/` and redeployed:

1. **Markdown fences on the homepage.** The Facebook "Latest Updates" section
   (a builder GridEmbed with the custom code in the iframe `srcdoc`) had
   literal ```` ```html ```` and ```` ``` ```` lines pasted in with the
   snippet — they rendered as visible text. Present on live too (the snippet
   was pasted into the builder with its fences in Feb). Removed.
2. **Dead images in the Facebook widget.** SociableKIT (embed id `25656041`)
   serves its cached Facebook images from `images.sociablekit.com`, and that
   cache is dead — every avatar and post image 404s (some show SociableKIT's
   own sk-404 fallback). Same breakage exists wherever the widget runs,
   including live-when-working. Added CSS+JS inside the embed that hides any
   image that fails (and its `.sk-post-userpic` / `.sk-header-picture`
   circle), so cards render clean text-only. Self-healing: if SociableKIT's
   cache is refreshed, images reappear. Proper fix for later: log into
   SociableKIT and refresh/upgrade the embed cache.
3. **Below-the-fold content invisible on every page.** The clone captured
   builder entrance-animation states; elements below the fold at capture time
   never got `data-animation-state="active"`, and with no builder JS they sat
   at opacity 0 forever (14–42 elements per page — footers, whole sections,
   the our-services cards). Fixed with a scoped override appended to
   `assets/css/styles.CCLqI5Bj.css` (forces the revealed end-state only for
   elements without the active marker; stylesheet link cache-busted to
   `?v=2`). Note: the static site shows content immediately, without the
   scroll-in animations live had — expected for the static rebuild.
4. **Internal links didn't match live's URL scheme.** Live uses extensionless
   URLs (`/about-us`); the clone linked `about-us.html` while its canonicals
   and sitemap already used the extensionless form. Rewrote all 1,125
   internal hrefs to extensionless and added `.htaccess` (in the site source,
   deploys with the build) that maps `/about-us` -> `about-us.html`. Both URL
   forms serve; the visible scheme now matches live exactly.
5. **Mobile hamburger menu was dead.** The burger button relied on the
   builder runtime; on the static site it did nothing, leaving mobile
   visitors with no navigation. Added a small toggle script to all 24 pages
   that drives the builder's own state classes (`burger--open`,
   `block-header-layout-mobile__dropdown--open`), closes on link tap and
   Escape, and sets aria-expanded. Submenu carets (mobile) are CSS
   checkbox-based and desktop dropdowns are CSS :hover — both work natively.
6. **Mailto subject em-dash** swapped for a plain hyphen in the contact and
   taxcover form handlers ("Website enquiry - Willis Cooper").
7. **Mobile performance pass (desktop untouched).** 47 images over 120KB got
   480/800/1200-width variants (generated with sips, jpg quality 78; 99 new
   files under assets/images, named `<base>-wNNN.<ext>`) and 92 `<img>` tags
   gained `srcset` — the original file stays in `src` and as the largest
   candidate, so desktop picks the same full-quality images and the design
   is pixel-identical. Phones now pull e.g. 87KB instead of 543KB per team
   photo (before the CDN's webp pass). Preconnect hints added for
   googletagmanager/usefathom (all pages), sociablekit (home), jotform
   (careers). `.variant-manifest.json` records what was generated and is
   excluded from builds via make-staging SKIP. All variant URLs pre-warmed
   through the CDN. Verified: mobile (375px, DPR 2) picks -w800 team photos
   and -w480/-w800 elsewhere; desktop (1280px) picks originals for the hero
   and full-size card photos, screenshots confirmed unchanged.

## Verification performed (2026-07-27, after repairs)

- Homepage: hero text + both dog illustrations, five colour cards, dog +
  partner-logo strip, Latest Updates (12 posts, no fences, no broken images,
  no empty avatar circles), full footer (social icons, logo, address,
  colour stripe). Browser-rendered and screenshot-checked.
- `/about-us` (43 animated elements, 0 hidden), `/our-services` (all 8
  service cards with photos), `/meet-the-team` (26/26 team images, embed
  fine), `/careers` (Jotform application form loads live),
  `/contact-us` (form present, submit builds
  `mailto:info@williscooper.com?subject=...`).
- Extensionless URLs 200 with correct titles; HTTP->HTTPS 301; strict TLS ok.
- Full-site text fidelity sweep (all 24 pages, live DOM vs preview): the only
  differences are (a) deliberate SEO title/H1 rewrites — including fixing
  live's swapped Careers/Contact titles — and (b) content live cannot render
  because its JS is dead (blog list, team grid, privacy text, FB section),
  all of which the preview renders correctly.
- Full crawl audit (second pass): all 24 pages 200 on both sites; all 23
  unique internal link targets 200; all 144 fragment links have their anchor
  ids; all 85 referenced local assets (incl. font files from fonts.css) 200;
  robots.txt/sitemap.xml/llms.txt 200; trailing-slash URLs work; unknown
  paths 404 correctly; /favicon.ico 404s on BOTH sites (both use the
  <link rel=icon> PNGs, which serve fine). Client Login points at
  https://www.irisopenspace.co.uk/ on both. External link sets are identical
  (the taxcover PDF is intentionally localised instead of the builder's
  assets.zyrosite.com copy, which dies post-cutover). Mobile: hamburger menu
  opens/navigates/closes, submenu expands, contact form renders and its
  submit dry-run executes cleanly (4 fields -> pre-filled mailto).
- Note on analytics parity: live's raw HTML carries GA/Fathom on only 10 of
  24 pages — the rest were injected at runtime by the (now dead) builder JS.
  The preview carries both tags baked into all 24 pages, matching the
  working site's effective behaviour.

## Known gaps / decisions for Norton or the cutover session

- **Cookie consent:** live-working had a cookie-consent flow (builder
  runtime). The static rebuild loads GA + Fathom unconditionally and shows no
  consent banner. Needs a consent solution (or a decision to accept as-is)
  before or shortly after cutover.
- **Title tags** differ from live deliberately (SEO rewrites baked into the
  rebuild, consistent with its sitemap/llms.txt work). If a strict duplicate
  is ever wanted instead, titles are the only user-visible head difference.
- **SociableKIT cache** (see repair 2) — refresh via their dashboard to bring
  post/avatar images back.
- **Entrance animations** do not run on the static site (content is simply
  visible). Acceptable for cutover; would need a small scroll-reveal script
  if the animated feel is wanted back.

## What the cutover session still does (DEPLOY.md Steps 1, 3, 4)

1. Send the TTL-drop email (template in DEPLOY.md) — consider adding the
   "live site is currently broken" context above.
2. At cutover: release williscooper.com from the Builder, Change domain on
   THIS website, IT flips the two A records, install SSL + Force HTTPS.
3. Verify per DEPLOY.md Step 4 (GA `G-3P870GR1ZQ`, Fathom `GATBBBHW`,
   robots meta, /robots.txt, /sitemap.xml — and now also that extensionless
   URLs serve via the shipped .htaccess).

## Cleanup after successful cutover (created this session)

- The addon website `wcpreview.northbearmedia.co.uk` (renamed to
  williscooper.com by the Change-domain step, so likely nothing to delete; if
  the fallback "Add website fresh" path was used, delete the leftover
  wcpreview website).
- The `wcpreview` A record in the northbearmedia.co.uk zone (touch nothing
  else in that zone).
