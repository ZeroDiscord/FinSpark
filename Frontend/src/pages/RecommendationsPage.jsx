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
      <div className="flex flex-col gap-3 md:flex-row">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search recommendations"
          className="h-12 flex-1 rounded-3xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none"
        />
        <select
          value={priorityFilter}
          onChange={(event) => setPriorityFilter(event.target.value)}
          className="h-12 rounded-3xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none"
        >
          <option value="all">All priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
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
