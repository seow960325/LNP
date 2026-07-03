import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { BackButton } from '../components/BackButton'
import { formatDate, formatTimeKL, klDateTimeToISO, shiftDateISO, toKLDateISO } from '../lib/helpers'
import { fetchDayAttendanceForCenter, adminUpsertAttendance } from '../lib/attendanceApi'
import type { MemberAttendance } from '../lib/attendanceApi'

type LoadState = 'loading' | 'ready' | 'error'

interface EditFormValues {
  clockIn: string
  clockOut: string
  note: string
}

function toFormValues(row: MemberAttendance): EditFormValues {
  return {
    clockIn: row.clock_in ? formatTimeKL(row.clock_in) : '',
    clockOut: row.clock_out ? formatTimeKL(row.clock_out) : '',
    note: row.note ?? '',
  }
}

// Content-only — no page chrome — so it can be reused both as its own
// standalone route (AttendanceAdminPage, below) and as a tab inside the
// combined Attendance hub page.
export function AttendanceAdminPanel() {
  const { profile } = useAuth()

  const [selectedDate, setSelectedDate] = useState(() => toKLDateISO(new Date()))
  const [refreshKey, setRefreshKey] = useState(0)

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rows, setRows] = useState<MemberAttendance[]>([])

  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [formValues, setFormValues] = useState<EditFormValues>({ clockIn: '', clockOut: '', note: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    setLoadState('loading')

    fetchDayAttendanceForCenter(profile.center_id, selectedDate).then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) {
        setLoadError('Could not load attendance. Please try again.')
        setLoadState('error')
        return
      }
      setRows(data)
      setLoadState('ready')
    })

    return () => {
      cancelled = true
    }
  }, [profile, selectedDate, refreshKey])

  if (!profile) return null

  const isToday = selectedDate === toKLDateISO(new Date())

  function openEdit(row: MemberAttendance) {
    setEditingUserId(row.user_id)
    setFormValues(toFormValues(row))
  }

  function closeEdit() {
    setEditingUserId(null)
  }

  async function handleSave(row: MemberAttendance) {
    if (!profile || saving) return
    setSaving(true)

    const clockInISO = formValues.clockIn ? klDateTimeToISO(selectedDate, formValues.clockIn) : null
    const clockOutISO = formValues.clockOut ? klDateTimeToISO(selectedDate, formValues.clockOut) : null
    const note = formValues.note.trim().length > 0 ? formValues.note.trim() : null

    const { error } = await adminUpsertAttendance(
      profile.center_id,
      row.user_id,
      selectedDate,
      clockInISO,
      clockOutISO,
      note
    )
    setSaving(false)
    if (error) {
      toast.error('Could not save changes. Please try again.')
      return
    }
    closeEdit()
    setRefreshKey((k) => k + 1)
    toast.success('Attendance updated')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl bg-white p-3 shadow-card">
        <button
          type="button"
          onClick={() => setSelectedDate((d) => shiftDateISO(d, -1))}
          aria-label="Previous day"
          className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-muted hover:bg-accent-soft/60 hover:text-ink"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="text-center">
          <p className="font-semibold text-ink">{formatDate(selectedDate)}</p>
          {!isToday && (
            <button
              type="button"
              onClick={() => setSelectedDate(toKLDateISO(new Date()))}
              className="text-xs text-accent hover:underline"
            >
              Today
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSelectedDate((d) => shiftDateISO(d, 1))}
          aria-label="Next day"
          className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-muted hover:bg-accent-soft/60 hover:text-ink"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {loadState === 'loading' && <LoadingState label="Loading attendance…" />}
      {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

      {loadState === 'ready' && rows.length === 0 && (
        <EmptyState message="No active members in this center yet." />
      )}

      {loadState === 'ready' && rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.user_id} className="space-y-3 rounded-xl bg-white p-4 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-ink">{row.full_name}</p>
                  <p className="text-xs text-muted">
                    In: {row.clock_in ? formatTimeKL(row.clock_in) : '—'} · Out:{' '}
                    {row.clock_out ? formatTimeKL(row.clock_out) : '—'}
                  </p>
                </div>
                {editingUserId !== row.user_id && (
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    className="min-h-tap rounded-xl border border-line px-3 text-sm text-muted"
                  >
                    Edit
                  </button>
                )}
              </div>

              {editingUserId === row.user_id && (
                <div className="space-y-3 border-t border-line pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted">Clock in</label>
                      <input
                        type="time"
                        value={formValues.clockIn}
                        onChange={(event) => setFormValues((v) => ({ ...v, clockIn: event.target.value }))}
                        disabled={saving}
                        className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted">Clock out</label>
                      <input
                        type="time"
                        value={formValues.clockOut}
                        onChange={(event) => setFormValues((v) => ({ ...v, clockOut: event.target.value }))}
                        disabled={saving}
                        className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted">Note (optional)</label>
                    <input
                      type="text"
                      value={formValues.note}
                      onChange={(event) => setFormValues((v) => ({ ...v, note: event.target.value }))}
                      disabled={saving}
                      className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={closeEdit}
                      disabled={saving}
                      className="min-h-tap flex-1 rounded-xl border border-line font-semibold text-sm text-muted hover:bg-cream disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSave(row)}
                      disabled={saving}
                      className="min-h-tap flex-1 rounded-xl bg-accent font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Standalone legacy route (/attendance/admin) — kept working in case
// anything still links directly to it. The Attendance hub page renders
// AttendanceAdminPanel directly instead of this wrapper.
export function AttendanceAdminPage() {
  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          <BackButton fallback="/" />
          <h1 className="font-bold text-2xl text-ink">Attendance (Admin)</h1>
        </div>
        <AttendanceAdminPanel />
      </div>
    </div>
  )
}
