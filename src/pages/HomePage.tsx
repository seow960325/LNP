import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, CalendarDays, ClipboardList, FileText, HandCoins, Palmtree, Trophy, Users, Wallet, Wifi, Receipt } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { firstName, toKLDateISO } from '../lib/helpers'
import { fetchOpenTodayCount } from '../lib/boardApi'

// Exactly 4 main functions per the Phase 1B nav restructure, plus Daily Ops
// Board. Sub-features (Send/Wall Kudos, admin views) live INSIDE their parent
// function's page now, gated by role there — not separate tiles.
const TILES: { label: string; to: string; Icon: LucideIcon }[] = [
  { label: 'Duty Roster', to: '/roster', Icon: CalendarDays },
  { label: 'Kudos', to: '/kudos', Icon: Trophy },
  { label: 'Claims', to: '/claims', Icon: HandCoins },
  { label: 'Leave', to: '/leave', Icon: Palmtree },
  { label: 'WiFi Password', to: '/wifi', Icon: Wifi },
  { label: 'Daily Ops Board', to: '/board', Icon: ClipboardList },
  // Directory groups Staff + Students (Students tab is read-only for non-admins)
  { label: 'Directory', to: '/directory', Icon: Users },
  { label: 'Documents', to: '/documents', Icon: FileText },
]

// Admin/super_admin only — appended to TILES rather than gated inline so the
// shared grid layout logic stays untouched for every other role.
const ADMIN_TILES: { label: string; to: string; Icon: LucideIcon }[] = [
  { label: 'Payroll', to: '/payroll', Icon: Wallet },
  // Billing groups Invoices + Fee Packages under one tabbed area
  { label: 'Billing', to: '/billing', Icon: Receipt },
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
      className="relative flex min-h-tap min-w-tap items-center justify-center rounded-full text-muted hover:bg-accent-soft/60 hover:text-ink"
    >
      <Bell className="h-6 w-6" aria-hidden="true" />
      {openCount !== null && openCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-2xs font-semibold text-white">
          {openCount}
        </span>
      )}
    </button>
  )
}

export function HomePage() {
  const { profile } = useAuth()
  // Tracks which tile is currently pressed so the whole card can bloom —
  // pointer-driven rather than :active so it fires reliably on touch even
  // though the tile also navigates on click.
  const [pressedTo, setPressedTo] = useState<string | null>(null)

  if (!profile) return null

  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin'
  const tiles = isAdmin ? [...TILES, ...ADMIN_TILES] : TILES

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-2xl text-ink">Hi {firstName(profile.full_name)}</h1>
          <NotificationBell />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {tiles.map(({ label, to, Icon }) => (
            <Link
              key={to}
              to={to}
              onPointerDown={() => setPressedTo(to)}
              onPointerUp={() => setPressedTo(null)}
              onPointerLeave={() => setPressedTo(null)}
              onPointerCancel={() => setPressedTo(null)}
              className={`home-tile flex min-h-tap-lg flex-col items-center justify-center gap-3 rounded-xl bg-white p-5 text-center shadow-card hover:shadow-card-md motion-safe:hover:-translate-y-0.5 ${
                pressedTo === to ? 'tile-pressed' : ''
              }`}
            >
              <span className="tile-icon-circle flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft">
                <Icon className="h-6 w-6 text-accent" aria-hidden="true" />
              </span>
              <span className="font-semibold text-sm text-ink">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
