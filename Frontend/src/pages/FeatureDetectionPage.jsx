import { useEffect, useMemo, useState } from 'react'
import { Boxes, ChevronRight, Search, X } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import LoadingSkeleton from '../components/ui/LoadingSkeleton.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import FeatureCard from '../components/features/FeatureCard.jsx'
import ConfidenceBadge from '../components/features/ConfidenceBadge.jsx'
import FeatureSummaryStats from '../components/features/FeatureSummaryStats.jsx'
import FeatureTree from '../components/features/FeatureTree.jsx'
import { getFeatures } from '../api/features.api.js'
import { fetchRecommendations } from '../services/recommendationService.js'
import { getFeatureUsage } from '../api/intelligence.api.js'
import FeatureAdoptionHeatmap from '../components/features/FeatureAdoptionHeatmap.jsx'

function buildTree(features) {
  const domains = new Map()

  features.forEach((feature, index) => {
    const domainKey = feature.l1_domain || 'Product Domain'
    const moduleKey = feature.l2_module || 'General Module'
    const featureKey = feature.l3_feature || feature.name || `Feature ${index + 1}`

    if (!domains.has(domainKey)) {
      domains.set(domainKey, { id: `domain-${domainKey}`, name: domainKey, children: [] })
    }

    const domainNode = domains.get(domainKey)
    let moduleNode = domainNode.children.find((child) => child.name === moduleKey)
    if (!moduleNode) {
      moduleNode = { id: `module-${domainKey}-${moduleKey}`, name: moduleKey, children: [] }
      domainNode.children.push(moduleNode)
    }

    moduleNode.children.push({
      id: feature.id || `feature-${index}`,
      name: featureKey,
      feature,
    })
  })

  return [...domains.values()]
}

function mergeFeatureSources(detectedFeatures, recommendations, featureUsage = []) {
  const merged = new Map()

  const usageMap = new Map()
  featureUsage.forEach((u) => usageMap.set((u.feature || '').toLowerCase(), u))

  detectedFeatures.forEach((feature, index) => {
    const key = String(feature.l3_feature || feature.name || `feature-${index}`).toLowerCase()
    merged.set(key, {
      ...feature,
      source_kind: 'detected',
    })
  })

  recommendations.forEach((recommendation, index) => {
    const featureName = recommendation.feature || recommendation.feature_name || recommendation.title
    if (!featureName) return

    const key = String(featureName).toLowerCase()
    const existing = merged.get(key)

    if (existing) {
      merged.set(key, {
        ...existing,
        recommendation: recommendation,
      })
      return
    }

    merged.set(key, {
      id: recommendation.id || `recommendation-feature-${index}`,
      name: featureName,
      l1_domain: 'Recommendations',
      l2_module: recommendation.category || 'Recommended actions',
      l3_feature: featureName,
      source_type: 'recommendation',
      confidence: recommendation.churn_score || recommendation.impact_score / 100 || 0.72,
      recommendation,
      source_kind: 'recommendation',
    })
  })

  // Attach usage data
  const mergedList = [...merged.values()]
  mergedList.forEach((feature) => {
    const key = String(feature.name || feature.l3_feature).toLowerCase()
    const usage = usageMap.get(key)
    if (usage) {
      feature.usage_count = usage.usage_count
      feature.success_rate = usage.success_rate
      feature.churn_rate = usage.churn_rate
    }
  })

  return mergedList
}

