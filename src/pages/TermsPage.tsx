import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { TabNav, BILLING_TABS } from '../components/TabNav'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { formatDate } from '../lib/helpers'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'
import { fetchTerms, createTerm, updateTerm, deleteTerm, isCurrentTerm } from '../lib/termsApi'
import type { Term } from '../lib/termsApi'
import {
  fetchPendingRequests,
  createDeletionRequest,
  rejectRequest,
  approveAndPurge,
} from '../lib/termDeletionApi'
import type { EnrichedTermDeletionRequest } from '../lib/termDeletionApi'

type LoadState = 'loading' | 'ready' | 'error'

export function TermsPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [terms, setTerms] = useState<Term[]>([])
  const [pending, setPending] = useState<EnrichedTermDeletionRequest[]>([])

  // Term add/edit form
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formStart, setFormStart] = useState('')
  const [formEnd, setFormEnd] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Term delete
  const [deleteTarget, setDeleteTarget] = useState<Term | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Data-deletion request
  const [showDeletionForm, setShowDeletionForm] = useState(false)
  const [deletionTermId, setDeletionTermId] = useState('')
  const [pendingDeletionTerm, setPendingDeletionTerm] = useState<Term | null>(null)
  const [requestSubmitting, setRequestSubmitting] = useState(false)

  // Pending approvals
  const [approveTarget, setApproveTarget] = useState<EnrichedTermDeletionRequest | null>(null)
  const [approving, setApproving] = useState(false)
  const [rejectingId, setRejectingId] = useState<string | null>(null)

  function loadData() {
    if (!profile) return
    setLoadState('loading')

    withTimeout(Promise.all([fetchTerms(profile.center_id), fetchPendingRequests(profile.center_id)]))
      .then(([termsRes, pendingRes]) => {
        if (termsRes.error || !termsRes.data) {
          setLoadError('Could not load terms. Please try again.')
          setLoadState('error')
          return
        }
        if (pendingRes.error || !pendingRes.data) {
          setLoadError('Could not load pending deletion requests. Please try again.')
          setLoadState('error')
          return
        }

        setTerms(termsRes.data)
        setPending(pendingRes.data)
        setLoadState('ready')
      })
      .catch((err) => {
        setLoadError(getUserErrorMessage(err))
        setLoadState('error')
      })
  }

  useEffect(() => {
    loadData()
  }, [profile])

  if (!profile || !isAdmin) return null

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!profile) return
    if (!formName.trim() || !formStart || !formEnd) {
      toast.error('Name, start date, and end date are required')
      return
    }
    if (formStart > formEnd) {
      toast.error('Start date must be on or before the end date')
      return
    }

    setSubmitting(true)
    try {
      if (editingId) {
        const { error } = await updateTerm(editingId, { name: formName.trim(), start_date: formStart, end_date: formEnd })
        if (error) {
          toast.error('Failed to update term')
          return
        }
        toast.success('Term updated')
      } else {
        const { error } = await createTerm({
          center_id: profile.center_id,
          name: formName.trim(),
          start_date: formStart,
          end_date: formEnd,
        })
        if (error) {
          toast.error('Failed to add term')
          return
        }
        toast.success('Term added')
      }

      cancelEdit()
      loadData()
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(term: Term) {
    setEditingId(term.id)
    setFormName(term.name)
    setFormStart(term.start_date)
    setFormEnd(term.end_date)
    setShowForm(true)
  }

  function cancelEdit() {
    setFormName('')
    setFormStart('')
    setFormEnd('')
    setEditingId(null)
    setShowForm(false)
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await deleteTerm(deleteTarget.id)
    setDeleting(false)

    if (error) {
      toast.error('Failed to delete term')
      return
    }

    setDeleteTarget(null)
    toast.success('Term deleted')
    loadData()
  }

  async function handleRequestDeletion() {
    if (!pendingDeletionTerm || !profile) return
    setRequestSubmitting(true)
    try {
      const { error } = await createDeletionRequest({
        center_id: profile.center_id,
        term_id: pendingDeletionTerm.id,
        requested_by: profile.id,
      })
      if (error) {
        toast.error('Failed to submit deletion request')
        return
      }
      toast.success('Deletion request submitted for approval.')
      setPendingDeletionTerm(null)
      setShowDeletionForm(false)
      setDeletionTermId('')
      loadData()
    } finally {
      setRequestSubmitting(false)
    }
  }

  async function handleApprove() {
    if (!approveTarget || !profile) return
    setApproving(true)
    try {
      const result = await approveAndPurge(approveTarget, profile.id)
      if (!result.ok) {
        toast.error(result.error || 'Failed to approve and purge data')
        return
      }
      toast.success(
        `Deleted ${result.attendanceDeleted} attendance + ${result.boardDeleted} board items, ${result.photosRemoved} photos`
      )
      setApproveTarget(null)
      loadData()
    } finally {
      setApproving(false)
    }
  }

  async function handleReject(request: EnrichedTermDeletionRequest) {
    if (!profile) return
    setRejectingId(request.id)
    try {
      const { error } = await rejectRequest(request.id, profile.id)
      if (error) {
        toast.error('Failed to reject request')
        return
      }
      toast.success('Request rejected')
      loadData()
    } finally {
      setRejectingId(null)
    }
  }

  const eligibleTerms = terms.filter((t) => !isCurrentTerm(t))

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-6">
        <PageHeader title="Terms" fallback="/invoices" />

        <TabNav tabs={BILLING_TABS} />

        <section className="space-y-3">
          <h2 className="font-bold text-ink">School Terms</h2>

          <button
            type="button"
            onClick={() => {
              if (showForm) {
                cancelEdit()
              } else {
                setShowForm(true)
              }
            }}
            className="min-h-tap w-full rounded-xl border border-accent/30 bg-white font-semibold text-sm text-accent-hover shadow-card hover:bg-accent-soft"
          >
            {showForm ? 'Cancel' : '+ Add term'}
          </button>

          {showForm && (
            <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-5 shadow-card">
              <p className="font-semibold text-sm text-ink">{editingId ? 'Edit term' : 'Add new term'}</p>

              <div>
                <label className="text-xs text-muted">Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  disabled={submitting}
                  required
                  placeholder="e.g. Term 1 2026"
                  className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="text-xs text-muted">Start date *</label>
                <input
                  type="date"
                  value={formStart}
                  onChange={(e) => setFormStart(e.target.value)}
                  disabled={submitting}
                  required
                  className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 py-2 text-sm text-left appearance-none disabled:opacity-60"
                />
              </div>

              <div>
                <label className="text-xs text-muted">End date *</label>
                <input
                  type="date"
                  value={formEnd}
                  onChange={(e) => setFormEnd(e.target.value)}
                  disabled={submitting}
                  required
                  className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 py-2 text-sm text-left appearance-none disabled:opacity-60"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-tap flex-1 rounded-xl bg-accent font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
                >
                  {editingId ? 'Update' : 'Add'}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={submitting}
                  className="min-h-tap flex-1 rounded-xl border border-line font-semibold text-sm text-muted hover:bg-cream disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {loadState === 'loading' && <LoadingState label="Loading terms…" />}
          {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

          {loadState === 'ready' && terms.length === 0 && (
            <EmptyState message="No terms yet. Add one to get started." />
          )}

          {loadState === 'ready' && terms.length > 0 && (
            <ul className="space-y-3">
              {terms.map((term) => (
                <li key={term.id} className="rounded-xl bg-white p-5 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-ink">{term.name}</h3>
                      <p className="text-xs text-muted">
                        {formatDate(term.start_date)} – {formatDate(term.end_date)}
                      </p>
                    </div>
                    {isCurrentTerm(term) && (
                      <span className="whitespace-nowrap rounded-full bg-success-soft px-2 py-1 text-2xs font-semibold text-success">
                        Current
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2 pt-3">
                    <button
                      type="button"
                      onClick={() => startEdit(term)}
                      disabled={submitting}
                      className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(term)}
                      disabled={submitting}
                      className="min-h-tap flex-1 rounded-xl border border-danger/20 text-2xs text-danger hover:bg-danger/10 disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-bold text-ink">Data Deletion</h2>

          <button
            type="button"
            onClick={() => setShowDeletionForm((current) => !current)}
            className="min-h-tap w-full rounded-xl border border-danger/30 bg-white font-semibold text-sm text-danger shadow-card hover:bg-danger/10"
          >
            {showDeletionForm ? 'Cancel' : 'Request term data deletion'}
          </button>

          {showDeletionForm && (
            <div className="space-y-3 rounded-xl bg-white p-5 shadow-card">
              <p className="font-semibold text-sm text-ink">Choose a term to purge</p>

              {eligibleTerms.length === 0 ? (
                <EmptyState message="No terms are eligible — the current term can't be purged." />
              ) : (
                <>
                  <select
                    value={deletionTermId}
                    onChange={(e) => setDeletionTermId(e.target.value)}
                    className="min-h-tap w-full rounded-xl border border-line px-3 text-sm"
                  >
                    <option value="">Select a term…</option>
                    {eligibleTerms.map((term) => (
                      <option key={term.id} value={term.id}>
                        {term.name} ({formatDate(term.start_date)} – {formatDate(term.end_date)})
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      const term = eligibleTerms.find((t) => t.id === deletionTermId)
                      if (term) setPendingDeletionTerm(term)
                    }}
                    disabled={!deletionTermId}
                    className="min-h-tap w-full rounded-xl bg-danger font-semibold text-sm text-white shadow-card hover:bg-danger/90 disabled:opacity-50"
                  >
                    Request deletion
                  </button>
                </>
              )}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-bold text-ink">Pending Approvals</h2>

          {loadState === 'ready' && pending.length === 0 && (
            <EmptyState message="No pending deletion requests." />
          )}

          {loadState === 'ready' && pending.length > 0 && (
            <ul className="space-y-3">
              {pending.map((request) => {
                const isOwnRequest = request.requested_by === profile.id
                const busy = approving || rejectingId === request.id
                return (
                  <li key={request.id} className="rounded-xl bg-white p-5 shadow-card">
                    <h3 className="font-bold text-ink">{request.term_name}</h3>
                    <p className="text-xs text-muted">
                      {formatDate(request.term_start)} – {formatDate(request.term_end)}
                    </p>
                    <p className="mt-1 text-xs text-muted">Requested by {request.requester_name}</p>

                    <div className="flex gap-2 pt-3">
                      <button
                        type="button"
                        onClick={() => setApproveTarget(request)}
                        disabled={isOwnRequest || busy}
                        className="min-h-tap flex-1 rounded-xl border border-success/30 text-2xs text-success hover:bg-success-soft disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReject(request)}
                        disabled={busy}
                        className="min-h-tap flex-1 rounded-xl border border-danger/20 text-2xs text-danger hover:bg-danger/10 disabled:opacity-60"
                      >
                        {rejectingId === request.id ? 'Rejecting…' : 'Reject'}
                      </button>
                    </div>
                    {isOwnRequest && (
                      <p className="pt-2 text-2xs text-muted">You can't approve your own request</p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this term?"
        message={deleteTarget ? `${deleteTarget.name} will be permanently removed.` : ''}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />

      <ConfirmDialog
        open={!!pendingDeletionTerm}
        title="Submit data deletion request?"
        message={
          pendingDeletionTerm
            ? `${pendingDeletionTerm.name} (${formatDate(pendingDeletionTerm.start_date)} – ${formatDate(pendingDeletionTerm.end_date)}) will be submitted for approval. Once approved, ALL Daily Ops Board items and attendance records (including photos) in that date range will be permanently deleted.`
            : ''
        }
        confirmLabel="Submit request"
        onConfirm={handleRequestDeletion}
        onCancel={() => setPendingDeletionTerm(null)}
        loading={requestSubmitting}
      />

      <ConfirmDialog
        open={!!approveTarget}
        title="Approve and delete this term's data?"
        message={
          approveTarget
            ? `This will PERMANENTLY delete all Daily Ops Board items and attendance records (including photos) for ${approveTarget.term_name} (${formatDate(approveTarget.term_start)} – ${formatDate(approveTarget.term_end)}). This cannot be undone.`
            : ''
        }
        confirmLabel="Approve & delete"
        onConfirm={handleApprove}
        onCancel={() => setApproveTarget(null)}
        loading={approving}
      />
    </div>
  )
}
