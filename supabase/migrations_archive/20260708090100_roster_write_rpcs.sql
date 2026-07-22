-- Phase 2 remediation (H4/roster + M3): atomic duty-roster writes
--
-- Root cause (AUDIT_PHASE2.md H4, M3): weekly roster generation and manual
-- duty swaps were each a sequence of independent client-side .delete()/
-- .insert()/.update() calls on public.duty_assignments with no transaction.
-- A failure partway through either wiped a week's auto-generated roster with
-- nothing to replace it, or left a manual swap half-applied (one person
-- moved, the other not — breaking the one-duty-per-person-per-day
-- bijection the generator relies on).
--
-- Fix: move both write sequences into SECURITY INVOKER Postgres functions
-- (no SECURITY DEFINER — duty_assignments' existing admin(ALL) policy from
-- 20260702120000_rls_phase1b.sql already permits these writes for the
-- calling admin/super_admin, so RLS keeps working unchanged). The
-- pool-ordering/slot-assignment algorithm itself (src/lib/rosterAlgorithm.ts)
-- stays client-side and unchanged — only the final write is made atomic.

-- ============================================================
-- apply_roster_week
-- Replaces the client-side sequence in src/lib/rosterApi.ts generateWeek():
-- delete existing is_manual=false rows for the week -> insert the freshly
-- computed set. On any failure, the delete rolls back too — a failed
-- generate never leaves the week emptier than it started.
-- ============================================================
create or replace function public.apply_roster_week(
  p_week_start date,
  p_week_end date,
  p_rows jsonb
)
returns setof public.duty_assignments
language plpgsql
as $$
begin
  delete from public.duty_assignments
  where work_date >= p_week_start
    and work_date <= p_week_end
    and is_manual = false;

  insert into public.duty_assignments (work_date, duty_type_id, profile_id, is_manual)
  select
    (row->>'work_date')::date,
    (row->>'duty_type_id')::uuid,
    (row->>'profile_id')::uuid,
    false
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as row;

  return query
    select * from public.duty_assignments
    where work_date >= p_week_start and work_date <= p_week_end
    order by work_date, profile_id;
end;
$$;

revoke all on function public.apply_roster_week(date, date, jsonb) from public;
grant execute on function public.apply_roster_week(date, date, jsonb) to authenticated;

-- ============================================================
-- swap_duty_assignments
-- Replaces the client-side sequence in src/lib/rosterApi.ts
-- swapDutyAssignments(): UPDATE person A's row, then (only if that
-- succeeded) UPDATE person B's row. A failure between the two left one
-- person moved and the other not.
--
-- This version reads each person's CURRENT duty_type_id itself (SELECT ...
-- FOR UPDATE, locking both rows for the duration of the swap) rather than
-- trusting duty_type_id values the client read earlier in the page's
-- lifetime — closing the "stale client state" gap called out in M3, and
-- serializing two overlapping swap requests that touch the same rows
-- instead of letting them race.
-- ============================================================
create or replace function public.swap_duty_assignments(
  p_work_date date,
  p_profile_a uuid,
  p_profile_b uuid
)
returns setof public.duty_assignments
language plpgsql
as $$
declare
  v_duty_a uuid;
  v_duty_b uuid;
begin
  if p_profile_a = p_profile_b then
    return query
      select * from public.duty_assignments
      where work_date = p_work_date and profile_id = p_profile_a;
    return;
  end if;

  select duty_type_id into v_duty_a
  from public.duty_assignments
  where work_date = p_work_date and profile_id = p_profile_a
  for update;

  select duty_type_id into v_duty_b
  from public.duty_assignments
  where work_date = p_work_date and profile_id = p_profile_b
  for update;

  if v_duty_a is null or v_duty_b is null then
    raise exception 'Both people must already have a duty assignment on % to swap.', p_work_date;
  end if;

  update public.duty_assignments
    set duty_type_id = v_duty_b, is_manual = true
    where work_date = p_work_date and profile_id = p_profile_a;

  update public.duty_assignments
    set duty_type_id = v_duty_a, is_manual = true
    where work_date = p_work_date and profile_id = p_profile_b;

  return query
    select * from public.duty_assignments
    where work_date = p_work_date and profile_id in (p_profile_a, p_profile_b);
end;
$$;

revoke all on function public.swap_duty_assignments(date, uuid, uuid) from public;
grant execute on function public.swap_duty_assignments(date, uuid, uuid) to authenticated;
