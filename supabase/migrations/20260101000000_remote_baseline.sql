


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."board_item_type" AS ENUM (
    'task',
    'heads_up',
    'reminder'
);


ALTER TYPE "public"."board_item_type" OWNER TO "postgres";


CREATE TYPE "public"."board_priority" AS ENUM (
    'low',
    'normal',
    'high'
);


ALTER TYPE "public"."board_priority" OWNER TO "postgres";


CREATE TYPE "public"."board_status" AS ENUM (
    'open',
    'done'
);


ALTER TYPE "public"."board_status" OWNER TO "postgres";


CREATE TYPE "public"."request_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."request_status" OWNER TO "postgres";


CREATE TYPE "public"."request_type" AS ENUM (
    'annual_leave',
    'medical_leave',
    'ot',
    'claim'
);


ALTER TYPE "public"."request_type" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'teacher',
    'staff',
    'parent',
    'shareholder',
    'super_admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."duty_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "work_date" "date" NOT NULL,
    "duty_type_id" "uuid" NOT NULL,
    "profile_id" "uuid",
    "is_manual" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "staff_member_id" "uuid" NOT NULL,
    "center_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL
);


ALTER TABLE "public"."duty_assignments" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_roster_week"("p_week_start" "date", "p_week_end" "date", "p_rows" "jsonb") RETURNS SETOF "public"."duty_assignments"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."apply_roster_week"("p_week_start" "date", "p_week_end" "date", "p_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."board_items_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."board_items_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_shareholdings"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active
      and p.role in ('shareholder','admin','super_admin')
  );
$$;


ALTER FUNCTION "public"."can_view_shareholdings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claims_approval_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor uuid := auth.uid();
        actor_role text;
begin
  select role into actor_role from public.profiles where id = actor;

  if new.status is distinct from old.status
     and new.status in ('approved','rejected') then
    if actor_role not in ('admin','super_admin') then
      raise exception 'Only admin can approve or reject claims';
    end if;
    if actor = old.claimant_id then
      raise exception 'You cannot approve or reject your own claim';
    end if;
    if new.status = 'rejected' and coalesce(btrim(new.reject_reason),'') = '' then
      raise exception 'Reject reason required';
    end if;
    new.approved_by := actor;
    new.approved_at := now();
  end if;

  if new.status = 'pending' and old.status = 'rejected' then
    new.approved_by   := null;
    new.approved_at   := null;
    new.reject_reason := null;
    new.submitted_at  := now();
  end if;

  return new;
end $$;


ALTER FUNCTION "public"."claims_approval_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claims_receipt_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor uuid := auth.uid();
        actor_role text;
begin
  if new.receipt_held is distinct from old.receipt_held then
    select role into actor_role from public.profiles where id = actor;
    if actor_role not in ('admin','super_admin') then
      raise exception 'Only admin can mark receipt as held';
    end if;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."claims_receipt_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claims_set_period"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.period := to_char(new.expense_date, 'YYYY-MM');
  return new;
end $$;


ALTER FUNCTION "public"."claims_set_period"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "center_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "invoice_no" "text" NOT NULL,
    "term_label" "text",
    "issue_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "due_date" "date",
    "subtotal" numeric(10,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    "payment_method" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "discount" numeric(10,2) DEFAULT 0 NOT NULL,
    "receipt_path" "text",
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'sent'::"text", 'paid'::"text", 'void'::"text"])))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_invoice_with_lines"("p_center_id" "uuid", "p_student_id" "uuid", "p_term_label" "text", "p_issue_date" "date", "p_due_date" "date", "p_discount" numeric, "p_notes" "text", "p_line_items" "jsonb") RETURNS "public"."invoices"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_invoice public.invoices;
  v_subtotal numeric(10,2);
begin
  if p_line_items is null or jsonb_array_length(p_line_items) = 0 then
    raise exception 'At least one line item is required';
  end if;

  insert into public.invoices (center_id, student_id, term_label, issue_date, due_date, discount, notes, status)
  values (p_center_id, p_student_id, p_term_label, p_issue_date, p_due_date, coalesce(p_discount, 0), p_notes, 'draft')
  returning * into v_invoice;

  insert into public.invoice_line_items (invoice_id, description, amount, sort_order)
  select
    v_invoice.id,
    (line->>'description')::text,
    (line->>'amount')::numeric(10,2),
    (line->>'sort_order')::int
  from jsonb_array_elements(p_line_items) as line;

  select coalesce(sum(amount), 0) into v_subtotal
  from public.invoice_line_items
  where invoice_id = v_invoice.id;

  update public.invoices
    set subtotal = v_subtotal
    where id = v_invoice.id
    returning * into v_invoice;

  return v_invoice;
end;
$$;


ALTER FUNCTION "public"."create_invoice_with_lines"("p_center_id" "uuid", "p_student_id" "uuid", "p_term_label" "text", "p_issue_date" "date", "p_due_date" "date", "p_discount" numeric, "p_notes" "text", "p_line_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_center_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select center_id from public.profiles where id = auth.uid()
$$;


ALTER FUNCTION "public"."current_user_center_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_is_active"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((select active from public.profiles where id = auth.uid()), false)
$$;


ALTER FUNCTION "public"."current_user_is_active"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_invoice_no"("p_center" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v public.invoice_settings;
  v_period text;
  v_parts text[] := '{}';
  v_seq int;
begin
  select * into v from public.invoice_settings where center_id = p_center for update;
  if v.id is null then
    insert into public.invoice_settings (center_id) values (p_center)
    on conflict (center_id) do nothing;
    select * into v from public.invoice_settings where center_id = p_center for update;
  end if;

  v_period := case
    when v.include_year and v.include_month then to_char(now(),'YYYY-MM')
    when v.include_year then to_char(now(),'YYYY')
    when v.include_month then to_char(now(),'MM')
    else 'ALL' end;

  if v.seq_period is distinct from v_period then v_seq := v.start_seq;
  else v_seq := v.next_seq; end if;

  update public.invoice_settings
  set next_seq = v_seq + 1, seq_period = v_period
  where center_id = p_center;

  v_parts := array_append(v_parts, v.prefix);
  if v.include_year then v_parts := array_append(v_parts, to_char(now(),'YYYY')); end if;
  if v.include_month then v_parts := array_append(v_parts, to_char(now(),'MM')); end if;
  v_parts := array_append(v_parts, lpad(v_seq::text, v.seq_padding, '0'));

  return array_to_string(v_parts, v.separator);
end; $$;


ALTER FUNCTION "public"."generate_invoice_no"("p_center" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invoices_set_invoice_no"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.invoice_no is null then
    new.invoice_no := generate_invoice_no(new.center_id);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."invoices_set_invoice_no"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_or_super"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.profiles
    where id = auth.uid() and role in ('admin','super_admin') and active)
$$;


ALTER FUNCTION "public"."is_admin_or_super"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_app_owner"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_app_owner = true
  );
$$;


ALTER FUNCTION "public"."is_app_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_shareholder"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.profiles
    where id = auth.uid() and role = 'shareholder' and active)
$$;


ALTER FUNCTION "public"."is_shareholder"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_staff"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and active
       and role in ('teacher','staff','admin','super_admin')
  )
$$;


ALTER FUNCTION "public"."is_staff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin' and active)
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kudos_top_recipient"() RETURNS TABLE("to_user_id" "uuid", "full_name" "text", "kudos_count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select k.to_user_id, p.full_name, count(*) as kudos_count
  from public.kudos k
  join public.profiles p on p.id = k.to_user_id
  where k.center_id = current_user_center_id()
  group by k.to_user_id, p.full_name
  order by kudos_count desc, p.full_name asc
  limit 1
$$;


ALTER FUNCTION "public"."kudos_top_recipient"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leave_approval_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor uuid := auth.uid();
        actor_role text;
begin
  select role into actor_role from public.profiles where id = actor;

  if new.status is distinct from old.status
     and new.status in ('approved','rejected') then
    if actor_role not in ('admin','super_admin') then
      raise exception 'Only admin can approve or reject leave';
    end if;
    if actor = old.profile_id then
      raise exception 'You cannot approve or reject your own leave';
    end if;
    if new.status = 'rejected' and coalesce(btrim(new.reject_reason),'') = '' then
      raise exception 'Reject reason required';
    end if;
    new.approved_by := actor;
    new.approved_at := now();
  end if;

  if new.status = 'pending' and old.status = 'rejected' then
    new.approved_by   := null;
    new.approved_at   := null;
    new.reject_reason := null;
    new.submitted_at  := now();
  end if;

  return new;
end $$;


