import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link2Off } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Supabase JS automatically parses the hash fragment on page load.
    // getSession() will return the session if the magic link token was valid.
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error || !session) {
        setError('This sign-in link has expired or is invalid. Please request a new one.')
      } else {
        navigate('/', { replace: true })
      }
    })
  }, [navigate])

  if (error) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-xl shadow-card p-8 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
            <Link2Off className="h-7 w-7 text-accent" aria-hidden="true" />
          </div>
          <p className="font-semibold text-ink">Link expired</p>
          <p className="text-sm text-muted">{error}</p>
          <a
            href="/login"
            className="inline-block bg-accent hover:bg-accent-hover text-white font-semibold px-6 py-3 rounded-xl transition-colors min-h-tap"
          >
            Back to sign in
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-accent/40 border-t-accent rounded-full animate-spin mx-auto" />
        <p className="text-muted text-sm">Completing sign-in…</p>
      </div>
    </div>
  )
}
