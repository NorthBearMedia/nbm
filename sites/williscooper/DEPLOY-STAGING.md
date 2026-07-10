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

## Step 0 — subdomain + DNS (required for every method)

Two facts shape this step:

- The live site is a **Hostinger Website Builder** site, which can only serve
  pages built in the builder — it can't serve raw uploaded HTML. So the
  staging subdomain must live on a **Web Hosting** plan.
- **williscooper.com's DNS is NOT in our Hostinger account** — the domain is
  managed by Willis Cooper's external IT team (this is why Pulse verifies
  their GSC via GA tag, not DNS). So the subdomain record has to be added by
  them; we only host the files.

The change we need from the IT team is **one additive A record**. Email
(`MX`/`SPF`/`DKIM`/`DMARC`), the live website records (apex/`www`) and
everything else in their zone stay untouched — adding a new record for the
name `new` cannot affect existing records.

Order matters (SSL issuance needs DNS resolving first):

1. **hPanel:** Websites → **Add website** → use existing domain →
   `new.williscooper.com` (the full hostname as an *external* domain —
   Domains → Subdomains won't work because williscooper.com isn't on the
   account). Note two things:
   - the **document root** it creates — that folder is where the files go;
   - the **Website IP address** shown on the hosting plan's dashboard.
   - If hPanel asks to *verify domain ownership*, it will show a TXT record —
     that's a second additive record to include in the email below.
2. **Email the IT team** (template below) asking for the A record
   `new` → that IP.
3. Once `new.williscooper.com` resolves (minutes to ~1h;
   check with `getent hosts new.williscooper.com` or any DNS lookup tool):
   **hPanel → SSL** → install the free Let's Encrypt certificate for
   `new.williscooper.com` and enable Force HTTPS.
4. Deploy the files (Method A or B below).

### Email template for the IT team

> **Subject:** DNS addition for williscooper.com — one new A record (staging
> preview, no changes to existing records)
>
> Hi,
>
> We're preparing an updated version of the williscooper.com website. Before
> anything changes on the live site, we want to stage the new version on a
> subdomain for Willis Cooper to review.
>
> Could you please **add** the following record to the williscooper.com DNS
> zone:
>
> | Type | Name/Host | Value | TTL |
> |---|---|---|---|
> | A | `new` | `<IP from hPanel, step 1>` | 3600 (or your default) |
>
> This is an **additive change only** — please don't modify or remove any
> existing records. Mail (MX/SPF/DKIM/DMARC), the current website records
> (apex and www) and everything else stay exactly as they are. The new record
> only makes `new.williscooper.com` resolve to our hosting for the preview.
>
> Once it resolves we'll issue the SSL certificate from our side (Let's
> Encrypt) — no further action needed from you.
>
> Thanks!

*(If hPanel required ownership verification in step 1, add its TXT record to
the table — also purely additive.)*

### Later: pointing the LIVE domain at the new site (not now)

When the staging site is approved and it's time to cut williscooper.com over,
that is a second, separate request to the IT team — kept here for reference:

- *(day before)* lower the TTL on the apex `A` record and the `www` record to
  300 for a fast rollback window;
- *(cutover)* change the apex `A` record — currently `34.120.137.41`, the
  Hostinger builder — to the new hosting IP, and point `www` the same way;
- **touch nothing else** — MX/SPF/DKIM/DMARC and all other records stay,
  so email is unaffected;
- rollback = revert those two records;
- afterwards, restore the TTL.

The cutover deploy must be the **production** build (analytics on, indexable):
set `NOINDEX = false` and `DISABLE_ANALYTICS = false` in `make-staging.mjs`.
The pages' canonical URLs already point at `https://williscooper.com/…`, so
they're correct for live. Note the old builder site stops rendering the moment
the apex record moves — that's the point, but coordinate timing with the
client.

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
