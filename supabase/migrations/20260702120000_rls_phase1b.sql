-- Phase 1B RLS policies + guard triggers
-- Tables: roster_shifts, attendance, requests (RLS already enabled)
-- Reuses Phase 1A helper fns: current_user_center_id, current_user_is_active, is_super_admin, is_admin_or_super

-- ============================================================
-- roster_shifts
--   staff/teacher: read ALL shifts in own center
--   admin/super_admin: full CRUD in own center; super_admin all centers
-- ============================================================
create policy roster_shifts_select on public.roster_shifts
  as permissive for select to authenticated
  using (
    is_super_admin()
    or (current_user_is_active() and center_id = current_user_center_id())
  );

create policy roster_shifts_insert on public.roster_shifts
  as permissive for insert to authenticated
  with check (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
  );

create policy roster_shifts_update on public.roster_shifts
  as permissive for update to authenticated
  using (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
  )
  with check (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
  );

create policy roster_shifts_delete on public.roster_shifts
  as permissive for delete to authenticated
  using (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
  );

-- ============================================================
-- attendance
--   staff: read own; insert own; update own OPEN row (guard trigger locks written timestamps)
--   admin/super_admin: read + correct all in center
-- ============================================================
create policy attendance_select on public.attendance
  as permissive for select to authenticated
  using (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
    or (current_user_is_active() and center_id = current_user_center_id() and user_id = auth.uid())
  );

create policy attendance_insert on public.attendance
  as permissive for insert to authenticated
  with check (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
    or (current_user_is_active() and center_id = current_user_center_id() and user_id = auth.uid())
  );

create policy attendance_update on public.attendance
  as permissive for update to authenticated
  using (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
    or (current_user_is_active() and center_id = current_user_center_id() and user_id = auth.uid())
  )
  with check (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
    or (current_user_is_active() and center_id = current_user_center_id() and user_id = auth.uid())
  );

create policy attendance_delete on public.attendance
  as permissive for delete to authenticated
  using (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
  );

-- ============================================================
-- requests
--   staff: create own; read own; edit/cancel own WHILE pending (guard trigger enforces)
--   admin/super_admin: read all in center; approve/reject (update)
-- ============================================================
create policy requests_select on public.requests
  as permissive for select to authenticated
  using (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
    or (current_user_is_active() and center_id = current_user_center_id() and user_id = auth.uid())
  );

create policy requests_insert on public.requests
  as permissive for insert to authenticated
  with check (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
    or (current_user_is_active() and center_id = current_user_center_id() and user_id = auth.uid())
  );

create policy requests_update on public.requests
  as permissive for update to authenticated
  using (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
    or (current_user_is_active() and center_id = current_user_center_id() and user_id = auth.uid())
  )
  with check (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
    or (current_user_is_active() and center_id = current_user_center_id() and user_id = auth.uid())
  );

create policy requests_delete on public.requests
  as permissive for delete to authenticated
  using (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
    or (current_user_is_active() and center_id = current_user_center_id() and user_id = auth.uid() and status = 'pending')
  );

-- ============================================================
-- GUARD TRIGGER: attendance
--   Non-admin cannot rewrite a timestamp once it has been set.
--   Admin/super_admin bypass (they correct entries).
-- ============================================================
create or replace function public.attendance_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if is_admin_or_super() then
    return new;
  end if;
  -- non-admin: block changes to center_id / user_id
  if new.center_id is distinct from old.center_id
     or new.user_id is distinct from old.user_id then
    raise exception 'Cannot change center_id or user_id on attendance';
  end if;
  -- non-admin: once clock_in is set, it cannot be changed
  if old.clock_in is not null and (new.clock_in is distinct from old.clock_in) then
    raise exception 'clock_in is locked once recorded';
  end if;
  -- non-admin: once clock_out is set, it cannot be changed
  if old.clock_out is not null and (new.clock_out is distinct from old.clock_out) then
    raise exception 'clock_out is locked once recorded';
  end if;
  -- non-admin: cannot change source
  if new.source is distinct from old.source then
    raise exception 'Cannot change source';
  end if;
  return new;
end;
$$;

create trigger attendance_guard_trg
  before update on public.attendance
  for each row execute function public.attendance_guard();

-- ============================================================
-- GUARD TRIGGER: requests
--   Non-admin can only edit/cancel while status = 'pending',
--   cannot change status themselves, cannot touch review fields.
--   Admin/super_admin bypass (they approve/reject).
-- ============================================================
create or replace function public.requests_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if is_admin_or_super() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- non-admin: new requests must start pending + unreviewed + owned by self
    if new.user_id is distinct from auth.uid() then
      raise exception 'Cannot create a request for another user';
    end if;
    if new.status is distinct from 'pending' then
      raise exception 'New requests must start as pending';
    end if;
    if new.reviewed_by is not null or new.reviewed_at is not null then
      raise exception 'Cannot set review fields on a new request';
    end if;
    return new;
  end if;

  -- UPDATE branch
  if new.center_id is distinct from old.center_id
     or new.user_id is distinct from old.user_id then
    raise exception 'Cannot change center_id or user_id on request';
  end if;
  if old.status is distinct from 'pending' then
    raise exception 'Cannot modify a request that has been reviewed';
  end if;
  if new.status is distinct from old.status then
    raise exception 'Only an admin can change request status';
  end if;
  if new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Cannot set review fields';
  end if;
  return new;
end;
$$;

create trigger requests_guard_trg
  before insert or update on public.requests
  for each row execute function public.requests_guard();