ALTER FUNCTION "public"."leave_approval_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leave_set_days"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.segment in ('am','pm') then
    if new.start_date <> new.end_date then
      raise exception 'Half-day leave must be a single date';
    end if;
    new.days := 0.5;
  else
    new.days := (
      select count(*) from generate_series(new.start_date, new.end_date, interval '1 day') d
      where extract(isodow from d) < 6
    );
    if new.days = 0 then
      raise exception 'Leave range contains no working days (Mon-Fri)';
    end if;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."leave_set_days"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."payslips_preserve_created_by"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.created_by := old.created_by;
  return new;
end;
$$;


ALTER FUNCTION "public"."payslips_preserve_created_by"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profiles_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if (new.role = 'super_admin') and not is_super_admin() then
    raise exception 'Only super_admin may assign the super_admin role';
  end if;

  if tg_op = 'UPDATE' then
    -- owner protection (missing from 20260701130000_rls_phase1a.sql)
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


ALTER FUNCTION "public"."profiles_guard"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_line_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."invoice_line_items" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_invoice_lines"("p_invoice_id" "uuid", "p_lines" "jsonb") RETURNS SETOF "public"."invoice_line_items"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_subtotal numeric(10,2);
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one line item is required';
  end if;

  delete from public.invoice_line_items where invoice_id = p_invoice_id;

  insert into public.invoice_line_items (invoice_id, description, amount, sort_order)
  select
    p_invoice_id,
    (line->>'description')::text,
    (line->>'amount')::numeric(10,2),
    (line->>'sort_order')::int
  from jsonb_array_elements(p_lines) as line;

  select coalesce(sum(amount), 0) into v_subtotal
  from public.invoice_line_items
  where invoice_id = p_invoice_id;

  update public.invoices set subtotal = v_subtotal where id = p_invoice_id;

  return query
    select * from public.invoice_line_items
    where invoice_id = p_invoice_id
    order by sort_order;
end;
$$;


ALTER FUNCTION "public"."replace_invoice_lines"("p_invoice_id" "uuid", "p_lines" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."requests_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if is_admin_or_super() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.user_id is distinct from auth.uid() then
      raise exception 'Cannot create a request for another user';
    end if;
    if new.status is distinct from 'pending' then
      raise exception 'New requests must start as pending';
    end if;
    if new.reviewed_by is not null or new.reviewed_at is not null then
      raise exception 'Cannot set review fields on a new request';
    end if;
    return new;
  end if;

  -- UPDATE branch
  if new.center_id is distinct from old.center_id
     or new.user_id is distinct from old.user_id then
    raise exception 'Cannot change center_id or user_id on request';
  end if;
  if old.status is distinct from 'pending' then
    raise exception 'Cannot modify a request that has been reviewed';
  end if;
  if new.status is distinct from old.status then
    raise exception 'Only an admin can change request status';
  end if;
  if new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Cannot set review fields';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."requests_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shareholder_family_ar_summary"() RETURNS TABLE("family_count" bigint, "total_outstanding" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not (is_admin_or_super() or is_shareholder()) then
    raise exception 'Not authorized';
  end if;

  return query
    select count(*)::bigint, coalesce(sum(outstanding_receivable_amount), 0)
    from public.zoho_contacts;
end;
$$;


ALTER FUNCTION "public"."shareholder_family_ar_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."staff_members_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."staff_members_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."swap_duty_assignments"("p_work_date" "date", "p_staff_a" "uuid", "p_staff_b" "uuid") RETURNS SETOF "public"."duty_assignments"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."swap_duty_assignments"("p_work_date" "date", "p_staff_a" "uuid", "p_staff_b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin new.updated_at := now(); return new; end $$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_conditions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."attendance_conditions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."board_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "center_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "author_id" "uuid" NOT NULL,
    "type" "public"."board_item_type" DEFAULT 'task'::"public"."board_item_type" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "priority" "public"."board_priority" DEFAULT 'normal'::"public"."board_priority" NOT NULL,
    "status" "public"."board_status" DEFAULT 'open'::"public"."board_status" NOT NULL,
    "assigned_to" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."board_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."center_settings" (
    "center_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."center_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."centers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."centers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."claim_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."claim_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."claims" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "claimant_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "expense_date" "date" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "receipt_held" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reject_reason" "text",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "period" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "claims_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "claims_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."claims" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "center_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL
);


ALTER TABLE "public"."classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."duty_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "headcount" integer DEFAULT 1 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "center_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    CONSTRAINT "duty_types_headcount_check" CHECK (("headcount" >= 1))
);


ALTER TABLE "public"."duty_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fee_packages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "center_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "name" "text" NOT NULL,
    "default_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "description" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fee_packages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_bank_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bank_name" "text" NOT NULL,
    "account_no" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invoice_bank_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "center_id" "uuid" NOT NULL,
    "prefix" "text" DEFAULT 'INV'::"text" NOT NULL,
    "include_year" boolean DEFAULT true NOT NULL,
    "include_month" boolean DEFAULT true NOT NULL,
    "separator" "text" DEFAULT '-'::"text" NOT NULL,
    "seq_padding" integer DEFAULT 4 NOT NULL,
    "start_seq" integer DEFAULT 1 NOT NULL,
    "next_seq" integer DEFAULT 1 NOT NULL,
    "seq_period" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invoice_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kudos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "center_id" "uuid" NOT NULL,
    "from_user_id" "uuid" NOT NULL,
    "to_user_id" "uuid" NOT NULL,
    "value_id" "uuid" NOT NULL,
    "message" "text",
    "is_from_parent" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."kudos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kudos_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "center_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "icon_key" "text",
    "parent_label" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."kudos_values" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leave_balances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "leave_type" "text" NOT NULL,
    "entitled_days" numeric(4,1) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "leave_balances_entitled_days_check" CHECK (("entitled_days" >= (0)::numeric)),
    CONSTRAINT "leave_balances_leave_type_check" CHECK (("leave_type" = ANY (ARRAY['AL'::"text", 'MC'::"text"])))
);


ALTER TABLE "public"."leave_balances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leave_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "leave_type" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "segment" "text" DEFAULT 'full'::"text" NOT NULL,
    "days" numeric(4,1) DEFAULT 0 NOT NULL,
    "reason" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reject_reason" "text",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "leave_requests_check" CHECK (("end_date" >= "start_date")),
    CONSTRAINT "leave_requests_leave_type_check" CHECK (("leave_type" = ANY (ARRAY['AL'::"text", 'MC'::"text"]))),
    CONSTRAINT "leave_requests_segment_check" CHECK (("segment" = ANY (ARRAY['full'::"text", 'am'::"text", 'pm'::"text"]))),
    CONSTRAINT "leave_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."leave_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_settings" (
    "center_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "epf_rate_employee" numeric(5,2) DEFAULT 11.00 NOT NULL,
    "epf_rate_employer" numeric(5,2) DEFAULT 13.00 NOT NULL,
    "epf_rate_employer_high" numeric(5,2) DEFAULT 12.00 NOT NULL,
    "socso_scheme" "text" DEFAULT 'standard'::"text" NOT NULL,
    "sender_email" "text" DEFAULT 'learnnplay_admin@example.com'::"text",
    "company_name" "text",
    "company_address" "text",
    "company_regno" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "payroll_settings_socso_scheme_check" CHECK (("socso_scheme" = ANY (ARRAY['standard'::"text", 'with_skbbk'::"text"])))
);


ALTER TABLE "public"."payroll_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_ytd_opening" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "center_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "opening_gross" numeric(12,2) DEFAULT 0 NOT NULL,
    "opening_pcb" numeric(12,2) DEFAULT 0 NOT NULL,
    "opening_epf_employee" numeric(12,2) DEFAULT 0 NOT NULL,
    "opening_socso_employee" numeric(12,2) DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."payroll_ytd_opening" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payslips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "center_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "month" integer NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "base_salary" numeric(10,2) DEFAULT 0 NOT NULL,
    "allowance" numeric(10,2) DEFAULT 0 NOT NULL,
    "overtime" numeric(10,2) DEFAULT 0 NOT NULL,
    "bonus" numeric(10,2) DEFAULT 0 NOT NULL,
    "unpaid_leave_deduction" numeric(10,2) DEFAULT 0 NOT NULL,
    "epf_employee" numeric(10,2) DEFAULT 0 NOT NULL,
    "epf_employer" numeric(10,2) DEFAULT 0 NOT NULL,
    "socso_employee" numeric(10,2) DEFAULT 0 NOT NULL,
    "socso_employer" numeric(10,2) DEFAULT 0 NOT NULL,
    "eis_employee" numeric(10,2) DEFAULT 0 NOT NULL,
    "eis_employer" numeric(10,2) DEFAULT 0 NOT NULL,
    "pcb" numeric(10,2) DEFAULT 0 NOT NULL,
    "gross_pay" numeric(10,2) DEFAULT 0 NOT NULL,
    "total_deductions" numeric(10,2) DEFAULT 0 NOT NULL,
    "net_pay" numeric(10,2) DEFAULT 0 NOT NULL,
    "ytd_gross" numeric(12,2) DEFAULT 0 NOT NULL,
    "ytd_pcb" numeric(12,2) DEFAULT 0 NOT NULL,
    "manual_overrides" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finalized_by" "uuid",
    "finalized_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    CONSTRAINT "payslips_month_check" CHECK ((("month" >= 1) AND ("month" <= 12))),
    CONSTRAINT "payslips_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'finalized'::"text", 'sent'::"text"])))
);


