import React, { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Download, AlertTriangle, Info, Loader2, ExternalLink, Cookie, Wifi, Shield, Globe } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useAppStore } from '../../store/useAppStore'
import { RiskGauge } from './RiskGauge'
import { AppRiskCard } from './AppRiskCard'
import { NetworkFeed } from './NetworkFeed'
import { getRiskColor, formatRelativeTime } from '../../lib/utils'
import { SIDECAR_BASE } from '../../hooks/useSidecar'
import { exportReport } from '../../lib/report'

// ─── Action types ─────────────────────────────────────────────────────────────
interface Alternative { name: string; url?: string | null }
interface Action {
  type: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  title: string
  description?: string
  action_url?: string | null
  alternatives?: Alternative[]
  appName?: string
  icon?: 'shield' | 'cookie' | 'wifi' | 'globe' | 'alert'
}

// ─── Cookie recommendations ───────────────────────────────────────────────────
function buildCookieActions(cookies: any[]): Action[] {
  if (!cookies.length) return []
  const actions: Action[] = []

  const trackers = cookies.filter(c => c.is_tracker || c.category === 'Advertising' || c.risk_level === 'HIGH')
  const cnRuCookies = cookies.filter(c => c.jurisdiction === 'CN' || c.jurisdiction === 'RU')
  const thirdParty = cookies.filter(c => c.is_third_party)
  const adCookies = cookies.filter(c => c.category === 'Advertising')

  if (cnRuCookies.length > 0) {
    const domains = [...new Set(cnRuCookies.map(c => c.domain))].slice(0, 3).join(', ')
    actions.push({
      type: 'cookie_cn_ru',
      priority: 'HIGH',
      title: `Clear cookies from authoritarian domains (${cnRuCookies.length})`,
      description: `Cookies from ${domains} may transmit data to China or Russia. Clear them immediately.`,
      action_url: null,
      alternatives: [
        { name: 'Open Cookie Settings', url: null },
      ],
      icon: 'cookie',
    })
  }

  if (trackers.length > 0) {
    actions.push({
      type: 'cookie_trackers',
      priority: 'HIGH',
      title: `Remove ${trackers.length} tracking cookie${trackers.length !== 1 ? 's' : ''}`,
      description: 'These cookies track your activity across sites. Use a privacy browser extension to block them.',
      action_url: 'https://ublockorigin.com',
      alternatives: [
        { name: 'uBlock Origin', url: 'https://ublockorigin.com' },
        { name: 'Privacy Badger', url: 'https://privacybadger.org' },
      ],
      icon: 'cookie',
    })
  }

  if (adCookies.length > 5) {
    actions.push({
      type: 'cookie_ads',
      priority: 'MEDIUM',
      title: `Limit ad-tracking cookies (${adCookies.length} found)`,
      description: 'Enable "Prevent Cross-Site Tracking" in Safari or use Firefox with Enhanced Tracking Protection.',
      action_url: 'https://www.mozilla.org/firefox',
      alternatives: [
        { name: 'Firefox', url: 'https://www.mozilla.org/firefox' },
        { name: 'Brave', url: 'https://brave.com' },
      ],
      icon: 'cookie',
    })
  }

  if (thirdParty.length > 10) {
    actions.push({
      type: 'cookie_third_party',
      priority: 'MEDIUM',
      title: 'Block third-party cookies in your browser',
      description: `${thirdParty.length} third-party cookies found. Block them in browser settings to reduce tracking.`,
      action_url: 'https://brave.com',
      alternatives: [
        { name: 'Brave Browser', url: 'https://brave.com' },
        { name: 'DuckDuckGo Browser', url: 'https://duckduckgo.com/app' },
      ],
      icon: 'cookie',
    })
  }

  return actions
}

