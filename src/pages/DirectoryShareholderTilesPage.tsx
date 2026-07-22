import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { ShareholderCard } from '../components/ShareholderCard'
import { fetchShareholdingsDirectory } from '../lib/shareholdingsApi'
import type { ShareholderDirectoryEntry } from '../lib/shareholdingsApi'
import { getDirectoryPhotoSignedUrl } from '../lib/directoryPhotoApi'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

type LoadState = 'loading' | 'ready' | 'error'

// Photo priority per the spec: linked shareholders show their staff photo
// (falling back to that login's avatar), pure shareholders show their own
// shareholdings.photo_path — initials otherwise. photo_path is a private
// staff-photos path needing a signed URL; avatar_url is already public.
export function resolveShareholderPhotoUrl(
  entry: ShareholderDirectoryEntry,
  signedUrls: Record<string, string | null>,
): string | null {
  if (entry.linked_staff) {
    if (entry.linked_staff.photo_path) return signedUrls[`staff:${entry.linked_staff.id}`] ?? null
    return entry.linked_staff.profile_avatar_url ?? null
  }
  if (entry.photo_path) return signedUrls[`own:${entry.id}`] ?? null
  return null
}

export function DirectoryShareholderTilesPage() {
  const { profile } = useAuth()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [shareholdings, setShareholdings] = useState<ShareholderDirectoryEntry[]>([])
  const [signedUrls, setSignedUrls] = useState<Record<string, string | null>>({})

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    setLoadState('loading')

    withTimeout(fetchShareholdingsDirectory(profile.center_id))
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          setLoadError('Could not load shareholders. Please try again.')
          setLoadState('error')
          return
        }
        setShareholdings(data)
        setLoadState('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(getUserErrorMessage(err))
        setLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [profile])

  useEffect(() => {
    const jobs: Promise<readonly [string, string | null]>[] = []
    for (const sh of shareholdings) {
      if (sh.linked_staff?.photo_path) {
        jobs.push(getDirectoryPhotoSignedUrl(sh.linked_staff.photo_path).then((url) => [`staff:${sh.linked_staff!.id}`, url] as const))
      } else if (!sh.linked_staff && sh.photo_path) {
        jobs.push(getDirectoryPhotoSignedUrl(sh.photo_path).then((url) => [`own:${sh.id}`, url] as const))
      }
    }
    if (jobs.length === 0) return
    let cancelled = false
    Promise.all(jobs).then((entries) => {
      if (cancelled) return
      setSignedUrls((current) => ({ ...current, ...Object.fromEntries(entries) }))
    })
    return () => {
      cancelled = true
    }
  }, [shareholdings])

  if (!profile) return null

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Shareholder" />

        {loadState === 'loading' && <LoadingState label="Loading shareholders…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}
        {loadState === 'ready' && shareholdings.length === 0 && <EmptyState message="No shareholders yet." />}

        {loadState === 'ready' && shareholdings.length > 0 && (
          <ul className="space-y-3">
            {shareholdings.map((sh) => (
              <ShareholderCard key={sh.id} shareholding={sh} photoUrl={resolveShareholderPhotoUrl(sh, signedUrls)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
