-- Give every existing staff login a staff_members row.
-- Already applied live 2026-07-22. Idempotent.

UPDATE public.staff_members sm
   SET profile_id = p.id,
       job_title  = COALESCE(sm.job_title, p.title),
       phone      = COALESCE(sm.phone, p.phone),
       email      = COALESCE(sm.email, p.email),
       active     = p.active
  FROM public.profiles p
 WHERE sm.profile_id IS NULL
   AND p.center_id = sm.center_id
   AND lower(trim(p.full_name)) = lower(trim(sm.full_name))
   AND p.role IN ('admin', 'teacher', 'staff', 'super_admin')
   AND NOT EXISTS (SELECT 1 FROM public.staff_members x WHERE x.profile_id = p.id);

INSERT INTO public.staff_members (
    center_id, profile_id, full_name, job_title, phone, email,
    in_duty_roster, active, notes)
SELECT p.center_id, p.id, p.full_name, p.title, p.phone, p.email,
       p.in_duty_roster, p.active, 'Backfilled from profiles, 2026-07-22'
  FROM public.profiles p
 WHERE p.role IN ('admin', 'teacher', 'staff', 'super_admin')
   AND NOT EXISTS (SELECT 1 FROM public.staff_members sm WHERE sm.profile_id = p.id);
