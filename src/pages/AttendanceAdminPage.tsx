import { useEffect, useState } from 'react'
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

export function AttendanceAdminPage() {
  const { profile } = useAuth()

  const [selectedDate, setSelectedDate] = useState(() => toKLDateISO(new Date()))
  const [refreshKey, setRefreshKey] = useState(0)

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rows, setRows] = useState<MemberAttendance[]>([])

  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [formValues, setFormValues] = useState<EditFormValues>({ clockIn: '', clockOut: '', note: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

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
    setSaveError(null)
  }

  function closeEdit() {
    setEditingUserId(null)
    setSaveError(null)
  }

  async function handleSave(row: MemberAttendance) {
    if (!profile || saving) return
    setSaving(true)
    setSaveError(null)

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
      setSaveError('Could not save changes. Please try again.')
      return
    }
    closeEdit()
    setRefreshKey((k) => k + 1)
  }

  return (
    <div className="min-h-screen bg-cream-100 p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          <BackButton fallback="/" />
          <h1 className="font-display text-2xl text-neutral-800">Attendance (Admin)</h1>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-card">
          <button
            type="button"
            onClick={() => setSelectedDate((d) => shiftDateISO(d, -1))}
            aria-label="Previous day"
            className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-neutral-500 hover:text-neutral-700"
          >
            ←
          </button>
          <div className="text-center">
            <p className="font-display text-neutral-800">{formatDate(selectedDate)}</p>
            {!isToday && (
              <button
                type="button"
                onClick={() => setSelectedDate(toKLDateISO(new Date()))}
                className="text-xs text-brand-600 hover:underline"
              >
                Today
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSelectedDate((d) => shiftDateISO(d, 1))}
            aria-label="Next day"
            className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-neutral-500 hover:text-neutral-700"
          >
            →
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
              <li key={row.user_id} className="space-y-3 rounded-2xl bg-white p-4 shadow-card">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-display text-neutral-800">{row.full_name}</p>
                    <p className="text-xs text-neutral-500">
                      In: {row.clock_in ? formatTimeKL(row.clock_in) : '—'} · Out:{' '}
                      {row.clock_out ? formatTimeKL(row.clock_out) : '—'}
                    </p>
                  </div>
                  {editingUserId !== row.user_id && (
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      className="min-h-tap rounded-2xl border border-neutral-200 px-3 text-sm text-neutral-600"
                    >
                      Edit
                    </button>
                  )}
                </div>

                {editingUserId === row.user_id && (
                  <div className="space-y-3 border-t border-neutral-100 pt-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-neutral-500">Clock in</label>
                        <input
                          type="time"
                          value={formValues.clockIn}
                          onChange={(event) => setFormValues((v) => ({ ...v, clockIn: event.target.value }))}
                          disabled={saving}
                          className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm disabled:opacity-60"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-neutral-500">Clock out</label>
                        <input
                          type="time"
                          value={formValues.clockOut}
                          onChange={(event) => setFormValues((v) => ({ ...v, clockOut: event.target.value }))}
                          disabled={saving}
                          className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm disabled:opacity-60"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-neutral-500">Note (optional)</label>
                      <input
                        type="text"
                        value={formValues.note}
                        onChange={(event) => setFormValues((v) => ({ ...v, note: event.target.value }))}
                        disabled={saving}
                        className="mt-1 min-h-tap w-full rounded-2xl border border-neutral-200 px-3 text-sm disabled:opacity-60"
                      />
                    </div>

                    {saveError && <ErrorState message={saveError} />}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={closeEdit}
                        disabled={saving}
                        className="min-h-tap flex-1 rounded-2xl border border-neutral-200 font-display text-sm text-neutral-600 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSave(row)}
                        disabled={saving}
                        className="min-h-tap flex-1 rounded-2xl bg-brand-600 font-display text-sm text-white shadow-card hover:bg-brand-700 disabled:opacity-60"
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
    </div>
  )
}
