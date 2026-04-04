import { Globe, SearchCheck } from 'lucide-react'
import Button from '../ui/Button.jsx'

export default function UrlInputCard({
  value,
  crawlDepth,
  onChange,
  onDepthChange,
  onSubmit,
  loading,
}) {
  return (
    <div className="space-y-4">
      <label className="block space-y-2">
        <span className="text-sm text-slate-400">Website URL</span>
        <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-slate-950/70 px-4 py-3">
          <Globe className="h-5 w-5 text-cyan-300" />
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="https://your-enterprise-app.com"
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
          />
        </div>
      </label>
      <div className="flex flex-col gap-4 md:flex-row md:items-end">
        <label className="block flex-1 space-y-2">
          <span className="text-sm text-slate-400">Crawl depth</span>
          <select
            value={crawlDepth}
            onChange={(event) => onDepthChange(event.target.value)}
            className="h-12 w-full rounded-3xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none"
          >
            <option value="0">Landing page only</option>
            <option value="1">Core product pages</option>
            <option value="2">Deep crawl</option>
          </select>
        </label>
        <Button onClick={onSubmit} disabled={loading} className="gap-2">
          <SearchCheck className="h-4 w-4" />
          Detect features
        </Button>
      </div>
    </div>
  )
}
