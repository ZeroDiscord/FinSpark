import {
  Boxes,
  BrainCircuit,
  Cog,
  GitBranchPlus,
  LayoutGrid,
  Network,
  Sparkles,
  Upload,
  Workflow,
} from 'lucide-react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTenantContext } from '../../context/TenantContext.jsx'
import AppSidebar, { resolveTenantPath } from './AppSidebar.jsx'
import TopNavbar from './TopNavbar.jsx'
import OnboardingTour from '../ui/OnboardingTour.jsx'

const pageMeta = {
  '/app/workspaces': 'Workspaces',
  '/app/upload': 'Upload and Detection',
  '/app/asana': 'Asana Integration',
  '/app/settings': 'Workspace Settings',
}

const items = [
  { label: 'Workspaces', to: '/app/workspaces', icon: LayoutGrid },
  { label: 'Upload', to: '/app/upload', icon: Upload },
  { label: 'Features', to: '/app/features', icon: Boxes },
  { label: 'Tracking', to: '/app/tracking', icon: Workflow },
  { label: 'Executive Summary', to: '/app/executive', icon: BrainCircuit },
  { label: 'Intelligence', to: '/app/intelligence', icon: Network },
  { label: 'Recommendations', to: '/app/recommendations', icon: Sparkles },
  { label: 'Asana', to: '/app/asana', icon: GitBranchPlus },
  { label: 'Settings', to: '/app/settings', icon: Cog },
]

function getTitle(pathname) {
  if (pathname.includes('/app/dashboard/')) return 'Enterprise Analytics Dashboard'
  if (pathname.includes('/app/features/')) return 'Detected Feature Map'
  if (pathname.includes('/app/tracking/')) return 'Tracking Code Generator'
  if (pathname.includes('/app/executive/')) return 'Executive Summary'
  if (pathname.includes('/app/recommendations/')) return 'Recommendation Center'
  if (pathname.includes('/app/intelligence/')) return 'ML Intelligence Dashboard'
  return pageMeta[pathname] || 'Enterprise Feature Intelligence'
}

export default function AppShell() {
  const location = useLocation()
  const { activeTenant } = useTenantContext()
  const resolvedItems = items.map((item) => ({
    ...item,
    to: resolveTenantPath(item.to, activeTenant?.id),
  }))

  return (
    <div className="page-shell flex min-h-screen">
      <OnboardingTour />
      <AppSidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <TopNavbar title={getTitle(location.pathname)} items={resolvedItems} />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
