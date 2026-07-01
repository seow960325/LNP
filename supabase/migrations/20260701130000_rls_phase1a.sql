-- ============================================================================
-- Center Ops — Spec #5: Row Level Security, all Phase 1A tables (RECONCILED)
-- Supersedes: 20260701_kudos_admin_read_policy.sql,
--             20260701120000_phase1a_rls_policies.sql,
--             20260701130000_kudos_admin_full_read.sql
-- Admin (Lydia) reads ALL kudos in own center; teacher/staff/parent/shareholder
-- read own sent/received only. Idempotent — safe to re-run.
-- ============================================================================

-- ---------- Helper functions (SECURITY DEFINER, no recursion) ----------
create or replace function public.current_user_center_id()
returns uuid language sql stable security definer set search_path = public as $$
  select center_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_user_is_active()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select active from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin' and active)
$$;

create or replace function public.is_admin_or_super()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
    where id = auth.uid() and role in ('admin','super_admin') and active)
$$;

revoke all on function public.current_user_center_id(),
  public.current_user_is_active(), public.is_super_admin(),
  public.is_admin_or_super() from public;
grant execute on function public.current_user_center_id(),
  public.current_user_is_active(), public.is_super_admin(),
  public.is_admin_or_super() to authenticated;

-- ---------- Enable RLS ----------
alter table public.centers      enable row level security;
alter table public.profiles     enable row level security;
alter table public.kudos_values enable row level security;
alter table public.kudos        enable row level security;
alter table public.board_items  enable row level security;

-- ---------- centers ----------
drop policy if exists centers_select on public.centers;
create policy centers_select on public.centers for select to authenticated
  using ( is_super_admin() or id = current_user_center_id() );

drop policy if exists centers_insert on public.centers;
create policy centers_insert on public.centers for insert to authenticated
  with check ( is_super_admin() );

drop policy if exists centers_update on public.centers;
create policy centers_update on public.centers for update to authenticated
  using  ( is_super_admin() or (is_admin_or_super() and id = current_user_center_id()) )
  with check ( is_super_admin() or (is_admin_or_super() and id = current_user_center_id()) );

drop policy if exists centers_delete on public.centers;
create policy centers_delete on public.centers for delete to authenticated
  using ( is_super_admin() );

-- ---------- profiles ----------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or is_super_admin()
    or (current_user_is_active() and center_id = current_user_center_id())
  );

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check ( is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id()) );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using  ( is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
    or id = auth.uid() )
  with check ( is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
    or id = auth.uid() );

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete to authenticated
  using ( is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id()
        and role not in ('admin','super_admin')) );

-- prevent privilege escalation (column-level, via trigger)
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.role = 'super_admin') and not is_super_admin() then
    raise exception 'Only super_admin may assign the super_admin role';
  end if;
  if tg_op = 'UPDATE' then
    if new.id = auth.uid() and not is_admin_or_super() then
      if new.role is distinct from old.role
         or new.center_id is distinct from old.center_id
         or new.active is distinct from old.active then
        raise exception 'You cannot change your own role, center, or active status';
      end if;
    end if;
    if not is_super_admin() and (new.center_id is distinct from old.center_id) then
      raise exception 'Only super_admin may change a profile center';
    end if;
    if not is_super_admin() and old.role = 'super_admin' then
      raise exception 'Only super_admin may modify a super_admin profile';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists profiles_guard_trg on public.profiles;
create trigger profiles_guard_trg before insert or update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------- kudos_values ----------
drop policy if exists kudos_values_select on public.kudos_values;
create policy kudos_values_select on public.kudos_values for select to authenticated
  using ( is_super_admin()
    or (current_user_is_active() and center_id = current_user_center_id()) );

drop policy if exists kudos_values_write on public.kudos_values;
create policy kudos_values_write on public.kudos_values for all to authenticated
  using  ( is_super_admin() or (is_admin_or_super() and center_id = current_user_center_id()) )
  with check ( is_super_admin() or (is_admin_or_super() and center_id = current_user_center_id()) );

-- ---------- kudos ----------
-- Admin/super_admin read ALL in own center; everyone else own sent/received only.
drop policy if exists kudos_select on public.kudos;
create policy kudos_select on public.kudos for select to authenticated
  using (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
    or from_user_id = auth.uid()
    or to_user_id = auth.uid()
  );

drop policy if exists kudos_insert on public.kudos;
create policy kudos_insert on public.kudos for insert to authenticated
  with check ( from_user_id = auth.uid()
    and center_id = current_user_center_id()
    and current_user_is_active() );

drop policy if exists kudos_delete on public.kudos;
create policy kudos_delete on public.kudos for delete to authenticated
  using ( is_super_admin() or from_user_id = auth.uid() );
-- (no update policy = updates denied for everyone except service role)

create or replace function public.kudos_top_recipient()
returns table (to_user_id uuid, full_name text, kudos_count bigint)
language sql stable security definer set search_path = public as $$
  select k.to_user_id, p.full_name, count(*) as kudos_count
  from public.kudos k
  join public.profiles p on p.id = k.to_user_id
  where k.center_id = current_user_center_id()
  group by k.to_user_id, p.full_name
  order by kudos_count desc, p.full_name asc
  limit 1
$$;
revoke all on function public.kudos_top_recipient() from public;
grant execute on function public.kudos_top_recipient() to authenticated;

-- ---------- board_items ----------
drop policy if exists board_items_select on public.board_items;
create policy board_items_select on public.board_items for select to authenticated
  using ( is_super_admin()
    or (current_user_is_active() and center_id = current_user_center_id()) );

drop policy if exists board_items_insert on public.board_items;
create policy board_items_insert on public.board_items for insert to authenticated
  with check ( current_user_is_active()
    and center_id = current_user_center_id()
    and author_id = auth.uid() );

drop policy if exists board_items_update on public.board_items;
create policy board_items_update on public.board_items for update to authenticated
  using  ( is_super_admin()
    or (current_user_is_active() and center_id = current_user_center_id()) )
  with check ( is_super_admin()
    or (current_user_is_active() and center_id = current_user_center_id()) );

-- non-author, non-admin may change ONLY status (mark done)
create or replace function public.board_items_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin_or_super() or old.author_id = auth.uid() then
    return new;
  end if;
  if new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.type is distinct from old.type
     or new.priority is distinct from old.priority
     or new.assigned_to is distinct from old.assigned_to
     or new.author_id is distinct from old.author_id
     or new.date is distinct from old.date
     or new.center_id is distinct from old.center_id then
    raise exception 'You may only mark items done; editing is restricted to author or admin';
  end if;
  return new;
end; $$;
drop trigger if exists board_items_guard_trg on public.board_items;
create trigger board_items_guard_trg before update on public.board_items
  for each row execute function public.board_items_guard();

drop policy if exists board_items_delete on public.board_items;
create policy board_items_delete on public.board_items for delete to authenticated
  using ( is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
    or (current_user_is_active() and center_id = current_user_center_id()
        and author_id = auth.uid()) );
