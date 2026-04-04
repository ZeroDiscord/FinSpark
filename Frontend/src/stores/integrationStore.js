import { create } from 'zustand'

export const useIntegrationStore = create((set) => ({
  selectedWorkspace: '',
  selectedProject: '',
  selectedColumn: 'Backlog',
  setSelectedWorkspace: (selectedWorkspace) => set({ selectedWorkspace }),
  setSelectedProject: (selectedProject) => set({ selectedProject }),
  setSelectedColumn: (selectedColumn) => set({ selectedColumn }),
}))
