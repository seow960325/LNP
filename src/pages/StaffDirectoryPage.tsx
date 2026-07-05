import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Avatar } from '../components/Avatar'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { TabNav, directoryTabs } from '../components/TabNav'
import { RegisterStaffForm, TempPasswordModal } from '../components/RegisterStaffForm'
import { fetchStaffDirectory } from '../lib/profileApi'
import type { StaffDirectoryEntry } from '../lib/profileApi'
import type { UserRole } from '../types'

type LoadState = 'loading' | 'ready' | 'error'

const ROLE_STYLES: Record<UserRole, string> = {
  super_admin: 'bg-accent-soft text-accent-hover',
  admin: 'bg-accent-soft text-accent-hover',
  teacher: 'bg-success-soft text-success',
  staff: 'bg-line/60 text-muted',
  parent: 'bg-line/60 text-muted',
  shareholder: 'bg-line/60 text-muted',
}

export function StaffDirectoryPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [members, setMembers] = useState<StaffDirectoryEntry[]>([])

  const [showRegisterForm, setShowRegisterForm] = useState(false)
  const [newTempPassword, setNewTempPassword] = useState<string | null>(null)

  function loadMembers() {
    if (!profile) return
    setLoadState('loading')
    fetchStaffDirectory(profile.center_id).then(({ data, error }) => {
      if (error || !data) {
        setLoadError('Could not load the staff directory. Please try again.')
        setLoadState('error')
        return
      }
      setMembers(data)
      setLoadState('ready')
    })
  }

  useEffect(() => {
    loadMembers()
  }, [profile])

  if (!profile) return null

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Staff Directory" fallback="/" />

        <TabNav tabs={directoryTabs(isAdmin)} />

        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowRegisterForm((open) => !open)}
            className="min-h-tap w-full rounded-xl border border-accent/30 bg-white font-semibold text-sm text-accent-hover shadow-card hover:bg-accent-soft"
          >
            {showRegisterForm ? 'Cancel' : '+ Add staff'}
          </button>
        )}

        {isAdmin && showRegisterForm && (
          <RegisterStaffForm
            callerRole={profile.role}
            onCreated={(tempPassword) => {
              setShowRegisterForm(false)
              setNewTempPassword(tempPassword)
              loadMembers()
            }}
          />
        )}

        {loadState === 'loading' && <LoadingState label="Loading the directory…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && members.length === 0 && (
          <EmptyState message="No active members in this center yet." />
        )}

        {loadState === 'ready' && members.length > 0 && (
          <ul className="space-y-3">
            {members.map((member) => (
              <li key={member.id}>
                <Link
                  to={`/staff/${member.id}`}
                  className="flex cursor-pointer items-center gap-4 rounded-xl bg-white p-4 shadow-card hover:shadow-card-md motion-safe:hover:-translate-y-0.5"
                >
                  <Avatar fullName={member.full_name} avatarUrl={member.avatar_url} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold text-ink">
                      {member.full_name}
                    </p>
                    <span
                      className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-2xs font-semibold ${ROLE_STYLES[member.role]}`}
                    >
                      {member.title || 'Staff'}
                    </span>
                    {member.phone && <p className="mt-1 text-xs text-muted">{member.phone}</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {newTempPassword && (
        <TempPasswordModal
          password={newTempPassword}
          description="Give this temporary password to the new staff member. They must set a new password on first login."
          onClose={() => setNewTempPassword(null)}
        />
      )}
    </div>
  )
}
