-- Capture out-of-band drift + center-scope classes.
-- Already applied live 2026-07-22. Idempotent.

CREATE OR REPLACE FUNCTION public.profiles_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
begin
  if (new.role = 'super_admin') and not is_super_admin() then
    raise exception 'Only super_admin may assign the super_admin role';
  end if;

  if tg_op = 'UPDATE' then
    if old.is_app_owner = true and not is_app_owner() then
      raise exception 'The app owner profile cannot be modified by others';
    end if;

    if new.is_app_owner is distinct from old.is_app_owner then
      raise exception 'The app owner flag cannot be changed';
    end if;

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
end;
$$;

DROP TRIGGER IF EXISTS profiles_guard_trg ON public.profiles;
CREATE TRIGGER profiles_guard_trg
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS in_duty_roster boolean NOT NULL DEFAULT false;

ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS center_id uuid;

UPDATE public.classes
   SET center_id = '00000000-0000-0000-0000-000000000001'::uuid
 WHERE center_id IS NULL;

ALTER TABLE public.classes
  ALTER COLUMN center_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.classes ALTER COLUMN center_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'classes_center_id_fkey') THEN
    ALTER TABLE public.classes
      ADD CONSTRAINT classes_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_classes_center
  ON public.classes USING btree (center_id, active, sort_order);

DROP POLICY IF EXISTS classes_read        ON public.classes;
DROP POLICY IF EXISTS classes_admin_write ON public.classes;

CREATE POLICY classes_read ON public.classes
  FOR SELECT TO authenticated
  USING (public.is_super_admin()
         OR (public.current_user_is_active() AND center_id = public.current_user_center_id()));

CREATE POLICY classes_admin_write ON public.classes
  TO authenticated
  USING (public.is_super_admin()
         OR (public.current_user_is_active() AND public.is_admin_or_super()
             AND center_id = public.current_user_center_id()))
  WITH CHECK (public.is_super_admin()
         OR (public.current_user_is_active() AND public.is_admin_or_super()
             AND center_id = public.current_user_center_id()));
