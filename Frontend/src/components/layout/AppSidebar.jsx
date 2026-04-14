/* eslint-disable react-refresh/only-export-components */
import {
  Boxes,
  Cog,
  Database,
  GitBranchPlus,
  LayoutGrid,
  Network,
  Sparkles,
  Upload,
  Workflow,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useTenantContext } from '../../context/TenantContext.jsx'

const navItems = [
  { label: 'Workspaces',      icon: LayoutGrid,    base: '/app/workspaces', id: 'tour-nav-workspaces'},
  { label: 'Upload',          icon: Upload,        base: '/app/upload', id: 'tour-nav-upload' },
  { label: 'Features',        icon: Boxes,         base: '/app/features' },
  { label: 'Tracking',        icon: Workflow,      base: '/app/tracking' },
  { label: 'Dataset',         icon: Database,      base: '/app/dataset' },
  { label: 'Intelligence',    icon: Network,       base: '/app/intelligence', id: 'tour-nav-intelligence' },
  { label: 'Recommendations', icon: Sparkles,      base: '/app/recommendations' },
  { label: 'Asana',           icon: GitBranchPlus, base: '/app/asana' },
  { label: 'Settings',        icon: Cog,           base: '/app/settings' },
]

export function resolveTenantPath(base, tenantId) {
  if (!tenantId) return base
  if (['/app/features', '/app/tracking', '/app/dashboard', '/app/dataset', '/app/recommendations', '/app/intelligence'].includes(base)) {
    return `${base}/${tenantId}`
  }
  return base
}

export default function AppSidebar() {
  const { activeTenant } = useTenantContext()

  return (
    <aside className="glass-panel hidden w-72 shrink-0 flex-col rounded-r-[2rem] border-l-0 border-t-0 border-b-0 p-6 lg:flex">
      <div className="mb-8 space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-indigo-100">
          Enterprise Intelligence
        </div>
        <div>
          <div className="text-2xl font-semibold text-white">FinSpark</div>
          <p className="text-sm text-slate-400">
            Product usage, churn, and feature intelligence in one workspace.
          </p>
        </div>
      </div>

      <div className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-4">
        <div className="text-xs uppercase tracking-[0.25em] text-slate-500">Active workspace</div>
        <div className="mt-2 text-sm font-medium text-white">
          {activeTenant?.company_name || 'No workspace selected'}
        </div>
      </div>

      <nav className="space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.base}
            id={item.id}
            to={resolveTenantPath(item.base, activeTenant?.id)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition ${
                isActive
                  ? 'bg-gradient-to-r from-indigo-500/20 to-cyan-400/10 text-white'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
