# Deploying Willis Cooper — LIVE cutover of `williscooper.com`

Plan: replace the Hostinger **Website Builder** site currently serving
williscooper.com with this static rebuild, served from NBM's **Web Hosting**
plan. No staging step — the cutover is a DNS repoint, and rollback is
reverting two DNS records (plus reconnecting the builder).

Key facts (verified 2026-07-10):

- `williscooper.com` **and** `www.williscooper.com` both resolve to
  `34.120.137.41` — the Hostinger builder frontend.
- The DNS zone is **not** in NBM's Hostinger account; it's managed by Willis
  Cooper's external IT team. They make the (two-record) change.
- Email for `@williscooper.com` is defined by MX/SPF/DKIM/DMARC records that
  nobody touches — repointing the apex `A` and `www` records cannot affect
  mail.
- **Hostinger's "domain already in use" check is platform-wide**, not
  per-account: as long as the builder site holds williscooper.com, the domain
  cannot be attached to a Web Hosting website — in *any* Hostinger account.
  So the domain has to be released from the builder at cutover time, which is
  why the runbook pre-stages the files on a temporary domain first.

## What gets deployed

`make-staging.mjs --production` emits a **verbatim** copy of the site
(analytics on, indexable, `robots.txt`/`sitemap.xml`/`llms*.txt` included) —
byte-identical to the source except the repo tooling files (this doc, README,
the script, zips) are excluded. Build it any time:

```bash
node sites/williscooper/make-staging.mjs --production
# → writes sites/williscooper-live-build/   (gitignored; rebuild at will)

# For a File-Manager upload, zip it (also gitignored — regenerate as needed):
cd sites/williscooper-live-build && zip -r ../williscooper/williscooper-live.zip .
```

(The default, flag-less mode builds a noindexed, analytics-stripped staging
copy — only for previews. The script fails the build if any page misses its
noindex/strip, and refuses dangerous output directories.)

**One functional difference from the builder site:** the contact form
(`contact-us.html`) and taxcover enquiry form originally posted to Hostinger's
builder form backend, which won't exist on plain hosting. They're wired to
open the visitor's mail client pre-addressed to info@williscooper.com. If a
hosted form is wanted instead (Formspree / Jotform — careers already embeds a
Jotform), wire that up **before** cutover.

## Runbook

### Step 1 — DNS prep (IT team, at least 24–48 h before cutover)

Send the email below. The TTL drop is only effective once every resolver's
cached copy of the *old* TTL has expired — so it must be in place **at least
one full old-TTL period** before the switch (24 h is the common default;
48 h of lead time is safe). Fast cutover and fast rollback both depend on
this.

### Step 2 — pre-stage the files (NBM, before cutover day)

1. hPanel → Websites → **Add website** on the Web Hosting plan under a
   **temporary domain NBM controls** (e.g. `wc-preview.northbearmedia.co.uk`)
   — williscooper.com itself can't be attached yet (platform-wide collision,
   see above).
2. Upload the production build into its docroot (File Manager: upload the
   zip, Extract, so `index.html` sits at the docroot root). Delete any
   placeholder files hPanel created (`default.php` etc.) — note the automated
   deploy never removes files it didn't upload, so this manual sweep is
   needed once either way.
3. Click through the temp URL: home, a service page, meet-the-team images,
   privacy-policy PDF, careers Jotform, contact form opens a pre-filled
   email.

### Step 3 — cutover (out of hours, ~15 min, coordinate live with IT)

1. **Release the domain from the builder site** (whoever administers the
   builder — hPanel → the builder site → change/disconnect its domain). The
   builder stops answering for williscooper.com at this moment; the outage
   window starts here.
2. **Attach williscooper.com to the hosting website** — hPanel → the
   pre-staged website → **Change domain** → williscooper.com. (If the plan's
   hPanel has no change-domain option: Add website → williscooper.com fresh,
   and re-extract the zip into its docroot — a few extra minutes.)
3. **IT team flips DNS** (already primed from the email):
   apex `A` `34.120.137.41` → new IP, `www` likewise.
4. **SSL:** as soon as the domain resolves to Hostinger (TTL 300 → ~5 min),
   hPanel → SSL → install the free Let's Encrypt certificate for
   williscooper.com (+ www) and enable **Force HTTPS**. Until the cert is
   issued (typically minutes), HTTPS shows a warning — part of the outage
   window, which is why this runs out of hours.

### Step 4 — verify

- `https://williscooper.com/` and `https://www.williscooper.com/` load with a
  valid certificate, styling intact.
- View source: GA (`G-3P870GR1ZQ`) and Fathom (`GATBBBHW`) scripts present;
  `robots` meta says `index, follow`.
- `/robots.txt` and `/sitemap.xml` serve.
- GA4 realtime shows the visit (property 544325864).

### Rollback

Ask the IT team to revert the two records to `34.120.137.41` **and**
reconnect williscooper.com to the builder site (release it from the hosting
website first — same platform-wide rule in reverse). With TTL 300 the builder
is back within ~5 minutes of both being done.

### Ongoing updates (after cutover)

Either re-upload via File Manager, or set the four repo secrets
(`HOSTINGER_FTP_SERVER` / `_USERNAME` / `_PASSWORD` / `HOSTINGER_LIVE_DIR` =
the docroot, trailing slash) and run the **Deploy Willis Cooper (LIVE)**
workflow (type `deploy-live`). The workflow validates the secrets, builds
`--production` and syncs the docroot; it needs this branch merged to `main`
first (`workflow_dispatch` only appears for workflows on the default branch).
It leaves a public-but-harmless `.ftp-deploy-sync-state.json` manifest in the
docroot (file list + hashes — all public content anyway).

## Email template for the IT team

> **Subject:** DNS change for williscooper.com — repoint website records only
> (email and everything else unchanged)
>
> Hi,
>
> We're moving the williscooper.com website to new hosting and would like to
> do the switch on **\<proposed date + time, out of hours\>** — let us know
> if that works for you.
>
> **Now, please (at least 24–48 hours before the switch):** lower the TTL on
> the `williscooper.com` apex `A` record and the `www` record to **300**, so
> the switch propagates quickly and can be rolled back fast if needed.
>
> **At the agreed time (we'll confirm live):**
>
> | Record | Currently | Change to |
> |---|---|---|
> | `williscooper.com` (apex) — A | `34.120.137.41` | `<IP from hPanel>` |
> | `www.williscooper.com` — A (or CNAME) | `34.120.137.41` | same IP (or CNAME to `williscooper.com`) |
>
> **Please change nothing else** — MX, SPF/DKIM/DMARC and all other records
> stay exactly as they are, so email is unaffected.
>
> Rollback, if we ask for it: revert those two records to `34.120.137.41`.
> Once we confirm the new site is stable you can restore the TTLs to their
> previous values.
>
> Thanks!
