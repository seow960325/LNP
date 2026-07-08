import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { AccountNotSetupPage } from '../pages/AccountNotSetupPage'
import { AccountDeactivatedPage } from '../pages/AccountDeactivatedPage'
import { ConnectionErrorPage } from '../pages/ConnectionErrorPage'

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-accent/40 border-t-accent rounded-full animate-spin" />
    </div>
  )
}

export function RequireAuth() {
  const { user, profileState } = useAuth()

  if (profileState === 'loading') return <LoadingScreen />
  if (!user || profileState === 'guest') return <Navigate to="/login" replace />
  if (profileState === 'not_found') return <AccountNotSetupPage />
  if (profileState === 'deactivated') return <AccountDeactivatedPage />
  if (profileState === 'error') return <ConnectionErrorPage />

  return <Outlet />
}
