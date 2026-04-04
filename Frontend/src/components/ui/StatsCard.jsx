import { motion } from 'framer-motion'
import { Card, CardContent } from './Card.jsx'

export default function StatsCard({ title, value, delta, trend, icon: Icon }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="rounded-3xl">
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">{title}</span>
            {Icon ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-2 text-cyan-300">
                <Icon className="h-4 w-4" />
              </div>
            ) : null}
          </div>
          <div className="space-y-1">
            <div className="text-3xl font-semibold tracking-tight text-white">{value}</div>
            <div className={`text-sm ${trend === 'down' ? 'text-rose-300' : 'text-emerald-300'}`}>
              {delta}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
