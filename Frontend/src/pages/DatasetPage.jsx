import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Download, Search, RefreshCw, Brain } from 'lucide-react'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import Button from '../components/ui/Button.jsx'
import LoadingSkeleton from '../components/ui/LoadingSkeleton.jsx'
import { fetchEvents, getExportCsvUrl } from '../api/dataset.api.js'
import { trainTenant } from '../api/tenants.api.js'

const PAGE_SIZE = 50

const COLUMNS = [
  { key: 'tenant_id',          label: 'Tenant',        width: 'w-28',  truncate: true },
  { key: 'session_id',         label: 'Session',        width: 'w-28',  truncate: true },
  { key: 'user_id',            label: 'User',           width: 'w-24',  truncate: true },
  { key: 'timestamp',          label: 'Timestamp',      width: 'w-40' },
  { key: 'deployment_type',    label: 'Deploy',         width: 'w-20' },
  { key: 'channel',            label: 'Channel',        width: 'w-20' },
  { key: 'l1_domain',          label: 'L1 Domain',      width: 'w-28' },
  { key: 'l2_module',          label: 'L2 Module',      width: 'w-28' },
  { key: 'l3_feature',         label: 'L3 Feature',     width: 'w-32' },
  { key: 'l4_action',          label: 'L4 Action',      width: 'w-24' },
  { key: 'duration_ms',        label: 'Duration (ms)',  width: 'w-28' },
  { key: 'success',            label: 'Success',        width: 'w-20' },
  { key: 'churn_label',        label: 'Churn',          width: 'w-20' },
]

function truncate(str, n = 8) {
  if (!str) return '—'
  const s = String(str)
  return s.length > n ? s.slice(0, n) + '…' : s
}

function SuccessBadge({ value }) {
  const ok = value === true || value === 'true'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
      {ok ? 'yes' : 'no'}
    </span>
  )
}

function ChurnBadge({ value }) {
  const churned = Number(value) === 1
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${churned ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-700/50 text-slate-400'}`}>
      {churned ? 'churned' : '0'}
    </span>
  )
}

export default function DatasetPage() {
  const { tenantId } = useParams()
  const [rows, setRows]           = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [search, setSearch]       = useState('')
  const [deployType, setDeployType] = useState('')
  const [successFilter, setSuccessFilter] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [training, setTraining]   = useState(false)
  const [trainError, setTrainError] = useState(null)

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchEvents(tenantId, {
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch,
        deploymentType: deployType,
        success: successFilter,
      })
      setRows(data.data?.events || data.events || [])
      setTotal(data.data?.total ?? data.total ?? 0)
    } catch {
      setError('Failed to load events. Check that the backend is running.')
    } finally {
      setLoading(false)
    }
  }, [tenantId, page, debouncedSearch, deployType, successFilter])

  useEffect(() => { load() }, [load])

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1) }, [debouncedSearch, deployType, successFilter])

  const handleTrain = async () => {
    if (!tenantId) return
    setTraining(true)
    setTrainError(null)
    try {
      await trainTenant(tenantId, false) // false for no augmentation
      // After training, refresh the data to show new recommendations
      await load()
      // You might also want to refresh other data or navigate to recommendations
      alert('Training completed successfully! Model has been updated with new recommendations.')
    } catch (e) {
      setTrainError('Training failed. Please try again.')
      console.error('Training error:', e)
    } finally {
      setTraining(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Collected data"
        title="Event dataset"
        description={`${total.toLocaleString()} events ingested across all sessions. Filter, search, and export as CSV.`}
      />

      {/* Train Button */}
      <div className="flex justify-center">
        <Button
          onClick={handleTrain}
          disabled={training || !tenantId}
          className="gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 text-lg"
        >
          <Brain className="h-5 w-5" />
          {training ? 'Training Model...' : 'Train Model & Update Recommendations'}
        </Button>
      </div>
      {trainError && (
        <div className="text-center text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
          {trainError}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search user, feature, session…"
            className="w-full rounded-2xl border border-white/10 bg-white/5 py-2 pl-9 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>

        <select
          value={deployType}
          onChange={e => setDeployType(e.target.value)}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="">All deployments</option>
          <option value="cloud">Cloud</option>
          <option value="onprem">On-prem</option>
        </select>

        <select
          value={successFilter}
          onChange={e => setSuccessFilter(e.target.value)}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="">All outcomes</option>
          <option value="true">Success only</option>
          <option value="false">Failures only</option>
        </select>

        <Button variant="ghost" onClick={load} className="gap-2 text-slate-400 hover:text-white">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>

        <a href={tenantId ? getExportCsvUrl(tenantId) : '#'} download>
          <Button variant="secondary" className="gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </a>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-hidden">
          {loading ? (
            <div className="p-6">
              <LoadingSkeleton rows={10} />
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-rose-300">{error}</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-slate-400">No events found for the current filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10">
                    {COLUMNS.map(col => (
                      <th key={col.key} className={`${col.width} px-3 py-3 text-left font-medium text-slate-400 whitespace-nowrap`}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      {COLUMNS.map(col => (
                        <td key={col.key} className={`${col.width} px-3 py-2.5 text-slate-300 whitespace-nowrap`}>
                          {col.key === 'success'     ? <SuccessBadge value={row[col.key]} /> :
                           col.key === 'churn_label' ? <ChurnBadge value={row[col.key]} /> :
                           col.key === 'timestamp'   ? new Date(row[col.key]).toLocaleString() :
                           col.truncate              ? <span title={row[col.key]}>{truncate(row[col.key])}</span> :
                           (row[col.key] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>Page {page} of {totalPages} · {total.toLocaleString()} total events</span>
          <div className="flex gap-2">
            <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="text-xs">
              ← Prev
            </Button>
            <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="text-xs">
              Next →
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
