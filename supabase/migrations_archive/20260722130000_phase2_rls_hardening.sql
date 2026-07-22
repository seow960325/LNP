-- Phase 2 RLS hardening. Already applied live 2026-07-22. Idempotent.
-- Closes: students + student_attendance readable/writable by parent and
-- shareholder; three policies whose qual was literally `true`.

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and active
       and role in ('teacher','staff','admin','super_admin')
  )
$$;

DROP POLICY IF EXISTS students_teacher_read ON public.students;
CREATE POLICY students_staff_read ON public.students
  FOR SELECT TO authenticated
  USING (public.is_staff() AND center_id = public.current_user_center_id());

DROP POLICY IF EXISTS attendance_read   ON public.student_attendance;
DROP POLICY IF EXISTS attendance_insert ON public.student_attendance;
DROP POLICY IF EXISTS attendance_update ON public.student_attendance;

CREATE POLICY attendance_read ON public.student_attendance
  FOR SELECT TO authenticated
  USING (public.is_staff() AND center_id = public.current_user_center_id());

CREATE POLICY attendance_insert ON public.student_attendance
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff() AND center_id = public.current_user_center_id());

CREATE POLICY attendance_update ON public.student_attendance
  FOR UPDATE TO authenticated
  USING (public.is_staff() AND center_id = public.current_user_center_id())
  WITH CHECK (public.is_staff() AND center_id = public.current_user_center_id());

DROP POLICY IF EXISTS claim_cat_read ON public.claim_categories;
CREATE POLICY claim_cat_read ON public.claim_categories
  FOR SELECT TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS duty_assign_read ON public.duty_assignments;
CREATE POLICY duty_assign_read ON public.duty_assignments
  FOR SELECT TO authenticated USING (public.current_user_is_active());

DROP POLICY IF EXISTS duty_types_read ON public.duty_types;
CREATE POLICY duty_types_read ON public.duty_types
  FOR SELECT TO authenticated USING (public.current_user_is_active());
