import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { TabNav, rosterTabs } from '../components/TabNav'
import { formatDateShort, getWeekStartISO, shiftDateISO, staffLabel, toKLDateISO } from '../lib/helpers'
import { totalSlots } from '../lib/rosterAlgorithm'
import {
  fetchActiveDutyTypes,
  fetchActiveStaffMembers,
  fetchRotationPool,
  fetchWeekAssignments,
  generateWeek,
  reassignDutyCell,
} from '../lib/rosterApi'
import type { DutyType, RotationPoolMember, DutyAssignmentRow, RosterStaffOption } from '../lib/rosterApi'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

type LoadState = 'loading' | 'ready' | 'error'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

// Rough popover height (header + a couple of rows) used only to decide
// whether it should flip upward — the real, precise limit is maxListHeight,
// computed from actual available space at open time.
const POPOVER_HEIGHT_ESTIMATE = 260
const POPOVER_MARGIN = 8

// Which cell's picker is currently open — at most one at a time.
// assignmentId is null for an empty slot (the picker will insert instead of
// update); currentStaffId is null for the same reason. anchor* are captured
// from the clicked chip's bounding rect at open time (viewport-relative, so
// they plug straight into a position:fixed popover with no scroll-offset
// math) — this is a one-shot snapshot, not reactively tracked, which is fine
// for a popover that's closed on any outside click anyway.
interface OpenPicker {
  date: string
  dutyTypeId: string
  assignmentId: string | null
  currentStaffId: string | null
  anchorLeft: number
  anchorTop: number
  anchorBottom: number
  openUp: boolean
  maxListHeight: number
}

