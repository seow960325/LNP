import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState } from '../components/AsyncState'
import { BackButton } from '../components/BackButton'
import { formatDate, formatTimeKL, toKLDateISO } from '../lib/helpers'
import { getTodayAttendance, clockIn, clockOut } from '../lib/attendanceApi'
import type { AttendanceRow } from '../lib/attendanceApi'

type LoadState = 'loading' | 'ready' | 'error'

export function AttendancePage() {
  const { profile } = useAuth()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [row, setRow] = useState<AttendanceRow | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    setLoadState('loading')

    getTodayAttendance(profile.center_id, profile.id).then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setLoadError('Could not load your attendance. Please try again.')
        setLoadState('error')
        return
      }
      setRow(data ?? null)
      setLoadState('ready')
    })

    return () => {
      cancelled = true
    }
  }, [profile])

  if (!profile) return null

  async function handleClockIn() {
    if (!profile || submitting) return
    setSubmitting(true)
    setActionError(null)
    const { data, error } = await clockIn(profile.center_id, profile.id)
    setSubmitting(false)
    if (error || !data) {
      setActionError('Could not clock in. Please try again.')
      return
    }
    setRow(data)
  }

  async function handleClockOut() {
    if (!row || submitting) return
    setSubmitting(true)
    setActionError(null)
    const { data, error } = await clockOut(row.id)
    setSubmitting(false)
    if (error || !data) {
      setActionError('Could not clock out. Please try again.')
      return
    }
    setRow(data)
  }

  return (
    <div className="min-h-screen bg-cream-100 p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          <BackButton fallback="/" />
          <h1 className="font-display text-2xl text-neutral-800">Attendance</h1>
        </div>

        {loadState === 'loading' && <LoadingState label="Loading your attendance…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && (
          <div className="space-y-4 rounded-3xl bg-white p-8 text-center shadow-card">
            <p className="font-display text-lg text-neutral-800">{formatDate(toKLDateISO(new Date()))}</p>

            {actionError && <ErrorState message={actionError} />}

            {!row && (
              <div className="space-y-4">
                <p className="text-sm text-neutral-500">You haven't clocked in yet.</p>
                <button
                  type="button"
                  onClick={handleClockIn}
                  disabled={submitting}
                  className="w-full min-h-tap-lg rounded-2xl bg-brand-600 font-display text-lg text-white shadow-card hover:bg-brand-700 disabled:opacity-60"
                >
                  {submitting ? 'Clocking in…' : 'Clock In'}
                </button>
              </div>
            )}

            {row && row.clock_in && !row.clock_out && (
              <div className="space-y-4">
                <p className="text-sm text-neutral-600">Clocked in at {formatTimeKL(row.clock_in)}</p>
                <button
                  type="button"
                  onClick={handleClockOut}
                  disabled={submitting}
                  className="w-full min-h-tap-lg rounded-2xl bg-brand-600 font-display text-lg text-white shadow-card hover:bg-brand-700 disabled:opacity-60"
                >
                  {submitting ? 'Clocking out…' : 'Clock Out'}
                </button>
              </div>
            )}

            {row && row.clock_in && row.clock_out && (
              <div className="space-y-1">
                <p className="text-sm text-neutral-600">Clocked in at {formatTimeKL(row.clock_in)}</p>
                <p className="text-sm text-neutral-600">Clocked out at {formatTimeKL(row.clock_out)}</p>
                <p className="pt-2 font-display text-sage-600">Done for today</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
