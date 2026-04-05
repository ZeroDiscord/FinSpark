export default function SessionRibbons({ sessions }) {
  if (!sessions?.length) {
    return (
      <div className="flex h-24 items-center justify-center text-xs font-mono text-slate-500">
        No session data available
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {sessions.map((session, idx) => {
        const isChurn = session.is_churn
        const barColor = isChurn ? 'bg-rose-500' : 'bg-emerald-500'
        const durationColor = isChurn ? 'text-rose-400' : 'text-emerald-400'
        const shortId = (session.session_id || `session-${idx}`).slice(0, 10)

        return (
          <div
            key={session.session_id || idx}
            className="relative flex h-11 items-center gap-2 overflow-hidden rounded-xl border border-white/5 bg-slate-900/30 px-3"
          >
            {/* Left churn indicator bar */}
            <div className={`absolute inset-y-0 left-0 w-1 ${barColor}`} />

            {/* Session ID */}
            <span className="w-24 shrink-0 pl-2 font-mono text-[10px] text-slate-500">
              {shortId}
            </span>

            {/* Event chips — horizontally scrollable */}
            <div className="flex flex-1 items-center gap-1 overflow-x-auto pb-0.5">
              {(session.events || []).map((event, i) => {
                const isTerminal = event === 'drop_off'
                const chipBg = isTerminal
                  ? 'bg-rose-900/60 border-rose-500/50'
                  : 'bg-emerald-500/10 border-emerald-500/20'
                const chipText = isTerminal ? 'text-rose-300' : 'text-emerald-400'

                return (
                  <div key={i} className="flex shrink-0 items-center gap-1">
                    {i > 0 && <div className="h-px w-3 shrink-0 bg-slate-700" />}
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

            {/* Duration */}
            <span className={`ml-2 shrink-0 font-mono text-[10px] font-bold ${durationColor}`}>
              {session.duration_sec != null ? `${session.duration_sec}s` : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
