import { useEffect, useState } from 'react'
import { fetchTenants } from '../services/tenantService.js'

export function useWorkspaceSelection() {
  const [state, setState] = useState({
    tenants: [],
    isLoadingTenants: true,
    tenantError: '',
  })

  useEffect(() => {
    fetchTenants()
      .then((tenants) => setState({ tenants, isLoadingTenants: false, tenantError: '' }))
      .catch((error) =>
        setState({
          tenants: [],
          isLoadingTenants: false,
          tenantError: error.message || 'Unable to load workspaces.',
        }),
      )
  }, [])

  return state
}
