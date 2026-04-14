/**
 * Intelligence Charts — all data is live from ML backend:
 *
 * ChurnDistributionChart  → /dashboard/:tenantId/churn-distribution
 *   real BiLSTM predicted probabilities binned into 20 buckets
 *   fields: bins[], complete_counts[], churn_counts[], churn_rate, total_sessions
 *
 * ConversionFunnelChart   → /dashboard/:tenantId/funnel (Markov edges)
 *   aggregates real transition probabilities into named pipeline stages
 *   fields: source, target, probability
 *
 * DailyTrendChart         → /dashboard/time-insights (weekly churn from dataset)
 *   uses real weekly churn values from the current tenant dataset
 *   converts weekly churn into weekly conversion for the chart
 *
 * FeatureCriticalityPolarChart → /dashboard/:tenantId/feature-usage
 *   real P(churn | feature) per feature from conditional probability
 *   fields: feature, usage_count, usage_pct, churn_rate
 *
 * EnvironmentDoughnutChart → /dashboard/:tenantId/sessions
 *   sessions have no platform field — renders session outcome split instead
 *   (churn vs complete) which is real data
 */

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  RadialLinearScale,
  Title,
  Tooltip,
} from 'chart.js'
import { Bar, Doughnut, Line, PolarArea } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler
)

ChartJS.defaults.color = '#94a3b8'
ChartJS.defaults.borderColor = 'rgba(51,65,85,0.4)'
ChartJS.defaults.font.family = "'Inter', sans-serif"

function NoData({ label = 'No data available' }) {
  return (
    <div className="flex min-h-45 items-center justify-center text-xs font-mono text-slate-500">
      {label}
    </div>
  )
}

function normalizeUsageRows(featureUsage) {
  if (Array.isArray(featureUsage)) return featureUsage
  if (Array.isArray(featureUsage?.rows)) return featureUsage.rows
  return []
}

function normalizeFunnelEdges(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.edges)) return payload.edges
  if (Array.isArray(payload?.rows)) return payload.rows
  return []
}

function deriveDynamicFunnelSteps(funnelEdges, featureUsage) {
  const terminalStates = new Set(['drop_off', 'session_end', 'exit', 'disbursement'])
  const usageRows = normalizeUsageRows(featureUsage)
  const edgeRows = normalizeFunnelEdges(funnelEdges).filter(
    (edge) => edge?.source && edge?.target && Number(edge.probability || 0) > 0
  )

  const usageMap = new Map(usageRows.map((row) => [row.feature, Number(row.usage_count || 0)]))
  const nodeScores = new Map()
  const incoming = new Map()
  const outgoing = new Map()

  function ensureNode(node) {
    if (!node) return
    if (!incoming.has(node)) incoming.set(node, new Set())
    if (!outgoing.has(node)) outgoing.set(node, new Set())
    if (!nodeScores.has(node)) nodeScores.set(node, usageMap.get(node) || 0)
  }

  edgeRows.forEach((edge) => {
    const countish = Math.max(
      Number(edge.count || 0),
      Math.round(Number(edge.probability || 0) * 1000)
    )
    ensureNode(edge.source)
    ensureNode(edge.target)
    incoming.get(edge.target).add(edge.source)
    outgoing.get(edge.source).add(edge.target)
    nodeScores.set(edge.source, Math.max(nodeScores.get(edge.source) || 0, countish, usageMap.get(edge.source) || 0))
    nodeScores.set(edge.target, Math.max(nodeScores.get(edge.target) || 0, countish, usageMap.get(edge.target) || 0))
  })

  usageRows.forEach((row) => ensureNode(row.feature))

  const nonTerminalNodes = [...nodeScores.keys()].filter(
    (node) => !terminalStates.has(node) && (nodeScores.get(node) || 0) > 0
  )
  if (!nonTerminalNodes.length) return []

  const indegree = new Map(
    nonTerminalNodes.map((node) => [
      node,
      [...(incoming.get(node) || [])].filter((parent) => !terminalStates.has(parent)).length,
    ])
  )

  const queue = nonTerminalNodes
    .filter((node) => (indegree.get(node) || 0) === 0)
    .sort((a, b) => (nodeScores.get(b) || 0) - (nodeScores.get(a) || 0) || a.localeCompare(b))

  const ordered = []
  const visited = new Set()

  while (queue.length) {
    const node = queue.shift()
    if (!node || visited.has(node)) continue
    visited.add(node)
    ordered.push(node)

    ;[...(outgoing.get(node) || [])]
      .filter((child) => indegree.has(child))
      .forEach((child) => {
        indegree.set(child, Math.max(0, (indegree.get(child) || 0) - 1))
        if ((indegree.get(child) || 0) === 0) {
          queue.push(child)
          queue.sort((a, b) => (nodeScores.get(b) || 0) - (nodeScores.get(a) || 0) || a.localeCompare(b))
        }
      })
  }

  const orderedNodes = [
    ...ordered,
    ...nonTerminalNodes
      .filter((node) => !visited.has(node))
      .sort((a, b) => (nodeScores.get(b) || 0) - (nodeScores.get(a) || 0) || a.localeCompare(b)),
  ]

  return orderedNodes
    .map((node, index) => {
      const users = Math.max(0, Math.round(nodeScores.get(node) || 0))
      const prevUsers = index === 0
        ? users
        : Math.max(1, Math.round(nodeScores.get(orderedNodes[index - 1]) || 0))
      return {
        step: node,
        users,
        conversion_percentage: index === 0 ? 100 : Number(((users / prevUsers) * 100).toFixed(2)),
        drop_off_percentage: index === 0 ? 0 : Number((Math.max(0, ((prevUsers - users) / prevUsers) * 100)).toFixed(2)),
      }
    })
    .filter((row) => row.users > 0)
}

