import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { BackButton } from '../components/BackButton'
import { formatDate, toKLDateISO } from '../lib/helpers'
import { fetchMyRequests, createRequest, updateRequest, cancelRequest } from '../lib/requestsApi'
import type { RequestRow, RequestType, RequestStatus, RequestFormInput } from '../lib/requestsApi'

type LoadState = 'loading' | 'ready' | 'error'

const TYPE_LABELS: Record<RequestType, string> = {
  annual_leave: 'Leave',
  medical_leave: 'Sick Leave',
  ot: 'OT',
  claim: 'Reimbursement',
}

const TYPE_OPTIONS: RequestType[] = ['annual_leave', 'medical_leave', 'ot', 'claim']

const STATUS_LABELS: Record<RequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

const STATUS_COLOR: Record<RequestStatus, string> = {
  pending: 'text-brand-600',
  approved: 'text-sage-600',
  rejected: 'text-coral-600',
}

interface FormValues {
  type: RequestType
  startDate: string
  endDate: string
  hours: string
  amount: string
  reason: string
}

function emptyForm(): FormValues {
  return { type: 'annual_leave', startDate: toKLDateISO(new Date()), endDate: '', hours: '', amount: '', reason: '' }
}

function toFormValues(row: RequestRow): FormValues {
  return {
    type: row.type,
    startDate: row.start_date,
    endDate: row.end_date ?? '',
    hours: row.hours != null ? String(row.hours) : '',
    amount: row.amount != null ? String(row.amount) : '',
    reason: row.reason ?? '',
  }
}

function toRequestInput(values: FormValues): RequestFormInput {
  const isLeave = values.type === 'annual_leave' || values.type === 'medical_leave'
  return {
    type: values.type,
    start_date: values.startDate,
    end_date: isLeave && values.endDate ? values.endDate : null,
    hours: values.type === 'ot' && values.hours ? Number(values.hours) : null,
    amount: values.type === 'claim' && values.amount ? Number(values.amount) : null,
    reason: values.reason.trim().length > 0 ? values.reason.trim() : null,
  }
}

function RequestFormFields({
  values,
  onChange,
  disabled,
}: {
  values: FormValues
  onChange: (next: FormValues) => void
  disabled: boolean
}) {
  const isLeave = values.type === 'annual_leave' || values.type === 'medical_leave'

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-neutral-500">Type</label>
        <select
          value={values.type}
          onChange={(event) => onChange({ ...values, type: event.target.value as RequestType })}
          disabled={disabled}
          className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm disabled:opacity-60"
        >
          {TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-neutral-500">{isLeave ? 'Start date' : 'Date'}</label>
          <input
            type="date"
            value={values.startDate}
            onChange={(event) => onChange({ ...values, startDate: event.target.value })}
            disabled={disabled}
            className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm disabled:opacity-60"
          />
        </div>
        {isLeave && (
          <div>
            <label className="text-xs text-neutral-500">End date</label>
            <input
              type="date"
              value={values.endDate}
              onChange={(event) => onChange({ ...values, endDate: event.target.value })}
              disabled={disabled}
              className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm disabled:opacity-60"
            />
          </div>
        )}
        {values.type === 'ot' && (
          <div>
            <label className="text-xs text-neutral-500">Hours</label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={values.hours}
              onChange={(event) => onChange({ ...values, hours: event.target.value })}
              disabled={disabled}
              className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm disabled:opacity-60"
            />
          </div>
        )}
        {values.type === 'claim' && (
          <div>
            <label className="text-xs text-neutral-500">Amount</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.amount}
              onChange={(event) => onChange({ ...values, amount: event.target.value })}
              disabled={disabled}
              className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm disabled:opacity-60"
            />
          </div>
        )}
      </div>

      <div>
        <label className="text-xs text-neutral-500">Reason (optional)</label>
        <input
          type="text"
          value={values.reason}
          onChange={(event) => onChange({ ...values, reason: event.target.value })}
          disabled={disabled}
          className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm disabled:opacity-60"
        />
      </div>
    </div>
  )
}

function requestDetails(row: RequestRow): string {
  const parts: string[] = []
  if (row.end_date && row.end_date !== row.start_date) {
    parts.push(`${formatDate(row.start_date)} – ${formatDate(row.end_date)}`)
  } else {
    parts.push(formatDate(row.start_date))
  }
  if (row.hours != null) parts.push(`${row.hours}h`)
  if (row.amount != null) parts.push(`RM ${row.amount}`)
  return parts.join(' · ')
}

