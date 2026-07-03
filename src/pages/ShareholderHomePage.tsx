import { useAuth } from '../contexts/AuthContext'

export function ShareholderHomePage() {
  const { signOut } = useAuth()

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="max-w-lg mx-auto bg-white rounded-xl shadow-card p-8 space-y-4">
        <h1 className="font-bold text-2xl text-ink">Shareholder Dashboard</h1>
        <p className="text-xs text-muted/70 bg-cream rounded-xl px-4 py-3">
          Phase 2 stub — coming soon.
        </p>
        <button
          onClick={signOut}
          className="text-sm text-muted hover:text-ink underline"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
