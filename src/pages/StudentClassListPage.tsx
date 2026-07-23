import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { StudentCard } from '../components/StudentCard'
import { StudentForm } from '../components/StudentForm'
import {
  fetchActiveStudentsByClass,
  fetchActiveFeePackages,
  fetchClassTileCounts,
  toggleStudentActive,
  deleteStudent,
  getStudentPhotoSignedUrl,
} from '../lib/billingApi'
import type { StudentWithPackage, FeePackage, ClassTile } from '../lib/billingApi'
import { fetchActiveClasses } from '../lib/attendanceApi'
import type { ClassRow } from '../lib/attendanceApi'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

type LoadState = 'loading' | 'ready' | 'error'
type FormTarget = 'new' | StudentWithPackage | null

export function StudentClassListPage() {
  const { classId: routeClassId } = useParams<{ classId: string }>()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  // The literal "unassigned" route segment maps to class_id IS NULL.
  const queryClassId = routeClassId === 'unassigned' ? null : (routeClassId ?? null)

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [students, setStudents] = useState<StudentWithPackage[]>([])
  const [packages, setPackages] = useState<FeePackage[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [tile, setTile] = useState<ClassTile | null>(null)

  const [formTarget, setFormTarget] = useState<FormTarget>(null)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string | null>>({})
  const [submitting, setSubmitting] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<StudentWithPackage | null>(null)
  const [deleting, setDeleting] = useState(false)

  function loadData() {
    if (!profile || !routeClassId) return
    setLoadState('loading')

    withTimeout(
      Promise.all([
        fetchActiveStudentsByClass(profile.center_id, queryClassId),
        fetchActiveFeePackages(profile.center_id),
        fetchActiveClasses(profile.center_id),
        fetchClassTileCounts(profile.center_id),
      ]),
    )
      .then(([studentsRes, packagesRes, classesRes, tilesRes]) => {
        if (studentsRes.error || !studentsRes.data) {
          setLoadError('Could not load students. Please try again.')
          setLoadState('error')
          return
        }

        setStudents(studentsRes.data)
        if (!packagesRes.error && packagesRes.data) setPackages(packagesRes.data)
        if (!classesRes.error && classesRes.data) setClasses(classesRes.data)
        if (!tilesRes.error && tilesRes.data) {
          setTile(tilesRes.data.find((t) => t.id === routeClassId) ?? null)
        }
        setLoadState('ready')
      })
      .catch((err) => {
        setLoadError(getUserErrorMessage(err))
        setLoadState('error')
      })
  }

  useEffect(() => {
    loadData()
  }, [profile, routeClassId])

  // student-photos is a private bucket — the stored photo_url needs a fresh
  // signed URL minted on every load rather than being used as-is.
  useEffect(() => {
    let cancelled = false
    const withPhotos = students.filter((student) => student.photo_url)
    if (withPhotos.length === 0) return

    Promise.all(
      withPhotos.map(async (student) => [student.id, await getStudentPhotoSignedUrl(student.photo_url)] as const),
    ).then((entries) => {
      if (cancelled) return
      setPhotoUrls((current) => {
        const next = { ...current }
        for (const [id, url] of entries) next[id] = url
        return next
      })
    })

    return () => {
      cancelled = true
    }
  }, [students])

  function handlePhotoUpdated(studentId: string, photoUrl: string) {
    setPhotoUrls((current) => ({ ...current, [studentId]: photoUrl }))
    setStudents((current) => current.map((s) => (s.id === studentId ? { ...s, photo_url: photoUrl } : s)))
  }

  async function handleToggleActive(id: string, currentActive: boolean) {
    if (submitting) return
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
    if (!deleteTarget || deleting) return
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

    setDeleteTarget(null)
    toast.success('Student deleted')
    loadData()
  }

  if (!profile || !routeClassId) return null

  const headerName = tile?.name ?? (routeClassId === 'unassigned' ? 'Unassigned' : 'Class')

  // classes only holds ACTIVE classes (fetchActiveClasses) — every student on
  // this page shares tile's class_id, so if this is an inactive class still
  // holding active students, inject it so the card's "Class:" label and the
  // edit form's dropdown both still resolve/select it correctly instead of
  // silently showing "—"/nothing selected.
  const classesForDisplay =
    tile && tile.id !== 'unassigned' && !classes.some((c) => c.id === tile.id)
      ? [...classes, { id: tile.id, name: tile.name, sort_order: tile.sort_order, active: tile.active }]
      : classes

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title={headerName} />

        {loadState === 'ready' && (
          <p className="text-sm text-muted">
            {students.length} active student{students.length === 1 ? '' : 's'}
            {tile && !tile.active ? ' · Inactive class' : ''}
          </p>
        )}

        {isAdmin && (
          <button
            type="button"
            onClick={() => setFormTarget((current) => (current === 'new' ? null : 'new'))}
            className="min-h-tap w-full rounded-xl border border-accent/30 bg-white font-semibold text-sm text-accent-hover shadow-card hover:bg-accent-soft"
          >
            {formTarget === 'new' ? 'Cancel' : '+ Add student'}
          </button>
        )}

        {isAdmin && formTarget && (
          <StudentForm
            key={formTarget === 'new' ? 'new' : formTarget.id}
            centerId={profile.center_id}
            packages={packages}
            classes={classesForDisplay}
            editingStudent={formTarget === 'new' ? null : formTarget}
            editingPhotoUrl={formTarget === 'new' ? null : photoUrls[formTarget.id] ?? null}
            defaultClassId={formTarget === 'new' ? queryClassId : undefined}
            onSaved={() => {
              setFormTarget(null)
              loadData()
            }}
            onCancel={() => setFormTarget(null)}
            onPhotoUpdated={handlePhotoUpdated}
          />
        )}

        {loadState === 'loading' && <LoadingState label="Loading students…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} onRetry={loadData} />}

        {loadState === 'ready' && students.length === 0 && (
          <EmptyState message="No active students in this class." />
        )}

        {loadState === 'ready' && students.length > 0 && (
          <ul className="space-y-3">
            {students.map((student) => (
              <StudentCard
                key={student.id}
                student={student}
                photoUrl={photoUrls[student.id] ?? null}
                packages={packages}
                classes={classesForDisplay}
                isAdmin={isAdmin}
                submitting={submitting}
                deleting={deleting}
                onEdit={(s) => setFormTarget(s)}
                onToggleActive={handleToggleActive}
                onDelete={(s) => setDeleteTarget(s)}
              />
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
