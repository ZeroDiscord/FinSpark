import { useEffect, useMemo, useState } from 'react'
import { Boxes, Search } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import LoadingSkeleton from '../components/ui/LoadingSkeleton.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import FeatureCard from '../components/features/FeatureCard.jsx'
import FeatureSummaryStats from '../components/features/FeatureSummaryStats.jsx'
import FeatureTree from '../components/features/FeatureTree.jsx'
import { getFeatures } from '../api/features.api.js'

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

export default function FeatureDetectionPage() {
  const { tenantId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [expandedNodes, setExpandedNodes] = useState([])
  const [selectedFeatureId, setSelectedFeatureId] = useState(null)

  useEffect(() => {
    if (!tenantId) return
    setLoading(true)
    getFeatures(tenantId)
      .then((response) => {
        const features = response.features || []
        setData(features)
        setExpandedNodes(buildTree(features).map((node) => node.id))
      })
      .catch((loadError) => setError(loadError.message || 'Could not load detected features.'))
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
          description="Upload an APK, website URL, or dataset to populate the feature graph."
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
                  onSelect={(node) => setSelectedFeatureId(node.feature?.id || node.id)}
                />
              </CardContent>
            </Card>
            <div className="grid gap-4 md:grid-cols-2">
              {filtered.map((feature) => (
                <FeatureCard
                  key={feature.id || feature.l3_feature}
                  feature={feature}
                  onSelect={(selected) => setSelectedFeatureId(selected.id)}
                  onGenerateTracking={() => navigate(`/app/tracking/${tenantId}`)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
