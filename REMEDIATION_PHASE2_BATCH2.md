# Phase 2 Remediation — Batch 2 (H1, H2)

_2026-07-08. Client-side only — no Supabase/migration changes in this batch._
`supabase_security_audit_playbook.md` was not found anywhere in the repo
(working tree, git history, `docs/`, `supabase/`); per instruction, proceeded
using `AUDIT_PHASE2.md` and `REMEDIATION_PHASE2_BATCH1.md`'s established
conventions only.

---

## Shared helpers (built first, used by both H1 and H2)

**`src/lib/withTimeout.ts`**
```ts
export class TimeoutError extends Error { ... }
export function withTimeout<T>(promise: PromiseLike<T>, ms: number = 15000): Promise<T>
```
Races any thenable (including Supabase's `PromiseLike` query builders) against
a timer; rejects with `TimeoutError` if the promise hasn't settled in `ms`
(default 15000). Used by wrapping any Supabase call: `await withTimeout(someQuery())`.

**`src/lib/errorMessages.ts`**
```ts
export function getUserErrorMessage(error: unknown): string
```
Always `console.error`s the raw error first, then returns exactly one of
three fixed, safe strings — never interpolates `error.message`/stack:
- `TimeoutError` → "This is taking too long — the server may be unreachable. Try again."
- Network failure (offline, bare `TypeError` from a failed `fetch`, or a
  message containing "fetch"/"network") → "Couldn't reach the server. Check
  your connection and try again."
- Anything else → "Something went wrong. Please try again."

This is the mapper H1 uses for the connection-error screen and H2 uses for
every wrapped call site's catch branch. It's also what M1 (next batch) will
retrofit onto the remaining raw-`error.message` toasts.

---

## H1 — Profile-fetch errors no longer misreported as "account not set up"

**`src/contexts/AuthContext.tsx`** (`fetchProfile`, ~lines 24-62):
- Added `'error'` to the `ProfileState` union and a new `profileErrorMessage: string | null` field on the context.
- The Supabase query is now `await withTimeout(supabase.from('profiles').select('*').eq('id', uid).maybeSingle())` inside a `try/catch`.
- Branch logic, per the audit's instruction to key off `{ error }`/thrown-timeout rather than falsy `data`:
  - `{ error }` returned (real query/connection failure) → `setProfileErrorMessage(getUserErrorMessage(error))`, `setProfileState('error')`. **No longer falls into `not_found`.**
  - `!data` (clean, successful query, zero rows) → unchanged: `setProfileState('not_found')` — this is the only path that still shows the "contact your administrator" message.
  - `catch` (thrown `TimeoutError`, or any other thrown failure) → same treatment as the `{ error }` branch above.

**New file: `src/pages/ConnectionErrorPage.tsx`** — sibling to the existing
`AccountNotSetupPage`/`AccountDeactivatedPage` (same visual pattern: centered
card, icon, message, primary action). Shows `profileErrorMessage` (falls back
to the connection-message text if somehow null) with a **Retry** button
(calls `refreshProfile()`, which re-runs `fetchProfile` for the same user —
already exposed on the auth context, no new plumbing needed) and a **Sign
out** button matching the other two account-gate screens.

**`src/components/RequireAuth.tsx`**: added
`if (profileState === 'error') return <ConnectionErrorPage />` alongside the
existing `not_found`/`deactivated` branches.

---

## H2 — Every gating load/save call now has a 15s timeout

### Every page's initial `loadState` fetch (23 files)

Each entry: the fetch(es) gating that page's `loading → ready/error` state,
now wrapped in `withTimeout(...)`, with a `.catch()`/`try-catch` branch added
that calls `setLoadState('error')` + `setLoadError(getUserErrorMessage(err))`
(never leaves the loading flag stuck true).

| File | Line(s) | Fetch(es) wrapped |
|---|---|---|
| `src/pages/ClaimCategoriesPage.tsx` | 38 | `fetchClaimCategories()` |
| `src/pages/TermsPage.tsx` | 59 | `Promise.all([fetchTerms, fetchPendingRequests])` |
| `src/pages/LeavePage.tsx` | 217 | `Promise.all([fetchMyLeaveRequests, fetchMyLeaveBalances])` (employee view) |
| `src/pages/LeavePage.tsx` | 484 | `fetchAllLeaveRequests(...)` (admin view) |
| `src/pages/InvoicesPage.tsx` | 41 | `fetchInvoices(...)` |
| `src/pages/ClassesPage.tsx` | 32 | `fetchClasses()` |
| `src/pages/RosterSettingsPage.tsx` | 42 | `Promise.all([fetchDutyTypes, fetchRotationPool])` |
| `src/pages/OpeningBalancePage.tsx` | 81 | `Promise.all([fetchActiveStaff, fetchYtdOpening])` (inside `load()`, now wrapped in try/catch since it was called fire-and-forget) |
| `src/pages/InvoiceDetailPage.tsx` | 53 | `fetchInvoice(id)` |
| `src/pages/StaffDirectoryPage.tsx` | 40 | `fetchStaffDirectory(...)` |
| `src/pages/ClaimsPage.tsx` | 177 | `Promise.all([fetchMyClaims, fetchActiveClaimCategories])` (employee view) |
| `src/pages/ClaimsPage.tsx` | 428 | `fetchAllClaims(...)` (admin view) |
| `src/pages/AttendanceConditionsPage.tsx` | 32 | `fetchConditions()` |
| `src/pages/WifiPage.tsx` | 47 | `getWifi(...)` |
| `src/components/StaffDocPanel.tsx` | 164 | `fetchStaffDocuments(ownerId)` |
| `src/pages/PackagesPage.tsx` | 38 | `Promise.all([fetchFeePackages, fetchStudents])` |
| `src/pages/StudentsPage.tsx` | 78 | `Promise.all([fetchStudents, fetchActiveFeePackages, fetchActiveClasses])` |
| `src/pages/EntrancePage.tsx` | 74 | `Promise.all([fetchActiveClasses, fetchActiveConditions, fetchTodayAttendance])` |
| `src/pages/EntrancePage.tsx` | 107 | `fetchStudentsByClass(...)` (per-class student grid) |
| `src/pages/RosterPage.tsx` | 48 | `Promise.all([fetchActiveDutyTypes, fetchRotationPool, fetchWeekAssignments])` |
| `src/pages/StaffMemberDetailPage.tsx` | 267 | `fetchProfileById(id)` |
| `src/pages/LeaveBalancesPage.tsx` | 47 | `Promise.all([fetchCenterMembers, fetchAllLeaveBalances, fetchAllLeaveRequests])` |
| `src/pages/NewInvoicePage.tsx` | 56 | `Promise.all([fetchStudents, fetchFeePackages])` |
| `src/pages/PayrollPage.tsx` | 536, 563 | `Promise.all([fetchPayrollSettings, fetchPayrollStaff, fetchPayslips])`, then `Promise.all(staff.map(fetchYtd))` (inside `load()`, now wrapped in try/catch since it was called fire-and-forget) |
| `src/pages/BoardPage.tsx` | 264, 278 | `fetchBoardItems(...)`, then `fetchProfilesByIds(...)` (author/assignee name lookup, same `load()`) |
| `src/pages/BoardPage.tsx` | 299 | `fetchCenterMembers(...)` (assignee dropdown, only fetched while the create/edit form is open) |
| `src/pages/KudosWallPage.tsx` | 62, 80 | `fetchKudosFeed(...)`, then `Promise.all([fetchProfilesByIds, fetchKudosValuesByIds])` (same `loadFeed()`) |
| `src/contexts/AuthContext.tsx` | 31 | `profiles` select (see H1 above — this is "auth/profile bootstrap") |

**Explicitly left un-wrapped as background/non-critical reads** (per the
instruction to skip these): `HomePage.tsx`'s `fetchOpenTodayCount` (doc
comment: "non-critical — fail silently to a bare bell"); `KudosWallPage.tsx`'s
`fetchKudosReceivedBy` (monthly total) and `fetchTopRecipient` ("Non-critical
badge — fail quietly"); `StudentsPage.tsx`/`EntrancePage.tsx`'s signed-URL
photo-thumbnail effects (pre-existing L4-flagged swallow-errors pattern).

### The 8 named mutate handlers

| Handler | File:line | What's wrapped | Failure handling |
|---|---|---|---|
| Invoice create | `src/pages/NewInvoicePage.tsx:167` (`handleSubmit`) | `createInvoice(...)` | `try/catch` around the existing body; catch resets `submitting` + toasts `getUserErrorMessage(err)` |
| Invoice edit | `src/pages/InvoiceDetailPage.tsx:115,122` (`handleSave`) | `updateInvoice(...)`, `updateInvoiceLineItems(...)` | same pattern; catch resets `saving` |
| Roster generate | `src/pages/RosterPage.tsx:107` (`handleGenerate`) | `generateWeek(...)` | catch resets `generating` |
| Duty swap | `src/pages/RosterPage.tsx:130` (`handleSwap`) | `swapDutyAssignments(...)` | catch resets `swappingKey` |
| Payslip finalize/regen | `src/pages/PayrollPage.tsx:649` (`saveRow`) | `upsertPayslip(...)` | catch resets `saving` on the row, returns `null` (existing toast-free contract — callers already show a generic failure toast on `null`) |
| Payslip finalize/regen | `src/pages/PayrollPage.tsx:751` (`confirmFinalize`) | `finalizePayslip(...)` | catch resets `finalizing`, closes the confirm dialog, toasts `getUserErrorMessage(err)` |
| Payslip finalize/regen | `src/pages/PayrollPage.tsx:798` (`confirmBulkFinalize`, per-row in the sequential loop) | `finalizePayslip(...)` | catch resets that row's `finalizing` and `continue`s to the next row (matches the existing per-row failure handling) |
| Payslip finalize/regen | `src/pages/PayrollPage.tsx:840` (`confirmRegenerate`) | `regenerateYearPayslips(...)` | **uses a 120s timeout, not the 15s default** — this fans out across every staff member's payslips for the whole year, so it legitimately runs longer than a single request; catch resets `regenerating`, closes the dialog, toasts the mapped message |
| Claim submit | `src/pages/ClaimsPage.tsx:217` (`handleCreate`) | `createClaim(...)` | catch resets `createSaving` |
| Leave submit | `src/pages/LeavePage.tsx:265` (`handleCreate`) | `createLeaveRequest(...)` | catch resets `createSaving` |
| Student add | `src/pages/StudentsPage.tsx:156,165` (`handleSubmit`) | `updateStudent(...)` / `createStudent(...)` | added a `catch` to the existing `try/finally` (flag was already safe via `finally`, but no error was surfaced before) |
| Check-in | `src/pages/EntrancePage.tsx:402,412,422,430` (`ArrivalForm.handleSave`) | 3 photo uploads + `upsertArrival(...)` | added a `catch` to the existing `try/finally` |

**Also wrapped beyond the named 8**, since they're the same "gates a saving
spinner" shape and were one edit away while touching these files:
- `src/pages/ClaimsPage.tsx:265` (`handleEditSave`) — `updateClaim(...)`
- `src/pages/LeavePage.tsx:315` (`handleEditSave`) — `updateLeaveRequest(...)`
- `src/pages/EntrancePage.tsx:669,677` (`DepartureForm.handleSave`, i.e. check-out — the direct symmetric counterpart of check-in in the same file) — pickup photo upload + `upsertDeparture(...)`

**Not wrapped (approve/reject actions on Leave/Claims):** `LeavePage.tsx`'s
`handleApprove`/`handleRejectConfirm` and `ClaimsPage.tsx`'s equivalents were
left untouched — they weren't in the named list and are a distinct
admin-review action, not one of the 8 specified flows. Flagging here rather
than silently skipping, in case you want them included in a follow-up.

---

## Notable implementation calls

- **`OpeningBalancePage.tsx` and `PayrollPage.tsx`'s `load()`**: both were
  `async function load() { ... }` called as `load()` with no `.catch()` at
  the call site — a thrown `TimeoutError` would have been an unhandled
  promise rejection with the loading flag stuck true. Added `try/catch`
  inside the function itself rather than at the call site.
- **`BoardPage.tsx:278`**: `fetchProfilesByIds` (in `kudosApi.ts`) has an
  inferred return type that's a union of `Promise<{ data: T[]; error: null }>`
  (empty-ids fast path) and the actual Postgrest builder — passing that union
  straight into `withTimeout<T>`'s `PromiseLike<T>` parameter didn't
  type-check (TS couldn't unify a single `T` across the two shapes). Fixed
  with `withTimeout(Promise.resolve(fetchProfilesByIds(ids)))` at the call
  site only — no change to `kudosApi.ts`.
- **`PayrollPage.tsx`'s `confirmFinalize`/`confirmBulkFinalize`**: restructured
  the `finalizePayslip` call into a `let data: Payslip | null` set inside the
  new `try` block, since the timeout wrapper needed its own `try/catch`
  distinct from the existing `if (error || !data)` early-return branch.

## Verification performed

- `npx tsc --noEmit -p tsconfig.app.json` — clean, no errors.
- `npm run lint` — no new warnings; output is the same pre-existing
  `exhaustive-deps`/`only-export-components` warnings this repo already
  tolerates (see `CLAUDE.md`), none on the new files.
- Did **not** touch any `supabase/` file, run any migration, commit, or deploy.

## Not in this batch

M1 (raw `error.message` surfaced to users) is still open — the
`getUserErrorMessage` helper built here is exactly what M1 will use to
replace the remaining `toast.error(error.message || '...')` call sites
(several of which were touched in this batch only to add the timeout
wrapper; their raw-`error.message` line was left as-is, out of scope).
