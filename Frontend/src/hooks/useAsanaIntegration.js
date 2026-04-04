import { useEffect, useState } from 'react'
import {
  fetchAsanaProjects,
  fetchAsanaSections,
  fetchAsanaStatus,
  fetchAsanaWorkspaces,
} from '../services/asanaService.js'

export function useAsanaIntegration(tenantId) {
  const [state, setState] = useState({
    status: null,
    workspaces: [],
    projects: [],
    sections: [],
    isLoading: true,
    error: '',
  })

  useEffect(() => {
    if (!tenantId) return
    let cancelled = false

    async function load() {
      setState((current) => ({ ...current, isLoading: true, error: '' }))
      try {
        const status = await fetchAsanaStatus(tenantId)
        const workspaces = status.connected ? await fetchAsanaWorkspaces(tenantId) : []
        const projects = status.connected && status.workspace_id
          ? await fetchAsanaProjects(tenantId, status.workspace_id)
          : []
        const sections = status.connected && status.project_id
          ? await fetchAsanaSections(tenantId, status.project_id)
          : []

        if (cancelled) return
        setState({
          status,
          workspaces,
          projects,
          sections,
          isLoading: false,
          error: '',
        })
      } catch (error) {
        if (cancelled) return
        setState({
          status: null,
          workspaces: [],
          projects: [],
          sections: [],
          isLoading: false,
          error: error.response?.data?.error || error.message || 'Unable to load Asana integration.',
        })
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [tenantId])

  return state
}
