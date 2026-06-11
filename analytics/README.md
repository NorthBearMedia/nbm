# North Bear Pulse 🐻📈

Automated client analytics for North Bear Media. One small app that:

- pulls **Google Analytics 4** (visits, visitors, pages, traffic sources),
  **Google Search Console** (rankings, search clicks) and **Microsoft
  Clarity** (how people actually use the site) for every client website
- gives every client their own **live dashboard** via a private link — no
  logins, no passwords for them to forget
- emails every client a **branded A4 PDF report** on their chosen schedule
  (weekly / monthly / quarterly), and lets them **request a fresh report**
  any time with one click
- gives you an **admin console** to manage all ~20 sites in one place

Run `npm run sample-report` to see what the PDF looks like with demo data
(it writes `data/sample-report.pdf`) — no setup needed.

---

## How it fits together

```
Client websites (Hostinger)
  └── GA4 + Clarity tracking snippet  ← "Tracking code" button generates this
            │
            ▼
Google Analytics ─┐
Search Console  ──┼── live APIs ──► North Bear Pulse ──► client dashboards (/r/<secret>)
Microsoft Clarity ┘   (one nightly                   ──► scheduled PDF reports by email
                       snapshot for Clarity)         ──► "email me a fresh report" button
```

One Google **service account** (a robot Google login) is granted read-only
access to every client's GA4 property and Search Console — so you set up
Google once, then connecting a new client is just pasting two IDs.

---

## Setup (about 30 minutes, one time)

### 1. Run the app

```bash
cd analytics
npm install
cp .env.example .env     # then edit .env
npm start
```

Set at minimum in `.env`: `ADMIN_PASSWORD` (your console login),
`APP_URL` (the public address of this app) and the SMTP settings.

**Hosting:** deploy like the other NBM apps. On **Railway**: new service
from this repo, set *Root Directory* to `analytics`, add the variables
from `.env`, and **attach a Volume** mounted at `/data` with `DATA_DIR=/data`
(otherwise the database and PDFs are wiped on every deploy). A Hostinger
VPS running `npm start` under pm2 works just as well.

### 2. Email (5 min)

Use any Hostinger mailbox (e.g. create `reports@northbearmedia.co.uk` in
hPanel → Emails). Put its details in `.env` (`SMTP_USER` / `SMTP_PASS` —
host `smtp.hostinger.com`, port `465`). Click **Test email** in the admin
console to confirm.

### 3. Google service account (10 min, once for all clients)

1. Go to https://console.cloud.google.com → create a project (call it
   "NBM Pulse").
2. **APIs & Services → Library**: enable **Google Analytics Data API** and
   **Google Search Console API**.
3. **IAM & Admin → Service Accounts → Create service account** (name:
   `nbm-pulse`). No roles needed. Open it → **Keys → Add key → JSON** —
   a `.json` file downloads.
4. Save that file as `analytics/data/google-service-account.json` (or
   paste its contents into `GOOGLE_SERVICE_ACCOUNT_JSON` on Railway).

The service account has an email address like
`nbm-pulse@nbm-pulse.iam.gserviceaccount.com` — it's shown in the admin
console with a copy button. You'll grant this email access per client:

- **GA4**: Admin → Property → Property access management → Add user →
  paste the email → role **Viewer**.
- **Search Console**: Settings → Users and permissions → Add user →
  paste the email → **Full** (Restricted blocks API queries on some properties).

### 4. Microsoft Clarity (per site, 2 min)

In https://clarity.microsoft.com, open the site's project →
**Settings → Data Export → Generate new API token**. Paste the token and
the project ID (from the URL) into the site's settings in Pulse.

> Clarity's API only exposes the last 1–3 days, so Pulse snapshots every
> site nightly at 03:40 and builds reports from its own history. The
> Clarity section fills up from the day you connect it.

---

## Adding a client site (2 min each)

1. **+ Add client site** in the admin console — name, email(s), report
   frequency, plus whichever IDs you have:
   - **GA4 property ID** — GA4 → Admin → Property details (just numbers)
   - **GA4 measurement ID** — the `G-XXXXXXXX` one (for the tracking code)
   - **Search Console property** — `sc-domain:example.co.uk` or `https://example.co.uk/`
   - **Clarity project ID + API token**
2. Grant the service account access in that client's GA4 + Search Console
   (step 3 above).
3. If the site doesn't have GA4/Clarity installed yet: click **Tracking
   code**, copy, and paste it before `</head>` on the website
   (Hostinger Website Builder: *Settings → Integrations → Custom code*;
   WordPress: header scripts plugin or theme `header.php`).
4. Click **Test connections** — three green ticks and you're done.
5. Click **Copy dashboard link** and send it to the client. That link is
   their dashboard *and* where they can request fresh reports.

---

## How reports go out

- **Weekly** → Mondays 07:00, covering the previous Mon–Sun
- **Monthly** → 1st of the month 07:00, covering the previous month
- **Quarterly** → 1st of Jan/Apr/Jul/Oct 07:00, covering the previous quarter
- **Client-requested** → instantly, covering the last 30 days (max 3/day per client)
- **"Send report now"** (admin) → instantly, covering the last 30 days

Every email has the PDF attached, headline numbers, and a button to the
live dashboard. Failures are logged in each site's **History** (and
nothing is sent to the client). With `EMAIL_BCC` set, you get a copy of
every report.

Times use `TIMEZONE` (default `Europe/London`).

## Useful commands

```bash
npm start              # run the app (scheduler included)
npm run sample-report  # demo PDF with fake data → data/sample-report.pdf
npm run sync-clarity   # snapshot Clarity for all sites right now
npm run send-due       # process any overdue scheduled reports right now
```
