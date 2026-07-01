import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, ClipboardList, Gift, Trophy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { firstName, toKLDateISO } from '../lib/helpers'
import { fetchOpenTodayCount } from '../lib/boardApi'

const TILES: { label: string; to: string; Icon: LucideIcon }[] = [
  { label: 'Daily Ops Board', to: '/board', Icon: ClipboardList },
  { label: 'Send Kudos', to: '/kudos/new', Icon: Gift },
  { label: 'Kudos Wall', to: '/kudos', Icon: Trophy },
]

function NotificationBell() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [openCount, setOpenCount] = useState<number | null>(null)

  useEffect(() => {
    if (!profile) return
    const centerId = profile.center_id
    let cancelled = false

    fetchOpenTodayCount(centerId, toKLDateISO(new Date())).then(({ count, error }) => {
      if (cancelled) return
      if (error) return // non-critical — fail silently to a bare bell
      setOpenCount(count ?? 0)
    })

    return () => {
      cancelled = true
    }
  }, [profile])

  return (
    <button
      type="button"
      onClick={() => navigate('/board')}
      aria-label="Notifications"
      className="relative flex min-h-tap min-w-tap items-center justify-center rounded-full text-neutral-600 hover:text-neutral-800"
    >
      <Bell className="h-6 w-6" aria-hidden="true" />
      {openCount !== null && openCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-coral-600 px-1 text-2xs font-medium text-white">
          {openCount}
        </span>
      )}
    </button>
  )
}

export function HomePage() {
  const { profile } = useAuth()

  if (!profile) return null

  return (
    <div className="min-h-screen bg-cream-100 p-6">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl text-neutral-800">Hi {firstName(profile.full_name)}</h1>
          <NotificationBell />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {TILES.map(({ label, to, Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex min-h-tap-lg flex-col items-center justify-center gap-2 rounded-2xl bg-white p-4 text-center shadow-card hover:shadow-card-md"
            >
              <Icon className="h-7 w-7 text-brand-600" aria-hidden="true" />
              <span className="font-display text-sm text-neutral-800">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
