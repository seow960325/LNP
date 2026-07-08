# Center Ops — Phase 2 Audit: Adversarial Resilience / Unhappy-Path Review
_2026-07-08. Scope: every `src/` page, `lib/` helper, and Edge Function. Focus: what
happens when things go WRONG (error handling, backend-down behavior, stack-trace
leakage, timezone edges, duplicate-submit, invalid input) — not security surface
(covered in Phase 1, see `supabase_security_audit_playbook.md` and
`supabase/snapshots/live_schema_snapshot_20260706.md`)._

Severity scale and finding-ID convention match Phase 1 (Critical/High/Medium/Low,
letter+number). Numbering restarts for this document.

## Summary

| ID | Sev | Area | One-line |
|---|---|---|---|
| H1 | High | Auth | Any transient profile-fetch error is shown to the user as "Account not set up — contact your administrator," not a connection error |
| H2 | High | App-wide | No request timeout anywhere — a hung/unreachable backend leaves every loading/saving state stuck forever |
| H3 | High | Invoicing | Editing an invoice's line items can permanently delete all of them with no rollback if the re-insert fails |
| H4 | High | Invoicing / Roster | Non-transactional multi-step writes leave orphaned draft invoices or a wiped weekly roster on partial failure |
| M1 | Medium | App-wide | Raw Postgres/Auth `error.message` strings are surfaced directly to toasts and Edge Function JSON responses |
| M2 | Medium | Payroll / Staff docs | Check-then-insert(-or-update) pattern races on double-click / concurrent save, risking duplicate payslip/opening-balance/document rows |
| M3 | Medium | Roster | Manual duty swap is two non-atomic updates — a mid-swap failure can duplicate or drop an assignment |
| M4 | Medium | Invoicing | New-invoice due-date/term-label default logic re-parses dates through the browser's local timezone instead of the app's KL-safe helper |
| L1 | Low | Entrance | Body-temperature input has no plausible-range check, only a NaN check |
| L2 | Low | Attendance / Students | Photo uploads have no client-side size/type pre-check (unlike avatar/staff-doc uploads) |
| L3 | Low | Staff documents | Year/month fields on the upload form have no bounds, so a cleared field silently stores year `0` |
| L4 | Low | App-wide | A few non-critical reads swallow errors and fall back silently, hiding real outages behind "no data yet" |
| L5 | Low | Payroll | Staff full names logged to the browser console on payslip-regeneration failures |
| L6 | Low | Leave | A few "current year" defaults read the browser's local clock instead of the app's Asia/Kuala_Lumpur helper |

---

## H1 — Profile-fetch errors are misreported as "account not set up"

**File:** `src/contexts/AuthContext.tsx:24-52` (`fetchProfile`), rendered via `src/components/RequireAuth.tsx:19` → `src/pages/AccountNotSetupPage.tsx`

**What breaks:** `fetchProfile` runs on every login and every auth-state change. Its
`error` branch (line 31-36) and its "no row" branch (line 38-42) are collapsed into
the exact same `profileState = 'not_found'` outcome:

```
if (error) {
  // Treat fetch errors as not_found — don't crash or loop
  setProfile(null)
  setProfileState('not_found')
  return
}
```

`RequireAuth` then renders `AccountNotSetupPage`, which tells the user: *"Your login
was recognised but your account hasn't been configured. Contact your administrator
to complete the setup,"* with only a "Sign out" button — no retry.

**Repro/trigger:** Any transient failure of the `profiles` SELECT — a network blip,
a brief Supabase outage, a slow connection that times out at the HTTP layer — hits
this exact branch for a perfectly valid, active staff member. They are told their
account doesn't exist and to contact an admin, generating false support tickets and
confusion (and the admin has nothing to actually fix).

