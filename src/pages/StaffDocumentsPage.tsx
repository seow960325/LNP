import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { StaffDocPanel } from '../components/StaffDocPanel'

// Self-service view — every user sees only their own documents here, and
// can never upload/delete from this page (canManage=false). Admin
// management of other staff's documents happens on the staff detail page.
export function StaffDocumentsPage() {
  const { profile } = useAuth()

  if (!profile) return null

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Documents" fallback="/" />

        <StaffDocPanel ownerId={profile.id} canManage={false} />
      </div>
    </div>
  )
}
