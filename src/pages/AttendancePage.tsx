import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState } from '../components/AsyncState'
import { BackButton } from '../components/BackButton'
import { formatDate, formatTimeKL, toKLDateISO } from '../lib/helpers'
import { getTodayAttendance, clockIn, clockOut } from '../lib/attendanceApi'
import type { AttendanceRow } from '../lib/attendanceApi'
import { RequestsPanel } from './RequestsPage'
import { AttendanceAdminPanel } from './AttendanceAdminPage'
import { RequestsAdminPanel } from './RequestsAdminPage'

type LoadState = 'loading' | 'ready' | 'error'

// Content-only — no page chrome — so it can be reused both as its own
// standalone route (kept for backward compat, though AttendancePage below
// now supersedes it as the "Clock In / Out" tab) and inside the hub.
export function AttendanceClockPanel() {
  const { profile } = useAuth()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [row, setRow] = useState<AttendanceRow | null>(null)
  const [submitting, setSubmitting] = useState(false)

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
    const { data, error } = await clockIn(profile.center_id, profile.id)
    setSubmitting(false)
    if (error || !data) {
      toast.error('Could not clock in. Please try again.')
      return
    }
    setRow(data)
    toast.success('Clocked in')
  }

  async function handleClockOut() {
    if (!row || submitting) return
    setSubmitting(true)
    const { data, error } = await clockOut(row.id)
    setSubmitting(false)
    if (error || !data) {
      toast.error('Could not clock out. Please try again.')
      return
    }
    setRow(data)
    toast.success('Clocked out')
  }

  return (
    <>
      {loadState === 'loading' && <LoadingState label="Loading your attendance…" />}
      {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

      {loadState === 'ready' && (
        <div className="space-y-4 rounded-3xl bg-white p-8 text-center shadow-card">
          <p className="font-display text-lg text-neutral-800">{formatDate(toKLDateISO(new Date()))}</p>

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
    </>
  )
}

type Tab = 'clock' | 'requests' | 'team' | 'approvals'

const EMPLOYEE_TABS: { key: Tab; label: string }[] = [
  { key: 'clock', label: 'Clock In / Out' },
  { key: 'requests', label: 'Requests' },
]

const ADMIN_TABS: { key: Tab; label: string }[] = [
  { key: 'team', label: 'Team Attendance' },
  { key: 'approvals', label: 'Approvals' },
]

// Attendance hub — the single home-card entry point. Employees get the
// Clock In/Out + Requests tabs; admins additionally get the team attendance
// correction view and the requests approval queue, gated by the same
// role check used elsewhere (profile.role).
export function AttendancePage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<Tab>('clock')

  if (!profile) return null

  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin'
  const tabs = isAdmin ? [...EMPLOYEE_TABS, ...ADMIN_TABS] : EMPLOYEE_TABS

  return (
    <div className="min-h-screen bg-cream-100 p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          <BackButton fallback="/" />
          <h1 className="font-display text-2xl text-neutral-800">Attendance</h1>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-1.5 shadow-card">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`min-h-tap rounded-xl font-display text-sm transition-colors ${
                tab === key ? 'bg-brand-600 text-white shadow-card' : 'text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'clock' && <AttendanceClockPanel />}
        {tab === 'requests' && <RequestsPanel />}
        {isAdmin && tab === 'team' && <AttendanceAdminPanel />}
        {isAdmin && tab === 'approvals' && <RequestsAdminPanel />}
      </div>
    </div>
  )
}
