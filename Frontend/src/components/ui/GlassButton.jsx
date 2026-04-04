import clsx from 'clsx'

const VARIANTS = {
  primary: {
    background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
    color: '#fff',
    border: 'none',
  },
  secondary: {
    background: 'var(--glass-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--glass-border)',
  },
  danger: {
    background: 'rgba(255,92,92,0.15)',
    color: 'var(--critical)',
    border: '1px solid rgba(255,92,92,0.3)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid transparent',
  },
}

export default function GlassButton({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  className,
  style,
  ...props
}) {
  const v = VARIANTS[variant] || VARIANTS.primary
  const padding = size === 'sm' ? '0.4rem 0.9rem' : size === 'lg' ? '0.8rem 2rem' : '0.55rem 1.3rem'
  const fontSize = size === 'sm' ? '0.8rem' : size === 'lg' ? '1rem' : '0.875rem'

  return (
    <button
      className={clsx('glass-btn', className)}
      disabled={disabled || loading}
      style={{
        ...v,
        padding,
        fontSize,
        borderRadius: 'var(--radius-md)',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontWeight: 500,
        transition: 'all var(--transition)',
        backdropFilter: 'blur(8px)',
        ...style,
      }}
      {...props}
    >
      {loading && <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />}
      {children}
    </button>
  )
}
