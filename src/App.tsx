import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { Toaster } from 'sonner'
import { RequireAuth } from './components/RequireAuth'
import { RequireRole } from './components/RequireRole'
import { AppHeader } from './components/AppHeader'
import { useAuth } from './contexts/AuthContext'
import { LoginPage } from './pages/LoginPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { ForceChangePasswordPage } from './pages/ForceChangePasswordPage'
import { AdminHomePage } from './pages/AdminHomePage'
import { ParentHomePage } from './pages/ParentHomePage'
import { ShareholderHomePage } from './pages/ShareholderHomePage'
import { KudosWallPage } from './pages/KudosWallPage'
import { KudosSendPage } from './pages/KudosSendPage'
import { BoardPage } from './pages/BoardPage'
import { RosterPage } from './pages/RosterPage'
import { WifiPage } from './pages/WifiPage'
import { ProfilePage } from './pages/ProfilePage'
import { DirectoryPage } from './pages/DirectoryPage'
import { StaffJobTitlesPage } from './pages/StaffJobTitlesPage'
import { StaffJobTitleMembersPage } from './pages/StaffJobTitleMembersPage'
import { PastStaffPage } from './pages/PastStaffPage'
import { StaffMemberDetailPage } from './pages/StaffMemberDetailPage'
import { DirectoryShareholderTilesPage } from './pages/DirectoryShareholderTilesPage'
import { ShareholderDetailPage } from './pages/ShareholderDetailPage'
import { StaffDocumentsPage } from './pages/StaffDocumentsPage'
import { PayrollPage } from './pages/PayrollPage'
import { OpeningBalancePage } from './pages/OpeningBalancePage'
import { PackagesPage } from './pages/PackagesPage'
import { StudentClassesPage } from './pages/StudentClassesPage'
import { StudentClassListPage } from './pages/StudentClassListPage'
import { PastStudentsPage } from './pages/PastStudentsPage'
import { StudentDetailPage } from './pages/StudentDetailPage'
import { InvoicesPage } from './pages/InvoicesPage'
import { NewInvoicePage } from './pages/NewInvoicePage'
import { InvoiceDetailPage } from './pages/InvoiceDetailPage'
import { TermsPage } from './pages/TermsPage'
import { ClaimsPage } from './pages/ClaimsPage'
import { ClaimCategoriesPage } from './pages/ClaimCategoriesPage'
import { LeavePage } from './pages/LeavePage'
import { HrPage } from './pages/HrPage'
import { LeaveBalancesPage } from './pages/LeaveBalancesPage'
import { RosterSettingsPage } from './pages/RosterSettingsPage'
import { HomePage } from './pages/HomePage'
import { EntrancePage } from './pages/EntrancePage'
import { ClassesPage } from './pages/ClassesPage'
import { AttendanceConditionsPage } from './pages/AttendanceConditionsPage'
import { JobTitlesPage } from './pages/JobTitlesPage'

