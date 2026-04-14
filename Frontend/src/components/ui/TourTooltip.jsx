import { motion } from 'framer-motion'
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react'
import Button from './Button.jsx'

export default function TourTooltip({
  index,
  step,
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
      className="z-[99999] w-80 max-w-[90vw] overflow-hidden rounded-3xl border border-white/10 bg-slate-950/90 p-5 backdrop-blur-xl shadow-2xl shadow-indigo-500/10"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        {step.title && (
          <h3 className="text-lg font-semibold text-white">{step.title}</h3>
        )}
        <button
          {...closeProps}
          className="text-slate-400 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      
      <div className="text-sm text-slate-300 leading-relaxed mb-6">
        {step.content}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                i === index ? 'bg-cyan-400' : 'bg-white/20'
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
