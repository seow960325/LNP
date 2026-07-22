#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"; source zoho.env
curl -s -X POST 'https://nrioqwrhqczwomwgzmgp.supabase.co/functions/v1/zoho-sync' \
  -H "Authorization: Bearer $ZOHO_SYNC_TOKEN" -H "Content-Type: application/json" -d '{}'; echo
