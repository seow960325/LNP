-- Phase 1 (Zoho -> shareholder dashboard), step 2: RLS policies
-- Tables: zoho_invoices, zoho_payments, zoho_expenses, zoho_accounts,
--   zoho_bank_accounts, zoho_contacts, zoho_sync_log (RLS already enabled,
--   deny-all, in 20260721000000_zoho_mirror_schema.sql)
-- Reuses Phase 1A helper fns: current_user_is_active, is_super_admin, is_admin_or_super
-- SELECT-only: no insert/update/delete policies anywhere in this file.
-- The zoho-sync Edge Function writes via the service role, which bypasses
-- RLS entirely, so app roles never need a write policy on these tables.
-- anon gets nothing (every policy below is scoped `to authenticated`).

-- ---------- Helper function (same pattern as is_super_admin / is_admin_or_super) ----------
create or replace function public.is_shareholder()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
    where id = auth.uid() and role = 'shareholder' and active)
$$;

revoke all on function public.is_shareholder() from public;
grant execute on function public.is_shareholder() to authenticated;

-- ============================================================
-- Financial tables — shareholder, admin, super_admin (active only)
-- ============================================================
create policy zoho_invoices_select on public.zoho_invoices
  as permissive for select to authenticated
  using ( is_admin_or_super() or is_shareholder() );

create policy zoho_payments_select on public.zoho_payments
  as permissive for select to authenticated
  using ( is_admin_or_super() or is_shareholder() );

create policy zoho_expenses_select on public.zoho_expenses
  as permissive for select to authenticated
  using ( is_admin_or_super() or is_shareholder() );

create policy zoho_accounts_select on public.zoho_accounts
  as permissive for select to authenticated
  using ( is_admin_or_super() or is_shareholder() );

create policy zoho_bank_accounts_select on public.zoho_bank_accounts
  as permissive for select to authenticated
  using ( is_admin_or_super() or is_shareholder() );

create policy zoho_sync_log_select on public.zoho_sync_log
  as permissive for select to authenticated
  using ( is_admin_or_super() or is_shareholder() );

-- ============================================================
-- zoho_contacts — admin/super_admin ONLY (parent PII: email, mobile).
-- Shareholders get no row-level access to this table at all; they get
-- aggregates only, via shareholder_family_ar_summary() below.
-- ============================================================
create policy zoho_contacts_select on public.zoho_contacts
  as permissive for select to authenticated
  using ( is_admin_or_super() );

-- ============================================================
-- shareholder_family_ar_summary
-- Family count + total outstanding AR for shareholders, with no PII
-- exposure (no names/emails/phones — those stay behind the admin-only
-- zoho_contacts policy above). SECURITY DEFINER so it can aggregate
-- zoho_contacts on a shareholder's behalf despite that table's RLS
-- excluding them; the role check below is the actual gate.
-- ============================================================
create or replace function public.shareholder_family_ar_summary()
returns table (family_count bigint, total_outstanding numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (is_admin_or_super() or is_shareholder()) then
    raise exception 'Not authorized';
  end if;

  return query
    select count(*)::bigint, coalesce(sum(outstanding_receivable_amount), 0)
    from public.zoho_contacts;
end;
$$;

revoke all on function public.shareholder_family_ar_summary() from public;
grant execute on function public.shareholder_family_ar_summary() to authenticated;
