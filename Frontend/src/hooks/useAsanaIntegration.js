import { useEffect, useState } from 'react'
import {
  fetchAsanaProjects,
  fetchAsanaStatus,
  fetchAsanaWorkspaces,
} from '../services/asanaService.js'

export function useAsanaIntegration() {
  const [state, setState] = useState({
    status: null,
    workspaces: [],
    projects: [],
    isLoading: true,
    error: '',
  })

  useEffect(() => {
    Promise.allSettled([
      fetchAsanaStatus(),
      fetchAsanaWorkspaces(),
      fetchAsanaProjects(),
    ])
      .then(([status, workspaces, projects]) => {
        setState({
          status: status.status === 'fulfilled' ? status.value : null,
          workspaces: workspaces.status === 'fulfilled' ? workspaces.value : [],
          projects: projects.status === 'fulfilled' ? projects.value : [],
          isLoading: false,
          error: '',
        })
      })
      .catch((error) =>
        setState({
          status: null,
          workspaces: [],
          projects: [],
          isLoading: false,
          error: error.message || 'Unable to load Asana integration.',
        }),
      )
  }, [])

  return state
}