// Content-only — no page chrome — so it can be reused both as its own
// standalone route (RequestsPage, below) and as a tab inside the combined
// Attendance hub page.
export function RequestsPanel() {
  const { profile } = useAuth()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rows, setRows] = useState<RequestRow[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  const [showCreate, setShowCreate] = useState(false)
  const [createValues, setCreateValues] = useState<FormValues>(emptyForm())
  const [createSaving, setCreateSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<FormValues>(emptyForm())
  const [editSaving, setEditSaving] = useState(false)

  const [cancellingId, setCancellingId] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    setLoadState('loading')

    fetchMyRequests(profile.center_id, profile.id).then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) {
        setLoadError('Could not load your requests. Please try again.')
        setLoadState('error')
        return
      }
      setRows(data)
      setLoadState('ready')
    })

    return () => {
      cancelled = true
    }
  }, [profile, refreshKey])

  if (!profile) return null

  function openCreate() {
    setCreateValues(emptyForm())
    setShowCreate(true)
  }

  function closeCreate() {
    setShowCreate(false)
  }

  async function handleCreate() {
    if (!profile || createSaving) return
    setCreateSaving(true)
    const { error } = await createRequest(profile.center_id, profile.id, toRequestInput(createValues))
    setCreateSaving(false)
    if (error) {
      toast.error('Could not submit your request. Please try again.')
      return
    }
    setShowCreate(false)
    setRefreshKey((k) => k + 1)
    toast.success('Request submitted')
  }

  function openEdit(row: RequestRow) {
    setEditingId(row.id)
    setEditValues(toFormValues(row))
  }

  function closeEdit() {
    setEditingId(null)
  }

  async function handleEditSave(row: RequestRow) {
    if (editSaving) return
    setEditSaving(true)
    const { error } = await updateRequest(row.id, toRequestInput(editValues))
    setEditSaving(false)
    if (error) {
      toast.error('Could not save changes. Please try again.')
      return
    }
    setEditingId(null)
    setRefreshKey((k) => k + 1)
    toast.success('Request updated')
  }

  async function handleCancel(row: RequestRow) {
    if (cancellingId) return
    setCancellingId(row.id)
    const { error } = await cancelRequest(row.id)
    setCancellingId(null)
    if (error) {
      toast.error('Could not cancel the request. Please try again.')
      return
    }
    setRefreshKey((k) => k + 1)
    toast.success('Request cancelled')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">Your requests</p>
        {!showCreate && (
          <button
            type="button"
            onClick={openCreate}
            className="flex min-h-tap items-center rounded-2xl bg-brand-600 px-4 font-display text-sm text-white shadow-card hover:bg-brand-700"
          >
            New Request
          </button>
        )}
      </div>

      {showCreate && (
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-card-md">
          <RequestFormFields values={createValues} onChange={setCreateValues} disabled={createSaving} />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeCreate}
              disabled={createSaving}
              className="min-h-tap flex-1 rounded-2xl border border-neutral-200 font-display text-sm text-neutral-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={createSaving}
              className="min-h-tap flex-1 rounded-2xl bg-brand-600 font-display text-sm text-white shadow-card hover:bg-brand-700 disabled:opacity-60"
            >
              {createSaving ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </div>
      )}

      {loadState === 'loading' && <LoadingState label="Loading your requests…" />}
      {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

      {loadState === 'ready' && rows.length === 0 && !showCreate && (
        <EmptyState message="No requests yet." />
      )}

      {loadState === 'ready' && rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="space-y-3 rounded-2xl bg-white p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-neutral-800">{TYPE_LABELS[row.type]}</p>
                  <p className="text-xs text-neutral-500">{requestDetails(row)}</p>
                  {row.reason && <p className="mt-1 text-sm text-neutral-600">{row.reason}</p>}
                </div>
                <span className={`text-xs font-display ${STATUS_COLOR[row.status]}`}>
                  {STATUS_LABELS[row.status]}
                </span>
              </div>

              {row.status === 'pending' && editingId !== row.id && (
                <div className="flex gap-2 border-t border-neutral-100 pt-3">
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    className="min-h-tap flex-1 rounded-2xl border border-neutral-200 font-display text-sm text-neutral-600"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCancel(row)}
                    disabled={cancellingId === row.id}
                    className="min-h-tap flex-1 rounded-2xl border border-coral-200 font-display text-sm text-coral-600 disabled:opacity-60"
                  >
                    {cancellingId === row.id ? 'Cancelling…' : 'Cancel'}
                  </button>
                </div>
              )}

              {editingId === row.id && (
                <div className="space-y-3 border-t border-neutral-100 pt-3">
                  <RequestFormFields values={editValues} onChange={setEditValues} disabled={editSaving} />

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={closeEdit}
                      disabled={editSaving}
                      className="min-h-tap flex-1 rounded-2xl border border-neutral-200 font-display text-sm text-neutral-600 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditSave(row)}
                      disabled={editSaving}
                      className="min-h-tap flex-1 rounded-2xl bg-brand-600 font-display text-sm text-white shadow-card hover:bg-brand-700 disabled:opacity-60"
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

// Standalone legacy route (/requests) — kept working in case anything still
// links directly to it. The Attendance hub page renders RequestsPanel
// directly instead of this wrapper.
export function RequestsPage() {
  return (
    <div className="min-h-screen bg-cream-100 p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          <BackButton fallback="/" />
          <h1 className="font-display text-2xl text-neutral-800">Requests</h1>
        </div>
        <RequestsPanel />
      </div>
    </div>
  )
}
