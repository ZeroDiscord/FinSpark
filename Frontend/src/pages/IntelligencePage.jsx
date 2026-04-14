import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  Brain,
  ChevronDown,
  ChevronUp,
  Clock,
  Maximize2,
  Minimize2,
  RefreshCcw,
  TrendingDown,
  Users,
  Zap,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getInsight } from '../api/intelligence.api.js'
import {
  ChurnDistributionChart,
  ConversionFunnelChart,
  EnvironmentDemographicsChart,
  FeatureCriticalityPolarChart,
} from '../components/intelligence/IntelligenceCharts.jsx'
import EnsembleBars from '../components/intelligence/EnsembleBars.jsx'
import FeatureTable from '../components/intelligence/FeatureTable.jsx'
import FeatureAdoptionHeatmap from '../components/intelligence/FeatureAdoptionHeatmap.jsx'

import PathFlowGraph from '../components/intelligence/PathFlowGraph.jsx'
import SessionRibbons from '../components/intelligence/SessionRibbons.jsx'
import SortableCard from '../components/intelligence/SortableCard.jsx'

import SectionHeader from '../components/ui/SectionHeader.jsx'
import { useIntelligenceData } from '../hooks/useIntelligenceData.js'

// ─── KPI strip ───────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = 'text-white', icon: Icon, pulse = false }) {
  return (
    <div className="flex-1 min-w-[120px] rounded-2xl border border-white/8 bg-slate-900/50 px-4 py-3 backdrop-blur">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[9px] uppercase tracking-widest text-slate-500">{label}</span>
        {Icon && <Icon className="h-3.5 w-3.5 text-slate-600" />}
      </div>
      <div className={`font-mono text-xl font-bold leading-none ${color} flex items-center gap-2`}>
        {pulse && <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />}
        {value ?? <span className="text-slate-700">—</span>}
      </div>
      {sub && <div className="mt-1 font-mono text-[9px] text-slate-600">{sub}</div>}
    </div>
  )
}

// ─── Phase pill ───────────────────────────────────────────────────────────────
function getPhaseMeta(n = 0) {
  if (n < 100) return { label: 'Cold Start', dot: 'bg-amber-400', text: 'text-amber-400', phase: 1 }
  if (n < 5000) return { label: 'Warm Up', dot: 'bg-emerald-500', text: 'text-emerald-400', phase: 2 }
  return { label: 'Production', dot: 'bg-cyan-400', text: 'text-cyan-400', phase: 3 }
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────
function DashCard({
  title,
  eyebrow,
  children,
  className = '',
  collapsible = true,
  defaultCollapsed = false,
  accent = 'emerald',
  noPad = false,
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [fullscreen, setFullscreen] = useState(false)
  const ref = useRef(null)

  const accentMap = {
    emerald: 'from-emerald-500/20 to-transparent border-emerald-500/20',
    rose: 'from-rose-500/20 to-transparent border-rose-500/20',
    indigo: 'from-indigo-500/20 to-transparent border-indigo-500/20',
    cyan: 'from-cyan-500/20 to-transparent border-cyan-500/20',
    amber: 'from-amber-500/20 to-transparent border-amber-500/20',
  }
  const accentBorder = {
    emerald: 'hover:border-emerald-500/30',
    rose: 'hover:border-rose-500/30',
    indigo: 'hover:border-indigo-500/30',
    cyan: 'hover:border-cyan-500/30',
    amber: 'hover:border-amber-500/30',
  }
  const accentGlow = {
    emerald: 'hover:shadow-[0_0_40px_rgba(16,185,129,0.08)]',
    rose: 'hover:shadow-[0_0_40px_rgba(244,63,94,0.08)]',
    indigo: 'hover:shadow-[0_0_40px_rgba(99,102,241,0.08)]',
    cyan: 'hover:shadow-[0_0_40px_rgba(34,211,238,0.08)]',
    amber: 'hover:shadow-[0_0_40px_rgba(245,158,11,0.08)]',
  }

  const cardContent = (
    <div
      ref={ref}
      className={`group relative overflow-hidden rounded-3xl border border-white/8 bg-slate-900/60 backdrop-blur-2xl shadow-[0_20px_70px_rgba(15,23,42,0.55)] transition-all duration-300 ${accentBorder[accent] || ''} ${accentGlow[accent] || ''} ${fullscreen ? 'fixed inset-4 z-[9999] overflow-y-auto' : ''} ${className}`}
    >
      {/* Top accent gradient bar */}
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accentMap[accent] || accentMap.emerald}`} />

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <div>
          {eyebrow && (
            <div className="font-mono text-[8px] uppercase tracking-[0.25em] text-slate-600 mb-0.5">
              {eyebrow}
            </div>
          )}
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        </div>
        <div className="flex items-center gap-1">
          {fullscreen ? (
            <button
              onClick={() => setFullscreen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-xl border border-white/8 bg-white/5 text-slate-500 hover:text-white transition-colors"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={() => setFullscreen(true)}
              className="flex h-7 w-7 items-center justify-center rounded-xl border border-white/8 bg-white/5 text-slate-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
          {collapsible && (
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="flex h-7 w-7 items-center justify-center rounded-xl border border-white/8 bg-white/5 text-slate-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
            >
              {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className={noPad ? '' : 'px-5 pb-5'}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )

  return cardContent
}

// ─── Filter bar ───────────────────────────────────────────────────────────────
function FilterPill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 font-mono text-[9px] uppercase tracking-widest transition-colors ${
        active
          ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
          : 'border-white/8 bg-white/3 text-slate-500 hover:border-white/15 hover:text-slate-300'
      }`}
    >
      {label}
    </button>
  )
}

