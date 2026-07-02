import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Avatar } from '../components/Avatar'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { BackButton } from '../components/BackButton'
import { fetchStaffDirectory } from '../lib/profileApi'
import type { StaffDirectoryEntry } from '../lib/profileApi'
import type { UserRole } from '../types'

type LoadState = 'loading' | 'ready' | 'error'

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  teacher: 'Teacher',
  staff: 'Staff',
  parent: 'Parent',
  shareholder: 'Shareholder',
}

const ROLE_STYLES: Record<UserRole, string> = {
  super_admin: 'bg-brand-100 text-brand-700',
  admin: 'bg-brand-50 text-brand-600',
  teacher: 'bg-sage-100 text-sage-700',
  staff: 'bg-sky-100 text-sky-700',
  parent: 'bg-cream-200 text-neutral-700',
  shareholder: 'bg-neutral-100 text-neutral-600',
}

export function StaffDirectoryPage() {
  const { profile } = useAuth()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [members, setMembers] = useState<StaffDirectoryEntry[]>([])

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    setLoadState('loading')

    fetchStaffDirectory(profile.center_id).then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) {
        setLoadError('Could not load the staff directory. Please try again.')
        setLoadState('error')
        return
      }
      setMembers(data)
      setLoadState('ready')
    })

    return () => {
      cancelled = true
    }
  }, [profile])

  if (!profile) return null

  return (
    <div className="min-h-screen bg-cream-100 p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          <BackButton fallback="/" />
          <h1 className="font-display text-2xl text-neutral-800">Staff Directory</h1>
        </div>

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
                  className="flex cursor-pointer items-center gap-4 rounded-3xl bg-white p-4 shadow-card transition-shadow hover:shadow-card-md"
                >
                  <Avatar fullName={member.full_name} avatarUrl={member.avatar_url} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-bold text-neutral-800">
                      {member.full_name}
                    </p>
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-2xs font-medium ${ROLE_STYLES[member.role]}`}
                    >
                      {ROLE_LABELS[member.role]}
                    </span>
                    {member.phone && <p className="mt-1 text-xs text-neutral-500">{member.phone}</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
