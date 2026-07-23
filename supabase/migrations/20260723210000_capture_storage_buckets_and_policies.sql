-- Capture the six storage buckets and their storage.objects RLS policies,
-- which have existed live since the C1/C2 private-bucket fix (commit
-- 5733ab4) but were never in a migration. Confirmed live via
-- `supabase db query --linked` against storage.buckets and pg_policies on
-- 2026-07-23 — not from supabase/snapshots/live_schema_snapshot_20260706.md,
-- which is stale (e.g. it implies directory-photos has size/mime limits;
-- live has both set to NULL).
--
-- THE public FLAG IS THE SECURITY-CRITICAL FIELD. C1/C2 set student-photos
-- and attendance-photos to public = false specifically so children's photos
-- are only reachable through signed URLs, not a public CDN path. A rebuild
-- that silently restores the dashboard default of public = true on bucket
-- creation would re-expose those photos to anyone with a guessable object
-- path, with no error or warning — this migration is what prevents that.
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
  ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp']),
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
  for insert to public
  with check (bucket_id = 'student-photos' and current_user_is_active() and is_admin_or_super());

drop policy if exists "student_photos_admin_update" on storage.objects;
create policy "student_photos_admin_update" on storage.objects
  for update to public
  using (bucket_id = 'student-photos' and current_user_is_active() and is_admin_or_super())
  with check (bucket_id = 'student-photos' and current_user_is_active() and is_admin_or_super());

drop policy if exists "student_photos_admin_delete" on storage.objects;
create policy "student_photos_admin_delete" on storage.objects
  for delete to public
  using (bucket_id = 'student-photos' and current_user_is_active() and is_admin_or_super());

-- attendance-photos
drop policy if exists "attendance_photos_read" on storage.objects;
create policy "attendance_photos_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'attendance-photos' and current_user_is_active());

drop policy if exists "attendance_photos_staff_write" on storage.objects;
create policy "attendance_photos_staff_write" on storage.objects
  for insert to public
  with check (bucket_id = 'attendance-photos' and current_user_is_active());

drop policy if exists "attendance_photos_staff_update" on storage.objects;
create policy "attendance_photos_staff_update" on storage.objects
  for update to public
  using (bucket_id = 'attendance-photos' and current_user_is_active())
  with check (bucket_id = 'attendance-photos' and current_user_is_active());

-- avatars
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select to public
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
  for select to public
  using (bucket_id = 'staff-docs' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin_or_super()));

drop policy if exists "staffdocs_insert" on storage.objects;
create policy "staffdocs_insert" on storage.objects
  for insert to public
  with check (bucket_id = 'staff-docs' and is_admin_or_super());

drop policy if exists "staffdocs_update" on storage.objects;
create policy "staffdocs_update" on storage.objects
  for update to public
  using (bucket_id = 'staff-docs' and is_admin_or_super())
  with check (bucket_id = 'staff-docs' and is_admin_or_super());

drop policy if exists "staffdocs_delete" on storage.objects;
create policy "staffdocs_delete" on storage.objects
  for delete to public
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
