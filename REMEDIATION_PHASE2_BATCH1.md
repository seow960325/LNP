# Phase 2 Remediation — Batch 1 (H3, H4, M2, M3)

_2026-07-08. Fixes the atomicity/data-loss findings from `AUDIT_PHASE2.md`. Root
cause across H3/H4/M3: multi-step DB writes ran client-side with no
transaction, so a partial failure lost or corrupted data. Fix: each is now a
single server-side Postgres function called via `.rpc()`, so the whole write
commits or rolls back together. M2 is a different root cause (check-then-act
races, not partial-write rollback), fixed per its own instruction with DB
unique constraints + `.upsert(..., { onConflict })` — no RPC.

**Not yet applied to the live database.** All SQL lives in new migration
files only; review and run them yourself when ready (see PRE-FLIGHT note in
the M2 migration before running it — it can fail if duplicate rows already
exist on live data)._

---

## H3 — Invoice line-item edits could permanently delete all line items

**New migration:** `supabase/migrations/20260708090000_invoice_write_rpcs.sql`
(function `replace_invoice_lines`)

**New RPC:** `replace_invoice_lines(p_invoice_id uuid, p_lines jsonb) returns setof invoice_line_items`
— deletes the invoice's existing line items, inserts `p_lines`, and updates
`invoices.subtotal`, all in one transaction. `SECURITY INVOKER` (default —
no `SECURITY DEFINER`): the existing `invoice_line_items_delete/insert` and
`invoices_update` RLS policies already permit this for the calling
admin/super_admin, so nothing needed elevated privileges.

**Client change:** `src/lib/billingApi.ts:302-309` (`updateInvoiceLineItems`) —
now a single `supabase.rpc('replace_invoice_lines', ...)` call instead of
delete-then-insert-then-update. Same `{ error }` return shape, so its caller
needed no change.

**Call site:** `src/pages/InvoiceDetailPage.tsx:113` (`handleSave`) — unchanged;
already checks `lineItemsError` and toasts "Failed to update line items." on
failure. The "Save Changes" button (`InvoiceDetailPage.tsx:379`) was already
`disabled={saving}` for the whole save operation — no new disable-state code
needed.

---

## H4 — Orphaned draft invoices / wiped weekly roster on partial failure

### Invoicing half

