import { Avatar } from './Avatar'
import type { StaffMember } from '../types'

// Shared row card for both staff lists (active directory, past) — factored
// out so StaffDirectoryPage and PastStaffPage render identical markup
// instead of copy-pasting it, same as StudentCard.
export function StaffCard({
  member,
  isAdmin,
  submitting,
  onEdit,
  onToggleActive,
  onCreateLogin,
  onLinkLogin,
}: {
  member: StaffMember
  isAdmin: boolean
  submitting: boolean
  onEdit?: (member: StaffMember) => void
  onToggleActive: (id: string, currentActive: boolean) => void
  onCreateLogin?: (staffId: string) => void
  onLinkLogin?: (member: StaffMember) => void
}) {
  return (
    <li className="rounded-xl bg-white p-5 shadow-card">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 gap-3">
            <Avatar fullName={member.full_name} avatarUrl={null} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold text-ink">
                {member.full_name}
                {member.profile_id && (
                  <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 align-middle text-2xs font-semibold text-accent-hover">
                    Has login
                  </span>
                )}
              </p>
              {member.job_title && <p className="mt-1 text-sm text-muted">{member.job_title}</p>}
              {member.phone && <p className="mt-1 text-xs text-muted">{member.phone}</p>}
              {member.email && <p className="text-xs text-muted">{member.email}</p>}
            </div>
          </div>
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
