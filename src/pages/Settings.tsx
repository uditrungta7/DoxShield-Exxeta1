import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { User, ScanLine, Bell, Brain, MonitorPlay, Shield, LogOut, Send, Loader2, FileDown } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { SIDECAR_BASE } from '../hooks/useSidecar'
import { exportReport } from '../lib/report'

// ─── Primitives ───────────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative w-10 h-5 rounded-full transition-colors duration-200"
      style={{ background: value ? 'var(--accent-blue)' : 'var(--bg-tertiary)', border: '1px solid var(--border-default)' }}
    >
      <motion.div
        className="absolute top-0.5 w-4 h-4 rounded-full"
        style={{ background: '#fff' }}
        animate={{ left: value ? '1.25rem' : '1px' }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-3 py-1.5 rounded-input text-xs outline-none"
      style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b last:border-0" style={{ borderColor: 'var(--border-subtle)' }}>
      <div>
        <div className="text-sm font-medium text-text-primary">{label}</div>
        {description && <div className="text-xs text-text-secondary mt-0.5">{description}</div>}
      </div>
      <div className="flex-shrink-0 ml-6">{children}</div>
    </div>
  )
}

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      className="rounded-card border overflow-hidden"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}
    >
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <Icon size={15} style={{ color: 'var(--accent-blue)' }} />
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      </div>
      <div className="px-5">{children}</div>
    </motion.div>
  )
}

// ─── Main Settings Page ───────────────────────────────────────────────────────