// ─── Network recommendations ──────────────────────────────────────────────────
function buildNetworkActions(connections: any[]): Action[] {
  if (!connections.length) return []
  const actions: Action[] = []

  const cnRu = connections.filter(c => c.jurisdiction === 'CN' || c.jurisdiction === 'RU' || c.country_code === 'CN' || c.country_code === 'RU')
  const trackers = connections.filter(c => c.is_known_tracker)
  const usConns = connections.filter(c => c.jurisdiction === 'US' || c.country_code === 'US')

  if (cnRu.length > 0) {
    const procs = [...new Set(cnRu.map(c => c.app_name || c.process_name))].slice(0, 2).join(', ')
    actions.push({
      type: 'network_cn_ru',
      priority: 'HIGH',
      title: `Active data flow to China/Russia — ${procs}`,
      description: 'Your device is actively transmitting data to authoritarian jurisdictions. Use a firewall or VPN to block these connections.',
      action_url: 'https://mullvad.net',
      alternatives: [
        { name: 'Mullvad VPN', url: 'https://mullvad.net' },
        { name: 'Proton VPN', url: 'https://protonvpn.com' },
        { name: 'Little Snitch', url: 'https://www.obdev.at/products/littlesnitch' },
      ],
      icon: 'globe',
    })
  }

  if (trackers.length > 3) {
    const cats = [...new Set(trackers.map(c => c.tracker_category).filter(Boolean))].slice(0, 2).join(', ')
    actions.push({
      type: 'network_trackers',
      priority: 'MEDIUM',
      title: `${trackers.length} tracker connections detected`,
      description: `Active ${cats || 'tracking'} connections. A DNS-based blocker stops these at the network level.`,
      action_url: 'https://nextdns.io',
      alternatives: [
        { name: 'NextDNS', url: 'https://nextdns.io' },
        { name: 'Pi-hole', url: 'https://pi-hole.net' },
        { name: 'AdGuard Home', url: 'https://adguard.com/adguard-home.html' },
      ],
      icon: 'wifi',
    })
  }

  if (usConns.length > connections.length * 0.7) {
    actions.push({
      type: 'network_us_heavy',
      priority: 'MEDIUM',
      title: 'Heavy US data routing — CLOUD Act exposure',
      description: `${usConns.length} of your connections route through the US. Switch to EU-hosted services to reduce CLOUD Act exposure.`,
      action_url: 'https://privacyguides.org',
      alternatives: [
        { name: 'Privacy Guides', url: 'https://privacyguides.org' },
        { name: 'EU-hosted Nextcloud', url: 'https://nextcloud.com/providers' },
      ],
      icon: 'wifi',
    })
  }

  return actions
}

function MiniBar({ value }: { value: number }) {
  const pct = Math.min(value, 100)
  const color = value <= 25 ? 'var(--risk-low)' : value <= 50 ? 'var(--risk-medium)' : 'var(--risk-high)'
  return (
    <div className="w-20 h-1 rounded-full bg-bg-tertiary overflow-hidden">
      <motion.div className="h-full rounded-full" style={{ background: color }}
        initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </div>
  )
}

function ActionIcon({ icon, priority }: { icon?: string; priority: string }) {
  const color = priority === 'HIGH' ? 'var(--risk-high)' : priority === 'MEDIUM' ? 'var(--risk-medium)' : 'var(--risk-low)'
  const size = 13
  if (icon === 'cookie') return <Cookie size={size} style={{ color }} />
  if (icon === 'wifi')   return <Wifi   size={size} style={{ color }} />
  if (icon === 'globe')  return <Globe  size={size} style={{ color }} />
  if (icon === 'shield') return <Shield size={size} style={{ color }} />
  if (priority === 'HIGH') return <AlertTriangle size={size} style={{ color }} />
  return <Info size={size} style={{ color }} />
}