ALTER TABLE "public"."payslips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "center_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "role" "public"."user_role" DEFAULT 'staff'::"public"."user_role" NOT NULL,
    "title" "text",
    "avatar_url" "text",
    "phone" "text",
    "email" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "must_change_password" boolean DEFAULT false NOT NULL,
    "is_paid_employee" boolean DEFAULT true NOT NULL,
    "is_app_owner" boolean DEFAULT false NOT NULL,
    "in_duty_roster" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roster_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "center_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "shift_start" time without time zone NOT NULL,
    "shift_end" time without time zone NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."roster_shifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shareholdings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "center_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "share_code" "text",
    "capital" numeric(12,2) NOT NULL,
    "profile_id" "uuid",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shareholdings_capital_check" CHECK (("capital" >= (0)::numeric))
);


ALTER TABLE "public"."shareholdings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "doc_type" "text" NOT NULL,
    "year" integer NOT NULL,
    "month" integer,
    "file_name" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "uploaded_by" "uuid",
    "center_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_documents_doc_type_check" CHECK (("doc_type" = ANY (ARRAY['ea'::"text", 'payslip'::"text"]))),
    CONSTRAINT "staff_documents_month_check" CHECK ((("month" >= 1) AND ("month" <= 12)))
);


ALTER TABLE "public"."staff_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "center_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "profile_id" "uuid",
    "full_name" "text" NOT NULL,
    "job_title" "text",
    "phone" "text",
    "email" "text",
    "zoho_account_id" "text",
    "in_duty_roster" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "display_name" "text"
);


ALTER TABLE "public"."staff_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "center_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "attendance_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "arrived_at" timestamp with time zone,
    "arrival_temp" numeric(4,1),
    "arrival_photo_url" "text",
    "arrival_condition_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "arrived_by" "uuid",
    "departed_at" timestamp with time zone,
    "departure_condition_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "pickup_by_name" "text",
    "pickup_photo_url" "text",
    "departed_by" "uuid",
    "care_note" "text",
    "care_photo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "has_medicine" boolean DEFAULT false NOT NULL,
    "medicine_photo_url" "text",
    "medicine_dose_amount" numeric,
    "medicine_dose_unit" "text",
    "medicine_instruction" "text"
);


ALTER TABLE "public"."student_attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."students" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "center_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "name" "text" NOT NULL,
    "parent_name" "text",
    "parent_phone" "text",
    "parent_email" "text",
    "package_id" "uuid",
    "enrolled_at" "date",
    "notes" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dob" "date",
    "address" "text",
    "photo_url" "text",
    "class_id" "uuid",
    "zoho_contact_id" "text"
);


