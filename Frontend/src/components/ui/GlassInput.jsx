import clsx from 'clsx'

export default function GlassInput({ label, error, className, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {label && (
        <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
          {label}
        </label>
      )}
      <input
        className={clsx(className)}
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: `1px solid ${error ? 'var(--critical)' : 'var(--glass-border)'}`,
          borderRadius: 'var(--radius-md)',
          padding: '0.65rem 1rem',
          color: 'var(--text-primary)',
          fontSize: '0.9rem',
          outline: 'none',
          width: '100%',
          transition: 'border-color var(--transition)',
          backdropFilter: 'blur(8px)',
        }}
        onFocus={e => { e.target.style.borderColor = 'var(--primary)' }}
        onBlur={e => { e.target.style.borderColor = error ? 'var(--critical)' : 'var(--glass-border)' }}
        {...props}
      />
      {error && <span style={{ fontSize: '0.78rem', color: 'var(--critical)' }}>{error}</span>}
    </div>
  )
}
