-- Capture drift that accumulated on the live database outside of migrations.
-- Confirmed live via `supabase db diff --linked` on 2026-07-23; four real
-- items survive after excluding function-body diffs that are pure
-- line-ending (CRLF vs LF) false positives.
--
-- 1. pg_cron: schedules the zoho-sync nightly/weekly cron jobs (see
--    ops/RUNBOOK.md). Installed live into pg_catalog (confirmed via db diff
--    against the live project, not assumed) — Supabase's own convention for
--    this extension, distinct from pg_net below. Without it, a rebuilt
--    database has no scheduler at all, so the jobs in cron.job (captured
--    separately, not schema) would have nothing to run on.
-- 2. pg_net: pg_cron's zoho-sync cron jobs call the zoho-sync edge function
--    via pg_net.http_post. A database rebuilt from migrations without this
--    extension would have cron jobs that fire and silently fail every time.
-- 3. profiles.email: baseline still declares this column, but it was
--    dropped from live during the H3 work (see
--    20260723090000_h3_contact_column_privileges.sql, which already omits
--    email from its grant column list — replay order is safe since this
--    migration is filenamed after it). profiles.email is unused app-wide;
--    staff_members.email is the source of truth.
-- 4. idx_students_class_id: an index on students.class_id that exists live
--    but was never captured in a migration. Missing it means a rebuilt
--    database silently loses this index and takes the perf hit on any
--    class-scoped student query.

create extension if not exists pg_cron with schema pg_catalog;

create extension if not exists pg_net with schema public;

alter table public.profiles drop column if exists email;

create index if not exists idx_students_class_id on public.students using btree (class_id);
