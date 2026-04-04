import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, GitBranchPlus, Send } from 'lucide-react'
import { toast } from 'sonner'
import { useParams } from 'react-router-dom'
import ColumnSelector from '../components/asana/ColumnSelector.jsx'
import IntegrationStatusBadge from '../components/asana/IntegrationStatusBadge.jsx'
import WorkspaceProjectSelector from '../components/asana/WorkspaceProjectSelector.jsx'
import Button from '../components/ui/Button.jsx'
import LoadingSkeleton from '../components/ui/LoadingSkeleton.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { useAsanaIntegration } from '../hooks/useAsanaIntegration.js'
import { useIntegrationStore } from '../stores/integrationStore.js'
import {
  bulkSendRecommendations,
  fetchAsanaProjects,
  fetchAsanaSections,
  saveAsanaMapping,
  startAsanaConnect,
} from '../services/asanaService.js'

export default function AsanaPage() {
  const params = useParams()
  const tenantId = params.tenantId || new URLSearchParams(window.location.search).get('tenant_id') || ''
  const { status, workspaces, projects, sections, isLoading, error } = useAsanaIntegration(tenantId)
  const {
    selectedWorkspace,
    selectedProject,
    selectedColumn,
    setSelectedWorkspace,
    setSelectedProject,
    setSelectedColumn,
  } = useIntegrationStore()
  const [projectOptions, setProjectOptions] = useState(projects)
  const [sectionOptions, setSectionOptions] = useState(sections)
  const [saving, setSaving] = useState(false)
  const [sendingBulk, setSendingBulk] = useState(false)

  useEffect(() => {
    setSelectedWorkspace(status?.workspace_id || '')
    setSelectedProject(status?.project_id || '')
    setSelectedColumn(status?.section_id || '')
    setProjectOptions(projects)
    setSectionOptions(sections)
  }, [projects, sections, setSelectedColumn, setSelectedProject, setSelectedWorkspace, status])

  useEffect(() => {
    if (!tenantId || !selectedWorkspace || selectedWorkspace === status?.workspace_id) return
    fetchAsanaProjects(tenantId, selectedWorkspace)
      .then((rows) => {
        setProjectOptions(rows)
        setSelectedProject('')
        setSectionOptions([])
        setSelectedColumn('')
      })
      .catch(() => {})
  }, [selectedWorkspace, status?.workspace_id, tenantId, setSelectedProject, setSelectedColumn])

  useEffect(() => {
    if (!tenantId || !selectedProject || selectedProject === status?.project_id) return
    fetchAsanaSections(tenantId, selectedProject)
      .then((rows) => {
        setSectionOptions(rows)
        setSelectedColumn('')
      })
      .catch(() => {})
  }, [selectedProject, status?.project_id, tenantId, setSelectedColumn])

  const isMapped = Boolean(status?.connected && status?.project_id && status?.section_id)
  const saveDisabled = !status?.connected || !selectedWorkspace || !selectedProject || !selectedColumn || saving
  const bulkDisabled = !isMapped || sendingBulk

  async function handleConnect() {
    const response = await startAsanaConnect(tenantId)
    if (response.auth_url) window.location.href = response.auth_url
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveAsanaMapping(tenantId, {
        workspaceId: selectedWorkspace,
        projectId: selectedProject,
        columnId: selectedColumn,
      })
      toast.success('Asana workspace, project, and section saved')
    } catch (saveError) {
      toast.error(saveError.response?.data?.error || saveError.message || 'Could not save Asana mapping')
    } finally {
      setSaving(false)
    }
  }

  async function handleBulkSend() {
    setSendingBulk(true)
    try {
      const result = await bulkSendRecommendations(tenantId, {
        priority: 'critical_or_high',
        project_id: selectedProject || status?.project_id,
        section_id: selectedColumn || status?.section_id,
      })
      toast.success(`Sent ${result.success_count} recommendations to Asana`)
    } catch (sendError) {
      toast.error(sendError.response?.data?.error || sendError.message || 'Bulk send failed')
    } finally {
      setSendingBulk(false)
    }
  }

  const helperText = useMemo(() => {
    if (!status?.connected) return 'Connect Asana to enable recommendation delivery.'
    if (!isMapped) return 'Choose a workspace, project, and section to enable Kanban delivery.'
    return 'Recommendation cards can now be pushed directly to the configured Kanban board.'
  }, [isMapped, status?.connected])

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Asana integration"
        title="Connect recommendations to delivery"
        description="Authorize Asana, choose the destination workspace and project, then send churn recommendations to the right Kanban section."
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
                {status?.last_error ? (
                  <div className="text-sm text-rose-300">{status.last_error}</div>
                ) : null}
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
                  items={projectOptions}
                  onChange={setSelectedProject}
                  placeholder="Select project"
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-4">
                <div className="text-lg font-semibold text-white">Kanban section</div>
                <ColumnSelector value={selectedColumn} onChange={setSelectedColumn} items={sectionOptions} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="text-lg font-semibold text-white">Save integration mapping</div>
                <div className="text-sm text-slate-400">
                  {error || helperText}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleSave} disabled={saveDisabled}>
                  {saving ? 'Saving...' : 'Save configuration'}
                </Button>
                <Button variant="secondary" className="gap-2" disabled={bulkDisabled} onClick={handleBulkSend}>
                  <Send className="h-4 w-4" />
                  {sendingBulk ? 'Sending...' : 'Send All High Priority Recommendations'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {isMapped ? (
            <Card>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  Ready to send recommendation cards into Asana
                </div>
                <div className="text-sm text-slate-400">
                  Recommendation actions are enabled for {status.project_name} → {status.section_name}.
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  )
}
