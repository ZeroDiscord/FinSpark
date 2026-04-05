/**
 * SegmentationScatter — real LSTM session embeddings projected to 2D via PCA
 *
 * Source: /dashboard/:tenantId/segmentation
 * Response: { points: [{x, y, label, churn_prob}], n_sessions: int }
 *   x, y       — top-2 principal components of BiLSTM hidden state embeddings
 *   label      — 0 (completed) or 1 (churned) — real training labels
 *   churn_prob — BiLSTM sigmoid output for that session (real model prediction)
 *
 * Renders as SVG scatter plot (no extra charting library).
 * Color: emerald = completed, rose = churned
 * Size: scaled by churn_prob (larger dot = higher predicted churn probability)
 */

import { useMemo, useRef, useState } from 'react'

function scalePoints(points, W, H, pad = 36) {
  if (!points?.length) return []
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const xMin = Math.min(...xs), xMax = Math.max(...xs)
  const yMin = Math.min(...ys), yMax = Math.max(...ys)
  const xRange = xMax - xMin || 1
  const yRange = yMax - yMin || 1

  return points.map((p) => ({
    ...p,
    cx: pad + ((p.x - xMin) / xRange) * (W - pad * 2),
    cy: (H - pad) - ((p.y - yMin) / yRange) * (H - pad * 2),
    r: Math.max(2.5, p.churn_prob * 7),
  }))
}

export default function SegmentationScatter({ segmentation }) {
  const svgRef = useRef(null)
  const [hovered, setHovered] = useState(null)

  const W = 480
  const H = 280

  const points = useMemo(
    () => scalePoints(segmentation?.points, W, H),
    [segmentation]
  )

  if (!segmentation?.points?.length) {
    return (
      <div className="flex min-h-45 items-center justify-center text-xs font-mono text-slate-500">
        Awaiting LSTM embedding data…
      </div>
    )
  }

  const totalChurned = points.filter((p) => p.label === 1).length
  const totalCompleted = points.filter((p) => p.label === 0).length
  const avgChurnProb = points.reduce((s, p) => s + p.churn_prob, 0) / points.length

  return (
    <div className="flex flex-col gap-3">
      {/* Summary row */}
      <div className="flex gap-4 text-[10px] font-mono">
        <span className="flex items-center gap-1.5 text-emerald-400">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          Completed: {totalCompleted}
        </span>
        <span className="flex items-center gap-1.5 text-rose-400">
          <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
          Churned: {totalChurned}
        </span>
        <span className="text-slate-500">
          Avg churn prob: <span className="text-slate-300">{(avgChurnProb * 100).toFixed(1)}%</span>
        </span>
      </div>

      {/* SVG scatter */}
      <div className="relative">
        <svg
          ref={svgRef}
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          className="overflow-visible"
        >
          {/* Axes */}
          <line x1={36} y1={H - 36} x2={W - 16} y2={H - 36} stroke="rgba(51,65,85,0.5)" strokeWidth={1} />
          <line x1={36} y1={16} x2={36} y2={H - 36} stroke="rgba(51,65,85,0.5)" strokeWidth={1} />
          <text x={W / 2} y={H - 4} textAnchor="middle" fill="#475569" fontSize={8} fontFamily="monospace">
            PCA Component 1 (LSTM embedding)
          </text>
          <text x={10} y={H / 2} textAnchor="middle" fill="#475569" fontSize={8} fontFamily="monospace"
            transform={`rotate(-90, 10, ${H / 2})`}>
            PCA Component 2
          </text>

          {/* Points — render completed first, then churned on top */}
          {[0, 1].map((lbl) =>
            points
              .filter((p) => p.label === lbl)
              .map((p, i) => {
                const isChurn = lbl === 1
                const fill = isChurn ? 'rgba(244,63,94,0.65)' : 'rgba(16,185,129,0.55)'
                const stroke = isChurn ? '#f43f5e' : '#10b981'
                const key = `${lbl}-${i}`
                return (
                  <circle
                    key={key}
                    cx={p.cx}
                    cy={p.cy}
                    r={hovered?.key === key ? p.r + 2 : p.r}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={hovered?.key === key ? 1.5 : 0.5}
                    style={{ cursor: 'pointer', transition: 'r 0.1s' }}
                    onMouseEnter={() => setHovered({ ...p, key })}
                    onMouseLeave={() => setHovered(null)}
                  />
                )
              })
          )}
        </svg>

        {/* Tooltip */}
        {hovered && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-white/10 bg-slate-950/95 px-3 py-2 text-[10px] shadow-xl backdrop-blur"
            style={{
              left: `${(hovered.cx / W) * 100}%`,
              top: `${(hovered.cy / H) * 100}%`,
              transform: 'translate(8px, -50%)',
            }}
          >
            <div className={`font-bold ${hovered.label === 1 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {hovered.label === 1 ? 'Churned' : 'Completed'}
            </div>
            <div className="mt-1 space-y-0.5 text-slate-400">
              <div>Churn prob: <span className="text-slate-200">{(hovered.churn_prob * 100).toFixed(1)}%</span></div>
              <div className="text-[9px] text-slate-600">PC1: {hovered.x.toFixed(3)} · PC2: {hovered.y.toFixed(3)}</div>
            </div>
          </div>
        )}
      </div>

      <p className="text-right font-mono text-[8px] uppercase tracking-widest text-slate-600">
        {segmentation.n_sessions} sessions · dot size = predicted churn prob
      </p>
    </div>
  )
}
