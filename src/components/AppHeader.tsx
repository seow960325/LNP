import { Link } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export function AppHeader() {
  const { signOut } = useAuth()

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-2 shadow-card">
      <Link to="/" className="flex items-center gap-2">
        <img src="/LNP-Logo.png" alt="Learn N' Play" className="h-8 w-auto" />
        <span className="hidden font-display text-sm text-neutral-700 sm:inline">Learn N&apos; Play</span>
      </Link>
      <button
        type="button"
        onClick={signOut}
        aria-label="Sign out"
        className="flex min-h-tap items-center gap-1.5 rounded-2xl px-3 text-sm text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Sign out</span>
      </button>
    </header>
  )
}
