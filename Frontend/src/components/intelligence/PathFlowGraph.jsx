import { useEffect, useMemo, useRef, useState } from 'react'

// ─── Inline SVG icon paths ────────────────────────────────────────────────────
const ICON_PATHS = {
  login: (
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  ),
  income_verification: (
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  ),
  bureau_pull: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  kyc_check: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  doc_upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="17 8 12 3 7 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  credit_scoring: (
    <>
      <line x1="18" y1="20" x2="18" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="20" x2="12" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="6" y1="20" x2="6" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  manual_review: (
    <>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  loan_offer_view: (
    <>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="7" y1="7" x2="7.01" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  loan_accept: (
    <>
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  disbursement: (
    <>
      <line x1="3" y1="22" x2="21" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="6" y1="18" x2="6" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="10" y1="18" x2="10" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="18" x2="14" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="18" y1="18" x2="18" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <polygon points="12 2 20 7 4 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  drop_off: (
    <>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
}

function getIcon(node) {
  if (ICON_PATHS[node]) return ICON_PATHS[node]
  for (const [key, icon] of Object.entries(ICON_PATHS)) {
    if (node.includes(key) || key.includes(node)) return icon
  }
  return (
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  )
}

// ─── Layout engine ────────────────────────────────────────────────────────────
// Proper Sugiyama-style layered layout:
//  1. Longest-path layering  — puts nodes as far RIGHT as possible
//  2. Per-layer vertical sort — order nodes to minimise crossings
//  3. Vertical spread        — push nodes apart within a column to avoid overlap

function buildGraphData(funnelEdges, friction, W) {
  if (!funnelEdges?.length || W < 10) return null

  const NODE_R    = 26
  const PAD_X     = NODE_R + 40          // horizontal margin
  const PAD_Y     = NODE_R + 50          // vertical margin
  const MIN_COL_W = 170                  // minimum pixels between columns
  const ROW_GAP   = NODE_R * 2 + 60     // minimum vertical gap between node centres

  const frictionSet = new Set(
    (friction || [])
      .filter((f) => f.severity === 'critical' || f.severity === 'high')
      .map((f) => f.feature)
  )

  // Filter edges — keep meaningful transitions
  const edges = funnelEdges.filter((e) => e.probability > 0.06)

  // Collect nodes
  const nodeSet = new Set()
  edges.forEach((e) => { nodeSet.add(e.source); nodeSet.add(e.target) })
  const nodes = Array.from(nodeSet)

  // Build adjacency
  const outEdges = {}   // node → [targets]
  const inEdges  = {}   // node → [sources]
  nodes.forEach((n) => { outEdges[n] = []; inEdges[n] = [] })
  edges.forEach((e) => {
    outEdges[e.source].push(e.target)
    inEdges[e.target].push(e.source)
  })

  // ── 1. Longest-path layering (reversed — nodes assigned as far right as possible)
  //    layer[n] = length of longest path FROM n to a sink
  const layer = {}
  const topoOrder = []
  const visited = new Set()

  function dfs(n) {
    if (visited.has(n)) return
    visited.add(n)
    outEdges[n].forEach(dfs)
    topoOrder.push(n)
  }
  nodes.forEach(dfs)

  // Assign layers in reverse topological order
  // Sinks get layer 0, sources get max layer
  topoOrder.forEach((n) => {
    if (outEdges[n].length === 0) {
      layer[n] = 0
    } else {
      layer[n] = Math.max(...outEdges[n].map((t) => (layer[t] ?? 0) + 1))
    }
  })

  // Invert so sources are leftmost (layer 0 = leftmost)
  const maxLayer = Math.max(...Object.values(layer))
  nodes.forEach((n) => { layer[n] = maxLayer - layer[n] })

  // ── 2. Group nodes by layer column
  const columns = {}   // layer → [nodes]
  nodes.forEach((n) => {
    const l = layer[n]
    if (!columns[l]) columns[l] = []
    columns[l].push(n)
  })
  const sortedLayerNums = Object.keys(columns).map(Number).sort((a, b) => a - b)
  const numCols = sortedLayerNums.length

  // ── 3. Calculate column x positions
  const usableW   = W - PAD_X * 2
  const colSpacing = Math.max(MIN_COL_W, numCols > 1 ? usableW / (numCols - 1) : usableW)

  const colX = {}
  sortedLayerNums.forEach((l, i) => { colX[l] = PAD_X + i * colSpacing })

  // ── 4. Vertical positioning — spread nodes within each column
  //    Use barycentric heuristic: sort by average Y of neighbours in previous column
  //    Then space them evenly with minimum ROW_GAP

  // We'll do two passes: first assign initial order, then compute y coords
  // Initial order: sort by existing inEdges barycentre if possible
  const nodeY = {}

  sortedLayerNums.forEach((l) => {
    const col = columns[l]

    // Sort by barycentre of left-neighbours
    col.sort((a, b) => {
      const yA = inEdges[a].length
        ? inEdges[a].reduce((s, src) => s + (nodeY[src] ?? 0), 0) / inEdges[a].length
        : 0
      const yB = inEdges[b].length
        ? inEdges[b].reduce((s, src) => s + (nodeY[src] ?? 0), 0) / inEdges[b].length
        : 0
      return yA - yB
    })

    // Assign y positions — centred in canvas, minimum ROW_GAP apart
    const totalH = (col.length - 1) * ROW_GAP
    const startY = PAD_Y + totalH / 2   // will be re-centred after we know canvas H

    col.forEach((n, i) => {
      nodeY[n] = startY + (i - (col.length - 1) / 2) * ROW_GAP
    })
  })

  // ── 5. Compute final canvas height
  const allY = Object.values(nodeY)
  const minY = Math.min(...allY)
  const maxY = Math.max(...allY)
  const offsetY = PAD_Y - minY   // shift so nothing is clipped at top
  nodes.forEach((n) => { nodeY[n] += offsetY })
  const H = Math.max(380, maxY + offsetY + PAD_Y + NODE_R + 60)

  // Build position map
  const nodePositions = {}
  nodes.forEach((n) => {
    nodePositions[n] = { x: colX[layer[n]], y: nodeY[n] }
  })

  return { nodePositions, edges, nodes, frictionSet, W, H, NODE_R, friction: friction || [] }
}

// ─── Edge path — cubic bezier, exits right side of src, enters left side of dst
function edgePath(src, dst, r) {
  const x1 = src.x + r
  const y1 = src.y
  const x2 = dst.x - r
  const y2 = dst.y
  const cx = (x2 - x1) * 0.5
  return `M${x1} ${y1} C ${x1 + cx} ${y1}, ${x2 - cx} ${y2}, ${x2} ${y2}`
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PathFlowGraph({ funnelEdges, featureUsage, friction }) {
  const containerRef = useRef(null)
  const [width, setWidth]       = useState(0)
  const [hoveredNode, setHoveredNode] = useState(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const initial = el.getBoundingClientRect().width
    if (initial > 10) setWidth(Math.floor(initial))
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width
      if (w > 10) setWidth(Math.floor(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const graph = useMemo(
    () => buildGraphData(funnelEdges, friction, width),
    [funnelEdges, friction, width]
  )

  if (!funnelEdges?.length) {
    return (
      <div className="flex h-64 items-center justify-center text-xs font-mono text-slate-500">
        No path data — train a model first.
      </div>
    )
  }

  if (!graph) {
    return (
      <div ref={containerRef} className="w-full" style={{ height: 420 }}>
        <div className="flex h-full items-center justify-center text-xs font-mono text-slate-500">
          Building graph…
        </div>
      </div>
    )
  }

  const { nodePositions, edges, nodes, frictionSet, W, H, NODE_R } = graph
  const ICON_SIZE = 15

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-x-auto"
      style={{ height: H }}
    >
      <svg
        width={Math.max(W, width)}
        height={H}
        viewBox={`0 0 ${Math.max(W, width)} ${H}`}
        style={{ display: 'block' }}
      >
        {/* ── Defs: arrow markers per edge ── */}
        <defs>
          <marker id="arrow-green" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L0,7 L7,3.5 z" fill="#10b981" opacity="0.7" />
          </marker>
          <marker id="arrow-red" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L0,7 L7,3.5 z" fill="#f43f5e" opacity="0.7" />
          </marker>
        </defs>

        {/* ── Edges ── */}
        {edges.map((edge, i) => {
          const src = nodePositions[edge.source]
          const dst = nodePositions[edge.target]
          if (!src || !dst) return null

          const isDanger = edge.target === 'drop_off' || frictionSet.has(edge.target)
          const color    = isDanger ? '#f43f5e' : '#10b981'
          const opacity  = Math.max(0.18, Math.min(0.75, edge.probability * 1.2))
          const sw       = Math.max(1, edge.probability * 5)
          const d        = edgePath(src, dst, NODE_R)
          const midX     = (src.x + dst.x) / 2
          const midY     = (src.y + dst.y) / 2 - 7

          return (
            <g key={`e-${i}`}>
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={sw}
                opacity={opacity}
                markerEnd={isDanger ? 'url(#arrow-red)' : 'url(#arrow-green)'}
              />
              {edge.probability > 0.10 && (
                <text
                  x={midX} y={midY}
                  textAnchor="middle"
                  fill={color}
                  fontSize={9}
                  fontFamily="monospace"
                  fontWeight="700"
                  opacity={0.9}
                >
                  {(edge.probability * 100).toFixed(0)}%
                </text>
              )}
            </g>
          )
        })}

        {/* ── Nodes ── */}
        {nodes.map((node) => {
          const pos = nodePositions[node]
          if (!pos) return null

          const isDanger  = node === 'drop_off' || frictionSet.has(node)
          const isSuccess = node === 'disbursement'
          const isHovered = hoveredNode === node
          const r         = isHovered ? NODE_R + 4 : NODE_R

          const strokeColor = isDanger ? '#f43f5e' : isSuccess ? '#10b981' : '#334155'
          const fillColor   = isDanger
            ? 'rgba(244,63,94,0.15)'
            : isSuccess
            ? 'rgba(16,185,129,0.15)'
            : 'rgba(15,23,42,0.88)'
          const glowColor   = isDanger
            ? 'rgba(244,63,94,0.22)'
            : isSuccess
            ? 'rgba(16,185,129,0.20)'
            : 'transparent'
          const iconColor   = isDanger ? '#fda4af' : isSuccess ? '#6ee7b7' : '#94a3b8'
          const labelColor  = isDanger ? '#fda4af' : isSuccess ? '#6ee7b7' : '#94a3b8'

          const fr    = graph.friction.find((f) => f.feature === node)
          const usage = featureUsage?.find((u) => u.feature === node)

          return (
            <g
              key={node}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoveredNode(node)}
              onMouseLeave={() => setHoveredNode(null)}
            >
              {/* Glow halo */}
              {(isDanger || isSuccess || isHovered) && (
                <circle cx={pos.x} cy={pos.y} r={r + 10} fill={glowColor} />
              )}

              {/* Hover dashed ring */}
              {isHovered && (
                <circle
                  cx={pos.x} cy={pos.y} r={r + 5}
                  fill="none" stroke={strokeColor} strokeWidth={1}
                  opacity={0.35} strokeDasharray="4 3"
                />
              )}

              {/* Main circle */}
              <circle
                cx={pos.x} cy={pos.y} r={r}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={isDanger || isSuccess ? 2 : 1.5}
                style={{ transition: 'r 0.12s ease' }}
              />

              {/* Icon via foreignObject */}
              <foreignObject
                x={pos.x - ICON_SIZE}
                y={pos.y - ICON_SIZE}
                width={ICON_SIZE * 2}
                height={ICON_SIZE * 2}
                style={{ pointerEvents: 'none', overflow: 'visible' }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width={ICON_SIZE * 2}
                  height={ICON_SIZE * 2}
                  style={{ color: iconColor, display: 'block' }}
                >
                  {getIcon(node)}
                </svg>
              </foreignObject>

              {/* Label below node */}
              <text
                x={pos.x} y={pos.y + NODE_R + 14}
                textAnchor="middle"
                fill={labelColor}
                fontSize={8.5}
                fontFamily="monospace"
                fontWeight="600"
                letterSpacing="0.04em"
              >
                {node.replace(/_/g, ' ')}
              </text>

              {/* Usage count */}
              {usage && (
                <text
                  x={pos.x} y={pos.y + NODE_R + 25}
                  textAnchor="middle"
                  fill="#475569"
                  fontSize={7}
                  fontFamily="monospace"
                >
                  {usage.usage_count} events
                </text>
              )}

              {/* FRICTION badge */}
              {isDanger && node !== 'drop_off' && fr && (
                <g>
                  <rect
                    x={pos.x - 34}
                    y={pos.y + NODE_R + (usage ? 30 : 19)}
                    width={68} height={13} rx={3}
                    fill="#f43f5e"
                  />
                  <text
                    x={pos.x}
                    y={pos.y + NODE_R + (usage ? 40 : 29)}
                    textAnchor="middle"
                    fill="white"
                    fontSize={7}
                    fontFamily="monospace"
                    fontWeight="bold"
                    letterSpacing="0.06em"
                  >
                    FRICTION {(fr.drop_off_prob * 100).toFixed(0)}%
                  </text>
                </g>
              )}
            </g>
          )
        })}
      </svg>

      {/* ── Hover tooltip ── */}
      {hoveredNode && nodePositions[hoveredNode] && (() => {
        const pos   = nodePositions[hoveredNode]
        const usage = featureUsage?.find((u) => u.feature === hoveredNode)
        const fr    = graph.friction.find((f) => f.feature === hoveredNode)
        // Position tooltip above the node, avoiding right-edge overflow
        const leftPx = Math.min(pos.x + NODE_R + 10, width - 180)
        const topPx  = Math.max(pos.y - 60, 4)
        return (
          <div
            className="pointer-events-none absolute z-20 rounded-xl border border-white/10 bg-slate-950/95 px-3 py-2.5 shadow-2xl backdrop-blur-xl"
            style={{ left: leftPx, top: topPx, minWidth: 160 }}
          >
            <div className="mb-1.5 font-mono text-[11px] font-bold text-white">
              {hoveredNode.replace(/_/g, ' ')}
            </div>
            <div className="space-y-0.5 font-mono text-[10px]">
              {usage && (
                <>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Volume</span>
                    <span className="text-slate-200">{usage.usage_count}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Churn risk</span>
                    <span className={usage.churn_rate > 0.3 ? 'text-rose-400' : 'text-emerald-400'}>
                      {(usage.churn_rate * 100).toFixed(1)}%
                    </span>
                  </div>
                </>
              )}
              {fr && (
                <>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Drop-off</span>
                    <span className="text-rose-400">{(fr.drop_off_prob * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Severity</span>
                    <span className={fr.severity === 'critical' ? 'text-rose-400' : 'text-amber-400'}>
                      {fr.severity}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
