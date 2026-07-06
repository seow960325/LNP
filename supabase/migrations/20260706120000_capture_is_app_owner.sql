-- Migration: capture is_app_owner drift into git
-- Column + function exist LIVE but were added out-of-band (no migration).
-- This file makes them reproducible on a rebuild. Idempotent = safe no-op
-- against the current live DB.
--
-- Run in Supabase SQL editor. Then commit this file to git.

-- 1. Column: profiles.is_app_owner (boolean, NOT NULL, default false)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_app_owner boolean NOT NULL DEFAULT false;

-- 2. Function: is_app_owner() — true if the CALLER is the app owner.
--    SECURITY DEFINER, STABLE, checks auth.uid() against profiles.
CREATE OR REPLACE FUNCTION public.is_app_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_app_owner = true
  );
$function$;

-- 3. Ownership: match the other SECURITY DEFINER helpers (postgres-owned).
ALTER FUNCTION public.is_app_owner() OWNER TO postgres;

-- NOTE: the profiles_guard trigger and profiles RLS UPDATE policy that CALL
-- is_app_owner() already exist live (captured in the snapshot) and are not
-- re-created here. If a future rebuild needs them, port from
-- supabase/snapshots/live_schema_snapshot_20260706.md lines 35, 80, 83.
