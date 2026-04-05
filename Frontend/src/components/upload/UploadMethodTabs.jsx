import { motion } from 'framer-motion'
import { cn } from '../../lib/utils.js'

const items = [
  { id: 'url', label: 'Website URL' },
  { id: 'csv', label: 'Upload CSV' },
]

export default function UploadMethodTabs({ activeTab, onChange }) {
  return (
    <div className="flex flex-wrap gap-2 rounded-3xl border border-white/10 bg-white/5 p-2">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            'relative rounded-2xl px-4 py-3 text-sm font-medium transition',
            activeTab === item.id ? 'text-white' : 'text-slate-400 hover:text-white',
          )}
        >
          {activeTab === item.id ? (
            <motion.span
              layoutId="upload-tab"
              className="absolute inset-0 rounded-2xl bg-gradient-to-r from-indigo-500/20 to-cyan-400/15"
            />
          ) : null}
          <span className="relative z-10">{item.label}</span>
        </button>
      ))}
    </div>
  )
}
