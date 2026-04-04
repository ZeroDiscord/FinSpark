import Button from './Button.jsx'
import { Card, CardContent } from './Card.jsx'

export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <Card className="rounded-3xl">
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        {Icon ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-cyan-300">
            <Icon className="h-8 w-8" />
          </div>
        ) : null}
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          <p className="max-w-md text-sm text-slate-400">{description}</p>
        </div>
        {action ? <Button onClick={action.onClick}>{action.label}</Button> : null}
      </CardContent>
    </Card>
  )
}
