-- Non-login staff/teacher directory. Already applied live 2026-07-22. Idempotent.
-- profiles = login accounts. staff_members = the people who work here.

CREATE TABLE IF NOT EXISTS public.staff_members (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    center_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    profile_id      uuid,
    full_name       text NOT NULL,
    job_title       text,
    phone           text,
    email           text,
    zoho_account_id text,
    in_duty_roster  boolean NOT NULL DEFAULT false,
    active          boolean NOT NULL DEFAULT true,
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_members_center_id_fkey') THEN
    ALTER TABLE public.staff_members ADD CONSTRAINT staff_members_center_id_fkey
      FOREIGN KEY (center_id) REFERENCES public.centers(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_members_profile_id_fkey') THEN
    ALTER TABLE public.staff_members ADD CONSTRAINT staff_members_profile_id_fkey
      FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS staff_members_profile_id_key
  ON public.staff_members (profile_id) WHERE profile_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS staff_members_zoho_account_id_key
  ON public.staff_members (zoho_account_id) WHERE zoho_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_members_center
  ON public.staff_members USING btree (center_id, active);
CREATE INDEX IF NOT EXISTS idx_staff_members_roster
  ON public.staff_members USING btree (center_id, in_duty_roster) WHERE active;

CREATE OR REPLACE FUNCTION public.staff_members_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  linked_center uuid;
begin
  if new.profile_id is not null then
    select center_id into linked_center from public.profiles where id = new.profile_id;
    if linked_center is null then
      raise exception 'Linked profile % does not exist', new.profile_id;
    end if;
    if linked_center is distinct from new.center_id then
      raise exception 'Linked profile belongs to a different center';
    end if;
  end if;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS staff_members_guard_trg ON public.staff_members;
CREATE TRIGGER staff_members_guard_trg
  BEFORE INSERT OR UPDATE ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION public.staff_members_guard();

ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_members_select ON public.staff_members;
DROP POLICY IF EXISTS staff_members_insert ON public.staff_members;
DROP POLICY IF EXISTS staff_members_update ON public.staff_members;
DROP POLICY IF EXISTS staff_members_delete ON public.staff_members;

-- NOTE: same phone/email exposure as profiles_select (open item H3).
-- Both tables get column masking together before the parent role goes live.
CREATE POLICY staff_members_select ON public.staff_members
  FOR SELECT TO authenticated
  USING (public.is_super_admin()
         OR (public.current_user_is_active() AND center_id = public.current_user_center_id()));

CREATE POLICY staff_members_insert ON public.staff_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin()
         OR (public.is_admin_or_super() AND center_id = public.current_user_center_id()));

CREATE POLICY staff_members_update ON public.staff_members
  FOR UPDATE TO authenticated
  USING (public.is_super_admin()
         OR (public.is_admin_or_super() AND center_id = public.current_user_center_id()))
  WITH CHECK (public.is_super_admin()
         OR (public.is_admin_or_super() AND center_id = public.current_user_center_id()));

CREATE POLICY staff_members_delete ON public.staff_members
  FOR DELETE TO authenticated
  USING (public.is_super_admin()
         OR (public.is_admin_or_super() AND center_id = public.current_user_center_id()));

-- Seed: 15 names from Zoho COGS 6101 Salaries, Allowances & Wages. All inactive.
INSERT INTO public.staff_members (center_id, full_name, active, notes)
SELECT '00000000-0000-0000-0000-000000000001'::uuid, v.full_name, false,
       'Seeded from Zoho COGS 6101 salary sub-accounts, 2026-07-22'
  FROM (VALUES
    ('Ng Kai Xuan'), ('Ng Xin Thong'), ('Nur Desiree Michelle Fernandez'),
    ('Pang Kai Xuan'), ('Annis Chong Wen Xuan'), ('Tan Siew Siew'),
    ('Loo Min Hui'), ('Saranjit Kaur'), ('Vithya Matheraveeran'),
    ('Soo Siew Choo'), ('Kaviroshny Naidu'), ('Ganga A/P Raman'),
    ('Khor Liy Peng'), ('Pravena A/P Paramesvaran'), ('Tharisini A/P Ramesh')
  ) AS v(full_name)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.staff_members s
    WHERE s.full_name = v.full_name
      AND s.center_id = '00000000-0000-0000-0000-000000000001'::uuid
 );
