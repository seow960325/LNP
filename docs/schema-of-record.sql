-- ============================================================================
-- Center Ops Platform — Schema of Record
-- Captured from live Supabase DB on 2026-07-01. Source of truth for Phase 1A.
-- Tables + seed were created via the Supabase dashboard, not migrations;
-- this file reconstructs the full public schema so it is version-controlled
-- and replayable. Enum CREATE TYPE statements were added explicitly (they
-- were not part of the pg_catalog dump).
--
-- Replay order: ENUMS -> TABLES -> CONSTRAINTS -> INDEXES -> RLS ENABLE
--               -> RLS POLICIES -> TRIGGERS -> FUNCTIONS
-- Note: SECURITY DEFINER functions must be owned by postgres in the live DB
--       (see spec #5). Ownership is not reproduced by these CREATE statements
--       alone — run as the postgres/service role or re-assign ownership after.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- ENUMS  (not present in the catalog dump — declared explicitly)
-- ----------------------------------------------------------------------------

CREATE TYPE public.user_role AS ENUM (
  'super_admin',
  'admin',
  'teacher',
  'staff',
  'parent',
  'shareholder'
);

CREATE TYPE public.board_item_type AS ENUM (
  'task',
  'heads_up',
  'reminder'
);

CREATE TYPE public.board_priority AS ENUM (
  'low',
  'normal',
  'high'
);

CREATE TYPE public.board_status AS ENUM (
  'open',
  'done'
);


-- ----------------------------------------------------------------------------
-- TABLES
-- ----------------------------------------------------------------------------

CREATE TABLE public.centers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  phone text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  center_id uuid NOT NULL,
  full_name text NOT NULL,
  role user_role NOT NULL DEFAULT 'staff'::user_role,
  title text,
  avatar_url text,
  phone text,
  email text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.kudos_values (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  icon_key text,
  parent_label text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.kudos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL,
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  value_id uuid NOT NULL,
  message text,
  is_from_parent boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.board_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  author_id uuid NOT NULL,
  type board_item_type NOT NULL DEFAULT 'task'::board_item_type,
  title text NOT NULL,
  body text,
  priority board_priority NOT NULL DEFAULT 'normal'::board_priority,
  status board_status NOT NULL DEFAULT 'open'::board_status,
  assigned_to uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);


-- ----------------------------------------------------------------------------
-- CONSTRAINTS
-- ----------------------------------------------------------------------------

ALTER TABLE public.centers ADD CONSTRAINT centers_pkey PRIMARY KEY (id);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.kudos_values ADD CONSTRAINT kudos_values_pkey PRIMARY KEY (id);
ALTER TABLE public.kudos_values ADD CONSTRAINT kudos_values_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.kudos ADD CONSTRAINT kudos_pkey PRIMARY KEY (id);
ALTER TABLE public.kudos ADD CONSTRAINT kudos_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;
ALTER TABLE public.kudos ADD CONSTRAINT kudos_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.kudos ADD CONSTRAINT kudos_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.kudos ADD CONSTRAINT kudos_value_id_fkey FOREIGN KEY (value_id) REFERENCES kudos_values(id);

ALTER TABLE public.board_items ADD CONSTRAINT board_items_pkey PRIMARY KEY (id);
ALTER TABLE public.board_items ADD CONSTRAINT board_items_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;
ALTER TABLE public.board_items ADD CONSTRAINT board_items_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.board_items ADD CONSTRAINT board_items_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;


-- ----------------------------------------------------------------------------
-- INDEXES  (non-constraint / performance indexes)
-- ----------------------------------------------------------------------------

CREATE INDEX idx_profiles_center ON public.profiles USING btree (center_id);
CREATE INDEX idx_kudos_center_created ON public.kudos USING btree (center_id, created_at DESC);
CREATE INDEX idx_kudos_to ON public.kudos USING btree (to_user_id);
CREATE INDEX idx_board_center_date ON public.board_items USING btree (center_id, date DESC);
CREATE INDEX idx_board_status ON public.board_items USING btree (status);


-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY — ENABLE
-- ----------------------------------------------------------------------------

ALTER TABLE public.centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kudos_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kudos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_items ENABLE ROW LEVEL SECURITY;


-- ----------------------------------------------------------------------------
-- RLS POLICIES
-- ----------------------------------------------------------------------------

-- centers
CREATE POLICY centers_select ON public.centers AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin() OR (id = current_user_center_id())));
CREATE POLICY centers_insert ON public.centers AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_super_admin());
CREATE POLICY centers_update ON public.centers AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_super_admin() OR (is_admin_or_super() AND (id = current_user_center_id())))) WITH CHECK ((is_super_admin() OR (is_admin_or_super() AND (id = current_user_center_id()))));
CREATE POLICY centers_delete ON public.centers AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin());

