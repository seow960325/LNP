#!/usr/bin/env bash
# Center Ops — DB backup (C3). No Docker; uses pg_dump directly.
#
# SECURITY: the DB connection string contains the DB password (account-level
# credential). It is NEVER written to disk or git. Supply it at run time via
# the SUPABASE_DB_URL env var, then unset it.
#
# USAGE:
#   export SUPABASE_DB_URL="postgresql://postgres.[ref]:[PW]@...:5432/postgres"
#   ./backup.sh
#   unset SUPABASE_DB_URL
#
# OUTPUT:
#   1. schema-only dump  -> committed to repo (structure only, no user data)
#      supabase/snapshots/schema_dump_YYYYMMDD.sql
#   2. full data dump    -> OUTSIDE repo, gitignored, the real backup
#      ~/center-ops-backups/full_dump_YYYYMMDD_HHMMSS.sql.gz

set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  read -r -p "Paste Session pooler connection string then Enter: " SUPABASE_DB_URL
fi

# Strip whitespace and any quote characters (straight or smart) from both ends.
SUPABASE_DB_URL="${SUPABASE_DB_URL#"${SUPABASE_DB_URL%%[![:space:]]*}"}"
SUPABASE_DB_URL="${SUPABASE_DB_URL%"${SUPABASE_DB_URL##*[![:space:]]}"}"
SUPABASE_DB_URL="$(printf '%s' "$SUPABASE_DB_URL" | sed $'s/^[\'"“”‘’]*//; s/[\'"“”‘’]*$//')"

if [[ -z "$SUPABASE_DB_URL" ]]; then
  echo "ERROR: no connection string provided." >&2
  exit 1
fi

if [[ "${SUPABASE_DB_URL:0:11}" != "postgresql:" ]]; then
  echo "ERROR: must start with postgresql:// — got: [${SUPABASE_DB_URL:0:14}]" >&2
  exit 1
fi

STAMP_DATE="$(date +%Y%m%d)"
STAMP_FULL="$(date +%Y%m%d_%H%M%S)"

REPO_DIR="$HOME/projects/center-ops"
SCHEMA_OUT="$REPO_DIR/supabase/snapshots/schema_dump_${STAMP_DATE}.sql"

BACKUP_DIR="$HOME/center-ops-backups"
FULL_OUT="$BACKUP_DIR/full_dump_${STAMP_FULL}.sql.gz"

mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$SCHEMA_OUT")"

echo "==> 1/2 schema-only dump (committable, no data)"
pg_dump "$SUPABASE_DB_URL" \
  --schema-only \
  --no-owner \
  --no-privileges \
  --schema=public \
  --schema=auth \
  --file="$SCHEMA_OUT"
echo "    wrote $SCHEMA_OUT ($(wc -l < "$SCHEMA_OUT") lines)"

echo "==> 2/2 full data dump (gitignored, the real backup)"
pg_dump "$SUPABASE_DB_URL" \
  --no-owner \
  --no-privileges \
  --schema=public \
  --schema=auth \
  | gzip > "$FULL_OUT"
echo "    wrote $FULL_OUT ($(du -h "$FULL_OUT" | cut -f1))"

echo
echo "==> retention: keeping last 14 full dumps, deleting older"
ls -1t "$BACKUP_DIR"/full_dump_*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -v

echo
echo "DONE."
echo "  Schema (commit this):   $SCHEMA_OUT"
echo "  Full backup (private):  $FULL_OUT"
echo
echo "REMINDER: unset SUPABASE_DB_URL now."
