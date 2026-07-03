import { useAuth } from '../contexts/AuthContext'

export function AdminHomePage() {
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="max-w-lg mx-auto bg-white rounded-xl shadow-card p-8 space-y-4">
        <h1 className="font-bold text-2xl text-ink">Admin Dashboard</h1>
        <p className="text-muted text-sm">
          Signed in as <span className="font-semibold text-ink">{profile?.full_name}</span>{' '}
          · <span className="text-accent">{profile?.title || 'Staff'}</span>
        </p>
        <p className="text-xs text-muted/70 bg-cream rounded-xl px-4 py-3">
          Phase 1A stub — screens coming in later specs.
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
