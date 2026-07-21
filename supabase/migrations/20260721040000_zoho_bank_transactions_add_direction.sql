-- Captures Zoho's own transaction-direction and running-balance fields on
-- zoho_bank_transactions instead of inferring them app-side.
--
-- direction: raw value of Zoho's `debit_or_credit` field ("debit"/"credit").
--   For a bank/cash asset account, debit increases the balance, credit
--   decreases it (empirically confirmed against running_balance below).
-- running_balance: Zoho's own computed running balance after this
--   transaction (verbatim, not derived here) — authoritative, so the
--   bank-statement drill-down should display it directly rather than
--   re-deriving a balance from summed signed amounts.
--
-- No RLS change needed — RLS is table-level, existing
-- zoho_bank_transactions_select policy (20260721030000) already covers
-- these new columns.

alter table zoho_bank_transactions add column if not exists direction text;
alter table zoho_bank_transactions add column if not exists running_balance numeric(14,2);
