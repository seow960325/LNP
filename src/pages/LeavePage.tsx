import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { TabNav, leaveTabs } from '../components/TabNav'
import { formatDate, formatLeaveDays, toKLDateISO } from '../lib/helpers'
import { countLeaveDays, parseISODateLocal } from '../lib/leaveDays'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'
import {
  fetchMyLeaveRequests,
  fetchAllLeaveRequests,
  fetchMyLeaveBalances,
  createLeaveRequest,
  updateLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
} from '../lib/leaveApi'
import type { LeaveRequestRow, LeaveType, LeaveSegment, LeaveStatus, UpdateLeaveRequestPatch } from '../lib/leaveApi'

type LoadState = 'loading' | 'ready' | 'error'

const STATUS_STYLES: Record<LeaveStatus, string> = {
  pending: 'bg-accent-soft text-accent-hover',
  approved: 'bg-success-soft text-success',
  rejected: 'bg-danger/10 text-danger',
}

const STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

const TYPE_LABELS: Record<LeaveType, string> = {
  AL: 'Annual Leave',
  MC: 'Medical Leave',
}

const SEGMENT_LABELS: Record<LeaveSegment, string> = {
  full: 'Full day',
  am: 'AM half',
  pm: 'PM half',
}

const currentYear = new Date().getFullYear()

interface LeaveFormValues {
  leave_type: LeaveType
  segment: LeaveSegment
  start_date: string
  end_date: string
  reason: string
}

function emptyLeaveForm(): LeaveFormValues {
  const today = toKLDateISO(new Date())
  return { leave_type: 'AL', segment: 'full', start_date: today, end_date: today, reason: '' }
}

function toLeaveFormValues(request: LeaveRequestRow): LeaveFormValues {
  return {
    leave_type: request.leave_type,
    segment: request.segment,
    start_date: request.start_date,
    end_date: request.end_date,
    reason: request.reason ?? '',
  }
}

// Returns null when valid, or a toast-ready error message.
function validateLeaveForm(values: LeaveFormValues): string | null {
  if (!values.start_date) return 'Start date is required'
  if (values.segment === 'full' && !values.end_date) return 'End date is required'
  if (values.segment === 'full' && values.end_date < values.start_date) {
    return 'End date must be on or after start date'
  }
  return null
}

function leaveDateSummary(request: { start_date: string; end_date: string; segment: LeaveSegment }): string {
  if (request.segment !== 'full') return `${formatDate(request.start_date)} · ${SEGMENT_LABELS[request.segment]}`
  if (request.start_date === request.end_date) return formatDate(request.start_date)
  return `${formatDate(request.start_date)} – ${formatDate(request.end_date)}`
}

function LeaveFormFields({
  values,
  onChange,
  disabled,
}: {
  values: LeaveFormValues
  onChange: (next: LeaveFormValues) => void
  disabled: boolean
}) {
  function handleSegmentChange(segment: LeaveSegment) {
    onChange({ ...values, segment, end_date: segment === 'full' ? values.end_date : values.start_date })
  }

  function handleStartDateChange(start_date: string) {
    onChange({ ...values, start_date, end_date: values.segment === 'full' ? values.end_date : start_date })
  }

  // Nice-to-have preview only — the DB trigger is the source of truth for
  // the persisted `days` value, so this is explicitly labelled "estimated".
  const estimatedDays =
    values.segment === 'full'
      ? values.start_date && values.end_date && values.end_date >= values.start_date
        ? countLeaveDays(parseISODateLocal(values.start_date), parseISODateLocal(values.end_date))
        : null
      : values.start_date
        ? 0.5
        : null

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted">Leave type *</label>
          <select
            value={values.leave_type}
            onChange={(event) => onChange({ ...values, leave_type: event.target.value as LeaveType })}
            disabled={disabled}
            required
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
          >
            <option value="AL">Annual Leave</option>
            <option value="MC">Medical Leave</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted">Duration *</label>
          <select
            value={values.segment}
            onChange={(event) => handleSegmentChange(event.target.value as LeaveSegment)}
            disabled={disabled}
            required
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
          >
            <option value="full">Full day</option>
            <option value="am">AM half</option>
            <option value="pm">PM half</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted">Start date *</label>
          <input
            type="date"
            value={values.start_date}
            onChange={(event) => handleStartDateChange(event.target.value)}
            disabled={disabled}
            required
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 py-2 text-sm text-left appearance-none disabled:opacity-60"
          />
        </div>
        <div>
          <label className="text-xs text-muted">End date *</label>
          <input
            type="date"
            value={values.segment === 'full' ? values.end_date : values.start_date}
            onChange={(event) => onChange({ ...values, end_date: event.target.value })}
            disabled={disabled || values.segment !== 'full'}
            min={values.start_date}
            required
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 py-2 text-sm text-left appearance-none disabled:bg-cream disabled:opacity-60"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted">Reason</label>
        <textarea
          value={values.reason}
          onChange={(event) => onChange({ ...values, reason: event.target.value })}
          disabled={disabled}
          placeholder="Optional"
          className="mt-1 min-h-20 w-full rounded-xl border border-line px-3 py-2 text-sm placeholder:text-muted/70 disabled:opacity-60"
        />
      </div>

      {estimatedDays !== null && (
        <p className="text-xs text-muted">Estimated: {formatLeaveDays(estimatedDays)}</p>
      )}
    </div>
  )
}

