# Deploying Willis Cooper — LIVE cutover of `williscooper.com`

Plan: replace the Hostinger **Website Builder** site currently serving
williscooper.com with this static rebuild, served from NBM's **Web Hosting**
plan. No staging step — the cutover is done by repointing DNS, and rollback is
reverting two DNS records.

Key facts (verified 2026-07-10):

- `williscooper.com` **and** `www.williscooper.com` both resolve to
  `34.120.137.41` — the Hostinger builder frontend.
- The DNS zone is **not** in NBM's Hostinger account; it's managed by Willis
  Cooper's external IT team. They must make the (two-record) change.
- Email for `@williscooper.com` is defined by MX/SPF/DKIM/DMARC records that
  we do not touch — repointing the apex `A` and `www` records cannot affect
  mail.

## What gets deployed

`make-staging.mjs --production` emits a **verbatim** copy of the site
(analytics on, indexable, `robots.txt`/`sitemap.xml`/`llms*.txt` included) —
byte-identical to the source except the repo tooling files (this doc, README,
the script, zips) are excluded. Build it any time:

```bash
node sites/williscooper/make-staging.mjs --production
# → writes sites/williscooper-live-build/
```

(The default, flag-less mode still builds a noindexed, analytics-stripped
staging copy — only useful for previews on other domains.)

**One functional difference from the builder site:** the contact form
(`contact-us.html`) and taxcover enquiry form originally posted to Hostinger's
builder form backend, which won't exist on plain hosting. They're wired to
open the visitor's mail client pre-addressed to info@williscooper.com. If a
hosted form is wanted instead (Formspree / Jotform — careers already embeds a
Jotform), wire that up **before** cutover.

## Runbook

### 1. hPanel — add the website (NBM, any time)

Websites → **Add website** → use existing domain → `williscooper.com`
(external domain — the zone isn't on this account). Note:

- the **document root** it creates (files go there);
- the **Website IP address** on the plan dashboard (goes in the IT email);
- if hPanel asks to *verify domain ownership*, it shows a TXT record — add it
  to the IT email as an extra additive record.

> **Possible collision:** if the existing builder site lives in THIS Hostinger
> account, hPanel may refuse the domain as already in use. If so, the domain
> must be disconnected from the builder site first — but the builder stops
> serving the live site the moment it's disconnected, so do that **at the
> agreed cutover moment**, immediately before the IT team flips DNS (with the
> files already uploaded and TTL already lowered, the gap is minutes). If the
> builder site is in the client's own account, there's no collision and no
> gap: the builder keeps serving until DNS propagates.

### 2. Upload the files (NBM, before cutover)

Either extract `williscooper-live.zip` (or the `williscooper-live-build/`
folder) into the document root via File Manager — `index.html` at the root of
the docroot — and delete any placeholder files hPanel created (`default.php`
etc.); or set the four repo secrets (`HOSTINGER_FTP_SERVER` / `_USERNAME` /
`_PASSWORD` / `HOSTINGER_LIVE_DIR`) and run the **Deploy Willis Cooper
(LIVE)** workflow (type `deploy-live` to confirm). The workflow needs this
branch merged to `main` first — `workflow_dispatch` only appears in the
Actions tab for workflows on the default branch.

### 3. DNS — email for the IT team

> **Subject:** DNS change for williscooper.com — repoint website records only
> (email and everything else unchanged)
>
> Hi,
>
> We're moving the williscooper.com website to new hosting. Could you please
> make the following changes to the williscooper.com DNS zone:
>
> **Now (preparation):** lower the TTL on the `williscooper.com` apex `A`
> record and the `www` record to **300** so the switch propagates quickly and
> can be rolled back fast if needed.
>
> **At the agreed cutover time:**
>
> | Record | Currently | Change to |
> |---|---|---|
> | `williscooper.com` (apex) — A | `34.120.137.41` | `<IP from hPanel, step 1>` |
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

### 4. SSL (NBM, immediately after the DNS flip)

Hostinger can only issue the Let's Encrypt certificate once the domain
resolves to its server, so there is a short window (typically minutes, up to
~1h with propagation) where HTTPS shows a certificate warning. To minimise it:

- schedule the cutover out of hours;
- as soon as DNS flips, hPanel → **SSL** → install the free certificate for
  `williscooper.com` (+ www) and enable **Force HTTPS**. Hostinger usually
  auto-issues within minutes of the domain pointing at it.

### 5. Verify

- `https://williscooper.com/` and `https://www.williscooper.com/` load with a
  valid certificate, styling intact.
- View source: GA (`G-3P870GR1ZQ`) and Fathom (`GATBBBHW`) scripts present;
  `robots` meta says `index, follow`.
- `https://williscooper.com/robots.txt` and `/sitemap.xml` serve.
- Click through: about, a service page, blog post, meet-the-team (images),
  privacy policy (embedded PDF), careers (Jotform embed loads), contact form
  opens a pre-filled email.
- GA4 realtime shows the visit (property 544325864).

### Rollback

Ask the IT team to revert the two records to `34.120.137.41`. With TTL 300,
the builder site is back within ~5 minutes. Nothing on the builder was
deleted (unless step 1's collision note applied — then reconnect the domain
to the builder site in hPanel as well).