ALTER TABLE "public"."students" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."term_deletion_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "center_id" "uuid" NOT NULL,
    "term_id" "uuid" NOT NULL,
    "scope" "text" DEFAULT 'both'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "term_deletion_requests_scope_check" CHECK (("scope" = ANY (ARRAY['both'::"text", 'board'::"text", 'attendance'::"text"]))),
    CONSTRAINT "term_deletion_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."term_deletion_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."terms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "center_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."terms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tile_layouts" (
    "menu_key" "text" NOT NULL,
    "tile_order" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tile_layouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zoho_accounts" (
    "account_id" "text" NOT NULL,
    "account_name" "text",
    "account_type" "text",
    "current_balance" numeric(12,2) DEFAULT 0 NOT NULL,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."zoho_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zoho_bank_accounts" (
    "account_id" "text" NOT NULL,
    "account_name" "text",
    "account_type" "text",
    "current_balance" numeric(12,2) DEFAULT 0 NOT NULL,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."zoho_bank_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zoho_bank_transactions" (
    "transaction_id" "text" NOT NULL,
    "account_id" "text",
    "date" "date",
    "amount" numeric(12,2),
    "transaction_type" "text",
    "payee" "text",
    "description" "text",
    "status" "text",
    "last_modified_time" timestamp with time zone,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "direction" "text",
    "running_balance" numeric(14,2)
);


ALTER TABLE "public"."zoho_bank_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zoho_contacts" (
    "contact_id" "text" NOT NULL,
    "contact_name" "text",
    "email" "text",
    "mobile" "text",
    "outstanding_receivable_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "last_modified_time" timestamp with time zone,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."zoho_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zoho_expenses" (
    "expense_id" "text" NOT NULL,
    "date" "date",
    "account_name" "text",
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "vendor_name" "text",
    "description" "text",
    "last_modified_time" timestamp with time zone,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."zoho_expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zoho_invoices" (
    "invoice_id" "text" NOT NULL,
    "invoice_number" "text",
    "customer_id" "text",
    "customer_name" "text",
    "date" "date",
    "total" numeric(12,2) DEFAULT 0 NOT NULL,
    "balance" numeric(12,2) DEFAULT 0 NOT NULL,
    "status" "text",
    "last_modified_time" timestamp with time zone,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "discount" numeric(12,2) DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."zoho_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zoho_payments" (
    "payment_id" "text" NOT NULL,
    "payment_number" "text",
    "date" "date",
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "payment_mode" "text",
    "customer_id" "text",
    "invoice_numbers" "text",
    "last_modified_time" timestamp with time zone,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."zoho_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zoho_recurring_invoices" (
    "recurring_invoice_id" "text" NOT NULL,
    "customer_id" "text",
    "customer_name" "text",
    "recurrence_name" "text",
    "status" "text",
    "frequency" "text",
    "start_date" "date",
    "next_invoice_date" "date",
    "end_date" "date",
    "total" numeric(12,2),
    "last_modified_time" timestamp with time zone,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."zoho_recurring_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zoho_reports" (
    "report_type" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "data" "jsonb" NOT NULL,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "zoho_reports_report_type_check" CHECK (("report_type" = ANY (ARRAY['pnl'::"text", 'balancesheet'::"text"])))
);


ALTER TABLE "public"."zoho_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zoho_sync_log" (
    "id" bigint NOT NULL,
    "ran_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "endpoint" "text",
    "records" integer,
    "api_calls" integer,
    "ok" boolean,
    "note" "text"
);


ALTER TABLE "public"."zoho_sync_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."zoho_sync_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."zoho_sync_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."zoho_sync_log_id_seq" OWNED BY "public"."zoho_sync_log"."id";



ALTER TABLE ONLY "public"."zoho_sync_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."zoho_sync_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."attendance_conditions"
    ADD CONSTRAINT "attendance_conditions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_items"
    ADD CONSTRAINT "board_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."center_settings"
    ADD CONSTRAINT "center_settings_pkey" PRIMARY KEY ("center_id", "key");



ALTER TABLE ONLY "public"."centers"
    ADD CONSTRAINT "centers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."claim_categories"
    ADD CONSTRAINT "claim_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."claim_categories"
    ADD CONSTRAINT "claim_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."claims"
    ADD CONSTRAINT "claims_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."duty_assignments"
    ADD CONSTRAINT "duty_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."duty_assignments"
    ADD CONSTRAINT "duty_assignments_work_date_duty_type_id_profile_id_key" UNIQUE ("work_date", "duty_type_id", "profile_id");



ALTER TABLE ONLY "public"."duty_types"
    ADD CONSTRAINT "duty_types_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."duty_types"
    ADD CONSTRAINT "duty_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fee_packages"
    ADD CONSTRAINT "fee_packages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_bank_accounts"
    ADD CONSTRAINT "invoice_bank_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_line_items"
    ADD CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_settings"
    ADD CONSTRAINT "invoice_settings_center_id_key" UNIQUE ("center_id");



ALTER TABLE ONLY "public"."invoice_settings"
    ADD CONSTRAINT "invoice_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_no_key" UNIQUE ("invoice_no");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kudos"
    ADD CONSTRAINT "kudos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kudos_values"
    ADD CONSTRAINT "kudos_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leave_balances"
    ADD CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leave_balances"
    ADD CONSTRAINT "leave_balances_profile_id_year_leave_type_key" UNIQUE ("profile_id", "year", "leave_type");



ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_settings"
    ADD CONSTRAINT "payroll_settings_pkey" PRIMARY KEY ("center_id");



ALTER TABLE ONLY "public"."payroll_ytd_opening"
    ADD CONSTRAINT "payroll_ytd_opening_employee_id_year_key" UNIQUE ("employee_id", "year");



ALTER TABLE ONLY "public"."payroll_ytd_opening"
    ADD CONSTRAINT "payroll_ytd_opening_employee_year_key" UNIQUE ("employee_id", "year");



ALTER TABLE ONLY "public"."payroll_ytd_opening"
    ADD CONSTRAINT "payroll_ytd_opening_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payslips"
    ADD CONSTRAINT "payslips_employee_id_year_month_key" UNIQUE ("employee_id", "year", "month");



ALTER TABLE ONLY "public"."payslips"
    ADD CONSTRAINT "payslips_employee_year_month_key" UNIQUE ("employee_id", "year", "month");



ALTER TABLE ONLY "public"."payslips"
    ADD CONSTRAINT "payslips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roster_shifts"
    ADD CONSTRAINT "roster_shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shareholdings"
    ADD CONSTRAINT "shareholdings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_documents"
    ADD CONSTRAINT "staff_documents_owner_doctype_period_key" UNIQUE ("owner_id", "doc_type", "year", "month");



ALTER TABLE ONLY "public"."staff_documents"
    ADD CONSTRAINT "staff_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_documents"
    ADD CONSTRAINT "staff_documents_storage_path_key" UNIQUE ("storage_path");



ALTER TABLE ONLY "public"."staff_members"
    ADD CONSTRAINT "staff_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_attendance"
    ADD CONSTRAINT "student_attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_attendance"
    ADD CONSTRAINT "student_attendance_student_id_attendance_date_key" UNIQUE ("student_id", "attendance_date");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."term_deletion_requests"
    ADD CONSTRAINT "term_deletion_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."terms"
    ADD CONSTRAINT "terms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tile_layouts"
    ADD CONSTRAINT "tile_layouts_pkey" PRIMARY KEY ("menu_key");



ALTER TABLE ONLY "public"."zoho_accounts"
    ADD CONSTRAINT "zoho_accounts_pkey" PRIMARY KEY ("account_id");



ALTER TABLE ONLY "public"."zoho_bank_accounts"
    ADD CONSTRAINT "zoho_bank_accounts_pkey" PRIMARY KEY ("account_id");



ALTER TABLE ONLY "public"."zoho_bank_transactions"
    ADD CONSTRAINT "zoho_bank_transactions_pkey" PRIMARY KEY ("transaction_id");



ALTER TABLE ONLY "public"."zoho_contacts"
    ADD CONSTRAINT "zoho_contacts_pkey" PRIMARY KEY ("contact_id");



ALTER TABLE ONLY "public"."zoho_expenses"
    ADD CONSTRAINT "zoho_expenses_pkey" PRIMARY KEY ("expense_id");



ALTER TABLE ONLY "public"."zoho_invoices"
    ADD CONSTRAINT "zoho_invoices_pkey" PRIMARY KEY ("invoice_id");



ALTER TABLE ONLY "public"."zoho_payments"
    ADD CONSTRAINT "zoho_payments_pkey" PRIMARY KEY ("payment_id");



ALTER TABLE ONLY "public"."zoho_recurring_invoices"
    ADD CONSTRAINT "zoho_recurring_invoices_pkey" PRIMARY KEY ("recurring_invoice_id");



ALTER TABLE ONLY "public"."zoho_reports"
    ADD CONSTRAINT "zoho_reports_pkey" PRIMARY KEY ("report_type", "period_start", "period_end");



ALTER TABLE ONLY "public"."zoho_sync_log"
    ADD CONSTRAINT "zoho_sync_log_pkey" PRIMARY KEY ("id");



CREATE INDEX "claims_claimant_idx" ON "public"."claims" USING "btree" ("claimant_id");



CREATE INDEX "claims_period_idx" ON "public"."claims" USING "btree" ("period");



CREATE INDEX "claims_status_idx" ON "public"."claims" USING "btree" ("status");



CREATE INDEX "duty_assignments_date_idx" ON "public"."duty_assignments" USING "btree" ("work_date");



CREATE UNIQUE INDEX "duty_assignments_date_staff_key" ON "public"."duty_assignments" USING "btree" ("work_date", "staff_member_id");



CREATE INDEX "idx_board_center_date" ON "public"."board_items" USING "btree" ("center_id", "date" DESC);



CREATE INDEX "idx_board_status" ON "public"."board_items" USING "btree" ("status");



CREATE INDEX "idx_center_settings_center" ON "public"."center_settings" USING "btree" ("center_id");



CREATE INDEX "idx_classes_center" ON "public"."classes" USING "btree" ("center_id", "active", "sort_order");



CREATE INDEX "idx_duty_assignments_center_date" ON "public"."duty_assignments" USING "btree" ("center_id", "work_date");



CREATE INDEX "idx_fee_packages_active" ON "public"."fee_packages" USING "btree" ("center_id", "active");



CREATE INDEX "idx_fee_packages_center" ON "public"."fee_packages" USING "btree" ("center_id");



CREATE INDEX "idx_invoice_line_items_invoice" ON "public"."invoice_line_items" USING "btree" ("invoice_id");



CREATE INDEX "idx_invoices_center" ON "public"."invoices" USING "btree" ("center_id");



CREATE INDEX "idx_invoices_invoice_no" ON "public"."invoices" USING "btree" ("invoice_no");



CREATE INDEX "idx_invoices_status" ON "public"."invoices" USING "btree" ("center_id", "status");



CREATE INDEX "idx_invoices_student" ON "public"."invoices" USING "btree" ("student_id");



CREATE INDEX "idx_kudos_center_created" ON "public"."kudos" USING "btree" ("center_id", "created_at" DESC);



CREATE INDEX "idx_kudos_to" ON "public"."kudos" USING "btree" ("to_user_id");



CREATE INDEX "idx_profiles_center" ON "public"."profiles" USING "btree" ("center_id");



CREATE INDEX "idx_roster_shifts_center" ON "public"."roster_shifts" USING "btree" ("center_id");



CREATE INDEX "idx_roster_shifts_user_date" ON "public"."roster_shifts" USING "btree" ("user_id", "date");



CREATE INDEX "idx_staff_members_center" ON "public"."staff_members" USING "btree" ("center_id", "active");



CREATE INDEX "idx_staff_members_roster" ON "public"."staff_members" USING "btree" ("center_id", "in_duty_roster") WHERE "active";



CREATE INDEX "idx_students_active" ON "public"."students" USING "btree" ("center_id", "active");



CREATE INDEX "idx_students_center" ON "public"."students" USING "btree" ("center_id");



CREATE INDEX "idx_students_package" ON "public"."students" USING "btree" ("package_id");



CREATE INDEX "idx_zoho_bank_transactions_account_date" ON "public"."zoho_bank_transactions" USING "btree" ("account_id", "date");



CREATE INDEX "idx_zoho_contacts_last_modified" ON "public"."zoho_contacts" USING "btree" ("last_modified_time");



CREATE INDEX "idx_zoho_expenses_date" ON "public"."zoho_expenses" USING "btree" ("date");



CREATE INDEX "idx_zoho_expenses_last_modified" ON "public"."zoho_expenses" USING "btree" ("last_modified_time");



CREATE INDEX "idx_zoho_invoices_customer" ON "public"."zoho_invoices" USING "btree" ("customer_id");



CREATE INDEX "idx_zoho_invoices_date" ON "public"."zoho_invoices" USING "btree" ("date");



CREATE INDEX "idx_zoho_invoices_last_modified" ON "public"."zoho_invoices" USING "btree" ("last_modified_time");



CREATE INDEX "idx_zoho_payments_customer" ON "public"."zoho_payments" USING "btree" ("customer_id");



CREATE INDEX "idx_zoho_payments_date" ON "public"."zoho_payments" USING "btree" ("date");



CREATE INDEX "idx_zoho_payments_last_modified" ON "public"."zoho_payments" USING "btree" ("last_modified_time");



CREATE INDEX "idx_zoho_reports_type" ON "public"."zoho_reports" USING "btree" ("report_type");



CREATE INDEX "idx_zoho_sync_log_ran_at" ON "public"."zoho_sync_log" USING "btree" ("ran_at" DESC);



CREATE INDEX "leave_req_profile_idx" ON "public"."leave_requests" USING "btree" ("profile_id");



CREATE INDEX "leave_req_status_idx" ON "public"."leave_requests" USING "btree" ("status");



CREATE INDEX "leave_req_type_idx" ON "public"."leave_requests" USING "btree" ("leave_type");



CREATE INDEX "payslips_center_period_idx" ON "public"."payslips" USING "btree" ("center_id", "year", "month");



CREATE INDEX "payslips_emp_period_idx" ON "public"."payslips" USING "btree" ("employee_id", "year", "month");



CREATE INDEX "staff_documents_center_idx" ON "public"."staff_documents" USING "btree" ("center_id");



CREATE INDEX "staff_documents_owner_idx" ON "public"."staff_documents" USING "btree" ("owner_id");



CREATE UNIQUE INDEX "staff_members_profile_id_key" ON "public"."staff_members" USING "btree" ("profile_id") WHERE ("profile_id" IS NOT NULL);



CREATE UNIQUE INDEX "staff_members_zoho_account_id_key" ON "public"."staff_members" USING "btree" ("zoho_account_id") WHERE ("zoho_account_id" IS NOT NULL);



CREATE UNIQUE INDEX "students_zoho_contact_id_key" ON "public"."students" USING "btree" ("zoho_contact_id") WHERE ("zoho_contact_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "board_items_guard_trg" BEFORE UPDATE ON "public"."board_items" FOR EACH ROW EXECUTE FUNCTION "public"."board_items_guard"();



CREATE OR REPLACE TRIGGER "claims_approval_guard_trg" BEFORE UPDATE ON "public"."claims" FOR EACH ROW EXECUTE FUNCTION "public"."claims_approval_guard"();



CREATE OR REPLACE TRIGGER "claims_receipt_guard_trg" BEFORE UPDATE ON "public"."claims" FOR EACH ROW EXECUTE FUNCTION "public"."claims_receipt_guard"();



CREATE OR REPLACE TRIGGER "claims_set_period_trg" BEFORE INSERT OR UPDATE ON "public"."claims" FOR EACH ROW EXECUTE FUNCTION "public"."claims_set_period"();



CREATE OR REPLACE TRIGGER "claims_touch" BEFORE UPDATE ON "public"."claims" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "invoices_set_invoice_no_trg" BEFORE INSERT ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."invoices_set_invoice_no"();



CREATE OR REPLACE TRIGGER "leave_approval_guard_trg" BEFORE UPDATE ON "public"."leave_requests" FOR EACH ROW EXECUTE FUNCTION "public"."leave_approval_guard"();



CREATE OR REPLACE TRIGGER "leave_bal_touch" BEFORE UPDATE ON "public"."leave_balances" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "leave_req_touch" BEFORE UPDATE ON "public"."leave_requests" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "leave_set_days_trg" BEFORE INSERT OR UPDATE ON "public"."leave_requests" FOR EACH ROW EXECUTE FUNCTION "public"."leave_set_days"();



CREATE OR REPLACE TRIGGER "payslips_preserve_created_by_trg" BEFORE UPDATE ON "public"."payslips" FOR EACH ROW EXECUTE FUNCTION "public"."payslips_preserve_created_by"();



CREATE OR REPLACE TRIGGER "profiles_guard_trg" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_guard"();



CREATE OR REPLACE TRIGGER "staff_members_guard_trg" BEFORE INSERT OR UPDATE ON "public"."staff_members" FOR EACH ROW EXECUTE FUNCTION "public"."staff_members_guard"();



ALTER TABLE ONLY "public"."board_items"
    ADD CONSTRAINT "board_items_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."board_items"
    ADD CONSTRAINT "board_items_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_items"
    ADD CONSTRAINT "board_items_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."center_settings"
    ADD CONSTRAINT "center_settings_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."center_settings"
    ADD CONSTRAINT "center_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."claims"
    ADD CONSTRAINT "claims_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."claims"
    ADD CONSTRAINT "claims_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."claim_categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."claims"
    ADD CONSTRAINT "claims_claimant_id_fkey" FOREIGN KEY ("claimant_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id");



ALTER TABLE ONLY "public"."duty_assignments"
    ADD CONSTRAINT "duty_assignments_duty_type_id_fkey" FOREIGN KEY ("duty_type_id") REFERENCES "public"."duty_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duty_assignments"
    ADD CONSTRAINT "duty_assignments_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duty_assignments"
    ADD CONSTRAINT "duty_assignments_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_line_items"
    ADD CONSTRAINT "invoice_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."kudos"
    ADD CONSTRAINT "kudos_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kudos"
    ADD CONSTRAINT "kudos_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kudos"
    ADD CONSTRAINT "kudos_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kudos"
    ADD CONSTRAINT "kudos_value_id_fkey" FOREIGN KEY ("value_id") REFERENCES "public"."kudos_values"("id");



ALTER TABLE ONLY "public"."kudos_values"
    ADD CONSTRAINT "kudos_values_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leave_balances"
    ADD CONSTRAINT "leave_balances_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payroll_settings"
    ADD CONSTRAINT "payroll_settings_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id");



ALTER TABLE ONLY "public"."payroll_settings"
    ADD CONSTRAINT "payroll_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payroll_ytd_opening"
    ADD CONSTRAINT "payroll_ytd_opening_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id");



ALTER TABLE ONLY "public"."payroll_ytd_opening"
    ADD CONSTRAINT "payroll_ytd_opening_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payroll_ytd_opening"
    ADD CONSTRAINT "payroll_ytd_opening_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payslips"
    ADD CONSTRAINT "payslips_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id");



ALTER TABLE ONLY "public"."payslips"
    ADD CONSTRAINT "payslips_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payslips"
    ADD CONSTRAINT "payslips_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payslips"
    ADD CONSTRAINT "payslips_finalized_by_fkey" FOREIGN KEY ("finalized_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roster_shifts"
    ADD CONSTRAINT "roster_shifts_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roster_shifts"
    ADD CONSTRAINT "roster_shifts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shareholdings"
    ADD CONSTRAINT "shareholdings_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id");



ALTER TABLE ONLY "public"."shareholdings"
    ADD CONSTRAINT "shareholdings_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."staff_documents"
    ADD CONSTRAINT "staff_documents_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id");



ALTER TABLE ONLY "public"."staff_documents"
    ADD CONSTRAINT "staff_documents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_documents"
    ADD CONSTRAINT "staff_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff_members"
    ADD CONSTRAINT "staff_members_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id");



ALTER TABLE ONLY "public"."staff_members"
    ADD CONSTRAINT "staff_members_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_attendance"
    ADD CONSTRAINT "student_attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."fee_packages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."term_deletion_requests"
    ADD CONSTRAINT "term_deletion_requests_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE CASCADE;



CREATE POLICY "attendance_admin_delete" ON "public"."student_attendance" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"]))))));



ALTER TABLE "public"."attendance_conditions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendance_delete" ON "public"."student_attendance" FOR DELETE USING (("public"."current_user_is_active"() AND "public"."is_admin_or_super"()));



CREATE POLICY "attendance_insert" ON "public"."student_attendance" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_staff"() AND ("center_id" = "public"."current_user_center_id"())));



CREATE POLICY "attendance_read" ON "public"."student_attendance" FOR SELECT TO "authenticated" USING (("public"."is_staff"() AND ("center_id" = "public"."current_user_center_id"())));



CREATE POLICY "attendance_update" ON "public"."student_attendance" FOR UPDATE TO "authenticated" USING (("public"."is_staff"() AND ("center_id" = "public"."current_user_center_id"()))) WITH CHECK (("public"."is_staff"() AND ("center_id" = "public"."current_user_center_id"())));



CREATE POLICY "bank_accounts_admin_all" ON "public"."invoice_bank_accounts" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"]))))));



ALTER TABLE "public"."board_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "board_items_delete" ON "public"."board_items" FOR DELETE TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"())) OR ("public"."current_user_is_active"() AND ("center_id" = "public"."current_user_center_id"()) AND ("author_id" = "auth"."uid"()))));



