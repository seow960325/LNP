import { HandCoins, Palmtree, FileText, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { ReorderableTileGrid } from '../components/ReorderableTileGrid'

const TILES: { label: string; to: string; Icon: LucideIcon }[] = [
  { label: 'Leave', to: '/leave', Icon: Palmtree },
  { label: 'Claims', to: '/claims', Icon: HandCoins },
  { label: 'Documents', to: '/documents', Icon: FileText },
]

// Admin/super_admin only — appended to TILES rather than gated inline so the
// shared grid layout logic stays untouched for every other role. The
// /payroll route itself stays admin-gated in App.tsx; this is just the tile.
const ADMIN_TILES: { label: string; to: string; Icon: LucideIcon }[] = [{ label: 'Payroll', to: '/payroll', Icon: Wallet }]

export function HrPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'
  const isSuperAdmin = profile?.role === 'super_admin'
  const tiles = [...TILES, ...(isAdmin ? ADMIN_TILES : [])].map((tile) => ({ ...tile, key: tile.to }))

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-6">
        <PageHeader title="HR & Claims" fallback="/" />

        <ReorderableTileGrid menuKey="hr" tiles={tiles} canEdit={isSuperAdmin} />
      </div>
    </div>
  )
}
