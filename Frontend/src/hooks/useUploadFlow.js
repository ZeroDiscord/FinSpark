import { useUploadStore } from '../stores/uploadStore.js'

export function useUploadFlow() {
  return useUploadStore()
}
