# Pulse Operations Handover

State of the world + runbook for continuing North Bear Pulse operations
in a fresh Claude session (which has full network access, unlike the
session this was written in). **No secrets in this file** — the user
pastes those into the session (admin password, Hostinger API token,
Google service-account key, Gmail app password).

## Deployed system

- App: `https://nbm-production-604e.up.railway.app` (Railway, root dir
  `analytics`, volume at `/data`). Auto-deploys from `main`.
- Admin login: password provided by the user in-session. All other
  config (SMTP, Google key, Hostinger token, GSC reader
  `norton@northbearmedia.co.uk`) lives in the app's settings DB —
  already configured and working.
- 18 client sites in Pulse, all monthly schedule except IWPG +
  Caring Places Ltd (imported as "none" — **set these to monthly**).
- **No sites have client emails yet** — reports stay silent until added.

## Google estate (all working, verified live)

- Service account `nbm-pulse@nbm-pulse.iam.gserviceaccount.com`
  (project `nbm-pulse`): account-level **Viewer** on GA4 account
  `accounts/341873953` ("North Bear Media") — covers all properties,
  including future ones.
- Domain-wide delegation authorised in Workspace admin for the
  service account, scopes: `analytics.manage.users`,
  `analytics.readonly`, `analytics.edit`, `siteverification`,
  `webmasters.readonly`. Impersonation subject:
  `norton@northbearmedia.co.uk` (Workspace super admin).
- Search Console read = impersonated, read-only (app setting
  `gsc_reader_email`). GA4 read = direct as robot.

## GA4 properties created remotely (2026-06-11)

All in account 341873953, Europe/London, GBP, web stream attached:

| Domain | Measurement ID |
|---|---|
| alphashunt.co.uk | G-3YKJX05JJ4 |
| greenpathgardencare.co.uk | G-NMSX1W8JPM |
| ivyhouseresidentialhome.co.uk | G-JDE3V1EFV2 |
| maxus-evc.co.uk | G-T7CFY4BNKZ |
| melanieparker.co.uk | G-5VJGBD4YWR |
| muskengineering.co.uk | G-ZFNRCD6V17 |
| primeprandmarketing.co.uk | G-ETTX5ZCWYW |
| pslimited.uk | G-PPYF902922 |
| rcmhomeimprovements.co.uk | G-MGEREL8SFQ |
| richfordvehiclesales.co.uk | G-Z5RX27WP2V |
| rmbgarage.co.uk | G-5WT1S570JR |
| swanwickkidsclub.co.uk | G-LWMK96TY1W |
| woodlandwalkdaycare.co.uk | G-29XJD64544 |
| wowstays.co.uk | G-B13EC6D2GG |
| evccitysprint.co.uk | G-TEZ0FFLV2T |

Pre-existing: northbearmedia.co.uk (526994009), iwpg.co.uk (526989557),
caringplacesltd.co.uk (533120439). Pixieset Gallery (473790671) is
unwanted — user said remove from Pulse; deleting the GA4 property
needs explicit confirmation first.

## Session findings 2026-06-11 (network-restricted session)

Session ran in a Claude Code environment whose network allowlist
permitted `*.googleapis.com` but **blocked** the Pulse app
(`nbm-production-604e.up.railway.app`), the Hostinger API
(`developers.hostinger.com`), and public websites — so runbook steps
1–4 could not run. **Fix before next session:** in the environment's
network policy (claude.ai/code → environment settings), allow those
two hosts plus the client site domains (for tag checks), or use full
network access. Docs:
https://code.claude.com/docs/en/claude-code-on-the-web

Completed via Google APIs (service account + delegation both verified
working live):

- **Step 5, partial**: northbearmedia.co.uk property 526994009 stream
  is `G-9NX0CJ85CL` (created 2026-03-04); 1 session / 30d. Swept all
  19 properties in account 341873953 — only IWPG (127 sessions) and
  Caring Places (22) have traffic; Pixieset Gallery (G-TCGWD6TBY8)
  tracks only `northbearmedia.pixieset.com`. So NBM site traffic is
  NOT landing elsewhere in the account: the installed tag is either
  missing or points outside the account. Confirming requires fetching
  the live homepage (blocked this session).
- **GSC inventory** (as norton@): verified properties are
  `sc-domain:northbearmedia.co.uk`, `sc-domain:iwpg.co.uk`,
  `https://evccitysprint.co.uk/` (owner); `https://theelectricvan.co/`
  unverified. The other 16 client domains still need the step-4 sweep.

## Next-session runbook (in order)

1. Verify network: `curl https://nbm-production-604e.up.railway.app/healthz`.
2. Log into Pulse API with admin password; drive it directly:
   set IWPG + Caring Places to monthly; run auto-connect on all sites;
   confirm each site's ga4_property_id/measurement_id got filled.
3. **Probe Hostinger API** (`developers.hostinger.com`, Bearer token)
   for any website/builder endpoints that can set Google Analytics
   integration or inject head code. If found: inject every measurement
   ID above — user does nothing. If not found: the builder paste list
   (table above) remains the user's only manual task; tell them
   straight.
4. **Search Console sweep** (zero user involvement): for each domain —
   `siteVerification.getToken` (type INET_DOMAIN, method DNS_TXT) as
   norton@ → create the TXT record via Hostinger DNS API → verify →
   property exists; reads already work via delegation. Then set each
   Pulse site's `gsc_site_url = sc-domain:<domain>`.
5. Re-check northbearmedia.co.uk's own GA4 (only 1 visit/30d —
   suspected tag pointing at wrong/old property; compare installed tag
   vs property 526994009's stream G-id).
6. Collect client emails from user (the one thing only they have),
   add via Pulse, confirm scheduled sends.
7. Offer: Clarity rollout, richer report analysis (user deferred both).

## House rules learned this session

- User is non-technical: one task at a time, tiny steps, no jargon.
- Never grant broader access than needed (owner-grants got blocked;
  read-only delegation was the right call).
- Don't put secrets in git or email drafts.
