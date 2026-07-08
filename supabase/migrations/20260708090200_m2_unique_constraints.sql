-- Phase 2 remediation (M2): close the check-then-insert races on payslips,
-- YTD opening balances, and auto-generated payslip documents.
--
-- Root cause (AUDIT_PHASE2.md M2): src/lib/payrollApi.ts upsertPayslip /
-- upsertYtdOpening and src/lib/staffDocsApi.ts uploadPayslipDocument each
-- SELECT for an existing row by natural key, then INSERT if none was found,
-- else UPDATE. Two concurrent calls (a double-click, or two admins working
-- the same period) can both pass the "no existing row" check before either
-- INSERT lands, producing duplicate rows for what should be a single period.
--
-- Fix: add the missing UNIQUE constraints these tables should have had, then
-- switch the three client functions to a single .upsert(..., { onConflict })
-- call (see src/lib/payrollApi.ts and src/lib/staffDocsApi.ts in this same
-- change) — matching the pattern already used for leave_balances
-- (profile_id, year, leave_type) and student_attendance
-- (student_id, attendance_date).
--
-- NOTE: payslips, payroll_ytd_opening, and staff_documents are live-DB
-- "drift" tables — they were never captured in supabase/migrations/ (see
-- supabase/snapshots/live_schema_snapshot_20260706.md "KNOWN GAPS"). This
-- migration only ADDs constraints to those already-existing tables; it does
-- not attempt to (re)create them.
--
-- PRE-FLIGHT: if the race already produced duplicate rows on live data, the
-- ADD CONSTRAINT statements below will fail with a unique_violation. Before
-- applying, check for existing duplicates, e.g.:
--   select employee_id, year, month, count(*) from public.payslips
--     group by 1,2,3 having count(*) > 1;
--   select employee_id, year, count(*) from public.payroll_ytd_opening
--     group by 1,2 having count(*) > 1;
--   select owner_id, year, month, count(*) from public.staff_documents
--     where doc_type = 'payslip' group by 1,2,3 having count(*) > 1;
-- Resolve any hits (keep the newest row, per the app's own "last save wins"
-- semantics) before running this file against the live DB.

-- payslips: one row per employee per (year, month) period.
do $$
begin
  alter table public.payslips
    add constraint payslips_employee_year_month_key unique (employee_id, year, month);
exception
  when duplicate_object then null; -- constraint already exists, no-op
end $$;

-- payroll_ytd_opening: one opening-balance row per employee per year.
do $$
begin
  alter table public.payroll_ytd_opening
    add constraint payroll_ytd_opening_employee_year_key unique (employee_id, year);
exception
  when duplicate_object then null;
end $$;

-- staff_documents: one document per (owner_id, doc_type, year, month).
-- In standard SQL, UNIQUE treats NULL as distinct from NULL, so this is a
-- full-table (not partial) constraint but only ever actually constrains
-- doc_type = 'payslip' rows, where month is always a real integer — 'ea'
-- rows always have month = NULL and so never collide with each other under
-- this constraint, preserving the existing "multiple EA re-uploads per
-- year" behavior of the manual upload path (uploadStaffDocument, unaffected
-- by this finding). A full-table constraint (rather than the equivalent
-- partial index) is used deliberately so supabase-js's
-- .upsert(..., { onConflict: 'owner_id,doc_type,year,month' }) can target it
-- directly — PostgREST/Postgres ON CONFLICT inference cannot match a
-- partial index without repeating its WHERE predicate, which the
-- supabase-js upsert() API has no way to express.
do $$
begin
  alter table public.staff_documents
    add constraint staff_documents_owner_doctype_period_key unique (owner_id, doc_type, year, month);
exception
  when duplicate_object then null;
end $$;

-- ------------------------------------------------------------
-- Supporting guard: preserve payslips.created_by across the upsert switch.
--
-- The old client code (upsertPayslip in src/lib/payrollApi.ts) special-cased
-- this by stripping created_by from the payload on every update path, so a
-- later resave by a different admin never overwrote who originally created
-- the payslip. A plain .upsert(...) sends created_by on every call (insert
-- AND update) since it's a required field on PayslipInput, so without this
-- trigger a resave would silently reattribute the payslip to whoever saved
-- it last. This mirrors the existing touch_updated_at /
-- profiles_guard-style "guard trigger preserves a field" pattern already
-- used elsewhere in this schema.
create or replace function public.payslips_preserve_created_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := old.created_by;
  return new;
end;
$$;

drop trigger if exists payslips_preserve_created_by_trg on public.payslips;
create trigger payslips_preserve_created_by_trg
  before update on public.payslips
  for each row execute function public.payslips_preserve_created_by();
