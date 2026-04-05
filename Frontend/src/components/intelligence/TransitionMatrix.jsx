/**
 * TransitionMatrix — real Markov transition probabilities
 *
 * Source: /dashboard/:tenantId/transition-matrix
 * Response: { features: string[], matrix: number[][] }
 *   features — sorted list of ALL discovered states (from MarkovChain.export_transition_table)
 *   matrix[i][j] — P(feature_j | feature_i), rounded to 2 decimals, row-stochastic
 *   Absorption states (drop_off, disbursement) have zero rows (no transitions out)
 *
 * friction: /dashboard/:tenantId/friction
 *   feature, drop_off_prob, severity ("critical"|"high"|"moderate"|"low")
 *   severity based on Markov absorption probability (P(drop_off | state))
 */

function cellBg(val, isFriction) {
  if (isFriction) return 'bg-rose-900/60 border-rose-500/40 text-rose-200 font-bold'
  if (val >= 0.7) return 'bg-emerald-900/70 border-emerald-500/50 text-emerald-300 font-bold'
  if (val >= 0.4) return 'bg-emerald-900/40 border-emerald-500/30 text-emerald-400'
  if (val >= 0.15) return 'bg-emerald-950/40 border-emerald-900/40 text-emerald-500/80'
  if (val >= 0.05) return 'bg-slate-900/40 border-slate-700/30 text-slate-500'
  return 'bg-transparent border-slate-800/20 text-slate-700'
}

export default function TransitionMatrix({ data, friction }) {
  if (!data?.features?.length) {
    return (
      <div className="flex h-32 items-center justify-center text-xs font-mono text-slate-500">
        Awaiting Markov model data…
      </div>
    )
  }

  const { features, matrix } = data

  const frictionMap = Object.fromEntries((friction || []).map((f) => [f.feature, f]))
  const frictionSet = new Set(
    (friction || [])
      .filter((f) => f.severity === 'critical' || f.severity === 'high')
      .map((f) => f.feature)
  )

  // Show all non-zero states, capped to keep the matrix readable
  // Exclude absorption states from rows (they have all-zero transitions)
  const ABSORBING = new Set(['drop_off', 'disbursement', 'session_end', 'exit'])
  const rowFeats = features.filter((f) => {
    const ri = features.indexOf(f)
    const rowSum = (matrix[ri] || []).reduce((a, b) => a + b, 0)
    return rowSum > 0 && !ABSORBING.has(f)
  })
  const colFeats = features // show all features as columns including absorbing states

  // Cap at 8 rows × 8 cols for readability; prioritise high-friction features
  const prioritised = [
    ...rowFeats.filter((f) => frictionSet.has(f)),
    ...rowFeats.filter((f) => !frictionSet.has(f)),
  ]
  const displayRows = prioritised.slice(0, 8)

  // Columns: show absorbing states + displayed row features
  const absorbingCols = colFeats.filter((f) => ABSORBING.has(f))
  const nonAbsorbingCols = colFeats.filter((f) => !ABSORBING.has(f) && displayRows.includes(f))
  const displayCols = [...new Set([...nonAbsorbingCols, ...absorbingCols])].slice(0, 8)

  const topFriction = (friction || [])
    .filter((f) => f.severity === 'critical' || f.severity === 'high')
    .sort((a, b) => b.drop_off_prob - a.drop_off_prob)

  return (
    <div className="flex flex-col gap-3">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[9px] font-mono uppercase tracking-widest text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded-sm bg-emerald-900/70" /> Strong path
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded-sm bg-rose-900/60" /> Friction (high drop-off)
        </span>
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto">
        <div
          className="grid gap-px"
          style={{ gridTemplateColumns: `minmax(72px, auto) repeat(${displayCols.length}, minmax(36px, 1fr))` }}
        >
          {/* Header */}
          <div />
          {displayCols.map((col) => (
            <div
              key={col}
              className={`pb-1 text-center font-mono text-[7px] uppercase leading-tight ${
                ABSORBING.has(col) ? 'text-rose-400/70' : 'text-slate-500'
              }`}
              title={col}
            >
              {col.replace(/_/g, '\u200B_').slice(0, 10)}
            </div>
          ))}

          {/* Rows */}
          {displayRows.map((rowFeat) => {
            const ri = features.indexOf(rowFeat)
            const fr = frictionMap[rowFeat]
            return (
              <div key={rowFeat} className="contents">
                <div
                  className={`flex items-center pr-1 font-mono text-[8px] uppercase leading-tight ${
                    frictionSet.has(rowFeat) ? 'text-rose-400' : 'text-slate-400'
                  }`}
                  title={fr ? `Drop-off prob: ${(fr.drop_off_prob * 100).toFixed(1)}%` : rowFeat}
                >
                  {rowFeat.replace(/_/g, ' ')}
                  {fr && (
                    <span className="ml-1 text-[7px] text-rose-500">
                      {(fr.drop_off_prob * 100).toFixed(0)}%↓
                    </span>
                  )}
                </div>

                {displayCols.map((colFeat) => {
                  const ci = features.indexOf(colFeat)
                  const val = ri >= 0 && ci >= 0 ? (matrix[ri]?.[ci] ?? 0) : 0
                  const isFriction = frictionSet.has(colFeat) && val > 0.2
                  return (
                    <div
                      key={colFeat}
                      className={`flex h-9 items-center justify-center border text-[9px] ${cellBg(val, isFriction)}`}
                      title={`P(${colFeat} | ${rowFeat}) = ${val.toFixed(3)}`}
                    >
                      {val > 0.01 ? val.toFixed(2) : '·'}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Friction alerts — real Markov absorption probabilities */}
      {topFriction.length > 0 && (
        <div className="space-y-2 border-t border-white/5 pt-2">
          {topFriction.slice(0, 3).map((f) => (
            <div key={f.feature} className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    f.severity === 'critical' ? 'bg-rose-500' : 'bg-amber-400'
                  }`}
                />
                <span className="font-mono text-slate-400">{f.feature.replace(/_/g, ' ')}</span>
              </div>
              <span
                className={`font-mono font-bold ${
                  f.severity === 'critical' ? 'text-rose-400' : 'text-amber-400'
                }`}
              >
                {(f.drop_off_prob * 100).toFixed(1)}% drop-off
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
