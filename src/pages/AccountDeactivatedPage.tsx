import { Ban } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export function AccountDeactivatedPage() {
  const { signOut } = useAuth()

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-card p-8 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-danger/10">
          <Ban className="h-7 w-7 text-danger" aria-hidden="true" />
        </div>
        <h2 className="font-semibold text-xl text-ink">Account deactivated</h2>
        <p className="text-sm text-muted">
          Your account has been deactivated. Please contact your administrator.
        </p>
        <button
          onClick={signOut}
          className="w-full bg-cream hover:bg-line text-ink font-semibold py-3 rounded-xl transition-colors min-h-tap"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
