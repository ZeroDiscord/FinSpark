import { useNavigate } from 'react-router-dom'
import { useTenantContext } from '../../context/TenantContext.jsx'

export default function WorkspaceSwitcher({ tenants = [] }) {
  const { activeTenant, setActiveTenant } = useTenantContext()
  const navigate = useNavigate()

  function handleChange(event) {
    const selected = tenants.find((tenant) => tenant.id === event.target.value)
    setActiveTenant(selected || null)
    if (selected) navigate(`/app/dashboard/${selected.id}`)
  }

  return (
    <select
      value={activeTenant?.id || ''}
      onChange={handleChange}
      className="h-11 min-w-48 rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-slate-100 outline-none"
    >
      <option value="">Select workspace</option>
      {tenants.map((tenant) => (
        <option key={tenant.id} value={tenant.id}>
          {tenant.company_name}
        </option>
      ))}
    </select>
  )
}
