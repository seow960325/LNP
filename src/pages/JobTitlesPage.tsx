import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  fetchJobTitles,
  createJobTitle,
  updateJobTitle,
  toggleJobTitleActive,
  swapJobTitleSortOrder,
  deleteJobTitle,
} from '../lib/jobTitlesApi'
import type { JobTitle } from '../types'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

type LoadState = 'loading' | 'ready' | 'error'

export function JobTitlesPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([])
  const [submitting, setSubmitting] = useState(false)

  const [showAddForm, setShowAddForm] = useState(false)
  const [addName, setAddName] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const [deleteTarget, setDeleteTarget] = useState<JobTitle | null>(null)
  const [deleting, setDeleting] = useState(false)

  function loadJobTitles() {
    if (!profile) return
    setLoadState('loading')
    withTimeout(fetchJobTitles(profile.center_id))
      .then(({ data, error }) => {
        if (error || !data) {
          setLoadError('Could not load job titles. Please try again.')
          setLoadState('error')
          return
        }
        setJobTitles(data)
        setLoadState('ready')
      })
      .catch((err) => {
        setLoadError(getUserErrorMessage(err))
        setLoadState('error')
      })
  }

  useEffect(() => {
    loadJobTitles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return
    if (!addName.trim()) {
      toast.error('Name is required')
      return
    }
    if (!profile) return

    setSubmitting(true)
    try {
      const maxSortOrder = jobTitles.reduce((max, jt) => Math.max(max, jt.sort_order), -1)
      const { error } = await withTimeout(
        createJobTitle(profile.center_id, { name: addName.trim(), sort_order: maxSortOrder + 1 }),
      )
      if (error) {
        toast.error('Failed to add job title')
        return
      }
      toast.success('Job title added')
      setAddName('')
      setShowAddForm(false)
      loadJobTitles()
    } catch (err) {
      toast.error(getUserErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  function startRename(jt: JobTitle) {
    setEditingId(jt.id)
    setEditName(jt.name)
  }

  function cancelRename() {
    setEditingId(null)
    setEditName('')
  }

  async function handleSaveRename() {
    if (!profile || !editingId || submitting) return
    if (!editName.trim()) {
      toast.error('Name is required')
      return
    }
    setSubmitting(true)
    try {
      const { error } = await updateJobTitle(editingId, profile.center_id, { name: editName.trim() })
      if (error) {
        toast.error('Failed to rename job title')
        return
      }
      toast.success('Renamed')
      cancelRename()
      loadJobTitles()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleActive(jt: JobTitle) {
    if (!profile || submitting) return
    setSubmitting(true)
    try {
      const { error } = await toggleJobTitleActive(jt.id, profile.center_id, !jt.active)
      if (error) {
        toast.error('Failed to update job title status')
        return
      }
      toast.success(jt.active ? 'Job title deactivated' : 'Job title activated')
      loadJobTitles()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMove(index: number, direction: 'up' | 'down') {
    if (!profile || submitting) return
    const neighborIndex = direction === 'up' ? index - 1 : index + 1
    const current = jobTitles[index]
    const neighbor = jobTitles[neighborIndex]
    if (!current || !neighbor) return

    setSubmitting(true)
    try {
      const { error } = await swapJobTitleSortOrder(profile.center_id, current, neighbor)
      if (error) {
        toast.error('Failed to reorder job titles')
        return
      }
      loadJobTitles()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      const result = await deleteJobTitle(deleteTarget.id)
      if (result.error === 'in_use') {
        toast.error(
          `${result.count} staff member${result.count === 1 ? ' is' : 's are'} still assigned to "${deleteTarget.name}". Use Deactivate instead of Delete.`,
        )
        return
      }
      if (result.error === 'failed') {
        toast.error('Could not delete this job title. Please try again.')
        return
      }
      toast.success('Job title deleted')
      loadJobTitles()
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  if (!profile || !isAdmin) return null

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Job Titles" />

        <button
          type="button"
          onClick={() => {
            if (showAddForm) {
              setShowAddForm(false)
              setAddName('')
            } else {
              cancelRename()
              setShowAddForm(true)
            }
          }}
          className="min-h-tap w-full rounded-xl border border-accent/30 bg-white font-semibold text-sm text-accent-hover shadow-card hover:bg-accent-soft"
        >
          {showAddForm ? 'Cancel' : '+ Add job title'}
        </button>

        {showAddForm && (
          <form onSubmit={handleAdd} className="space-y-3 rounded-xl bg-white p-5 shadow-card">
            <p className="font-semibold text-sm text-ink">Add new job title</p>
            <div>
              <label className="text-xs text-muted">Name *</label>
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                disabled={submitting}
                required
                placeholder="e.g. Teacher"
                className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-tap w-full rounded-xl bg-accent font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
            >
              Add
            </button>
          </form>
        )}

        {loadState === 'loading' && <LoadingState label="Loading job titles…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} onRetry={loadJobTitles} />}

        {loadState === 'ready' && jobTitles.length === 0 && (
          <EmptyState message="No job titles yet. Add one to get started." />
        )}

        {loadState === 'ready' && jobTitles.length > 0 && (
          <ul className="space-y-3">
            {jobTitles.map((jt, index) => (
              <li key={jt.id} className="rounded-xl bg-white p-5 shadow-card">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {editingId === jt.id ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          disabled={submitting}
                          autoFocus
                          className="min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
                        />
                      ) : (
                        <h3 className="font-bold text-ink">{jt.name}</h3>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        onClick={() => handleMove(index, 'up')}
                        disabled={submitting || index === 0}
                        aria-label="Move up"
                        className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-cream disabled:opacity-30"
                      >
                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(index, 'down')}
                        disabled={submitting || index === jobTitles.length - 1}
                        aria-label="Move down"
                        className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-cream disabled:opacity-30"
                      >
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>

                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-1 text-2xs font-semibold ${
                        jt.active ? 'bg-success-soft text-success' : 'bg-line/60 text-muted'
                      }`}
                    >
                      {jt.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="flex gap-2 pt-2">
                    {editingId === jt.id ? (
                      <>
                        <button
                          type="button"
                          onClick={handleSaveRename}
                          disabled={submitting}
                          className="min-h-tap flex-1 rounded-xl bg-accent font-semibold text-2xs text-white hover:bg-accent-hover disabled:opacity-60"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelRename}
                          disabled={submitting}
                          className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startRename(jt)}
                          disabled={submitting}
                          className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(jt)}
                          disabled={submitting}
                          className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
                        >
                          {jt.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(jt)}
                          disabled={submitting}
                          className="min-h-tap flex-1 rounded-xl border border-danger/20 text-2xs text-danger hover:bg-danger/10 disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this job title?"
        message={`"${deleteTarget?.name}" will be permanently deleted. This only succeeds if no staff members are currently assigned to it.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  )
}
