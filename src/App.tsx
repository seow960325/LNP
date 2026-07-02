import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { RequireAuth } from './components/RequireAuth'
import { RequireRole } from './components/RequireRole'
import { LoginPage } from './pages/LoginPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { AdminHomePage } from './pages/AdminHomePage'
import { StaffHomePage } from './pages/StaffHomePage'
import { ParentHomePage } from './pages/ParentHomePage'
import { ShareholderHomePage } from './pages/ShareholderHomePage'
import { KudosWallPage } from './pages/KudosWallPage'
import { KudosSendPage } from './pages/KudosSendPage'
import { BoardPage } from './pages/BoardPage'
import { RosterPage } from './pages/RosterPage'
import { HomePage } from './pages/HomePage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />

        {/* Protected — must be authenticated with a resolved profile */}
        <Route element={<RequireAuth />}>
          <Route path="/" element={<HomePage />} />

          {/* Kudos — any authenticated active user, all roles */}
          <Route path="/kudos" element={<KudosWallPage />} />
          <Route path="/kudos/new" element={<KudosSendPage />} />

          {/* Daily Ops Board — any authenticated active user, all roles */}
          <Route path="/board" element={<BoardPage />} />

          {/* Duty Roster — any authenticated active user, all roles (admin/super_admin can edit) */}
          <Route path="/roster" element={<RosterPage />} />

          {/* Admin routes: super_admin + admin */}
          <Route element={<RequireRole allow={['super_admin', 'admin']} />}>
            <Route path="/admin" element={<AdminHomePage />} />
          </Route>

          {/* Staff routes: super_admin + admin can also access staff view */}
          <Route element={<RequireRole allow={['super_admin', 'admin', 'teacher', 'staff']} />}>
            <Route path="/staff" element={<StaffHomePage />} />
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

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
