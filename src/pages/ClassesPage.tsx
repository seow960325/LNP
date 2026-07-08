import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { fetchClasses, createClass, updateClass, toggleClassActive } from '../lib/attendanceApi'
import type { ClassRow } from '../lib/attendanceApi'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

type LoadState = 'loading' | 'ready' | 'error'

export function ClassesPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [classes, setClasses] = useState<ClassRow[]>([])

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [formName, setFormName] = useState('')
  const [formSortOrder, setFormSortOrder] = useState('0')
  const [formActive, setFormActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  function loadClasses() {
    if (!profile) return
    setLoadState('loading')
    withTimeout(fetchClasses())
      .then(({ data, error }) => {
        if (error || !data) {
          setLoadError('Could not load classes. Please try again.')
          setLoadState('error')
          return
        }
        setClasses(data)
        setLoadState('ready')
      })
      .catch((err) => {
        setLoadError(getUserErrorMessage(err))
        setLoadState('error')
      })
  }

  useEffect(() => {
    loadClasses()
  }, [profile])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!formName.trim()) {
      toast.error('Class name is required')
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
        const { error } = await updateClass(editingId, {
          name: formName.trim(),
          sort_order: sortOrder,
          active: formActive,
        })
        if (error) {
          toast.error('Failed to update class')
          return
        }
        toast.success('Class updated')
      } else {
        const { error } = await createClass({
          name: formName.trim(),
          sort_order: sortOrder,
          active: formActive,
        })
        if (error) {
          toast.error('Failed to add class')
          return
        }
        toast.success('Class added')
      }

      cancelEdit()
      loadClasses()
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(cls: ClassRow) {
    setEditingId(cls.id)
    setFormName(cls.name)
    setFormSortOrder(String(cls.sort_order))
    setFormActive(cls.active)
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
    setSubmitting(true)
    try {
      const { error } = await toggleClassActive(id, !currentActive)
      if (error) {
        toast.error('Failed to update class status')
        return
      }
      toast.success(currentActive ? 'Class deactivated' : 'Class activated')
      loadClasses()
    } finally {
      setSubmitting(false)
    }
  }

  if (!profile || !isAdmin) return null

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Classes" fallback="/entrance" />

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
          {showForm ? 'Cancel' : '+ Add class'}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-5 shadow-card">
            <p className="font-semibold text-sm text-ink">{editingId ? 'Edit class' : 'Add new class'}</p>

            <div>
              <label className="text-xs text-muted">Name *</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                disabled={submitting}
                required
                placeholder="e.g. Butterflies"
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

        {loadState === 'loading' && <LoadingState label="Loading classes…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && classes.length === 0 && (
          <EmptyState message="No classes yet. Add one to get started." />
        )}

        {loadState === 'ready' && classes.length > 0 && (
          <ul className="space-y-3">
            {classes.map((cls) => (
              <li key={cls.id} className="rounded-xl bg-white p-5 shadow-card">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-ink">{cls.name}</h3>
                      <p className="text-xs text-muted">Sort order: {cls.sort_order}</p>
                    </div>
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-1 text-2xs font-semibold ${
                        cls.active ? 'bg-success-soft text-success' : 'bg-line/60 text-muted'
                      }`}
                    >
                      {cls.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => startEdit(cls)}
                      disabled={submitting}
                      className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(cls.id, cls.active)}
                      disabled={submitting}
                      className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
                    >
                      {cls.active ? 'Deactivate' : 'Activate'}
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
