# Deploying Willis Cooper to `new.williscooper.com` (staging)

This deploys a **staging** copy of the static site to the subdomain
`new.williscooper.com`. It never touches the live `williscooper.com` site.

## What "staging-safe" means here

The files under `sites/williscooper/` are a faithful clone of the **live**
site, so they still carry the live Google Analytics (`G-3P870GR1ZQ`) and
Fathom (`GATBBBHW`) tags and `robots=index`. Serving that verbatim on a public
URL would (a) pump test traffic into your live analytics and (b) let Google
index a duplicate of the live site.

So we don't deploy the raw source. `make-staging.mjs` produces a copy with:

- every page set to `<meta name="robots" content="noindex, nofollow, noarchive">`
- the live Google Analytics **and** Fathom tags removed
- `robots.txt` replaced with a blanket `Disallow: /` (the source one invites
  every search crawler and AI agent)
- `sitemap.xml`, `llms.txt`, `llms-full.txt` dropped (they advertise the live
  site's URLs and shouldn't be served from staging)

The source files are left untouched. To deploy an identical copy *with* live
analytics instead, open `make-staging.mjs` and set `DISABLE_ANALYTICS = false`
(and/or `NOINDEX = false`).

Build it locally any time with:

```bash
node sites/williscooper/make-staging.mjs
# → writes sites/williscooper-staging-build/
```

---

## Step 0 — create the subdomain in hPanel (required for every method)

The live site is a **Hostinger Website Builder** site, which can only serve
pages built in the builder — it can't serve raw uploaded HTML. So the staging
subdomain must live on a **Web Hosting** plan.

1. hPanel → **Domains → Subdomains**.
2. Create subdomain `new` under `williscooper.com`.
3. Note the **document root** it creates (something like
   `public_html/new` or `domains/williscooper.com/public_html/new`).
   That folder is where the site files go. Nothing outside it is touched.
4. If `williscooper.com`'s DNS is managed elsewhere, add an A/CNAME record for
   `new` pointing at the hosting server (hPanel shows the target).

> If you don't have a Web Hosting plan on this account (only Website Builder),
> the subdomain option above won't serve raw HTML — tell me and we'll pick a
> different host for staging (e.g. a separate static host) instead.

---

## Method A — automated (GitHub Actions, repeatable)

Workflow: `.github/workflows/deploy-williscooper-staging.yml` (manual trigger).

1. hPanel → **Files → FTP Accounts** — note the FTP host, and create/note an
   FTP account username + password.
2. GitHub repo → **Settings → Secrets and variables → Actions → New secret**,
   add these four:
   | Secret | Value |
   |---|---|
   | `HOSTINGER_FTP_SERVER` | FTP host from hPanel (e.g. `ftp.williscooper.com`) |
   | `HOSTINGER_FTP_USERNAME` | the FTP account username |
   | `HOSTINGER_FTP_PASSWORD` | that account's password |
   | `HOSTINGER_STAGING_DIR` | the subdomain docroot from Step 0, **ending in `/`** (e.g. `/domains/williscooper.com/public_html/new/`) |
3. GitHub → **Actions → Deploy Willis Cooper (staging) → Run workflow**, type
   `deploy` in the confirm box, run it.

The job builds the staging-safe copy and syncs it into `HOSTINGER_STAGING_DIR`
over FTPS. Re-run it any time to push updates.

> Safety: the upload only writes inside `HOSTINGER_STAGING_DIR`. Make sure that
> path is the **staging** subdomain's folder, not the live site's.

---

## Method B — manual (one-off, no credentials in GitHub)

1. Build (or use the ZIP provided): `node sites/williscooper/make-staging.mjs`
   produces `sites/williscooper-staging-build/`.
2. hPanel → **Files → File Manager** → open the subdomain docroot from Step 0.
3. Upload the **contents** of the build folder (so `index.html` sits at the
   root of the docroot, not inside a subfolder). Uploading a ZIP and using
   "Extract" in File Manager is the fastest way.

---

## Verify after deploy

- Visit `https://new.williscooper.com/` — home page loads, styling intact.
- View source → confirm `content="noindex, nofollow, noarchive"` is present and
  there is **no** `googletagmanager.com` / `usefathom.com` script.
- Click through a few pages (about, a service page, contact) — links are
  relative, so they stay on the staging subdomain.
