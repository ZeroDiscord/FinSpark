import { useState } from 'react'
import { Shield } from 'lucide-react'
import Button from '../components/ui/Button.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { useTenantContext } from '../context/TenantContext.jsx'
import client from '../api/client.js'

function ConsentToggle({ label, description, checked, onChange }) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 cursor-pointer hover:bg-white/8 transition-colors">
      <div className="space-y-0.5">
        <div className="text-sm font-medium text-white">{label}</div>
        {description && <div className="text-xs text-slate-400">{description}</div>}
      </div>
      <div className="relative mt-0.5 flex-shrink-0">
        <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
        <div className={`w-10 h-5 rounded-full transition-colors ${checked ? 'bg-cyan-500' : 'bg-slate-600'}`} />
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </div>
    </label>
  )
}

export default function SettingsPage() {
  const { activeTenant } = useTenantContext()
  const [consent, setConsent] = useState({
    allow_feature_tracking:  true,
    allow_session_recording: true,
    allow_pii_collection:    false,
    allow_external_export:   true,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function toggleConsent(key) {
    setConsent((prev) => ({ ...prev, [key]: !prev[key] }))
    setSaved(false)
  }

  async function saveConsent() {
    if (!activeTenant?.id) return
    setSaving(true)
    try {
      await client.patch(`/tenants/${activeTenant.id}/consent`, consent)
      setSaved(true)
    } catch {
      // silently fail in demo
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Settings"
        title="Workspace preferences"
        description="Tune dashboard defaults, exports, notification preferences, and telemetry consent for your operating team."
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

        {/* Telemetry Consent Card */}
        <Card className="xl:col-span-2">
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-2 text-cyan-300">
                <Shield className="h-4 w-4" />
              </div>
              <div>
                <div className="text-lg font-semibold text-white">Telemetry consent</div>
                <div className="text-xs text-slate-400">Controls what usage data FinSpark collects for this workspace. Changes take effect immediately.</div>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <ConsentToggle
                label="Feature-level tracking"
                description="Track which product features are invoked per session"
                checked={consent.allow_feature_tracking}
                onChange={() => toggleConsent('allow_feature_tracking')}
              />
              <ConsentToggle
                label="Session recording"
                description="Record full user journey sequences for funnel analysis"
                checked={consent.allow_session_recording}
                onChange={() => toggleConsent('allow_session_recording')}
              />
              <ConsentToggle
                label="PII collection"
                description="Allow collection of user identifiers (masked by default)"
                checked={consent.allow_pii_collection}
                onChange={() => toggleConsent('allow_pii_collection')}
              />
              <ConsentToggle
                label="External export"
                description="Allow anonymized data export to Power BI and Asana"
                checked={consent.allow_external_export}
                onChange={() => toggleConsent('allow_external_export')}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={saveConsent} disabled={saving}>
                {saving ? 'Saving…' : 'Save consent settings'}
              </Button>
              {saved && <span className="text-sm text-emerald-400">Saved successfully</span>}
            </div>
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
      </div>
    </div>
  )
}
