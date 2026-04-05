import { AlertTriangle, Brain, CheckCircle, Lightbulb, TrendingDown, Zap } from 'lucide-react'
import { useState } from 'react'

function generateInsight(friction, featureUsage, churnDist, overview) {
  // Derive the top friction point
  const topFriction = (friction || [])
    .filter((f) => f.severity === 'critical' || f.severity === 'high')
    .sort((a, b) => b.drop_off_prob - a.drop_off_prob)[0]

  const churnRate = churnDist?.churn_rate ?? overview?.churn_rate ?? null
  const totalSessions = churnDist?.total_sessions ?? overview?.n_sessions ?? 0

  // Top risky feature by usage * churn_rate (criticality score)
  const EXCLUDE = new Set(['drop_off', 'session_end', 'exit', 'error', 'disbursement'])
  const topCritical = [...(featureUsage || [])]
    .filter((u) => !EXCLUDE.has(u.feature) && u.churn_rate > 0 && u.usage_count > 0)
    .sort((a, b) => b.churn_rate * b.usage_count - a.churn_rate * a.usage_count)[0]

  const feature = topFriction?.feature || topCritical?.feature || null
  const dropOffPct = topFriction ? (topFriction.drop_off_prob * 100).toFixed(1) : null
  const churnPct = churnRate !== null ? (churnRate * 100).toFixed(1) : null
  const sessionCount = (totalSessions || 0).toLocaleString()

  // Reason heuristics based on feature name
  function deriveReason(feat) {
    if (!feat) return 'Users are dropping off at a key stage in the journey.'
    const f = feat.toLowerCase()
    if (f.includes('loan_offer') || f.includes('offer_view'))
      return 'Users reaching the offer page spend unusually long before exiting — likely confusion around pricing, interest rate, or repayment terms.'
    if (f.includes('login') || f.includes('auth'))
      return 'Authentication failures are blocking entry. OTP timeouts, password reset UX, or credential errors may be responsible.'
    if (f.includes('bureau') || f.includes('credit_scor'))
      return 'Bureau pull latency or credit scoring rejections are causing silent abandonment at this stage.'
    if (f.includes('income') || f.includes('income_verif'))
      return 'Income verification is a common friction point — document upload failures or unclear instructions lead to early exit.'
    if (f.includes('kyc') || f.includes('doc_upload') || f.includes('document'))
      return 'Document submission UX is creating friction — mobile camera quality, file size limits, or unclear field labels may be culprits.'
    if (f.includes('loan_accept') || f.includes('accept'))
      return 'Users are reaching acceptance but not completing — hesitation at commitment stage suggests unclear terms or missing trust signals.'
    if (f.includes('disbursement'))
      return 'Final disbursement step has unexpected drop-off — bank account validation or notification latency may be blocking completion.'
    if (f.includes('manual_review'))
      return 'Manual review queue is introducing wait time that is causing session abandonment — consider async notification patterns.'
    return `High churn at ${feat.replace(/_/g, ' ')} suggests a UX or trust gap at this stage of the journey.`
  }

  function deriveAction(feat) {
    if (!feat) return 'Review the funnel drop-off points and run A/B tests on the highest-traffic stages.'
    const f = feat.toLowerCase()
    if (f.includes('loan_offer') || f.includes('offer_view'))
      return 'Simplify the offer page — surface key metrics (EMI, tenure, rate) prominently. Add a "Why this rate?" explainer tooltip.'
    if (f.includes('login') || f.includes('auth'))
      return 'Improve OTP delivery speed, add biometric fallback, and reduce login form friction on mobile.'
    if (f.includes('bureau') || f.includes('credit_scor'))
      return 'Show a real-time progress indicator during bureau pull. Pre-warm credit score cache where possible.'
    if (f.includes('income') || f.includes('income_verif'))
      return 'Provide inline document preview, add a guided upload checklist, and support bank statement auto-fetch via account aggregators.'
    if (f.includes('kyc') || f.includes('doc_upload') || f.includes('document'))
      return 'Use camera-guided capture with auto-crop, increase file size limits, and add live validation feedback.'
    if (f.includes('loan_accept') || f.includes('accept'))
      return 'Add social proof (e.g., "X users accepted today"), show savings comparison, and highlight 0 prepayment penalty.'
    if (f.includes('disbursement'))
      return 'Send real-time bank validation feedback and use async webhook confirmations to remove blocking latency.'
    if (f.includes('manual_review'))
      return 'Implement async review notifications via push/SMS. Show estimated wait time and allow session resume.'
    return `Run targeted UX research on the ${feat.replace(/_/g, ' ')} step. Consider progressive disclosure to reduce cognitive load.`
  }

  return {
    topFeature: feature,
    dropOffPct,
    churnPct,
    sessionCount,
    severity: topFriction?.severity || (topCritical?.churn_rate > 0.5 ? 'high' : 'moderate'),
    reason: deriveReason(feature),
    action: deriveAction(feature),
    usageCount: topCritical?.usage_count || topFriction ? (featureUsage || []).find(u => u.feature === feature)?.usage_count : null,
  }
}

