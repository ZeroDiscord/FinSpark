import { create } from 'zustand'

export const useUploadStore = create((set) => ({
  activeTab: 'apk',
  uploadProgress: 0,
  previewRows: [],
  validationErrors: [],
  result: null,
  setActiveTab: (activeTab) => set({ activeTab }),
  setUploadProgress: (uploadProgress) => set({ uploadProgress }),
  setPreviewRows: (previewRows) => set({ previewRows }),
  setValidationErrors: (validationErrors) => set({ validationErrors }),
  setResult: (result) => set({ result }),
  resetUploadFlow: () =>
    set({
      uploadProgress: 0,
      previewRows: [],
      validationErrors: [],
      result: null,
    }),
}))
