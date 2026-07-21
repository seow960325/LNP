-- Phase 1 (Zoho -> shareholder dashboard): zoho_reports mirror table
-- Stores Zoho Books' own P&L / Balance Sheet report payloads verbatim —
-- these are accrual-correct; the zoho_invoices/zoho_expenses transaction
-- mirrors can't reproduce an accrual P&L (they miss bills/payroll/COGS and
-- include refundable deposits). Written only by the zoho-sync Edge
-- Function (service role, bypasses RLS).
-- Single migration for schema + RLS (small single-table addition, not
-- phased like the original zoho_* mirror tables).

create table zoho_reports (
  report_type text not null check (report_type in ('pnl', 'balancesheet')),
  period_start date not null,
  period_end date not null,
  data jsonb not null,
  synced_at timestamptz not null default now(),
  primary key (report_type, period_start, period_end)
);

create index idx_zoho_reports_type on zoho_reports(report_type);

alter table zoho_reports enable row level security;

create policy zoho_reports_select on public.zoho_reports
  as permissive for select to authenticated
  using ( is_admin_or_super() or is_shareholder() );
