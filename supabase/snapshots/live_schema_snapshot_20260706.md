# Center Ops — Live Schema Snapshot (public + storage)
_Catalog-derived documentation snapshot. Generated 2026-07-06 from the live DB
(project nrioqwrhqczwomwgzmgp) because ~29 public tables exist in production
that were never captured in supabase/migrations/ (drift). This documents the
security-relevant surface (all RLS policies + all triggers) so it is reviewable
in git. NOTE: this is DOCUMENTATION, not replayable DDL — a real restorable
backup still requires `supabase db dump` (see repo notes)._

## Shorthand used in the policy catalog
- `[super]`        = is_super_admin()
- `[admin+ctr]`    = is_admin_or_super() AND center_id = current_user_center_id()
- `[admin*]`       = EXISTS(profiles p WHERE p.id=auth.uid() AND p.role IN (admin,super_admin))  (no center scope)
- `[active+ctr]`   = current_user_is_active() AND center_id = current_user_center_id()
- `[active]`       = current_user_is_active()
- `[self]`         = row's owning user column = auth.uid()

## Public tables (29)
attendance_conditions, board_items, center_settings, centers, claim_categories,
claims, classes, duty_assignments, duty_types, fee_packages, invoice_bank_accounts,
invoice_line_items, invoice_settings, invoices, kudos, kudos_values, leave_balances,
leave_requests, payroll_settings, payroll_ytd_opening, payslips, profiles,
roster_shifts, staff_documents, student_attendance, students, term_deletion_requests,
terms, tile_layouts

(Note: the tables `attendance` and `requests` referenced by migration
20260702120000_rls_phase1b.sql do NOT exist in production — the live equivalents
are `student_attendance` and `leave_requests`. That migration is stale drift.)

---

## RLS POLICY CATALOG (complete — from pg_policies, 2026-07-06)

### Core
- centers: select `[super] OR id=ctr` · insert `[super]` · update `[super] OR (admin+ id=ctr)` · delete `[super]`
- profiles: select `id=auth.uid() OR [super] OR [active+ctr]` · insert `[super] OR [admin+ctr]` · update (TO public) `is_app_owner() OR (target.is_app_owner=false AND ([super] OR id=auth.uid() OR (admin+ctr AND role<>super_admin)))` · delete `[super] OR (admin+ctr AND role NOT IN (admin,super_admin))`
- center_settings: select `[super] OR [active+ctr]` · insert/update/delete `[super] OR [admin+ctr]`
- kudos: select `[super] OR (admin+ctr) OR from_user=auth.uid() OR to_user=auth.uid()` · insert `from_user=auth.uid() AND center=ctr AND active` · delete `[super] OR from_user=auth.uid()` · (no update)
- kudos_values: select `[super] OR [active+ctr]` · write(ALL) `[super] OR [admin+ctr]`
- board_items: select `[super] OR [active+ctr]` · insert `active+ctr AND author=auth.uid()` · update `[super] OR [active+ctr]` (guard trg restricts non-author to status only) · delete `[super] OR (admin+ctr) OR (active+ctr AND author=auth.uid())`

### Phase 1B ops
- roster_shifts: select `[super] OR [active+ctr]` · insert/update/delete `[super] OR [admin+ctr]`
- student_attendance (TO public): read/insert/update `[active+ctr]` · delete `[active] AND admin` + `[admin*]`
- attendance_conditions (TO public): read `[active]` · write(ALL) `[active] AND admin`
- leave_requests: select `[self] OR [admin*]` · insert `profile_id=auth.uid() AND status=pending AND approved_by null` · update_own `profile_id=auth.uid() AND status IN (pending,rejected)` (guard trg blocks self-approve) · update_admin `[admin*]` · delete_own `self AND pending` · delete_admin `[admin*]`
- leave_balances: read `(profile_id=auth.uid() AND leave_type=AL) OR [admin*]` · admin(ALL) `[admin*]`
- claims: select `claimant=auth.uid() OR [admin*]` · insert `claimant=auth.uid() AND pending AND approved_by null AND receipt_held=false` · update_own `claimant=auth.uid() AND status IN (pending,rejected)` (guard trg blocks self-approve) · update_admin `[admin*]` · delete_own `claimant AND pending` · delete_admin `[admin*]`
- claim_categories: read `true` (authenticated) · admin(ALL) `[admin*]`
- duty_types / duty_assignments: read `true` (authenticated) · admin(ALL) `[admin*]`

