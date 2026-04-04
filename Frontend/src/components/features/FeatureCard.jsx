import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { Card, CardContent } from '../ui/Card.jsx'
import ConfidenceBadge from './ConfidenceBadge.jsx'

export default function FeatureCard({ feature, onSelect, onGenerateTracking }) {
  return (
    <motion.div whileHover={{ y: -4 }}>
      <Card className="h-full">
        <CardContent className="flex h-full flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="text-lg font-semibold text-white">
                {feature.name || feature.l3_feature}
              </div>
              <div className="text-sm text-cyan-300">
                {[feature.l1_domain, feature.l2_module, feature.l3_feature].filter(Boolean).join(' / ')}
              </div>
            </div>
            <ConfidenceBadge score={feature.confidence || 0.72} />
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-400">
            {feature.source_type ? (
              <span className="rounded-full border border-white/10 px-3 py-1">{feature.source_type}</span>
            ) : null}
            {feature.l4_action ? (
              <span className="rounded-full border border-white/10 px-3 py-1">{feature.l4_action}</span>
            ) : null}
          </div>
          <div className="mt-auto flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => onSelect(feature)}>
              View details
            </Button>
            <Button onClick={() => onGenerateTracking(feature)} className="gap-2">
              Generate tracking
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
