import { Link } from 'react-router-dom'
import { GraduationCap, Users, Landmark } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/PageHeader'

// Students links straight into the existing, unmodified student-directory
// flow (class tiles -> student profile) at /students — it isn't rebuilt
// here, just given a way back into the main nav now that the old shared
// Staff/Students tab bar (its only entry point) is gone.
const BASE_TILES = [
  { label: 'Students', to: '/students', Icon: GraduationCap },
  { label: 'Staff', to: '/directory/staff', Icon: Users },
]

// Shareholder branch reads public.shareholdings, whose RLS
// (can_view_shareholdings()) only allows role in ('shareholder', 'admin',
// 'super_admin') — teacher/staff can otherwise reach /directory (this page)
// and would see this tile only to land on an empty page after clicking
// through. Same role check as HomePage's canSeeFinancials for the Financials
// tile, which gates the same underlying data.
const SHAREHOLDER_TILE = { label: 'Shareholder', to: '/directory/shareholder', Icon: Landmark }

export function DirectoryPage() {
  const { profile } = useAuth()
  const canSeeShareholder =
    profile?.role === 'shareholder' || profile?.role === 'admin' || profile?.role === 'super_admin'
  const tiles = [...BASE_TILES, ...(canSeeShareholder ? [SHAREHOLDER_TILE] : [])]

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Directory" />

        <div className="grid grid-cols-2 gap-3">
          {tiles.map(({ label, to, Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-2xl bg-white p-4 text-center shadow-card transition-colors hover:bg-accent-soft/40"
            >
              <Icon className="h-6 w-6 text-accent" aria-hidden="true" />
              <span className="text-base font-bold text-ink">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
