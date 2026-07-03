import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { BackButton } from '../components/BackButton'
import { TabNav, directoryTabs } from '../components/TabNav'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  fetchStudents,
  fetchActiveFeePackages,
  createStudent,
  updateStudent,
  toggleStudentActive,
  deleteStudent,
} from '../lib/billingApi'
import type { StudentWithPackage, FeePackage } from '../lib/billingApi'

type LoadState = 'loading' | 'ready' | 'error'

export function StudentsPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [students, setStudents] = useState<StudentWithPackage[]>([])
  const [packages, setPackages] = useState<FeePackage[]>([])

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [formName, setFormName] = useState('')
  const [formParentName, setFormParentName] = useState('')
  const [formParentPhone, setFormParentPhone] = useState('')
  const [formParentEmail, setFormParentEmail] = useState('')
  const [formPackageId, setFormPackageId] = useState('')
  const [formEnrolledAt, setFormEnrolledAt] = useState('')
  const [formDob, setFormDob] = useState('')
  const [formAddress, setFormAddress] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<StudentWithPackage | null>(null)
  const [deleting, setDeleting] = useState(false)

  function loadData() {
    if (!profile) return
    setLoadState('loading')

    Promise.all([
      fetchStudents(profile.center_id),
      fetchActiveFeePackages(profile.center_id),
    ]).then(([studentsRes, packagesRes]) => {
      if (studentsRes.error || !studentsRes.data) {
        setLoadError('Could not load students. Please try again.')
        setLoadState('error')
        return
      }

      setStudents(studentsRes.data)
      if (!packagesRes.error && packagesRes.data) {
        setPackages(packagesRes.data)
      }
      setLoadState('ready')
    })
  }

  useEffect(() => {
    loadData()
  }, [profile])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!formName.trim()) {
      toast.error('Student name is required')
      return
    }

    if (!profile) return

    setSubmitting(true)

    try {
      const payload = {
        name: formName.trim(),
        parent_name: formParentName.trim() || undefined,
        parent_phone: formParentPhone.trim() || undefined,
        parent_email: formParentEmail.trim() || undefined,
        package_id: formPackageId || undefined,
        enrolled_at: formEnrolledAt || undefined,
        dob: formDob || undefined,
        address: formAddress.trim() || undefined,
        notes: formNotes.trim() || undefined,
      }

      if (editingId) {
        const { error } = await updateStudent(editingId, payload)
        if (error) {
          toast.error('Failed to update student')
          return
        }
        toast.success('Student updated')
        setEditingId(null)
        setShowForm(false)
      } else {
        const { error } = await createStudent(profile.center_id, payload)
        if (error) {
          toast.error('Failed to add student')
          return
        }
        toast.success('Student added')
        // Keep form open for bulk entry — just clear the fields
        setFormName('')
        setFormParentName('')
        setFormParentPhone('')
        setFormParentEmail('')
        setFormPackageId('')
        setFormEnrolledAt('')
        setFormDob('')
        setFormAddress('')
        setFormNotes('')
      }

      loadData()
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(student: StudentWithPackage) {
    setEditingId(student.id)
    setFormName(student.name)
    setFormParentName(student.parent_name || '')
    setFormParentPhone(student.parent_phone || '')
    setFormParentEmail(student.parent_email || '')
    setFormPackageId(student.package_id || '')
    setFormEnrolledAt(student.enrolled_at || '')
    setFormDob(student.dob || '')
    setFormAddress(student.address || '')
    setFormNotes(student.notes || '')
    setShowForm(true)
  }

  function cancelEdit() {
    setFormName('')
    setFormParentName('')
    setFormParentPhone('')
    setFormParentEmail('')
    setFormPackageId('')
    setFormEnrolledAt('')
    setFormDob('')
    setFormAddress('')
    setFormNotes('')
    setEditingId(null)
    setShowForm(false)
  }

  async function handleToggleActive(id: string, currentActive: boolean) {
    setSubmitting(true)
    try {
      const { error } = await toggleStudentActive(id, !currentActive)
      if (error) {
        toast.error('Failed to update student status')
        return
      }
      toast.success(currentActive ? 'Student deactivated' : 'Student activated')
      loadData()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setDeleting(true)

    const { error } = await deleteStudent(deleteTarget.id)

    setDeleting(false)
    if (error) {
      if (error.code === '23503') {
        toast.error('Cannot delete: student has invoices. Void or remove them first.')
      } else {
        toast.error('Failed to delete student')
      }
      return
    }

    setStudents((current) => current.filter((student) => student.id !== deleteTarget.id))
    setDeleteTarget(null)
    toast.success('Student deleted')
  }

  if (!profile) return null

  const getPackageName = (packageId: string | null): string => {
    if (!packageId) return '—'
    const pkg = packages.find((p) => p.id === packageId)
    return pkg?.name || '—'
  }

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          <BackButton fallback="/" />
          <h1 className="font-bold text-2xl text-ink">Students</h1>
        </div>

        <TabNav tabs={directoryTabs(isAdmin)} />

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
            {showForm ? 'Cancel' : '+ Add student'}
          </button>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-5 shadow-card">
            <p className="font-semibold text-sm text-ink">
              {editingId ? 'Edit student' : 'Add new student'}
            </p>

            <div>
              <label className="text-xs text-muted">Student name *</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                disabled={submitting}
                required
                placeholder="e.g. Tan Chi Ming"
                className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="text-xs text-muted">Parent/Guardian name</label>
              <input
                type="text"
                value={formParentName}
                onChange={(e) => setFormParentName(e.target.value)}
                disabled={submitting}
                placeholder="e.g. Tan Kok Keong"
                className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="text-xs text-muted">Parent phone</label>
              <input
                type="tel"
                value={formParentPhone}
                onChange={(e) => setFormParentPhone(e.target.value)}
                disabled={submitting}
                placeholder="e.g. 012-3456789"
                className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="text-xs text-muted">Parent email</label>
              <input
                type="email"
                value={formParentEmail}
                onChange={(e) => setFormParentEmail(e.target.value)}
                disabled={submitting}
                placeholder="e.g. siti@example.com"
                className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="text-xs text-muted">Fee package</label>
              <select
                value={formPackageId}
                onChange={(e) => setFormPackageId(e.target.value)}
                disabled={submitting}
                className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
              >
                <option value="">Select a package</option>
                {packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name} (RM {pkg.default_price.toFixed(2)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted">Enrollment date</label>
              <input
                type="date"
                value={formEnrolledAt}
                onChange={(e) => setFormEnrolledAt(e.target.value)}
                disabled={submitting}
                className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
              />
            </div>

            <div>
              <label className="text-xs text-muted">Date of birth</label>
              <input
                type="date"
                value={formDob}
                onChange={(e) => setFormDob(e.target.value)}
                disabled={submitting}
                className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
              />
            </div>

            <div>
              <label className="text-xs text-muted">Address</label>
              <textarea
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                disabled={submitting}
                placeholder="Street address, unit, city, postal code"
                className="mt-1 min-h-16 w-full rounded-xl border border-line px-3 py-2 text-sm placeholder:text-muted/70 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="text-xs text-muted">Notes</label>
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                disabled={submitting}
                placeholder="e.g. Dietary restrictions, allergies, etc."
                className="mt-1 min-h-20 w-full rounded-xl border border-line px-3 py-2 text-sm placeholder:text-muted/70 disabled:opacity-60"
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
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={submitting}
                  className="min-h-tap flex-1 rounded-xl border border-line font-semibold text-sm text-muted hover:bg-cream disabled:opacity-60"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}

        {loadState === 'loading' && <LoadingState label="Loading students…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && students.length === 0 && (
          <EmptyState message="No students yet. Add one to get started." />
        )}

        {loadState === 'ready' && students.length > 0 && (
          <ul className="space-y-3">
            {students.map((student) => (
              <li key={student.id} className="rounded-xl bg-white p-5 shadow-card">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-ink">{student.name}</h3>
                      {student.parent_name && (
                        <p className="text-sm text-muted">Guardian: {student.parent_name}</p>
                      )}
                      {student.parent_phone && (
                        <p className="text-xs text-muted">Phone: {student.parent_phone}</p>
                      )}
                      {student.dob && (
                        <p className="text-xs text-muted">DOB: {new Date(student.dob).toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
                      )}
                      <p className="text-xs text-muted">Package: {getPackageName(student.package_id)}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <span
                        className={`whitespace-nowrap rounded-full px-2 py-1 text-2xs font-semibold ${
                          student.active ? 'bg-success-soft text-success' : 'bg-line/60 text-muted'
                        }`}
                      >
                        {student.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => startEdit(student)}
                        disabled={submitting || deleting}
                        className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(student.id, student.active)}
                        disabled={submitting || deleting}
                        className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
                      >
                        {student.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(student)}
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
            title="Delete this student?"
            message={`${deleteTarget.name} will be permanently removed.`}
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
