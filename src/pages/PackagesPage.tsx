import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { TabNav, BILLING_TABS } from '../components/TabNav'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { fetchFeePackages, createFeePackage, updateFeePackage, toggleFeePackageActive, deleteFeePackage, fetchStudents } from '../lib/billingApi'
import type { FeePackage, StudentWithPackage } from '../lib/billingApi'

type LoadState = 'loading' | 'ready' | 'error'

export function PackagesPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [packages, setPackages] = useState<FeePackage[]>([])
  const [students, setStudents] = useState<StudentWithPackage[]>([])

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [formName, setFormName] = useState('')
  const [formPrice, setFormPrice] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<FeePackage | null>(null)
  const [deleting, setDeleting] = useState(false)

  function loadPackages() {
    if (!profile) return
    setLoadState('loading')
    Promise.all([
      fetchFeePackages(profile.center_id),
      fetchStudents(profile.center_id),
    ]).then(([packagesRes, studentsRes]) => {
      if (packagesRes.error || !packagesRes.data) {
        setLoadError('Could not load packages. Please try again.')
        setLoadState('error')
        return
      }
      setPackages(packagesRes.data)
      if (!studentsRes.error && studentsRes.data) {
        setStudents(studentsRes.data)
      }
      setLoadState('ready')
    })
  }

  useEffect(() => {
    loadPackages()
  }, [profile])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!formName.trim() || !formPrice.trim()) {
      toast.error('Name and price are required')
      return
    }

    const price = parseFloat(formPrice)
    if (isNaN(price) || price < 0) {
      toast.error('Enter a valid price')
      return
    }

    if (!profile) return

    setSubmitting(true)

    try {
      if (editingId) {
        const { error } = await updateFeePackage(editingId, {
          name: formName.trim(),
          default_price: price,
          description: formDescription.trim() || undefined,
        })
        if (error) {
          toast.error('Failed to update package')
          return
        }
        toast.success('Package updated')
      } else {
        const { error } = await createFeePackage(profile.center_id, {
          name: formName.trim(),
          default_price: price,
          description: formDescription.trim() || undefined,
        })
        if (error) {
          toast.error('Failed to add package')
          return
        }
        toast.success('Package added')
      }

      setFormName('')
      setFormPrice('')
      setFormDescription('')
      setEditingId(null)
      setShowForm(false)
      loadPackages()
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(pkg: FeePackage) {
    setEditingId(pkg.id)
    setFormName(pkg.name)
    setFormPrice(pkg.default_price.toString())
    setFormDescription(pkg.description || '')
    setShowForm(true)
  }

  function cancelEdit() {
    setFormName('')
    setFormPrice('')
    setFormDescription('')
    setEditingId(null)
    setShowForm(false)
  }

  async function handleToggleActive(id: string, currentActive: boolean) {
    setSubmitting(true)
    try {
      const { error } = await toggleFeePackageActive(id, !currentActive)
      if (error) {
        toast.error('Failed to update package status')
        return
      }
      toast.success(currentActive ? 'Package deactivated' : 'Package activated')
      loadPackages()
    } finally {
      setSubmitting(false)
    }
  }

  function countStudentsUsingPackage(packageId: string): number {
    return students.filter((s) => s.package_id === packageId).length
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setDeleting(true)

    const { error } = await deleteFeePackage(deleteTarget.id)

    setDeleting(false)
    if (error) {
      toast.error('Failed to delete package')
      return
    }

    setPackages((current) => current.filter((pkg) => pkg.id !== deleteTarget.id))
    setDeleteTarget(null)
    toast.success('Package deleted')
  }

  if (!profile) return null

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Fee Packages" fallback="/" />

        <TabNav tabs={BILLING_TABS} />

        {isAdmin && (
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
            {showForm ? 'Cancel' : '+ Add package'}
          </button>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-5 shadow-card">
            <p className="font-semibold text-sm text-ink">
              {editingId ? 'Edit package' : 'Add new package'}
            </p>

            <div>
              <label className="text-xs text-muted">Name *</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                disabled={submitting}
                required
                className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
              />
            </div>

            <div>
              <label className="text-xs text-muted">Price (RM) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formPrice}
                onChange={(e) => setFormPrice(e.target.value)}
                disabled={submitting}
                required
                className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
              />
            </div>

            <div>
              <label className="text-xs text-muted">Description</label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                disabled={submitting}
                className="mt-1 min-h-24 w-full rounded-xl border border-line px-3 py-2 text-sm disabled:opacity-60"
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

        {loadState === 'loading' && <LoadingState label="Loading packages…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && packages.length === 0 && (
          <EmptyState message="No packages yet. Add one to get started." />
        )}

        {loadState === 'ready' && packages.length > 0 && (
          <ul className="space-y-3">
            {packages.map((pkg) => (
              <li key={pkg.id} className="rounded-xl bg-white p-5 shadow-card">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-ink">{pkg.name}</h3>
                      <p className="text-sm text-muted">RM {pkg.default_price.toFixed(2)}</p>
                      {pkg.description && <p className="mt-2 text-xs text-muted">{pkg.description}</p>}
                    </div>
                    <div className="flex flex-col gap-2">
                      <span
                        className={`whitespace-nowrap rounded-full px-2 py-1 text-2xs font-semibold ${
                          pkg.active ? 'bg-success-soft text-success' : 'bg-line/60 text-muted'
                        }`}
                      >
                        {pkg.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => startEdit(pkg)}
                        disabled={submitting || deleting}
                        className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(pkg.id, pkg.active)}
                        disabled={submitting || deleting}
                        className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
                      >
                        {pkg.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(pkg)}
                        disabled={submitting || deleting}
                        className="min-h-tap flex-1 rounded-xl border border-danger/20 text-2xs text-danger hover:bg-danger/10 disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {deleteTarget && (
          <ConfirmDialog
            open={!!deleteTarget}
            title="Delete this package?"
            message={
              (() => {
                const count = countStudentsUsingPackage(deleteTarget.id)
                if (count > 0) {
                  return `This package is assigned to ${count} student${count !== 1 ? 's' : ''}; they will be unassigned.`
                }
                return 'This action cannot be undone.'
              })()
            }
            confirmLabel="Delete"
            onConfirm={handleDeleteConfirm}
            onCancel={() => setDeleteTarget(null)}
            loading={deleting}
          />
        )}
      </div>
    </div>
  )
}
