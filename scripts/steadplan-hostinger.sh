#!/usr/bin/env bash
# Steadplan → Hostinger migration: direct Hostinger API client.
# Replaces the hostinger-* MCP tools when HOSTINGER_API_TOKEN is not baked into the
# environment — paste the token into chat, export it, and run this instead.
# Every request goes through curl, so the sandbox HTTPS proxy is honoured
# (the MCP package's tus-js-client upload does NOT honour it — do not use the MCP
# import tool for the big upload even if the token is present).
#
# Endpoints and upload protocol mirror hostinger-api-mcp@1.26.0
# src/core/runtime.js (handleWordpressWebsiteImport).
#
# Usage:
#   export HOSTINGER_API_TOKEN=...        # paste from user, never commit it
#   ./steadplan-hostinger.sh preflight
#   ./steadplan-hostinger.sh api GET /api/hosting/v1/websites
#   ./steadplan-hostinger.sh api POST /api/hosting/v1/websites '{"domain":"steadplan.co.uk","order_id":123}'
#   ./steadplan-hostinger.sh import steadplan.co.uk ./steadplan-website.zip ./steadplanco_nov25.sql
set -euo pipefail

BASE="https://developers.hostinger.com"
: "${HOSTINGER_API_TOKEN:?export HOSTINGER_API_TOKEN first (ask the user to paste it in chat)}"

hapi() { # hapi METHOD PATH [JSON_BODY]
  local method=$1 path=$2 body=${3:-}
  local args=(-sS --fail-with-body -X "$method" "$BASE$path"
    -H "Authorization: Bearer $HOSTINGER_API_TOKEN"
    -H "Content-Type: application/json")
  [[ -n $body ]] && args+=(--data "$body")
  curl "${args[@]}"
}

# TUS-style resumable upload, mirroring the MCP package: pre-create with POST
# (expects 201), then PATCH the body; on interruption HEAD for the offset and
# PATCH the remainder. X-Auth headers ride on every request.
tus_upload() { # tus_upload FILE UPLOAD_URL AUTH_KEY REST_AUTH_KEY
  local file=$1 upload_url=$2 auth_key=$3 rest_auth_key=$4
  local name size url
  name=$(basename "$file")
  size=$(stat -c%s "$file")
  url="${upload_url%/}/${name}?override=true"
  local auth=(-H "X-Auth: $auth_key" -H "X-Auth-Rest: $rest_auth_key" -H "upload-length: $size")

  echo "pre-create: $name ($size bytes)" >&2
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$url" "${auth[@]}" -H "upload-offset: 0" --data '')
  [[ $code == 201 ]] || { echo "pre-create failed with HTTP $code" >&2; return 1; }

  local offset=0 attempt=0
  while (( offset < size )); do
    (( attempt++ )); (( attempt > 6 )) && { echo "upload failed after $attempt attempts" >&2; return 1; }
    echo "PATCH from offset $offset (attempt $attempt)" >&2
    code=$(tail -c +"$((offset + 1))" "$file" | curl -sS -o /dev/null -w '%{http_code}' \
      -X PATCH "$url" "${auth[@]}" \
      -H "Tus-Resumable: 1.0.0" -H "Upload-Offset: $offset" \
      -H "Content-Type: application/offset+octet-stream" \
      --speed-time 120 --speed-limit 1024 --data-binary @-) || code=000
    if [[ $code == 204 || $code == 200 ]]; then offset=$size; break; fi
    sleep $(( attempt * 5 ))
    offset=$(curl -sS -o /dev/null -w '%{header{Upload-Offset}}' -I -X HEAD "$url" \
      "${auth[@]}" -H "Tus-Resumable: 1.0.0" || echo "$offset")
    offset=${offset:-0}
  done
  echo "uploaded: $name" >&2
}

cmd=${1:-help}
case "$cmd" in
  preflight)
    echo "== websites =="; hapi GET /api/hosting/v1/websites | jq .
    echo "== orders ==";   hapi GET /api/hosting/v1/orders | jq .
    ;;
  api)
    hapi "$2" "$3" "${4:-}" | jq .
    ;;
  import)
    domain=$2; zip=$3; sql=$4
    [[ -f $zip && -f $sql ]] || { echo "archive or sql file missing" >&2; exit 1; }

    echo "== resolve username for $domain =="
    username=$(hapi GET "/api/hosting/v1/websites?domain=$domain" | jq -er '.data[0].username')
    echo "username: $username"

    echo "== check website is empty =="
    is_empty=$(hapi GET "/api/hosting/v1/accounts/$username/domains/$domain/is-empty" | jq -er '.is_empty')
    [[ $is_empty == true ]] || { echo "Website is NOT empty — import needs an empty site. Stop and report." >&2; exit 1; }

    echo "== fetch upload credentials =="
    creds=$(hapi POST /api/hosting/v1/files/upload-urls "{\"username\":\"$username\",\"domain\":\"$domain\"}")
    upload_url=$(jq -er '.url' <<<"$creds")
    auth_key=$(jq -er '.auth_key' <<<"$creds")
    rest_auth_key=$(jq -er '.rest_auth_key' <<<"$creds")
    echo "upload host: $(sed -E 's|https?://([^/]+).*|\1|' <<<"$upload_url")"
    echo "(if the next step dies with 'CONNECT tunnel failed, response 403', this host needs adding to the network allowlist)"

    tus_upload "$zip" "$upload_url" "$auth_key" "$rest_auth_key"
    tus_upload "$sql" "$upload_url" "$auth_key" "$rest_auth_key"

    echo "== trigger WordPress import =="
    hapi POST "/api/hosting/v1/accounts/$username/websites/$domain/wordpress/import" \
      "{\"archive_path\":\"$(basename "$zip")\",\"sql_path\":\"$(basename "$sql")\"}" | jq .
    echo "Import triggered — extraction runs server-side, site appears in a few minutes."
    ;;
  *)
    grep '^#   ' "$0" | sed 's/^#   //'
    ;;
esac
