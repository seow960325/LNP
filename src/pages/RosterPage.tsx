import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { BackButton } from '../components/BackButton'
import { formatDateShort, getWeekStartISO, shiftDateISO, toKLDateISO } from '../lib/helpers'
import { fetchCenterMembers } from '../lib/kudosApi'
import type { CenterMember } from '../lib/kudosApi'
import { fetchWeekShifts, addShift, removeShift } from '../lib/rosterApi'
import type { RosterShiftRow } from '../lib/rosterApi'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type LoadState = 'loading' | 'ready' | 'error'

export function RosterPage() {
  const { profile } = useAuth()

  const [weekStart, setWeekStart] = useState(() => getWeekStartISO(toKLDateISO(new Date())))
  const [refreshKey, setRefreshKey] = useState(0)

  const [membersState, setMembersState] = useState<LoadState>('loading')
  const [members, setMembers] = useState<CenterMember[]>([])
  const [membersError, setMembersError] = useState<string | null>(null)

  const [shiftsState, setShiftsState] = useState<LoadState>('loading')
  const [shifts, setShifts] = useState<RosterShiftRow[]>([])
  const [shiftsError, setShiftsError] = useState<string | null>(null)

  const [togglingKey, setTogglingKey] = useState<string | null>(null)
  const [mutateError, setMutateError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    setMembersState('loading')

    fetchCenterMembers(profile.center_id).then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) {
        setMembersError('Could not load center members. Please try again.')
        setMembersState('error')
        return
      }
      setMembers(data)
      setMembersState('ready')
    })

    return () => {
      cancelled = true
    }
  }, [profile])

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    setShiftsState('loading')

    fetchWeekShifts(profile.center_id, weekStart).then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) {
        setShiftsError('Could not load the roster. Please try again.')
        setShiftsState('error')
        return
      }
      setShifts(data)
      setShiftsState('ready')
    })

    return () => {
      cancelled = true
    }
  }, [profile, weekStart, refreshKey])

  if (!profile) return null

  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin'
  const days = Array.from({ length: 6 }, (_, i) => shiftDateISO(weekStart, i))
  const currentWeekStart = getWeekStartISO(toKLDateISO(new Date()))
  const isCurrentWeek = weekStart === currentWeekStart
  const shiftMap = new Map(shifts.map((s) => [`${s.user_id}|${s.date}`, s]))

  async function handleToggle(userId: string, date: string) {
    if (!profile || !isAdmin || togglingKey) return
    const key = `${userId}|${date}`
    const existing = shiftMap.get(key)
    setMutateError(null)
    setTogglingKey(key)

    if (existing) {
      setShifts((prev) => prev.filter((s) => s.id !== existing.id))
      const { error } = await removeShift(existing.id)
      setTogglingKey(null)
      if (error) {
        setMutateError('Could not update the roster. Please try again.')
        setShifts((prev) => [...prev, existing])
        return
      }
      setRefreshKey((k) => k + 1)
    } else {
      const tempId = `temp-${userId}-${date}`
      setShifts((prev) => [...prev, { id: tempId, user_id: userId, date }])
      const { error } = await addShift(profile.center_id, userId, date)
      setTogglingKey(null)
      if (error) {
        setMutateError('Could not update the roster. Please try again.')
        setShifts((prev) => prev.filter((s) => s.id !== tempId))
        return
      }
      setRefreshKey((k) => k + 1)
    }
  }

  return (
    <div className="min-h-screen bg-cream-100 p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          <BackButton fallback="/" />
          <h1 className="font-display text-2xl text-neutral-800">Duty Roster</h1>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-card">
          <button
            type="button"
            onClick={() => setWeekStart((w) => shiftDateISO(w, -7))}
            aria-label="Previous week"
            className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-neutral-500 hover:text-neutral-700"
          >
            ←
          </button>
          <div className="text-center">
            <p className="font-display text-neutral-800">
              {formatDateShort(weekStart)} - {formatDateShort(shiftDateISO(weekStart, 5))}
            </p>
            {!isCurrentWeek && (
              <button
                type="button"
                onClick={() => setWeekStart(currentWeekStart)}
                className="text-xs text-brand-600 hover:underline"
              >
                This week
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setWeekStart((w) => shiftDateISO(w, 7))}
            aria-label="Next week"
            className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-neutral-500 hover:text-neutral-700"
          >
            →
          </button>
        </div>

        {mutateError && <ErrorState message={mutateError} />}

        {(membersState === 'loading' || shiftsState === 'loading') && <LoadingState label="Loading the roster…" />}

        {membersState === 'error' && <ErrorState message={membersError ?? 'Something went wrong.'} />}

        {membersState === 'ready' && shiftsState === 'error' && (
          <ErrorState message={shiftsError ?? 'Something went wrong.'} />
        )}

        {membersState === 'ready' && shiftsState === 'ready' && members.length === 0 && (
          <EmptyState message="No active members in this center yet." />
        )}

        {membersState === 'ready' && shiftsState === 'ready' && members.length > 0 && (
          <div className="overflow-x-auto rounded-2xl bg-white shadow-card">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[120px] bg-white px-3 py-2 text-left font-display text-xs text-neutral-500">
                    Member
                  </th>
                  {days.map((day, i) => (
                    <th key={day} className="px-2 py-2 text-center font-display text-xs text-neutral-500">
                      <div>{WEEKDAY_LABELS[i]}</div>
                      <div className="text-2xs font-normal text-neutral-400">{formatDateShort(day)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className="border-t border-neutral-100">
                    <td className="sticky left-0 z-10 min-w-[120px] bg-white px-3 py-2 font-display text-sm text-neutral-800">
                      {member.full_name}
                    </td>
                    {days.map((day) => {
                      const key = `${member.id}|${day}`
                      const isOn = shiftMap.has(key)
                      const label = `${member.full_name}, ${formatDateShort(day)}`

                      if (!isAdmin) {
                        return (
                          <td key={day} className="px-2 py-2 text-center">
                            <div
                              role="img"
                              aria-label={isOn ? `${label}: on duty` : `${label}: off`}
                              className={`mx-auto h-3 w-3 rounded-full ${
                                isOn ? 'bg-brand-600' : 'border border-neutral-200'
                              }`}
                            />
                          </td>
                        )
                      }

                      return (
                        <td key={day} className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggle(member.id, day)}
                            disabled={togglingKey === key}
                            aria-label={isOn ? `Remove ${label}` : `Add ${label}`}
                            aria-pressed={isOn}
                            className="mx-auto flex min-h-tap min-w-tap items-center justify-center rounded-full disabled:opacity-50"
                          >
                            <span
                              className={`h-3 w-3 rounded-full ${isOn ? 'bg-brand-600' : 'border border-neutral-200'}`}
                            />
                          </button>
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
