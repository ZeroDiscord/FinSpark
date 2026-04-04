import { ResponsiveContainer, Sankey, Tooltip } from 'recharts'

function buildSankeyData(steps = []) {
  if (!steps.length) return { nodes: [], links: [] }
  const nodeMap = new Map()
  const links = []

  steps.forEach(({ source, target, probability }) => {
    if (!nodeMap.has(source)) nodeMap.set(source, { name: source })
    if (!nodeMap.has(target)) nodeMap.set(target, { name: target })
  })

  const nodes = Array.from(nodeMap.values())
  const nodeIndex = (name) => nodes.findIndex(n => n.name === name)

  steps.forEach(({ source, target, probability }) => {
    links.push({
      source: nodeIndex(source),
      target: nodeIndex(target),
      value: Math.max(0.01, probability),
    })
  })

  return { nodes, links }
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d?.source || !d?.target) return null
  return (
    <div className="glass" style={{ padding: '0.6rem 0.9rem', fontSize: '0.8rem' }}>
      <b>{d.source.name}</b> → <b>{d.target.name}</b>
      <div>Probability: {(d.value * 100).toFixed(1)}%</div>
    </div>
  )
}

export default function FunnelChart({ data = [] }) {
  const sankeyData = buildSankeyData(data)

  if (!sankeyData.nodes.length) {
    return <div style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>No funnel data available</div>
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <Sankey
        data={sankeyData}
        nodePadding={8}
        nodeWidth={12}
        linkCurvature={0.5}
        iterations={32}
        node={{ fill: 'rgba(108,99,255,0.8)', stroke: 'rgba(108,99,255,0.3)' }}
        link={{ stroke: 'rgba(0,210,255,0.3)' }}
      >
        <Tooltip content={<CustomTooltip />} />
      </Sankey>
    </ResponsiveContainer>
  )
}
