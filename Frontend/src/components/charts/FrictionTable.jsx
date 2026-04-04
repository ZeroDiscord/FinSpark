import { useState } from 'react'
import GlassBadge from '../ui/GlassBadge.jsx'

function severityVariant(prob) {
  if (prob >= 0.6) return 'critical'
  if (prob >= 0.4) return 'high'
  if (prob >= 0.2) return 'medium'
  return 'low'
}

export default function FrictionTable({ data = [] }) {
  const [sortAsc, setSortAsc] = useState(false)

  if (!data.length) {
    return <div style={{ color: 'var(--text-muted)', padding: '1rem', textAlign: 'center' }}>No friction data</div>
  }

  const sorted = [...data].sort((a, b) => {
    const av = a.absorption_probability ?? a.drop_off_rate ?? 0
    const bv = b.absorption_probability ?? b.drop_off_rate ?? 0
    return sortAsc ? av - bv : bv - av
  })

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr>
            <th style={th}>Feature</th>
            <th style={{ ...th, cursor: 'pointer' }} onClick={() => setSortAsc(p => !p)}>
              Drop-off {sortAsc ? '▲' : '▼'}
            </th>
            <th style={th}>Severity</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const prob = row.absorption_probability ?? row.drop_off_rate ?? 0
            const variant = severityVariant(prob)
            return (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={td}>{row.feature}</td>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{
                      height: 6,
                      width: `${Math.round(prob * 100)}px`,
                      maxWidth: 100,
                      background: `var(--${variant})`,
                      borderRadius: 3,
                      opacity: 0.7,
                    }} />
                    {(prob * 100).toFixed(1)}%
                  </div>
                </td>
                <td style={td}><GlassBadge variant={variant}>{variant}</GlassBadge></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const th = {
  textAlign: 'left',
  padding: '0.5rem 0.75rem',
  color: 'var(--text-muted)',
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
}
const td = {
  padding: '0.6rem 0.75rem',
  color: 'var(--text-secondary)',
  verticalAlign: 'middle',
}
