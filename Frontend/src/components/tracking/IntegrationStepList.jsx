export default function IntegrationStepList({ steps }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li key={step} className="flex gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-cyan-300">
            {index + 1}
          </div>
          <p className="pt-1 text-sm text-slate-300">{step}</p>
        </li>
      ))}
    </ol>
  )
}
