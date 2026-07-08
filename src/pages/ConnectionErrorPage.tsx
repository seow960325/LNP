import { useState } from 'react'
import { WifiOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export function ConnectionErrorPage() {
  const { signOut, refreshProfile, profileErrorMessage } = useAuth()
  const [retrying, setRetrying] = useState(false)

  async function handleRetry() {
    setRetrying(true)
    await refreshProfile()
    setRetrying(false)
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-card p-8 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-danger/10">
          <WifiOff className="h-7 w-7 text-danger" aria-hidden="true" />
        </div>
        <h2 className="font-semibold text-xl text-ink">Connection problem</h2>
        <p className="text-sm text-muted">
          {profileErrorMessage ?? "Couldn't reach the server. Check your connection and try again."}
        </p>
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-xl transition-colors min-h-tap disabled:opacity-60"
        >
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
        <button
          type="button"
          onClick={signOut}
          className="w-full bg-cream hover:bg-line text-ink font-semibold py-3 rounded-xl transition-colors min-h-tap"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
