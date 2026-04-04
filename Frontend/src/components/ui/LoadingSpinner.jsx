export default function LoadingSpinner({ message = 'Loading…', fullPage = false }) {
  const inner = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
      <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{message}</span>
    </div>
  )
  if (fullPage) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
      }}>
        {inner}
      </div>
    )
  }
  return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>{inner}</div>
}