CREATE POLICY "board_items_insert" ON "public"."board_items" FOR INSERT TO "authenticated" WITH CHECK (("public"."current_user_is_active"() AND ("center_id" = "public"."current_user_center_id"()) AND ("author_id" = "auth"."uid"())));



CREATE POLICY "board_items_select" ON "public"."board_items" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."current_user_is_active"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "board_items_update" ON "public"."board_items" FOR UPDATE TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."current_user_is_active"() AND ("center_id" = "public"."current_user_center_id"())))) WITH CHECK (("public"."is_super_admin"() OR ("public"."current_user_is_active"() AND ("center_id" = "public"."current_user_center_id"()))));



ALTER TABLE "public"."center_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "center_settings_delete" ON "public"."center_settings" FOR DELETE TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "center_settings_insert" ON "public"."center_settings" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "center_settings_select" ON "public"."center_settings" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."current_user_is_active"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "center_settings_update" ON "public"."center_settings" FOR UPDATE TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"())))) WITH CHECK (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



ALTER TABLE "public"."centers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "centers_delete" ON "public"."centers" FOR DELETE TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "centers_insert" ON "public"."centers" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "centers_select" ON "public"."centers" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("id" = "public"."current_user_center_id"())));



CREATE POLICY "centers_update" ON "public"."centers" FOR UPDATE TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("id" = "public"."current_user_center_id"())))) WITH CHECK (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("id" = "public"."current_user_center_id"()))));



