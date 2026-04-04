export const chartPalette = ['#818cf8', '#38bdf8', '#06b6d4', '#a78bfa', '#f472b6', '#f59e0b']

export function buildTrendSeries(usage = []) {
  if (usage?.daily_usage?.length || usage?.weekly_churn?.length) {
    const churnMap = new Map((usage.weekly_churn || []).map((item) => [item.week, Number(item.churn_rate || 0) * 100]))
    return (usage.daily_usage || []).slice(-8).map((item, index) => ({
      label: item.date || `Day ${index + 1}`,
      usage: Number(item.event_count || item.session_count || 0),
      churn: index < (usage.weekly_churn || []).length
        ? Number((usage.weekly_churn || [])[index]?.churn_rate || 0) * 100
        : churnMap.get(item.date) || 0,
    }))
  }

  return usage.slice(0, 8).map((item, index) => ({
    label: item.feature || item.name || `Feature ${index + 1}`,
    usage: Number(item.usage_count || item.sessions || item.count || 0),
    churn: Number(item.churn_rate || item.churn || 0),
  }))
}

export function buildPieSeries(usage = []) {
  return usage.slice(0, 5).map((item, index) => ({
    name: item.module || item.l2_module || item.feature || `Module ${index + 1}`,
    value: Number(item.usage_count || item.count || 0),
    fill: chartPalette[index % chartPalette.length],
  }))
}

export function buildDropoffRows(friction = []) {
  return friction.slice(0, 6).map((item, index) => ({
    id: item.id || index,
    feature: item.feature || item.l3_feature || item.name || `Feature ${index + 1}`,
    dropoffRate: Number(item.dropoff_rate || item.churn_rate || item.friction_score || 0),
    impactedUsers: Number(item.users || item.sessions || item.drop_off_count || item.count || 0),
    recommendation: item.recommendation || 'Simplify this step and reduce dependency friction.',
  }))
}

export function buildHeatmapData(features = []) {
  if (features?.churn_by_feature?.length) {
    const channelRates = new Map((features.churn_by_channel || []).map((item) => [item.channel, Math.round(Number(item.churn_rate || 0) * 100)]))
    return features.churn_by_feature.slice(0, 9).map((item, index) => ({
      feature: item.feature || item.name || `Feature ${index + 1}`,
      web: channelRates.get('web') ?? Math.min(100, Math.round(Number(item.churn_rate || 0) * 100)),
      mobile: channelRates.get('android') ?? Math.min(100, Math.round(Number(item.avg_churn_probability || item.churn_rate || 0) * 100)),
      assisted: channelRates.get('assisted') ?? Math.min(100, Math.round(Number(item.churn_rate || 0) * 100)),
    }))
  }

  return features.slice(0, 9).map((item, index) => ({
    feature: item.feature || item.name || `Feature ${index + 1}`,
    web: Math.min(100, Math.round((item.churn_rate || 0.28) * 100)),
    mobile: Math.min(100, Math.round((item.confidence || 0.76) * 100)),
    assisted: Math.min(100, 40 + index * 6),
  }))
}
