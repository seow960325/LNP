import { useAuth } from '../contexts/AuthContext'
import { BackButton } from '../components/BackButton'
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
        <div className="flex items-center gap-2">
          <BackButton fallback="/" />
          <h1 className="font-bold text-2xl text-ink">Documents</h1>
        </div>

        <StaffDocPanel ownerId={profile.id} canManage={false} />
      </div>
    </div>
  )
}