// ─── Churn Probability Distribution (BiLSTM) ─────────────────────────────────
// Source: /dashboard/:tenantId/churn-distribution
// bins[]: 20 evenly-spaced probability buckets [0, 0.05, 0.10, …, 0.95]
// complete_counts[]: sessions predicted non-churn per bucket (label == 0)
// churn_counts[]:    sessions predicted churn per bucket     (label == 1)
export function ChurnDistributionChart({ churnDist }) {
  if (!churnDist?.bins?.length) return <NoData label="Awaiting LSTM predictions…" />

  const data = {
    labels: churnDist.bins.map((b) => b.toFixed(2)),
    datasets: [
      {
        label: 'Completed',
        data: churnDist.complete_counts,
        backgroundColor: 'rgba(16,185,129,0.35)',
        borderColor: '#10b981',
        borderWidth: 1,
        barPercentage: 0.95,
        categoryPercentage: 1,
      },
      {
        label: 'Churned',
        data: churnDist.churn_counts,
        backgroundColor: 'rgba(244,63,94,0.45)',
        borderColor: '#f43f5e',
        borderWidth: 1,
        barPercentage: 0.95,
        categoryPercentage: 1,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { display: false },
        ticks: { maxRotation: 45, font: { size: 8 }, color: '#64748b' },
        title: { display: true, text: 'Predicted Churn Probability', font: { size: 9 }, color: '#64748b' },
      },
      y: {
        grid: { color: 'rgba(51,65,85,0.3)' },
        border: { display: false },
        ticks: { font: { size: 9 }, color: '#64748b' },
        title: { display: true, text: 'Session Count', font: { size: 9 }, color: '#64748b' },
      },
    },
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: { boxWidth: 8, usePointStyle: true, font: { size: 10 }, color: '#94a3b8' },
      },
      tooltip: {
        callbacks: {
          title: (items) => `Prob bucket: ${items[0].label}`,
          label: (item) => `${item.dataset.label}: ${item.raw} sessions`,
          afterBody: () => [
            `Total sessions: ${churnDist.total_sessions}`,
            `Overall churn rate: ${(churnDist.churn_rate * 100).toFixed(1)}%`,
          ],
        },
      },
    },
  }

  return (
    <div style={{ height: 220, position: 'relative' }}>
      <Bar data={data} options={options} />
    </div>
  )
}

// ─── Conversion Funnel ────────────────────────────────────────────────────────
// Primary source: /dashboard/funnel (backend-derived steps from actual dataset)
//   { steps: [{ step, users, conversion_percentage, drop_off_percentage }],
//     biggest_drop_off_step }
// Fallback: derive from funnelEdges / featureUsage when funnel prop is absent.

