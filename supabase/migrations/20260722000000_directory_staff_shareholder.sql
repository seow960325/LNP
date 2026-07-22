-- Directory rebuild (session 6): job titles, staff directory flags/photo,
-- shareholder contact + dual-identity link.
--
-- NOTE: the storage bucket `directory-photos` and its storage.objects policies
-- are dashboard-managed (same convention as student-photos / avatars) and are
-- intentionally NOT captured here.
-- One-time LIVE data backfills are also intentionally omitted (they depend on
-- live UUIDs and are not schema):
--   * staff_members.job_title_id from the legacy free-text job_title column
--   * shareholdings.staff_member_id links for Lydia + David (Seow Kai Wen)
-- This migration is idempotent (IF NOT EXISTS / guarded seed / DROP..CREATE).

-- 1. job_titles lookup ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_titles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id  uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  name       text NOT NULL,
  sort_order int  NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.job_titles (name, sort_order)
SELECT v.name, v.sort_order
FROM (VALUES
  ('Principal', 1),
  ('Teacher', 2),
  ('Assistant Teacher', 3),
  ('Chef', 4),
  ('Cleaner', 5),
  ('Driver', 6)
) AS v(name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.job_titles);

ALTER TABLE public.job_titles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_titles_select ON public.job_titles;
CREATE POLICY job_titles_select ON public.job_titles
  FOR SELECT USING (public.is_staff() OR public.is_admin_or_super());

DROP POLICY IF EXISTS job_titles_write ON public.job_titles;
CREATE POLICY job_titles_write ON public.job_titles
  FOR ALL USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_titles TO authenticated;

-- 2. staff_members: directory flags + photo + job title FK ------------------
ALTER TABLE public.staff_members
  ADD COLUMN IF NOT EXISTS job_title_id uuid
    REFERENCES public.job_titles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS in_directory boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS photo_path text;

-- 3. shareholdings: contact + dual-identity link ----------------------------
ALTER TABLE public.shareholdings
  ADD COLUMN IF NOT EXISTS staff_member_id uuid
    REFERENCES public.staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS photo_path text;
