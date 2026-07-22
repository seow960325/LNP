-- Phase 1 (Zoho -> shareholder dashboard): zoho_bank_transactions mirror table
-- Feeds the Cash-at-Bank KPI drill-down (bank statement view: running
-- balance per account, newest first). Written only by the zoho-sync Edge
-- Function (service role, bypasses RLS).
-- Single migration for schema + RLS (small single-table addition, matches
-- the zoho_reports migration's convention).

create table zoho_bank_transactions (
  transaction_id text primary key,
  account_id text,
  date date,
  amount numeric(12,2),
  transaction_type text,
  payee text,
  description text,
  status text,
  last_modified_time timestamptz,
  synced_at timestamptz not null default now()
);

create index idx_zoho_bank_transactions_account_date on zoho_bank_transactions(account_id, date);

alter table zoho_bank_transactions enable row level security;

create policy zoho_bank_transactions_select on public.zoho_bank_transactions
  as permissive for select to authenticated
  using ( is_admin_or_super() or is_shareholder() );
