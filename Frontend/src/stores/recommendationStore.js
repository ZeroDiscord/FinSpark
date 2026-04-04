import { create } from 'zustand'

export const useRecommendationStore = create((set) => ({
  priorityFilter: 'all',
  search: '',
  setPriorityFilter: (priorityFilter) => set({ priorityFilter }),
  setSearch: (search) => set({ search }),
}))
