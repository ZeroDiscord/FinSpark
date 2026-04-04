import { ResponsiveContainer } from 'recharts'

function interpolateColor(value) {
  // 0 = green, 1 = red
  const r = Math.round(76 + value * (255 - 76))
  const g = Math.round(175 - value * 175)
  const b = Math.round(130 - value * 130)
  return `rgba(${r},${g},${b},${0.3 + value * 0.55})`
}

export default function ChurnHeatmap({ data }) {
  if (!data?.features || !data?.matrix) {
    return <div style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>No heatmap data available</div>
  }

  const { features, matrix } = data
  const cellSize = Math.max(24, Math.min(48, Math.floor(400 / features.length)))
  const fontSize = Math.max(8, cellSize * 0.35)

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'inline-block', minWidth: '100%' }}>
        {/* Column headers */}
        <div style={{ display: 'flex', marginLeft: 100 }}>
          {features.map((f, i) => (
            <div
              key={i}
              style={{
                width: cellSize, minWidth: cellSize,
                fontSize, color: 'var(--text-muted)',
                transform: 'rotate(-45deg)',
                transformOrigin: 'bottom left',
                height: 60,
                display: 'flex',
                alignItems: 'flex-end',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
            >
              {f.length > 10 ? f.slice(0, 10) + '…' : f}
            </div>
          ))}
        </div>

        {/* Rows */}
        {features.map((rowFeature, ri) => (
          <div key={ri} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              width: 100, fontSize, color: 'var(--text-secondary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              paddingRight: 8, textAlign: 'right',
            }}>
              {rowFeature.length > 14 ? rowFeature.slice(0, 14) + '…' : rowFeature}
            </div>
            {features.map((_, ci) => {
              const val = matrix[ri]?.[ci] ?? 0
              return (
                <div
                  key={ci}
                  title={`${rowFeature} → ${features[ci]}: ${(val * 100).toFixed(1)}%`}
                  style={{
                    width: cellSize, height: cellSize,
                    minWidth: cellSize,
                    background: interpolateColor(val),
                    border: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: fontSize * 0.85,
                    color: val > 0.5 ? 'rgba(255,255,255,0.9)' : 'transparent',
                    transition: 'opacity var(--transition)',
                  }}
                >
                  {val > 0.1 ? (val * 100).toFixed(0) : ''}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
