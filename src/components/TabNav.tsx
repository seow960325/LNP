import { NavLink } from 'react-router-dom'

export interface TabNavItem {
  label: string
  to: string
}

// Tab definitions for the grouped sections. Tabs are plain NavLinks to the
// EXISTING routes — switching tabs is a navigation, so every child page keeps
// its own route, RequireRole guard, and data logic untouched. Deep routes
// (/staff/:id, /invoices/new, /invoices/:id) bypass the tab bar entirely.

// Both Staff and Students are visible to every role — Students is read-only
// for non-admins (gated inline on StudentsPage), not hidden. `_isAdmin` is
// kept unused so the signature still matches the other per-section tab
// builders below, which do hide admin-only tabs.
export function directoryTabs(_isAdmin: boolean): TabNavItem[] {
  return [
    { label: 'Staff', to: '/staff' },
    { label: 'Students', to: '/students' },
  ]
}

export const BILLING_TABS: TabNavItem[] = [
  { label: 'Invoices', to: '/invoices' },
  { label: 'Packages', to: '/packages' },
]

// Categories management is admin/super_admin-only: hide the tab (not just
// disable) for everyone else, mirroring directoryTabs above.
export function claimsTabs(isAdmin: boolean): TabNavItem[] {
  return isAdmin
    ? [
        { label: 'Claims', to: '/claims' },
        { label: 'Categories', to: '/claims/categories' },
      ]
    : [{ label: 'Claims', to: '/claims' }]
}

// Duty Config is admin/super_admin-only: hide the tab (not just disable)
// for everyone else, mirroring directoryTabs/claimsTabs above.
export function rosterTabs(isAdmin: boolean): TabNavItem[] {
  return isAdmin
    ? [
        { label: 'Roster', to: '/roster' },
        { label: 'Duty Config', to: '/roster/settings' },
      ]
    : [{ label: 'Roster', to: '/roster' }]
}

// Balances management is admin/super_admin-only: hide the tab (not just
// disable) for everyone else, mirroring directoryTabs/claimsTabs above.
export function leaveTabs(isAdmin: boolean): TabNavItem[] {
  return isAdmin
    ? [
        { label: 'Leave', to: '/leave' },
        { label: 'Balances', to: '/leave/balances' },
      ]
    : [{ label: 'Leave', to: '/leave' }]
}

export function TabNav({ tabs }: { tabs: TabNavItem[] }) {
  return (
    <nav aria-label="Section tabs" className="flex gap-1 rounded-xl bg-white p-1 shadow-card">
      {tabs.map(({ label, to }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) =>
            `flex min-h-tap flex-1 items-center justify-center rounded-lg font-semibold text-sm transition-colors duration-150 ${
              isActive
                ? 'bg-accent-soft text-accent-hover'
                : 'text-muted hover:bg-accent-soft/40 hover:text-ink'
            }`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