// Gate: a user whose password was admin-reset is locked out of every route
// under here until they set a new password — see ForceChangePasswordPage,
// which lives outside this layout so it's reachable without looping back.
function AppLayout() {
  const { profile } = useAuth()

  if (profile?.must_change_password) {
    return <Navigate to="/force-change-password" replace />
  }

  return (
    <>
      <AppHeader />
      <Outlet />
    </>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        richColors
        duration={3000}
        toastOptions={{
          classNames: {
            toast: 'rounded-xl shadow-card-lg border border-line font-sans',
            title: 'font-semibold text-sm',
            description: 'text-muted',
          },
        }}
      />
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />

        {/* Protected — must be authenticated with a resolved profile */}
        <Route element={<RequireAuth />}>
          {/* Outside AppLayout so the must_change_password gate can't loop back here */}
          <Route path="/force-change-password" element={<ForceChangePasswordPage />} />

          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />

            {/* Kudos — any authenticated active user, all roles */}
            <Route path="/kudos" element={<KudosWallPage />} />
            <Route path="/kudos/new" element={<KudosSendPage />} />

            {/* Daily Ops Board — any authenticated active user, all roles */}
            <Route path="/board" element={<BoardPage />} />

            {/* Duty Roster — any authenticated active user, all roles (admin/super_admin can edit) */}
            <Route path="/roster" element={<RosterPage />} />

            {/* WiFi Password — any authenticated active user, all roles (admin/super_admin can edit) */}
            <Route path="/wifi" element={<WifiPage />} />

            {/* Profile — any authenticated active user, edits own row only */}
            <Route path="/profile" element={<ProfilePage />} />

            {/* Claims & Leave — teacher/staff/admin/super_admin only (parent,
                shareholder excluded); the page branches inline into an
                own-claims view or the full admin review view (RLS enforces
                the actual row visibility) */}
            <Route element={<RequireRole allow={['teacher', 'staff', 'admin', 'super_admin']} />}>
              <Route path="/claims" element={<ClaimsPage />} />
              <Route path="/leave" element={<LeavePage />} />
            </Route>

            {/* HR & Claims landing menu — teacher/staff/admin/super_admin,
                matching the Home tile's visibility and HrPage's own children
                (/leave, /claims, /documents below); Payroll stays admin-only
                via a tile gated inline inside HrPage itself. */}
            <Route element={<RequireRole allow={['teacher', 'staff', 'admin', 'super_admin']} />}>
              <Route path="/hr" element={<HrPage />} />
            </Route>

            {/* Directory — Staff and Shareholder are separate top-level
                branches under here (decoupled from Students, which used to
                share a tab bar with Staff). /staff redirects here for old
                links/bookmarks. */}
            <Route path="/staff" element={<Navigate to="/directory/staff" replace />} />

            {/* Directory: Staff branch — teacher/staff/admin/super_admin only
                (parent, shareholder excluded), read-only. Tiled by job title;
                past staff live at /staff/past. */}
            <Route element={<RequireRole allow={['teacher', 'staff', 'admin', 'super_admin']} />}>
              <Route path="/directory" element={<DirectoryPage />} />
              <Route path="/directory/staff" element={<StaffJobTitlesPage />} />
              <Route path="/directory/staff/:jobTitleId" element={<StaffJobTitleMembersPage />} />
              {/* Flat list of inactive staff, no grouping — same role gating as above. */}
              <Route path="/staff/past" element={<PastStaffPage />} />
            </Route>

            {/* Staff member detail — also reachable from a linked
                shareholder's "View staff profile" link, so shareholder is
                allowed here too (read-only; admin-only sections stay gated
                inline via profile.role). */}
            <Route element={<RequireRole allow={['teacher', 'staff', 'admin', 'super_admin', 'shareholder']} />}>
              <Route path="/staff/:id" element={<StaffMemberDetailPage />} />
            </Route>

            {/* Directory: Shareholder branch — shareholder/admin/super_admin
                only, matching can_view_shareholdings() (the RLS gate on
                public.shareholdings). teacher/staff excluded: they could
                reach /directory (this branch's tile lives there, itself
                gated to the same three roles), click through, and RLS would
                return zero rows — an empty page, not an access boundary. */}
            <Route element={<RequireRole allow={['shareholder', 'admin', 'super_admin']} />}>
              <Route path="/directory/shareholder" element={<DirectoryShareholderTilesPage />} />
              <Route path="/directory/shareholder/:id" element={<ShareholderDetailPage />} />
            </Route>

            {/* Staff Documents — teacher/staff/admin/super_admin only (parent,
                shareholder excluded); self-only, view-only for every allowed
                role (gated inline via profile.role) */}
            <Route element={<RequireRole allow={['teacher', 'staff', 'admin', 'super_admin']} />}>
              <Route path="/documents" element={<StaffDocumentsPage />} />
            </Route>

            {/* Students — teacher/staff/admin/super_admin only (parent,
                shareholder excluded); read-only for everyone except
                admin/super_admin (gated inline via profile.role) */}
            <Route element={<RequireRole allow={['teacher', 'staff', 'admin', 'super_admin']} />}>
              <Route path="/students" element={<StudentClassesPage />} />

              {/* Active roster for one class (or the synthetic "unassigned"
                  bucket) — same role gating as /students above. */}
              <Route path="/students/class/:classId" element={<StudentClassListPage />} />

              {/* Flat list of inactive students, no class grouping — same role
                  gating as /students above. */}
              <Route path="/students/past" element={<PastStudentsPage />} />

              {/* Student detail — billing schedule/invoice history/PDF are
                  further gated inline to admin/super_admin/shareholder... but
                  shareholder can't reach this route at all now, so that inline
                  branch is effectively admin/super_admin-only in practice */}
              <Route path="/students/:id" element={<StudentDetailPage />} />
            </Route>

            {/* Entrance — student arrival/departure check-in. Teacher +
                admin + super_admin only; staff/parent/shareholder excluded. */}
            <Route element={<RequireRole allow={['teacher', 'admin', 'super_admin']} />}>
              <Route path="/entrance" element={<EntrancePage />} />
            </Route>

            {/* Admin routes: super_admin + admin */}
            <Route element={<RequireRole allow={['super_admin', 'admin']} />}>
              <Route path="/admin" element={<AdminHomePage />} />
              <Route path="/payroll" element={<PayrollPage />} />
              <Route path="/payroll/opening" element={<OpeningBalancePage />} />
              {/* Billing group — redirects to its default tab (admin-gated like its children) */}
              <Route path="/billing" element={<Navigate to="/invoices" replace />} />
              <Route path="/packages" element={<PackagesPage />} />
              <Route path="/invoices" element={<InvoicesPage />} />
              <Route path="/invoices/new" element={<NewInvoicePage />} />
              <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
              <Route path="/invoices/terms" element={<TermsPage />} />
              <Route path="/claims/categories" element={<ClaimCategoriesPage />} />
              <Route path="/roster/settings" element={<RosterSettingsPage />} />
              <Route path="/leave/balances" element={<LeaveBalancesPage />} />
              <Route path="/classes" element={<ClassesPage />} />
              <Route path="/attendance/conditions" element={<AttendanceConditionsPage />} />
              <Route path="/job-titles" element={<JobTitlesPage />} />
            </Route>

            {/* Parent — Phase 2 stub */}
            <Route element={<RequireRole allow={['parent']} />}>
              <Route path="/parent" element={<ParentHomePage />} />
            </Route>

            {/* Shareholder financials — shareholder, admin, super_admin.
                Reads only the zoho_* mirror tables (RLS-gated); no Zoho calls
                from the frontend. Hidden from nav for teacher/staff/parent. */}
            <Route element={<RequireRole allow={['shareholder', 'admin', 'super_admin']} />}>
              <Route path="/shareholder" element={<ShareholderHomePage />} />
            </Route>
          </Route>
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
