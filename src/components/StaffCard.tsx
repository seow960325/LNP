import { Link } from 'react-router-dom'
import { Avatar } from './Avatar'
import type { StaffDirectoryMember } from '../lib/profileApi'

function LoginBadge({ profileId, mustChangePassword }: { profileId: string | null; mustChangePassword: boolean | null }) {
  if (!profileId) return null
  if (mustChangePassword) {
    return (
      <span className="ml-2 rounded-full bg-line/70 px-2 py-0.5 align-middle text-2xs font-semibold text-muted">
        Invited
      </span>
    )
  }
  return (
    <span className="ml-2 rounded-full bg-cyan-100 px-2 py-0.5 align-middle text-2xs font-semibold text-cyan-700">
      Registered
    </span>
  )
}

// Shared row card for both staff lists (active directory, past) — factored
// out so the job-title member list and PastStaffPage render identical
// markup instead of copy-pasting it, same as StudentCard. Clicking the
// name/photo area opens the staff profile (/staff/:id); the admin action
// row underneath stays inline, unchanged from before.
export function StaffCard({
  member,
  photoUrl,
  isAdmin,
  submitting,
  onEdit,
  onToggleActive,
  onCreateLogin,
  onLinkLogin,
}: {
  member: StaffDirectoryMember
  photoUrl: string | null
  isAdmin: boolean
  submitting: boolean
  onEdit?: (member: StaffDirectoryMember) => void
  onToggleActive: (id: string, currentActive: boolean) => void
  onCreateLogin?: (staffId: string) => void
  onLinkLogin?: (member: StaffDirectoryMember) => void
}) {
  return (
    <li className="rounded-xl bg-white p-5 shadow-card">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <Link to={`/staff/${member.id}`} className="flex min-w-0 flex-1 gap-3">
            <Avatar fullName={member.display_name || member.full_name} avatarUrl={photoUrl} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold text-ink">
                {member.full_name || member.display_name}
                <LoginBadge profileId={member.profile_id} mustChangePassword={member.must_change_password} />
              </p>
              {member.job_title_name && <p className="mt-1 text-sm text-muted">{member.job_title_name}</p>}
              {member.phone && <p className="mt-1 text-xs text-muted">{member.phone}</p>}
              {member.email && <p className="text-xs text-muted">{member.email}</p>}
            </div>
          </Link>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap gap-2 pt-2">
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(member)}
                disabled={submitting}
                className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
              >
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={() => onToggleActive(member.id, member.active)}
              disabled={submitting}
              className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
            >
              {member.active ? 'Deactivate' : 'Activate'}
            </button>
            {!member.profile_id && onCreateLogin && onLinkLogin && (
              <>
                <button
                  type="button"
                  onClick={() => onCreateLogin(member.id)}
                  disabled={submitting}
                  className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
                >
                  Create login
                </button>
                <button
                  type="button"
                  onClick={() => onLinkLogin(member)}
                  disabled={submitting}
                  className="min-h-tap flex-1 rounded-xl border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
                >
                  Link login
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </li>
  )
}
