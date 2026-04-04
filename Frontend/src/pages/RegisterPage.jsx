import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { signUp } from '../services/authService.js'
import { useAuthContext } from '../context/AuthContext.jsx'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { login } = useAuthContext()
  const [form, setForm] = useState({
    full_name: '',
    company_name: '',
    email: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const payload = await signUp(form)
      login(payload)
      navigate('/app/workspaces')
    } catch (submitError) {
      setError(submitError.message || 'Unable to create account.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-shell flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-lg">
        <CardContent className="space-y-6">
          <div className="space-y-2 text-center">
            <div className="text-xs uppercase tracking-[0.3em] text-cyan-300/80">Create your command center</div>
            <h1 className="text-3xl font-semibold text-white">Start with FinSpark</h1>
            <p className="text-sm text-slate-400">Provision your workspace and begin mapping product intelligence.</p>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <input
              value={form.full_name}
              onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
              placeholder="Full name"
              className="h-12 rounded-3xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none"
            />
            <input
              value={form.company_name}
              onChange={(event) => setForm((current) => ({ ...current, company_name: event.target.value }))}
              placeholder="Company name"
              required
              className="h-12 rounded-3xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none"
            />
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="Work email"
              required
              className="h-12 rounded-3xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none md:col-span-2"
            />
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              placeholder="Password"
              required
              className="h-12 rounded-3xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none md:col-span-2"
            />
            {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 md:col-span-2">{error}</div> : null}
            <Button type="submit" className="w-full md:col-span-2" disabled={loading}>
              {loading ? 'Creating account...' : 'Create workspace'}
            </Button>
          </form>
          <div className="text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="text-cyan-300">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
