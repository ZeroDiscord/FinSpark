import { forwardRef } from 'react'
import { cn } from '../../lib/utils.js'

const variants = {
  default:
    'bg-gradient-to-r from-indigo-500 via-indigo-400 to-cyan-400 text-slate-950 shadow-lg shadow-indigo-900/30 hover:opacity-95',
  secondary: 'border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10',
  ghost: 'text-slate-300 hover:bg-white/5',
  destructive: 'bg-rose-500/90 text-white hover:bg-rose-500',
}

const sizes = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
}

const Button = forwardRef(function Button(
  { className, variant = 'default', size = 'md', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-2xl font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
})

export default Button
