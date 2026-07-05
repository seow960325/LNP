import { Link } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Avatar } from './Avatar'
import { firstName } from '../lib/helpers'

export function AppHeader() {
  const { profile, signOut } = useAuth()

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white px-4 py-2 shadow-card">
      <Link to="/" className="flex items-center gap-2">
        <img src="/LNP-Logo.png" alt="Learn N' Play" className="h-8 w-auto" />
        <span className="hidden font-semibold text-sm text-ink sm:inline">Learn N&apos; Play</span>
      </Link>

      <div className="flex items-center gap-1">
        {profile && (
          <Link
            to="/profile"
            aria-label="Your profile"
            className="flex min-h-tap items-center gap-2 rounded-xl px-2 text-sm text-muted hover:bg-cream"
          >
            <Avatar fullName={profile.full_name} avatarUrl={profile.avatar_url} size="sm" />
            <span className="hidden font-semibold sm:inline">{firstName(profile.full_name)}</span>
          </Link>
        )}
        <button
          type="button"
          onClick={signOut}
          aria-label="Sign out"
          className="flex min-h-tap items-center gap-1.5 rounded-xl px-3 text-sm text-muted hover:bg-cream hover:text-ink"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  )
}