CREATE POLICY "claim_cat_admin" ON "public"."claim_categories" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"]))))));



CREATE POLICY "claim_cat_read" ON "public"."claim_categories" FOR SELECT TO "authenticated" USING ("public"."is_staff"());



ALTER TABLE "public"."claim_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."claims" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "claims_delete_admin" ON "public"."claims" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"]))))));



CREATE POLICY "claims_delete_own" ON "public"."claims" FOR DELETE TO "authenticated" USING ((("claimant_id" = "auth"."uid"()) AND ("status" = 'pending'::"text")));



CREATE POLICY "claims_insert" ON "public"."claims" FOR INSERT TO "authenticated" WITH CHECK ((("claimant_id" = "auth"."uid"()) AND ("status" = 'pending'::"text") AND ("approved_by" IS NULL) AND ("receipt_held" = false)));



CREATE POLICY "claims_select" ON "public"."claims" FOR SELECT TO "authenticated" USING ((("claimant_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"])))))));



CREATE POLICY "claims_update_admin" ON "public"."claims" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"]))))));



CREATE POLICY "claims_update_own" ON "public"."claims" FOR UPDATE TO "authenticated" USING ((("claimant_id" = "auth"."uid"()) AND ("status" = ANY (ARRAY['pending'::"text", 'rejected'::"text"])))) WITH CHECK (("claimant_id" = "auth"."uid"()));



ALTER TABLE "public"."classes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "classes_admin_write" ON "public"."classes" TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."current_user_is_active"() AND "public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"())))) WITH CHECK (("public"."is_super_admin"() OR ("public"."current_user_is_active"() AND "public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "classes_read" ON "public"."classes" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."current_user_is_active"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "conditions_admin_write" ON "public"."attendance_conditions" USING (("public"."current_user_is_active"() AND "public"."is_admin_or_super"())) WITH CHECK (("public"."current_user_is_active"() AND "public"."is_admin_or_super"()));



CREATE POLICY "conditions_read" ON "public"."attendance_conditions" FOR SELECT USING ("public"."current_user_is_active"());



CREATE POLICY "duty_assign_admin" ON "public"."duty_assignments" TO "authenticated" USING (("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))) WITH CHECK (("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"())));



CREATE POLICY "duty_assign_read" ON "public"."duty_assignments" FOR SELECT TO "authenticated" USING (("public"."current_user_is_active"() AND ("center_id" = "public"."current_user_center_id"())));



ALTER TABLE "public"."duty_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."duty_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "duty_types_admin" ON "public"."duty_types" TO "authenticated" USING (("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))) WITH CHECK (("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"())));



CREATE POLICY "duty_types_read" ON "public"."duty_types" FOR SELECT TO "authenticated" USING (("public"."current_user_is_active"() AND ("center_id" = "public"."current_user_center_id"())));



ALTER TABLE "public"."fee_packages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fee_packages_delete" ON "public"."fee_packages" FOR DELETE TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "fee_packages_insert" ON "public"."fee_packages" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "fee_packages_select" ON "public"."fee_packages" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "fee_packages_update" ON "public"."fee_packages" FOR UPDATE TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"())))) WITH CHECK (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



ALTER TABLE "public"."invoice_bank_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoice_line_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_line_items_delete" ON "public"."invoice_line_items" FOR DELETE TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND (EXISTS ( SELECT 1
   FROM "public"."invoices"
  WHERE (("invoices"."id" = "invoice_line_items"."invoice_id") AND ("invoices"."center_id" = "public"."current_user_center_id"())))))));



CREATE POLICY "invoice_line_items_insert" ON "public"."invoice_line_items" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND (EXISTS ( SELECT 1
   FROM "public"."invoices"
  WHERE (("invoices"."id" = "invoice_line_items"."invoice_id") AND ("invoices"."center_id" = "public"."current_user_center_id"())))))));



CREATE POLICY "invoice_line_items_select" ON "public"."invoice_line_items" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND (EXISTS ( SELECT 1
   FROM "public"."invoices"
  WHERE (("invoices"."id" = "invoice_line_items"."invoice_id") AND ("invoices"."center_id" = "public"."current_user_center_id"())))))));



CREATE POLICY "invoice_line_items_update" ON "public"."invoice_line_items" FOR UPDATE TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND (EXISTS ( SELECT 1
   FROM "public"."invoices"
  WHERE (("invoices"."id" = "invoice_line_items"."invoice_id") AND ("invoices"."center_id" = "public"."current_user_center_id"()))))))) WITH CHECK (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND (EXISTS ( SELECT 1
   FROM "public"."invoices"
  WHERE (("invoices"."id" = "invoice_line_items"."invoice_id") AND ("invoices"."center_id" = "public"."current_user_center_id"())))))));



ALTER TABLE "public"."invoice_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_settings_admin_read" ON "public"."invoice_settings" FOR SELECT USING ((("center_id" = ( SELECT "profiles"."center_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"]))));



CREATE POLICY "invoice_settings_admin_write" ON "public"."invoice_settings" FOR UPDATE USING ((("center_id" = ( SELECT "profiles"."center_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"])))) WITH CHECK ((("center_id" = ( SELECT "profiles"."center_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"]))));



ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoices_delete" ON "public"."invoices" FOR DELETE TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "invoices_insert" ON "public"."invoices" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "invoices_select" ON "public"."invoices" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "invoices_update" ON "public"."invoices" FOR UPDATE TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"())))) WITH CHECK (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



ALTER TABLE "public"."kudos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kudos_delete" ON "public"."kudos" FOR DELETE TO "authenticated" USING (("public"."is_super_admin"() OR ("from_user_id" = "auth"."uid"())));



CREATE POLICY "kudos_insert" ON "public"."kudos" FOR INSERT TO "authenticated" WITH CHECK ((("from_user_id" = "auth"."uid"()) AND ("center_id" = "public"."current_user_center_id"()) AND "public"."current_user_is_active"()));



CREATE POLICY "kudos_select" ON "public"."kudos" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"())) OR ("from_user_id" = "auth"."uid"()) OR ("to_user_id" = "auth"."uid"())));



ALTER TABLE "public"."kudos_values" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kudos_values_select" ON "public"."kudos_values" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."current_user_is_active"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "kudos_values_write" ON "public"."kudos_values" TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"())))) WITH CHECK (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "leave_bal_admin" ON "public"."leave_balances" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"]))))));



CREATE POLICY "leave_bal_read" ON "public"."leave_balances" FOR SELECT TO "authenticated" USING (((("profile_id" = "auth"."uid"()) AND ("leave_type" = 'AL'::"text")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"])))))));



ALTER TABLE "public"."leave_balances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leave_req_delete_admin" ON "public"."leave_requests" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"]))))));



CREATE POLICY "leave_req_delete_own" ON "public"."leave_requests" FOR DELETE TO "authenticated" USING ((("profile_id" = "auth"."uid"()) AND ("status" = 'pending'::"text")));



CREATE POLICY "leave_req_insert" ON "public"."leave_requests" FOR INSERT TO "authenticated" WITH CHECK ((("profile_id" = "auth"."uid"()) AND ("status" = 'pending'::"text") AND ("approved_by" IS NULL)));



CREATE POLICY "leave_req_select" ON "public"."leave_requests" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"])))))));



CREATE POLICY "leave_req_update_admin" ON "public"."leave_requests" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"]))))));



CREATE POLICY "leave_req_update_own" ON "public"."leave_requests" FOR UPDATE TO "authenticated" USING ((("profile_id" = "auth"."uid"()) AND ("status" = ANY (ARRAY['pending'::"text", 'rejected'::"text"])))) WITH CHECK (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."leave_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payroll_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_settings_insert" ON "public"."payroll_settings" FOR INSERT WITH CHECK (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "payroll_settings_select" ON "public"."payroll_settings" FOR SELECT USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "payroll_settings_update" ON "public"."payroll_settings" FOR UPDATE USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



ALTER TABLE "public"."payroll_ytd_opening" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payslips" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payslips_delete" ON "public"."payslips" FOR DELETE USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()) AND ("status" = 'draft'::"text"))));



CREATE POLICY "payslips_insert" ON "public"."payslips" FOR INSERT WITH CHECK (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "payslips_select" ON "public"."payslips" FOR SELECT USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"())) OR ("public"."current_user_is_active"() AND ("center_id" = "public"."current_user_center_id"()) AND ("employee_id" = "auth"."uid"()) AND ("status" = ANY (ARRAY['finalized'::"text", 'sent'::"text"])))));



CREATE POLICY "payslips_update" ON "public"."payslips" FOR UPDATE USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_delete" ON "public"."profiles" FOR DELETE TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()) AND ("role" <> ALL (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"])))));