export function RosterPage() {
  const { profile } = useAuth()

  const [weekStart, setWeekStart] = useState(() => getWeekStartISO(toKLDateISO(new Date())))
  const [refreshKey, setRefreshKey] = useState(0)

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dutyTypes, setDutyTypes] = useState<DutyType[]>([])
  const [pool, setPool] = useState<RotationPoolMember[]>([])
  const [activeStaff, setActiveStaff] = useState<RosterStaffOption[]>([])
  const [assignments, setAssignments] = useState<DutyAssignmentRow[]>([])

  const [generating, setGenerating] = useState(false)
  const [picker, setPicker] = useState<OpenPicker | null>(null)
  const [reassigning, setReassigning] = useState(false)

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
        fetchActiveStaffMembers(profile.center_id),
        fetchWeekAssignments(weekStart, shiftDateISO(weekStart, 4)),
      ]),
    )
      .then(([dutyTypesRes, poolRes, activeStaffRes, assignmentsRes]) => {
        if (cancelled) return
        if (
          dutyTypesRes.error || !dutyTypesRes.data ||
          poolRes.error || !poolRes.data ||
          activeStaffRes.error || !activeStaffRes.data ||
          assignmentsRes.error || !assignmentsRes.data
        ) {
          setLoadError('Could not load the roster. Please try again.')
          setLoadState('error')
          return
        }
        setDutyTypes(dutyTypesRes.data)
        setPool(poolRes.data)
        setActiveStaff(activeStaffRes.data)
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

  // Pool members first (subtle marker in the picker), then alphabetical.
  const sortedActiveStaff = [...activeStaff].sort(
    (a, b) => Number(b.in_duty_roster) - Number(a.in_duty_roster) || a.full_name.localeCompare(b.full_name),
  )

  function openPickerFor(
    e: React.MouseEvent<HTMLButtonElement>,
    date: string,
    dutyTypeId: string,
    assignmentId: string | null,
    currentStaffId: string | null,
  ) {
    const rect = e.currentTarget.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const openUp = spaceBelow < POPOVER_HEIGHT_ESTIMATE && spaceAbove > spaceBelow
    const available = (openUp ? spaceAbove : spaceBelow) - POPOVER_MARGIN * 2
    // ~32px for the "Assign staff" header above the scrollable list.
    const maxListHeight = Math.max(120, available - 32)

    setPicker({
      date,
      dutyTypeId,
      assignmentId,
      currentStaffId,
      anchorLeft: rect.left + rect.width / 2,
      anchorTop: rect.top,
      anchorBottom: rect.bottom,
      openUp,
      maxListHeight,
    })
  }

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

  async function handleReassignCell(newStaffId: string) {
    if (!profile || !picker || reassigning) return
    setReassigning(true)
    try {
      const { data, error } = await withTimeout(
        reassignDutyCell({
          assignmentId: picker.assignmentId,
          workDate: picker.date,
          dutyTypeId: picker.dutyTypeId,
          centerId: profile.center_id,
          staffMemberId: newStaffId,
        }),
      )
      setReassigning(false)

      if (error) {
        if (error.code === '23505') {
          const person = activeStaff.find((s) => s.id === newStaffId)
          toast.error(`${person?.full_name ?? 'This person'} is already on duty this day — free their other slot first.`)
        } else {
          toast.error('Could not update the roster. Please try again.')
        }
        return
      }

      const chosen = activeStaff.find((s) => s.id === newStaffId)
      const openedPicker = picker
      setAssignments((current) => {
        if (openedPicker.assignmentId) {
          return current.map((a) =>
            a.id === openedPicker.assignmentId
              ? {
                  ...a,
                  staff_member_id: newStaffId,
                  is_manual: true,
                  full_name: chosen?.full_name ?? a.full_name,
                  display_name: chosen?.display_name ?? null,
                }
              : a,
          )
        }
        if (!data) return current
        return [
          ...current,
          {
            id: data.id,
            work_date: openedPicker.date,
            duty_type_id: openedPicker.dutyTypeId,
            staff_member_id: newStaffId,
            is_manual: true,
            full_name: chosen?.full_name ?? 'Unknown',
            display_name: chosen?.display_name ?? null,
          },
        ]
      })
      setPicker(null)
    } catch (err) {
      setReassigning(false)
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
          <div className="rounded-xl bg-white shadow-card">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-3 text-left font-semibold text-2xs uppercase tracking-wider text-muted">
                    Day
                  </th>
                  {dutyTypes.map((dutyType) => (
                    <th
                      key={dutyType.id}
                      className="px-2 py-3 text-center font-semibold text-2xs uppercase tracking-wider text-muted"
                    >
                      {dutyType.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((day, i) => {
                  const isToday = isCurrentWeek && day === today
                  return (
                    <tr key={day} className={`border-t border-line ${isToday ? 'bg-accent-soft' : ''}`}>
                      <td className="px-3 py-3 align-top">
                        <div className={`font-semibold ${isToday ? 'text-accent-hover' : 'text-ink'}`}>
                          {WEEKDAY_LABELS[i]}
                        </div>
                        <div className="text-2xs text-muted/70">{formatDateShort(day)}</div>
                      </td>
                      {dutyTypes.map((dutyType) => {
                        const rows = assignmentsFor(day, dutyType.id)
                        const cellOpen = picker && picker.date === day && picker.dutyTypeId === dutyType.id
                        const assignedIdsThisDate = new Set(rosterForDate(day).map((a) => a.staff_member_id))

                        return (
                          <td key={dutyType.id} className="relative px-2 py-3 text-center align-top">
                            <div className="flex flex-wrap justify-center gap-1">
                              {rows.length === 0 && !isAdmin && <span className="text-muted">—</span>}

                              {rows.length === 0 && isAdmin && (
                                <button
                                  type="button"
                                  onClick={(e) => openPickerFor(e, day, dutyType.id, null, null)}
                                  aria-label={`Assign ${dutyType.name}`}
                                  className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-line text-muted hover:bg-accent-soft/40"
                                >
                                  +
                                </button>
                              )}

                              {rows.map((row) =>
                                isAdmin ? (
                                  <button
                                    key={row.id}
                                    type="button"
                                    title={row.full_name}
                                    aria-label={row.full_name}
                                    onClick={(e) => openPickerFor(e, day, dutyType.id, row.id, row.staff_member_id)}
                                    className={`flex h-7 w-9 items-center justify-center rounded-full text-2xs font-semibold hover:brightness-95 ${
                                      row.is_manual ? 'bg-accent-soft text-accent-hover ring-1 ring-accent/40' : 'bg-accent-soft text-accent-hover'
                                    }`}
                                  >
                                    {staffLabel(row)}
                                  </button>
                                ) : (
                                  <span
                                    key={row.id}
                                    title={row.full_name}
                                    aria-label={row.full_name}
                                    className="flex h-7 w-9 items-center justify-center rounded-full bg-accent-soft text-2xs font-semibold text-accent-hover"
                                  >
                                    {staffLabel(row)}
                                  </span>
                                ),
                              )}
                            </div>

                            {cellOpen &&
                              picker &&
                              createPortal(
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setPicker(null)} />
                                  <div
                                    className="fixed z-50 w-56 -translate-x-1/2 rounded-xl border border-line bg-white p-2 text-left shadow-card-lg"
                                    style={{
                                      left: picker.anchorLeft,
                                      ...(picker.openUp
                                        ? { bottom: window.innerHeight - picker.anchorTop + POPOVER_MARGIN }
                                        : { top: picker.anchorBottom + POPOVER_MARGIN }),
                                    }}
                                  >
                                    <p className="px-1 pb-1 text-2xs font-semibold uppercase tracking-wide text-muted">
                                      Assign staff
                                    </p>
                                    <ul
                                      className="space-y-0.5 overflow-y-auto"
                                      style={{ maxHeight: picker.maxListHeight }}
                                    >
                                      {sortedActiveStaff.map((s) => {
                                        const conflict = assignedIdsThisDate.has(s.id) && s.id !== picker.currentStaffId
                                        return (
                                          <li key={s.id}>
                                            <button
                                              type="button"
                                              disabled={reassigning}
                                              onClick={() => handleReassignCell(s.id)}
                                              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-cream disabled:opacity-50 ${
                                                conflict ? 'opacity-50' : ''
                                              }`}
                                            >
                                              <span
                                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.in_duty_roster ? 'bg-accent' : 'bg-transparent'}`}
                                                aria-hidden="true"
                                              />
                                              <span className="flex h-6 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-2xs font-semibold text-accent-hover">
                                                {staffLabel(s)}
                                              </span>
                                              <span className="min-w-0 flex-1 truncate text-ink">{s.full_name}</span>
                                              {conflict && (
                                                <span className="shrink-0 text-2xs text-muted">on duty this day</span>
                                              )}
                                            </button>
                                          </li>
                                        )
                                      })}
                                    </ul>
                                  </div>
                                </>,
                                document.body,
                              )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
