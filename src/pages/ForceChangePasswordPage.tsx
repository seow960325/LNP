import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ErrorState } from '../components/AsyncState'
import { supabase } from '../lib/supabaseClient'

// Full-takeover page shown when profile.must_change_password is true (e.g.
// after an admin password reset). No nav, no skip — the only way out is
// setting a new password or signing out.
export function ForceChangePasswordPage() {
  const { profile, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!profile) return null

  function validate(): string | null {
    if (!newPassword || !confirmPassword) return 'Please fill in both fields.'
    if (newPassword.length < 6) return 'Password must be at least 6 characters.'
    if (newPassword !== confirmPassword) return 'Passwords do not match.'
    return null
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!profile) return
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    setError(null)

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    if (updateError) {
      setSaving(false)
      setError(updateError.message || 'Could not update your password. Please try again.')
      return
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', profile.id)

    setSaving(false)
    if (profileError) {
      setError('Password updated, but could not clear the change-required flag. Please contact an admin.')
      return
    }

    await refreshProfile()
    navigate('/')
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-brand-50 via-cream-100 to-sky-100 flex items-center justify-center px-4">
      <div className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-sky-200/50 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-1/3 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="font-display text-2xl text-neutral-800">Set a new password</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Your password was reset by an admin. Choose a new password to continue.
          </p>
        </div>

        <div className="rounded-3xl border border-white/40 bg-white/60 p-8 shadow-card-lg backdrop-blur-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">New password</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={saving}
                className="w-full px-4 py-3 rounded-2xl border border-neutral-200 bg-white/90 text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-400 min-h-tap disabled:opacity-60"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Confirm new password</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={saving}
                className="w-full px-4 py-3 rounded-2xl border border-neutral-200 bg-white/90 text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-400 min-h-tap disabled:opacity-60"
                placeholder="••••••••"
              />
            </div>

            {error && <ErrorState message={error} />}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-3 rounded-2xl shadow-card transition-colors min-h-tap"
            >
              {saving ? 'Saving…' : 'Set password'}
            </button>
          </form>

          <button
            type="button"
            onClick={signOut}
            disabled={saving}
            className="mt-4 w-full text-center text-sm text-neutral-500 hover:text-neutral-700 disabled:opacity-60"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
