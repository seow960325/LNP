-- duty_assignments.staff_member_id is ON DELETE CASCADE, so deleting a staff
-- member would silently destroy their duty history — this trigger blocks
-- that. Deactivation is the intended path for anyone who has ever worked
-- here; deletion exists only to clear empty placeholder rows created by
-- mistake.

create or replace function public.staff_members_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  duty_count int;
begin
  if old.profile_id is not null then
    raise exception 'Cannot delete a staff member with a linked login. Deactivate instead.';
  end if;

  select count(*) into duty_count
  from public.duty_assignments
  where staff_member_id = old.id;

  if duty_count > 0 then
    raise exception 'Cannot delete: % duty assignment(s) exist. Deactivate instead.', duty_count;
  end if;

  return old;
end;
$$;

drop trigger if exists staff_members_delete_guard on public.staff_members;
create trigger staff_members_delete_guard
before delete on public.staff_members
for each row execute function public.staff_members_delete_guard();

drop policy if exists staff_members_delete on public.staff_members;
create policy staff_members_delete on public.staff_members
for delete
using (is_super_admin());
