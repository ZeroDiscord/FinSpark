export const chartPalette = ['#818cf8', '#38bdf8', '#06b6d4', '#a78bfa', '#f472b6', '#f59e0b']

export function buildTrendSeries(usage = []) {
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
    impactedUsers: Number(item.users || item.sessions || item.count || 0),
    recommendation: item.recommendation || 'Simplify this step and reduce dependency friction.',
  }))
}

export function buildHeatmapData(features = []) {
  return features.slice(0, 9).map((item, index) => ({
    feature: item.feature || item.name || `Feature ${index + 1}`,
    web: Math.min(100, Math.round((item.churn_rate || 0.28) * 100)),
    mobile: Math.min(100, Math.round((item.confidence || 0.76) * 100)),
    assisted: Math.min(100, 40 + index * 6),
  }))
}
