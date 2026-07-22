import { matchPath, useLocation, useNavigate } from 'react-router-dom'

// Hierarchical "Up" navigation: Back always goes to the deterministic parent
// of the current route, never retraces browser history. Order matters —
// list literal/more-specific paths before the param pattern that would
// otherwise also match them (e.g. "/staff/past" before "/staff/:id").
const ROUTE_PARENTS: { pattern: string; parent: string }[] = [
  { pattern: '/', parent: '/' },
  { pattern: '/kudos', parent: '/' },
  { pattern: '/kudos/new', parent: '/kudos' },
  { pattern: '/board', parent: '/' },
  { pattern: '/roster', parent: '/' },
  { pattern: '/roster/settings', parent: '/roster' },
  { pattern: '/wifi', parent: '/' },
  { pattern: '/profile', parent: '/' },
  { pattern: '/hr', parent: '/' },
  { pattern: '/leave', parent: '/hr' },
  { pattern: '/leave/balances', parent: '/leave' },
  { pattern: '/claims', parent: '/hr' },
  { pattern: '/claims/categories', parent: '/claims' },
  { pattern: '/documents', parent: '/hr' },
  { pattern: '/payroll', parent: '/hr' },
  { pattern: '/payroll/opening', parent: '/payroll' },
  { pattern: '/directory', parent: '/' },
  { pattern: '/directory/staff', parent: '/directory' },
  { pattern: '/directory/staff/:jobTitleId', parent: '/directory/staff' },
  { pattern: '/directory/shareholder', parent: '/directory' },
  { pattern: '/directory/shareholder/:id', parent: '/directory/shareholder' },
  { pattern: '/staff/past', parent: '/directory/staff' },
  // Fallback only — StaffMemberDetailPage overrides this once it knows the
  // member's real job_title_id, so Back lands on that specific tile.
  { pattern: '/staff/:id', parent: '/directory/staff' },
  { pattern: '/students', parent: '/' },
  { pattern: '/students/class/:classId', parent: '/students' },
  { pattern: '/students/past', parent: '/students' },
  // Fallback only — StudentDetailPage overrides this once it knows the
  // student's real class_id, so Back lands on that specific class list.
  { pattern: '/students/:id', parent: '/students' },
  { pattern: '/classes', parent: '/students' },
  { pattern: '/entrance', parent: '/' },
  { pattern: '/attendance/conditions', parent: '/entrance' },
  { pattern: '/admin', parent: '/' },
  { pattern: '/billing', parent: '/' },
  { pattern: '/invoices', parent: '/' },
  { pattern: '/invoices/new', parent: '/invoices' },
  { pattern: '/invoices/terms', parent: '/invoices' },
  { pattern: '/invoices/:id', parent: '/invoices' },
  { pattern: '/packages', parent: '/invoices' },
  { pattern: '/parent', parent: '/' },
  { pattern: '/shareholder', parent: '/' },
]

export function resolveParent(pathname: string): string {
  for (const { pattern, parent } of ROUTE_PARENTS) {
    if (matchPath({ path: pattern, end: true }, pathname)) return parent
  }
  return '/'
}

// Shared Up navigation. `override`, when given, wins outright — used by
// pages whose real parent depends on fetched data (job_title_id, class_id)
// rather than the static route table above.
export function useUp(override?: string | null) {
  const navigate = useNavigate()
  const location = useLocation()
  return function up() {
    navigate(override ?? resolveParent(location.pathname))
  }
}
