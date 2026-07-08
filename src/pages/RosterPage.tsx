import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { TabNav, rosterTabs } from '../components/TabNav'
import { formatDateShort, getWeekStartISO, shiftDateISO, toKLDateISO } from '../lib/helpers'
import { totalSlots } from '../lib/rosterAlgorithm'
import {
  fetchActiveDutyTypes,
  fetchRotationPool,
  fetchWeekAssignments,
  generateWeek,
  swapDutyAssignments,
} from '../lib/rosterApi'
import type { DutyType, RotationPoolMember, DutyAssignmentRow } from '../lib/rosterApi'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

type LoadState = 'loading' | 'ready' | 'error'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

export function RosterPage() {
  const { profile } = useAuth()

  const [weekStart, setWeekStart] = useState(() => getWeekStartISO(toKLDateISO(new Date())))
  const [refreshKey, setRefreshKey] = useState(0)

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dutyTypes, setDutyTypes] = useState<DutyType[]>([])
  const [pool, setPool] = useState<RotationPoolMember[]>([])
  const [assignments, setAssignments] = useState<DutyAssignmentRow[]>([])

  const [generating, setGenerating] = useState(false)
  const [swappingKey, setSwappingKey] = useState<string | null>(null)

  const days = Array.from({ length: 5 }, (_, i) => shiftDateISO(weekStart, i))
  const weekEnd = days[4]

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    setLoadState('loading')

    withTimeout(
      Promise.all([
        fetchActiveDutyTypes(),
        fetchRotationPool(profile.center_id),
        fetchWeekAssignments(weekStart, shiftDateISO(weekStart, 4)),
      ]),
    )
      .then(([dutyTypesRes, poolRes, assignmentsRes]) => {
        if (cancelled) return
        if (
          dutyTypesRes.error || !dutyTypesRes.data ||
          poolRes.error || !poolRes.data ||
          assignmentsRes.error || !assignmentsRes.data
        ) {
          setLoadError('Could not load the roster. Please try again.')
          setLoadState('error')
          return
        }
        setDutyTypes(dutyTypesRes.data)
        setPool(poolRes.data)
        setAssignments(assignmentsRes.data)
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
  }, [profile, weekStart, refreshKey])

  if (!profile) return null

  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin'
  const currentWeekStart = getWeekStartISO(toKLDateISO(new Date()))
  const isCurrentWeek = weekStart === currentWeekStart
  const today = toKLDateISO(new Date())

  const S = totalSlots(dutyTypes)
  const N = pool.length
  const mismatched = S !== N

  function rosterForDate(date: string): DutyAssignmentRow[] {
    return assignments.filter((a) => a.work_date === date)
  }

  function assignmentsFor(date: string, dutyTypeId: string): DutyAssignmentRow[] {
    return rosterForDate(date)
      .filter((a) => a.duty_type_id === dutyTypeId)
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
  }

  async function handleGenerate() {
    if (!profile || mismatched || generating) return
    setGenerating(true)
    try {
      const { error } = await withTimeout(generateWeek(profile.center_id, days))
      setGenerating(false)

      if (error) {
        toast.error(error)
        return
      }
      setRefreshKey((k) => k + 1)
      toast.success('Roster generated')
    } catch (err) {
      setGenerating(false)
      toast.error(getUserErrorMessage(err))
    }
  }

  async function handleSwap(date: string, dutyTypeId: string, currentProfileId: string, newProfileId: string) {
    if (currentProfileId === newProfileId || swappingKey) return
    const otherRow = rosterForDate(date).find((a) => a.profile_id === newProfileId)
    if (!otherRow) return

    const key = `${date}|${dutyTypeId}|${currentProfileId}`
    setSwappingKey(key)
    try {
      const { error } = await withTimeout(swapDutyAssignments(date, currentProfileId, newProfileId))
      setSwappingKey(null)

      if (error) {
        toast.error('Could not update the roster. Please try again.')
        return
      }
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setSwappingKey(null)
      toast.error(getUserErrorMessage(err))
    }
  }

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <PageHeader title="Duty Roster" fallback="/" />

        <TabNav tabs={rosterTabs(isAdmin)} />

        <div className="flex items-center justify-between rounded-xl bg-white p-3 shadow-card">
          <button
            type="button"
            onClick={() => setWeekStart((w) => shiftDateISO(w, -7))}
            aria-label="Previous week"
            className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-muted hover:bg-accent-soft/60 hover:text-ink"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="text-center">
            <p className="font-semibold text-ink">
              {formatDateShort(weekStart)} - {formatDateShort(weekEnd)}
            </p>
            {!isCurrentWeek && (
              <button
                type="button"
                onClick={() => setWeekStart(currentWeekStart)}
                className="text-xs text-accent hover:underline"
              >
                Back to this week
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setWeekStart((w) => shiftDateISO(w, 7))}
            aria-label="Next week"
            className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-muted hover:bg-accent-soft/60 hover:text-ink"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {isAdmin && mismatched && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            Duty slots ({S}) must equal ticked staff ({N}). Adjust headcount or ticked staff.
          </div>
        )}

        {isAdmin && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={mismatched || generating}
            className="min-h-tap w-full rounded-xl bg-accent font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-50"
          >
            {generating ? 'Generating…' : 'Generate this week'}
          </button>
        )}

        {loadState === 'loading' && <LoadingState label="Loading the roster…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && dutyTypes.length === 0 && (
          <EmptyState message="No active duty types configured yet." />
        )}

        {loadState === 'ready' && dutyTypes.length > 0 && (
          <div className="rounded-xl bg-white shadow-card overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-3 text-left font-semibold text-2xs uppercase tracking-wider text-muted">
                    Duty
                  </th>
                  {days.map((day, i) => {
                    const isToday = isCurrentWeek && day === today
                    return (
                      <th
                        key={day}
                        className={`px-2 py-3 text-center font-semibold text-2xs text-muted ${
                          isToday ? 'bg-accent-soft' : ''
                        }`}
                      >
                        <div className={isToday ? 'font-bold text-accent-hover' : ''}>{WEEKDAY_LABELS[i]}</div>
                        <div className="text-2xs font-normal text-muted/70">{formatDateShort(day)}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {dutyTypes.map((dutyType) => (
                  <tr key={dutyType.id} className="border-t border-line">
                    <td className="px-3 py-3 font-semibold text-ink">{dutyType.name}</td>
                    {days.map((day) => {
                      const rows = assignmentsFor(day, dutyType.id)
                      const isToday = isCurrentWeek && day === today

                      return (
                        <td key={day} className={`px-2 py-3 text-center align-top ${isToday ? 'bg-accent-soft' : ''}`}>
                          {rows.length === 0 ? (
                            <span className="text-muted">—</span>
                          ) : isAdmin ? (
                            <div className="space-y-1">
                              {rows.map((row) => {
                                const key = `${day}|${dutyType.id}|${row.profile_id}`
                                return (
                                  <select
                                    key={row.id}
                                    value={row.profile_id}
                                    onChange={(e) => handleSwap(day, dutyType.id, row.profile_id, e.target.value)}
                                    disabled={swappingKey === key}
                                    title={row.is_manual ? 'Manually assigned' : undefined}
                                    className={`w-full rounded-lg border px-1 py-1 text-2xs disabled:opacity-50 ${
                                      row.is_manual ? 'border-accent/40 bg-accent-soft/40' : 'border-line bg-white'
                                    }`}
                                  >
                                    {rosterForDate(day).map((person) => (
                                      <option key={person.profile_id} value={person.profile_id}>
                                        {person.full_name}
                                      </option>
                                    ))}
                                  </select>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              {rows.map((row) => (
                                <p key={row.id} className="text-ink">
                                  {row.full_name}
                                </p>
                              ))}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
