-- Phase 3: Configurable invoice numbering, discounts, and receipts

-- 1. Create invoice_settings table for configurable invoice numbering
create table public.invoice_settings (
  id uuid not null default gen_random_uuid() primary key,
  center_id uuid not null unique,
  prefix text not null default 'INV',
  include_year boolean not null default true,
  include_month boolean not null default true,
  separator text not null default '-',
  seq_padding integer not null default 4,
  next_seq integer not null default 1,
  created_at timestamp with time zone not null default now()
);

-- Enable RLS on invoice_settings
alter table public.invoice_settings enable row level security;

-- RLS policy: admins and super_admins can read/write their center's settings
create policy invoice_settings_admin_read on public.invoice_settings for select
  using (
    center_id = (select center_id from public.profiles where id = auth.uid())
    and (
      (select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin')
    )
  );

create policy invoice_settings_admin_write on public.invoice_settings for update
  using (
    center_id = (select center_id from public.profiles where id = auth.uid())
    and (
      (select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin')
    )
  )
  with check (
    center_id = (select center_id from public.profiles where id = auth.uid())
    and (
      (select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin')
    )
  );

-- Seed default settings for the default center
insert into public.invoice_settings (center_id, prefix, include_year, include_month, separator, seq_padding, next_seq)
values ('00000000-0000-0000-0000-000000000001', 'INV', true, true, '-', 4, 1)
on conflict (center_id) do nothing;

-- 2. Add discount and receipt_path columns to invoices table
alter table public.invoices add column if not exists discount numeric(10, 2) not null default 0;
alter table public.invoices add column if not exists receipt_path text;

-- 3. Update generate_invoice_no function to support configurable numbering with monthly reset
create or replace function public.generate_invoice_no(p_center uuid)
returns text
language plpgsql
stable
as $$
declare
  v_settings public.invoice_settings;
  v_year_part text;
  v_month_part text;
  v_seq integer;
  v_month_invoices integer;
  v_seq_str text;
begin
  -- Fetch settings for this center
  select * into v_settings from public.invoice_settings where center_id = p_center limit 1;

  -- If no settings exist, use defaults
  if v_settings is null then
    v_settings := row(
      null,
      p_center,
      'INV',
      true,
      true,
      '-',
      4,
      1,
      now()
    )::public.invoice_settings;
  end if;

  -- Build year part if enabled
  if v_settings.include_year then
    v_year_part := to_char(now(), 'YYYY');
  else
    v_year_part := '';
  end if;

  -- Build month part if enabled
  if v_settings.include_month then
    v_month_part := to_char(now(), 'MM');
  else
    v_month_part := '';
  end if;

  -- Calculate sequence number with monthly reset
  -- Count invoices for this center in the current year+month
  select count(*) into v_month_invoices
  from public.invoices
  where center_id = p_center
    and extract(year from created_at) = extract(year from now())
    and extract(month from created_at) = extract(month from now());

  -- Sequence is max of (next_seq setting, current month count + 1)
  v_seq := greatest(v_settings.next_seq, v_month_invoices + 1);

  -- Pad the sequence
  v_seq_str := lpad(v_seq::text, v_settings.seq_padding, '0');

  -- Build the complete number
  return v_settings.prefix ||
         case when v_year_part != '' and v_month_part != '' then v_settings.separator else '' end ||
         v_year_part ||
         case when v_month_part != '' and v_year_part != '' then v_settings.separator else
              case when v_month_part != '' then v_settings.separator else '' end end ||
         v_month_part ||
         case when (v_year_part != '' or v_month_part != '') then v_settings.separator else '' end ||
         v_seq_str;
end;
$$;

-- The BEFORE INSERT trigger on invoices still works — it will call this updated function
