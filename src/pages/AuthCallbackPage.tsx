import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
      <div className="min-h-screen bg-cream-100 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-card p-8 text-center space-y-4">
          <div className="text-4xl">🔗</div>
          <p className="font-medium text-neutral-800">Link expired</p>
          <p className="text-sm text-neutral-500">{error}</p>
          <a
            href="/login"
            className="inline-block bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors min-h-tap"
          >
            Back to sign in
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-brand-300 border-t-brand-600 rounded-full animate-spin mx-auto" />
        <p className="text-neutral-500 text-sm">Completing sign-in…</p>
      </div>
    </div>
  )
}
