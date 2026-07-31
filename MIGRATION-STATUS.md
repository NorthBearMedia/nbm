# Steadplan → Hostinger migration — session handoff status

**Branch:** `claude/steadplan-wordpress-hostinger-mmoqtc` · **Last update:** 2026-07-31
**Task:** Migrate WordPress site steadplan.co.uk (Steadplan Group) from old agency host to the
North Bear Hostinger account. No destructive changes; NO DNS changes without explicit user OK.
**Do not touch** other sites on the account: ensohr.com, ensohr.co.uk, maxus-evc.co.uk.

## BLOCKER (Step 0/1) — Hostinger MCP auth

All five `hostinger-*` MCP servers (defined in `.mcp.json`, launched via `npx hostinger-api-mcp`)
return `{"message":"Unauthenticated."}` from the Hostinger API. Network allowlist is FINE —
requests reach Hostinger (real correlation IDs).

**Root cause (verified):** the servers read the API token from env var `HOSTINGER_API_TOKEN`
(confirmed in package source `src/core/oauth.ts` — falls back to `API_TOKEN`/`APITOKEN`; empty
falls through). That env var is **not set in the Claude Code cloud environment** for this repo.
The claude.ai Hostinger connector that works in the user's normal chats is separate plumbing and
does not reach these repo sessions.

**Fix (user, one-time):** In the Claude Code environment settings for this repo (same screen as
the network/domain allowlist) add environment variable/secret `HOSTINGER_API_TOKEN` = the
Hostinger API token (hpanel.hostinger.com/profile/api). NEVER hardcode the token in `.mcp.json`
(it's committed to git). Env vars inject at container start → needs a fresh session after saving.

**On session start, re-run pre-flight:** `hosting_listWebsitesV1` + `hosting_listOrdersV1`.
If "host not permitted" → STOP, tell user allowlist broken. If `Unauthenticated.` → env var
still missing/misnamed, STOP, tell user.

## Step 2 — backups: verified good (2026-07-31)

Both in Google Drive folder "Steadplan-Backup" (owner norton@northbearmedia.co.uk,
anyone-with-link). Download with:
`curl -L -o <name> "https://drive.usercontent.google.com/download?id=<ID>&export=download&confirm=t"`
(~40 s total). Do NOT use the Drive MCP for these (too big).

| File | Drive ID | Bytes (must match) | SHA-256 |
|---|---|---|---|
| steadplan-website.zip | `1Kq2t5d1mczqI5DcK1080cIisN0CpYr3i` | 692,621,040 | `8087402b3d8d2bf682b08c03058ec63dbb88b1354b3c5ee5bb447e8199ce3994` |
| steadplanco_nov25.sql | `1pILTdRDm-uRfjWSuGssIPQqYp03PBO_m` | 47,901,522 | `e74c29aead57967ec65d162e3b85beb9efc55c4c0910c520bdff62e28f2e83b9` |

Zip passes full `unzip -t` CRC (14,409 entries, ~882 MB uncompressed).

## Step 3 — inspection: done

- Zip site root: **`public_html/`**.
- **`public_html/.htaccess` is critical**: top two lines are `SetEnv API_KEY …` / `SetEnv API_SECRET …`
  (vehicle-stock API). Theme reads them at `wp-content/themes/holdens/functions.php:591-592` via
  `$_SERVER['API_KEY']/['API_SECRET']`. MUST survive migration; verify post-import (LiteSpeed honors
  SetEnv). Rest: HTTPS redirect, WP rewrites, caching/gzip, Wordfence WAF block, stale cPanel
  `ea-php81` handler block (inert on Hostinger, leave as-is).
- **wp-config.php:** DB `steadplanco_nov25`, user `steadplanco_petnov`, host `localhost`,
  `utf8mb4`, **`$table_prefix = 'sc_'`**. No WP_HOME/WP_SITEURL defines. `WP_DEBUG=true` +
  `WP_DEBUG_LOG` (flag to user post-launch; don't change unasked).
- Agency cruft present, left untouched: `wp-config copy.php`, `wp-config-2.php`,
  `wp-config-new.php`, `wp-config-ddev.php`, `new.php` (spare configs likely hold old creds —
  cleanup is a user decision later).
- **SQL dump:** phpMyAdmin 5.2.2, generated 2026-07-03 11:38, MariaDB 10.11.18, PHP 8.4.22,
  DB `steadplanco_nov25`, **65 tables all `sc_`**. `siteurl`=`home`=`https://steadplan.co.uk`
  (non-www). Domain unchanged ⇒ **no search-replace, do not touch siteurl/home**. Dump contains
  leftover Gravity Forms/Formidable tables with no matching plugins — harmless.
- Theme: `holdens`. Plugins: advanced-custom-fields-pro, filter-everything-pro, wordfence,
  complianz-gdpr, contact-form-7, contact-form-cfdb7, popup-maker, wordpress-seo,
  wp-security-audit-log.

## Remaining steps

1. **Step 1:** From orders/websites lists confirm plan capacity + whether steadplan.co.uk can be
   added via API. If purchase/hPanel needed → tell user exactly what, and wait.
2. **Step 4:** Add website (`hosting_createWebsiteV1`, needs `order_id`; domain ownership TXT may
   be demanded — that is a DNS change ⇒ present to user and WAIT). Import via
   `hosting_importWordpressWebsite` (takes local `archivePath` + `databaseDump` paths). Then: PHP
   → **8.4**, verify `.htaccess` SetEnv on server, wp-config → new DB creds, prefix stays `sc_`.
3. **Step 5:** Test preview URL + `curl -sk --resolve steadplan.co.uk:443:<NEW_IP> https://steadplan.co.uk/`
   (homepage, pages, vehicle showroom, enquiry forms, wp-admin). Then hand to user: wp-admin login,
   "Update Vehicles" button (theme functions.php logic), licences (ACF Pro NEW licence; Filter
   Everything Pro OK unlicensed; Wordfence re-register to info@northbearmedia.co.uk).
4. **Step 6:** DNS table only, NO changes. Current (captured 2026-07-31): apex A `62.233.100.11`
   TTL 14400; `www` CNAME → apex (follows automatically); MX `0 steadplan-co-uk.mail.protection.outlook.com`
   (M365 — untouched); SPF TXT contains `+a` ⇒ new IP auto-authorised for CF7 PHP-mail (no SPF edit);
   `autodiscover` CNAME → autodiscover.outlook.com (untouched); no DMARC; **NS =
   dns1/dns2.namecheaphosting.com** (Namecheap HOSTING DNS, zone edited in that hosting package's
   cPanel zone editor; do NOT let old hosting be cancelled before the zone is rehomed). Namecheap
   user: steadplansales. Plan: change apex A (+www if it's ever an explicit A) to new Hostinger IP,
   everything mail-related untouched. Suggest TTL 300 pre-cutover (needs user OK). STOP for user.

Throughout: report after each step, lead with what happened, exact errors verbatim, no
improvisation around failures.
