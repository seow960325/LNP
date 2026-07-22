# Archived migrations

These 24 migration files (2026-07-01 through 2026-07-22) have been squashed into
a single baseline: `supabase/migrations/20260101000000_remote_baseline.sql`,
produced via `supabase db dump --linked --schema public` against the live
project (`nrioqwrhqczwomwgzmgp`).

They are kept here for history only and are NOT applied by
`supabase db reset` or `supabase migration up` — only files directly under
`supabase/migrations/` are.

Remote migration history on the live project still references these by
timestamp. Reconciling that history (`supabase migration repair`) is a
separate, manual step — see the repair commands printed alongside this
baseline's rollout.
