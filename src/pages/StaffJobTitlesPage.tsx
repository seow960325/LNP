import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { fetchJobTitles } from '../lib/jobTitlesApi'
import { fetchStaffDirectoryMembers } from '../lib/profileApi'
import type { JobTitle } from '../types'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

type LoadState = 'loading' | 'ready' | 'error'

interface Tile {
  id: string // job_titles.id, or the literal 'unassigned'
  name: string
  active: boolean
  count: number
}

export function StaffJobTitlesPage() {
  const { profile } = useAuth()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tiles, setTiles] = useState<Tile[]>([])

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    setLoadState('loading')

    withTimeout(Promise.all([fetchJobTitles(profile.center_id), fetchStaffDirectoryMembers(profile.center_id, true)]))
      .then(([jobTitlesRes, membersRes]) => {
        if (cancelled) return
        if (jobTitlesRes.error || !jobTitlesRes.data || membersRes.error || !membersRes.data) {
          setLoadError('Could not load the staff directory. Please try again.')
          setLoadState('error')
          return
        }

        const counts = new Map<string, number>()
        let unassignedCount = 0
        for (const member of membersRes.data) {
          if (member.job_title_id) {
            counts.set(member.job_title_id, (counts.get(member.job_title_id) ?? 0) + 1)
          } else {
            unassignedCount += 1
          }
        }

        const jobTitleTiles: Tile[] = (jobTitlesRes.data as JobTitle[]).map((jt) => ({
          id: jt.id,
          name: jt.name,
          active: jt.active,
          count: counts.get(jt.id) ?? 0,
        }))

        setTiles(
          unassignedCount > 0
            ? [...jobTitleTiles, { id: 'unassigned', name: 'Unassigned', active: true, count: unassignedCount }]
            : jobTitleTiles,
        )
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

  if (!profile) return null

  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin'

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Staff">
          {isAdmin && (
            <Link to="/job-titles" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
              <Settings className="h-3 w-3" aria-hidden="true" />
              Manage titles
            </Link>
          )}
        </PageHeader>

        {loadState === 'loading' && <LoadingState label="Loading staff…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && tiles.length === 0 && (
          <EmptyState message="No job titles set up yet. Ask an admin to add one." />
        )}

        {loadState === 'ready' && tiles.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {tiles.map((tile) => (
              <Link
                key={tile.id}
                to={`/directory/staff/${tile.id}`}
                className={`flex min-h-[110px] flex-col items-center justify-center gap-1 rounded-2xl p-4 text-center shadow-card transition-colors ${
                  tile.active ? 'bg-white hover:bg-accent-soft/40' : 'bg-line/30 hover:bg-line/40'
                }`}
              >
                <span className={`text-base font-bold ${tile.active ? 'text-ink' : 'text-muted'}`}>{tile.name}</span>
                {!tile.active && (
                  <span className="rounded-full bg-line/60 px-2 py-0.5 text-2xs font-semibold text-muted">Inactive</span>
                )}
                <span className="text-2xs tabular-nums text-muted">
                  {tile.count} staff member{tile.count === 1 ? '' : 's'}
                </span>
              </Link>
            ))}
          </div>
        )}

        <Link
          to="/staff/past"
          className="flex min-h-tap items-center justify-center rounded-xl border border-line bg-white text-sm font-semibold text-muted shadow-card hover:bg-cream"
        >
          View past staff
        </Link>
      </div>
    </div>
  )
}
