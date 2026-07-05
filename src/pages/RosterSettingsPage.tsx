import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { TabNav, rosterTabs } from '../components/TabNav'
import { totalSlots } from '../lib/rosterAlgorithm'
import {
  fetchDutyTypes,
  fetchRotationPool,
  createDutyType,
  updateDutyType,
  toggleDutyTypeActive,
} from '../lib/rosterApi'
import type { DutyType } from '../lib/rosterApi'

type LoadState = 'loading' | 'ready' | 'error'

export function RosterSettingsPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dutyTypes, setDutyTypes] = useState<DutyType[]>([])
  const [poolSize, setPoolSize] = useState(0)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [formName, setFormName] = useState('')
  const [formHeadcount, setFormHeadcount] = useState('1')
  const [formSortOrder, setFormSortOrder] = useState('0')
  const [formActive, setFormActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  function loadData() {
    if (!profile) return
    setLoadState('loading')
    Promise.all([fetchDutyTypes(), fetchRotationPool(profile.center_id)]).then(([dutyTypesRes, poolRes]) => {
      if (dutyTypesRes.error || !dutyTypesRes.data) {
        setLoadError('Could not load duty types. Please try again.')
        setLoadState('error')
        return
      }
      setDutyTypes(dutyTypesRes.data)
      if (!poolRes.error && poolRes.data) setPoolSize(poolRes.data.length)
      setLoadState('ready')
    })
  }

  useEffect(() => {
    loadData()
  }, [profile])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!formName.trim()) {
      toast.error('Duty name is required')
      return
    }

    const headcount = parseInt(formHeadcount, 10)
    if (isNaN(headcount) || headcount < 1) {
      toast.error('Enter a valid headcount (1 or more)')
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
        const { error } = await updateDutyType(editingId, {
          name: formName.trim(),
          headcount,
          sort_order: sortOrder,
          active: formActive,
        })
        if (error) {
          toast.error('Failed to update duty type')
          return
        }
        toast.success('Duty type updated')
      } else {
        const { error } = await createDutyType({
          name: formName.trim(),
          headcount,
          sort_order: sortOrder,
          active: formActive,
        })
        if (error) {
          toast.error('Failed to add duty type')
          return
        }
        toast.success('Duty type added')
      }

      cancelEdit()
      loadData()
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(dutyType: DutyType) {
    setEditingId(dutyType.id)
    setFormName(dutyType.name)
    setFormHeadcount(String(dutyType.headcount))
    setFormSortOrder(String(dutyType.sort_order))
    setFormActive(dutyType.active)
    setShowForm(true)
  }

  function cancelEdit() {
    setFormName('')
    setFormHeadcount('1')
    setFormSortOrder('0')
    setFormActive(true)
    setEditingId(null)
    setShowForm(false)
  }

  async function handleToggleActive(id: string, currentActive: boolean) {
    setSubmitting(true)
    try {
      const { error } = await toggleDutyTypeActive(id, !currentActive)
      if (error) {
        toast.error('Failed to update duty type status')
        return
      }
      toast.success(currentActive ? 'Duty type deactivated' : 'Duty type activated')
      loadData()
    } finally {
      setSubmitting(false)
    }
  }

  if (!profile || !isAdmin) return null

  const S = totalSlots(dutyTypes.filter((d) => d.active))
  const mismatched = S !== poolSize

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Duty Config" fallback="/roster" />

        <TabNav tabs={rosterTabs(isAdmin)} />

        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            mismatched ? 'border border-danger/30 bg-danger/10 text-danger' : 'bg-white text-muted shadow-card'
          }`}
        >
          Duty slots: <span className="font-semibold">{S}</span> · Ticked staff:{' '}
          <span className="font-semibold">{poolSize}</span>
          {mismatched && (
            <p className="mt-1">
              Duty slots ({S}) must equal ticked staff ({poolSize}). Adjust headcount or ticked staff.
            </p>
          )}
        </div>

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
          {showForm ? 'Cancel' : '+ Add duty type'}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-5 shadow-card">
            <p className="font-semibold text-sm text-ink">
              {editingId ? 'Edit duty type' : 'Add new duty type'}
            </p>

            <div>
              <label className="text-xs text-muted">Name *</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                disabled={submitting}
                required
                placeholder="e.g. On Duty"
                className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted">Headcount</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={formHeadcount}
                  onChange={(e) => setFormHeadcount(e.target.value)}
                  disabled={submitting}
                  className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
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

        {loadState === 'loading' && <LoadingState label="Loading duty types…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && dutyTypes.length === 0 && (
          <EmptyState message="No duty types yet. Add one to get started." />
        )}

        {loadState === 'ready' && dutyTypes.length > 0 && (
          <ul className="space-y-3">
            {dutyTypes.map((dutyType) => (
              <li key={dutyType.id} className="rounded-xl bg-white p-5 shadow-card">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-ink">{dutyType.name}</h3>
                      <p className="text-xs text-muted">
                        Headcount: {dutyType.headcount} · Sort order: {dutyType.sort_order}
                      </p>
                    </div>
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-1 text-2xs font-semibold ${
                        dutyType.active ? 'bg-success-soft text-success' : 'bg-line/60 text-muted'
                      }`}
                    >
                      {dutyType.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => startEdit(dutyType)}
                      disabled={submitting}
                      className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(dutyType.id, dutyType.active)}
                      disabled={submitting}
                      className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
                    >
                      {dutyType.active ? 'Deactivate' : 'Activate'}
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
