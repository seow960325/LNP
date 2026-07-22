import { Link } from 'react-router-dom'
import { Users, Landmark } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'

const TILES = [
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
