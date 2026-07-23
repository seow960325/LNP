import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { fetchClassTileCounts } from '../lib/billingApi'
import type { ClassTile } from '../lib/billingApi'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

type LoadState = 'loading' | 'ready' | 'error'

export function StudentClassesPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tiles, setTiles] = useState<ClassTile[]>([])
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!profile) return
    setLoadState('loading')

    withTimeout(fetchClassTileCounts(profile.center_id))
      .then(({ data, error }) => {
        if (error || !data) {
          setLoadError('Could not load classes. Please try again.')
          setLoadState('error')
          return
        }
        setTiles(data)
        setLoadState('ready')
      })
      .catch((err) => {
        setLoadError(getUserErrorMessage(err))
        setLoadState('error')
      })
  }, [profile, retryKey])

  if (!profile) return null

  const realTiles = tiles.filter((t) => t.id !== 'unassigned')
  const unassignedTile = tiles.find((t) => t.id === 'unassigned')
  const noClassesAtAll = realTiles.length === 0 && (unassignedTile?.active_student_count ?? 0) === 0

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Students">
          {isAdmin && (
            <Link to="/classes" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
              <Settings className="h-3 w-3" aria-hidden="true" />
              Manage classes
            </Link>
          )}
        </PageHeader>

        {loadState === 'loading' && <LoadingState label="Loading classes…" />}
        {loadState === 'error' && (
          <ErrorState message={loadError ?? 'Something went wrong.'} onRetry={() => setRetryKey((k) => k + 1)} />
        )}

        {loadState === 'ready' && noClassesAtAll && (
          <EmptyState message="No classes set up yet. Ask an admin to add one." />
        )}

        {loadState === 'ready' && !noClassesAtAll && (
          <div className="grid grid-cols-2 gap-3">
            {[...realTiles, ...(unassignedTile ? [unassignedTile] : [])].map((tile) => (
              <Link
                key={tile.id}
                to={`/students/class/${tile.id}`}
                className={`flex min-h-[110px] flex-col items-center justify-center gap-1 rounded-2xl p-4 text-center shadow-card transition-colors ${
                  tile.active ? 'bg-white hover:bg-accent-soft/40' : 'bg-line/30 hover:bg-line/40'
                }`}
              >
                <span className={`text-base font-bold ${tile.active ? 'text-ink' : 'text-muted'}`}>{tile.name}</span>
                {!tile.active && (
                  <span className="rounded-full bg-line/60 px-2 py-0.5 text-2xs font-semibold text-muted">Inactive</span>
                )}
                <span className="text-2xs tabular-nums text-muted">
                  {tile.active_student_count} student{tile.active_student_count === 1 ? '' : 's'}
                </span>
              </Link>
            ))}
          </div>
        )}

        <Link
          to="/students/past"
          className="flex min-h-tap items-center justify-center rounded-xl border border-line bg-white text-sm font-semibold text-muted shadow-card hover:bg-cream"
        >
          View past students
        </Link>
      </div>
    </div>
  )
}
