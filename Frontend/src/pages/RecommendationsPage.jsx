import { useMemo, useState } from 'react'
import { RefreshCcw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useParams } from 'react-router-dom'
import AsanaConnectionBanner from '../components/recommendations/AsanaConnectionBanner.jsx'
import RecommendationCard from '../components/recommendations/RecommendationCard.jsx'
import Button from '../components/ui/Button.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import LoadingSkeleton from '../components/ui/LoadingSkeleton.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import { useRecommendationStore } from '../stores/recommendationStore.js'
import { useRecommendations } from '../hooks/useRecommendations.js'
import { dismissRecommendation, sendRecommendationToKanban } from '../services/recommendationService.js'
import { useAsanaIntegration } from '../hooks/useAsanaIntegration.js'

export default function RecommendationsPage() {
  const { tenantId } = useParams()
  const { priorityFilter, setPriorityFilter, search, setSearch } = useRecommendationStore()
  const [refreshKey, setRefreshKey] = useState(0)
  const params = useMemo(() => ({
    priority: priorityFilter === 'all' ? undefined : priorityFilter,
    refresh: refreshKey ? 'true' : undefined,
  }), [priorityFilter, refreshKey])
  const { recommendations, isLoading, error } = useRecommendations(tenantId, params)
  const { status, projects, sections } = useAsanaIntegration(tenantId)

  const filtered = useMemo(() => {
    return recommendations.filter((item) => {
      const matchesPriority = priorityFilter === 'all' || item.priority === priorityFilter
      const haystack = [item.feature_name, item.feature, item.problem, item.suggestion]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      const matchesSearch = !search || haystack.includes(search.toLowerCase())
      return matchesPriority && matchesSearch
    })
  }, [priorityFilter, recommendations, search])

  async function handleSendToKanban(recommendationId) {
    const projectId = status?.project_id || projects[0]?.id
    const sectionId = status?.section_id || sections[0]?.id
    if (!projectId) {
      toast.error('No Asana project configured. Go to the Asana page and save a mapping first.')
      return
    }
    try {
      await sendRecommendationToKanban({ tenantId, recommendationId, projectId, sectionId })
      toast.success('Recommendation sent to Asana Kanban')
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to send to Kanban')
    }
  }

  async function handleDismiss(recommendationId) {
    await dismissRecommendation(tenantId, recommendationId)
    setRefreshKey((value) => value + 1)
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Recommendation center"
        title="Turn churn signals into action"
        description="Prioritize the biggest drop-off features, turn recommendations into Kanban work, and keep product teams aligned with model output."
        actions={
          <Button variant="secondary" className="gap-2" onClick={() => setRefreshKey((value) => value + 1)}>
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />
      {!status?.connected ? <AsanaConnectionBanner tenantId={tenantId} /> : null}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search recommendations…"
          className="h-11 flex-1 rounded-3xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-white/20"
        />
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'all',      label: 'All',      classes: 'border-white/15 text-slate-400 hover:border-white/25 hover:text-white',                          active: 'border-white/30 bg-white/8 text-white' },
            { value: 'critical', label: 'Critical',  classes: 'border-rose-500/30 text-rose-400/70 hover:border-rose-500/60 hover:text-rose-300',               active: 'border-rose-500/60 bg-rose-500/20 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.2)]' },
            { value: 'high',     label: 'High',      classes: 'border-amber-400/30 text-amber-400/70 hover:border-amber-400/60 hover:text-amber-300',           active: 'border-amber-400/60 bg-amber-500/20 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)]' },
            { value: 'medium',   label: 'Medium',    classes: 'border-cyan-400/30 text-cyan-400/70 hover:border-cyan-400/60 hover:text-cyan-300',               active: 'border-cyan-400/50 bg-cyan-500/15 text-cyan-300' },
            { value: 'low',      label: 'Low',       classes: 'border-emerald-400/25 text-emerald-400/70 hover:border-emerald-400/50 hover:text-emerald-300',   active: 'border-emerald-400/50 bg-emerald-500/12 text-emerald-300' },
          ].map((pill) => (
            <button
              key={pill.value}
              onClick={() => setPriorityFilter(pill.value)}
              className={`rounded-full border px-4 py-2 text-xs font-bold tracking-wide transition-all duration-200 ${
                priorityFilter === pill.value ? pill.active : pill.classes
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <div className="space-y-4">
          <LoadingSkeleton rows={6} />
          <LoadingSkeleton rows={6} />
        </div>
      ) : error ? (
        <EmptyState icon={Sparkles} title="Could not load recommendations" description={error} />
      ) : !filtered.length ? (
        <EmptyState icon={Sparkles} title="No recommendations match these filters" description="Try broadening priority filters or refreshing after new uploads." />
      ) : (
        <div className="space-y-4">
          {filtered.map((recommendation) => (
            <RecommendationCard
              key={recommendation.id}
              recommendation={recommendation}
              asanaConnected={Boolean(status?.connected)}
              onSendToKanban={handleSendToKanban}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}
    </div>
  )
}
