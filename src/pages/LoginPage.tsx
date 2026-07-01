import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

type Tab = 'password' | 'magic'

function friendlyError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login') || m.includes('invalid credentials') || m.includes('wrong password'))
    return 'Wrong email or password. Please try again.'
  if (m.includes('user not found') || m.includes('no user found'))
    return 'No account found with that email address.'
  if (m.includes('email not confirmed'))
    return 'Please verify your email before signing in.'
  if (m.includes('expired') || m.includes('otp'))
    return 'This link has expired. Please request a new one.'
  if (m.includes('network') || m.includes('fetch'))
    return 'Connection error. Check your internet and try again.'
  return 'Something went wrong. Please try again.'
}

export function LoginPage() {
  const { user, profileState } = useAuth()
  const [tab, setTab] = useState<Tab>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [magicSent, setMagicSent] = useState(false)

  // Already signed in → go to app (RequireAuth handles not_found / deactivated screens)
  if (user && profileState !== 'loading') return <Navigate to="/" replace />

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError(friendlyError(error.message))
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setLoading(false)
    if (error) setError(friendlyError(error.message))
    else setMagicSent(true)
  }

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl text-neutral-800 mb-1">Center Ops</h1>
          <p className="text-neutral-500 text-sm">Staff portal — authorised access only</p>
        </div>

        <div className="bg-white rounded-3xl shadow-card p-8">
          {/* Tab toggle */}
          <div className="flex rounded-xl bg-neutral-100 p-1 mb-6">
            <button
              type="button"
              onClick={() => { setTab('password'); setError(null); setMagicSent(false) }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors min-h-tap ${
                tab === 'password'
                  ? 'bg-white text-neutral-800 shadow-card'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => { setTab('magic'); setError(null); setMagicSent(false) }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors min-h-tap ${
                tab === 'magic'
                  ? 'bg-white text-neutral-800 shadow-card'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Email link
            </button>
          </div>

          {/* Password form */}
          {tab === 'password' && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-neutral-200 text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-400 min-h-tap"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-neutral-200 text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-400 min-h-tap"
                  placeholder="••••••••"
                />
              </div>
              {error && (
                <p className="text-sm text-coral-600 bg-coral-50 rounded-xl px-4 py-3">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors min-h-tap"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          )}

          {/* Magic link form */}
          {tab === 'magic' && !magicSent && (
            <form onSubmit={handleMagicLink} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-neutral-200 text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-400 min-h-tap"
                  placeholder="you@example.com"
                />
              </div>
              {error && (
                <p className="text-sm text-coral-600 bg-coral-50 rounded-xl px-4 py-3">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors min-h-tap"
              >
                {loading ? 'Sending…' : 'Email me a sign-in link'}
              </button>
            </form>
          )}

          {/* Magic link sent confirmation */}
          {tab === 'magic' && magicSent && (
            <div className="text-center space-y-3">
              <div className="text-4xl">📬</div>
              <p className="font-medium text-neutral-800">Check your inbox</p>
              <p className="text-sm text-neutral-500">
                We sent a sign-in link to <span className="font-medium">{email}</span>.
                The link expires in 1 hour.
              </p>
              <button
                type="button"
                onClick={() => { setMagicSent(false); setError(null) }}
                className="text-sm text-brand-600 hover:underline"
              >
                Use a different email
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