export default function Settings() {
  const { user, settings, setSettings, sidecarStatus, ollamaStatus, logout } = useAppStore()

  const [loginItem, setLoginItemLocal] = useState(false)
  const [sendingTestAlert, setSendingTestAlert] = useState(false)
  const [testAlertResult, setTestAlertResult]   = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState<{ ok: boolean; msg: string } | null>(null)

  const update = (key: string, value: any) => setSettings({ [key]: value })

  React.useEffect(() => {
    window.sovereign?.getLoginItem().then((v: boolean) => setLoginItemLocal(v))
  }, [])

  const handleSignOut = async () => {
    if (!window.confirm('Sign out of Doxshield?')) return
    if (window.sovereign?.clearToken) await window.sovereign.clearToken()
    logout()
  }

  const handleSendTestAlert = async () => {
    if (!user?.email) return
    setSendingTestAlert(true)
    setTestAlertResult(null)
    try {
      const res = await fetch(`${SIDECAR_BASE}/api/alerts/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      })
      if (res.ok) setTestAlertResult('Test alert sent!')
      else setTestAlertResult('Failed to send — check RESEND_API_KEY')
    } catch {
      setTestAlertResult('Sidecar unavailable')
    } finally {
      setSendingTestAlert(false)
      setTimeout(() => setTestAlertResult(null), 4000)
    }
  }

  const handleLoginItem = (v: boolean) => {
    setLoginItemLocal(v)
    window.sovereign?.setLoginItem(v)
  }

  const handleExport = async () => {
    setExporting(true)
    setExportStatus(null)
    try {
      const store = useAppStore.getState()
      await exportReport(store)
      setExportStatus({ ok: true, msg: 'Report saved!' })
    } catch (e: any) {
      setExportStatus({ ok: false, msg: 'Export failed' })
    } finally {
      setExporting(false)
      setTimeout(() => setExportStatus(null), 4000)
    }
  }

  const handleJsonExport = () => {
    const store = useAppStore.getState()
    const data = {
      generatedAt: new Date().toISOString(),
      user: store.user,
      overallRisk: store.overallRisk,
      apps: store.apps,
      connections: store.connections,
      cookies: store.cookies,
      lastScanAt: store.lastScanAt,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `doxshield-data-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        <p className="text-sm text-text-secondary mt-1">Configure Doxshield to your preferences</p>
      </motion.div>

      {/* Account */}
      <Section icon={User} title="Account">
        <Row label="Email" description="Your account email address">
          <span className="text-xs text-text-secondary">{user?.email || '—'}</span>
        </Row>
        <Row label="Plan" description="Your current subscription plan">
          <span className="px-2 py-0.5 rounded text-xs font-semibold capitalize"
            style={{ background: 'var(--accent-blue)22', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue)44' }}>
            {user?.plan || 'consumer'}
          </span>
        </Row>
        <Row label="Sidecar Status" description="Python backend health">
          <span className="text-xs font-medium" style={{ color: sidecarStatus === 'ready' ? 'var(--risk-low)' : 'var(--risk-medium)' }}>
            {sidecarStatus}
          </span>
        </Row>
        <Row label="Sign Out" description="Clear your session and return to login">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-button text-xs font-medium transition-colors hover:opacity-80"
            style={{ background: 'var(--risk-high)18', color: 'var(--risk-high)', border: '1px solid var(--risk-high)44' }}
          >
            <LogOut size={12} /> Sign Out
          </button>
        </Row>
      </Section>

      {/* Scanning */}
      <Section icon={ScanLine} title="Scanning">
        <Row label="Auto-scan on launch" description="Run a full scan when the app starts">
          <Toggle value={settings.autoScanOnLaunch ?? true} onChange={v => update('autoScanOnLaunch', v)} />
        </Row>
        <Row label="Scan interval" description="How often to run background scans">
          <Select
            value={settings.scanIntervalMinutes?.toString() ?? '60'}
            onChange={v => update('scanIntervalMinutes', parseInt(v))}
            options={[
              { value: '15',  label: 'Every 15 min' },
              { value: '30',  label: 'Every 30 min' },
              { value: '60',  label: 'Every hour' },
              { value: '360', label: 'Every 6 hours' },
            ]}
          />
        </Row>
        <Row label="Scan browsers" description="Include browser cookie analysis">
          <Toggle value={settings.scanBrowsers ?? true} onChange={v => update('scanBrowsers', v)} />
        </Row>
      </Section>

      {/* Alerts */}
      <Section icon={Bell} title="Alerts & Notifications">
        <Row label="Enable alerts" description="Show notifications for high-risk activity">
          <Toggle value={settings.alertsEnabled ?? true} onChange={v => update('alertsEnabled', v)} />
        </Row>
        <Row label="Email alerts" description="Send risk alerts to your email via Resend">
          <Toggle value={settings.emailAlertsEnabled ?? false} onChange={v => update('emailAlertsEnabled', v)} />
        </Row>
        <Row label="Minimum alert level" description="Only alert at or above this risk level">
          <Select
            value={settings.alertMinLevel ?? 'HIGH'}
            onChange={v => update('alertMinLevel', v)}
            options={[
              { value: 'LOW',    label: 'Low & above' },
              { value: 'MEDIUM', label: 'Medium & above' },
              { value: 'HIGH',   label: 'High & above' },
              { value: 'SEVERE', label: 'Severe only' },
            ]}
          />
        </Row>
        <Row label="Send Test Alert" description="Send a test email to verify your alert setup">
          <div className="flex items-center gap-2">
            {testAlertResult && (
              <span className="text-xs" style={{ color: testAlertResult.includes('sent') ? 'var(--risk-low)' : 'var(--risk-medium)' }}>
                {testAlertResult}
              </span>
            )}
            <button
              onClick={handleSendTestAlert}
              disabled={sendingTestAlert || !user?.email}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-button text-xs font-medium transition-opacity disabled:opacity-50"
              style={{ background: 'var(--accent-blue)18', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue)44' }}
            >
              {sendingTestAlert ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              {sendingTestAlert ? 'Sending…' : 'Send Test'}
            </button>
          </div>
        </Row>
      </Section>

      {/* AI */}
      <Section icon={Brain} title="AI Analysis">
        <Row label="Ollama status" description="Local Mistral 7B model availability">
          <span className="text-xs font-medium" style={{ color: ollamaStatus === 'ready' ? 'var(--risk-low)' : 'var(--risk-medium)' }}>
            {ollamaStatus}
          </span>
        </Row>
        <Row label="AI model" description="Model used for privacy policy analysis">
          <Select
            value={settings.ollamaModel ?? 'mistral'}
            onChange={v => update('ollamaModel', v)}
            options={[
              { value: 'mistral',       label: 'Mistral 7B' },
              { value: 'mistral:7b-q4', label: 'Mistral 7B Q4' },
              { value: 'llama3',        label: 'Llama 3 8B' },
            ]}
          />
        </Row>
        <Row label="Auto-analyse on scan" description="Run AI policy analysis during full scan">
          <Toggle value={settings.autoAnalyze ?? false} onChange={v => update('autoAnalyze', v)} />
        </Row>
      </Section>

      {/* Launch */}
      <Section icon={MonitorPlay} title="Launch & Startup">
        <Row label="Launch at login" description="Start Doxshield when you log in to your Mac">
          <Toggle value={loginItem} onChange={handleLoginItem} />
        </Row>
        <Row label="Start minimised" description="Launch to menu bar without showing window">
          <Toggle value={settings.startMinimised ?? false} onChange={v => update('startMinimised', v)} />
        </Row>
      </Section>

      {/* Privacy */}
      <Section icon={Shield} title="Privacy & Data">
        <Row label="Telemetry" description="Send anonymous usage data to improve Doxshield">
          <Toggle value={settings.telemetryEnabled ?? false} onChange={v => update('telemetryEnabled', v)} />
        </Row>
        <Row label="Cache policy analyses" description="Store AI results locally for 7 days">
          <Toggle value={settings.cachePolicyAnalyses ?? true} onChange={v => update('cachePolicyAnalyses', v)} />
        </Row>
        <Row label="Clear all data" description="Remove all scan results, alerts, and cache">
          <button
            className="px-3 py-1.5 rounded-button text-xs font-medium transition-colors hover:opacity-80"
            style={{ background: 'var(--risk-high)22', color: 'var(--risk-high)', border: '1px solid var(--risk-high)44' }}
            onClick={() => {
              if (window.confirm('Clear all Doxshield data? This cannot be undone.')) {
                useAppStore.getState().reset?.()
              }
            }}
          >
            Clear Data
          </button>
        </Row>
      </Section>

      {/* Reports & Export */}
      <Section icon={FileDown} title="Reports &amp; Export">
        <Row label="Full Privacy Report" description="Download a comprehensive PDF with all scan findings and recommendations">
          <div className="flex items-center gap-2">
            {exportStatus && (
              <span className="text-xs" style={{ color: exportStatus.ok ? 'var(--risk-low)' : 'var(--risk-high)' }}>
                {exportStatus.msg}
              </span>
            )}
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-button text-xs font-medium transition-opacity disabled:opacity-50"
              style={{ background: 'var(--accent-blue)18', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue)44' }}
            >
              {exporting ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
              {exporting ? 'Generating…' : 'Export PDF'}
            </button>
          </div>
        </Row>
        <Row label="Raw Data Export" description="Download all scan data as JSON for external analysis">
          <button
            onClick={handleJsonExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-button text-xs font-medium"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
          >
            <FileDown size={12} /> Export JSON
          </button>
        </Row>
      </Section>

      <div className="pb-4 text-xs text-text-tertiary">Doxshield · Built for EU data sovereignty</div>
    </div>
  )
}
