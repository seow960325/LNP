#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ -f zoho.env ] || { echo "fill ops/zoho.env first"; exit 1; }
source zoho.env
CODE="${1:-}"; [ -n "$CODE" ] || { echo "Usage: ops/zoho-mint.sh <CODE>"; exit 1; }
RESP=$(curl -s -X POST https://accounts.zoho.com/oauth/v2/token \
  -d grant_type=authorization_code -d client_id="$ZOHO_CLIENT_ID" \
  -d client_secret="$ZOHO_CLIENT_SECRET" -d redirect_uri=https://www.zoho.com -d code="$CODE")
RT=$(printf '%s' "$RESP" | grep -o '"refresh_token":"[^"]*"' | cut -d'"' -f4 || true)
if [ -z "$RT" ]; then echo "STOP - no refresh_token:"; printf '%s\n' "$RESP"; \
  echo "-> revoke Self Client in Zoho My Account>Security>Third-Party Apps, regenerate a fresh code, retry."; exit 1; fi
echo "got refresh_token; setting secret + deploying..."
supabase secrets set ZOHO_REFRESH_TOKEN="$RT"
supabase functions deploy zoho-sync
echo "done -> run ops/sync-now.sh"
