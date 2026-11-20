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

Optional: `SESSION_SECRET` (any long random string) pins the key that
signs admin login cookies. Without it Pulse generates one on first boot
and keeps it in the database on the volume. Changing it signs every
browser out.

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

Every report leads with a verdict for the period ("A strong month",
"A quieter month"), what went well, and where to go from here, before any
table of numbers. A change is only called up or down when it is big enough
to mean something (`lib/story.js`); small wobbles read as "level", and red
is kept for real faults such as downtime. The PDF, the email and the client
dashboard share one look (Archivo and Martian Mono, in `assets/fonts` and
`public/fonts`).

**What we did for you.** Each site card has a **Work log**. Log a piece of
work with its date and it appears in that client's report, email and
dashboard for the period the date falls in. The report writer is told
about it and may say a result came after the work, never because of it.

**Google detail.** Reports also list the searches a site started
appearing for (only when both periods' lists came back whole), the pages
Google sent people to with the change in clicks, and, on calendar-month
reports, a comparison with the same month a year ago once that month has
data.

**Sense check.** Every report is read before it can reach a client
(`lib/sensecheck.js`), so nobody has to approve each one. Rules catch what
code can be sure of (a visit count that has collapsed the way a broken tag
does, a counter known to be under-counting, placeholder text). A second AI
reader then checks the written analysis against the numbers. Bad writing is
swapped for the standard rules-based analysis and the report still goes.
Data that looks broken HOLDS the report: it goes to the owner only, with
the reason at the top, and **Send to client** in the site's History
releases it. A report sent by hand from the admin console is never held.

Every email has the PDF attached, headline numbers, and a button to the
client's live dashboard (their private `/r/<secret>` link — the **Copy
dashboard link** button gives you the exact URL to send them). Sites
with no contact email or frequency "No schedule yet" never send anything.
Failures show in the site's **History**; with a BCC set you get a copy of
every report. Times use `TIMEZONE` (default `Europe/London`).

## Site health scores

The speed, SEO and best-practice scores come from Google's PageSpeed test.
Google refuses the test without credentials, so add a free API key in
Settings ("Site health: Google PageSpeed API key"): in the Google Cloud
console enable the "PageSpeed Insights API", then APIs and services,
Credentials, Create credentials, API key. Scores refresh daily for any
site whose score is more than six days old. The Connections panel says
when Google is refusing the test.

## Website monitoring

Pulse checks every active client site's homepage every 5 minutes (a plain
GET with an "NBM Pulse" user agent, 15 second timeout, one retry). A site is
called down only after two failed checks in a row. A site that answers
with an error page always counts as down. If most sites give no answer at
all AND two unrelated outside pages cannot be reached either, that is
treated as Pulse's own connection and nothing is marked down.
Once a day at 04:10 it reads each site's certificate date (warning at 14 and
3 days) and domain expiry date from Hostinger or RDAP (warning at 30 and 7
days; "not known" where neither says). It also flags a homepage that tells
Google not to list it (noindex), unless the site is marked as meant to be
hidden.

- **Alerts** go to the owner address in Settings only: DOWN, BACK UP (with
  how long), and each warning. The same problem is emailed at most once a day.
- **Uptime** (top bar) shows every site now, uptime for 24 hours, 7 and 30
  days, response time, certificate and domain days left, the last incident,
  and switches to pause a site, mark it hidden from Google, or hide its
  uptime from client reports.
- **Client reports and dashboards** show a "Website availability" score
  (uptime, time offline, outages) built from confirmed outages only, and only
  once the period has 14 well measured days.
- **Status feed**: a read only JSON link behind a long random token, shown at
  the bottom of the Uptime view. A stale "lastRound" means Pulse has stopped.

Storage stays small: one summary row per site per day and one row per
incident.

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
