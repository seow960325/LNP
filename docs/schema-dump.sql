-- docs/schema-dump.sql
--
-- Read-only schema dump for the `public` schema, for use when the Supabase
-- CLI / pg_dump is not available. Run this in the Supabase dashboard's
-- SQL editor. It only SELECTs from system catalogs (pg_catalog) — it does
-- not read or modify any application data, and issues no DDL/DML itself.
-- It reconstructs DDL text as query output; paste the full result set back
-- so it can be committed as the schema-of-record.
--
-- Covers: tables + columns/types, constraints, RLS enable flags, RLS
-- policies, triggers, functions. Also includes plain (non-constraint)
-- indexes for completeness, since those wouldn't otherwise show up.

with

tables as (
  select
    'TABLE' as section,
    c.relname as object_name,
    format(
      'CREATE TABLE public.%I (%s%s);',
      c.relname,
      chr(10) || string_agg(
        format(
          '  %I %s%s%s',
          a.attname,
          pg_catalog.format_type(a.atttypid, a.atttypmod),
          case when a.attnotnull then ' NOT NULL' else '' end,
          case when d.adbin is not null then ' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid) else '' end
        ),
        ',' || chr(10)
        order by a.attnum
      ),
      chr(10)
    ) as ddl
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  left join pg_catalog.pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
  where n.nspname = 'public' and c.relkind = 'r'
  group by c.relname
),

constraints as (
  select
    'CONSTRAINT' as section,
    con.conname as object_name,
    format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I %s;',
      rel.relname,
      con.conname,
      pg_get_constraintdef(con.oid)
    ) as ddl
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class rel on rel.oid = con.conrelid
  join pg_catalog.pg_namespace nsp on nsp.oid = con.connamespace
  where nsp.nspname = 'public'
),

indexes as (
  select
    'INDEX' as section,
    indexname as object_name,
    indexdef || ';' as ddl
  from pg_catalog.pg_indexes
  where schemaname = 'public'
),

rls_enabled as (
  select
    'RLS ENABLED' as section,
    c.relname as object_name,
    format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', c.relname) as ddl
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = true
),

policies as (
  select
    'RLS POLICY' as section,
    policyname as object_name,
    format(
      'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s;',
      policyname,
      tablename,
      case when permissive = 'PERMISSIVE' then 'PERMISSIVE' else 'RESTRICTIVE' end,
      cmd,
      array_to_string(roles, ', '),
      case when qual is not null then format(' USING (%s)', qual) else '' end,
      case when with_check is not null then format(' WITH CHECK (%s)', with_check) else '' end
    ) as ddl
  from pg_catalog.pg_policies
  where schemaname = 'public'
),

triggers as (
  select
    'TRIGGER' as section,
    t.tgname as object_name,
    pg_get_triggerdef(t.oid) || ';' as ddl
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
),

functions as (
  select
    'FUNCTION' as section,
    p.proname as object_name,
    pg_get_functiondef(p.oid) || ';' as ddl
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
)

select section, object_name, ddl
from (
  select * from tables
  union all
  select * from constraints
  union all
  select * from indexes
  union all
  select * from rls_enabled
  union all
  select * from policies
  union all
  select * from triggers
  union all
  select * from functions
) all_objects
order by
  case section
    when 'TABLE' then 1
    when 'CONSTRAINT' then 2
    when 'INDEX' then 3
    when 'RLS ENABLED' then 4
    when 'RLS POLICY' then 5
    when 'TRIGGER' then 6
    when 'FUNCTION' then 7
  end,
  object_name;
