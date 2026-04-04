import { useDashboardStore } from '../stores/dashboardStore.js'

export function useDashboardFilters() {
  const filters = useDashboardStore((state) => state.filters)
  const setFilter = useDashboardStore((state) => state.setFilter)
  const resetFilters = useDashboardStore((state) => state.resetFilters)
  return { filters, setFilter, resetFilters }
}
