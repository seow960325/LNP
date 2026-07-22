-- Roster migration: duty_assignments profile_id -> staff_member_id
-- Lets staff WITHOUT a login account be rostered.
-- Applied live 2026-07-22. profile_id kept this round as fallback, dropped later.
BEGIN;

ALTER TABLE public.duty_assignments
  ADD COLUMN IF NOT EXISTS staff_member_id uuid;

UPDATE public.duty_assignments da
   SET staff_member_id = sm.id
  FROM public.staff_members sm
 WHERE sm.profile_id = da.profile_id
   AND da.staff_member_id IS NULL;

DO $$
DECLARE unmapped int;
BEGIN
  SELECT count(*) INTO unmapped
    FROM public.duty_assignments WHERE staff_member_id IS NULL;
  IF unmapped > 0 THEN
    RAISE EXCEPTION 'ABORT: % duty_assignments rows could not map to a staff_members row', unmapped;
  END IF;
END $$;

ALTER TABLE public.duty_assignments ALTER COLUMN staff_member_id SET NOT NULL;
ALTER TABLE public.duty_assignments ALTER COLUMN profile_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'duty_assignments_staff_member_id_fkey') THEN
    ALTER TABLE public.duty_assignments ADD CONSTRAINT duty_assignments_staff_member_id_fkey
      FOREIGN KEY (staff_member_id) REFERENCES public.staff_members(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS duty_assignments_date_staff_key
  ON public.duty_assignments (work_date, staff_member_id);

ALTER TABLE public.duty_types
  ADD COLUMN IF NOT EXISTS center_id uuid;
ALTER TABLE public.duty_assignments
  ADD COLUMN IF NOT EXISTS center_id uuid;

UPDATE public.duty_types       SET center_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE center_id IS NULL;
UPDATE public.duty_assignments SET center_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE center_id IS NULL;

ALTER TABLE public.duty_types
  ALTER COLUMN center_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  ALTER COLUMN center_id SET NOT NULL;
ALTER TABLE public.duty_assignments
  ALTER COLUMN center_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  ALTER COLUMN center_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_duty_assignments_center_date
  ON public.duty_assignments (center_id, work_date);

DROP POLICY IF EXISTS duty_assign_read  ON public.duty_assignments;
DROP POLICY IF EXISTS duty_assign_admin ON public.duty_assignments;
DROP POLICY IF EXISTS duty_types_read   ON public.duty_types;
DROP POLICY IF EXISTS duty_types_admin  ON public.duty_types;

CREATE POLICY duty_assign_read ON public.duty_assignments
  FOR SELECT TO authenticated
  USING (public.current_user_is_active() AND center_id = public.current_user_center_id());

CREATE POLICY duty_assign_admin ON public.duty_assignments
  TO authenticated
  USING (public.is_admin_or_super() AND center_id = public.current_user_center_id())
  WITH CHECK (public.is_admin_or_super() AND center_id = public.current_user_center_id());

CREATE POLICY duty_types_read ON public.duty_types
  FOR SELECT TO authenticated
  USING (public.current_user_is_active() AND center_id = public.current_user_center_id());

CREATE POLICY duty_types_admin ON public.duty_types
  TO authenticated
  USING (public.is_admin_or_super() AND center_id = public.current_user_center_id())
  WITH CHECK (public.is_admin_or_super() AND center_id = public.current_user_center_id());

CREATE OR REPLACE FUNCTION public.apply_roster_week(
  p_week_start date, p_week_end date, p_rows jsonb
) RETURNS SETOF public.duty_assignments LANGUAGE plpgsql AS $function$
declare
  v_center uuid := public.current_user_center_id();
begin
  delete from public.duty_assignments
   where work_date between p_week_start and p_week_end
     and is_manual = false
     and center_id = v_center;

  insert into public.duty_assignments (work_date, duty_type_id, staff_member_id, is_manual, center_id)
  select (row->>'work_date')::date,
         (row->>'duty_type_id')::uuid,
         (row->>'staff_member_id')::uuid,
         false,
         v_center
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as row;

  return query
    select * from public.duty_assignments
     where work_date between p_week_start and p_week_end
       and center_id = v_center
     order by work_date, staff_member_id;
end;
$function$;

DROP FUNCTION IF EXISTS public.swap_duty_assignments(date, uuid, uuid);

CREATE FUNCTION public.swap_duty_assignments(
  p_work_date date, p_staff_a uuid, p_staff_b uuid
) RETURNS SETOF public.duty_assignments LANGUAGE plpgsql AS $function$
declare
  v_duty_a uuid;
  v_duty_b uuid;
begin
  if p_staff_a = p_staff_b then
    return query
      select * from public.duty_assignments
       where work_date = p_work_date and staff_member_id = p_staff_a;
    return;
  end if;

  select duty_type_id into v_duty_a from public.duty_assignments
   where work_date = p_work_date and staff_member_id = p_staff_a for update;

  select duty_type_id into v_duty_b from public.duty_assignments
   where work_date = p_work_date and staff_member_id = p_staff_b for update;

  if v_duty_a is null or v_duty_b is null then
    raise exception 'Both people must already have a duty assignment on % to swap.', p_work_date;
  end if;

  update public.duty_assignments set duty_type_id = v_duty_b, is_manual = true
   where work_date = p_work_date and staff_member_id = p_staff_a;

  update public.duty_assignments set duty_type_id = v_duty_a, is_manual = true
   where work_date = p_work_date and staff_member_id = p_staff_b;

  return query
    select * from public.duty_assignments
     where work_date = p_work_date and staff_member_id in (p_staff_a, p_staff_b);
end;
$function$;

COMMIT;
