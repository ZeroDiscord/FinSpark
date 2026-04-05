import { Bell, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '../../context/AuthContext.jsx'
import { fetchTenants } from '../../services/tenantService.js'
import Button from '../ui/Button.jsx'
import MobileNavSheet from './MobileNavSheet.jsx'
import WorkspaceSwitcher from './WorkspaceSwitcher.jsx'

export default function TopNavbar({ title, items }) {
  const { user, logout } = useAuthContext()
  const navigate = useNavigate()
  const [tenants, setTenants] = useState([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetchTenants().then(setTenants).catch(() => {})
  }, [])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/70 px-4 py-4 backdrop-blur-xl lg:px-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <MobileNavSheet open={open} onOpenChange={setOpen} items={items} />
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Control center</div>
            <h2 className="text-xl font-semibold text-white">{title}</h2>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 md:flex-nowrap md:items-center">
          <div className="hidden min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-400 md:flex">
            <Search className="h-4 w-4" />
            Search projects, features, and recommendations
          </div>
          <WorkspaceSwitcher tenants={tenants} />
          <button className="rounded-2xl border border-white/10 bg-white/5 p-3 text-slate-300">
            <Bell className="h-4 w-4" />
          </button>
          <div className="hidden text-right md:block">
            <div className="text-sm font-medium text-white">{user?.full_name || 'FinSpark User'}</div>
            <div className="text-xs text-slate-500">{user?.email}</div>
          </div>
          <Button variant="secondary" onClick={handleLogout}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  )
}
