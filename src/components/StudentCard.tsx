import { Link } from 'react-router-dom'
import { Avatar } from './Avatar'
import type { StudentWithPackage, FeePackage } from '../lib/billingApi'
import type { ClassRow } from '../lib/attendanceApi'

// Shared row card for every student list (class roster, unassigned, past) —
// factored out so StudentClassListPage and PastStudentsPage render identical
// markup instead of copy-pasting it. No Active/Inactive pill here: each list
// that uses this card is already homogeneous (all-active or all-past), so a
// per-row status badge would just be redundant everywhere it's used now.
export function StudentCard({
  student,
  photoUrl,
  packages,
  classes,
  isAdmin,
  submitting,
  deleting,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  student: StudentWithPackage
  photoUrl: string | null
  packages: FeePackage[]
  classes: ClassRow[]
  isAdmin: boolean
  submitting: boolean
  deleting: boolean
  onEdit: (student: StudentWithPackage) => void
  onToggleActive: (id: string, currentActive: boolean) => void
  onDelete: (student: StudentWithPackage) => void
}) {
  const packageName = student.package_id ? packages.find((p) => p.id === student.package_id)?.name ?? '—' : '—'
  const className = student.class_id ? classes.find((c) => c.id === student.class_id)?.name ?? '—' : '—'

  return (
    <li className="rounded-xl bg-white p-5 shadow-card">
      <div className="space-y-2">
        <Link to={`/students/${student.id}`} className="flex min-w-0 gap-3">
          <Avatar fullName={student.name} avatarUrl={photoUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-ink">
              {student.name}
              {student.zoho_contact_id && (
                <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 align-middle text-2xs font-semibold text-accent-hover">
                  Billed
                </span>
              )}
            </h3>
            {student.parent_name && <p className="text-sm text-muted">Guardian: {student.parent_name}</p>}
            {student.parent_phone && <p className="text-xs text-muted">Phone: {student.parent_phone}</p>}
            {student.parent_email && <p className="text-xs text-muted">Email: {student.parent_email}</p>}
            {student.dob && (
              <p className="text-xs text-muted">
                DOB: {new Date(student.dob).toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' })}
              </p>
            )}
            {student.enrolled_at && (
              <p className="text-xs text-muted">
                Enrolled:{' '}
                {new Date(student.enrolled_at).toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' })}
              </p>
            )}
            <p className="text-xs text-muted">Package: {packageName}</p>
            <p className="text-xs text-muted">Class: {className}</p>
            {student.address && <p className="text-xs text-muted">Address: {student.address}</p>}
            {student.notes && <p className="text-xs text-muted">Notes: {student.notes}</p>}
          </div>
        </Link>

        {isAdmin && (
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => onEdit(student)}
              disabled={submitting || deleting}
              className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onToggleActive(student.id, student.active)}
              disabled={submitting || deleting}
              className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
            >
              {student.active ? 'Deactivate' : 'Activate'}
            </button>
            <button
              type="button"
              onClick={() => onDelete(student)}
              disabled={submitting || deleting}
              className="min-h-tap flex-1 rounded-xl border border-danger/20 text-2xs text-danger hover:bg-danger/10 disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </li>
  )
}
