#!/usr/bin/env bash
# Steadplan WordPress REST helper — pinned to the Steadplan site only.
# Usage: steadplan-wp.sh METHOD PATH [JSON_FILE]
#   e.g. steadplan-wp.sh GET  wp/v2/pages?slug=conversions
#        steadplan-wp.sh POST wp/v2/pages/1353 payload.json
# Auth: STEADPLAN_WP_AUTH env var ("user:app-password"), else ~/.steadplan-wp-auth.
set -euo pipefail

BASE="https://darkcyan-dog-182593.hostingersite.com/wp-json"

METHOD="${1:?METHOD required (GET/POST)}"
APIPATH="${2:?PATH required, e.g. wp/v2/pages/1353}"
DATAFILE="${3:-}"

case "$METHOD" in
  GET|POST) ;;
  *) echo "only GET and POST are supported" >&2; exit 2 ;;
esac
case "$APIPATH" in
  *..*|/*|*://*) echo "invalid path" >&2; exit 2 ;;
esac

AUTH="${STEADPLAN_WP_AUTH:-}"
if [ -z "$AUTH" ] && [ -f "$HOME/.steadplan-wp-auth" ]; then
  AUTH="$(cat "$HOME/.steadplan-wp-auth")"
fi
[ -n "$AUTH" ] || { echo "no auth: set STEADPLAN_WP_AUTH or ~/.steadplan-wp-auth" >&2; exit 2; }

args=(-sS -w '\nHTTP %{http_code}\n' -X "$METHOD" --user "$AUTH" "$BASE/$APIPATH")
if [ -n "$DATAFILE" ]; then
  args+=(-H 'Content-Type: application/json' --data @"$DATAFILE")
fi
exec curl "${args[@]}"
