-- Phase 1 (Zoho -> shareholder dashboard): read-only Zoho Books mirror tables
-- One-way sync only; these tables are written exclusively by the zoho-sync
-- Edge Function (service-role, bypasses RLS). App roles get SELECT only,
-- granted in a separate policy migration (next step).
-- RLS enabled here with NO policies yet = deny-all until that step runs.
-- Text primary keys = Zoho record ids, for idempotent upsert on sync.

-- ============ zoho_invoices ============
create table zoho_invoices (
  invoice_id text primary key,
  invoice_number text,
  customer_id text,
  customer_name text,
  date date,
  total numeric(12,2) not null default 0,
  balance numeric(12,2) not null default 0,
  status text,
  last_modified_time timestamptz,
  synced_at timestamptz not null default now()
);

-- ============ zoho_payments ============
create table zoho_payments (
  payment_id text primary key,
  payment_number text,
  date date,
  amount numeric(12,2) not null default 0,
  payment_mode text,
  customer_id text,
  invoice_numbers text,
  last_modified_time timestamptz,
  synced_at timestamptz not null default now()
);

-- ============ zoho_expenses ============
create table zoho_expenses (
  expense_id text primary key,
  date date,
  account_name text,
  amount numeric(12,2) not null default 0,
  vendor_name text,
  description text,
  last_modified_time timestamptz,
  synced_at timestamptz not null default now()
);

-- ============ zoho_accounts (chart of accounts, for Balance Sheet) ============
create table zoho_accounts (
  account_id text primary key,
  account_name text,
  account_type text,
  current_balance numeric(12,2) not null default 0,
  synced_at timestamptz not null default now()
);

-- ============ zoho_bank_accounts ============
create table zoho_bank_accounts (
  account_id text primary key,
  account_name text,
  account_type text,
  current_balance numeric(12,2) not null default 0,
  synced_at timestamptz not null default now()
);

-- ============ zoho_contacts ============
create table zoho_contacts (
  contact_id text primary key,
  contact_name text,
  email text,
  mobile text,
  outstanding_receivable_amount numeric(12,2) not null default 0,
  last_modified_time timestamptz,
  synced_at timestamptz not null default now()
);

-- ============ zoho_sync_log (sync run history, not app-facing data) ============
create table zoho_sync_log (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  endpoint text,
  records int,
  api_calls int,
  ok boolean,
  note text
);

-- ============ INDEXES ============
create index idx_zoho_invoices_date on zoho_invoices(date);
create index idx_zoho_invoices_customer on zoho_invoices(customer_id);
create index idx_zoho_invoices_last_modified on zoho_invoices(last_modified_time);

create index idx_zoho_payments_date on zoho_payments(date);
create index idx_zoho_payments_customer on zoho_payments(customer_id);
create index idx_zoho_payments_last_modified on zoho_payments(last_modified_time);

create index idx_zoho_expenses_date on zoho_expenses(date);
create index idx_zoho_expenses_last_modified on zoho_expenses(last_modified_time);

create index idx_zoho_contacts_last_modified on zoho_contacts(last_modified_time);

create index idx_zoho_sync_log_ran_at on zoho_sync_log(ran_at desc);

-- ============ RLS (enabled, deny-all until Zoho mirror policy spec) ============
alter table zoho_invoices enable row level security;
alter table zoho_payments enable row level security;
alter table zoho_expenses enable row level security;
alter table zoho_accounts enable row level security;
alter table zoho_bank_accounts enable row level security;
alter table zoho_contacts enable row level security;
alter table zoho_sync_log enable row level security;
