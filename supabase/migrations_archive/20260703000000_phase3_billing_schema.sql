-- Phase 3 billing foundation: fee_packages, students, invoices, invoice_line_items
-- Tables + FKs + indexes + RLS enabled (deny-all until Phase 3 policy spec)
-- Invoice number generation function + BEFORE INSERT trigger

-- ============ fee_packages ============
create table fee_packages (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null default '00000000-0000-0000-0000-000000000001',
  name text not null,
  default_price numeric(10,2) not null default 0,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============ students ============
create table students (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null default '00000000-0000-0000-0000-000000000001',
  name text not null,
  parent_name text,
  parent_phone text,
  parent_email text,
  package_id uuid references fee_packages(id) on delete set null,
  enrolled_at date,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============ invoices ============
create table invoices (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null default '00000000-0000-0000-0000-000000000001',
  student_id uuid not null references students(id) on delete restrict,
  invoice_no text not null unique,
  term_label text,
  issue_date date not null default current_date,
  due_date date,
  subtotal numeric(10,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','sent','paid','void')),
  paid_at timestamptz,
  payment_method text,
  notes text,
  created_at timestamptz not null default now()
);

-- ============ invoice_line_items ============
create table invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  description text not null,
  amount numeric(10,2) not null default 0,
  sort_order int not null default 0
);

-- ============ INVOICE NUMBER GENERATION ============
-- Function: generate_invoice_no(p_center uuid)
-- Returns: 'INV-YYYY-NNNN' where NNNN is zero-padded next sequence for year
create or replace function public.generate_invoice_no(p_center uuid)
returns text
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_year int;
  v_next_seq int;
  v_invoice_no text;
begin
  v_year := extract(year from now())::int;

  -- Find the max sequence number for this center in the current year
  select coalesce(max((regexp_matches(invoice_no, '\d+$'))[1])::int, 0) + 1
  into v_next_seq
  from invoices
  where center_id = p_center
    and extract(year from created_at) = v_year;

  v_invoice_no := format('INV-%s-%s', v_year, lpad(v_next_seq::text, 4, '0'));

  return v_invoice_no;
end;
$$;

-- ============ TRIGGER: set invoice_no if null ============
create or replace function public.invoices_set_invoice_no()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.invoice_no is null then
    new.invoice_no := generate_invoice_no(new.center_id);
  end if;
  return new;
end;
$$;

create trigger invoices_set_invoice_no_trg
  before insert on public.invoices
  for each row execute function public.invoices_set_invoice_no();

-- ============ INDEXES ============
create index idx_fee_packages_center on fee_packages(center_id);
create index idx_fee_packages_active on fee_packages(center_id, active);

create index idx_students_center on students(center_id);
create index idx_students_package on students(package_id);
create index idx_students_active on students(center_id, active);

create index idx_invoices_center on invoices(center_id);
create index idx_invoices_student on invoices(student_id);
create index idx_invoices_status on invoices(center_id, status);
create index idx_invoices_invoice_no on invoices(invoice_no);

create index idx_invoice_line_items_invoice on invoice_line_items(invoice_id);

-- ============ RLS (enabled, deny-all until Phase 3 policy spec) ============
alter table fee_packages enable row level security;
alter table students enable row level security;
alter table invoices enable row level security;
alter table invoice_line_items enable row level security;
