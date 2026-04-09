import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, AppWindow, Globe, Network, Brain, Loader2, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { getRiskColor, getRiskBgClass, getJurisdictionFlag, cn, formatRelativeTime } from '../lib/utils'
import { SIDECAR_BASE, fetchJSON } from '../hooks/useSidecar'

// ─── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({ app }: { app: any }) {
  const layers = [
    { label: 'Jurisdiction',  score: app.jurisdiction_score  ?? app.layer_scores?.jurisdiction  ?? 0, weight: '30%' },
    { label: 'Privacy Policy',score: app.policy_score        ?? app.layer_scores?.policy        ?? 0, weight: '20%' },
    { label: 'Permissions',   score: app.permission_score    ?? app.layer_scores?.permissions   ?? 0, weight: '25%' },
    { label: 'Network',       score: app.network_score       ?? app.layer_scores?.network       ?? 0, weight: '25%' },
  ]

  return (
    <div className="space-y-5">
      {/* Risk factors */}
      <div className="rounded-card border p-4 space-y-3" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
        <h3 className="text-sm font-semibold text-text-primary">Risk Factors</h3>
        {(app.risk_factors || []).length === 0
          ? <p className="text-xs text-text-tertiary">No risk factors detected.</p>
          : (app.risk_factors as string[]).map((f: string, i: number) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{ color: getRiskColor(app.risk_level) }} />
              <span className="text-xs text-text-secondary">{f}</span>
            </div>
          ))
        }
      </div>

      {/* Risk layer scores */}
      <div className="rounded-card border p-4 space-y-3" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
        <h3 className="text-sm font-semibold text-text-primary">Risk Layer Scores</h3>
        <div className="space-y-2.5">
          {layers.map(layer => {
            const pct = Math.min(layer.score, 100)
            const color = layer.score <= 25 ? 'var(--risk-low)' : layer.score <= 50 ? 'var(--risk-medium)' : 'var(--risk-high)'
            return (
              <div key={layer.label} className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-text-secondary">{layer.label} <span className="text-text-tertiary">({layer.weight})</span></span>
                  <span className="text-xs font-semibold" style={{ color }}>{layer.score}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
                  <motion.div className="h-full rounded-full" style={{ background: color }}
                    initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recommended actions */}
      {(app.recommended_actions || []).length > 0 && (
        <div className="rounded-card border p-4 space-y-2" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
          <h3 className="text-sm font-semibold text-text-primary">Recommended Actions</h3>
          {(app.recommended_actions as any[]).map((a: any, i: number) => (
            <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
              {a.priority === 'HIGH'
                ? <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--risk-high)' }} />
                : <Info size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--risk-medium)' }} />
              }
              <div>
                <div className="text-xs font-medium text-text-primary">{a.title}</div>
                {a.description && <div className="text-xs text-text-secondary mt-0.5">{a.description}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* EU alternative */}
      {app.eu_alternative && (
        <div className="rounded-card border p-4 flex items-center gap-3" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
          <CheckCircle size={16} style={{ color: 'var(--risk-low)' }} className="flex-shrink-0" />
          <div>
            <div className="text-xs font-semibold text-text-primary">EU Alternative Available</div>
            <div className="text-xs text-accent-blue mt-0.5">{app.eu_alternative}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Network Activity ────────────────────────────────────────────────────

function NetworkTab({ appName }: { appName: string }) {
  const { connections } = useAppStore()
  const appConns = connections.filter(c =>
    (c.app_name || c.process_name || '').toLowerCase().includes(appName.toLowerCase().split(' ')[0])
  )

  return (
    <div className="rounded-card border overflow-hidden" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
      <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <h3 className="text-sm font-semibold text-text-primary">Active Connections</h3>
      </div>
      {appConns.length === 0 ? (
        <div className="px-4 py-8 text-center text-text-tertiary text-sm">No active connections for this app</div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              {['Remote Host', 'Port', 'Country', 'Risk', 'Time'].map(h => (
                <th key={h} className="px-4 py-2 text-left font-medium text-text-tertiary">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {appConns.map((conn, i) => (
              <tr key={i} className="hover:bg-bg-tertiary transition-colors"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td className="px-4 py-2.5 text-text-primary font-medium truncate max-w-[160px]">
                  {conn.remote_domain || conn.remote_ip}
                </td>
                <td className="px-4 py-2.5 text-text-secondary">{conn.remote_port}</td>
                <td className="px-4 py-2.5">{conn.country_code}</td>
                <td className="px-4 py-2.5">
                  <span className={cn('px-1.5 py-0.5 rounded border', getRiskBgClass(conn.risk_level))}>
                    {conn.risk_level}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-text-tertiary">{formatRelativeTime(conn.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Tab: AI Analysis ─────────────────────────────────────────────────────────

const ANALYSIS_STEPS = [
  { key: 'fetching',   label: 'Searching for privacy policy…' },
  { key: 'scraping',  label: 'Reading policy text…' },
  { key: 'analyzing', label: 'Analysing with local Mistral…' },
  { key: 'scoring',   label: 'Scoring risks…' },
  { key: 'done',      label: 'Analysis complete' },
]

function AITab({ appId, app }: { appId: string; app: any }) {
  const [loading, setLoading]           = useState(false)
  const [analysis, setAnalysis]         = useState<any>(app.policy_analysis || null)
  const [streamStep, setStreamStep]     = useState(-1)
  const [streamDetail, setStreamDetail] = useState('')
  const { ollamaStatus } = useAppStore()

  const handleAnalyze = async () => {
    setLoading(true)
    setStreamStep(0)
    setStreamDetail('')
    try {
      // Try streaming endpoint first
      const es = new EventSource(`${SIDECAR_BASE}/api/ai/analyze-stream/${appId}`)
      let resolved = false

      es.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data)
          const idx = ANALYSIS_STEPS.findIndex(s => s.key === d.step)
          if (idx >= 0) setStreamStep(idx)
          if (d.detail) setStreamDetail(d.detail)
          if (d.step === 'done' || d.result) {
            es.close()
            resolved = true
            if (d.result) setAnalysis(d.result)
            setLoading(false)
            setStreamStep(ANALYSIS_STEPS.length - 1)
          }
        } catch { /* ignore */ }
      }

      es.onerror = async () => {
        es.close()
        if (resolved) return
        // Fallback to regular POST
        try {
          const res = await fetchJSON(`/api/ai/analyze/${appId}`, { method: 'POST' })
          setAnalysis(res)
        } catch { /* ignore */ }
        setLoading(false)
        setStreamStep(-1)
      }
    } catch {
      setLoading(false)
      setStreamStep(-1)
    }
  }

  // Map new API response fields to display items
  const riskItems: { label: string; value: string | number; highlight?: boolean }[] = analysis ? [
    { label: 'Cloud Act Exposure',    value: analysis.cloud_act_exposure   ? 'Yes' : 'No',  highlight: !!analysis.cloud_act_exposure },
    { label: 'Data Outside EU',       value: analysis.data_stored_outside_eu === true ? 'Yes' : analysis.data_stored_outside_eu === false ? 'No' : 'Unknown' },
    { label: 'Third Party Sharing',   value: analysis.third_party_sharing  ? 'Yes' : 'No',  highlight: !!analysis.third_party_sharing },
    { label: 'Risk Level',            value: analysis.risk_level || 'Unknown', highlight: analysis.risk_level === 'HIGH' || analysis.risk_level === 'SEVERE' },
  ] : []

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="rounded-card border p-4 flex items-center justify-between"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <Brain size={16} style={{ color: 'var(--accent-blue)' }} />
          <div>
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-text-primary">Privacy Policy Analysis</div>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                style={{ background: 'var(--accent-blue)18', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue)44' }}>
                ⚡ local Mistral
              </span>
            </div>
            <div className="text-xs text-text-secondary mt-0.5">
              Powered by Ollama · Status: <span style={{ color: ollamaStatus === 'ready' ? 'var(--risk-low)' : 'var(--risk-medium)' }}>
                {ollamaStatus}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={loading || ollamaStatus !== 'ready'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-button text-xs font-medium transition-opacity disabled:opacity-50"
          style={{ background: 'var(--accent-blue)', color: '#fff' }}
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
          {loading ? 'Analysing…' : analysis ? 'Re-analyse' : 'Analyse Policy'}
        </button>
      </div>

      {/* Streaming progress */}
      {loading && streamStep >= 0 && (
        <div className="rounded-card border p-4 space-y-2"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
          <div className="text-xs font-semibold text-text-secondary mb-3">Analysis in progress…</div>
          {ANALYSIS_STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                {i < streamStep
                  ? <CheckCircle size={14} style={{ color: 'var(--risk-low)' }} />
                  : i === streamStep
                  ? <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-blue)' }} />
                  : <div className="w-2 h-2 rounded-full" style={{ background: 'var(--bg-elevated)' }} />
                }
              </div>
              <span className={`text-xs ${i <= streamStep ? 'text-text-primary' : 'text-text-tertiary'}`}>{s.label}</span>
            </div>
          ))}
          {streamDetail && <p className="text-xs text-text-tertiary mt-2 truncate">{streamDetail}</p>}
        </div>
      )}

      {analysis && !loading && (
        <>
          {/* One-line summary */}
          {analysis.one_line_summary && (
            <div className="rounded-card border p-4" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
              <h3 className="text-sm font-semibold text-text-primary mb-2">Summary</h3>
              <p className="text-xs text-text-secondary leading-relaxed">{analysis.one_line_summary}</p>
            </div>
          )}

          {/* Key findings */}
          <div className="rounded-card border p-4 space-y-3" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
            <h3 className="text-sm font-semibold text-text-primary">Key Findings</h3>
            <div className="grid grid-cols-2 gap-3">
              {riskItems.map(item => (
                <div key={item.label} className="p-3 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
                  <div className="text-xs text-text-tertiary">{item.label}</div>
                  <div className="text-sm font-semibold mt-1"
                    style={{ color: item.highlight ? 'var(--risk-high)' : 'var(--text-primary)' }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Data categories */}
          {(analysis.data_categories || []).length > 0 && (
            <div className="rounded-card border p-4" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Data Collected</h3>
              <div className="flex flex-wrap gap-2">
                {(analysis.data_categories as string[]).map((cat: string) => (
                  <span key={cat} className="px-2 py-0.5 rounded text-xs"
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Key risks */}
          {(analysis.key_risks || []).length > 0 && (
            <div className="rounded-card border p-4 space-y-2" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
              <h3 className="text-sm font-semibold text-text-primary">Privacy Risks</h3>
              {(analysis.key_risks as string[]).map((risk: string, i: number) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--risk-high)' }} />
                  <span className="text-xs text-text-secondary">{risk}</span>
                </div>
              ))}
            </div>
          )}

          {/* Legal framework */}
          {(analysis.applicable_law || []).length > 0 && (
            <div className="rounded-card border p-4" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
              <h3 className="text-sm font-semibold text-text-primary mb-2">Applicable Law</h3>
              <div className="flex flex-wrap gap-2">
                {(analysis.applicable_law as string[]).map((law: string) => (
                  <span key={law} className="px-2 py-0.5 rounded text-xs font-medium"
                    style={{ background: 'var(--risk-high)18', color: 'var(--risk-high)', border: '1px solid var(--risk-high)44' }}>
                    {law}
                  </span>
                ))}
              </div>
            </div>
          )}

          {analysis.from_cache && (
            <p className="text-xs text-text-tertiary">Cached result · Click Re-analyse to refresh</p>
          )}
        </>
      )}
    </div>
  )
}

// ─── Main AppDetail Page ──────────────────────────────────────────────────────

const TABS = [
  { id: 'overview', label: 'Overview',          icon: Info },
  { id: 'network',  label: 'Network Activity',  icon: Network },
  { id: 'ai',       label: 'AI Analysis',       icon: Brain },
] as const

export default function AppDetail() {
  const { apps, selectedAppId, setCurrentPage } = useAppStore()
  const [tab, setTab] = useState<'overview' | 'network' | 'ai'>('overview')
  const [liveApp, setLiveApp] = useState<any>(null)

  const app = liveApp || apps.find(a => a.app_id === selectedAppId)

  useEffect(() => {
    if (!selectedAppId) return
    fetchJSON(`/api/apps/${selectedAppId}`).then(setLiveApp).catch(() => {})
  }, [selectedAppId])

  if (!app) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <p className="text-text-tertiary text-sm">App not found.</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <button
          onClick={() => setCurrentPage('apps')}
          className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors mb-4"
        >
          <ChevronLeft size={14} /> Back to Applications
        </button>

        <div className="rounded-card border p-5 flex items-center gap-4" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
          <div className="w-14 h-14 rounded-xl bg-bg-elevated flex items-center justify-center flex-shrink-0">
            <AppWindow size={28} className="text-text-secondary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-text-primary">{app.app_name}</h1>
              <span className="text-base">{getJurisdictionFlag(app.jurisdiction)}</span>
            </div>
            <div className="text-xs text-text-secondary mt-0.5">{app.bundle_id || app.app_id}</div>
            <div className="flex items-center gap-3 mt-2">
              <span className={cn('text-xs font-semibold px-2 py-0.5 rounded border', getRiskBgClass(app.risk_level))}>
                {app.risk_level}
              </span>
              <span className="text-xs text-text-tertiary">{app.jurisdiction} jurisdiction</span>
              <span className="text-xs font-bold" style={{ color: getRiskColor(app.risk_level) }}>
                Risk Score: {app.risk_score}
              </span>
            </div>
          </div>
          {app.privacy_policy_url && (
            <a href={app.privacy_policy_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-button text-xs text-text-secondary hover:text-text-primary transition-colors"
              style={{ border: '1px solid var(--border-default)' }}
              onClick={e => { e.preventDefault(); window.sovereign?.openExternal(app.privacy_policy_url) }}>
              <Globe size={12} /> Privacy Policy
            </a>
          )}
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors flex-1 justify-center"
            style={{
              background: tab === t.id ? 'var(--bg-tertiary)' : 'transparent',
              color: tab === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: tab === t.id ? '1px solid var(--border-default)' : '1px solid transparent',
            }}
          >
            <t.icon size={12} /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
      >
        {tab === 'overview' && <OverviewTab app={app} />}
        {tab === 'network'  && <NetworkTab appName={app.app_name} />}
        {tab === 'ai'       && <AITab appId={app.app_id} app={app} />}
      </motion.div>
    </div>
  )
}
