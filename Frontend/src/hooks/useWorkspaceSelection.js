import { useCallback, useEffect, useState } from 'react'
import { fetchTenants } from '../services/tenantService.js'

export function useWorkspaceSelection() {
  const [tick, setTick] = useState(0)
  const [state, setState] = useState({
    tenants: [],
    isLoadingTenants: true,
    tenantError: '',
  })

  useEffect(() => {
    setState((prev) => ({ ...prev, isLoadingTenants: true }))
    fetchTenants()
      .then((tenants) => setState({ tenants, isLoadingTenants: false, tenantError: '' }))
      .catch((error) =>
        setState({
          tenants: [],
          isLoadingTenants: false,
          tenantError: error.message || 'Unable to load workspaces.',
        }),
      )
  }, [tick])

  const reload = useCallback(() => setTick((n) => n + 1), [])

  return { ...state, reload }
}
