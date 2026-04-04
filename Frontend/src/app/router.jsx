import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuthContext } from '../context/AuthContext.jsx'
import AppShell from '../components/layout/AppShell.jsx'
import LandingPage from '../pages/LandingPage.jsx'
import LoginPage from '../pages/LoginPage.jsx'
import RegisterPage from '../pages/RegisterPage.jsx'
import WorkspaceSelectionPage from '../pages/WorkspaceSelectionPage.jsx'
import UploadPage from '../pages/UploadPage.jsx'
import FeatureDetectionPage from '../pages/FeatureDetectionPage.jsx'
import TrackingCodePage from '../pages/TrackingCodePage.jsx'
import DashboardPage from '../pages/DashboardPage.jsx'
import RecommendationsPage from '../pages/RecommendationsPage.jsx'
import AsanaPage from '../pages/AsanaPage.jsx'
import SettingsPage from '../pages/SettingsPage.jsx'

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuthContext()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/app/workspaces" replace />} />
        <Route path="workspaces" element={<WorkspaceSelectionPage />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="features/:tenantId" element={<FeatureDetectionPage />} />
        <Route path="tracking/:tenantId" element={<TrackingCodePage />} />
        <Route path="dashboard/:tenantId" element={<DashboardPage />} />
        <Route path="recommendations/:tenantId" element={<RecommendationsPage />} />
        <Route path="asana" element={<AsanaPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
