import { create } from 'zustand'

const defaults = {
  dateRange: '30d',
  deploymentType: 'all',
  channel: 'all',
}

export const useDashboardStore = create((set) => ({
  filters: defaults,
  setFilter: (key, value) =>
    set((state) => ({ filters: { ...state.filters, [key]: value } })),
  resetFilters: () => set({ filters: defaults }),
}))
