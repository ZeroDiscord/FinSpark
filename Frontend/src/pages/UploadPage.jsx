import { useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import ApkDropzone from '../components/upload/ApkDropzone.jsx'
import CsvDropzone from '../components/upload/CsvDropzone.jsx'
import TrainModelPanel from '../components/upload/TrainModelPanel.jsx'
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
  const isAiExtracted = result.extraction_mode === 'ai'
  const isUrl = Boolean(result.page_title)
  const subtitle = result.schema_match_score
    ? `Schema match: ${Math.round(result.schema_match_score * 100)}%`
    : isAiExtracted && isUrl
    ? `AI agent crawled ${result.summary?.pages_crawled ?? '?'} pages and extracted user-facing features with L1/L2/L3 hierarchy.`
    : isAiExtracted
    ? 'AI agent analyzed the decompiled APK and identified user-facing features with L1/L2/L3 hierarchy.'
    : 'Your feature graph is ready for validation and code generation.'

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-1 h-5 w-5 text-emerald-300" />
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-lg font-semibold text-white">
              {result.events_ingested
                ? `${result.events_ingested} events ingested successfully`
                : `${result.features?.length || 0} features detected successfully`}
            </div>
            {isAiExtracted ? (
              <span className="rounded-full border border-violet-400/30 bg-violet-500/20 px-2.5 py-0.5 text-xs font-medium text-violet-300">
                AI extracted
              </span>
            ) : null}
            {result.page_title ? (
              <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-0.5 text-xs text-cyan-300">
                {result.page_title}
              </span>
            ) : null}
          </div>
          <div className="text-sm text-emerald-100/80">{subtitle}</div>
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

  // Called by UrlInputCard for both manual and crawl modes
  async function submitUrl({ url, manualPaths, selectedPaths, crawlDepth, mode }) {
    setIsSubmitting(true)
    setResult(null)
    setValidationErrors([])
    try {
      let response
      if (mode === 'manual') {
        // For manual mode, send each path as a full URL for analysis
        response = await uploadWebsiteUrl({ url, manualPaths, crawlDepth: 0 })
      } else {
        // For crawl mode, send the base URL + selected paths
        response = await uploadWebsiteUrl({ url, selectedPaths, crawlDepth: crawlDepth || 2 })
      }
      setResult(response)
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
    setValidationErrors([])
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
          description="Manually add known paths or let the spider discover them — then run the AI agent to extract user-facing features. Also grab a request logger snippet to track real user paths in production."
        >
          <UrlInputCard onSubmit={submitUrl} loading={isSubmitting} />
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
      {/* Non-CSV results (APK / URL) show the standard card */}
      {result && !result.events_ingested ? (
        <ResultCard
          result={result}
          onViewDashboard={() => navigate(`/app/dashboard/${tenantId}`)}
          onViewFeatures={() => navigate(`/app/features/${tenantId}`)}
          onViewTracking={() => navigate(`/app/tracking/${tenantId}`)}
        />
      ) : null}
      {/* CSV upload: auto-starts training immediately, no button needed */}
      {result?.events_ingested && tenantId ? (
        <TrainModelPanel tenantId={tenantId} eventsIngested={result.events_ingested} autoStart />
      ) : null}
    </div>
  )
}
