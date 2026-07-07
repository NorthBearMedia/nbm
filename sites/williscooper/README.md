# Willis Cooper — static site

A faithful, self-contained static rebuild of **williscooper.com** (Willis Cooper
Chartered Accountants, Belper), cloned from the live Hostinger Website Builder
site and converted into plain, hand-editable HTML.

Everything renders offline with **no calls back to the Hostinger builder or any
CDN** — all CSS, fonts and images are stored locally under `assets/`.

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
- **Builder runtime & tracking removed.** The Astro/Vue hydration bundles,
  Google Tag Manager, Google Analytics and Fathom analytics were stripped —
  the pages are now static HTML that needs no JavaScript to display.
- **Internal links rewritten** from absolute builder URLs (`/about-us`, etc.)
  to local `*.html` files.

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

## Notes

- The `<link rel="canonical">` / Open Graph / JSON-LD metadata still name
  `https://williscooper.com` — correct if you redeploy under that domain;
  adjust if hosting elsewhere.
- Fonts are limited to the Latin subsets the site actually uses.
