import { Layers3, Network, Sparkles, Target } from 'lucide-react'
import StatsCard from '../ui/StatsCard.jsx'

export default function FeatureSummaryStats({ total, confidence, categories, treeDepth }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatsCard title="Detected Features" value={total} delta="Across uploaded artifacts" icon={Layers3} />
      <StatsCard title="Avg Confidence" value={`${Math.round(confidence * 100)}%`} delta="Model certainty" icon={Target} />
      <StatsCard title="Categories" value={categories} delta="Business and product groupings" icon={Sparkles} />
      <StatsCard title="Tree Depth" value={treeDepth} delta="Hierarchy levels mapped" icon={Network} />
    </div>
  )
}
