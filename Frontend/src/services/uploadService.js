import { uploadApk, uploadCsv, uploadUrl } from '../api/upload.api.js'
import { parseCsvFile } from '../utils/csvSchema.js'

function normalizeError(error, fallback) {
  return error.response?.data?.error || error.message || fallback
}

export async function uploadApkFile(file) {
  try {
    return await uploadApk(file)
  } catch (error) {
    throw new Error(normalizeError(error, 'APK upload failed.'))
  }
}

export async function uploadWebsiteUrl({ url, crawlDepth = 0, manualPaths, selectedPaths }) {
  try {
    return await uploadUrl(url, crawlDepth, { manualPaths, selectedPaths })
  } catch (error) {
    throw new Error(normalizeError(error, 'Website analysis failed.'))
  }
}

export async function uploadCsvFile(file) {
  try {
    return await uploadCsv(file)
  } catch (error) {
    throw new Error(normalizeError(error, 'CSV upload failed.'))
  }
}

export async function parseCsvPreview(file) {
  return parseCsvFile(file, 5)
}