export function ConversionFunnelChart({ funnel, funnelEdges, featureUsage }) {
  // ── Try the backend funnel data first (actual dataset-driven) ───────────────
  const backendSteps = (Array.isArray(funnel?.steps) ? funnel.steps : Array.isArray(funnel?.rows) ? funnel.rows : [])
    .map((step) => ({
      step: step?.step || step?.label || step?.feature || 'Unknown Step',
      users: Number(step?.users ?? step?.count ?? step?.sessions ?? 0),
      conversion_percentage: Number(step?.conversion_percentage ?? step?.conversion ?? 0),
      drop_off_percentage: Number(step?.drop_off_percentage ?? step?.dropoff_percentage ?? 0),
    }))
    .filter((s) => s.users > 0)


  // ── Fallback: derive from featureUsage / funnelEdges (legacy) ───────────────
  const resolvedSteps = backendSteps.length
    ? backendSteps
    : deriveDynamicFunnelSteps(funnelEdges, featureUsage)

  if (!resolvedSteps.length) return <NoData label="No funnel data available" />

  const maxCount = Math.max(...resolvedSteps.map((step) => step.users), 1)

  const data = {
    labels: resolvedSteps.map((step) => step.step.replace(/_/g, ' ')),
    datasets: [
      {
        label: 'Sessions',
        data: resolvedSteps.map((step) => step.users),
        backgroundColor: resolvedSteps.map((_, i) =>
          `rgba(16,185,129,${Math.max(0.25, 0.9 - i * (0.65 / Math.max(resolvedSteps.length - 1, 1)))})`
        ),
        borderColor: '#10b981',
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  }

  const options = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { color: 'rgba(51,65,85,0.3)' },
        border: { display: false },
        ticks: { font: { size: 9 }, color: '#64748b' },
        max: Math.ceil(maxCount * 1.1),
      },
      y: {
        grid: { display: false },
        ticks: { font: { size: 10 }, color: '#94a3b8' },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (item) => {
            const step = resolvedSteps[item.dataIndex]
            return [
              `${item.raw.toLocaleString()} sessions`,
              `Conversion: ${(step.conversion_percentage || 0).toFixed(1)}%`,
              step.drop_off_percentage > 0 ? `Drop-off: ${step.drop_off_percentage.toFixed(1)}%` : null,
            ].filter(Boolean)
          },
          afterBody: () =>
            funnel?.biggest_drop_off_step
              ? [`Biggest drop-off: ${String(funnel.biggest_drop_off_step).replace(/_/g, ' ')}`]
              : [],
        },
      },
    },
  }

  return (
    <div style={{ height: Math.max(180, resolvedSteps.length * 44), position: 'relative' }}>
      <Bar data={data} options={options} />
      <p className="absolute bottom-0 right-0 text-right font-mono text-[8px] uppercase tracking-widest text-slate-600">
        dataset-derived funnel · {resolvedSteps.length} steps
      </p>
    </div>
  )
}

