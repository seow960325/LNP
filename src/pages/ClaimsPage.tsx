import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { TabNav, claimsTabs } from '../components/TabNav'
import { formatDate, toKLDateISO } from '../lib/helpers'
import {
  fetchMyClaims,
  fetchAllClaims,
  fetchActiveClaimCategories,
  createClaim,
  updateClaim,
  approveClaim,
  rejectClaim,
  setClaimReceiptHeld,
} from '../lib/claimsApi'
import type { ClaimRow, ClaimCategory, ClaimStatus, UpdateClaimPatch } from '../lib/claimsApi'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

type LoadState = 'loading' | 'ready' | 'error'

const STATUS_STYLES: Record<ClaimStatus, string> = {
  pending: 'bg-accent-soft text-accent-hover',
  approved: 'bg-success-soft text-success',
  rejected: 'bg-danger/10 text-danger',
}

const STATUS_LABELS: Record<ClaimStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

const formatCurrency = (amount: number) =>
  `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

interface ClaimFormValues {
  category_id: string
  description: string
  expense_date: string
  amount: string
}

function emptyClaimForm(): ClaimFormValues {
  return {
    category_id: '',
    description: '',
    expense_date: toKLDateISO(new Date()),
    amount: '',
  }
}

function toClaimFormValues(claim: ClaimRow): ClaimFormValues {
  return {
    category_id: claim.category_id ?? '',
    description: claim.description,
    expense_date: claim.expense_date,
    amount: String(claim.amount),
  }
}

// Returns null when valid, or a toast-ready error message.
function validateClaimForm(values: ClaimFormValues): string | null {
  if (!values.category_id) return 'Please select a category'
  if (!values.description.trim()) return 'Description is required'
  if (!values.expense_date) return 'Expense date is required'
  const amount = parseFloat(values.amount)
  if (isNaN(amount) || amount <= 0) return 'Enter a valid amount'
  return null
}

function ClaimFormFields({
  values,
  onChange,
  categories,
  disabled,
}: {
  values: ClaimFormValues
  onChange: (next: ClaimFormValues) => void
  categories: ClaimCategory[]
  disabled: boolean
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted">Category *</label>
        <select
          value={values.category_id}
          onChange={(event) => onChange({ ...values, category_id: event.target.value })}
          disabled={disabled}
          required
          className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
        >
          <option value="">Select a category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-muted">Description *</label>
        <input
          type="text"
          value={values.description}
          onChange={(event) => onChange({ ...values, description: event.target.value })}
          disabled={disabled}
          required
          placeholder="e.g. Grab to venue for parent meeting"
          className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted">Expense date *</label>
          <input
            type="date"
            value={values.expense_date}
            onChange={(event) => onChange({ ...values, expense_date: event.target.value })}
            disabled={disabled}
            required
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 py-2 text-sm text-left appearance-none disabled:opacity-60"
          />
        </div>
        <div>
          <label className="text-xs text-muted">Amount (RM) *</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={values.amount}
            onChange={(event) => onChange({ ...values, amount: event.target.value })}
            disabled={disabled}
            required
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
          />
        </div>
      </div>
    </div>
  )
}

function claimSummaryLine(claim: ClaimRow): string {
  const category = claim.claim_categories?.name ?? 'Uncategorized'
  return `${category} · ${formatDate(claim.expense_date)}`
}

// Teacher/staff own-claims view: submit new claims, edit while pending or
// rejected (editing a rejected claim resubmits it — see handleEditSave).
function MyClaimsView() {
  const { profile } = useAuth()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [claims, setClaims] = useState<ClaimRow[]>([])
  const [categories, setCategories] = useState<ClaimCategory[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  const [showCreate, setShowCreate] = useState(false)
  const [createValues, setCreateValues] = useState<ClaimFormValues>(emptyClaimForm())
  const [createSaving, setCreateSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<ClaimFormValues>(emptyClaimForm())
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    setLoadState('loading')

    withTimeout(Promise.all([fetchMyClaims(profile.id), fetchActiveClaimCategories()]))
      .then(([claimsRes, categoriesRes]) => {
        if (cancelled) return
        if (claimsRes.error || !claimsRes.data) {
          setLoadError('Could not load your claims. Please try again.')
          setLoadState('error')
          return
        }
        setClaims(claimsRes.data)
        if (!categoriesRes.error && categoriesRes.data) setCategories(categoriesRes.data)
        setLoadState('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(getUserErrorMessage(err))
        setLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [profile, refreshKey])

  if (!profile) return null

  function openCreate() {
    setCreateValues(emptyClaimForm())
    setShowCreate(true)
  }

  async function handleCreate() {
    if (!profile || createSaving) return
    const validationError = validateClaimForm(createValues)
    if (validationError) {
      toast.error(validationError)
      return
    }

    setCreateSaving(true)
    try {
      const { error } = await withTimeout(
        createClaim(profile.id, {
          category_id: createValues.category_id,
          description: createValues.description.trim(),
          expense_date: createValues.expense_date,
          amount: parseFloat(createValues.amount),
        }),
      )
      setCreateSaving(false)

      if (error) {
        toast.error(error.message || 'Could not submit your claim. Please try again.')
        return
      }
      setShowCreate(false)
      setRefreshKey((k) => k + 1)
      toast.success('Claim submitted')
    } catch (err) {
      setCreateSaving(false)
      toast.error(getUserErrorMessage(err))
    }
  }

  function openEdit(claim: ClaimRow) {
    setEditingId(claim.id)
    setEditValues(toClaimFormValues(claim))
  }

  async function handleEditSave(claim: ClaimRow) {
    if (editSaving) return
    const validationError = validateClaimForm(editValues)
    if (validationError) {
      toast.error(validationError)
      return
    }

    setEditSaving(true)
    const patch: UpdateClaimPatch = {
      category_id: editValues.category_id,
      description: editValues.description.trim(),
      expense_date: editValues.expense_date,
      amount: parseFloat(editValues.amount),
    }
    // Editing a rejected claim resubmits it — the DB trigger clears the prior
    // approval trail and resets submitted_at once status flips back to pending.
    if (claim.status === 'rejected') patch.status = 'pending'

    try {
      const { error } = await withTimeout(updateClaim(claim.id, patch))
      setEditSaving(false)

      if (error) {
        toast.error(error.message || 'Could not save changes. Please try again.')
        return
      }
      setEditingId(null)
      setRefreshKey((k) => k + 1)
      toast.success(claim.status === 'rejected' ? 'Claim resubmitted' : 'Claim updated')
    } catch (err) {
      setEditSaving(false)
      toast.error(getUserErrorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Your claims</p>
        {!showCreate && (
          <button
            type="button"
            onClick={openCreate}
            className="flex min-h-tap items-center rounded-xl bg-accent px-4 font-semibold text-sm text-white shadow-card hover:bg-accent-hover"
          >
            + New Claim
          </button>
        )}
      </div>

      {showCreate && (
        <div className="space-y-3 rounded-xl bg-white p-4 shadow-card-md">
          <ClaimFormFields values={createValues} onChange={setCreateValues} categories={categories} disabled={createSaving} />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              disabled={createSaving}
              className="min-h-tap flex-1 rounded-xl border border-line font-semibold text-sm text-muted hover:bg-cream disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={createSaving}
              className="min-h-tap flex-1 rounded-xl bg-accent font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
            >
              {createSaving ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </div>
      )}

      {loadState === 'loading' && <LoadingState label="Loading your claims…" />}
      {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

      {loadState === 'ready' && claims.length === 0 && !showCreate && (
        <EmptyState message="No claims yet. Submit one to get started." />
      )}

      {loadState === 'ready' && claims.length > 0 && (
        <ul className="space-y-3">
          {claims.map((claim) => (
            <li key={claim.id} className="space-y-3 rounded-xl bg-white p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{claim.description}</p>
                  <p className="text-xs text-muted">{claimSummaryLine(claim)}</p>
                  {claim.status === 'approved' && claim.approver_name && (
                    <p className="mt-1 text-xs text-success">Approved by {claim.approver_name}</p>
                  )}
                  {claim.status === 'rejected' && claim.reject_reason && (
                    <p className="mt-1 text-sm text-danger">Reason: {claim.reject_reason}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-2xs font-semibold ${STATUS_STYLES[claim.status]}`}>
                    {STATUS_LABELS[claim.status]}
                  </span>
                  <span className="font-bold text-ink">{formatCurrency(claim.amount)}</span>
                </div>
              </div>

              {(claim.status === 'pending' || claim.status === 'rejected') && editingId !== claim.id && (
                <div className="border-t border-line pt-3">
                  <button
                    type="button"
                    onClick={() => openEdit(claim)}
                    className="min-h-tap w-full rounded-xl border border-line font-semibold text-sm text-muted hover:bg-cream"
                  >
                    {claim.status === 'rejected' ? 'Edit & Resubmit' : 'Edit'}
                  </button>
                </div>
              )}

              {editingId === claim.id && (
                <div className="space-y-3 border-t border-line pt-3">
                  {claim.status === 'rejected' && claim.reject_reason && (
                    <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">
                      Previously rejected: {claim.reject_reason}
                    </p>
                  )}
                  <ClaimFormFields values={editValues} onChange={setEditValues} categories={categories} disabled={editSaving} />

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      disabled={editSaving}
                      className="min-h-tap flex-1 rounded-xl border border-line font-semibold text-sm text-muted hover:bg-cream disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditSave(claim)}
                      disabled={editSaving}
                      className="min-h-tap flex-1 rounded-xl bg-accent font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
                    >
                      {editSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Admin/super_admin view: sees every claim, can filter, and can approve or
// reject any pending claim except their own (hidden client-side; the DB
// trigger also blocks it and its error message is what a bypass would surface).
function AdminClaimsView() {
  const { profile } = useAuth()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [claims, setClaims] = useState<ClaimRow[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  const [statusFilter, setStatusFilter] = useState<ClaimStatus | ''>('')
  const [periodFilter, setPeriodFilter] = useState('')
  const [claimantFilter, setClaimantFilter] = useState('')

  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<ClaimRow | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [receiptSavingId, setReceiptSavingId] = useState<string | null>(null)

  const [exportMonth, setExportMonth] = useState(() => toKLDateISO(new Date()).slice(0, 7))
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    setLoadState('loading')

    withTimeout(
      fetchAllClaims({
        status: statusFilter || undefined,
        period: periodFilter || undefined,
      }),
    )
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          setLoadError('Could not load claims. Please try again.')
          setLoadState('error')
          return
        }
        setClaims(data)
        setLoadState('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(getUserErrorMessage(err))
        setLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [profile, statusFilter, periodFilter, refreshKey])

  if (!profile) return null

  const claimants = Array.from(new Map(claims.map((c) => [c.claimant_id, c.claimant_name])).entries()).sort((a, b) =>
    a[1].localeCompare(b[1])
  )
  const visibleClaims = claimantFilter ? claims.filter((c) => c.claimant_id === claimantFilter) : claims

  async function handleApprove(claim: ClaimRow) {
    if (reviewingId) return
    setReviewingId(claim.id)
    const { error } = await approveClaim(claim.id)
    setReviewingId(null)
    if (error) {
      toast.error(error.message || 'Could not approve this claim. Please try again.')
      return
    }
    setRefreshKey((k) => k + 1)
    toast.success('Claim approved')
  }

  function openReject(claim: ClaimRow) {
    setRejectTarget(claim)
    setRejectReason('')
  }

  async function handleRejectConfirm() {
    if (!rejectTarget || reviewingId) return
    if (!rejectReason.trim()) {
      toast.error('A reason is required to reject a claim')
      return
    }

    setReviewingId(rejectTarget.id)
    const { error } = await rejectClaim(rejectTarget.id, rejectReason.trim())
    setReviewingId(null)

    if (error) {
      toast.error(error.message || 'Could not reject this claim. Please try again.')
      return
    }
    setRejectTarget(null)
    setRejectReason('')
    setRefreshKey((k) => k + 1)
    toast.success('Claim rejected')
  }

  async function handleExportClaimForm() {
    if (exporting) return
    setExporting(true)
    // Loaded on demand — the xlsx (SheetJS) library is only needed by
    // admins exporting a claim form, mirroring the pdfmake dynamic imports
    // used for payslip/invoice PDFs elsewhere in the app.
    const { exportClaimsForm, formatMonthLabel } = await import('../lib/claimsExport')
    const result = await exportClaimsForm(exportMonth)
    setExporting(false)

    if (result.status === 'error') {
      toast.error(result.message)
      return
    }
    if (result.status === 'empty') {
      toast.error(`No approved claims for ${formatMonthLabel(exportMonth)}`)
      return
    }
    toast.success('Claim form exported')
  }

  async function handleToggleReceipt(claim: ClaimRow) {
    if (receiptSavingId) return
    setReceiptSavingId(claim.id)
    const { error } = await setClaimReceiptHeld(claim.id, !claim.receipt_held)
    setReceiptSavingId(null)
    if (error) {
      toast.error(error.message || 'Could not update receipt status. Please try again.')
      return
    }
    setRefreshKey((k) => k + 1)
    toast.success(claim.receipt_held ? 'Receipt unmarked' : 'Receipt marked as received')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ClaimStatus | '')}
          className="min-h-tap rounded-xl border border-line bg-white px-3 text-sm text-muted shadow-card"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>

        <select
          value={claimantFilter}
          onChange={(e) => setClaimantFilter(e.target.value)}
          className="min-h-tap rounded-xl border border-line bg-white px-3 text-sm text-muted shadow-card"
        >
          <option value="">All claimants</option>
          {claimants.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>

        <input
          type="month"
          value={periodFilter}
          onChange={(e) => setPeriodFilter(e.target.value)}
          className="min-h-tap rounded-xl border border-line bg-white px-3 py-2 text-sm text-left text-muted shadow-card appearance-none"
        />

        {(statusFilter || claimantFilter || periodFilter) && (
          <button
            type="button"
            onClick={() => {
              setStatusFilter('')
              setClaimantFilter('')
              setPeriodFilter('')
            }}
            className="min-h-tap rounded-xl px-3 text-sm text-muted hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-card">
        <span className="text-sm text-muted">Export Claim Form</span>
        <input
          type="month"
          value={exportMonth}
          onChange={(e) => setExportMonth(e.target.value)}
          disabled={exporting}
          className="min-h-tap rounded-xl border border-line px-3 py-2 text-sm text-left appearance-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handleExportClaimForm}
          disabled={exporting || !exportMonth}
          className="min-h-tap rounded-xl bg-accent px-4 font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
        >
          {exporting ? 'Exporting…' : 'Export Claim Form'}
        </button>
      </div>

      {loadState === 'loading' && <LoadingState label="Loading claims…" />}
      {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

      {loadState === 'ready' && visibleClaims.length === 0 && (
        <EmptyState message="No claims match these filters." />
      )}

      {loadState === 'ready' && visibleClaims.length > 0 && (
        <ul className="space-y-3">
          {visibleClaims.map((claim) => {
            const isOwnClaim = claim.claimant_id === profile.id
            return (
              <li key={claim.id} className="space-y-3 rounded-xl bg-white p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{claim.claimant_name}</p>
                    <p className="text-sm text-ink">{claim.description}</p>
                    <p className="text-xs text-muted">{claimSummaryLine(claim)}</p>
                    {claim.status === 'approved' && claim.approver_name && (
                      <p className="mt-1 text-xs text-success">Approved by {claim.approver_name}</p>
                    )}
                    {claim.status === 'rejected' && claim.reject_reason && (
                      <p className="mt-1 text-sm text-danger">Reason: {claim.reject_reason}</p>
                    )}
                    {claim.receipt_held && (
                      <span className="mt-1 inline-block rounded-full bg-success-soft px-2 py-0.5 text-2xs font-semibold text-success">
                        Receipt ✓
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-2xs font-semibold ${STATUS_STYLES[claim.status]}`}>
                      {STATUS_LABELS[claim.status]}
                    </span>
                    <span className="font-bold text-ink">{formatCurrency(claim.amount)}</span>
                  </div>
                </div>

                <div className="space-y-3 border-t border-line pt-3">
                  {claim.status === 'pending' && !isOwnClaim && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openReject(claim)}
                        disabled={reviewingId === claim.id}
                        className="min-h-tap flex-1 rounded-xl border border-danger/20 font-semibold text-sm text-danger disabled:opacity-60"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApprove(claim)}
                        disabled={reviewingId === claim.id}
                        className="min-h-tap flex-1 rounded-xl bg-success font-semibold text-sm text-white shadow-card hover:bg-success/90 disabled:opacity-60"
                      >
                        {reviewingId === claim.id ? 'Approving…' : 'Approve'}
                      </button>
                    </div>
                  )}

                  {claim.status === 'pending' && isOwnClaim && (
                    <p className="text-xs text-muted">
                      You cannot approve or reject your own claim — ask another admin to review it.
                    </p>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">
                      Receipt: {claim.receipt_held ? 'Received' : 'Not received'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleReceipt(claim)}
                      disabled={receiptSavingId === claim.id}
                      className="min-h-tap rounded-xl border border-line px-3 text-xs font-semibold text-muted hover:bg-cream disabled:opacity-60"
                    >
                      {receiptSavingId === claim.id
                        ? 'Saving…'
                        : claim.receipt_held
                          ? 'Unmark received'
                          : 'Mark received'}
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-6 shadow-card-lg animate-fade-in">
            <h2 className="font-semibold text-lg text-ink">Reject this claim?</h2>
            <p className="text-sm text-muted">
              {rejectTarget.claimant_name} · {formatCurrency(rejectTarget.amount)}
            </p>
            <div>
              <label className="text-xs text-muted">Reason *</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                disabled={reviewingId === rejectTarget.id}
                required
                placeholder="Explain why this claim is being rejected"
                className="mt-1 min-h-20 w-full rounded-xl border border-line px-3 py-2 text-sm disabled:opacity-60"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                disabled={reviewingId === rejectTarget.id}
                className="min-h-tap flex-1 rounded-xl border border-line font-semibold text-sm text-muted hover:bg-cream disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRejectConfirm}
                disabled={reviewingId === rejectTarget.id || !rejectReason.trim()}
                className="min-h-tap flex-1 rounded-xl bg-danger font-semibold text-sm text-white shadow-card hover:bg-danger/90 disabled:opacity-60"
              >
                {reviewingId === rejectTarget.id ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function ClaimsPage() {
  const { profile } = useAuth()
  if (!profile) return null

  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin'

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <PageHeader title="Claims" />

        <TabNav tabs={claimsTabs(isAdmin)} />

        {isAdmin ? <AdminClaimsView /> : <MyClaimsView />}
      </div>
    </div>
  )
}
