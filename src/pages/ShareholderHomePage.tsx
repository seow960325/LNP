import { useAuth } from '../contexts/AuthContext'

export function ShareholderHomePage() {
  const { signOut } = useAuth()

  return (
    <div className="min-h-screen bg-cream-100 p-6">
      <div className="max-w-lg mx-auto bg-white rounded-3xl shadow-card p-8 space-y-4">
        <h1 className="font-display text-2xl text-neutral-800">Shareholder Dashboard</h1>
        <p className="text-xs text-neutral-400 bg-neutral-50 rounded-xl px-4 py-3">
          Phase 2 stub — coming soon.
        </p>
        <button
          onClick={signOut}
          className="text-sm text-neutral-500 hover:text-neutral-700 underline"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
