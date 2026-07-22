-- ADDENDUM, not explicitly requested — flagging for audit.
-- The Revenue KPI drill-down needs a per-invoice discount column (spec:
-- invoice list shows "date, customer, amount, discount, status"), which
-- zoho_invoices never stored. Adding it here rather than skip the column.
-- No RLS change needed — RLS is table-level, existing zoho_invoices policy
-- (20260721010000_zoho_mirror_rls.sql) already covers this new column.
-- NOTE: a normal incremental sync will NOT backfill this for
-- already-synced invoices (their last_modified_time hasn't changed, so
-- they're not re-pulled) — run a full sync (?mode=full) after deploying
-- the edge function change to populate it on existing rows.

alter table zoho_invoices add column if not exists discount numeric(12,2) not null default 0;