### Payroll (sensitive — verified self-scoped)
- payslips (TO public): select `[super] OR (admin+ctr) OR (active+ctr AND employee_id=auth.uid() AND status IN (finalized,sent))` · insert/update `[super] OR [admin+ctr]` · delete `[super] OR (admin+ctr AND status=draft)`
- payroll_ytd_opening (TO public): self_read `employee_id=auth.uid()` · admin(ALL) `[admin* AND p.center_id=row.center_id]`
- payroll_settings (TO public): select/insert/update `[super] OR [admin+ctr]`
- staff_documents (TO public): select `[super] OR (admin+ctr) OR (active+ctr AND owner_id=auth.uid())` · insert/update/delete `[super] OR [admin+ctr]`

### Billing
- students: select `[super] OR [admin+ctr]` (admins) + students_teacher_read (TO public) `[active+ctr]` · insert/update/delete `[super] OR [admin+ctr]`
- invoices: select/insert/update/delete `[super] OR [admin+ctr]`
- invoice_line_items: all cmds `[super] OR (admin AND EXISTS invoice in ctr)`
- fee_packages: all cmds `[super] OR [admin+ctr]`
- invoice_bank_accounts (TO public): admin_all(ALL) `[admin*]`
- invoice_settings (TO public): admin_read(SELECT) / admin_write(UPDATE) `center=my center AND role IN (admin,super_admin)` — NOTE: inline subquery, NO active check (deactivated admin retains access). No INSERT/DELETE policy.
- classes (TO public): read `[active]` · admin_write(ALL) `[active] AND admin`
- terms (TO public): read `center=my center` · admin_write(ALL) `[admin*]`
- term_deletion_requests (TO public): read `center=my center` · insert `[admin*] AND requested_by=auth.uid()` · update_approver `[admin*] AND requested_by<>auth.uid()` (check reviewed_by=auth.uid()) — separation of duties enforced
- tile_layouts (TO public): read `[active]` · sa_write(ALL) `[active] AND [super]`

---

## TRIGGERS + GUARD FUNCTION BODIES (complete — the security-critical logic)

### profiles_guard (BEFORE INSERT/UPDATE, SECURITY DEFINER)
```sql
begin
  if (new.role = 'super_admin') and not is_super_admin() then
    raise exception 'Only super_admin may assign the super_admin role';
  end if;
  if tg_op = 'UPDATE' then
    if old.is_app_owner = true and not is_app_owner() then
      raise exception 'The app owner profile cannot be modified by others';
    end if;
    if new.is_app_owner is distinct from old.is_app_owner then
      raise exception 'The app owner flag cannot be changed';
    end if;
    if new.id = auth.uid() and not is_admin_or_super() then
      if new.role is distinct from old.role
         or new.center_id is distinct from old.center_id
         or new.active is distinct from old.active then
        raise exception 'You cannot change your own role, center, or active status';
      end if;
    end if;
    if not is_super_admin() and (new.center_id is distinct from old.center_id) then
      raise exception 'Only super_admin may change a profile center';
    end if;
    if not is_super_admin() and old.role = 'super_admin' then
      raise exception 'Only super_admin may modify a super_admin profile';
    end if;
  end if;
  return new;
end;
```

### claims_approval_guard (BEFORE UPDATE, SECURITY DEFINER)
```sql
declare actor uuid := auth.uid();
        actor_role text;
begin
  select role into actor_role from public.profiles where id = actor;
  if new.status is distinct from old.status and new.status in ('approved','rejected') then
    if actor_role not in ('admin','super_admin') then
      raise exception 'Only admin can approve or reject claims';
    end if;
    if actor = old.claimant_id then
      raise exception 'You cannot approve or reject your own claim';
    end if;
    if new.status = 'rejected' and coalesce(btrim(new.reject_reason),'') = '' then
      raise exception 'Reject reason required';
    end if;
    new.approved_by := actor;
    new.approved_at := now();
  end if;
  if new.status = 'pending' and old.status = 'rejected' then
    new.approved_by := null; new.approved_at := null;
    new.reject_reason := null; new.submitted_at := now();
  end if;
  return new;
end
```

