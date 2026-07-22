import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { StaffCard } from '../components/StaffCard'
import { fetchStaffMembers, toggleStaffMemberActive } from '../lib/profileApi'
import type { StaffMember } from '../types'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

type LoadState = 'loading' | 'ready' | 'error'

export function PastStaffPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [members, setMembers] = useState<StaffMember[]>([])
  const [submitting, setSubmitting] = useState(false)

  function loadMembers() {
    if (!profile) return
    setLoadState('loading')

    withTimeout(fetchStaffMembers(profile.center_id))
      .then(({ data, error }) => {
        if (error || !data) {
          setLoadError('Could not load past staff. Please try again.')
          setLoadState('error')
          return
        }
        setMembers(data)
        setLoadState('ready')
      })
      .catch((err) => {
        setLoadError(getUserErrorMessage(err))
        setLoadState('error')
      })
  }

  useEffect(() => {
    loadMembers()
  }, [profile])

  async function handleToggleActive(id: string, currentActive: boolean) {
    setSubmitting(true)
    try {
      const { error } = await toggleStaffMemberActive(id, !currentActive)
      if (error) {
        toast.error('Failed to update staff status')
        return
      }
      toast.success(currentActive ? 'Staff member deactivated' : 'Staff member activated')
      loadMembers()
    } finally {
      setSubmitting(false)
    }
  }

  if (!profile) return null

  const pastMembers = members
    .filter((m) => !m.active)
    .sort((a, b) => a.full_name.localeCompare(b.full_name))

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Past Staff" fallback="/staff" />

        {loadState === 'loading' && <LoadingState label="Loading past staff…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && pastMembers.length === 0 && <EmptyState message="No past staff members." />}

        {loadState === 'ready' && pastMembers.length > 0 && (
          <ul className="space-y-3">
            {pastMembers.map((member) => (
              <StaffCard
                key={member.id}
                member={member}
                isAdmin={isAdmin}
                submitting={submitting}
                onToggleActive={handleToggleActive}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
