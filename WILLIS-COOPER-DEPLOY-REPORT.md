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