### leave_approval_guard (BEFORE UPDATE, SECURITY DEFINER)
```sql
-- identical shape to claims_approval_guard, keyed on old.profile_id instead of claimant_id
-- blocks non-admin approve/reject AND blocks self-approve even by admin; stamps approved_by/at
```

### claims_receipt_guard (BEFORE UPDATE, SECURITY DEFINER)
```sql
begin
  if new.receipt_held is distinct from old.receipt_held then
    select role into actor_role from public.profiles where id = auth.uid();
    if actor_role not in ('admin','super_admin') then
      raise exception 'Only admin can mark receipt as held';
    end if;
  end if;
  return new;
end
```

### board_items_guard (BEFORE UPDATE, SECURITY DEFINER)
```sql
begin
  if is_admin_or_super() or old.author_id = auth.uid() then return new; end if;
  if new.title/body/type/priority/assigned_to/author_id/date/center_id is distinct from old.*
    then raise exception 'You may only mark items done; editing is restricted to author or admin';
  end if;
  return new;
end
```

### Non-security helper triggers
- claims_set_period / (INSERT+UPDATE): sets period := to_char(expense_date,'YYYY-MM')
- leave_set_days (INSERT+UPDATE): computes days (0.5 for am/pm half-day; else count Mon-Fri in range; rejects zero-working-day ranges)
- invoices_set_invoice_no (INSERT, SECURITY DEFINER): sets invoice_no via generate_invoice_no() if null
- touch_updated_at (BEFORE UPDATE on claims/leave_balances/leave_requests): new.updated_at := now()

### Helper functions (bodies already in git: 20260701130000_rls_phase1a.sql)
current_user_center_id(), current_user_is_active(), is_super_admin(),
is_admin_or_super() — all STABLE SECURITY DEFINER, search_path=public.
is_app_owner() — referenced by profiles_guard; body NOT yet captured (add to next dump).
kudos_top_recipient(), generate_invoice_no() — SECURITY DEFINER.

---

## STORAGE (schema: storage.objects / storage.buckets — post 2026-07-06 C1/C2 fix)

### Buckets
| bucket | public | size limit | mime allowlist |
|---|---|---|---|
| student-photos | FALSE | 5 MB | jpeg/png/webp |
| attendance-photos | FALSE | 5 MB | jpeg/png/webp |
| avatars | TRUE | 5 MB | jpeg/png/webp |
| invoice-receipts | FALSE | 5 MB | jpeg/png/webp/pdf |
| staff-docs | FALSE | 5 MB | pdf |

### storage.objects policies
- student_photos_read (SELECT, authenticated): `bucket=student-photos AND current_user_is_active()`
- student_photos_admin_insert/update/delete: `bucket AND active AND is_admin_or_super()`
- attendance_photos_read (SELECT, authenticated): `bucket=attendance-photos AND current_user_is_active()`
- attendance_photos_staff_write/update: `bucket AND current_user_is_active()`
- avatars_public_read (SELECT, public): `bucket=avatars`
- avatars_owner_insert/update/delete: `bucket AND foldername[1]=auth.uid()`
- staffdocs_read: `bucket=staff-docs AND (foldername[1]=auth.uid() OR is_admin_or_super())`
- staffdocs_insert/update/delete: `bucket AND is_admin_or_super()`
- invoice_receipts_admin_all (ALL, authenticated): `bucket=invoice-receipts AND role IN (admin,super_admin)`

---

## KNOWN GAPS IN THIS SNAPSHOT (for the real db dump to capture)
1. Column definitions truncated at `invoices` (SQL editor row cap) — kudos, kudos_values,
   leave_*, payroll_*, payslips, profiles, roster_shifts, staff_documents,
   student_attendance, students, terms, term_deletion_requests, tile_layouts columns missing.
2. Constraints truncated at `invoice_bank_accounts`.
3. is_app_owner() function body not captured.
4. Enum type definitions (board_item_type, board_priority, board_status, user_role,
   attendance_source, request_type, request_status) not captured here.
=> A `supabase db dump --schema public` (T14s PowerShell, real sbp_ token, Docker running)
   produces the complete replayable version. This doc is the reviewable interim.
