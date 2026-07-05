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
import { StaffDirectoryPage } from './pages/StaffDirectoryPage'
import { StaffMemberDetailPage } from './pages/StaffMemberDetailPage'
import { StaffDocumentsPage } from './pages/StaffDocumentsPage'
import { PayrollPage } from './pages/PayrollPage'
import { OpeningBalancePage } from './pages/OpeningBalancePage'
import { PackagesPage } from './pages/PackagesPage'
import { StudentsPage } from './pages/StudentsPage'
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

            {/* Claims — any authenticated active user, all roles; the page
                branches inline into an own-claims view or the full
                admin review view (RLS enforces the actual row visibility) */}
            <Route path="/claims" element={<ClaimsPage />} />

            {/* Leave — any authenticated active user, all roles; the page
                branches inline into an own-requests view or the full
                admin review view (RLS enforces the actual row visibility) */}
            <Route path="/leave" element={<LeavePage />} />

            {/* HR & Claims — landing menu grouping Leave, Claims, and Documents
                behind one home tile; any authenticated active user, all roles */}
            <Route path="/hr" element={<HrPage />} />

            {/* Directory group — redirects to its default tab. The tabbed pages
                themselves keep their own routes/guards below. */}
            <Route path="/directory" element={<Navigate to="/staff" replace />} />

            {/* Staff Directory — any authenticated active user, all roles, read-only */}
            <Route path="/staff" element={<StaffDirectoryPage />} />

            {/* Staff member detail — any authenticated active user; document and
                management sections are gated inline (admin+super_admin get the
                Management block and doc-manage rights, self sees own docs
                view-only, everyone else sees neither) */}
            <Route path="/staff/:id" element={<StaffMemberDetailPage />} />

            {/* Staff Documents — self-only, view-only for every role (gated inline via profile.role) */}
            <Route path="/documents" element={<StaffDocumentsPage />} />

            {/* Students — any authenticated active user, all roles; read-only for
                everyone except admin/super_admin (gated inline via profile.role) */}
            <Route path="/students" element={<StudentsPage />} />

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
            </Route>

            {/* Parent — Phase 2 stub */}
            <Route element={<RequireRole allow={['parent']} />}>
              <Route path="/parent" element={<ParentHomePage />} />
            </Route>

            {/* Shareholder — Phase 2 stub */}
            <Route element={<RequireRole allow={['shareholder']} />}>
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
