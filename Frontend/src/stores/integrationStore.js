import { create } from 'zustand'

export const useIntegrationStore = create((set) => ({
  selectedWorkspace: '',
  selectedProject: '',
  selectedColumn: '',
  setSelectedWorkspace: (selectedWorkspace) => set({ selectedWorkspace }),
  setSelectedProject: (selectedProject) => set({ selectedProject }),
  setSelectedColumn: (selectedColumn) => set({ selectedColumn }),
}))
