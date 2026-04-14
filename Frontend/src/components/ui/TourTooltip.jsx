import { motion } from 'framer-motion'
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react'
import Button from './Button.jsx'

export default function TourTooltip({
  index,
  step,
  size,
  tooltipProps,
  primaryProps,
  backProps,
  closeProps,
  isLastStep,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      {...tooltipProps}
      className="relative z-[99999] w-80 max-w-[90vw] overflow-hidden rounded-[2rem] border border-white/20 bg-slate-900/40 p-6 backdrop-blur-[40px] saturate-150 shadow-[0_16px_60px_-12px_rgba(56,189,248,0.4)]"
    >
      <div className="absolute -top-20 -right-20 h-40 w-40 rounded-full bg-cyan-400/30 blur-[40px]" />
      <div className="absolute -bottom-20 -left-20 h-40 w-40 rounded-full bg-indigo-500/30 blur-[40px]" />

      <div className="relative z-10 flex items-start justify-between gap-3 mb-4">
        {step.title && (
          <h3 className="text-xl font-bold bg-gradient-to-br from-white to-white/70 bg-clip-text text-transparent">{step.title}</h3>
        )}
        <button
          {...closeProps}
          className="text-slate-400 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      
      <div className="relative z-10 text-sm text-slate-300/90 leading-relaxed mb-6 font-medium">
        {step.content}
      </div>

      <div className="relative z-10 flex items-center justify-between">
        <div className="flex gap-1.5">
          {Array.from({ length: size }).map((_, i) => (
            <div
              key={i}
              className={`h-2 w-2 rounded-full transition-colors ${
                i === index ? 'bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)]' : 'bg-white/20'
              }`}
            />
          ))}
        </div>
        
        <div className="flex items-center gap-2">
          {index > 0 && (
            <Button variant="ghost" size="sm" {...backProps} className="gap-1 px-3">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          <Button size="sm" {...primaryProps} className="gap-1 px-4">
            {isLastStep ? (
              <>
                Finish
                <Check className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
