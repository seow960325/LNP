import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { BackButton } from '../components/BackButton'
import { formatDate } from '../lib/helpers'
import { fetchAllRequestsForCenter, reviewRequest } from '../lib/requestsApi'
import type { AdminRequestRow, RequestType, RequestStatus } from '../lib/requestsApi'

type LoadState = 'loading' | 'ready' | 'error'
type Filter = 'pending' | 'all'

const TYPE_LABELS: Record<RequestType, string> = {
  annual_leave: 'Leave',
  medical_leave: 'Sick Leave',
  ot: 'OT',
  claim: 'Reimbursement',
}

const STATUS_LABELS: Record<RequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

const STATUS_COLOR: Record<RequestStatus, string> = {
  pending: 'text-accent',
  approved: 'text-success',
  rejected: 'text-danger',
}

function requestDetails(row: AdminRequestRow): string {
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
// standalone route (RequestsAdminPage, below) and as a tab inside the
// combined Attendance hub page.
export function RequestsAdminPanel() {
  const { profile } = useAuth()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rows, setRows] = useState<AdminRequestRow[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  const [filter, setFilter] = useState<Filter>('pending')
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    setLoadState('loading')

    fetchAllRequestsForCenter(profile.center_id).then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) {
        setLoadError('Could not load requests. Please try again.')
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

  const visibleRows = filter === 'pending' ? rows.filter((row) => row.status === 'pending') : rows
  const pendingCount = rows.filter((row) => row.status === 'pending').length

  async function handleReview(row: AdminRequestRow, status: 'approved' | 'rejected') {
    if (!profile || reviewingId) return
    setReviewingId(row.id)
    const { error } = await reviewRequest(row.id, status, profile.id)
    setReviewingId(null)
    if (error) {
      toast.error('Could not update this request. Please try again.')
      return
    }
    setRefreshKey((k) => k + 1)
    toast.success(status === 'approved' ? 'Request approved' : 'Request rejected')
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-xl bg-white p-1 shadow-card">
        <button
          type="button"
          onClick={() => setFilter('pending')}
          className={`min-h-tap flex-1 rounded-xl font-semibold text-sm ${
            filter === 'pending' ? 'bg-accent text-white' : 'text-muted'
          }`}
        >
          Pending ({pendingCount})
        </button>
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`min-h-tap flex-1 rounded-xl font-semibold text-sm ${
            filter === 'all' ? 'bg-accent text-white' : 'text-muted'
          }`}
        >
          All
        </button>
      </div>

      {loadState === 'loading' && <LoadingState label="Loading requests…" />}
      {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

      {loadState === 'ready' && visibleRows.length === 0 && (
        <EmptyState message={filter === 'pending' ? 'No pending requests.' : 'No requests yet.'} />
      )}

      {loadState === 'ready' && visibleRows.length > 0 && (
        <ul className="space-y-3">
          {visibleRows.map((row) => (
            <li key={row.id} className="space-y-3 rounded-xl bg-white p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-ink">{row.full_name}</p>
                  <p className="text-xs text-muted">
                    {TYPE_LABELS[row.type]} · {requestDetails(row)}
                  </p>
                  {row.reason && <p className="mt-1 text-sm text-muted">{row.reason}</p>}
                </div>
                <span className={`text-xs font-semibold ${STATUS_COLOR[row.status]}`}>
                  {STATUS_LABELS[row.status]}
                </span>
              </div>

              {row.status === 'pending' && (
                <div className="flex gap-2 border-t border-line pt-3">
                  <button
                    type="button"
                    onClick={() => handleReview(row, 'rejected')}
                    disabled={reviewingId === row.id}
                    className="min-h-tap flex-1 rounded-xl border border-danger/20 font-semibold text-sm text-danger disabled:opacity-60"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReview(row, 'approved')}
                    disabled={reviewingId === row.id}
                    className="min-h-tap flex-1 rounded-xl bg-success font-semibold text-sm text-white shadow-card hover:bg-success disabled:opacity-60"
                  >
                    Approve
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Standalone legacy route (/requests/admin) — kept working in case anything
// still links directly to it. The Attendance hub page renders
// RequestsAdminPanel directly instead of this wrapper.
export function RequestsAdminPage() {
  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          <BackButton fallback="/" />
          <h1 className="font-bold text-2xl text-ink">Requests (Admin)</h1>
        </div>
        <RequestsAdminPanel />
      </div>
    </div>
  )
}
