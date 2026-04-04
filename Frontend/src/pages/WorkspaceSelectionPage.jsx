import { motion } from 'framer-motion'
import { ArrowRight, Building2, FolderOpen, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import LoadingSkeleton from '../components/ui/LoadingSkeleton.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { useWorkspaceSelection } from '../hooks/useWorkspaceSelection.js'
import { useTenantContext } from '../context/TenantContext.jsx'

export default function WorkspaceSelectionPage() {
  const navigate = useNavigate()
  const { tenants, isLoadingTenants, tenantError } = useWorkspaceSelection()
  const { setActiveTenant } = useTenantContext()

  function handleSelect(tenant) {
    setActiveTenant(tenant)
    navigate(`/app/upload`)
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Workspace selection"
        title="Choose a project workspace"
        description="Use your tenant as the operating workspace for uploads, feature mapping, analytics, and recommendation workflows."
        actions={
          <Button variant="secondary" className="gap-2">
            <Plus className="h-4 w-4" />
            Request workspace
          </Button>
        }
      />
      {isLoadingTenants ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <LoadingSkeleton key={index} />
          ))}
        </div>
      ) : tenantError ? (
        <EmptyState icon={FolderOpen} title="Could not load workspaces" description={tenantError} />
      ) : !tenants.length ? (
        <EmptyState icon={FolderOpen} title="No workspaces found" description="Create or sync a tenant first to start using the platform." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tenants.map((tenant, index) => (
            <motion.div key={tenant.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}>
              <Card className="h-full">
                <CardContent className="space-y-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-3 text-cyan-300">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-white">{tenant.company_name}</div>
                        <div className="text-sm text-slate-500">{tenant.id}</div>
                      </div>
                    </div>
                    <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                      Ready
                    </span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Dataset health</div>
                      <div className="mt-2 text-sm text-white">Validated schema</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Integrations</div>
                      <div className="mt-2 text-sm text-white">Power BI + Asana</div>
                    </div>
                  </div>
                  <Button onClick={() => handleSelect(tenant)} className="w-full gap-2">
                    Open workspace
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
