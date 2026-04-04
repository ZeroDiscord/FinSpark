import { useState } from 'react'
import { CheckCircle2, GitBranchPlus } from 'lucide-react'
import { toast } from 'sonner'
import ColumnSelector from '../components/asana/ColumnSelector.jsx'
import IntegrationStatusBadge from '../components/asana/IntegrationStatusBadge.jsx'
import WorkspaceProjectSelector from '../components/asana/WorkspaceProjectSelector.jsx'
import Button from '../components/ui/Button.jsx'
import LoadingSkeleton from '../components/ui/LoadingSkeleton.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { useAsanaIntegration } from '../hooks/useAsanaIntegration.js'
import { useIntegrationStore } from '../stores/integrationStore.js'
import { saveAsanaMapping, startAsanaConnect } from '../services/asanaService.js'

export default function AsanaPage() {
  const { status, workspaces, projects, isLoading, error } = useAsanaIntegration()
  const {
    selectedWorkspace,
    selectedProject,
    selectedColumn,
    setSelectedWorkspace,
    setSelectedProject,
    setSelectedColumn,
  } = useIntegrationStore()
  const [saving, setSaving] = useState(false)

  async function handleConnect() {
    const response = await startAsanaConnect()
    if (response.auth_url) window.location.href = response.auth_url
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveAsanaMapping({
        workspaceId: selectedWorkspace,
        projectId: selectedProject,
        columnId: selectedColumn,
      })
      toast.success('Asana mapping saved')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Asana integration"
        title="Connect recommendations to delivery"
        description="Authorize Asana, choose the destination workspace and project, then send churn recommendations to the right Kanban column."
      />
      {isLoading ? (
        <LoadingSkeleton rows={8} />
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <div className="text-lg font-semibold text-white">Integration status</div>
                <div className="text-sm text-slate-400">
                  {status?.connected
                    ? `Connected to ${status.workspace_name || 'your Asana workspace'}`
                    : 'Not connected to Asana yet'}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <IntegrationStatusBadge connected={status?.connected} label={status?.connected ? 'Connected' : 'Disconnected'} />
                {!status?.connected ? (
                  <Button onClick={handleConnect} className="gap-2">
                    <GitBranchPlus className="h-4 w-4" />
                    Connect to Asana
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-4 xl:grid-cols-3">
            <Card>
              <CardContent className="space-y-4">
                <div className="text-lg font-semibold text-white">Workspace</div>
                <WorkspaceProjectSelector
                  label="Asana workspace"
                  value={selectedWorkspace}
                  items={workspaces}
                  onChange={setSelectedWorkspace}
                  placeholder="Select workspace"
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-4">
                <div className="text-lg font-semibold text-white">Project</div>
                <WorkspaceProjectSelector
                  label="Asana project"
                  value={selectedProject}
                  items={projects}
                  onChange={setSelectedProject}
                  placeholder="Select project"
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-4">
                <div className="text-lg font-semibold text-white">Kanban column</div>
                <ColumnSelector value={selectedColumn} onChange={setSelectedColumn} />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="text-lg font-semibold text-white">Save integration mapping</div>
                <div className="text-sm text-slate-400">
                  {error || 'Persist the selected workspace, project, and destination column for recommendation pushes.'}
                </div>
              </div>
              <Button onClick={handleSave} disabled={!selectedProject || saving}>
                {saving ? 'Saving...' : 'Save configuration'}
              </Button>
            </CardContent>
          </Card>
          {status?.connected ? (
            <Card>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  Ready to send recommendation cards into Asana
                </div>
                <div className="text-sm text-slate-400">
                  Once saved, the recommendation center will enable Kanban actions for all connected projects.
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  )
}