export default function FeatureDetectionPage() {
  const { tenantId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [expandedNodes, setExpandedNodes] = useState([])
  const [selectedFeatureId, setSelectedFeatureId] = useState(null)
  const [selectedFeature, setSelectedFeature] = useState(null)

  useEffect(() => {
    if (!tenantId) return
    setLoading(true)
    setError('')
    Promise.allSettled([
      getFeatures(tenantId),
      fetchRecommendations(tenantId),
      getFeatureUsage(tenantId),
    ])
      .then(([featuresResult, recommendationsResult, usageResult]) => {
        const features =
          featuresResult.status === 'fulfilled' ? (featuresResult.value.features || []) : []
        const recommendations =
          recommendationsResult.status === 'fulfilled' ? (recommendationsResult.value || []) : []
        const usageData = 
          usageResult.status === 'fulfilled'
            ? Array.isArray(usageResult.value)
              ? usageResult.value
              : usageResult.value?.rows || []
            : []
          
        const mergedFeatures = mergeFeatureSources(features, recommendations, usageData)

        setData(mergedFeatures)
        setExpandedNodes(buildTree(mergedFeatures).map((node) => node.id))

        if (!mergedFeatures.length) {
          const featureError =
            featuresResult.status === 'rejected' ? featuresResult.reason?.message : ''
          const recommendationError =
            recommendationsResult.status === 'rejected' ? recommendationsResult.reason?.message : ''
          setError(featureError || recommendationError || 'Could not load feature data.')
        }
      })
      .catch((loadError) => setError(loadError.message || 'Could not load feature data.'))
      .finally(() => setLoading(false))
  }, [tenantId])

  const filtered = useMemo(() => {
    if (!search) return data
    return data.filter((feature) =>
      [feature.name, feature.l1_domain, feature.l2_module, feature.l3_feature]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(search.toLowerCase())),
    )
  }, [data, search])

  const tree = useMemo(() => buildTree(filtered), [filtered])
  const averageConfidence =
    filtered.reduce((sum, feature) => sum + Number(feature.confidence || 0.72), 0) /
      (filtered.length || 1)

  function toggleNode(id) {
    setExpandedNodes((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Feature intelligence"
        title="Detected product hierarchy"
        description="Review the generated feature map, search the hierarchy, and move directly into tracking code generation."
        actions={<Button onClick={() => navigate(`/app/tracking/${tenantId}`)}>Generate Tracking Code</Button>}
      />
      {loading ? (
        <div className="grid gap-4 xl:grid-cols-[0.36fr_0.64fr]">
          <LoadingSkeleton rows={10} />
          <LoadingSkeleton rows={10} />
        </div>
      ) : error ? (
        <EmptyState icon={Boxes} title="Could not load features" description={error} />
      ) : !filtered.length ? (
        <EmptyState
          icon={Boxes}
          title="No features detected yet"
          description="Upload an APK, website URL, or dataset to populate the feature graph and recommendation-linked feature list."
          action={{ label: 'Back to upload', onClick: () => navigate('/app/upload') }}
        />
      ) : (
        <>
          <FeatureSummaryStats
            total={filtered.length}
            confidence={averageConfidence}
            categories={new Set(filtered.map((item) => item.l1_domain)).size}
            treeDepth={3}
          />
          <FeatureAdoptionHeatmap features={filtered} />
          <div className="grid gap-4 xl:grid-cols-[0.34fr_0.66fr]">
            <Card>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-500" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search features or categories"
                    className="h-12 w-full rounded-3xl border border-white/10 bg-slate-950/70 pl-11 pr-4 text-sm text-white outline-none"
                  />
                </div>
                <FeatureTree
                  nodes={tree}
                  expandedNodes={expandedNodes}
                  onToggle={toggleNode}
                  selectedId={selectedFeatureId}
                  onSelect={(node) => {
                    setSelectedFeatureId(node.feature?.id || node.id)
                    if (node.feature) setSelectedFeature(node.feature)
                  }}
                />
              </CardContent>
            </Card>
            <div className="grid gap-4 md:grid-cols-2">
              {filtered.map((feature) => (
                <FeatureCard
                  key={feature.id || feature.l3_feature}
                  feature={feature}
                  onSelect={(selected) => {
                    setSelectedFeatureId(selected.id)
                    setSelectedFeature(selected)
                  }}
                  onGenerateTracking={() => navigate(`/app/tracking/${tenantId}`)}
                />
              ))}
            </div>
          </div>

          {/* Feature detail panel */}
          {selectedFeature && (
            <Card>
              <CardContent className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-widest text-slate-500">Feature details</div>
                    <div className="text-xl font-semibold text-white">
                      {selectedFeature.name || selectedFeature.l3_feature}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ConfidenceBadge score={selectedFeature.confidence || 0.72} />
                    <button
                      onClick={() => setSelectedFeature(null)}
                      className="rounded-full p-1 text-slate-500 hover:bg-white/10 hover:text-white transition"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Hierarchy breadcrumb */}
                <div className="flex items-center gap-1.5 text-sm text-slate-400">
                  {[selectedFeature.l1_domain, selectedFeature.l2_module, selectedFeature.l3_feature]
                    .filter(Boolean)
                    .map((part, i, arr) => (
                      <span key={i} className="flex items-center gap-1.5">
                        <span className={i === arr.length - 1 ? 'text-cyan-300 font-medium' : ''}>{part}</span>
                        {i < arr.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-slate-600" />}
                      </span>
                    ))}
                </div>

                {/* Metadata grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Source', value: selectedFeature.source_type },
                    { label: 'Source kind', value: selectedFeature.source_kind },
                    { label: 'Recommendation category', value: selectedFeature.recommendation?.category },
                    { label: 'Action', value: selectedFeature.l4_action },
                    { label: 'Node', value: selectedFeature.l5_deployment_node },
                    { label: 'Upload ID', value: selectedFeature.upload_id },
                    { label: 'Raw name', value: selectedFeature.raw_name },
                  ]
                    .filter((row) => row.value)
                    .map((row) => (
                      <div key={row.label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">{row.label}</div>
                        <div className="text-sm text-white truncate">{row.value}</div>
                      </div>
                    ))}
                </div>

                {/* Evidence list */}
                {Array.isArray(selectedFeature.evidence) && selectedFeature.evidence.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-widest text-slate-500">Evidence</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedFeature.evidence.map((ev, i) => (
                        <span
                          key={i}
                          className="rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-200"
                        >
                          {ev.type}{ev.value ? ` — ${ev.value}` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedFeature.recommendation && (
                  <div className="space-y-3 rounded-3xl border border-cyan-400/15 bg-cyan-500/5 p-4">
                    <div className="text-xs uppercase tracking-widest text-cyan-300">Recommendation context</div>
                    <div className="text-sm text-slate-200">
                      {selectedFeature.recommendation.problem}
                    </div>
                    <div className="text-sm text-slate-400">
                      {selectedFeature.recommendation.suggestion}
                    </div>
                  </div>
                )}

                {/* Raw names */}
                {Array.isArray(selectedFeature.raw_names) && selectedFeature.raw_names.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-widest text-slate-500">Raw names detected</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedFeature.raw_names.map((name, i) => (
                        <span key={i} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 font-mono">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <Button onClick={() => navigate(`/app/tracking/${tenantId}`)} className="gap-2">
                    Generate tracking
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
