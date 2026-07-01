import { useAuth } from '../contexts/AuthContext'

export function AccountDeactivatedPage() {
  const { signOut } = useAuth()

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-card p-8 text-center space-y-4">
        <div className="text-4xl">🚫</div>
        <h2 className="font-display text-xl text-neutral-800">Account deactivated</h2>
        <p className="text-sm text-neutral-500">
          Your account has been deactivated. Please contact your administrator.
        </p>
        <button
          onClick={signOut}
          className="w-full bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold py-3 rounded-xl transition-colors min-h-tap"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
