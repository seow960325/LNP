import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { StudentCard } from '../components/StudentCard'
import { StudentForm } from '../components/StudentForm'
import {
  fetchInactiveStudents,
  fetchActiveFeePackages,
  toggleStudentActive,
  deleteStudent,
  getStudentPhotoSignedUrl,
} from '../lib/billingApi'
import type { StudentWithPackage, FeePackage } from '../lib/billingApi'
import { fetchClassesForCenter } from '../lib/attendanceApi'
import type { ClassRow } from '../lib/attendanceApi'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

type LoadState = 'loading' | 'ready' | 'error'

export function PastStudentsPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [students, setStudents] = useState<StudentWithPackage[]>([])
  const [packages, setPackages] = useState<FeePackage[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])

  // Edit only here — creating a brand-new inactive student doesn't make
  // sense, so there's no top-level "+ Add student" affordance on this page.
  const [editingStudent, setEditingStudent] = useState<StudentWithPackage | null>(null)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string | null>>({})
  const [submitting, setSubmitting] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<StudentWithPackage | null>(null)
  const [deleting, setDeleting] = useState(false)

  function loadData() {
    if (!profile) return
    setLoadState('loading')

    withTimeout(
      Promise.all([
        fetchInactiveStudents(profile.center_id),
        fetchActiveFeePackages(profile.center_id),
        // All classes, not active-only: a past student's class may since
        // have been deactivated and must still resolve to its real name
        // instead of "—".
        fetchClassesForCenter(profile.center_id),
      ]),
    )
      .then(([studentsRes, packagesRes, classesRes]) => {
        if (studentsRes.error || !studentsRes.data) {
          setLoadError('Could not load past students. Please try again.')
          setLoadState('error')
          return
        }

        setStudents(studentsRes.data)
        if (!packagesRes.error && packagesRes.data) setPackages(packagesRes.data)
        if (!classesRes.error && classesRes.data) setClasses(classesRes.data)
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

    setDeleteTarget(null)
    toast.success('Student deleted')
    loadData()
  }

  if (!profile) return null

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Past Students" />

        {isAdmin && editingStudent && (
          <StudentForm
            key={editingStudent.id}
            centerId={profile.center_id}
            packages={packages}
            classes={classes}
            editingStudent={editingStudent}
            editingPhotoUrl={photoUrls[editingStudent.id] ?? null}
            onSaved={() => {
              setEditingStudent(null)
              loadData()
            }}
            onCancel={() => setEditingStudent(null)}
            onPhotoUpdated={handlePhotoUpdated}
          />
        )}

        {loadState === 'loading' && <LoadingState label="Loading past students…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && students.length === 0 && <EmptyState message="No past students." />}

        {loadState === 'ready' && students.length > 0 && (
          <ul className="space-y-3">
            {students.map((student) => (
              <StudentCard
                key={student.id}
                student={student}
                photoUrl={photoUrls[student.id] ?? null}
                packages={packages}
                classes={classes}
                isAdmin={isAdmin}
                submitting={submitting}
                deleting={deleting}
                onEdit={(s) => setEditingStudent(s)}
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
