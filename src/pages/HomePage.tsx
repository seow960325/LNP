import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Briefcase, CalendarDays, ClipboardList, DoorOpen, Trophy, Users, Wifi, Receipt, LineChart } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { firstName, toKLDateISO } from '../lib/helpers'
import { fetchOpenTodayCount } from '../lib/boardApi'
import { ReorderableTileGrid } from '../components/ReorderableTileGrid'

// Exactly 4 main functions per the Phase 1B nav restructure, plus Daily Ops
// Board. Sub-features (Send/Wall Kudos, admin views) live INSIDE their parent
// function's page now, gated by role there — not separate tiles.
const TILES: { label: string; to: string; Icon: LucideIcon }[] = [
  { label: 'Duty Roster', to: '/roster', Icon: CalendarDays },
  { label: 'Kudos', to: '/kudos', Icon: Trophy },
  // HR & Claims is a landing menu (HrPage) that groups Leave + Claims + Documents
  { label: 'HR & Claims', to: '/hr', Icon: Briefcase },
  { label: 'WiFi Password', to: '/wifi', Icon: Wifi },
  { label: 'Daily Ops Board', to: '/board', Icon: ClipboardList },
  // Directory groups Staff + Students (Students tab is read-only for non-admins)
  { label: 'Directory', to: '/directory', Icon: Users },
]

// Teacher + admin + super_admin only — matches the /entrance RequireRole
// gate, so staff/parent/shareholder never see a tile that would just bounce
// them back out.
const ENTRANCE_TILE: { label: string; to: string; Icon: LucideIcon } = {
  label: 'Entrance',
  to: '/entrance',
  Icon: DoorOpen,
}

// Admin/super_admin only — appended to TILES rather than gated inline so the
// shared grid layout logic stays untouched for every other role.
const ADMIN_TILES: { label: string; to: string; Icon: LucideIcon }[] = [
  // Billing groups Invoices + Fee Packages under one tabbed area
  { label: 'Invoice', to: '/billing', Icon: Receipt },
]

// Shareholder/admin/super_admin only — matches the /shareholder RequireRole
// gate, so teacher/staff/parent never see a tile that would just bounce
// them back out.
const FINANCIALS_TILE: { label: string; to: string; Icon: LucideIcon } = {
  label: 'Financials',
  to: '/shareholder',
  Icon: LineChart,
}

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

  if (!profile) return null

  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin'
  const isSuperAdmin = profile.role === 'super_admin'
  const canCheckIn = profile.role === 'teacher' || isAdmin
  const canSeeFinancials = profile.role === 'shareholder' || isAdmin
  const tiles = [
    ...TILES,
    ...(canCheckIn ? [ENTRANCE_TILE] : []),
    ...(isAdmin ? ADMIN_TILES : []),
    ...(canSeeFinancials ? [FINANCIALS_TILE] : []),
  ].map((tile) => ({
    ...tile,
    key: tile.to,
  }))

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-2xl text-ink">Hi {firstName(profile.full_name)}</h1>
          <NotificationBell />
        </div>

        <ReorderableTileGrid menuKey="home" tiles={tiles} canEdit={isSuperAdmin} />
      </div>
    </div>
  )
}