CREATE POLICY "profiles_insert" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."is_super_admin"() OR ("public"."current_user_is_active"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "profiles_update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"())) OR ("id" = "auth"."uid"()))) WITH CHECK (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"())) OR ("id" = "auth"."uid"())));



ALTER TABLE "public"."roster_shifts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roster_shifts_delete" ON "public"."roster_shifts" FOR DELETE TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "roster_shifts_insert" ON "public"."roster_shifts" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "roster_shifts_select" ON "public"."roster_shifts" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."current_user_is_active"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "roster_shifts_update" ON "public"."roster_shifts" FOR UPDATE TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"())))) WITH CHECK (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



ALTER TABLE "public"."shareholdings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shareholdings_select" ON "public"."shareholdings" FOR SELECT USING ("public"."can_view_shareholdings"());



ALTER TABLE "public"."staff_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_documents_delete" ON "public"."staff_documents" FOR DELETE USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "staff_documents_insert" ON "public"."staff_documents" FOR INSERT WITH CHECK (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "staff_documents_select" ON "public"."staff_documents" FOR SELECT USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"())) OR ("public"."current_user_is_active"() AND ("center_id" = "public"."current_user_center_id"()) AND ("owner_id" = "auth"."uid"()))));



ALTER TABLE "public"."staff_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_members_delete" ON "public"."staff_members" FOR DELETE TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "staff_members_insert" ON "public"."staff_members" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "staff_members_select" ON "public"."staff_members" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."current_user_is_active"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "staff_members_update" ON "public"."staff_members" FOR UPDATE TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"())))) WITH CHECK (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



ALTER TABLE "public"."student_attendance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."students" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "students_delete" ON "public"."students" FOR DELETE TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "students_insert" ON "public"."students" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "students_select" ON "public"."students" FOR SELECT TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "students_staff_read" ON "public"."students" FOR SELECT TO "authenticated" USING (("public"."is_staff"() AND ("center_id" = "public"."current_user_center_id"())));



CREATE POLICY "students_update" ON "public"."students" FOR UPDATE TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"())))) WITH CHECK (("public"."is_super_admin"() OR ("public"."is_admin_or_super"() AND ("center_id" = "public"."current_user_center_id"()))));



CREATE POLICY "tdr_insert_admin" ON "public"."term_deletion_requests" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"]))))) AND ("requested_by" = "auth"."uid"())));



CREATE POLICY "tdr_read_center" ON "public"."term_deletion_requests" FOR SELECT USING (("center_id" = ( SELECT "profiles"."center_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "tdr_update_approver" ON "public"."term_deletion_requests" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"]))))) AND ("requested_by" <> "auth"."uid"()))) WITH CHECK (("reviewed_by" = "auth"."uid"()));



ALTER TABLE "public"."term_deletion_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."terms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "terms_admin_write" ON "public"."terms" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"]))))));



