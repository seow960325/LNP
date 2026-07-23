-- H3: stop leaking profiles.phone/email and staff_members.phone/email to the
-- frontend via the anon/authenticated Postgres roles. These two functions
-- already exist live (this is a CAPTURE, not a new design) — get_own_profile()
-- lets a user read their own full profile row (including their own contact
-- fields) via SECURITY DEFINER, bypassing the column-level revoke below.
-- staff_contacts() returns phone/email for a center's staff_members, gated by
-- the caller's own role (super_admin/admin/teacher/staff, active) — it
-- returns zero rows for callers who shouldn't see contacts (e.g. parent,
-- shareholder, deactivated accounts).
--
-- WARNING: the grants below are COLUMN-level, not table-level. Any future
-- `ALTER TABLE ... ADD COLUMN` on public.profiles or public.staff_members is
-- invisible to anon/authenticated (and therefore to the frontend) until that
-- column is explicitly added to the GRANT SELECT (...) column list here. A
-- table-level `GRANT SELECT ON public.profiles TO authenticated` would silently
-- re-expose phone/email to every future column added without review — do not
-- add one.

CREATE OR REPLACE FUNCTION "public"."get_own_profile"() RETURNS "public"."profiles"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select p.* from public.profiles p where p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION "public"."staff_contacts"("p_center_id" "uuid") RETURNS TABLE("staff_member_id" "uuid", "phone" "text", "email" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select sm.id, sm.phone::text, sm.email::text
  from public.staff_members sm
  where sm.center_id = p_center_id
    and exists (
      select 1 from public.profiles me
      where me.id = auth.uid()
        and me.active
        and me.role in ('super_admin','admin','teacher','staff','shareholder')
        and (me.role = 'super_admin' or me.center_id = p_center_id)
    );
$$;

revoke select on public.profiles from anon, authenticated;
grant select (id, center_id, full_name, role, title, avatar_url, active, created_at, must_change_password, is_paid_employee, is_app_owner, in_duty_roster) on public.profiles to authenticated;

revoke select on public.staff_members from anon, authenticated;
grant select (id, center_id, profile_id, full_name, job_title, zoho_account_id, in_duty_roster, active, notes, created_at, display_name, job_title_id, in_directory, photo_path) on public.staff_members to authenticated;
