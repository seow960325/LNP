import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'

// Full-takeover page shown when profile.must_change_password is true (e.g.
// after an admin password reset). No nav, no skip — the only way out is
// setting a new password or signing out.
export function ForceChangePasswordPage() {
  const { profile, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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
      toast.error(validationError)
      return
    }

    setSaving(true)

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    if (updateError) {
      setSaving(false)
      toast.error(updateError.message || 'Could not update your password. Please try again.')
      return
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', profile.id)

    setSaving(false)
    if (profileError) {
      toast.error('Password updated, but could not clear the change-required flag. Please contact an admin.')
      return
    }

    toast.success('Password updated')
    await refreshProfile()
    navigate('/')
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-accent-soft/60 via-cream to-accent-soft/40 flex items-center justify-center px-4">
      <div className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-accent-soft/80 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-1/3 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="font-bold text-2xl text-ink">Set a new password</h1>
          <p className="mt-1 text-sm text-muted">
            Your password was reset by an admin. Choose a new password to continue.
          </p>
        </div>

        <div className="rounded-2xl border border-white/50 bg-white/80 p-8 shadow-card-lg backdrop-blur-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-ink mb-1">New password</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={saving}
                className="w-full px-4 py-3 rounded-xl border border-line bg-white/90 text-ink placeholder-muted/60 focus:outline-none focus:ring-2 focus:ring-accent min-h-tap disabled:opacity-60"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-ink mb-1">Confirm new password</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={saving}
                className="w-full px-4 py-3 rounded-xl border border-line bg-white/90 text-ink placeholder-muted/60 focus:outline-none focus:ring-2 focus:ring-accent min-h-tap disabled:opacity-60"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-accent hover:bg-accent-hover disabled:opacity-60 text-white font-semibold py-3 rounded-xl shadow-card transition-colors min-h-tap"
            >
              {saving ? 'Saving…' : 'Set password'}
            </button>
          </form>

          <button
            type="button"
            onClick={signOut}
            disabled={saving}
            className="mt-4 w-full text-center text-sm text-muted hover:text-ink disabled:opacity-60"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
