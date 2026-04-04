import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { signIn } from '../services/authService.js'
import { useAuthContext } from '../context/AuthContext.jsx'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuthContext()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const payload = await signIn(form)
      login(payload)
      navigate('/app/workspaces')
    } catch (submitError) {
      setError(submitError.message || 'Unable to sign in.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-shell flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-6">
          <div className="space-y-2 text-center">
            <div className="text-xs uppercase tracking-[0.3em] text-cyan-300/80">FinSpark workspace access</div>
            <h1 className="text-3xl font-semibold text-white">Sign in</h1>
            <p className="text-sm text-slate-400">Continue to the enterprise intelligence control center.</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              required
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="you@company.com"
              className="h-12 w-full rounded-3xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none"
            />
            <input
              type="password"
              required
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              placeholder="Password"
              className="h-12 w-full rounded-3xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none"
            />
            {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Enter workspace'}
            </Button>
          </form>
          <div className="text-center text-sm text-slate-500">
            Need an account?{' '}
            <Link to="/register" className="text-cyan-300">
              Create one
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
