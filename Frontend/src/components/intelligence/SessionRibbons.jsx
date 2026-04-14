export default function SessionRibbons({ sessions }) {
  function formatDuration(durationSec) {
    const seconds = Number(durationSec || 0)
    if (!Number.isFinite(seconds)) return '—'
    if (seconds >= 100) return `${seconds.toFixed(0)}s`
    if (seconds >= 10) return `${seconds.toFixed(1)}s`
    return `${seconds.toFixed(2)}s`
  }

  if (!sessions?.length) {
    return (
      <div className="flex h-24 items-center justify-center text-xs font-mono text-slate-500">
        No session data available
      </div>
    )
  }

  return (
    <div
      className="space-y-2 max-h-[440px] overflow-y-auto pr-1"
      style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}
    >
      {sessions.map((session, idx) => {
        const isChurn = session.is_churn
        const barColor = isChurn ? 'bg-rose-500' : 'bg-emerald-500'
        const durationColor = isChurn ? 'text-rose-400' : 'text-emerald-400'
        const shortId = (session.session_id || `session-${idx}`).slice(0, 10)

        return (
          <div
            key={session.session_id || idx}
            className="relative rounded-xl border border-white/5 bg-slate-900/30 px-3 py-2"
          >
            <div className={`absolute inset-y-0 left-0 w-1 ${barColor}`} />

            <div className="flex min-w-0 items-center gap-3 pl-2">
              <span className="w-24 shrink-0 font-mono text-[10px] text-slate-500">
                {shortId}
              </span>

              <div className="min-w-0 flex-1">
                <div
                  className="overflow-x-auto overflow-y-hidden pb-1 pr-1"
                  style={{ scrollbarWidth: 'thin', scrollbarColor: '#475569 transparent' }}
                >
                  <div className="flex min-w-max items-center gap-1">
                    {(session.events || []).map((event, i) => {
                      const isTerminal = event === 'drop_off'
                      const chipBg = isTerminal
                        ? 'bg-rose-900/60 border-rose-500/50'
                        : 'bg-emerald-500/10 border-emerald-500/20'
                      const chipText = isTerminal ? 'text-rose-300' : 'text-emerald-400'

                      return (
                        <div key={i} className="flex shrink-0 items-center gap-1">
                          {i > 0 && <div className="h-px w-4 shrink-0 bg-slate-700" />}
                          <div
                            className={`flex h-6 shrink-0 items-center gap-1 rounded-md border px-2 ${chipBg}`}
                          >
                            <span className={`font-mono text-[8px] font-bold uppercase ${chipText}`}>
                              {event.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <span className={`shrink-0 font-mono text-[10px] font-bold ${durationColor}`}>
                {formatDuration(session.duration_sec)}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