// ─── Default card order ───────────────────────────────────────────────────────
const DEFAULT_CARDS = [
  'flow',
  'table',
  'ensemble',
  'heatmap',
  'ribbons',
  'funnel',
  'churn-hist',
  'env',
  'criticality',
]

// ─── Main page ────────────────────────────────────────────────────────────────
export default function IntelligencePage() {
  const { tenantId } = useParams()
  const data = useIntelligenceData(tenantId)

  const [cardOrder, setCardOrder] = useState(DEFAULT_CARDS)
  const [insightText, setInsightText] = useState(null)
  const [insightLoading, setInsightLoading] = useState(false)
  const [activeFilter, setActiveFilter] = useState('all') // all | churned | completed

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Load RAG insight once data is ready
  useEffect(() => {
    if (!tenantId || !data.friction?.length) return
    if (insightText || insightLoading) return
    const topFriction = [...(data.friction || [])]
      .sort((a, b) => b.drop_off_prob - a.drop_off_prob)[0]
    if (!topFriction) return
    setInsightLoading(true)
    getInsight(tenantId, `Why do users churn at ${topFriction.feature}? Give 3 concise bullet points.`)
      .then((r) => setInsightText(typeof r === 'string' ? r : r?.insight || r?.answer || null))
      .catch(() => setInsightText(null))
      .finally(() => setInsightLoading(false))
  }, [tenantId, data.friction, insightText, insightLoading])

  function handleDragEnd(event) {
    const { active, over } = event
    if (active.id !== over?.id) {
      setCardOrder((items) => {
        const oldIndex = items.indexOf(active.id)
        const newIndex = items.indexOf(over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  // Filtered sessions
  const filteredSessions = (data.sessions || []).filter((s) => {
    if (activeFilter === 'churned') return s.is_churn
    if (activeFilter === 'completed') return !s.is_churn
    return true
  })

  const totalSessions =
    data.kpis?.total_sessions ??
    data.churnDist?.total_sessions ??
    data.overview?.n_sessions ??
    null
  const churnRate =
    data.kpis?.churn_rate ??
    data.churnDist?.churn_rate ??
    data.overview?.churn_rate ??
    null
  const convRate = churnRate !== null ? 1 - churnRate : null
  const avgDuration =
    data.kpis?.avg_session_duration_ms
      ? Math.round(data.kpis.avg_session_duration_ms / 1000)
      : data.sessions?.length
        ? Math.round(data.sessions.reduce((s, x) => s + (x.duration_sec || 0), 0) / data.sessions.length)
        : null
  const phase = getPhaseMeta(totalSessions || 0)
  const criticalFriction = (data.friction || []).filter(
    (f) => f.severity === 'critical' || f.severity === 'high'
  ).length

  // Card render map
  const cardMap = {
    flow: (
      <SortableCard key="flow" id="flow" className="col-span-full">
        <DashCard
          id="flow"
          eyebrow="Application Path"
          title="Session Journey Flow Graph"
          accent="emerald"
          collapsible
          noPad
        >
          <div className="px-5 pb-5">
            <PathFlowGraph
              funnelEdges={data.funnelEdges}
              featureUsage={data.featureUsage}
              friction={data.friction}
            />
          </div>
        </DashCard>
      </SortableCard>
    ),

    heatmap: (
      <SortableCard key="heatmap" id="heatmap" className="col-span-full">
        <DashCard eyebrow="Adoption" title="Feature Adoption Heatmap" accent="emerald" collapsible>
          <div className="px-5 pb-5">
            <FeatureAdoptionHeatmap featureUsage={data.featureUsage} />
          </div>
        </DashCard>
      </SortableCard>
    ),

    ribbons: (
      <SortableCard key="ribbons" id="ribbons">
        <DashCard eyebrow="Session Replay" title="Event Ribbons" accent="cyan" collapsible>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {['all', 'churned', 'completed'].map((f) => (
              <FilterPill
                key={f}
                label={f === 'all' ? 'All Sessions' : f === 'churned' ? 'Churned' : 'Completed'}
                active={activeFilter === f}
                onClick={() => setActiveFilter(f)}
              />
            ))}
          </div>
          <SessionRibbons sessions={filteredSessions} />
        </DashCard>
      </SortableCard>
    ),

    funnel: (
      <SortableCard key="funnel" id="funnel">
        <DashCard eyebrow="Conversion" title="Global Conversion Funnel" accent="emerald" collapsible>
          <ConversionFunnelChart
            funnel={data.funnel}
            funnelEdges={data.funnelEdges}
            featureUsage={data.featureUsage}
          />
        </DashCard>
      </SortableCard>
    ),

    'churn-hist': (
      <SortableCard key="churn-hist" id="churn-hist">
        <DashCard eyebrow="BiLSTM Model" title="Churn Probability Distribution" accent="rose" collapsible>
          <ChurnDistributionChart churnDist={data.churnDist} />
        </DashCard>
      </SortableCard>
    ),

    env: (
      <SortableCard key="env" id="env">
        <DashCard eyebrow="Demographics" title="Session Outcome Split" accent="cyan" collapsible>
          <EnvironmentDemographicsChart
            sessions={data.sessions}
            segmentation={data.segmentation}
            churnDist={data.churnDist}
          />
        </DashCard>
      </SortableCard>
    ),

    criticality: (
      <SortableCard key="criticality" id="criticality">
        <DashCard eyebrow="Risk Radar" title="Feature Criticality" accent="rose" collapsible>
          <FeatureCriticalityPolarChart featureUsage={data.featureUsage} />
        </DashCard>
      </SortableCard>
    ),


    table: (
      <SortableCard key="table" id="table">
        <DashCard eyebrow="Intelligence" title="Feature Analytics Table" accent="indigo" collapsible>
          <FeatureTable featureUsage={data.featureUsage} friction={data.friction} />
        </DashCard>
      </SortableCard>
    ),


    ensemble: (
      <SortableCard key="ensemble" id="ensemble">
        <DashCard eyebrow="Model Ensemble" title="BiLSTM · Markov · N-gram" accent="indigo" collapsible>
          <EnsembleBars
            overview={data.overview}
            insight={insightText}
            insightLoading={insightLoading}
            friction={data.friction}
          />
        </DashCard>
      </SortableCard>
    ),
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <SectionHeader
        eyebrow="ML Intelligence"
        title="Session Journey Dashboard"
        description="Ensemble model insights — BiLSTM churn prediction, Markov flow analysis, and RAG attribution."
        actions={
          <button
            onClick={data.reload}
            className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        }
      />

      {/* KPI Strip */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-wrap gap-3"
      >
        <KpiCard
          label="Total Sessions"
          value={totalSessions?.toLocaleString()}
          icon={Users}
          color="text-white"
          sub="from current dataset"
        />
        <KpiCard
          label="Conversion Rate"
          value={convRate !== null ? `${(convRate * 100).toFixed(1)}%` : null}
          icon={Activity}
          color="text-emerald-400"
          sub={convRate !== null ? `${(churnRate * 100).toFixed(1)}% dataset churn` : undefined}
        />
        <KpiCard
          label="Churn Rate"
          value={churnRate !== null ? `${(churnRate * 100).toFixed(1)}%` : null}
          icon={TrendingDown}
          color="text-rose-400"
          pulse={churnRate !== null && churnRate > 0.3}
          sub="current dataset"
        />
        <KpiCard
          label="Avg Session"
          value={avgDuration !== null ? `${avgDuration}s` : null}
          icon={Clock}
          color="text-slate-200"
          sub="dataset average"
        />
        <KpiCard
          label="Friction Nodes"
          value={criticalFriction || null}
          icon={Zap}
          color={criticalFriction > 0 ? 'text-amber-400' : 'text-slate-400'}
          sub="high/critical"
        />
        <KpiCard
          label="BiLSTM AUC"
          value={data.overview?.lstm_val_auc ? data.overview.lstm_val_auc.toFixed(4) : null}
          icon={Brain}
          color={data.overview?.lstm_val_auc > 0.75 ? 'text-emerald-400' : 'text-amber-400'}
          sub="validation AUC"
        />
        <div className="flex items-center gap-2 rounded-2xl border border-white/8 bg-slate-900/50 px-4 py-3 backdrop-blur">
          <span className={`h-2 w-2 animate-pulse rounded-full ${phase.dot}`} />
          <div>
            <div className="font-mono text-[8px] uppercase tracking-widest text-slate-600">Phase {phase.phase}</div>
            <div className={`font-mono text-sm font-bold ${phase.text}`}>{phase.label}</div>
          </div>
        </div>
      </motion.div>

      {/* Error */}
      {data.error && !data.isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-3xl border border-rose-400/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-200"
        >
          {data.error}
        </motion.div>
      )}

      {/* Loading skeleton */}
      {data.isLoading && (
        <div className="grid gap-5 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-52 animate-pulse rounded-3xl border border-white/5 bg-slate-900/40"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      )}

      {/* Draggable dashboard grid */}
      {!data.isLoading && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={cardOrder} strategy={verticalListSortingStrategy}>
            {/* Row 1 — Full-width */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05 }}
              className="mb-5"
            >
              {cardMap[cardOrder[0]]}
            </motion.div>

            {/* Row 2 — 2-col (Table & Ensemble USPs) */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1 }}
              className="mb-5 grid gap-5 xl:grid-cols-2"
            >
              {cardOrder.slice(1, 3).map((id) => cardMap[id])}
            </motion.div>

            {/* Row 3 — Full-width Heatmap */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.15 }}
              className="mb-5 grid gap-5 lg:grid-cols-1"
            >
              {cardMap[cardOrder[3]]}
            </motion.div>

            {/* Row 4 — 2-col */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.2 }}
              className="grid gap-5 lg:grid-cols-3"
            >
              {cardOrder.slice(4, 7).map((id) => cardMap[id])}
            </motion.div>

            {/* Row 5 — 2-col */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.25 }}
              className="grid gap-5 lg:grid-cols-2"
            >
              {cardOrder.slice(7).map((id) => cardMap[id])}
            </motion.div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
