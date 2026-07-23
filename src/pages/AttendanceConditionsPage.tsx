import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { fetchConditions, createCondition, updateCondition, toggleConditionActive } from '../lib/attendanceApi'
import type { AttendanceCondition } from '../lib/attendanceApi'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

type LoadState = 'loading' | 'ready' | 'error'

export function AttendanceConditionsPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [conditions, setConditions] = useState<AttendanceCondition[]>([])

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [formName, setFormName] = useState('')
  const [formSortOrder, setFormSortOrder] = useState('0')
  const [formActive, setFormActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  function loadConditions() {
    if (!profile) return
    setLoadState('loading')
    withTimeout(fetchConditions())
      .then(({ data, error }) => {
        if (error || !data) {
          setLoadError('Could not load conditions. Please try again.')
          setLoadState('error')
          return
        }
        setConditions(data)
        setLoadState('ready')
      })
      .catch((err) => {
        setLoadError(getUserErrorMessage(err))
        setLoadState('error')
      })
  }

  useEffect(() => {
    loadConditions()
  }, [profile])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return
    if (!formName.trim()) {
      toast.error('Condition name is required')
      return
    }

    const sortOrder = parseInt(formSortOrder, 10)
    if (isNaN(sortOrder)) {
      toast.error('Enter a valid sort order')
      return
    }

    setSubmitting(true)

    try {
      if (editingId) {
        const { error } = await updateCondition(editingId, {
          name: formName.trim(),
          sort_order: sortOrder,
          active: formActive,
        })
        if (error) {
          toast.error('Failed to update condition')
          return
        }
        toast.success('Condition updated')
      } else {
        const { error } = await createCondition({
          name: formName.trim(),
          sort_order: sortOrder,
          active: formActive,
        })
        if (error) {
          toast.error('Failed to add condition')
          return
        }
        toast.success('Condition added')
      }

      cancelEdit()
      loadConditions()
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(condition: AttendanceCondition) {
    setEditingId(condition.id)
    setFormName(condition.name)
    setFormSortOrder(String(condition.sort_order))
    setFormActive(condition.active)
    setShowForm(true)
  }

  function cancelEdit() {
    setFormName('')
    setFormSortOrder('0')
    setFormActive(true)
    setEditingId(null)
    setShowForm(false)
  }

  async function handleToggleActive(id: string, currentActive: boolean) {
    if (submitting) return
    setSubmitting(true)
    try {
      const { error } = await toggleConditionActive(id, !currentActive)
      if (error) {
        toast.error('Failed to update condition status')
        return
      }
      toast.success(currentActive ? 'Condition deactivated' : 'Condition activated')
      loadConditions()
    } finally {
      setSubmitting(false)
    }
  }

  if (!profile || !isAdmin) return null

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Health Conditions" />

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
          {showForm ? 'Cancel' : '+ Add condition'}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-5 shadow-card">
            <p className="font-semibold text-sm text-ink">
              {editingId ? 'Edit condition' : 'Add new condition'}
            </p>

            <div>
              <label className="text-xs text-muted">Name *</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                disabled={submitting}
                required
                placeholder="e.g. Cough"
                className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="text-xs text-muted">Sort order</label>
              <input
                type="number"
                step="1"
                value={formSortOrder}
                onChange={(e) => setFormSortOrder(e.target.value)}
                disabled={submitting}
                className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={formActive}
                onChange={(e) => setFormActive(e.target.checked)}
                disabled={submitting}
                className="h-4 w-4 rounded border-line text-accent focus:ring-accent"
              />
              Active
            </label>

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

        {loadState === 'loading' && <LoadingState label="Loading conditions…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} onRetry={loadConditions} />}

        {loadState === 'ready' && conditions.length === 0 && (
          <EmptyState message="No conditions yet. Add one to get started." />
        )}

        {loadState === 'ready' && conditions.length > 0 && (
          <ul className="space-y-3">
            {conditions.map((condition) => (
              <li key={condition.id} className="rounded-xl bg-white p-5 shadow-card">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-ink">{condition.name}</h3>
                      <p className="text-xs text-muted">Sort order: {condition.sort_order}</p>
                    </div>
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-1 text-2xs font-semibold ${
                        condition.active ? 'bg-success-soft text-success' : 'bg-line/60 text-muted'
                      }`}
                    >
                      {condition.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => startEdit(condition)}
                      disabled={submitting}
                      className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(condition.id, condition.active)}
                      disabled={submitting}
                      className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
                    >
                      {condition.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
