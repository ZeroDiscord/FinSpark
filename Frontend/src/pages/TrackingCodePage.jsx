import { useEffect, useMemo, useState } from 'react'
import { Download, Sparkles } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import IntegrationStepList from '../components/tracking/IntegrationStepList.jsx'
import CodeSnippetViewer from '../components/tracking/CodeSnippetViewer.jsx'
import Button from '../components/ui/Button.jsx'
import LoadingSkeleton from '../components/ui/LoadingSkeleton.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { getDownloadUrl, getSnippets } from '../api/tracking.api.js'

const PLATFORMS = [
  { id: 'js',     label: 'Browser JS',  lang: 'javascript' },
  { id: 'react',  label: 'React',       lang: 'javascript' },
  { id: 'node',   label: 'Node.js',     lang: 'javascript' },
  { id: 'python', label: 'Python',      lang: 'python' },
  { id: 'go',     label: 'Go',          lang: 'go' },
  { id: 'java',   label: 'Java',        lang: 'java' },
  { id: 'kotlin', label: 'Android',     lang: 'java' },
  { id: 'dart',   label: 'Flutter',     lang: 'dart' },
]

const INTEGRATION_STEPS = {
  js:     ['Add the snippet to your HTML <head> or JS bundle.', 'FinSparkSDK.init() is called automatically.', 'Call FinSparkSDK.track({ l1_domain, l3_feature, l4_action }) on user interactions.', 'Page views are tracked automatically on load and route change.'],
  react:  ['Install @finspark/analytics-react-sdk.', 'Import useTracker at component level.', 'Call track() in event handlers — the hook batches and flushes automatically.', 'Add the Next.js middleware snippet to enable session cookies server-side.'],
  node:   ['npm install @finspark/analytics-node-sdk', 'Import and mount finsparkMiddleware in your Express app.', 'All API routes are auto-tracked. Call tracker.track() for custom events.', 'Call tracker.shutdown() on SIGTERM for graceful flush.'],
  python: ['pip install finspark-analytics', 'Add finspark_middleware to your FastAPI app with app.middleware("http").', 'Use the @track_feature decorator on individual functions for fine-grained tracking.', 'tracker.flush() is called automatically every 5 s and at shutdown.'],
  go:     ['go get github.com/finspark/analytics-go', 'Call finspark.NewTracker(endpoint) once at startup.', 'Mount FinSparkMiddleware on your Fiber or Gin router.', 'Call tracker.Shutdown() via defer or os.Signal handler.'],
  java:   ['Add the Maven dependency to pom.xml.', 'Instantiate FinSparkTracker as a Spring bean.', 'Register FinSparkFilter as a @Component — all HTTP requests are auto-tracked.', 'Add a JVM shutdown hook calling tracker.shutdown().'],
  kotlin: ['Add the Gradle dependency to build.gradle.', 'Call FinSparkTracker.init(applicationContext, userId) in Application.onCreate.', 'Call trackFeature() from Activities, Fragments, or ViewModels.', 'Tracker flushes automatically every 5 s and on app close.'],
  dart:   ['Add finspark_tracker.dart to your Flutter project.', 'Call await FinSparkTracker.init() in main().', 'Call FinSparkTracker.track(feature, action) anywhere in your widget tree.', 'Tracker auto-flushes every 5 s; call flush() manually before app termination.'],
}

export default function TrackingCodePage() {
  const { tenantId } = useParams()
  const [platform, setPlatform] = useState('js')
  const [snippets, setSnippets] = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!tenantId) return
    getSnippets(tenantId)
      .then(payload => setSnippets(payload))
      .catch(() => setSnippets(null))
      .finally(() => setLoading(false))
  }, [tenantId])

  const code = useMemo(() => {
    if (!snippets) return `// Could not load tenant-specific snippet.\n// Check that the backend is running and this tenant has detected features.`
    return snippets[platform] || `// No snippet available for ${platform}.`
  }, [platform, snippets])

  const currentPlatform = PLATFORMS.find(p => p.id === platform)

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Instrumentation"
        title="Generate tracking code"
        description="Select your target platform to get a ready-to-use SDK snippet. Each snippet includes auto-initialisation, session management, batching, and a middleware example."
      />

      {/* Platform tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {PLATFORMS.map(p => (
          <button
            key={p.id}
            onClick={() => setPlatform(p.id)}
            className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
              platform === p.id
                ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/30'
                : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
            }`}
          >
            {p.label}
          </button>
        ))}

        <div className="ml-auto">
          <a
            href={tenantId ? getDownloadUrl(tenantId, platform) : '#'}
            onClick={() => toast.success('SDK download started')}
          >
            <Button variant="secondary" className="gap-2">
              <Download className="h-4 w-4" />
              Download SDK
            </Button>
          </a>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={8} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[0.62fr_0.38fr]">
          <CodeSnippetViewer language={currentPlatform?.lang ?? 'javascript'} code={code} />
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-cyan-300">
                  <Sparkles className="h-4 w-4" />
                  Integration steps — {currentPlatform?.label}
                </div>
                <IntegrationStepList steps={INTEGRATION_STEPS[platform] ?? []} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-3">
                <div className="text-lg font-semibold text-white">Event schema</div>
                <p className="text-sm text-slate-400">
                  Every event follows the canonical 5-level hierarchy regardless of platform.
                </p>
                <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-xs text-slate-300 font-mono leading-relaxed">
                  {'tenant_id · session_id · user_id'}<br />
                  {'l1_domain › l2_module › l3_feature › l4_action'}<br />
                  {'duration_ms · success · metadata · churn_label'}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
