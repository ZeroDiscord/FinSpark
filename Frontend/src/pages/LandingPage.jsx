import { motion } from 'framer-motion'
import {
  ArrowRight,
  Blocks,
  ChartColumnBig,
  DatabaseZap,
  GitBranchPlus,
  Radar,
  ShieldCheck,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import Button from '../components/ui/Button.jsx'
import GradientBadge from '../components/ui/GradientBadge.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { landingMetrics } from '../utils/mockData.js'

const featureCards = [
  { icon: Blocks, title: 'Automatic feature detection', description: 'Parse APKs, crawl web products, and infer product hierarchy without manual tagging.' },
  { icon: Radar, title: 'Churn intelligence', description: 'See where enterprise users drop off and which features are driving retention risk.' },
  { icon: DatabaseZap, title: 'Tracking code generation', description: 'Generate event instrumentation for web and Android from the detected hierarchy.' },
  { icon: GitBranchPlus, title: 'Asana workflow sync', description: 'Push high-priority recommendations straight into your Kanban operating loop.' },
]

function AnimatedDashboardPreview() {
  const bars = [58, 82, 74, 96, 61, 88]
  return (
    <div className="relative">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="glass-panel grid-pattern relative overflow-hidden rounded-[32px] p-6"
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Live intelligence</div>
            <div className="mt-2 text-xl font-semibold text-white">Executive analytics preview</div>
          </div>
          <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
            Syncing
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
            <div className="mb-4 flex items-center justify-between text-sm">
              <span className="text-slate-300">Feature usage trend</span>
              <span className="text-cyan-300">+18.4%</span>
            </div>
            <div className="flex h-40 items-end gap-3">
              {bars.map((bar, index) => (
                <motion.div
                  key={index}
                  initial={{ height: 0 }}
                  animate={{ height: `${bar}%` }}
                  transition={{ delay: index * 0.08, duration: 0.5 }}
                  className="flex-1 rounded-t-2xl bg-gradient-to-t from-indigo-500 to-cyan-400"
                />
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Churn alert</div>
              <div className="mt-3 text-3xl font-semibold text-white">72%</div>
              <div className="mt-1 text-sm text-slate-400">Drop-off at Credit Score Check</div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Suggested action</div>
              <div className="mt-3 text-sm text-slate-300">
                Move document upload before risk scoring and reduce form repetition.
              </div>
            </div>
          </div>
        </div>
      </motion.div>
      <motion.div
        animate={{ y: [-6, 6, -6] }}
        transition={{ duration: 5, repeat: Infinity }}
        className="absolute -left-8 top-10 hidden rounded-3xl border border-white/10 bg-slate-950/90 px-4 py-3 shadow-2xl xl:block"
      >
        <div className="text-xs text-slate-500">Feature map confidence</div>
        <div className="text-lg font-semibold text-white">94.2%</div>
      </motion.div>
      <motion.div
        animate={{ y: [6, -8, 6] }}
        transition={{ duration: 6, repeat: Infinity }}
        className="absolute -right-8 bottom-10 hidden rounded-3xl border border-white/10 bg-slate-950/90 px-4 py-3 shadow-2xl xl:block"
      >
        <div className="text-xs text-slate-500">ML recommendations</div>
        <div className="text-lg font-semibold text-white">18 open</div>
      </motion.div>
    </div>
  )
}

export default function LandingPage() {
  return (
    <div className="page-shell min-h-screen px-4 pb-10 pt-4 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <nav className="glass-panel flex items-center justify-between rounded-[28px] px-5 py-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-cyan-300/80">Enterprise Feature Intelligence Platform</div>
            <div className="mt-1 text-xl font-semibold text-white">FinSpark</div>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost">Sign in</Button>
            </Link>
            <Link to="/register">
              <Button className="gap-2">
                Get started
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </nav>

        <section className="grid gap-10 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="space-y-6">
            <GradientBadge>Product analytics for complex enterprise apps</GradientBadge>
            <div className="space-y-5">
              <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-white md:text-6xl">
                Turn Product Usage into <span className="gradient-text">Business Intelligence</span>
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-400">
                Upload an APK, a website, or a behavioral dataset. Detect features automatically, generate instrumentation, analyze ML churn signals, and route recommendations into the teams that ship fixes.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/register">
                <Button size="lg" className="gap-2">
                  Upload APK
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/register">
                <Button size="lg" variant="secondary">
                  Analyze Dataset
                </Button>
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {landingMetrics.map((item) => (
                <Card key={item.label}>
                  <CardContent className="space-y-2">
                    <div className="text-2xl font-semibold text-white">{item.value}</div>
                    <div className="text-sm text-slate-400">{item.label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          <AnimatedDashboardPreview />
        </section>

        <section className="space-y-8 py-10">
          <div className="max-w-2xl space-y-3">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Platform capabilities</div>
            <h2 className="text-3xl font-semibold text-white">Built like a modern analytics control room</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {featureCards.map((card, index) => (
              <motion.div key={card.title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.08 }}>
                <Card className="h-full">
                  <CardContent className="space-y-4">
                    <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-3 text-cyan-300">
                      <card.icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-white">{card.title}</h3>
                      <p className="text-sm leading-6 text-slate-400">{card.description}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 py-10 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['01', 'Upload APK / URL / CSV'],
            ['02', 'Detect feature hierarchy'],
            ['03', 'Analyze usage and churn'],
            ['04', 'Export or send to Kanban'],
          ].map(([step, label]) => (
            <Card key={step}>
              <CardContent className="space-y-3">
                <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Step {step}</div>
                <div className="text-lg font-semibold text-white">{label}</div>
              </CardContent>
            </Card>
          ))}
        </section>

        <footer className="mt-8 flex flex-col gap-4 border-t border-white/10 py-8 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-cyan-300" />
            Premium intelligence UX inspired by Mixpanel, Datadog, Linear, and Power BI.
          </div>
          <div className="flex items-center gap-6">
            <span>Responsive for laptop and tablet</span>
            <span className="inline-flex items-center gap-2">
              <ChartColumnBig className="h-4 w-4" />
              Built with React + Tailwind
            </span>
          </div>
        </footer>
      </div>
    </div>
  )
}
