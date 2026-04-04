import * as Dialog from '@radix-ui/react-dialog'
import { Menu, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import Button from '../ui/Button.jsx'

export default function MobileNavSheet({ open, onOpenChange, items }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <Button variant="secondary" size="sm" className="lg:hidden">
          <Menu className="h-4 w-4" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/80 lg:hidden" />
        <Dialog.Content className="glass-panel fixed inset-y-0 left-0 z-50 flex w-72 flex-col rounded-r-3xl border-r border-white/10 p-5 lg:hidden">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-cyan-300/80">FinSpark</div>
              <div className="text-lg font-semibold text-white">Navigation</div>
            </div>
            <Dialog.Close className="rounded-full border border-white/10 p-2">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="space-y-2">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => onOpenChange(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm ${
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
