import { useEffect, useMemo, useState } from 'react'
import { Download, Sparkles } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import IntegrationStepList from '../components/tracking/IntegrationStepList.jsx'
import PlatformSelector from '../components/tracking/PlatformSelector.jsx'
import CodeSnippetViewer from '../components/tracking/CodeSnippetViewer.jsx'
import Button from '../components/ui/Button.jsx'
import LoadingSkeleton from '../components/ui/LoadingSkeleton.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { getDownloadUrl, getSnippets } from '../api/tracking.api.js'
import { integrationStepsByPlatform, platformSnippetTemplates } from '../utils/snippetTemplates.js'

export default function TrackingCodePage() {
  const { tenantId } = useParams()
  const [platform, setPlatform] = useState('web')
  const [snippets, setSnippets] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tenantId) return
    getSnippets(tenantId)
      .then((payload) => setSnippets(payload))
      .catch(() => setSnippets(null))
      .finally(() => setLoading(false))
  }, [tenantId])

  const code = useMemo(() => {
    if (platform === 'web') return snippets?.js || platformSnippetTemplates.web
    return snippets?.kotlin || platformSnippetTemplates.android
  }, [platform, snippets])

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Instrumentation"
        title="Generate tracking code"
        description="Switch between web and Android output, copy the snippet, and hand the package to your application team."
      />
      <div className="flex items-center justify-between">
        <PlatformSelector value={platform} onValueChange={setPlatform} />
        <a href={tenantId ? getDownloadUrl(tenantId, platform === 'web' ? 'js' : 'kotlin') : '#'} onClick={() => toast.success('SDK download started')}>
          <Button variant="secondary" className="gap-2">
            <Download className="h-4 w-4" />
            Download SDK package
          </Button>
        </a>
      </div>
      {loading ? (
        <LoadingSkeleton rows={8} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[0.62fr_0.38fr]">
          <CodeSnippetViewer language={platform === 'web' ? 'javascript' : 'java'} code={code} />
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-cyan-300">
                  <Sparkles className="h-4 w-4" />
                  Integration steps
                </div>
                <IntegrationStepList steps={integrationStepsByPlatform[platform]} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-3">
                <div className="text-lg font-semibold text-white">Tracked event example</div>
                <p className="text-sm text-slate-400">
                  Standardize on the generated feature and action names to keep downstream analytics clean.
                </p>
                <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-4 text-sm text-slate-300">
                  {platform === 'web'
                    ? 'trackFeature({ feature: "Upload Documents", action: "open" })'
                    : 'AnalyticsTracker.track("Upload Documents", "open")'}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