-- profiles
CREATE POLICY profiles_select ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (((id = auth.uid()) OR is_super_admin() OR (current_user_is_active() AND (center_id = current_user_center_id()))));
CREATE POLICY profiles_insert ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_super_admin() OR (is_admin_or_super() AND (center_id = current_user_center_id()))));
CREATE POLICY profiles_update ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_super_admin() OR (is_admin_or_super() AND (center_id = current_user_center_id())) OR (id = auth.uid()))) WITH CHECK ((is_super_admin() OR (is_admin_or_super() AND (center_id = current_user_center_id())) OR (id = auth.uid())));
CREATE POLICY profiles_delete ON public.profiles AS PERMISSIVE FOR DELETE TO authenticated USING ((is_super_admin() OR (is_admin_or_super() AND (center_id = current_user_center_id()) AND (role <> ALL (ARRAY['admin'::user_role, 'super_admin'::user_role])))));

-- kudos_values
CREATE POLICY kudos_values_select ON public.kudos_values AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin() OR (current_user_is_active() AND (center_id = current_user_center_id()))));
CREATE POLICY kudos_values_write ON public.kudos_values AS PERMISSIVE FOR ALL TO authenticated USING ((is_super_admin() OR (is_admin_or_super() AND (center_id = current_user_center_id())))) WITH CHECK ((is_super_admin() OR (is_admin_or_super() AND (center_id = current_user_center_id()))));

-- kudos
CREATE POLICY kudos_select ON public.kudos AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin() OR (is_admin_or_super() AND (center_id = current_user_center_id())) OR (from_user_id = auth.uid()) OR (to_user_id = auth.uid())));
CREATE POLICY kudos_insert ON public.kudos AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((from_user_id = auth.uid()) AND (center_id = current_user_center_id()) AND current_user_is_active()));
CREATE POLICY kudos_delete ON public.kudos AS PERMISSIVE FOR DELETE TO authenticated USING ((is_super_admin() OR (from_user_id = auth.uid())));

-- board_items
CREATE POLICY board_items_select ON public.board_items AS PERMISSIVE FOR SELECT TO authenticated USING ((is_super_admin() OR (current_user_is_active() AND (center_id = current_user_center_id()))));
CREATE POLICY board_items_insert ON public.board_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((current_user_is_active() AND (center_id = current_user_center_id()) AND (author_id = auth.uid())));
CREATE POLICY board_items_update ON public.board_items AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_super_admin() OR (current_user_is_active() AND (center_id = current_user_center_id())))) WITH CHECK ((is_super_admin() OR (current_user_is_active() AND (center_id = current_user_center_id()))));
CREATE POLICY board_items_delete ON public.board_items AS PERMISSIVE FOR DELETE TO authenticated USING ((is_super_admin() OR (is_admin_or_super() AND (center_id = current_user_center_id())) OR (current_user_is_active() AND (center_id = current_user_center_id()) AND (author_id = auth.uid()))));


-- ----------------------------------------------------------------------------
-- TRIGGERS
-- ----------------------------------------------------------------------------

CREATE TRIGGER board_items_guard_trg BEFORE UPDATE ON public.board_items FOR EACH ROW EXECUTE FUNCTION board_items_guard();
CREATE TRIGGER profiles_guard_trg BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION profiles_guard();


-- ----------------------------------------------------------------------------
-- FUNCTIONS  (all SECURITY DEFINER; must be owned by postgres in live DB)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_center_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select center_id from public.profiles where id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.current_user_is_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select active from public.profiles where id = auth.uid()), false)
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin_or_super()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.profiles
    where id = auth.uid() and role in ('admin','super_admin') and active)
$function$
;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin' and active)
$function$
;

CREATE OR REPLACE FUNCTION public.kudos_top_recipient()
 RETURNS TABLE(to_user_id uuid, full_name text, kudos_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select k.to_user_id, p.full_name, count(*) as kudos_count
  from public.kudos k
  join public.profiles p on p.id = k.to_user_id
  where k.center_id = current_user_center_id()
  group by k.to_user_id, p.full_name
  order by kudos_count desc, p.full_name asc
  limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.board_items_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end; $function$
;

CREATE OR REPLACE FUNCTION public.profiles_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end; $function$
;
