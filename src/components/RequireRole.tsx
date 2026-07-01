import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { UserRole } from '../types'

// NOTE: These role checks are UX-only routing guards.
// Real access enforcement is done by Row Level Security policies in Supabase (spec #5).
// Bypassing this client-side check does NOT grant database access.

function getRoleHome(role: UserRole | undefined): string {
  switch (role) {
    case 'super_admin':
    case 'admin':
      return '/admin'
    case 'teacher':
    case 'staff':
      return '/staff'
    case 'parent':
      return '/parent'
    case 'shareholder':
      return '/shareholder'
    default:
      return '/login'
  }
}

interface RequireRoleProps {
  allow: UserRole[]
}

export function RequireRole({ allow }: RequireRoleProps) {
  const { profile } = useAuth()

  if (!profile || !allow.includes(profile.role)) {
    return <Navigate to={getRoleHome(profile?.role)} replace />
  }

  return <Outlet />
}

export { getRoleHome }