export function ConsumerDashboard() {
  const { overallRisk, apps, cookies, connections, lastScanAt, isScanning, setIsScanning, setScanProgress, setOverallRisk, setApps, setCookies, setLastScanAt, alerts } = useAppStore()
  const topApps = [...apps].sort((a, b) => b.risk_score - a.risk_score).slice(0, 5)
  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState<{ ok: boolean; msg: string } | null>(null)

  const pieData = [
    { name: 'App Risk',     value: overallRisk?.app_risk_score     || 0 },
    { name: 'Network Risk', value: overallRisk?.network_risk_score || 0 },
    { name: 'Cookie Risk',  value: overallRisk?.cookie_risk_score  || 0 },
  ]
  const PIE_COLORS = ['var(--risk-high)', 'var(--risk-medium)', 'var(--risk-severe)']

  const handleRescan = async () => {
    setIsScanning(true)
    const es = new EventSource(`${SIDECAR_BASE}/api/scan/full-stream`)
    es.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data)
        if (d.step === 'complete') {
          es.close(); setIsScanning(false); setScanProgress(null)
          if (d.data?.overall) setOverallRisk(d.data.overall)
          if (d.data?.apps) setApps(d.data.apps)
          if (d.data?.cookies) setCookies(d.data.cookies)
          if (d.data?.scanned_at) setLastScanAt(d.data.scanned_at)
        } else if (d.step === 'error') {
          es.close(); setIsScanning(false)
        } else {
          setScanProgress({ step: d.step, detail: d.detail })
        }
      } catch { /* ignore */ }
    }
    es.onerror = () => { es.close(); setIsScanning(false) }
  }

  const handleExport = async () => {
    setExporting(true)
    setExportStatus(null)
    try {
      await exportReport(useAppStore.getState())
      setExportStatus({ ok: true, msg: 'Report saved!' })
    } catch {
      setExportStatus({ ok: false, msg: 'Export failed' })
    } finally {
      setExporting(false)
      setTimeout(() => setExportStatus(null), 4000)
    }
  }

  // Build all actions: app recommendations + cookie + network
  const actions = useMemo<Action[]>(() => {
    const appActions: Action[] = topApps.flatMap(app =>
      (app.recommended_actions as any[]).map(a => ({ ...a, appName: app.app_name }))
    )
    const cookieActions = buildCookieActions(cookies)
    const networkActions = buildNetworkActions(connections)
    const all = [...appActions, ...cookieActions, ...networkActions]
    // Sort: HIGH first, deduplicate by type+appName
    const seen = new Set<string>()
    return all
      .sort((a, b) => (a.priority === 'HIGH' ? -1 : b.priority === 'HIGH' ? 1 : 0))
      .filter(a => {
        const k = `${a.type}:${a.appName || ''}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      .slice(0, 8)
  }, [topApps, cookies, connections])

  // CN/RU alerts always pinned at top of recent alerts
  const recentAlerts = useMemo(() => {
    const cnRu = alerts.filter(a => /\b(china|russia)\b/i.test(a.title) || a.destination_country === 'China' || a.destination_country === 'Russia')
    const others = alerts.filter(a => !cnRu.includes(a))
    return [...cnRu.slice(0, 2), ...others].slice(0, 5)
  }, [alerts])

  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-[65fr_35fr] gap-5">
        {/* LEFT */}
        <div className="space-y-5">

          {/* Risk score card */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
            className="rounded-card p-4 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center justify-center">
                <RiskGauge score={overallRisk?.sovereignty_score ?? 0} size={160} />
              </div>
              <div className="flex flex-col justify-center gap-3">
                <div className="text-md text-text-secondary font-medium">Overall Sovereignty Score</div>
                <div className="h-px bg-border-subtle" />
                {[
                  { label: 'App Risk',     score: overallRisk?.app_risk_score     ?? 0 },
                  { label: 'Network Risk', score: overallRisk?.network_risk_score ?? 0 },
                  { label: 'Cookie Risk',  score: overallRisk?.cookie_risk_score  ?? 0 },
                ].map(({ label, score }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary w-24">{label}</span>
                    <MiniBar value={score} />
                    <span className="text-xs text-text-primary font-medium w-6 text-right">{score}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col justify-center gap-2">
                <div className="text-xs text-text-tertiary">
                  {lastScanAt ? `Last scanned ${formatRelativeTime(lastScanAt)}` : 'Never scanned'}
                </div>
                <button onClick={handleRescan} disabled={isScanning}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-button text-xs font-medium transition-colors"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>
                  <RefreshCw size={12} className={isScanning ? 'animate-spin' : ''} />
                  {isScanning ? 'Scanning…' : 'Rescan Now'}
                </button>
                <div className="flex flex-col items-start gap-1">
                  {exportStatus && (
                    <span className="text-[10px]" style={{ color: exportStatus.ok ? 'var(--risk-low)' : 'var(--risk-high)' }}>
                      {exportStatus.msg}
                    </span>
                  )}
                  <button
                    onClick={handleExport}
                    disabled={exporting}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-button text-xs font-medium hover:bg-bg-tertiary transition-colors disabled:opacity-50"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    {exporting ? 'Generating…' : 'Export Report'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Top apps */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.2 }}
            className="rounded-card border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderBottomColor: 'var(--border-subtle)' }}>
              <h2 className="text-lg font-semibold text-text-primary">Applications</h2>
              <button className="text-xs text-accent-blue hover:underline" onClick={() => useAppStore.getState().setCurrentPage('apps')}>View All →</button>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {topApps.length === 0
                ? <div className="px-4 py-8 text-center text-text-tertiary text-base">Run a scan to see app risks.</div>
                : topApps.map((app, i) => <AppRiskCard key={app.app_id} app={app} index={i} />)
              }
            </div>
          </motion.div>

          {/* Live network */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.2 }}
            className="rounded-card border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderBottomColor: 'var(--border-subtle)' }}>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-text-primary">Live Network Connections</h2>
                <div className="relative w-2 h-2 live-dot"><div className="w-full h-full rounded-full bg-risk-low" /></div>
              </div>
              <span className="text-xs text-text-tertiary">Updates every 10s</span>
            </div>
            <div className="p-2"><NetworkFeed /></div>
          </motion.div>
        </div>

        {/* RIGHT */}
        <div className="space-y-5">

          {/* Quick actions */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06, duration: 0.2 }}
            className="rounded-card border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
            <div className="px-4 py-3 border-b" style={{ borderBottomColor: 'var(--border-subtle)' }}>
              <h2 className="text-lg font-semibold text-text-primary">Recommended Actions</h2>
            </div>
            <div className="p-3 space-y-1">
              {actions.length === 0
                ? <div className="text-center py-4 text-text-tertiary text-base">Run a scan to see recommendations</div>
                : actions.map((a, i) => {
                    const alts: Alternative[] = (a as any).alternatives || []
                    const primaryUrl = (a as any).action_url
                    const isHighPriority = a.priority === 'HIGH'
                    return (
                      <div key={i} className="p-2.5 rounded-lg hover:bg-bg-tertiary transition-colors"
                           style={isHighPriority ? { borderLeft: '2px solid var(--risk-high)', paddingLeft: 8 } : {}}>
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 flex-shrink-0">
                            <ActionIcon icon={(a as any).icon} priority={a.priority} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1">
                              <span className="text-xs font-semibold text-text-primary leading-snug">{a.title}</span>
                              {primaryUrl && !alts.length && (
                                <button
                                  onClick={() => window.sovereign?.openExternal(primaryUrl)}
                                  className="flex-shrink-0 ml-1 opacity-60 hover:opacity-100 transition-opacity"
                                  title="Open"
                                >
                                  <ExternalLink size={10} style={{ color: 'var(--text-muted)' }} />
                                </button>
                              )}
                            </div>
                            {(a as any).appName && (
                              <div className="text-[10px] text-text-muted mt-0.5">{(a as any).appName}</div>
                            )}
                            {(a as any).description && (
                              <div className="text-[10px] text-text-secondary mt-0.5 leading-relaxed">{(a as any).description}</div>
                            )}
                            {/* EU alternatives as clickable links */}
                            {alts.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {alts.map((alt, j) => (
                                  alt.url
                                    ? (
                                      <button
                                        key={j}
                                        onClick={() => window.sovereign?.openExternal(alt.url!)}
                                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors hover:opacity-80"
                                        style={{ background: 'var(--bg-tertiary)', color: '#3b82f6', border: '1px solid var(--border-subtle)' }}
                                      >
                                        {alt.name}
                                        <ExternalLink size={8} />
                                      </button>
                                    )
                                    : (
                                      <span key={j}
                                        className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                                        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
                                      >
                                        {alt.name}
                                      </span>
                                    )
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
              }
            </div>
          </motion.div>

          {/* Donut chart */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.2 }}
            className="rounded-card border p-4" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
            <h2 className="text-lg font-semibold text-text-primary mb-3">Risk Breakdown</h2>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }} />
                <Legend formatter={(v) => <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Recent alerts */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14, duration: 0.2 }}
            className="rounded-card border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
            <div className="px-4 py-3 border-b" style={{ borderBottomColor: 'var(--border-subtle)' }}>
              <h2 className="text-lg font-semibold text-text-primary">Recent Alerts</h2>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {recentAlerts.length === 0
                ? <div className="px-4 py-4 text-center text-text-tertiary text-base">No alerts yet</div>
                : recentAlerts.map(alert => {
                    const isCnRu = alert.destination_country === 'China' || alert.destination_country === 'Russia'
                      || /\b(china|russia)\b/i.test(alert.title)
                    return (
                      <div key={alert.id}
                        className="flex items-center gap-3 px-4 py-2.5"
                        style={isCnRu ? { background: 'rgba(220,38,38,0.04)' } : {}}>
                        <div className="w-1.5 h-6 rounded-full flex-shrink-0" style={{ background: isCnRu ? '#dc2626' : getRiskColor(alert.risk_level) }} />
                        <div className="flex-1 min-w-0">
                          {isCnRu && (
                            <div className="text-[9px] font-bold uppercase tracking-widest text-red-500 mb-0.5">
                              Authoritarian Jurisdiction
                            </div>
                          )}
                          <div className="text-xs font-semibold text-text-primary truncate">{alert.app_name}</div>
                          <div className="text-[10px] text-text-secondary truncate">{alert.title}</div>
                        </div>
                        <span className="text-[10px] text-text-tertiary flex-shrink-0">{formatRelativeTime(alert.timestamp)}</span>
                      </div>
                    )
                  })
              }
            </div>
            <div className="px-4 py-2">
              <button className="text-xs text-accent-blue hover:underline" onClick={() => useAppStore.getState().setCurrentPage('alerts')}>
                View All Alerts →
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
