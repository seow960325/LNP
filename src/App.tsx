import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { RequireAuth } from './components/RequireAuth'
import { RequireRole } from './components/RequireRole'
import { AppHeader } from './components/AppHeader'
import { LoginPage } from './pages/LoginPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { AdminHomePage } from './pages/AdminHomePage'
import { ParentHomePage } from './pages/ParentHomePage'
import { ShareholderHomePage } from './pages/ShareholderHomePage'
import { KudosWallPage } from './pages/KudosWallPage'
import { KudosSendPage } from './pages/KudosSendPage'
import { BoardPage } from './pages/BoardPage'
import { RosterPage } from './pages/RosterPage'
import { AttendancePage } from './pages/AttendancePage'
import { AttendanceAdminPage } from './pages/AttendanceAdminPage'
import { WifiPage } from './pages/WifiPage'
import { RequestsPage } from './pages/RequestsPage'
import { RequestsAdminPage } from './pages/RequestsAdminPage'
import { ProfilePage } from './pages/ProfilePage'
import { StaffDirectoryPage } from './pages/StaffDirectoryPage'
import { HomePage } from './pages/HomePage'

function AppLayout() {
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
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />

        {/* Protected — must be authenticated with a resolved profile */}
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />

            {/* Kudos — any authenticated active user, all roles */}
            <Route path="/kudos" element={<KudosWallPage />} />
            <Route path="/kudos/new" element={<KudosSendPage />} />

            {/* Daily Ops Board — any authenticated active user, all roles */}
            <Route path="/board" element={<BoardPage />} />

            {/* Duty Roster — any authenticated active user, all roles (admin/super_admin can edit) */}
            <Route path="/roster" element={<RosterPage />} />

            {/* Attendance self clock-in/out — any authenticated active user, all roles */}
            <Route path="/attendance" element={<AttendancePage />} />

            {/* WiFi Password — any authenticated active user, all roles (admin/super_admin can edit) */}
            <Route path="/wifi" element={<WifiPage />} />

            {/* Requests — any authenticated active user, all roles */}
            <Route path="/requests" element={<RequestsPage />} />

            {/* Profile — any authenticated active user, edits own row only */}
            <Route path="/profile" element={<ProfilePage />} />

            {/* Staff Directory — any authenticated active user, all roles, read-only */}
            <Route path="/staff" element={<StaffDirectoryPage />} />

            {/* Admin routes: super_admin + admin */}
            <Route element={<RequireRole allow={['super_admin', 'admin']} />}>
              <Route path="/admin" element={<AdminHomePage />} />
              <Route path="/attendance/admin" element={<AttendanceAdminPage />} />
              <Route path="/requests/admin" element={<RequestsAdminPage />} />
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
