-- Phase 3 RLS policies: fee_packages, students, invoices, invoice_line_items
-- Tables: RLS already enabled
-- Reuses Phase 1A helper fns: current_user_center_id, is_super_admin, is_admin_or_super
-- Access: admin + super_admin only, full CRUD scoped to center_id = current_user_center_id()

-- ============================================================
-- fee_packages
--   admin/super_admin: full CRUD in own center; super_admin all centers
-- ============================================================
create policy fee_packages_select on public.fee_packages
  as permissive for select to authenticated
  using (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
  );

create policy fee_packages_insert on public.fee_packages
  as permissive for insert to authenticated
  with check (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
  );

create policy fee_packages_update on public.fee_packages
  as permissive for update to authenticated
  using (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
  )
  with check (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
  );

create policy fee_packages_delete on public.fee_packages
  as permissive for delete to authenticated
  using (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
  );

-- ============================================================
-- students
--   admin/super_admin: full CRUD in own center; super_admin all centers
-- ============================================================
create policy students_select on public.students
  as permissive for select to authenticated
  using (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
  );

create policy students_insert on public.students
  as permissive for insert to authenticated
  with check (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
  );

create policy students_update on public.students
  as permissive for update to authenticated
  using (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
  )
  with check (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
  );

create policy students_delete on public.students
  as permissive for delete to authenticated
  using (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
  );

-- ============================================================
-- invoices
--   admin/super_admin: full CRUD in own center; super_admin all centers
-- ============================================================
create policy invoices_select on public.invoices
  as permissive for select to authenticated
  using (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
  );

create policy invoices_insert on public.invoices
  as permissive for insert to authenticated
  with check (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
  );

create policy invoices_update on public.invoices
  as permissive for update to authenticated
  using (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
  )
  with check (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
  );

create policy invoices_delete on public.invoices
  as permissive for delete to authenticated
  using (
    is_super_admin()
    or (is_admin_or_super() and center_id = current_user_center_id())
  );

-- ============================================================
-- invoice_line_items
--   Scoped via parent invoice's center_id via RLS on invoices
--   admin/super_admin: full CRUD for line items in their center's invoices
-- ============================================================
create policy invoice_line_items_select on public.invoice_line_items
  as permissive for select to authenticated
  using (
    is_super_admin()
    or (is_admin_or_super() and exists (
      select 1 from invoices
      where invoices.id = invoice_line_items.invoice_id
        and invoices.center_id = current_user_center_id()
    ))
  );

create policy invoice_line_items_insert on public.invoice_line_items
  as permissive for insert to authenticated
  with check (
    is_super_admin()
    or (is_admin_or_super() and exists (
      select 1 from invoices
      where invoices.id = invoice_line_items.invoice_id
        and invoices.center_id = current_user_center_id()
    ))
  );

create policy invoice_line_items_update on public.invoice_line_items
  as permissive for update to authenticated
  using (
    is_super_admin()
    or (is_admin_or_super() and exists (
      select 1 from invoices
      where invoices.id = invoice_line_items.invoice_id
        and invoices.center_id = current_user_center_id()
    ))
  )
  with check (
    is_super_admin()
    or (is_admin_or_super() and exists (
      select 1 from invoices
      where invoices.id = invoice_line_items.invoice_id
        and invoices.center_id = current_user_center_id()
    ))
  );

create policy invoice_line_items_delete on public.invoice_line_items
  as permissive for delete to authenticated
  using (
    is_super_admin()
    or (is_admin_or_super() and exists (
      select 1 from invoices
      where invoices.id = invoice_line_items.invoice_id
        and invoices.center_id = current_user_center_id()
    ))
  );
