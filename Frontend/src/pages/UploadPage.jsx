import { useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import ApkDropzone from '../components/upload/ApkDropzone.jsx'
import CsvDropzone from '../components/upload/CsvDropzone.jsx'
import UploadCard from '../components/upload/UploadCard.jsx'
import UploadMethodTabs from '../components/upload/UploadMethodTabs.jsx'
import UrlInputCard from '../components/upload/UrlInputCard.jsx'
import Button from '../components/ui/Button.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import { useTenantContext } from '../context/TenantContext.jsx'
import { useUploadFlow } from '../hooks/useUploadFlow.js'
import { parseCsvPreview, uploadApkFile, uploadCsvFile, uploadWebsiteUrl } from '../services/uploadService.js'
import { REQUIRED_CSV_COLUMNS } from '../utils/csvSchema.js'

function ResultCard({ result, onViewDashboard, onViewFeatures, onViewTracking }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-1 h-5 w-5 text-emerald-300" />
        <div className="space-y-3">
          <div className="text-lg font-semibold text-white">
            {result.events_ingested
              ? `${result.events_ingested} events ingested successfully`
              : `${result.features?.length || 0} features detected successfully`}
          </div>
          <div className="text-sm text-emerald-100/80">
            {result.schema_match_score
              ? `Schema match: ${Math.round(result.schema_match_score * 100)}%`
              : 'Your feature graph is ready for validation and code generation.'}
          </div>
          <div className="flex flex-wrap gap-3">
            {result.events_ingested ? (
              <Button onClick={onViewDashboard}>View Dashboard</Button>
            ) : (
              <>
                <Button onClick={onViewFeatures}>View Features</Button>
                <Button variant="secondary" onClick={onViewTracking}>
                  Generate Tracking Code
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default function UploadPage() {
  const navigate = useNavigate()
  const { activeTenant } = useTenantContext()
  const {
    activeTab,
    setActiveTab,
    uploadProgress,
    setUploadProgress,
    previewRows,
    setPreviewRows,
    validationErrors,
    setValidationErrors,
    result,
    setResult,
    resetUploadFlow,
  } = useUploadFlow()
  const [apkFile, setApkFile] = useState(null)
  const [csvFile, setCsvFile] = useState(null)
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [crawlDepth, setCrawlDepth] = useState('1')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const tenantId = activeTenant?.id

  async function handleApkSelect(file) {
    setApkFile(file)
    setUploadProgress(25)
    setValidationErrors([])
  }

  async function submitApk() {
    if (!apkFile) return
    setIsSubmitting(true)
    setResult(null)
    try {
      setUploadProgress(70)
      const response = await uploadApkFile(apkFile)
      setUploadProgress(100)
      setResult(response)
    } catch (error) {
      setValidationErrors([error.message])
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCsvSelect(file) {
    setCsvFile(file)
    const preview = await parseCsvPreview(file)
    setPreviewRows(preview.rows)
    setValidationErrors(
      preview.missingColumns.length
        ? [`Missing required columns: ${preview.missingColumns.join(', ')}`]
        : [],
    )
  }

  async function submitCsv() {
    if (!csvFile) return
    setIsSubmitting(true)
    setResult(null)
    try {
      const response = await uploadCsvFile(csvFile)
      setResult(response)
    } catch (error) {
      setValidationErrors([error.message])
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitUrl() {
    if (!websiteUrl) return
    setIsSubmitting(true)
    setResult(null)
    const valid = /^https?:\/\/.+/i.test(websiteUrl)
    if (!valid) {
      setValidationErrors(['Please enter a valid website URL including http:// or https://'])
      setIsSubmitting(false)
      return
    }
    try {
      const response = await uploadWebsiteUrl({
        url: websiteUrl,
        crawlDepth: Number(crawlDepth),
      })
      setResult(response)
      setValidationErrors([])
    } catch (error) {
      setValidationErrors([error.message])
    } finally {
      setIsSubmitting(false)
    }
  }

  function resetCurrentTab() {
    resetUploadFlow()
    setApkFile(null)
    setCsvFile(null)
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Upload pipeline"
        title="Bring in your product surface"
        description="Upload an Android APK, crawl a web experience, or ingest usage events from CSV. Each flow validates inputs and hands off to the existing backend APIs."
      />
      {!tenantId ? (
        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
          Select a workspace first so we know where to attach uploads, detections, and analytics.
        </div>
      ) : null}
      <UploadMethodTabs
        activeTab={activeTab}
        onChange={(tab) => {
          setActiveTab(tab)
          resetCurrentTab()
          setWebsiteUrl('')
        }}
      />
      {validationErrors.length ? (
        <div className="rounded-3xl border border-rose-400/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          <div className="mb-2 flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            Validation issues
          </div>
          <ul className="space-y-1">
            {validationErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {activeTab === 'apk' ? (
        <UploadCard
          title="Android APK detection"
          description="Drag and drop an APK to generate a feature hierarchy and bootstrapped tracking plan."
          status={<Sparkles className="h-5 w-5 text-cyan-300" />}
        >
          <ApkDropzone
            file={apkFile}
            progress={uploadProgress}
            onFileSelect={handleApkSelect}
            onRemove={() => setApkFile(null)}
            disabled={!tenantId || isSubmitting}
          />
          <div className="flex justify-end">
            <Button onClick={submitApk} disabled={!apkFile || isSubmitting || !tenantId}>
              {isSubmitting ? 'Uploading APK...' : 'Upload APK'}
            </Button>
          </div>
        </UploadCard>
      ) : null}
      {activeTab === 'url' ? (
        <UploadCard
          title="Website intelligence"
          description="Enter a product URL, crawl the experience, and infer user-facing feature modules."
        >
          <UrlInputCard
            value={websiteUrl}
            crawlDepth={crawlDepth}
            onChange={setWebsiteUrl}
            onDepthChange={setCrawlDepth}
            onSubmit={submitUrl}
            loading={isSubmitting}
          />
        </UploadCard>
      ) : null}
      {activeTab === 'csv' ? (
        <UploadCard
          title="Usage dataset ingestion"
          description="Upload the behavioral CSV used by your ML model. We preview the first five rows and validate the schema before sending."
        >
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            Required columns: {REQUIRED_CSV_COLUMNS.join(', ')}
          </div>
          <CsvDropzone
            file={csvFile}
            previewRows={previewRows}
            requiredColumns={REQUIRED_CSV_COLUMNS}
            onFileSelect={handleCsvSelect}
            onRemove={() => setCsvFile(null)}
            disabled={!tenantId || isSubmitting}
          />
          <div className="flex justify-end">
            <Button
              onClick={submitCsv}
              disabled={!csvFile || isSubmitting || validationErrors.length > 0 || !tenantId}
            >
              {isSubmitting ? 'Uploading CSV...' : 'Upload CSV'}
            </Button>
          </div>
        </UploadCard>
      ) : null}
      {result ? (
        <ResultCard
          result={result}
          onViewDashboard={() => navigate(`/app/dashboard/${tenantId}`)}
          onViewFeatures={() => navigate(`/app/features/${tenantId}`)}
          onViewTracking={() => navigate(`/app/tracking/${tenantId}`)}
        />
      ) : null}
    </div>
  )
}
