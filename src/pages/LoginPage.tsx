import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
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
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-accent-soft/60 via-cream to-accent-soft/40 flex items-center justify-center px-4">
      {/* Decorative blurred blobs */}
      <div className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-accent-soft/80 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-1/3 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/4 h-72 w-72 rounded-full bg-accent-soft/50 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-6">
          <img src="/LNP-Logo.png" alt="Learn N&apos; Play" className="mx-auto h-20 w-auto" />
          <h1 className="font-handwriting text-5xl leading-tight text-accent-hover mt-1">Learn N&apos; Play</h1>
          <p className="text-muted text-sm mt-1">Staff portal — authorised access only</p>
        </div>

        <div className="rounded-2xl border border-white/50 bg-white/80 p-8 shadow-card-lg backdrop-blur-xl">
          {/* Tab toggle */}
          <div className="flex rounded-xl bg-accent-soft/60 p-1 mb-6">
            <button
              type="button"
              onClick={() => { setTab('password'); setError(null); setMagicSent(false) }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors min-h-tap ${
                tab === 'password'
                  ? 'bg-white text-accent-hover font-semibold shadow-card'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => { setTab('magic'); setError(null); setMagicSent(false) }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors min-h-tap ${
                tab === 'magic'
                  ? 'bg-white text-accent-hover font-semibold shadow-card'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Email link
            </button>
          </div>

          {/* Password form */}
          {tab === 'password' && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-ink mb-1">Email</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-line bg-white/90 text-ink placeholder-muted/60 focus:outline-none focus:ring-2 focus:ring-accent min-h-tap"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-ink mb-1">Password</label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-line bg-white/90 text-ink placeholder-muted/60 focus:outline-none focus:ring-2 focus:ring-accent min-h-tap"
                  placeholder="••••••••"
                />
              </div>
              {error && (
                <p className="text-sm text-danger bg-danger/10 rounded-xl px-4 py-3">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-accent hover:bg-accent-hover disabled:opacity-60 text-white font-semibold py-3 rounded-xl shadow-card transition-colors min-h-tap"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          )}

          {/* Magic link form */}
          {tab === 'magic' && !magicSent && (
            <form onSubmit={handleMagicLink} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-ink mb-1">Email</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-line bg-white/90 text-ink placeholder-muted/60 focus:outline-none focus:ring-2 focus:ring-accent min-h-tap"
                  placeholder="you@example.com"
                />
              </div>
              {error && (
                <p className="text-sm text-danger bg-danger/10 rounded-xl px-4 py-3">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-accent hover:bg-accent-hover disabled:opacity-60 text-white font-semibold py-3 rounded-xl shadow-card transition-colors min-h-tap"
              >
                {loading ? 'Sending…' : 'Email me a sign-in link'}
              </button>
            </form>
          )}

          {/* Magic link sent confirmation */}
          {tab === 'magic' && magicSent && (
            <div className="text-center space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
                <MailCheck className="h-7 w-7 text-accent" aria-hidden="true" />
              </div>
              <p className="font-semibold text-ink">Check your inbox</p>
              <p className="text-sm text-muted">
                We sent a sign-in link to <span className="font-semibold">{email}</span>.
                The link expires in 1 hour.
              </p>
              <button
                type="button"
                onClick={() => { setMagicSent(false); setError(null) }}
                className="text-sm text-accent hover:underline"
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
