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

## Notes

- The `<link rel="canonical">` / Open Graph / JSON-LD metadata still name
  `https://williscooper.com` — correct if you redeploy under that domain;
  adjust if hosting elsewhere.
- Fonts are limited to the Latin subsets the site actually uses.
