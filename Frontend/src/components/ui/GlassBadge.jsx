import clsx from 'clsx'

const COLORS = {
  critical: { bg: 'rgba(255,92,92,0.15)',  border: 'rgba(255,92,92,0.35)',  color: '#ff7b7b' },
  high:     { bg: 'rgba(255,140,66,0.15)', border: 'rgba(255,140,66,0.35)', color: '#ffa55a' },
  medium:   { bg: 'rgba(255,179,71,0.15)', border: 'rgba(255,179,71,0.35)', color: '#ffc55e' },
  low:      { bg: 'rgba(76,175,130,0.15)', border: 'rgba(76,175,130,0.35)', color: '#6de0a8' },
  info:     { bg: 'rgba(91,192,222,0.15)', border: 'rgba(91,192,222,0.35)', color: '#7dd0e8' },
  success:  { bg: 'rgba(76,175,130,0.15)', border: 'rgba(76,175,130,0.35)', color: '#6de0a8' },
  default:  { bg: 'rgba(255,255,255,0.08)',border: 'rgba(255,255,255,0.15)',color: 'rgba(255,255,255,0.7)' },
}

export default function GlassBadge({ children, variant = 'default', className }) {
  const c = COLORS[variant] || COLORS.default
  return (
    <span
      className={clsx(className)}
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.color,
        padding: '0.2rem 0.65rem',
        borderRadius: '100px',
        fontSize: '0.75rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
      }}
    >
      {children}
    </span>
  )
}
