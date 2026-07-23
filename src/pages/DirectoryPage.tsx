import { Link } from 'react-router-dom'
import { GraduationCap, Users, Landmark } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'

// Students links straight into the existing, unmodified student-directory
// flow (class tiles -> student profile) at /students — it isn't rebuilt
// here, just given a way back into the main nav now that the old shared
// Staff/Students tab bar (its only entry point) is gone.
const TILES = [
  { label: 'Students', to: '/students', Icon: GraduationCap },
  { label: 'Staff', to: '/directory/staff', Icon: Users },
  { label: 'Shareholder', to: '/directory/shareholder', Icon: Landmark },
]

export function DirectoryPage() {
  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Directory" />

        <div className="grid grid-cols-2 gap-3">
          {TILES.map(({ label, to, Icon }) => (
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
