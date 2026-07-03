import { Lock } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export function AccountNotSetupPage() {
  const { signOut } = useAuth()

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-card p-8 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
          <Lock className="h-7 w-7 text-accent" aria-hidden="true" />
        </div>
        <h2 className="font-semibold text-xl text-ink">Account not set up yet</h2>
        <p className="text-sm text-muted">
          Your login was recognised but your account hasn't been configured.
          Contact your administrator to complete the setup.
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
