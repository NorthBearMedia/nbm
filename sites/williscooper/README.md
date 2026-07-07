# Willis Cooper — static site

A faithful, self-contained static rebuild of **williscooper.com** (Willis Cooper
Chartered Accountants, Belper), cloned from the live Hostinger Website Builder
site and converted into plain, hand-editable HTML.

All CSS, fonts and images are stored locally under `assets/`, so the site
renders offline with **no calls back to the Hostinger builder CDN**. The two
analytics tags (Google Analytics + Fathom) are deliberately kept exactly as on
the live site, so they still call out to Google/Fathom when the page is served
online — see "Analytics" below.

## Preview it

From this folder, start any static file server:

```bash
cd sites/williscooper
python3 -m http.server 8000
# then open http://localhost:8000/
```

Opening `index.html` directly with `file://` also works, but a local server is
recommended (some browsers restrict `iframe srcdoc` under `file://`).

## Structure

```
sites/williscooper/
├── index.html                 Home
├── about-us.html              About Us (contains #faq and #moraleofficers anchors)
├── our-services.html          Our Services
├── accounting.html            ┐
├── payroll.html               │
├── tax.html                   │
├── auditing.html              │ Service pages
├── finance.html               │
├── business-advice.html       │
├── research-and-development.html
├── cloud-accounting.html      ┘
├── meet-the-team.html         Meet the Team (photo grid)
├── testimonials.html          Testimonials
├── careers.html               Careers (Jotform application form — see below)
├── contact-us.html            Contact (form rewired to email — see below)
├── events.html                Events
├── taxcover.html              Tax investigation cover (has an enquiry form)
├── blog-list.html             Blog index
├── companies-house-director-verification.html   ┐
├── companies-house-fees-are-rising.html         │ Blog posts
├── from-trainee-to-chartered-accountant.html    │
├── bank-impersonation-scams.html                │
├── staffology-payroll-upgrade.html              ┘
├── privacy-policy.html        Privacy policy (embedded PDF viewer — see below)
└── assets/
    ├── css/     styles.*.css (site styles), cookieconsent.*.css, fonts.css
    ├── fonts/   Montserrat + Inter (woff2, latin/latin-ext)
    ├── images/  all photos, logos, illustrations, blog covers
    └── docs/    downloaded PDF leaflet(s)
```

Each page is one standalone HTML file that references the shared `assets/`.
Text, headings and image `src`s are plain HTML — edit them directly.

## What was changed from the live site

- **Contact form** (`contact-us.html`, and the enquiry form on `taxcover.html`)
  originally posted to Hostinger's form backend. That backend does not exist
  outside the builder, so the form is now wired to open the visitor's email
  client with a pre-filled message to **info@williscooper.com** (a small inline
  script at the bottom of those pages). To switch to a hosted form service
  instead (e.g. Formspree), give the `<form>` an `action="https://…"` and
  `method="POST"` and delete that inline script.
- **All assets localised.** Images, fonts and CSS that were served from
  `assets.zyrosite.com` / `cdn.zyrosite.com` (the builder CDN) and
  `images.unsplash.com` were downloaded into `assets/` and every reference
  rewritten to a relative local path. `srcset` variants were collapsed to a
  single local image per picture.
- **Builder runtime removed.** The Astro/Vue hydration bundles were stripped —
  the pages are now static HTML that needs no JavaScript to display.
- **Analytics kept exactly** (see below). Only the framework runtime was
  removed, not the tracking tags.
- **Internal links rewritten** from absolute builder URLs (`/about-us`, etc.)
  to local `*.html` files.

## Analytics

The site's analytics tags are copied verbatim onto every page, so tracking
continues to work unchanged when you redeploy:

- **Google Analytics 4** — `G-3P870GR1ZQ`. In each page `<head>`:
  the `gtag.js` loader (`https://www.googletagmanager.com/gtag/js?id=G-3P870GR1ZQ`)
  plus the standard inline `gtag('js', …)` / `gtag('config', 'G-3P870GR1ZQ')` snippet.
- **Fathom Analytics** — `data-site="GATBBBHW"`. In each page `<body>`:
  `<script src="https://cdn.usefathom.com/script.js" data-site="GATBBBHW" defer>`.

These are the only scripts that intentionally call external hosts. To change the
tracking IDs or remove analytics, edit those tags (they're plain `<script>` tags,
identical across all pages).

## Third-party embeds that need the internet

These are the client's own integrations (not the Hostinger builder). They are
kept exactly as on the live site and work once the site is deployed online, but
appear blank in a purely offline preview:

- **Facebook feed** on the home page (SociableKit widget).
- **Google Map** of the office on the contact page.
- **Job application form** on the careers page (Jotform).
- **Privacy policy** document on the privacy page (pdfhost.io viewer). If you'd
  prefer a fully local copy, drop the PDF into `assets/docs/` and point the
  embed at it.

## SEO

The static pages are tuned for search and social sharing:

- **`sitemap.xml`** (all 24 URLs) and **`robots.txt`** (allow-all + sitemap reference) at the site root.
- **Meta descriptions** on every page — unique, locally-worded (Belper / Derbyshire) copy added to the
  14 service/other pages that had none.
- **`og:image` / `twitter:image`** converted from relative paths to absolute `https://williscooper.com/…`
  URLs so link previews render on Facebook, LinkedIn, X, WhatsApp, etc.
