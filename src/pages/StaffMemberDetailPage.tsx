import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Avatar } from '../components/Avatar'
import { LoadingState, ErrorState } from '../components/AsyncState'
import { BackButton } from '../components/BackButton'
import { StaffDocPanel } from '../components/StaffDocPanel'
import { fetchProfileById } from '../lib/profileApi'
import type { Profile, UserRole } from '../types'

type LoadState = 'loading' | 'ready' | 'error'

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  teacher: 'Teacher',
  staff: 'Staff',
  parent: 'Parent',
  shareholder: 'Shareholder',
}

export function StaffMemberDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [member, setMember] = useState<Profile | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoadState('loading')

    fetchProfileById(id).then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) {
        setLoadError('Could not load this staff member. Please try again.')
        setLoadState('error')
        return
      }
      setMember(data)
      setLoadState('ready')
    })

    return () => {
      cancelled = true
    }
  }, [id])

  if (!profile || !id) return null

  return (
    <div className="min-h-screen bg-cream-100 p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          <BackButton fallback="/staff" />
          <h1 className="font-display text-2xl text-neutral-800">Staff Member</h1>
        </div>

        {loadState === 'loading' && <LoadingState label="Loading…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && member && (
          <>
            <div className="flex items-center gap-4 rounded-3xl bg-white p-4 shadow-card">
              <Avatar fullName={member.full_name} avatarUrl={member.avatar_url} size="xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg font-bold text-neutral-800">
                  {member.full_name}
                </p>
                <p className="text-sm text-neutral-500">{ROLE_LABELS[member.role]}</p>
                {member.email && <p className="mt-1 truncate text-xs text-neutral-500">{member.email}</p>}
                {member.phone && <p className="text-xs text-neutral-500">{member.phone}</p>}
              </div>
            </div>

            {isAdmin && <StaffDocPanel ownerId={id} canManage={true} />}
            {!isAdmin && id === profile.id && <StaffDocPanel ownerId={id} canManage={false} />}
          </>
        )}
      </div>
    </div>
  )
}