// ─── Daily Trend (derived from real churn_rate) ───────────────────────────────
// No time-series endpoint exists. We use the real overall churn_rate from the
// LSTM churn-distribution response and show conversion = 1 - churn_rate as a
// reference line with a note. NOT mock data — just stable baseline.
export function DailyTrendChart({ timeInsights }) {
  // Use real weekly churn data from the tenant dataset.
  const weekly = [...(timeInsights?.weekly_churn || [])]
    .filter((row) => row?.week)
    .sort((a, b) => String(a.week).localeCompare(String(b.week)))

  if (!weekly.length) return <NoData label="Awaiting time-series dataset signals..." />

  const labels = weekly.map((row) => row.week)
  const baseData = weekly.map((row) => Math.max(0, Math.min(1, 1 - Number(row.churn_rate || 0))))
  const averageConversion =
    baseData.reduce((sum, value) => sum + value, 0) / Math.max(baseData.length, 1)

  const data = {
    labels,
    datasets: [
      {
        label: 'Conversion Rate',
        data: baseData,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16,185,129,0.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#10b981',
        borderWidth: 2,
      },
      {
        // Reference line at actual churn_rate-based conversion
        label: 'Dataset Average',
        data: labels.map(() => averageConversion),
        borderColor: 'rgba(100,116,139,0.4)',
        borderDash: [4, 4],
        borderWidth: 1,
        pointRadius: 0,
        fill: false,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#64748b' } },
      y: {
        min: Math.max(0, Math.min(...baseData) - 0.1),
        max: Math.min(1, Math.max(...baseData) + 0.1),
        grid: { color: 'rgba(51,65,85,0.3)' },
        border: { display: false },
        ticks: {
          font: { size: 9 },
          color: '#64748b',
          callback: (v) => `${(v * 100).toFixed(0)}%`,
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (item) => `Conversion: ${(item.raw * 100).toFixed(1)}%`,
          afterBody: (items) => [
            `Weekly churn: ${((1 - items[0].raw) * 100).toFixed(1)}%`,
            `Dataset average conversion: ${(averageConversion * 100).toFixed(1)}%`,
          ],
        },
      },
    },
  }

  return (
    <div className="relative" style={{ height: 220 }}>
      <Line data={data} options={options} />
      <p className="absolute bottom-0 right-0 text-right font-mono text-[8px] uppercase tracking-widest text-slate-600">
        Dataset-driven weekly trend · {weekly.length} periods
      </p>
    </div>
  )
}

// ─── Session Outcome Doughnut ─────────────────────────────────────────────────
// Source: /dashboard/:tenantId/sessions
// Sessions have no platform field — renders real churn vs complete split instead
// using actual is_churn labels from sampled sessions.
// Also shows churn_rate from churnDist if available.
export function SessionOutcomeChart({ sessions, churnDist }) {
  // Prefer real LSTM churn_rate from distribution (full dataset)
  // Fallback to sampled session counts
  let churned, completed, source

  if (churnDist?.total_sessions > 0) {
    const totalChurned = churnDist.churn_counts.reduce((a, b) => a + b, 0)
    const totalCompleted = churnDist.complete_counts.reduce((a, b) => a + b, 0)
    churned = totalChurned
    completed = totalCompleted
    source = 'full dataset'
  } else if (sessions?.length) {
    churned = sessions.filter((s) => s.is_churn).length
    completed = sessions.filter((s) => !s.is_churn).length
    source = `${sessions.length} sample sessions`
  }

  if (churned === undefined) return <NoData label="Awaiting session data…" />

  const data = {
    labels: ['Completed', 'Churned'],
    datasets: [
      {
        data: [completed, churned],
        backgroundColor: ['rgba(16,185,129,0.8)', 'rgba(244,63,94,0.75)'],
        borderColor: ['#10b981', '#f43f5e'],
        borderWidth: 1,
        hoverOffset: 6,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      legend: {
        position: 'right',
        labels: { usePointStyle: true, font: { size: 10 }, color: '#94a3b8', padding: 16 },
      },
      tooltip: {
        callbacks: {
          label: (item) => {
            const total = completed + churned
            const pct = total > 0 ? ((item.raw / total) * 100).toFixed(1) : '0'
            return ` ${item.label}: ${item.raw.toLocaleString()} (${pct}%)`
          },
        },
      },
    },
  }

  return (
    <div className="relative" style={{ height: 220 }}>
      <Doughnut data={data} options={options} />
      <p className="absolute bottom-0 right-0 text-right font-mono text-[8px] uppercase tracking-widest text-slate-600">
        {source}
      </p>
    </div>
  )
}

// ─── Feature Criticality Polar Area ──────────────────────────────────────────
// Source: /dashboard/:tenantId/feature-usage
// Values = real P(churn | feature) per feature from conditional probability
// Top N features by churn_rate, excluding terminal states
export function FeatureCriticalityPolarChart({ featureUsage }) {
  const EXCLUDE = new Set(['drop_off', 'session_end', 'exit', 'error'])
  const top6 = [...(featureUsage || [])]
    .filter((u) => !EXCLUDE.has(u.feature) && Number(u.usage_count || 0) > 0)
    .sort((a, b) =>
      Number(b.churn_rate || 0) - Number(a.churn_rate || 0) ||
      Number(b.usage_count || 0) - Number(a.usage_count || 0) ||
      String(a.feature || '').localeCompare(String(b.feature || ''))
    )

  if (!top6.length) return <NoData label="Awaiting feature usage data…" />

  const COLORS = [
    'rgba(244,63,94,0.75)',
    'rgba(245,158,11,0.75)',
    'rgba(59,130,246,0.75)',
    'rgba(16,185,129,0.75)',
    'rgba(139,92,246,0.75)',
    'rgba(236,72,153,0.75)',
  ]

  const data = {
    labels: top6.map((u) => u.feature.replace(/_/g, ' ')),
    datasets: [
      {
        // Value = churn_rate * 100 (real conditional probability)
        data: top6.map((u) => Math.round(u.churn_rate * 100)),
        backgroundColor: top6.map((_, i) => COLORS[i % COLORS.length]),
        borderWidth: 0,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        grid: { color: 'rgba(51,65,85,0.4)' },
        ticks: { display: false },
        pointLabels: { display: false },
      },
    },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { boxWidth: 10, font: { size: 9 }, color: '#94a3b8', padding: 10 },
      },
      tooltip: {
        callbacks: {
          label: (item) => {
            const u = top6[item.dataIndex]
            return [
              ` Churn rate: ${(u.churn_rate * 100).toFixed(1)}%`,
              ` Usage count: ${u.usage_count}`,
            ]
          },
        },
      },
    },
  }

  return (
    <div style={{ height: 220, position: 'relative' }}>
      <PolarArea data={data} options={options} />
    </div>
  )
}