- **One `<h1>` per page.** Pages whose hero heading was a styled `<h2>`/`<h3>` now carry a
  visually-hidden, descriptive `<h1>` (accessibility + SEO, no change to the visible design).
- **`alt` text** on images — descriptive alt for content images (logos, team, service and blog images),
  empty `alt=""` on decorative graphics.
- **LocalBusiness structured data** (`AccountingService` JSON-LD) on every page with the firm's name,
  address, phone, email and social profiles — important for local/Google Business visibility.
- **`robots` + `geo`** meta (`index, follow`, `GB-DBY`, Belper) added to each page.

If you redeploy under a different domain, update the absolute URLs in `sitemap.xml`, `robots.txt`,
the `og:image` tags, and the JSON-LD `url`/`@id` fields (all currently `https://williscooper.com`).

## AI SEO (answer engines / GEO)

Optimised to be found and cited by AI assistants and answer engines (ChatGPT, Claude,
Perplexity, Google AI Overviews, Bing Copilot):

- **`llms.txt`** and **`llms-full.txt`** at the site root — the emerging convention for giving
  LLMs a clean, markdown summary of the business: what the firm is, its services (with links and
  descriptions), location, contact details, and the full FAQ answers. `llms-full.txt` carries the
  fuller service and FAQ text for models that ingest it.
- **`FAQPage` structured data** on `about-us.html` — the six real client FAQs (Companies House
  filing, corporation tax, HMRC scam emails, self-assessment, etc.) marked up so engines can quote
  the answers directly.
- **`Service` structured data** on each of the eight service pages, each linked to the firm via the
  shared `AccountingService` `@id` — machine-readable descriptions of what's offered and where.
- **`AccountingService` / `LocalBusiness` entity** (from the SEO pass) gives assistants a confident,
  grounded entity: name, address, phone, email and social profiles.
- **AI-crawler rules in `robots.txt`** — GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot,
  anthropic-ai, PerplexityBot, Google-Extended, Applebot-Extended, CCBot and others are explicitly
  **allowed** so these engines can crawl and cite the site. If the firm would rather *not* be used
  for AI training/answers, change those groups to `Disallow: /`.

All structured data is plain JSON-LD in the page `<head>`/`<body>` — validate any page at
search.google.com/test/rich-results or schema.org's validator.

## Ranking on Google

Every on-page lever has been pulled. **On-page is necessary but not sufficient** — the items in the
"off-page" list below are what actually move a local firm up the rankings, and they're the owner's to do.

**Done on-page:**
- **Unique, keyword-rich, local `<title>` on every page** (the single biggest on-page factor) — e.g.
  "Accountants in Belper, Derbyshire | Willis Cooper", "Payroll Services in Belper, Derbyshire | Willis
  Cooper", "Xero Cloud Accounting in Belper | Willis Cooper". `og:title`/`twitter:title` match.
- **One keyword-relevant `<h1>` per page**, unique meta descriptions, clean canonicals.
- **`LocalBusiness` (`AccountingService`) schema** enriched with description, founding date (2000),
  `knowsAbout`, `hasMap`, and **`areaServed`** widened to Belper, Duffield, Ripley, Heanor, Alfreton,
  Ambergate, Milford, Derby, Amber Valley, Derbyshire and the East Midlands.
- **`Service` schema** per service page, **`FAQPage`** on About Us, **`BreadcrumbList`** on every inner
  page, plus the sitemap/robots from the SEO pass.
- **Core Web Vitals:** images optimised and resized (≤1600px) — total image weight cut from ~35 MB to
  ~15 MB, so pages load fast on mobile (a Google ranking + conversion factor).

**Target queries this positions the site for:** `accountants in belper`, `chartered accountants belper`,
`accountant belper derbyshire`, plus service+location combos (`payroll belper`, `tax accountant belper`,
`xero accountant belper/derbyshire`, `audit / bookkeeping / R&D tax relief derbyshire`) and the
surrounding towns above.

**Off-page — required to actually rank (owner actions, cannot be done in code):**
1. **Google Business Profile** — claim/verify the Belper listing; it drives the local "map pack" and is
   the #1 factor for `accountant belper`. Keep the name, address and phone identical to this site.
2. **Reviews** — collect Google reviews steadily; volume + recency strongly affect local ranking. (Once
   you have genuine reviews, we can add `Review`/`AggregateRating` schema — don't add it without real data.)
3. **Local citations** — consistent NAP on Yell, FreeIndex, the ICAEW "Find a Chartered Accountant"
   directory, Bing Places, Apple Maps, local Belper/Derbyshire directories.
4. **Backlinks** — from local business groups, the Chamber of Commerce, suppliers, clients, sponsorships.
5. **Fresh content** — keep publishing blog posts on the questions clients ask (the existing FAQ topics
   are a good seam); depth and freshness both help.
6. **Deploy on HTTPS** with a fast host and submit the sitemap in Google Search Console.

Realistic expectation: with a claimed Google Business Profile + reviews, ranking in the local pack for
"accountants in Belper" is very achievable; broad terms like "accountants Derby" are more competitive and
take backlinks and time.

## Notes

- The `<link rel="canonical">` / Open Graph / JSON-LD metadata still name
  `https://williscooper.com` — correct if you redeploy under that domain;
  adjust if hosting elsewhere.
- Fonts are limited to the Latin subsets the site actually uses.
