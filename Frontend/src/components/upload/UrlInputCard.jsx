import { useState } from 'react'
import { Bot, Check, ChevronDown, ChevronUp, Copy, Download, Globe, Loader2, Plus, SearchCheck, Terminal, UploadCloud, X } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { discoverPaths, getLoggerSnippet, uploadLogFile, generatePathLoggerSnippet } from '../../api/upload.api.js'

function downloadPathsLog(paths, fileName = 'finspark-path-log.txt') {
  const rows = (paths || []).map((item) => {
    if (typeof item === 'string') return item;
    if (item.path && typeof item.count === 'number') return `${item.path}, ${item.count}`;
    return item.path || JSON.stringify(item);
  });
  const blob = new Blob([rows.join('\n')], { type: 'text/plain' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

// ─── Sub-mode toggle ───────────────────────────────────────────────────────────
function SubModeTabs({ mode, onChange }) {
  return (
    <div className="flex gap-1 rounded-2xl border border-white/10 bg-white/5 p-1">
      {[
        { id: 'manual', label: 'Manual Paths' },
        { id: 'crawl', label: 'Auto Crawl & Discover' },
      ].map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition ${
            mode === tab.id
              ? 'bg-gradient-to-r from-indigo-500/30 to-cyan-400/20 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ─── Manual paths mode ────────────────────────────────────────────────────────
function ManualPathsPanel({ baseUrl, onBaseUrlChange, paths, onPathsChange, onAnalyse }) {
  const [draft, setDraft] = useState('')

  function addPath() {
    const trimmed = draft.trim()
    if (!trimmed) return
    const normalised = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
    if (!paths.includes(normalised)) onPathsChange([...paths, normalised])
    setDraft('')
  }

  function removePath(p) {
    onPathsChange(paths.filter((x) => x !== p))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); addPath() }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <span className="text-sm text-slate-400">Base URL</span>
        <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-slate-950/70 px-4 py-3">
          <Globe className="h-4 w-4 shrink-0 text-cyan-300" />
          <input
            value={baseUrl}
            onChange={(e) => onBaseUrlChange(e.target.value)}
            placeholder="https://your-app.com"
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            disabled={loading}
          />
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-sm text-slate-400">Add known paths</span>
        <div className="flex gap-2">
          <div className="flex flex-1 items-center gap-3 rounded-3xl border border-white/10 bg-slate-950/70 px-4 py-3">
            <span className="text-slate-500">/</span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="dashboard, settings/billing, auth/login"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              disabled={loading}
            />
          </div>
          <button
            onClick={addPath}
            disabled={!draft.trim() || loading}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300 transition hover:bg-indigo-500/30 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {paths.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {paths.map((p) => (
            <span key={p} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              <code className="font-mono">{p}</code>
              <button onClick={() => removePath(p)} className="text-slate-500 hover:text-rose-400">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        {paths.length > 0 ? (
          <button
            onClick={() => downloadPathsLog(paths, 'finspark-manual-path-log.txt')}
            className="text-xs text-slate-400 transition hover:text-white"
            type="button"
          >
            Download path log
          </button>
        ) : <div />}
        <Button
          onClick={onAnalyse}
          disabled={loading || !baseUrl || paths.length === 0}
          className="gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
          {loading ? 'Analysing…' : 'Analyse with AI'}
        </Button>
      </div>
    </div>
  )
}

// ─── Auto crawl mode ──────────────────────────────────────────────────────────
function AutoCrawlPanel({ onSubmit, loading }) {
  const [url, setUrl] = useState('')
  const [maxPages, setMaxPages] = useState('50')
  const [maxDepth, setMaxDepth] = useState('3')
  const [discovered, setDiscovered] = useState(null)
  const [crawling, setCrawling] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [analysing, setAnalysing] = useState(false)

  async function handleCrawl() {
    if (!url) return
    setCrawling(true)
    setDiscovered(null)
    setSelected(new Set())
    setError('')
    try {
      const result = await discoverPaths(url, { maxPages: Number(maxPages), maxDepth: Number(maxDepth) })
      setDiscovered(result)
      // Auto-select all paths with depth ≤ 2 or link_count > 0
      const autoSelected = new Set(
        result.paths
          .filter((p) => p.depth <= 2 || p.link_count > 1)
          .map((p) => p.path)
      )
      setSelected(autoSelected)
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Crawl failed.')
    } finally {
      setCrawling(false)
    }
  }

  function togglePath(path) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === discovered?.paths.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(discovered.paths.map((p) => p.path)))
    }
  }

  async function handleAnalyse() {
    if (!discovered || selected.size === 0) return
    setAnalysing(true)
    try {
      // Build full URLs from selected paths for the AI analysis step
      const selectedPaths = discovered.paths.filter((p) => selected.has(p.path))
      await onSubmit({ url: discovered.base_url, selectedPaths, crawlDepth: Number(maxDepth) })
    } finally {
      setAnalysing(false)
    }
  }

  const depthColors = ['text-cyan-300', 'text-indigo-300', 'text-violet-300', 'text-slate-400']

  return (
    <div className="space-y-4">
      {/* URL + options */}
      <div className="space-y-1">
        <span className="text-sm text-slate-400">Website URL to spider</span>
        <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-slate-950/70 px-4 py-3">
          <Globe className="h-4 w-4 shrink-0 text-cyan-300" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-app.com"
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            disabled={crawling || analysing}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-sm text-slate-400">Max pages</span>
          <select
            value={maxPages}
            onChange={(e) => setMaxPages(e.target.value)}
            disabled={crawling || analysing}
            className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none disabled:opacity-50"
          >
            <option value="10">10 pages (fast)</option>
            <option value="25">25 pages</option>
            <option value="50">50 pages</option>
            <option value="100">100 pages (thorough)</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm text-slate-400">Crawl depth</span>
          <select
            value={maxDepth}
            onChange={(e) => setMaxDepth(e.target.value)}
            disabled={crawling || analysing}
            className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none disabled:opacity-50"
          >
            <option value="1">1 — top nav only</option>
            <option value="2">2 — section pages</option>
            <option value="3">3 — deep pages</option>
            <option value="4">4 — full spider</option>
          </select>
        </label>
      </div>

      <Button onClick={handleCrawl} disabled={crawling || analysing || !url} className="w-full gap-2 justify-center">
        {crawling ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchCheck className="h-4 w-4" />}
        {crawling ? `Spidering website…` : 'Discover Paths'}
      </Button>

      {crawling && (
        <div className="flex items-center gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
          <Loader2 className="h-4 w-4 animate-spin shrink-0 text-cyan-400" />
          Crawling up to {maxPages} pages at depth {maxDepth}. This may take up to 60s…
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
      )}

      {/* Discovered paths table */}
      {discovered && (
        <div className="space-y-3">
          {discovered.robots_paths?.length > 0 && (
            <div className="rounded-2xl border border-amber-400/15 bg-amber-500/5 px-4 py-3 space-y-1.5">
              <p className="text-xs font-medium text-amber-300">
                robots.txt — {discovered.robots_paths.length} paths declared
              </p>
              <div className="flex flex-wrap gap-1.5">
                {discovered.robots_paths.map((p) => (
                  <span key={p} className="font-mono text-xs rounded-full bg-amber-500/10 border border-amber-400/20 px-2 py-0.5 text-amber-200">{p}</span>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-300">
              Found <span className="font-semibold text-white">{discovered.paths.length}</span> paths across{' '}
              <span className="font-semibold text-white">{discovered.pages_crawled}</span> pages.
              Select which to analyse.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => downloadPathsLog(discovered.paths, 'finspark-discovered-paths.txt')}
                className="text-xs text-slate-400 transition hover:text-white"
              >
                Download path log
              </button>
              <button onClick={toggleAll} className="text-xs text-indigo-400 hover:text-indigo-300">
                {selected.size === discovered.paths.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-2xl border border-white/10 divide-y divide-white/5">
            {discovered.paths.map((p) => (
              <button
                key={p.path}
                onClick={() => togglePath(p.path)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-white/5 ${
                  selected.has(p.path) ? 'bg-indigo-500/10' : ''
                }`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  selected.has(p.path)
                    ? 'border-indigo-400 bg-indigo-500 text-white'
                    : 'border-white/20 bg-transparent'
                }`}>
                  {selected.has(p.path) && <Check className="h-3 w-3" />}
                </span>
                <span className={`font-mono text-xs ${depthColors[Math.min(p.depth, 3)]}`}>{p.path}</span>
                {p.title && <span className="truncate text-xs text-slate-500">{p.title}</span>}
                <span className="ml-auto shrink-0 text-xs text-slate-600">
                  depth {p.depth}{p.link_count > 0 ? ` · ${p.link_count} links` : ''}
                </span>
              </button>
            ))}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleAnalyse}
              disabled={analysing || selected.size === 0}
              className="gap-2"
            >
              {analysing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
              {analysing ? 'Running AI agent…' : `Analyse ${selected.size} path${selected.size !== 1 ? 's' : ''} with AI`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Logger snippet panel ─────────────────────────────────────────────────────
function LoggerSnippetPanel() {
  const [framework, setFramework] = useState('express')
  const [logDir, setLogDir] = useState('./logs')
  const [snippet, setSnippet] = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)

  async function fetchSnippet() {
    setLoading(true)
    try {
      const data = await getLoggerSnippet(framework, logDir)
      setSnippet(data)
      setOpen(true)
    } finally {
      setLoading(false)
    }
  }

  function copyCode() {
    if (!snippet) return
    navigator.clipboard.writeText(snippet.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadCode() {
    if (!snippet) return
    const blob = new Blob([snippet.code], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = snippet.filename
    a.click()
  }

  return (
    <div className="rounded-2xl border border-amber-400/15 bg-amber-500/5 p-4 space-y-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium text-amber-200">Request Logger — drop into your backend</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-amber-400" /> : <ChevronDown className="h-4 w-4 text-amber-400" />}
      </button>

      {open && (
        <div className="space-y-3 pt-1">
          <p className="text-xs text-amber-200/70">
            Add this middleware to your backend to log every request path, method, status, and user ID
            to a rotating log file. FinSpark reads these logs to show which paths your real users hit most.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs text-slate-400">Framework</span>
              <select
                value={framework}
                onChange={(e) => { setFramework(e.target.value); setSnippet(null) }}
                className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none"
              >
                <option value="express">Express (Node.js)</option>
                <option value="flask">Flask (Python)</option>
                <option value="fastapi">FastAPI (Python)</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-400">Log directory</span>
              <input
                value={logDir}
                onChange={(e) => { setLogDir(e.target.value); setSnippet(null) }}
                placeholder="./logs"
                className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none placeholder:text-slate-500"
              />
            </label>
          </div>

          <div className="flex gap-2">
            <Button onClick={fetchSnippet} disabled={loading} className="gap-2 text-sm">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Terminal className="h-3.5 w-3.5" />}
              Generate snippet
            </Button>
          </div>

          {snippet && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-slate-400">{snippet.filename}</span>
                <div className="flex gap-2">
                  <button onClick={copyCode} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition">
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button onClick={downloadCode} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition">
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                </div>
              </div>
              <pre className="max-h-64 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap border border-white/10">
                {snippet.code}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LogUploadPanel() {
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleUpload() {
    if (!file) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const response = await uploadLogFile(file)
      setResult(response)
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to extract paths from the log file.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-slate-100">
          <UploadCloud className="h-4 w-4 text-cyan-300" />
          <div>
            <div className="text-sm font-medium text-white">Upload request log file</div>
            <div className="text-xs text-slate-500">Extract URL paths ordered by request frequency.</div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="flex items-center gap-2 rounded-3xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-200 cursor-pointer">
          <span>{file?.name || 'Choose .log, .jsonl, or .txt file'}</span>
          <input
            type="file"
            accept=".log,.jsonl,.txt"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null)
              setResult(null)
              setError('')
            }}
            className="hidden"
          />
        </label>

        <Button onClick={handleUpload} disabled={!file || loading} className="gap-2 justify-center">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {loading ? 'Extracting…' : 'Extract paths'}
        </Button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
      ) : null}

      {result ? (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/80 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Log extraction</span>
            <span className="rounded-full bg-slate-800/80 px-2 py-1 text-xs text-slate-300">
              {result.path_stats.length} paths found
            </span>
          </div>
          <div className="text-sm text-slate-300">
            Most frequent path: <span className="font-medium text-white">{result.path_stats[0]?.path}</span> ({result.path_stats[0]?.count})
          </div>
          <div className="grid gap-2 text-sm text-slate-200">
            {result.path_stats.slice(0, 12).map((row) => (
              <div key={row.path} className="flex items-center justify-between rounded-2xl bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
                <span className="truncate">{row.path}</span>
                <span className="ml-3 rounded-full bg-slate-800/80 px-2 py-0.5 text-xs text-slate-200">{row.count}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => downloadPathsLog(result.path_stats, 'finspark-log-paths.txt')} className="gap-2 text-sm">
              <Download className="h-3.5 w-3.5" />
              Download frequency log
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function PathFileLoggerPanel() {
  const [file, setFile] = useState(null)
  const [logDir, setLogDir] = useState('./logs')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleGenerate() {
    if (!file) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const response = await generatePathLoggerSnippet(file, logDir)
      setResult(response)
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to generate path logger code.')
    } finally {
      setLoading(false)
    }
  }

  function copyCode() {
    if (!result?.code) return
    navigator.clipboard.writeText(result.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadCode() {
    if (!result?.code) return
    const blob = new Blob([result.code], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = result.filename || 'finspark-path-logger.js'
    a.click()
  }

  return (
    <div className="rounded-2xl border border-violet-400/15 bg-violet-500/5 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-slate-100">
          <UploadCloud className="h-4 w-4 text-violet-300" />
          <div>
            <div className="text-sm font-medium text-white">Generate backend path logger</div>
            <div className="text-xs text-slate-500">Upload your path file and get an Express middleware snippet that logs matching requests.</div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="flex items-center gap-2 rounded-3xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-200 cursor-pointer">
          <span>{file?.name || 'Choose .txt or .log path file'}</span>
          <input
            type="file"
            accept=".txt,.log,.jsonl"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null)
              setResult(null)
              setError('')
            }}
            className="hidden"
          />
        </label>

        <Button onClick={handleGenerate} disabled={!file || loading} className="gap-2 justify-center">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Terminal className="h-4 w-4" />}
          {loading ? 'Generating…' : 'Generate logger code'}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-slate-400">Log directory</span>
          <input
            value={logDir}
            onChange={(e) => setLogDir(e.target.value)}
            className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none"
            placeholder="./logs"
          />
        </label>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
      ) : null}

      {result ? (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Path logger snippet</div>
              <div className="text-sm text-slate-300">{result.paths?.length ?? 0} paths logged to <code className="font-mono">{result.log_dir}</code></div>
            </div>
            <div className="flex gap-2">
              <button onClick={copyCode} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button onClick={downloadCode} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition">
                <Download className="h-3.5 w-3.5" />
                Download
              </button>
            </div>
          </div>
          <pre className="max-h-64 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap border border-white/10">
            {result.code}
          </pre>
        </div>
      ) : null}
    </div>
  )
}

// ─── Root export ──────────────────────────────────────────────
export default function UrlInputCard({ onSubmit, loading }) {
  const [mode, setMode] = useState('crawl')

  // Manual mode state
  const [baseUrl, setBaseUrl] = useState('')
  const [manualPaths, setManualPaths] = useState([])

  async function handleManualAnalyse() {
    if (!baseUrl || manualPaths.length === 0) return
    await onSubmit({ url: baseUrl, manualPaths, mode: 'manual' })
  }

  async function handleCrawlSubmit({ url, selectedPaths, crawlDepth }) {
    await onSubmit({ url, selectedPaths, crawlDepth, mode: 'crawl' })
  }

  return (
    <div className="space-y-5">
      <SubModeTabs mode={mode} onChange={setMode} />

      {mode === 'manual' ? (
        <ManualPathsPanel
          baseUrl={baseUrl}
          onBaseUrlChange={setBaseUrl}
          paths={manualPaths}
          onPathsChange={setManualPaths}
          onAnalyse={handleManualAnalyse}
          loading={loading}
        />
      ) : (
        <AutoCrawlPanel onSubmit={handleCrawlSubmit} loading={loading} />
      )}

      <LoggerSnippetPanel />
      <LogUploadPanel />
      <PathFileLoggerPanel />
    </div>
  )
}
