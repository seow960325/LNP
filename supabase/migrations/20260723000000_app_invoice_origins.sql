-- Tracks which zoho_invoices rows were created FROM the app (via
-- zoho-invoice-create) rather than pulled in from pre-existing Zoho data —
-- an audit trail, not a source of truth (the Zoho invoice itself is that).
--
-- This is a CAPTURE of the live table, which was created by hand before this
-- migration existed — replaying this on an empty database must reproduce
-- that exact shape (zoho_invoice_id as the PK, no surrogate id column,
-- created_by nullable against auth.users) rather than a redesigned one.
-- Re-running this against the live DB (which already has this shape and
-- this policy) must be a no-op: zero errors, zero changes.

CREATE TABLE IF NOT EXISTS public.app_invoice_origins (
  zoho_invoice_id text PRIMARY KEY,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_invoice_origins ENABLE ROW LEVEL SECURITY;

-- Drop every historical policy name this table has carried — including
-- names from before this migration existed — so a replay against live is a
-- true no-op instead of erroring on a leftover policy under an old name.
DROP POLICY IF EXISTS "staff read app_invoice_origins" ON public.app_invoice_origins;
DROP POLICY IF EXISTS "admin insert app_invoice_origins" ON public.app_invoice_origins;
DROP POLICY IF EXISTS "admin delete app_invoice_origins" ON public.app_invoice_origins;
DROP POLICY IF EXISTS app_invoice_origins_select ON public.app_invoice_origins;

-- Only a SELECT policy. Deliberately no INSERT/UPDATE/DELETE policy for
-- authenticated: only the zoho-invoice-create Edge Function's service-role
-- client writes here. A client-writable origins table would let an admin
-- self-register a Zoho-origin invoice id for an invoice they didn't actually
-- create through the app, defeating the B1b delete/update guard that trusts
-- this table to say which zoho_invoices rows are app-originated.
CREATE POLICY app_invoice_origins_select ON public.app_invoice_origins
  FOR SELECT TO authenticated
  USING (public.is_admin_or_super() OR public.is_shareholder());

REVOKE ALL ON TABLE public.app_invoice_origins FROM authenticated;
GRANT SELECT ON TABLE public.app_invoice_origins TO authenticated;
GRANT ALL ON TABLE public.app_invoice_origins TO service_role;
