-- Capture the six storage buckets and their storage.objects RLS policies,
-- which have existed live since the C1/C2 private-bucket fix (commit
-- 5733ab4) but were never in a migration. Re-confirmed live via
-- `supabase db query --linked` against storage.buckets and pg_policies on
-- 2026-07-23 (this file was rewritten after live drifted further from the
-- first capture) — not from supabase/snapshots/live_schema_snapshot_20260706.md,
-- which is stale (e.g. it implies directory-photos has size/mime limits;
-- live has both set to NULL).
--
-- THE public FLAG IS THE SECURITY-CRITICAL FIELD. Every bucket is private
-- (public = false), including avatars — the frontend was migrated to
-- resolve avatar_url via signed URLs first (see resolveAvatarUrl in
-- src/lib/profileApi.ts), then avatars was flipped from public = true to
-- false. A rebuild that silently restores the dashboard default of
-- public = true on bucket creation would re-expose whichever of these six
-- buckets it hits — for student-photos/attendance-photos that's children's
-- photos — to anyone with a guessable object path, with no error or
-- warning. This migration is what prevents that.
--
-- All twenty storage.objects policies are TO authenticated. Ten of them
-- (avatars_public_read; student_photos_admin_insert/update/delete;
-- attendance_photos_staff_write/update; staffdocs_read/insert/update/delete)
-- were TO public until this recapture — their USING/WITH CHECK clauses are
-- unchanged, only the role list tightened.
--
-- Bucket inserts use ON CONFLICT DO UPDATE so replay converges instead of
-- failing if the bucket already exists (e.g. re-running against a database
-- that was rebuilt via dashboard bucket creation first).
-- Policies use DROP POLICY IF EXISTS immediately before each CREATE POLICY
-- for the same idempotency.

-- 1. Buckets ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('student-photos', 'student-photos', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('attendance-photos', 'attendance-photos', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('avatars', 'avatars', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('invoice-receipts', 'invoice-receipts', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf']),
  ('staff-docs', 'staff-docs', false, 5242880, array['application/pdf']),
  ('directory-photos', 'directory-photos', false, null, null)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2. storage.objects policies --------------------------------------------

-- student-photos
drop policy if exists "student_photos_read" on storage.objects;
create policy "student_photos_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'student-photos' and current_user_is_active());

drop policy if exists "student_photos_admin_insert" on storage.objects;
create policy "student_photos_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'student-photos' and current_user_is_active() and is_admin_or_super());

drop policy if exists "student_photos_admin_update" on storage.objects;
create policy "student_photos_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'student-photos' and current_user_is_active() and is_admin_or_super())
  with check (bucket_id = 'student-photos' and current_user_is_active() and is_admin_or_super());

drop policy if exists "student_photos_admin_delete" on storage.objects;
create policy "student_photos_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'student-photos' and current_user_is_active() and is_admin_or_super());

-- attendance-photos
drop policy if exists "attendance_photos_read" on storage.objects;
create policy "attendance_photos_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'attendance-photos' and current_user_is_active());

drop policy if exists "attendance_photos_staff_write" on storage.objects;
create policy "attendance_photos_staff_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attendance-photos' and current_user_is_active());

drop policy if exists "attendance_photos_staff_update" on storage.objects;
create policy "attendance_photos_staff_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'attendance-photos' and current_user_is_active())
  with check (bucket_id = 'attendance-photos' and current_user_is_active());

-- avatars
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- invoice-receipts
drop policy if exists "invoice_receipts_admin_all" on storage.objects;
create policy "invoice_receipts_admin_all" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'invoice-receipts'
    and (select profiles.role from profiles where profiles.id = auth.uid()) = any (array['admin'::user_role, 'super_admin'::user_role])
  )
  with check (
    bucket_id = 'invoice-receipts'
    and (select profiles.role from profiles where profiles.id = auth.uid()) = any (array['admin'::user_role, 'super_admin'::user_role])
  );

-- staff-docs
drop policy if exists "staffdocs_read" on storage.objects;
create policy "staffdocs_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'staff-docs' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin_or_super()));

drop policy if exists "staffdocs_insert" on storage.objects;
create policy "staffdocs_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'staff-docs' and is_admin_or_super());

drop policy if exists "staffdocs_update" on storage.objects;
create policy "staffdocs_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'staff-docs' and is_admin_or_super())
  with check (bucket_id = 'staff-docs' and is_admin_or_super());

drop policy if exists "staffdocs_delete" on storage.objects;
create policy "staffdocs_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'staff-docs' and is_admin_or_super());

-- directory-photos
drop policy if exists "directory_photos_read" on storage.objects;
create policy "directory_photos_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'directory-photos');

drop policy if exists "directory_photos_insert" on storage.objects;
create policy "directory_photos_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'directory-photos' and is_admin_or_super());

drop policy if exists "directory_photos_update" on storage.objects;
create policy "directory_photos_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'directory-photos' and is_admin_or_super());

drop policy if exists "directory_photos_delete" on storage.objects;
create policy "directory_photos_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'directory-photos' and is_admin_or_super());