export default function InsightPanel({ overview, friction, featureUsage, churnDist, insight, insightLoading }) {
  const [expanded, setExpanded] = useState(true)

  const derived = generateInsight(friction, featureUsage, churnDist, overview)
  const hasData = derived.topFeature || derived.churnPct

  const severityIcon = derived.severity === 'critical' ? AlertTriangle : derived.severity === 'high' ? TrendingDown : Lightbulb
  const SeverityIcon = severityIcon

  const severityColors = {
    critical: { border: 'border-rose-500/30', bg: 'bg-rose-500/8', text: 'text-rose-400', badge: 'bg-rose-500/20 text-rose-300' },
    high: { border: 'border-amber-500/30', bg: 'bg-amber-500/8', text: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-300' },
    moderate: { border: 'border-cyan-500/30', bg: 'bg-cyan-500/8', text: 'text-cyan-400', badge: 'bg-cyan-500/20 text-cyan-300' },
  }
  const sc = severityColors[derived.severity] || severityColors.moderate

  return (
    <div className="flex flex-col gap-4">
      {/* Header badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border ${sc.border} ${sc.badge} px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest`}>
            <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${derived.severity === 'critical' ? 'bg-rose-500' : derived.severity === 'high' ? 'bg-amber-400' : 'bg-cyan-400'}`} />
            {derived.severity} priority
          </span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[9px] text-slate-500">
          <Brain className="h-3 w-3" />
          RAG + Markov derived
        </div>
      </div>

      {!hasData ? (
        <div className="flex h-24 items-center justify-center font-mono text-xs text-slate-500">
          {insightLoading ? 'Generating insight…' : 'Train model to unlock AI insight'}
        </div>
      ) : (
        <>
          {/* Main insight block */}
          <div className={`rounded-2xl border ${sc.border} ${sc.bg} p-4`}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex-shrink-0 rounded-xl border ${sc.border} p-2 ${sc.bg}`}>
                <SeverityIcon className={`h-4 w-4 ${sc.text}`} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {derived.topFeature && (
                    <span className={`font-mono text-sm font-bold ${sc.text}`}>
                      {derived.topFeature.replace(/_/g, ' ')}
                    </span>
                  )}
                  {derived.dropOffPct && (
                    <span className="font-mono text-[10px] text-rose-400 border border-rose-500/30 bg-rose-500/10 rounded px-1.5 py-0.5">
                      {derived.dropOffPct}% drop-off
                    </span>
                  )}
                  {derived.usageCount && (
                    <span className="font-mono text-[10px] text-slate-500">
                      {derived.usageCount.toLocaleString()} events
                    </span>
                  )}
                </div>
                <p className="text-[12px] leading-relaxed text-slate-300">
                  {derived.reason}
                </p>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-white/5 bg-slate-900/40 p-3 text-center">
              <div className="font-mono text-[9px] uppercase tracking-widest text-slate-600 mb-1">Churn Rate</div>
              <div className="font-mono text-lg font-bold text-rose-400">
                {derived.churnPct ? `${derived.churnPct}%` : '—'}
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-slate-900/40 p-3 text-center">
              <div className="font-mono text-[9px] uppercase tracking-widest text-slate-600 mb-1">Sessions</div>
              <div className="font-mono text-lg font-bold text-slate-200">
                {derived.sessionCount}
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-slate-900/40 p-3 text-center">
              <div className="font-mono text-[9px] uppercase tracking-widest text-slate-600 mb-1">Critical Nodes</div>
              <div className="font-mono text-lg font-bold text-amber-400">
                {(friction || []).filter(f => f.severity === 'critical' || f.severity === 'high').length || '—'}
              </div>
            </div>
          </div>

          {/* Recommended action */}
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-3.5 w-3.5 text-emerald-400" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-400 font-bold">
                Recommended Action
              </span>
            </div>
            <p className="text-[12px] leading-relaxed text-slate-300">
              {derived.action}
            </p>
          </div>

          {/* RAG LLM insight if available */}
          {(insight || insightLoading) && (
            <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="h-3.5 w-3.5 text-indigo-400" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-indigo-400 font-bold">
                  LLM Attribution (RAG)
                </span>
              </div>
              {insightLoading ? (
                <div className="space-y-1.5">
                  <div className="h-2.5 w-full animate-pulse rounded bg-slate-800" />
                  <div className="h-2.5 w-4/5 animate-pulse rounded bg-slate-800" />
                  <div className="h-2.5 w-2/3 animate-pulse rounded bg-slate-800" />
                </div>
              ) : (
                <p className="text-[12px] leading-relaxed text-slate-400 italic">
                  "{insight}"
                </p>
              )}
            </div>
          )}

          {/* Friction list */}
          {(friction || []).length > 0 && (
            <div className="space-y-1.5">
              <div className="font-mono text-[9px] uppercase tracking-widest text-slate-600 mb-2">Top Friction Nodes</div>
              {[...(friction || [])]
                .sort((a, b) => b.drop_off_prob - a.drop_off_prob)
                .slice(0, 4)
                .map((f) => {
                  const isCrit = f.severity === 'critical'
                  return (
                    <div key={f.feature} className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-900/30 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${isCrit ? 'bg-rose-500 animate-pulse' : 'bg-amber-400'}`} />
                        <span className="font-mono text-[11px] text-slate-400">{f.feature.replace(/_/g, ' ')}</span>
                        <span className={`rounded px-1 py-0.5 font-mono text-[8px] uppercase ${isCrit ? 'bg-rose-500/15 text-rose-400' : 'bg-amber-500/15 text-amber-400'}`}>
                          {f.severity}
                        </span>
                      </div>
                      <span className={`font-mono text-xs font-bold ${isCrit ? 'text-rose-400' : 'text-amber-400'}`}>
                        {(f.drop_off_prob * 100).toFixed(1)}%
                      </span>
                    </div>
                  )
                })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
