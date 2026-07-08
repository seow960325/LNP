-- Phase 2 remediation (H3 + H4/invoicing): atomic invoice writes
--
-- Root cause (AUDIT_PHASE2.md H3, H4): invoice creation and invoice line-item
-- edits were each a sequence of independent client-side .insert()/.delete()/
-- .update() calls with no transaction. A failure partway through left an
-- orphaned $0 draft invoice (create path) or an invoice with its line items
-- deleted but not replaced (edit path).
--
-- Fix: move both multi-step writes into SECURITY INVOKER Postgres functions
-- (plain functions run as the calling role by default — no SECURITY DEFINER
-- needed here) so each runs inside a single transaction. RLS is NOT bypassed:
-- every insert/update below is still checked against the existing
-- invoices_insert / invoices_update / invoice_line_items_insert /
-- invoice_line_items_delete policies (20260703010000_phase3_billing_rls.sql),
-- exactly as the old client-side calls were.

-- ============================================================
-- create_invoice_with_lines
-- Replaces the client-side sequence in src/lib/billingApi.ts createInvoice():
-- insert invoices -> insert invoice_line_items -> update subtotal.
-- On any failure, the whole transaction rolls back — no orphaned invoice row.
-- ============================================================
create or replace function public.create_invoice_with_lines(
  p_center_id uuid,
  p_student_id uuid,
  p_term_label text,
  p_issue_date date,
  p_due_date date,
  p_discount numeric,
  p_notes text,
  p_line_items jsonb
)
returns public.invoices
language plpgsql
as $$
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

revoke all on function public.create_invoice_with_lines(uuid, uuid, text, date, date, numeric, text, jsonb) from public;
grant execute on function public.create_invoice_with_lines(uuid, uuid, text, date, date, numeric, text, jsonb) to authenticated;

-- ============================================================
-- replace_invoice_lines
-- Replaces the client-side sequence in src/lib/billingApi.ts
-- updateInvoiceLineItems(): delete existing lines -> insert new lines ->
-- update subtotal. On any failure (including a bad row in p_lines), nothing
-- is deleted — the whole transaction rolls back to the pre-edit state.
-- ============================================================
create or replace function public.replace_invoice_lines(
  p_invoice_id uuid,
  p_lines jsonb
)
returns setof public.invoice_line_items
language plpgsql
as $$
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

revoke all on function public.replace_invoice_lines(uuid, jsonb) from public;
grant execute on function public.replace_invoice_lines(uuid, jsonb) to authenticated;
