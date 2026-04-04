import { RotateCcw } from 'lucide-react'
import Button from './Button.jsx'
import { Card, CardContent } from './Card.jsx'

export default function FilterBar({ filters, options, onChange, onReset }) {
  return (
    <Card className="rounded-3xl">
      <CardContent className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {options.map((option) => (
            <label key={option.key} className="space-y-2 text-sm text-slate-400">
              <span>{option.label}</span>
              <select
                value={filters[option.key] ?? option.items[0]?.value}
                onChange={(event) => onChange(option.key, event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none ring-0"
              >
                {option.items.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <Button variant="secondary" onClick={onReset} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
      </CardContent>
    </Card>
  )
}
