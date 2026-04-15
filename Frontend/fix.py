import sys

file_path = r"e:\Project\FinSpark\Frontend\src\components\intelligence\IntelligenceCharts.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

start_marker = "  const COLORS = ["
end_marker = "  if (hasSeg) {"

if start_marker in text and end_marker in text:
    start_idx = text.find(start_marker)
    end_idx = text.find(end_marker, start_idx)
    
    replacement = """  const COLORS = [
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
        data: top6.map((u) => Math.max(0.5, Number((Number(u.churn_rate || 0) * 100).toFixed(2)))),
        backgroundColor: top6.map((_, i) => COLORS[i % COLORS.length]),
        borderColor: top6.map((_, i) => COLORS[i % COLORS.length].replace('0.75)', '1)')),
        borderWidth: 1,
        hoverOffset: 6,
        borderRadius: 4,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: {
        position: 'right',
        labels: { usePointStyle: true, font: { size: 10 }, color: '#94a3b8', padding: 12 },
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
      <Doughnut data={data} options={options} />
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

"""
    
    new_text = text[:start_idx] + replacement + text[end_idx:]
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_text)
    print("Done")
else:
    print("Markers not found")
