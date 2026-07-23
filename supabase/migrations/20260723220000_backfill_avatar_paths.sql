-- uploadAvatar used to store a full public URL from getPublicUrl (avatars was
-- a public bucket); it now stores a bare storage path resolved via
-- createSignedUrl at render time (see resolveAvatarUrl in
-- src/lib/profileApi.ts, and 20260723210000_capture_storage_buckets_and_policies.sql,
-- which flipped avatars to public = false). This normalises any legacy
-- full-URL rows to the new path format, matching uploadAvatar's fixed
-- `${userId}/avatar` path convention. Idempotent — rows already holding a
-- path don't start with http(s):// so they don't match the WHERE clause
-- below; replay against an already-converged database is a no-op.
--
-- public.profiles has a profiles_guard BEFORE INSERT OR UPDATE trigger
-- (20260101000000_remote_baseline.sql) that raises "Only super_admin may
-- modify a super_admin profile" on UPDATE whenever the row being touched has
-- role = 'super_admin' and is_super_admin() is false for the caller.
-- is_super_admin() resolves auth.uid() from the request.jwt.claims GUC, so
-- if a rebuilt/restored database still has a super_admin row with a legacy
-- http(s) avatar_url, this UPDATE must run inside a transaction that sets
-- request.jwt.claims to a super_admin's profile id first, e.g.:
--   begin;
--   set local request.jwt.claims = '{"sub":"<a super_admin profile id>"}';
--   update public.profiles set avatar_url = id::text || '/avatar' where avatar_url like 'http%';
--   commit;
-- Running this as a plain postgres/service-role connection with no JWT claims
-- set will fail on exactly that row (all other rows are unaffected, since
-- profiles_guard only gates rows where old.role = 'super_admin').

update public.profiles
set avatar_url = id::text || '/avatar'
where avatar_url like 'http%';
