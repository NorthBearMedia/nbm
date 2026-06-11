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
- sets itself up: a built-in **setup wizard**, **auto-discovery** of your
  Google properties, **auto-detection** of tags already installed on each
  website, and **bulk import** of all your clients in one click

Run `npm run sample-report` to see the PDF with demo data (writes
`data/sample-report.pdf`) — no setup needed.

---

## Getting it running (the short version)

The app configures itself from the browser. The only thing it can't do
alone is type your passwords for you. Total hands-on time: **~20 minutes,
once** — then it runs itself forever.

### 1. Deploy (5 min)

**Railway** (same as the other NBM apps): New service → this repo →
set *Root Directory* to `analytics` → add **one environment variable**:

```
ADMIN_PASSWORD = something-long-and-private
```

…and **attach a Volume** mounted at `/data` with env `DATA_DIR=/data`
(without it the database and PDFs are wiped on each deploy). Railway
gives you a URL — open it, log in.

A Dockerfile is included, so a Hostinger VPS (or anything that runs
Docker or Node 20+) works exactly the same way.

### 2. First run — it's already going

On first boot the app **creates North Bear Media as customer #1**
(norton@northbearmedia.co.uk, monthly reports) and immediately scans
northbearmedia.co.uk for installed GA4/Clarity tags. The admin console
opens with a 3-step wizard:

1. **Email** — type in a Hostinger mailbox (create one like
   `reports@northbearmedia.co.uk` in hPanel → Emails first). The wizard
   sends you a real test email so you *know* it works.
2. **Google** — four clicks in Google Cloud (the wizard links you to the
   exact pages): create a free project, enable 3 APIs, create a "service
   account" robot, download its key file, paste it into the wizard. Then
   grant the robot's email (shown with a copy button) **Viewer** access in
   GA4 and Search Console. Granting at GA4 *account* level covers every
   client property in that account in one go.
3. **Wire up sites** — hit **⚡ Auto-connect all sites**. The app matches
   every site to its GA4 property and Search Console entry by domain and
   fills in all the IDs itself. **Scan my Google account** also lists any
   client properties not in Pulse yet — tick them and import all 20 in
   one click (each just needs the client's email added before its
   reports start sending).

**Optional:** Microsoft Clarity per site — auto-connect detects the
project ID if Clarity is installed; you only paste the API token
(clarity.microsoft.com → project → Settings → Data Export → Generate
token). Clarity's API only exposes the last 1–3 days, so Pulse snapshots
nightly at 03:40 and the Clarity section fills up from the day you
connect it.

### Your actual to-do list

- [ ] Deploy with `ADMIN_PASSWORD` (+ volume) and open the app
- [ ] Wizard step 1: enter a Hostinger mailbox → test email arrives
- [ ] Wizard step 2: Google Cloud robot (~10 min) + grant it access
- [ ] Wizard step 3: two clicks (auto-connect, import)
- [ ] Per client, when ready: add their email + frequency (and optionally
      a Clarity token)

Everything else — fetching data, building PDFs, emailing on schedule,
handling "send me a fresh report" requests — is automatic.

---

## How reports go out

- **Weekly** → Mondays 07:00, covering the previous Mon–Sun
- **Monthly** → 1st of the month 07:00, covering the previous month
- **Quarterly** → 1st of Jan/Apr/Jul/Oct 07:00, covering the previous quarter
- **Client-requested** → instantly, covering the last 30 days (max 3/day per client)
- **"Send report now"** (admin) → instantly, covering the last 30 days

Every email has the PDF attached, headline numbers, and a button to the
client's live dashboard (their private `/r/<secret>` link — the **Copy
dashboard link** button gives you the exact URL to send them). Sites
with no contact email or frequency "No schedule yet" never send anything.
Failures show in the site's **History**; with a BCC set you get a copy of
every report. Times use `TIMEZONE` (default `Europe/London`).

## Useful commands

```bash
npm start              # run the app (scheduler + wizard included)
npm run sample-report  # demo PDF with fake data → data/sample-report.pdf
npm run sync-clarity   # snapshot Clarity for all sites right now
npm run send-due       # process any overdue scheduled reports right now
```

## Notes for future-you

- All wizard settings live in the `settings` table in SQLite and override
  `.env` — `.env` works too if you prefer files (see `.env.example`).
- The SQLite file and generated PDFs live in `DATA_DIR` (default
  `./data`). Back that folder up and you've backed up everything.
- The Google service account key and SMTP password are stored in that
  database — treat the data directory (and access to the box) as secret.
- Disable the first-run seed with `SEED_FIRST_SITE=false`.