**Suggested fix:** Split the two cases. Keep `not_found` for `!data` (a real "no
profile row" case). Add a distinct `profileState = 'error'` for the `error` branch,
rendered by `RequireAuth` as a retry-able connection-error screen (e.g. "Couldn't
load your account — Retry" button that re-calls `fetchProfile`), not the
administrator-contact message.

---

## H2 — No request timeout anywhere; a hung backend produces an infinite spinner

**Files:** `src/lib/supabaseClient.ts:1-6` (no `fetch` timeout / global options); confirmed
systemic — `grep -rn "AbortController\|signal:\|timeout" src` returns zero hits across
the whole app.

**What breaks:** Every page's `loadState` gate (`loading` → `ready`/`error`) and every
mutate handler's `saving`/`submitting` flag depend on a Supabase promise eventually
settling. Since no call anywhere sets a timeout or uses `AbortController`, a stalled
connection (Wi-Fi drop mid-request, backend outage that accepts-but-never-responds,
a slow mobile network at the center) leaves the UI showing "Loading…" or "Saving…"/
"Submitting…" indefinitely, with every button correctly disabled per the app's
duplicate-submit guards — but now permanently, since nothing ever re-enables them.
The only recovery is a manual page reload, which is not communicated anywhere in the
UI (no "taking a while? reload" message).

**Repro/trigger:** Throttle/drop the network mid-request (e.g. dev tools "offline"
after a request is in flight, or a real spotty connection at the physical center) on
any page load or any Save/Submit/Finalize button.

**Suggested fix:** Add a shared timeout (e.g. wrap the Supabase client's `fetch` with
an `AbortController`-backed timeout of ~15-20s, or add a `Promise.race` helper used by
the common load/save call sites) that surfaces a "Request timed out — please try
again" error state instead of hanging forever.

---

## H3 — Invoice line-item edits can permanently delete all line items

**File:** `src/lib/billingApi.ts:314-333` (`updateInvoiceLineItems`), invoked from
`src/pages/InvoiceDetailPage.tsx:113` (`handleSave`)

**What breaks:** `updateInvoiceLineItems` is not transactional:

```
delete .eq('invoice_id', invoiceId)   // (1) removes ALL existing line items
...
insert(lineItemsToInsert)             // (2) re-inserts the edited set
...
update({ subtotal })                  // (3) only runs if (2) succeeded
```

If step (1) succeeds and step (2) fails (network drop, a bad row triggering a DB
constraint, backend hiccup), the invoice is left with **zero line items** and its
old `subtotal` unchanged (since step 3 never runs) — a financially-live invoice now
shows a subtotal/total that don't match its (now-empty) line items, with no way to
recover the deleted rows. The user only sees a "Failed to update line items" toast
and has to manually re-enter every line item from memory.

**Repro/trigger:** Edit an existing invoice's line items and have the re-insert fail
partway (e.g. simulate by dropping the connection between the delete and insert
calls, or trigger a constraint violation on one of the new rows).

**Suggested fix:** Wrap delete+insert+subtotal-update in a single Postgres function
(`SECURITY DEFINER`, called via `.rpc()`) so it's atomic, or at minimum insert the
new rows first and only delete the old ones after the insert succeeds (delete-last
ordering removes the "worse than before" failure mode even without a true
transaction).

---

## H4 — Non-transactional writes elsewhere: orphaned invoices, wiped rosters

**Files:** `src/lib/billingApi.ts:260-298` (`createInvoice`); `src/lib/rosterApi.ts:138-205`
(`generateWeek`, invoked from `src/pages/RosterPage.tsx:96`)

**What breaks:**
- `createInvoice` inserts the `invoices` row first, then the `invoice_line_items`,
  then updates `subtotal`. If the line-items insert fails (line 280) after the
  invoice insert succeeded (line 263-271), the function returns an error — but the
  invoice row it already created is never cleaned up. It's left behind as an
  invisible-in-practice `draft` invoice with `subtotal: 0` and no line items,
  discoverable only by manually scanning the Invoices list.
- `generateWeek` deletes the week's existing auto-generated (`is_manual=false`)
  assignments (line 190-197) and then inserts the freshly computed set (line
  199-202). If the insert fails after the delete succeeds, the entire week's
  non-manual roster is now empty — every affected staff member has no duty shown
  for that week until an admin notices and retries "Generate this week."

**Repro/trigger:** Force the second write in either sequence to fail (network drop
between the two calls, or a constraint violation on the second insert).

**Suggested fix:** Same as H3 — move each multi-step write into a single
`SECURITY DEFINER` Postgres function so both steps commit or roll back together, or
reorder to insert-before-delete/insert-before-first-write so a partial failure never
leaves things worse than before it started.

---

## M1 — Raw database/auth error messages surfaced directly to users

**Files (representative, not exhaustive):**
`src/pages/ClaimsPage.tsx:217,253,440,464,500`; `src/pages/LeavePage.tsx:268,305,499,523`;
`src/pages/KudosWallPage.tsx:161`; `src/pages/LeaveBalancesPage.tsx:101`;
`src/pages/BoardPage.tsx:392`; `src/pages/PayrollPage.tsx:693,746`;
`src/components/StaffDocPanel.tsx:201,217`; `src/pages/ForceChangePasswordPage.tsx:41`;
`supabase/functions/admin-create-staff/index.ts:86,104,109`;
`supabase/functions/admin-reset-password/index.ts:123,133,142`

**What breaks:** The pattern `toast.error(error.message || 'fallback')` (and the
Edge Functions' `json(req, { error: \`Failed to X: ${err.message}\` })`) puts the raw
Postgres/PostgREST/Supabase-Auth error string directly in front of the user whenever
the friendly fallback isn't reached — i.e. exactly when `error.message` is truthy.
These messages can include table/column names, constraint names, or RLS-policy
hints (e.g. `new row violates row-level security policy for table "claims"`,
`duplicate key value violates unique constraint "payslips_employee_id_year_month_key"`).
This is app-internal-staff-only exposure (not anonymous/public), so it's Medium
rather than High, but it's a real internal-schema leak on essentially every
mutation path in the app, and in the Edge Function case reaches a JSON response
that any admin's browser dev tools can inspect verbatim.

**Repro/trigger:** Trigger any DB-level constraint/RLS failure on a mutating call
(e.g. two admins editing the same row into a state a guard trigger rejects) and
read the toast/response text.

**Suggested fix:** Never interpolate `error.message` into user-facing text. Log it
(server-side or to an error-tracking tool) and always show a fixed friendly string;
reserve `error.message` for developer-facing debugging only.

---

## M2 — Check-then-insert races on payslips / YTD opening balances / staff documents

**Files:** `src/lib/payrollApi.ts:224-245` (`upsertYtdOpening`), `:250-274`
(`upsertPayslip`); `src/lib/staffDocsApi.ts:118-164` (`uploadPayslipDocument`)

**What breaks:** All three follow the same shape: SELECT for an existing row by
natural key (`employee_id`+`year`[+`month`]), then INSERT if none was found,
otherwise UPDATE. This is a classic TOCTOU race — two concurrent calls (a
double-click on "Save"/"Finalize", or two admins working the same payroll period at
once) can both pass the "no existing row" check before either INSERT lands,
producing two payslip rows (or two opening-balance rows, or two staff_documents
rows) for what should be a single period. Contrast with `leave_balances` and
`student_attendance`, which use a real `.upsert(..., { onConflict: ... })` backed by
a DB unique constraint — the safer pattern already used elsewhere in this codebase.
The live schema snapshot doesn't capture `payslips`/`payroll_ytd_opening`
constraints (they're drift tables, never in `supabase/migrations/`), so it's not
confirmed whether a unique constraint exists to at least turn the race into a clean
23505 error instead of a silent duplicate — this should be verified directly against
the live DB.

**Repro/trigger:** Fire two `upsertPayslip` calls for the same employee/year/month
in quick succession (e.g. double-click "Save" fast enough that the first request's
existence check hasn't returned before the second one starts).

**Suggested fix:** Add (or confirm) a unique constraint on `(employee_id, year,
month)` / `(employee_id, year)` and switch these three functions to `.upsert(...,
{ onConflict: '...' })`, matching the pattern already used for `leave_balances`.

---

## M3 — Manual duty-roster swap is two non-atomic updates

**File:** `src/lib/rosterApi.ts:212-236` (`swapDutyAssignments`), invoked from
`src/pages/RosterPage.tsx:114` (`handleSwap`)

**What breaks:** A manual swap does `UPDATE ... WHERE profile_id = A` then, only if
that succeeds, `UPDATE ... WHERE profile_id = B`. If the second update fails (network
drop between the two calls), person A now has B's old duty type while B still has
their original one — two people are now assigned the same duty (or, depending on
which failed, a duty type slot silently loses its person). The UI shows a generic
"Could not update the roster. Please try again" toast with no indication that A's
half of the swap already went through.

**Repro/trigger:** Drop the connection between the two sequential updates inside
`swapDutyAssignments` (e.g. via a network throttle that fails the second request
only).

**Suggested fix:** Combine both updates into a single `.rpc()` call to a
`SECURITY DEFINER` Postgres function that does both writes in one transaction, so a
failure never leaves a half-completed swap.

---

## M4 — New-invoice date defaults use local-timezone parsing instead of the KL-safe helper

**File:** `src/pages/NewInvoicePage.tsx:13-28` (`addDays`, `getTermLabel`)

**What breaks:** Every other date-only computation in this codebase goes through
`toKLDateISO`/`shiftDateISO` (`src/lib/helpers.ts`), which are deliberately
timezone-pure (no `Date` object ever crosses the Asia/Kuala_Lumpur boundary). This
file instead reinvents date math locally:

```js
function addDays(dateStr, days) {
  const date = new Date(dateStr + 'T00:00:00')   // parsed in the BROWSER's local TZ
  date.setDate(date.getDate() + days)
  return toKLDateISO(date)
}
```

Because `dateStr` is already a KL-correct `YYYY-MM-DD` string, appending
`T00:00:00` and letting the JS engine interpret it in the browser's OS timezone
(not necessarily `Asia/Kuala_Lumpur`) can silently roll the date to the previous or
next day before `addDays`/`getTermLabel` ever run their month/day logic — shifting
the default due date (issue date + 7) or the auto-computed term label ("Term 1
2026" vs "Term 2 2026" at a term boundary) by a day, if the device creating the
invoice isn't set to Malaysia time (e.g. a traveling admin, or a misconfigured
device clock).

**Repro/trigger:** Set the browser/OS timezone to something behind UTC (e.g.
`America/Los_Angeles`) and create a new invoice around midnight KL time, or right
at a term-quarter boundary date.

**Suggested fix:** Reuse the existing `shiftDateISO` helper (pure string/UTC-date
arithmetic, already used everywhere else) for `addDays`, and derive `getTermLabel`'s
month/year by slicing the `YYYY-MM-DD` string directly instead of round-tripping
through a local `Date`.

---

## L1 — Body-temperature input has no plausible-range check

**File:** `src/pages/EntrancePage.tsx:377-379` (`ArrivalForm`)

```js
const tempValue = Number(temp)
const isTempValid = temp.trim() !== '' && !Number.isNaN(tempValue)
```

Only NaN is rejected — a mistyped `-10`, `3.65` (missing the decimal point,
i.e. 365°C), or `100` is accepted and saved to a child's daily attendance/care
record as-is, and only the ≥37.5°C fever flag is affected (silently not
triggering, or triggering on nonsense). No crash, but a garbage medical data point.
**Fix:** clamp to a plausible human range (e.g. 30–43°C) client-side before allowing
"Check in."

## L2 — No client-side pre-check on student/attendance photo uploads

**Files:** `src/lib/billingApi.ts:43-54` (`uploadStudentPhoto`); `src/lib/attendanceApi.ts:245-257`
(`uploadAttendancePhoto`)

Unlike avatar uploads (`validateAvatarFile`, `src/lib/profileApi.ts:6-14`) and staff
document uploads (`validateStaffDocFile`, `src/lib/staffDocsApi.ts:20-28`), these two
upload paths have no equivalent pre-flight check — an oversized or wrong-type file
is only rejected after a full upload attempt hits the Storage bucket's server-side
5MB/MIME-allowlist policy (per `live_schema_snapshot_20260706.md`). The failure
itself is handled gracefully (a toast is shown, no crash), so this is a
bandwidth/UX cost on a slow connection rather than a correctness bug.
**Fix:** reuse/extend `validateAvatarFile`-style checks before calling `.upload(...)`.

## L3 — Staff-document upload form's year/month fields have no bounds

**File:** `src/components/StaffDocPanel.tsx:39-94` (`UploadForm`)

`year` is a free-typed `<input type="number">` seeded from `new Date().getFullYear()`
with no `min`/`max`, and its `onChange` does `Number(event.target.value)` — clearing
the field sends `Number('') === 0`, which is stored as the document's `year` with no
validation error shown. Cosmetic/low-impact (staff-only internal document metadata),
but worth a `min`/`max` and a "required, valid year" check like the rest of the app's
numeric inputs (see `ClaimsPage.tsx`'s `validateClaimForm`).

## L4 — A few non-critical reads swallow errors and fall back silently

**Files:** `src/lib/tileLayoutApi.ts:12-22` (`fetchTileOrder` returns `[]` on error);
`src/lib/billingApi.ts:60-66` (`getStudentPhotoSignedUrl` returns `null` on error);
`src/lib/attendanceApi.ts:263-269` (`getAttendancePhotoSignedUrl`, same pattern)

These are documented, deliberate choices for genuinely non-critical, cosmetic data
(custom tile ordering, a photo thumbnail) — not a functional bug — but the tradeoff
is that a real, ongoing Storage/DB outage looks identical to "nothing saved yet" or
"no photo," with nothing in the UI to tell staff the difference. Worth a mental note
if outages become a recurring support complaint, not an urgent fix.

## L5 — Staff names logged to console on payslip-regeneration failures

**File:** `src/pages/PayrollPage.tsx:811`

```js
console.error('Payslip regeneration failures:', errors)
```

`errors` (built in `src/lib/payslipRegen.ts:87,94`) includes each failed employee's
`full_name` alongside the failure reason. Full names aren't in the audit's
top-tier PII bucket (phone/email/child data), but per the working agreement's
"never console.log sensitive data" spirit, this is avoidable — surface the same
detail in the toast/UI instead of (or in addition to) the console.

## L6 — A few "current year" defaults use the browser's local clock, not the KL helper

**Files:** `src/pages/LeavePage.tsx:45`; `src/pages/LeaveBalancesPage.tsx:21`;
`src/components/StaffDocPanel.tsx:39`

```js
const currentYear = new Date().getFullYear()
```

Everywhere else in the app, "today"/"current period" goes through
`toKLDateISO(new Date())` (Asia/Kuala_Lumpur-pinned). These three read the raw
JS `Date` in whatever timezone the browser/device is configured for. Low impact in
practice (a device physically in Malaysia is normally already set to KL time, and
the failure window is only the local hours around midnight UTC / New Year), but
inconsistent with the rest of the codebase's deliberate KL-safe pattern.

---

## What was clean (verified, not assumed)

- Nearly every list/detail page uses the same disciplined `loading → ready → error`
  gate (`AsyncState.tsx`'s `LoadingState`/`ErrorState`/`EmptyState`) and every
  mutate button we found is disabled behind its own `saving`/`submitting`/`*ingId`
  flag — no double-submit path was found on any Create/Save/Approve/Reject/Delete
  button across Claims, Leave, Board, Terms, Classes, Packages, Invoices, or Payroll.
- Numeric money/amount inputs (claims, packages, invoices, line items) consistently
  parse with `parseFloat`, guard `NaN`/`<=0`, and pair a `min="0"` HTML constraint
  with an explicit JS validator (`validateClaimForm`, `PackagesPage.handleSubmit`).
- Destructive/irreversible flows (`approveAndPurge` in `termDeletionApi.ts`,
  `deleteStaffDocument` in `staffDocsApi.ts`) check each step's error individually
  and return a specific, accurate message for exactly which step failed, rather
  than a generic catch-all — including correctly reporting partial completion
  (e.g. "Attendance was deleted but board items could not be. Please retry.").
  `uploadStaffDocument`/`uploadPayslipDocument` also do best-effort storage cleanup
  if the follow-up DB insert fails, avoiding orphaned files.
- `LoginPage.tsx` and `ForceChangePasswordPage.tsx` sanitize Supabase Auth error
  messages through a `friendlyError()`/validation layer before display (values like
  "wrong email or password" rather than the raw Auth SDK string) — with the one
  exception noted in M1 (`ForceChangePasswordPage.tsx:41`'s `updateError.message`).
  Password reset never logs the plaintext temp password to the console anywhere.
  `AuthCallbackPage.tsx` and Edge Function authorization matrices
  (`admin-create-staff`, `admin-reset-password`) were re-checked here for
  resilience and hold up: every auth/authz branch returns a specific, correctly
  reasoned error rather than falling through.