**New migration:** `supabase/migrations/20260708090000_invoice_write_rpcs.sql`
(function `create_invoice_with_lines`, same file as H3's fix)

**New RPC:** `create_invoice_with_lines(p_center_id uuid, p_student_id uuid, p_term_label text, p_issue_date date, p_due_date date, p_discount numeric, p_notes text, p_line_items jsonb) returns invoices`
— inserts the invoice row, inserts its line items, and sets `subtotal`, all in
one transaction. `SECURITY INVOKER` — existing `invoices_insert`/`invoices_update`
and `invoice_line_items_insert` policies (the line-items policy's `EXISTS`
check against `invoices.center_id` sees the just-inserted invoice row within
the same transaction) already cover it.

**Client change:** `src/lib/billingApi.ts:266-281` (`createInvoice`) — now a
single `supabase.rpc('create_invoice_with_lines', ...)` call instead of
insert-invoice → insert-lines → update-subtotal. Same `{ data, error }` shape
(`data` is the invoice row, matching what `NewInvoicePage.tsx` already reads
`.invoice_no`/`.id` off of).

**Call site:** `src/pages/NewInvoicePage.tsx:162` (`handleSubmit`) — unchanged;
already checks `error || !data` and toasts "Failed to create invoice." The
"Create Invoice" button (`NewInvoicePage.tsx:367`) was already
`disabled={submitting}` — no new disable-state code needed.

### Roster half

**New migration:** `supabase/migrations/20260708090100_roster_write_rpcs.sql`
(function `apply_roster_week`)

**New RPC:** `apply_roster_week(p_week_start date, p_week_end date, p_rows jsonb) returns setof duty_assignments`
— deletes the week's `is_manual = false` rows and inserts the freshly computed
set, in one transaction. `SECURITY INVOKER` — the existing `duty_assignments`
admin(ALL) policy already permits this. The pool-ordering/slot-assignment
algorithm (`src/lib/rosterAlgorithm.ts`) is unchanged and still runs
client-side — only the final write moved server-side.

**Client change:** `src/lib/rosterApi.ts:190-204` (`generateWeek`) — the
trailing delete-then-insert is now a single `supabase.rpc('apply_roster_week', ...)`
call. Same `{ error }` shape.

**Call site:** `src/pages/RosterPage.tsx:96` (`handleGenerate`) — unchanged;
already checks `error` and toasts it. "Generate this week"
(`RosterPage.tsx:171`) was already `disabled={mismatched || generating}` — no
new disable-state code needed.

---

## M3 — Manual duty swap was two non-atomic updates

**New migration:** `supabase/migrations/20260708090100_roster_write_rpcs.sql`
(function `swap_duty_assignments`, same file as H4's roster fix)

**New RPC:** `swap_duty_assignments(p_work_date date, p_profile_a uuid, p_profile_b uuid) returns setof duty_assignments`
— note the signature takes the two profile IDs (and the date), **not**
duty-type IDs: the function `SELECT ... FOR UPDATE`s each person's row itself
to read their *current* `duty_type_id` before swapping, rather than trusting
values the client read earlier in the page's lifetime — this is what closes
the "stale client state" gap called out in the finding. The `FOR UPDATE` row
locks also serialize two overlapping swap requests touching the same rows,
instead of letting them race. `SECURITY INVOKER` — same admin(ALL) policy as
`apply_roster_week` covers both UPDATEs.

**Client change:** `src/lib/rosterApi.ts:222-234` (`swapDutyAssignments`) —
signature simplified from `(workDate, dutyTypeIdA, profileIdA, dutyTypeIdB, profileIdB)`
to `(workDate, profileIdA, profileIdB)`, since the server now sources the
duty-type IDs itself. Now a single `supabase.rpc('swap_duty_assignments', ...)`
call instead of two sequential `.update()`s.

**Call site:** `src/pages/RosterPage.tsx:107-122` (`handleSwap`) — updated to
match the new 3-arg signature (no longer passes `otherRow.duty_type_id`);
still guards `currentProfileId === newProfileId` and `swappingKey` before
calling, and still checks `error` and toasts "Could not update the roster."
The swap `<select>` (`RosterPage.tsx:233`) was already
`disabled={swappingKey === key}` per-cell — no new disable-state code needed.

---

## M2 — Check-then-insert races (payslips, YTD opening balances, staff documents)

No RPCs — per the task, this is a different root cause (a race between two
independent requests, not a rollback problem), fixed with real DB constraints
and idempotent upserts.

**New migration:** `supabase/migrations/20260708090200_m2_unique_constraints.sql`

**Unique constraints added:**

| Table | Constraint name | Columns | Notes |
|---|---|---|---|
| `payslips` | `payslips_employee_year_month_key` | `(employee_id, year, month)` | One payslip per employee per period |
| `payroll_ytd_opening` | `payroll_ytd_opening_employee_year_key` | `(employee_id, year)` | One opening balance per employee per year |
| `staff_documents` | `staff_documents_owner_doctype_period_key` | `(owner_id, doc_type, year, month)` | Full-table constraint, not partial — SQL's NULL-is-distinct-from-NULL semantics mean it only ever actually constrains `doc_type = 'payslip'` rows (where `month` is always non-null); `doc_type = 'ea'` rows (`month` always `NULL`) are untouched, preserving the existing "multiple EA re-uploads per year" behavior of the manual upload path. A full constraint (rather than an equivalent partial index) was used specifically because `supabase-js`'s `.upsert(..., { onConflict })` can't express a partial index's `WHERE` predicate. |

Also added: a `payslips_preserve_created_by` `BEFORE UPDATE` trigger
(`SECURITY DEFINER`, matching this schema's existing guard-trigger style —
see "SECURITY DEFINER usage" below) that re-pins `created_by` to its original
value on every update. This isn't part of the race fix itself — it's a
supporting guard needed because a plain `.upsert()` now sends `created_by` on
every save (insert *and* update), where the old code specifically stripped it
on updates so a later resave by a different admin never reattributed the
payslip.

**Client changes:**
- `src/lib/payrollApi.ts:230-236` (`upsertYtdOpening`) — was select-by-natural-key
  then insert-or-update-by-id; now `.upsert(patch, { onConflict: 'employee_id,year' })`.
- `src/lib/payrollApi.ts:245-251` (`upsertPayslip`) — same shape, now
  `.upsert(patch, { onConflict: 'employee_id,year,month' })`.
- `src/lib/staffDocsApi.ts:126-160` (`uploadPayslipDocument`) — dropped the
  select-then-branch entirely; now `.upsert(patch, { onConflict: 'owner_id,doc_type,year,month' })`
  straight after the storage upload succeeds.

**Call sites (all unchanged, already surface `{ error }` and already
disable their trigger button while in-flight):**
- `src/pages/OpeningBalancePage.tsx:118-141` (`handleSave`) — Save button
  `disabled={row.saving}` (line 227).
- `src/pages/PayrollPage.tsx:633-657` (`saveRow`/`handleSaveRowClick`) — Save/
  Finalize buttons `disabled={busy}` where `busy = row.saving || row.finalizing || row.reopening`
  (lines 332, 420, 428).
- `src/lib/payslipRegen.ts:75` and `src/pages/PayrollPage.tsx:683`
  (`generateAndUploadPayslipPdf`) — only reachable from `confirmFinalize`/
  `confirmBulkFinalize`/`confirmRegenerate`, all gated behind their own
  `finalizing`/`bulkFinalizing`/`regenerating` disabled buttons.

**Pre-flight requirement:** the migration file includes diagnostic queries to
run first — if the race already produced duplicate rows on the live DB
before this fix, the `ADD CONSTRAINT` statements will fail with a
`unique_violation` until those duplicates are resolved.

---

## SECURITY DEFINER usage — flagged as requested

Of the four RPCs (`replace_invoice_lines`, `create_invoice_with_lines`,
`apply_roster_week`, `swap_duty_assignments`), **none use `SECURITY DEFINER`**.
All run as the calling role (Postgres's default), and RLS is enforced
normally on every statement inside them — verified against each table's
existing policies (`invoices`/`invoice_line_items` in
`20260703010000_phase3_billing_rls.sql`; `duty_assignments` admin(ALL) in
`20260702120000_rls_phase1b.sql`) as documented per-function above.

One `SECURITY DEFINER` **was** added, but it is not one of the four RPCs: the
`payslips_preserve_created_by` trigger (M2's supporting guard, above). It
doesn't need elevated privileges to do its job (copying `old.created_by` to
`new.created_by` requires no extra access beyond what the triggering UPDATE
already has), but it's marked `SECURITY DEFINER` to match this schema's
existing house style for trigger functions (`profiles_guard`,
`claims_approval_guard`, `leave_approval_guard`, `board_items_guard`,
`invoices_set_invoice_no` are all `SECURITY DEFINER`) — not because this
finding strictly required it.

---

## Verification performed

- `npx tsc --noEmit -p tsconfig.app.json` — clean, no errors.
- `npm run lint` — no new warnings; the only output is the pre-existing
  `exhaustive-deps`/`only-export-components` warnings this repo already
  tolerates (see `CLAUDE.md`).
- Confirmed via `grep` that every remaining call site of the four rewritten
  `lib/` functions plus the three M2 functions already destructures and
  surfaces `{ error }` (toast or inline `ErrorState`) — no call site needed a
  new error branch added.
- Confirmed via `grep` that every trigger button for these seven mutations
  was already wired to a `disabled={...saving/submitting/generating/finalizing/swappingKey...}`
  flag before this change — none needed new disable-state code.
- Did **not** run any migration against Supabase and did **not** touch
  `profiles_guard`, `is_app_owner()`, or David's `is_app_owner` row.

## Not in this batch

M1 (raw `error.message` surfaced to users) and H1/H2 (profile-fetch
misreporting, no request timeout) are unrelated root causes and were left
untouched, as scoped.
