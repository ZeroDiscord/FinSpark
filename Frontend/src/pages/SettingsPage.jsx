import Button from '../components/ui/Button.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Settings"
        title="Workspace preferences"
        description="Tune dashboard defaults, exports, and notification preferences for your operating team."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardContent className="space-y-4">
            <div className="text-lg font-semibold text-white">Profile settings</div>
            <input className="h-12 w-full rounded-3xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none" placeholder="Default owner name" />
            <input className="h-12 w-full rounded-3xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none" placeholder="Notification email" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4">
            <div className="text-lg font-semibold text-white">Workspace preferences</div>
            <select className="h-12 w-full rounded-3xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none">
              <option>Default date range: 30 days</option>
              <option>Default date range: 90 days</option>
            </select>
            <select className="h-12 w-full rounded-3xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none">
              <option>Deployment filter: All</option>
              <option>Deployment filter: Cloud</option>
              <option>Deployment filter: On-prem</option>
            </select>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4">
            <div className="text-lg font-semibold text-white">Export preferences</div>
            <label className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-300">
              Power BI export ready
              <input type="checkbox" defaultChecked />
            </label>
            <label className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-300">
              Email recommendation digest
              <input type="checkbox" defaultChecked />
            </label>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4">
            <div className="text-lg font-semibold text-white">Danger zone</div>
            <p className="text-sm text-slate-400">Use carefully. These actions affect the current workspace configuration.</p>
            <Button variant="destructive">Reset workspace preferences</Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4">
            <div className="text-lg font-semibold text-white">Governance & Consent</div>
            <p className="text-sm text-slate-400">Configure telemetry collection and view audit logs.</p>
            <label className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-300">
              Enable Telemetry Tracking
              <input type="checkbox" defaultChecked />
            </label>
            <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Recent Audit Logs</div>
              <div className="space-y-2 text-xs text-slate-400">
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span>admin@finspark.com</span>
                  <span>Enabled tracking</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