CREATE POLICY "terms_read_all" ON "public"."terms" FOR SELECT USING (("center_id" = ( SELECT "profiles"."center_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



ALTER TABLE "public"."tile_layouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tile_layouts_read" ON "public"."tile_layouts" FOR SELECT USING ("public"."current_user_is_active"());



CREATE POLICY "tile_layouts_sa_write" ON "public"."tile_layouts" USING (("public"."current_user_is_active"() AND "public"."is_super_admin"())) WITH CHECK (("public"."current_user_is_active"() AND "public"."is_super_admin"()));



CREATE POLICY "ytd_opening_admin_all" ON "public"."payroll_ytd_opening" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"])) AND ("p"."center_id" = "payroll_ytd_opening"."center_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super_admin'::"public"."user_role"])) AND ("p"."center_id" = "payroll_ytd_opening"."center_id")))));



CREATE POLICY "ytd_opening_self_read" ON "public"."payroll_ytd_opening" FOR SELECT USING (("employee_id" = "auth"."uid"()));



ALTER TABLE "public"."zoho_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zoho_accounts_select" ON "public"."zoho_accounts" FOR SELECT TO "authenticated" USING (("public"."is_admin_or_super"() OR "public"."is_shareholder"()));



ALTER TABLE "public"."zoho_bank_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zoho_bank_accounts_select" ON "public"."zoho_bank_accounts" FOR SELECT TO "authenticated" USING (("public"."is_admin_or_super"() OR "public"."is_shareholder"()));



ALTER TABLE "public"."zoho_bank_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zoho_bank_transactions_select" ON "public"."zoho_bank_transactions" FOR SELECT TO "authenticated" USING (("public"."is_admin_or_super"() OR "public"."is_shareholder"()));



ALTER TABLE "public"."zoho_contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zoho_contacts_select" ON "public"."zoho_contacts" FOR SELECT TO "authenticated" USING ("public"."is_admin_or_super"());



ALTER TABLE "public"."zoho_expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zoho_expenses_select" ON "public"."zoho_expenses" FOR SELECT TO "authenticated" USING (("public"."is_admin_or_super"() OR "public"."is_shareholder"()));



ALTER TABLE "public"."zoho_invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zoho_invoices_select" ON "public"."zoho_invoices" FOR SELECT TO "authenticated" USING (("public"."is_admin_or_super"() OR "public"."is_shareholder"()));



ALTER TABLE "public"."zoho_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zoho_payments_select" ON "public"."zoho_payments" FOR SELECT TO "authenticated" USING (("public"."is_admin_or_super"() OR "public"."is_shareholder"()));



ALTER TABLE "public"."zoho_recurring_invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zoho_recurring_invoices_select" ON "public"."zoho_recurring_invoices" FOR SELECT TO "authenticated" USING (("public"."is_admin_or_super"() OR "public"."is_shareholder"()));



ALTER TABLE "public"."zoho_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zoho_reports_select" ON "public"."zoho_reports" FOR SELECT TO "authenticated" USING (("public"."is_admin_or_super"() OR "public"."is_shareholder"()));



ALTER TABLE "public"."zoho_sync_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zoho_sync_log_select" ON "public"."zoho_sync_log" FOR SELECT TO "authenticated" USING (("public"."is_admin_or_super"() OR "public"."is_shareholder"()));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."duty_assignments" TO "anon";
GRANT ALL ON TABLE "public"."duty_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."duty_assignments" TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_roster_week"("p_week_start" "date", "p_week_end" "date", "p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_roster_week"("p_week_start" "date", "p_week_end" "date", "p_rows" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_roster_week"("p_week_start" "date", "p_week_end" "date", "p_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_roster_week"("p_week_start" "date", "p_week_end" "date", "p_rows" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."board_items_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."board_items_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."board_items_guard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_view_shareholdings"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_shareholdings"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_shareholdings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_shareholdings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."claims_approval_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."claims_approval_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."claims_approval_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."claims_receipt_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."claims_receipt_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."claims_receipt_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."claims_set_period"() TO "anon";
GRANT ALL ON FUNCTION "public"."claims_set_period"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."claims_set_period"() TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_invoice_with_lines"("p_center_id" "uuid", "p_student_id" "uuid", "p_term_label" "text", "p_issue_date" "date", "p_due_date" "date", "p_discount" numeric, "p_notes" "text", "p_line_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_invoice_with_lines"("p_center_id" "uuid", "p_student_id" "uuid", "p_term_label" "text", "p_issue_date" "date", "p_due_date" "date", "p_discount" numeric, "p_notes" "text", "p_line_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_invoice_with_lines"("p_center_id" "uuid", "p_student_id" "uuid", "p_term_label" "text", "p_issue_date" "date", "p_due_date" "date", "p_discount" numeric, "p_notes" "text", "p_line_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_invoice_with_lines"("p_center_id" "uuid", "p_student_id" "uuid", "p_term_label" "text", "p_issue_date" "date", "p_due_date" "date", "p_discount" numeric, "p_notes" "text", "p_line_items" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_user_center_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_center_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_center_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_center_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_user_is_active"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_is_active"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_is_active"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_is_active"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_invoice_no"("p_center" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_invoice_no"("p_center" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_invoice_no"("p_center" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."invoices_set_invoice_no"() TO "anon";
GRANT ALL ON FUNCTION "public"."invoices_set_invoice_no"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoices_set_invoice_no"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin_or_super"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin_or_super"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_or_super"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_or_super"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_app_owner"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_app_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_app_owner"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_shareholder"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_shareholder"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_shareholder"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_shareholder"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_staff"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_staff"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_staff"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_super_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."kudos_top_recipient"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kudos_top_recipient"() TO "anon";
GRANT ALL ON FUNCTION "public"."kudos_top_recipient"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."kudos_top_recipient"() TO "service_role";



GRANT ALL ON FUNCTION "public"."leave_approval_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."leave_approval_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."leave_approval_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."leave_set_days"() TO "anon";
GRANT ALL ON FUNCTION "public"."leave_set_days"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."leave_set_days"() TO "service_role";



GRANT ALL ON FUNCTION "public"."payslips_preserve_created_by"() TO "anon";
GRANT ALL ON FUNCTION "public"."payslips_preserve_created_by"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."payslips_preserve_created_by"() TO "service_role";



GRANT ALL ON FUNCTION "public"."profiles_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."profiles_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."profiles_guard"() TO "service_role";



GRANT ALL ON TABLE "public"."invoice_line_items" TO "anon";
GRANT ALL ON TABLE "public"."invoice_line_items" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_line_items" TO "service_role";



REVOKE ALL ON FUNCTION "public"."replace_invoice_lines"("p_invoice_id" "uuid", "p_lines" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."replace_invoice_lines"("p_invoice_id" "uuid", "p_lines" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."replace_invoice_lines"("p_invoice_id" "uuid", "p_lines" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_invoice_lines"("p_invoice_id" "uuid", "p_lines" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."requests_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."requests_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."requests_guard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."shareholder_family_ar_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."shareholder_family_ar_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."shareholder_family_ar_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."shareholder_family_ar_summary"() TO "service_role";



GRANT ALL ON FUNCTION "public"."staff_members_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."staff_members_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."staff_members_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."swap_duty_assignments"("p_work_date" "date", "p_staff_a" "uuid", "p_staff_b" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."swap_duty_assignments"("p_work_date" "date", "p_staff_a" "uuid", "p_staff_b" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."swap_duty_assignments"("p_work_date" "date", "p_staff_a" "uuid", "p_staff_b" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."attendance_conditions" TO "anon";
GRANT ALL ON TABLE "public"."attendance_conditions" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance_conditions" TO "service_role";



GRANT ALL ON TABLE "public"."board_items" TO "anon";
GRANT ALL ON TABLE "public"."board_items" TO "authenticated";
GRANT ALL ON TABLE "public"."board_items" TO "service_role";



GRANT ALL ON TABLE "public"."center_settings" TO "anon";
GRANT ALL ON TABLE "public"."center_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."center_settings" TO "service_role";



GRANT ALL ON TABLE "public"."centers" TO "anon";
GRANT ALL ON TABLE "public"."centers" TO "authenticated";
GRANT ALL ON TABLE "public"."centers" TO "service_role";



GRANT ALL ON TABLE "public"."claim_categories" TO "anon";
GRANT ALL ON TABLE "public"."claim_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."claim_categories" TO "service_role";



GRANT ALL ON TABLE "public"."claims" TO "anon";
GRANT ALL ON TABLE "public"."claims" TO "authenticated";
GRANT ALL ON TABLE "public"."claims" TO "service_role";



GRANT ALL ON TABLE "public"."classes" TO "anon";
GRANT ALL ON TABLE "public"."classes" TO "authenticated";
GRANT ALL ON TABLE "public"."classes" TO "service_role";



GRANT ALL ON TABLE "public"."duty_types" TO "anon";
GRANT ALL ON TABLE "public"."duty_types" TO "authenticated";
GRANT ALL ON TABLE "public"."duty_types" TO "service_role";



GRANT ALL ON TABLE "public"."fee_packages" TO "anon";
GRANT ALL ON TABLE "public"."fee_packages" TO "authenticated";
GRANT ALL ON TABLE "public"."fee_packages" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_bank_accounts" TO "anon";
GRANT ALL ON TABLE "public"."invoice_bank_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_bank_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_settings" TO "anon";
GRANT ALL ON TABLE "public"."invoice_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_settings" TO "service_role";



GRANT ALL ON TABLE "public"."kudos" TO "anon";
GRANT ALL ON TABLE "public"."kudos" TO "authenticated";
GRANT ALL ON TABLE "public"."kudos" TO "service_role";



GRANT ALL ON TABLE "public"."kudos_values" TO "anon";
GRANT ALL ON TABLE "public"."kudos_values" TO "authenticated";
GRANT ALL ON TABLE "public"."kudos_values" TO "service_role";



GRANT ALL ON TABLE "public"."leave_balances" TO "anon";
GRANT ALL ON TABLE "public"."leave_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."leave_balances" TO "service_role";



GRANT ALL ON TABLE "public"."leave_requests" TO "anon";
GRANT ALL ON TABLE "public"."leave_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."leave_requests" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_settings" TO "anon";
GRANT ALL ON TABLE "public"."payroll_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_settings" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_ytd_opening" TO "anon";
GRANT ALL ON TABLE "public"."payroll_ytd_opening" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_ytd_opening" TO "service_role";



GRANT ALL ON TABLE "public"."payslips" TO "anon";
GRANT ALL ON TABLE "public"."payslips" TO "authenticated";
GRANT ALL ON TABLE "public"."payslips" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."roster_shifts" TO "anon";
GRANT ALL ON TABLE "public"."roster_shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."roster_shifts" TO "service_role";



GRANT ALL ON TABLE "public"."shareholdings" TO "anon";
GRANT ALL ON TABLE "public"."shareholdings" TO "authenticated";
GRANT ALL ON TABLE "public"."shareholdings" TO "service_role";



GRANT ALL ON TABLE "public"."staff_documents" TO "anon";
GRANT ALL ON TABLE "public"."staff_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_documents" TO "service_role";



GRANT ALL ON TABLE "public"."staff_members" TO "anon";
GRANT ALL ON TABLE "public"."staff_members" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_members" TO "service_role";



GRANT ALL ON TABLE "public"."student_attendance" TO "anon";
GRANT ALL ON TABLE "public"."student_attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."student_attendance" TO "service_role";



GRANT ALL ON TABLE "public"."students" TO "anon";
GRANT ALL ON TABLE "public"."students" TO "authenticated";
GRANT ALL ON TABLE "public"."students" TO "service_role";



GRANT ALL ON TABLE "public"."term_deletion_requests" TO "anon";
GRANT ALL ON TABLE "public"."term_deletion_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."term_deletion_requests" TO "service_role";



GRANT ALL ON TABLE "public"."terms" TO "anon";
GRANT ALL ON TABLE "public"."terms" TO "authenticated";
GRANT ALL ON TABLE "public"."terms" TO "service_role";



GRANT ALL ON TABLE "public"."tile_layouts" TO "anon";
GRANT ALL ON TABLE "public"."tile_layouts" TO "authenticated";
GRANT ALL ON TABLE "public"."tile_layouts" TO "service_role";



GRANT ALL ON TABLE "public"."zoho_accounts" TO "anon";
GRANT ALL ON TABLE "public"."zoho_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."zoho_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."zoho_bank_accounts" TO "anon";
GRANT ALL ON TABLE "public"."zoho_bank_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."zoho_bank_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."zoho_bank_transactions" TO "anon";
GRANT ALL ON TABLE "public"."zoho_bank_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."zoho_bank_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."zoho_contacts" TO "anon";
GRANT ALL ON TABLE "public"."zoho_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."zoho_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."zoho_expenses" TO "anon";
GRANT ALL ON TABLE "public"."zoho_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."zoho_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."zoho_invoices" TO "anon";
GRANT ALL ON TABLE "public"."zoho_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."zoho_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."zoho_payments" TO "anon";
GRANT ALL ON TABLE "public"."zoho_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."zoho_payments" TO "service_role";



GRANT ALL ON TABLE "public"."zoho_recurring_invoices" TO "anon";
GRANT ALL ON TABLE "public"."zoho_recurring_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."zoho_recurring_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."zoho_reports" TO "anon";
GRANT ALL ON TABLE "public"."zoho_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."zoho_reports" TO "service_role";



GRANT ALL ON TABLE "public"."zoho_sync_log" TO "anon";
GRANT ALL ON TABLE "public"."zoho_sync_log" TO "authenticated";
GRANT ALL ON TABLE "public"."zoho_sync_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."zoho_sync_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."zoho_sync_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."zoho_sync_log_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