// Teacher/staff own-requests view: shows AL remaining, lets them submit new
// requests, and edit while pending or rejected (editing a rejected request
// resubmits it — see handleEditSave).
function MyLeaveView() {
  const { profile } = useAuth()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [requests, setRequests] = useState<LeaveRequestRow[]>([])
  const [alEntitled, setAlEntitled] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)

  const [showCreate, setShowCreate] = useState(false)
  const [createValues, setCreateValues] = useState<LeaveFormValues>(emptyLeaveForm())
  const [createSaving, setCreateSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<LeaveFormValues>(emptyLeaveForm())
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    setLoadState('loading')

    withTimeout(Promise.all([fetchMyLeaveRequests(profile.id), fetchMyLeaveBalances(profile.id, currentYear)]))
      .then(([requestsRes, balancesRes]) => {
        if (cancelled) return
        if (requestsRes.error || !requestsRes.data) {
          setLoadError('Could not load your leave requests. Please try again.')
          setLoadState('error')
          return
        }
        setRequests(requestsRes.data)
        // MC balance rows are invisible to teachers via RLS — only AL is
        // ever expected here, so an empty/errored fetch just leaves 0.
        const alBalance = (balancesRes.data ?? []).find((b) => b.leave_type === 'AL')
        setAlEntitled(alBalance?.entitled_days ?? 0)
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

  const alUsed = requests
    .filter((r) => r.leave_type === 'AL' && r.status === 'approved' && r.start_date.startsWith(`${currentYear}-`))
    .reduce((sum, r) => sum + r.days, 0)
  const alRemaining = alEntitled - alUsed

  function openCreate() {
    setCreateValues(emptyLeaveForm())
    setShowCreate(true)
  }

  async function handleCreate() {
    if (!profile || createSaving) return
    const validationError = validateLeaveForm(createValues)
    if (validationError) {
      toast.error(validationError)
      return
    }

    setCreateSaving(true)
    try {
      const { error } = await withTimeout(
        createLeaveRequest(profile.id, {
          leave_type: createValues.leave_type,
          start_date: createValues.start_date,
          end_date: createValues.segment === 'full' ? createValues.end_date : createValues.start_date,
          segment: createValues.segment,
          reason: createValues.reason.trim() || null,
        }),
      )
      setCreateSaving(false)

      if (error) {
        toast.error(error.message || 'Could not submit your leave request. Please try again.')
        return
      }
      setShowCreate(false)
      setRefreshKey((k) => k + 1)
      toast.success('Leave request submitted')
    } catch (err) {
      setCreateSaving(false)
      toast.error(getUserErrorMessage(err))
    }
  }

  function openEdit(request: LeaveRequestRow) {
    setEditingId(request.id)
    setEditValues(toLeaveFormValues(request))
  }

  async function handleEditSave(request: LeaveRequestRow) {
    if (editSaving) return
    const validationError = validateLeaveForm(editValues)
    if (validationError) {
      toast.error(validationError)
      return
    }

    setEditSaving(true)
    const patch: UpdateLeaveRequestPatch = {
      leave_type: editValues.leave_type,
      start_date: editValues.start_date,
      end_date: editValues.segment === 'full' ? editValues.end_date : editValues.start_date,
      segment: editValues.segment,
      reason: editValues.reason.trim() || null,
    }
    // Editing a rejected request resubmits it — the DB trigger clears the
    // prior approval trail and resets submitted_at once status flips back.
    if (request.status === 'rejected') patch.status = 'pending'

    try {
      const { error } = await withTimeout(updateLeaveRequest(request.id, patch))
      setEditSaving(false)

      if (error) {
        toast.error(error.message || 'Could not save changes. Please try again.')
        return
      }
      setEditingId(null)
      setRefreshKey((k) => k + 1)
      toast.success(request.status === 'rejected' ? 'Leave request resubmitted' : 'Leave request updated')
    } catch (err) {
      setEditSaving(false)
      toast.error(getUserErrorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-accent-soft p-5 text-center shadow-card">
        <p className="text-xs text-muted">Annual Leave remaining ({currentYear})</p>
        <p className="mt-1 font-bold text-3xl text-accent-hover">{formatLeaveDays(alRemaining)}</p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Your leave requests</p>
        {!showCreate && (
          <button
            type="button"
            onClick={openCreate}
            className="flex min-h-tap items-center rounded-xl bg-accent px-4 font-semibold text-sm text-white shadow-card hover:bg-accent-hover"
          >
            + Apply Leave
          </button>
        )}
      </div>

      {showCreate && (
        <div className="space-y-3 rounded-xl bg-white p-4 shadow-card-md">
          <LeaveFormFields values={createValues} onChange={setCreateValues} disabled={createSaving} />

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

      {loadState === 'loading' && <LoadingState label="Loading your leave requests…" />}
      {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

      {loadState === 'ready' && requests.length === 0 && !showCreate && (
        <EmptyState message="No leave requests yet. Apply for leave to get started." />
      )}

      {loadState === 'ready' && requests.length > 0 && (
        <ul className="space-y-3">
          {requests.map((request) => (
            <li key={request.id} className="space-y-3 rounded-xl bg-white p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="rounded-full border border-line px-2 py-0.5 text-2xs font-semibold text-ink">
                    {TYPE_LABELS[request.leave_type]}
                  </span>
                  <p className="mt-1 text-xs text-muted">{leaveDateSummary(request)}</p>
                  {request.status === 'approved' && request.approver_name && (
                    <p className="mt-1 text-xs text-success">Approved by {request.approver_name}</p>
                  )}
                  {request.status === 'rejected' && request.reject_reason && (
                    <p className="mt-1 text-sm text-danger">Reason: {request.reject_reason}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`whitespace-nowrap rounded-full px-2.5 py-1 text-2xs font-semibold ${STATUS_STYLES[request.status]}`}
                  >
                    {STATUS_LABELS[request.status]}
                  </span>
                  <span className="font-bold text-ink">{formatLeaveDays(request.days)}</span>
                </div>
              </div>

              {(request.status === 'pending' || request.status === 'rejected') && editingId !== request.id && (
                <div className="border-t border-line pt-3">
                  <button
                    type="button"
                    onClick={() => openEdit(request)}
                    className="min-h-tap w-full rounded-xl border border-line font-semibold text-sm text-muted hover:bg-cream"
                  >
                    {request.status === 'rejected' ? 'Edit & Resubmit' : 'Edit'}
                  </button>
                </div>
              )}

              {editingId === request.id && (
                <div className="space-y-3 border-t border-line pt-3">
                  {request.status === 'rejected' && request.reject_reason && (
                    <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">
                      Previously rejected: {request.reject_reason}
                    </p>
                  )}
                  <LeaveFormFields values={editValues} onChange={setEditValues} disabled={editSaving} />

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
                      onClick={() => handleEditSave(request)}
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

// Admin/super_admin view: sees every request, can filter, and can approve or
// reject any pending request except their own (hidden client-side; the DB
// trigger also blocks it and its error message is what a bypass would surface).
function AdminLeaveView() {
  const { profile } = useAuth()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [requests, setRequests] = useState<LeaveRequestRow[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  const [statusFilter, setStatusFilter] = useState<LeaveStatus | ''>('')
  const [typeFilter, setTypeFilter] = useState<LeaveType | ''>('')
  const [yearFilter, setYearFilter] = useState<number | ''>('')
  const [staffFilter, setStaffFilter] = useState('')

  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<LeaveRequestRow | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    setLoadState('loading')

    withTimeout(
      fetchAllLeaveRequests({
        status: statusFilter || undefined,
        leave_type: typeFilter || undefined,
        year: yearFilter || undefined,
      }),
    )
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          setLoadError('Could not load leave requests. Please try again.')
          setLoadState('error')
          return
        }
        setRequests(data)
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
  }, [profile, statusFilter, typeFilter, yearFilter, refreshKey])

  if (!profile) return null

  const staffOptions = Array.from(new Map(requests.map((r) => [r.profile_id, r.claimant_name])).entries()).sort(
    (a, b) => a[1].localeCompare(b[1])
  )
  const visibleRequests = staffFilter ? requests.filter((r) => r.profile_id === staffFilter) : requests

  async function handleApprove(request: LeaveRequestRow) {
    if (reviewingId) return
    setReviewingId(request.id)
    const { error } = await approveLeaveRequest(request.id)
    setReviewingId(null)
    if (error) {
      toast.error(error.message || 'Could not approve this request. Please try again.')
      return
    }
    setRefreshKey((k) => k + 1)
    toast.success('Leave request approved')
  }

  function openReject(request: LeaveRequestRow) {
    setRejectTarget(request)
    setRejectReason('')
  }

  async function handleRejectConfirm() {
    if (!rejectTarget || reviewingId) return
    if (!rejectReason.trim()) {
      toast.error('A reason is required to reject a leave request')
      return
    }

    setReviewingId(rejectTarget.id)
    const { error } = await rejectLeaveRequest(rejectTarget.id, rejectReason.trim())
    setReviewingId(null)

    if (error) {
      toast.error(error.message || 'Could not reject this request. Please try again.')
      return
    }
    setRejectTarget(null)
    setRejectReason('')
    setRefreshKey((k) => k + 1)
    toast.success('Leave request rejected')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as LeaveStatus | '')}
          className="min-h-tap rounded-xl border border-line bg-white px-3 text-sm text-muted shadow-card"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as LeaveType | '')}
          className="min-h-tap rounded-xl border border-line bg-white px-3 text-sm text-muted shadow-card"
        >
          <option value="">All types</option>
          <option value="AL">Annual Leave</option>
          <option value="MC">Medical Leave</option>
        </select>

        <select
          value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)}
          className="min-h-tap rounded-xl border border-line bg-white px-3 text-sm text-muted shadow-card"
        >
          <option value="">All staff</option>
          {staffOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>

        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value ? Number(e.target.value) : '')}
          className="min-h-tap rounded-xl border border-line bg-white px-3 text-sm text-muted shadow-card"
        >
          <option value="">All years</option>
          {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        {(statusFilter || typeFilter || staffFilter || yearFilter) && (
          <button
            type="button"
            onClick={() => {
              setStatusFilter('')
              setTypeFilter('')
              setStaffFilter('')
              setYearFilter('')
            }}
            className="min-h-tap rounded-xl px-3 text-sm text-muted hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {loadState === 'loading' && <LoadingState label="Loading leave requests…" />}
      {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

      {loadState === 'ready' && visibleRequests.length === 0 && (
        <EmptyState message="No leave requests match these filters." />
      )}

      {loadState === 'ready' && visibleRequests.length > 0 && (
        <ul className="space-y-3">
          {visibleRequests.map((request) => {
            const isOwnRequest = request.profile_id === profile.id
            return (
              <li key={request.id} className="space-y-3 rounded-xl bg-white p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{request.claimant_name}</p>
                    <span className="mt-1 inline-block rounded-full border border-line px-2 py-0.5 text-2xs font-semibold text-ink">
                      {TYPE_LABELS[request.leave_type]}
                    </span>
                    <p className="mt-1 text-xs text-muted">{leaveDateSummary(request)}</p>
                    {request.status === 'approved' && request.approver_name && (
                      <p className="mt-1 text-xs text-success">Approved by {request.approver_name}</p>
                    )}
                    {request.status === 'rejected' && request.reject_reason && (
                      <p className="mt-1 text-sm text-danger">Reason: {request.reject_reason}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`whitespace-nowrap rounded-full px-2.5 py-1 text-2xs font-semibold ${STATUS_STYLES[request.status]}`}
                    >
                      {STATUS_LABELS[request.status]}
                    </span>
                    <span className="font-bold text-ink">{formatLeaveDays(request.days)}</span>
                  </div>
                </div>

                {request.status === 'pending' && !isOwnRequest && (
                  <div className="flex gap-2 border-t border-line pt-3">
                    <button
                      type="button"
                      onClick={() => openReject(request)}
                      disabled={reviewingId === request.id}
                      className="min-h-tap flex-1 rounded-xl border border-danger/20 font-semibold text-sm text-danger disabled:opacity-60"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApprove(request)}
                      disabled={reviewingId === request.id}
                      className="min-h-tap flex-1 rounded-xl bg-success font-semibold text-sm text-white shadow-card hover:bg-success/90 disabled:opacity-60"
                    >
                      {reviewingId === request.id ? 'Approving…' : 'Approve'}
                    </button>
                  </div>
                )}

                {request.status === 'pending' && isOwnRequest && (
                  <p className="border-t border-line pt-3 text-xs text-muted">
                    You cannot approve or reject your own leave request — ask another admin to review it.
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-6 shadow-card-lg animate-fade-in">
            <h2 className="font-semibold text-lg text-ink">Reject this leave request?</h2>
            <p className="text-sm text-muted">
              {rejectTarget.claimant_name} · {TYPE_LABELS[rejectTarget.leave_type]} · {leaveDateSummary(rejectTarget)}
            </p>
            <div>
              <label className="text-xs text-muted">Reason *</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                disabled={reviewingId === rejectTarget.id}
                required
                placeholder="Explain why this request is being rejected"
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

export function LeavePage() {
  const { profile } = useAuth()
  if (!profile) return null

  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin'

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <PageHeader title="Leave" fallback="/" />

        <TabNav tabs={leaveTabs(isAdmin)} />

        {isAdmin ? <AdminLeaveView /> : <MyLeaveView />}
      </div>
    </div>
  )
}
