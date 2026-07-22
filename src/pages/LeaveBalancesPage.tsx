import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { TabNav, leaveTabs } from '../components/TabNav'
import { formatLeaveDays } from '../lib/helpers'
import { fetchCenterMembers } from '../lib/kudosApi'
import type { CenterMember } from '../lib/kudosApi'
import { fetchAllLeaveBalances, fetchAllLeaveRequests, upsertLeaveBalance } from '../lib/leaveApi'
import type { LeaveBalance, LeaveRequestRow, LeaveType } from '../lib/leaveApi'
import { withTimeout } from '../lib/withTimeout'
import { getUserErrorMessage } from '../lib/errorMessages'

type LoadState = 'loading' | 'ready' | 'error'

const TYPE_LABELS: Record<LeaveType, string> = {
  AL: 'Annual Leave',
  MC: 'Medical Leave',
}

const LEAVE_TYPES: LeaveType[] = ['AL', 'MC']
const currentYear = new Date().getFullYear()
const YEAR_OPTIONS = [currentYear - 1, currentYear, currentYear + 1]

export function LeaveBalancesPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [year, setYear] = useState(currentYear)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [members, setMembers] = useState<CenterMember[]>([])
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [requests, setRequests] = useState<LeaveRequestRow[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    setLoadState('loading')

    withTimeout(
      Promise.all([fetchCenterMembers(profile.center_id), fetchAllLeaveBalances(year), fetchAllLeaveRequests({ year })]),
    )
      .then(([membersRes, balancesRes, requestsRes]) => {
        if (cancelled) return
        if (membersRes.error || !membersRes.data || balancesRes.error || !balancesRes.data) {
          setLoadError('Could not load leave balances. Please try again.')
          setLoadState('error')
          return
        }
        setMembers(membersRes.data)
        setBalances(balancesRes.data)
        if (!requestsRes.error && requestsRes.data) setRequests(requestsRes.data)
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
  }, [profile, year, refreshKey])

  if (!profile || !isAdmin) return null

  function entitledFor(profileId: string, leaveType: LeaveType): number {
    return balances.find((b) => b.profile_id === profileId && b.leave_type === leaveType)?.entitled_days ?? 0
  }

  function usedFor(profileId: string, leaveType: LeaveType): number {
    return requests
      .filter((r) => r.profile_id === profileId && r.leave_type === leaveType && r.status === 'approved')
      .reduce((sum, r) => sum + r.days, 0)
  }

  function startEdit(memberId: string, leaveType: LeaveType) {
    setEditingKey(`${memberId}:${leaveType}`)
    setEditValue(String(entitledFor(memberId, leaveType)))
  }

  function cancelEdit() {
    setEditingKey(null)
    setEditValue('')
  }

  async function handleSave(memberId: string, leaveType: LeaveType) {
    const entitledDays = parseFloat(editValue)
    if (isNaN(entitledDays) || entitledDays < 0) {
      toast.error('Enter a valid number of days')
      return
    }

    setSaving(true)
    const { error } = await upsertLeaveBalance(memberId, year, leaveType, entitledDays)
    setSaving(false)

    if (error) {
      toast.error(error.message || 'Could not save this entitlement. Please try again.')
      return
    }
    cancelEdit()
    setRefreshKey((k) => k + 1)
    toast.success('Entitlement updated')
  }

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Leave Balances" />

        <TabNav tabs={leaveTabs(isAdmin)} />

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted">Year</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="min-h-tap rounded-xl border border-line bg-white px-3 text-sm text-muted shadow-card"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {loadState === 'loading' && <LoadingState label="Loading leave balances…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && members.length === 0 && (
          <EmptyState message="No active staff found." />
        )}

        {loadState === 'ready' && members.length > 0 && (
          <ul className="space-y-3">
            {members.map((member) => (
              <li key={member.id} className="space-y-3 rounded-xl bg-white p-5 shadow-card">
                <h3 className="font-bold text-ink">{member.full_name}</h3>
                <div className="grid grid-cols-2 gap-3">
                  {LEAVE_TYPES.map((leaveType) => {
                    const key = `${member.id}:${leaveType}`
                    const isEditing = editingKey === key
                    const entitled = entitledFor(member.id, leaveType)
                    const used = usedFor(member.id, leaveType)
                    const remaining = entitled - used

                    return (
                      <div key={leaveType} className="space-y-2 rounded-xl border border-line p-3">
                        <p className="text-xs font-semibold text-muted">{TYPE_LABELS[leaveType]}</p>

                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              disabled={saving}
                              autoFocus
                              className="min-h-tap w-full rounded-xl border border-line px-2 text-sm disabled:opacity-60"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={saving}
                                className="min-h-tap flex-1 rounded-lg border border-line text-2xs text-muted hover:bg-cream disabled:opacity-60"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSave(member.id, leaveType)}
                                disabled={saving}
                                className="min-h-tap flex-1 rounded-lg bg-accent text-2xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                              >
                                {saving ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-sm text-ink">Entitled: {formatLeaveDays(entitled)}</p>
                            <p className="text-sm text-muted">Used: {formatLeaveDays(used)}</p>
                            <p className="font-semibold text-sm text-ink">Remaining: {formatLeaveDays(remaining)}</p>
                            <button
                              type="button"
                              onClick={() => startEdit(member.id, leaveType)}
                              className="min-h-tap w-full rounded-lg border border-line text-2xs text-muted hover:bg-cream"
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
