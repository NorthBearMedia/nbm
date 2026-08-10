# Steadplan → Hostinger migration — working notes

Status as of 2026-08-10. Branch: `claude/steadplan-hostinger-migration-f68vno`.

## Current blocker

`HOSTINGER_API_TOKEN` is not set in the Claude Code environment, so all Hostinger
MCP/API calls return `Unauthenticated`. Norton needs to add it in the environment
settings (claude.ai/code → nbm environment → Environment variables). The variable
is injected at container boot — a **new session** is needed after saving it.
Fallback if the MCP servers don't pick it up: call `https://api.hostinger.com`
directly with `Authorization: Bearer $HOSTINGER_API_TOKEN`.

## Backup files (verified)

Google Drive folder `Steadplan-Backup`, both files link-shared (anyone/reader),
downloadable with curl — no auth needed:

| File | Size (bytes) | Drive file ID |
|---|---|---|
| steadplan-website.zip | 692621040 | `1Kq2t5d1mczqI5DcK1080cIisN0CpYr3i` |
| steadplanco_nov25.sql | 47901522 | `1pILTdRDm-uRfjWSuGssIPQqYp03PBO_m` |

Re-stage with:

```bash
curl -sSL -o steadplanco_nov25.sql "https://drive.usercontent.google.com/download?id=1pILTdRDm-uRfjWSuGssIPQqYp03PBO_m&export=download&confirm=t"
curl -sSL -o steadplan-website.zip "https://drive.usercontent.google.com/download?id=1Kq2t5d1mczqI5DcK1080cIisN0CpYr3i&export=download&confirm=t"
# Repack so site files sit at zip root (original wraps them in public_html/):
unzip -q steadplan-website.zip -d extracted
cd extracted/public_html && zip -qry ../../steadplan_YYYYMMDD_HHMMSS.zip . && cd ../..
```

## What was verified in the backup

- SQL: phpMyAdmin dump of DB `steadplanco_nov25`, MariaDB 10.11, 64 tables,
  prefix `sc_`, siteurl/home `https://steadplan.co.uk`, no CREATE DATABASE/USE,
  no DEFINERs — safe to import as-is.
- Zip: 14,409 files, 925MB uncompressed, all under `public_html/`. Theme
  `holdens` present. Plugins: advanced-custom-fields-pro, filter-everything-pro,
  wordfence, wordpress-seo, contact-form-7, contact-form-cfdb7, complianz-gdpr,
  popup-maker, wp-security-audit-log.
- `.htaccess` at site root contains `SetEnv API_KEY` + `SetEnv API_SECRET`
  (vehicle stock API creds) — survives migration with the files.

## Fixes to apply immediately after import (before testing)

1. `.user.ini` — `auto_prepend_file` hardcodes
   `/home/steadplanco/public_html/wordfence-waf.php` (old host). Update to the
   new Hostinger absolute path or PHP fatals on every request.
2. `.htaccess` — remove the cPanel `ea-php81` AddHandler block at the bottom
   (cPanel-specific; meaningless/harmful on Hostinger LiteSpeed). Set PHP 8.1
   in hPanel to match the old server, raise later if desired.
3. `wp-config.php` — `WP_DEBUG` is `true`; set to `false` for production.
4. Optional cleanup (ask Norton first): `put_file.log` (57MB), `wp-content/debug.log`
   (28MB), stray `wp-config copy.php` / `wp-config-2.php` / `wp-config-new.php` /
   `wp-config-ddev.php` / `new.php` — old-agency leftovers.

## Remaining plan

1. Token works → `hosting_listOrdersV1` + `hosting_listWebsitesV1`: confirm plan,
   check if steadplan.co.uk exists as a website. If nothing suitable, tell Norton
   exactly what to buy/click — don't guess. (Ask before any purchase; UK/EU
   datacenter if creating first website on a plan.)
2. `hosting_importWordpressWebsite` with domain, repacked zip, SQL dump.
3. Apply fixes above; verify wp-config DB credentials match the Hostinger DB.
4. Test on preview URL: pages, vehicle showroom, enquiry forms, wp-admin.
   Norton then logs into wp-admin, presses "Update Vehicles", waits for the
   completion prompt.
5. Licences (Norton): ACF Pro needs a new licence (old one was Holdens');
   Filter Everything Pro OK unlicensed for now; re-register Wordfence to
   info@northbearmedia.co.uk.
6. DNS at Namecheap (username steadplansales, Hal granting access): prepare
   A record changes to Hostinger IP, keep MX untouched. Do NOT change until
   Norton confirms tests pass.
