import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { StaffCard } from '../components/StaffCard'
import { fetchStaffDirectoryMembers, toggleStaffMemberActive } from '../lib/profileApi'
import type { StaffDirectoryMember } from '../lib/profileApi'
import { getDirectoryPhotoSignedUrl } from '../lib/directoryPhotoApi'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

type LoadState = 'loading' | 'ready' | 'error'

export function PastStaffPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [members, setMembers] = useState<StaffDirectoryMember[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string | null>>({})
  const [submitting, setSubmitting] = useState(false)

  function loadMembers() {
    if (!profile) return
    setLoadState('loading')

    withTimeout(fetchStaffDirectoryMembers(profile.center_id, false))
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  const pastMembers = members
    .filter((m) => !m.active)
    .sort((a, b) => a.full_name.localeCompare(b.full_name))

  useEffect(() => {
    const withOwnPhoto = pastMembers.filter((m) => m.photo_path)
    if (withOwnPhoto.length === 0) return
    let cancelled = false

    Promise.all(withOwnPhoto.map(async (m) => [m.id, await getDirectoryPhotoSignedUrl(m.photo_path)] as const)).then(
      (entries) => {
        if (cancelled) return
        setPhotoUrls((current) => ({ ...current, ...Object.fromEntries(entries) }))
      },
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members])

  function resolvePhotoUrl(member: StaffDirectoryMember): string | null {
    return (member.photo_path ? photoUrls[member.id] : undefined) ?? member.linked_avatar_url ?? null
  }

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

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Past Staff" />

        {loadState === 'loading' && <LoadingState label="Loading past staff…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && pastMembers.length === 0 && <EmptyState message="No past staff members." />}

        {loadState === 'ready' && pastMembers.length > 0 && (
          <ul className="space-y-3">
            {pastMembers.map((member) => (
              <StaffCard
                key={member.id}
                member={member}
                photoUrl={resolvePhotoUrl(member)}
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
