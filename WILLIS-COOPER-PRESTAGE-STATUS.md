# Willis Cooper — pre-stage status (Step 2 of DEPLOY.md complete)

Pre-staged and verified on 2026-07-27 (morning, UK). The production build is live on a
temporary NBM-controlled subdomain, ready for the DNS cutover described in
`sites/williscooper/DEPLOY.md`.

## The three key facts

1. **Preview URL:** https://wcpreview.northbearmedia.co.uk/
   (HTTPS already valid; Let's Encrypt auto-issued on 2026-07-27)
2. **Hosting server IP (origin):** `31.170.164.41`
3. **Docroot:** `/home/u275789987/domains/wcpreview.northbearmedia.co.uk/public_html`

## Hosting details

- Hostinger WEB HOSTING plan (hostinger_business), order id `1005262292`,
  account username `u275789987`. NOT the Website Builder.
- `wcpreview.northbearmedia.co.uk` was created as a standalone **addon website**
  on that plan (created via API 2026-07-27 08:20 UTC), so the cutover
  "Change domain -> williscooper.com" step in DEPLOY.md applies to it directly.
- Deployed content: `make-staging.mjs --production` build of branch
  `claude/deploy-williscooper-staging-qs5mz2` at source commit `86ac6164`
  (24 HTML pages, 90 assets, verbatim copy: GA + Fathom on, indexable).
  Uploaded as a zip and extracted so `index.html` sits at the docroot root.

## DNS state (northbearmedia.co.uk zone)

- One additive A record was created this session:
  `wcpreview  A  31.170.164.41  TTL 300`. Nothing else in the zone was touched
  (www/ftp/ALIAS/TXT/MX all verified unchanged after the write).
- Note: Hostinger's authoritative DNS (dns-parking.com) serves **synthesized CDN
  answers** for hostnames attached to hosted websites, so public resolvers
  return CDN edge IPs (seen: 195.200.9.75 / 185.77.97.235) rather than the
  origin. This is normal for this account (every site on the plan is fronted
  the same way). The origin IP above is the one consistent with the account's
  `ftp` records across all its zones.
- **For the cutover email:** DEPLOY.md says give the IT team "<IP from hPanel>".
  Confirm the IP hPanel displays for this website at cutover time before
  sending; if hPanel shows the origin `31.170.164.41`, use that. Do not assume
  the CDN edge IPs are stable targets for an external zone's A record.

## Verification performed (2026-07-27)

- `https://wcpreview.northbearmedia.co.uk/` -> 200, title "Accountants in
  Belper, Derbyshire | Willis Cooper", byte size matches build exactly (122,941)
- `/accounting.html` -> 200, correct title
- `/assets/css/cookieconsent.CpXrOrr9.css` -> 200, text/css
- `/assets/docs/bee-tax-protect-mbh-leaflet_b-ad-2025-Yan04n6rb2IXKGV6.pdf` -> 200
- `/assets/images/1-lTSfwBiH0DlhYVHo.png` -> 200
- `/default.php` -> 404 (no hPanel placeholder files in the docroot; no sweep needed)
- Strict TLS fetch (no -k) -> 200, certificate valid
- HTTP -> HTTPS 301 redirect active at the server

Not yet done (manual click-through, per DEPLOY.md Step 2.3): meet-the-team
images in-page, careers Jotform embed, contact form opening a pre-filled email.
Automated checks above cover the underlying assets; a human pass in a browser
is still worth 2 minutes before cutover day.

## What the cutover session still does (DEPLOY.md Steps 1, 3, 4)

1. Send the TTL-drop email to Willis Cooper's IT team (template at the bottom
   of DEPLOY.md), at least 24-48h before the agreed switch time.
2. At cutover: release williscooper.com from the Builder site, Change domain on
   THIS website (wcpreview.northbearmedia.co.uk -> williscooper.com), IT flips
   the two A records, install SSL + Force HTTPS.
3. Verify per DEPLOY.md Step 4 (GA G-3P870GR1ZQ, Fathom GATBBBHW, robots meta
   index,follow, /robots.txt, /sitemap.xml).

## Cleanup after successful cutover (things created this session)

- The addon website `wcpreview.northbearmedia.co.uk` (it will have been renamed
  to williscooper.com by the Change-domain step, so likely nothing to delete;
  if the fallback "Add website fresh" path was used instead, delete the
  leftover wcpreview website).
- The `wcpreview` A record in the northbearmedia.co.uk zone (TTL 300, deletes
  cleanly; touch nothing else in that zone).

## Known content notes (unchanged from DEPLOY.md)

- Contact + taxcover forms are wired to mailto: info@williscooper.com (the
  Builder form backend does not exist on plain hosting). Wire up a hosted form
  before cutover if wanted.
- The preview serves the indexable production build. Nothing links to the
  preview URL and it is removed at cutover; if it lingers for weeks, consider
  tearing it down rather than leaving an indexable duplicate up.