// ─── Environment / Channel Demographics Doughnut ──────────────────────────────
// Source: /dashboard/:tenantId/sessions
// Sessions array has is_churn, events[], session_id, duration_sec
// We split by channel/deploy metadata from segmentation if available,
// otherwise fall back to session outcome (churn vs complete) split.
export function EnvironmentDemographicsChart({ sessions, segmentation, churnDist }) {
  const hasSeg = segmentation?.clusters?.length > 0
  const hasSessions = sessions?.length > 0
  const hasChurnDist = churnDist?.total_sessions > 0

  let labels, values, colors

  if (hasSeg) {
    const clusters = segmentation.clusters.slice(0, 6)
    labels = clusters.map((c) => c.label || `Cluster ${c.id}`)
    values = clusters.map((c) => c.size || c.count || 1)
    colors = [
      'rgba(16,185,129,0.8)', 'rgba(99,102,241,0.8)', 'rgba(34,211,238,0.8)',
      'rgba(245,158,11,0.8)', 'rgba(236,72,153,0.8)', 'rgba(139,92,246,0.8)',
    ]
  } else if (hasChurnDist) {
    const totalChurned = churnDist.churn_counts.reduce((a, b) => a + b, 0)
    const totalCompleted = churnDist.complete_counts.reduce((a, b) => a + b, 0)
    labels = ['Completed', 'Churned']
    values = [totalCompleted, totalChurned]
    colors = ['rgba(16,185,129,0.8)', 'rgba(244,63,94,0.75)']
  } else if (hasSessions) {
    const churned = sessions.filter((s) => s.is_churn).length
    const completed = sessions.length - churned
    labels = ['Completed', 'Churned']
    values = [completed, churned]
    colors = ['rgba(16,185,129,0.8)', 'rgba(244,63,94,0.75)']
  } else {
    return <NoData label="Awaiting session data…" />
  }

  const data = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: colors,
        borderColor: colors.map((c) => c.replace('0.8)', '1)')),
        borderWidth: 1,
        hoverOffset: 8,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: {
        position: 'right',
        labels: { usePointStyle: true, font: { size: 9 }, color: '#94a3b8', padding: 12 },
      },
      tooltip: {
        callbacks: {
          label: (item) => {
            const total = values.reduce((a, b) => a + b, 0)
            const pct = total > 0 ? ((item.raw / total) * 100).toFixed(1) : '0'
            return ` ${item.label}: ${item.raw.toLocaleString()} (${pct}%)`
          },
        },
      },
    },
  }

  return (
    <div style={{ height: 220, position: 'relative' }}>
      <Doughnut data={data} options={options} />
    </div>
  )
}
