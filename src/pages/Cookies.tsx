import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Search, Cookie, AlertTriangle, Globe, ShieldCheck, Lock, ExternalLink,
         ChevronDown, ChevronRight, ChevronUp, RefreshCw } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { getRiskColor, getRiskBgClass, cn } from '../lib/utils'
import { fetchJSON, SIDECAR_BASE } from '../hooks/useSidecar'

interface CookieItem {
  id: string
  browser: string
  domain: string
  name: string
  category: string
  risk_level: string
  jurisdiction?: string
  is_third_party?: boolean
  is_httponly?: boolean
  is_secure?: boolean
  is_persistent?: boolean
  known_tracker?: boolean
  tracker_name?: string
  company?: string
  expires_unix?: number
}

type SortField = 'domain' | 'risk' | 'jurisdiction' | 'expiry'
type SortDir   = 'asc' | 'desc'

const RISK_ORDER: Record<string, number> = { SEVERE: 4, HIGH: 3, MEDIUM: 2, LOW: 1, UNVERIFIED: 0 }

const BROWSERS = ['all', 'chrome', 'firefox', 'safari', 'brave', 'arc', 'edge', 'vivaldi'] as const
type Browser = typeof BROWSERS[number]

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number | string; color: string }) {
  return (
    <div className="rounded-card border p-4 flex items-center gap-3" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: color + '18' }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div>
        <div className="text-xl font-bold text-text-primary">{value}</div>
        <div className="text-xs text-text-secondary">{label}</div>
      </div>
    </div>
  )
}

// ─── FDA Permission Gate ──────────────────────────────────────────────────────

function FDABanner({ onGranted }: { onGranted: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 p-3 rounded-card mb-1"
      style={{ background: 'var(--accent-blue)10', border: '1px solid var(--accent-blue)33' }}>
      <Lock size={15} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent-blue)' }} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-text-primary">Safari cookies require Full Disk Access</p>
        <p className="text-xs text-text-secondary mt-0.5">
          Add Doxshield (or Electron.app in dev mode) to Full Disk Access in System Settings to see Safari cookies.
        </p>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button
          onClick={() => window.sovereign?.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles')}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium"
          style={{ background: 'var(--accent-blue)', color: '#fff' }}>
          <ExternalLink size={11} /> Open Settings
        </button>
        <button onClick={onGranted}
          className="px-2.5 py-1 rounded text-xs text-text-secondary"
          style={{ border: '1px solid var(--border-default)' }}>
          Retry
        </button>
      </div>
    </motion.div>
  )
}

function FDAGate({ onGranted }: { onGranted: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 text-center space-y-5"
    >
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--accent-blue)18', border: '1px solid var(--accent-blue)44' }}>
        <Lock size={28} style={{ color: 'var(--accent-blue)' }} />
      </div>
      <div className="space-y-1.5 max-w-xs">
        <h2 className="text-lg font-bold text-text-primary">Full Disk Access Required</h2>
        <p className="text-sm text-text-secondary leading-relaxed">
          To read browser cookies, Doxshield needs Full Disk Access in System Settings.
        </p>
      </div>
      <div className="p-4 rounded-card text-left text-xs text-text-secondary space-y-2 max-w-xs"
        style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}>
        <p className="font-semibold text-text-primary">In dev mode, grant access to:</p>
        <code className="block text-xs break-all" style={{ color: 'var(--accent-blue)' }}>
          /Users/uditrungta/DoxShield/node_modules/electron/dist/Electron.app
        </code>
        <p className="text-text-tertiary">System Settings → Privacy &amp; Security → Full Disk Access → +</p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => window.sovereign?.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles')}
          className="flex items-center gap-2 px-4 py-2 rounded-button text-sm font-semibold"
          style={{ background: 'var(--accent-blue)', color: '#fff' }}>
          <ExternalLink size={13} /> Open System Settings
        </button>
        <button onClick={onGranted}
          className="px-4 py-2 rounded-button text-sm font-medium text-text-secondary"
          style={{ border: '1px solid var(--border-default)' }}>
          I've granted it
        </button>
      </div>
    </motion.div>
  )
}

// ─── Expandable cookie row ────────────────────────────────────────────────────

function CookieRow({ cookie }: { cookie: CookieItem }) {
  const [expanded, setExpanded] = useState(false)
  const getCategoryColor = (cat: string) => {
    switch (cat?.toLowerCase()) {
      case 'analytics':   return 'var(--risk-medium)'
      case 'advertising': return 'var(--risk-high)'
      case 'tracker':     return 'var(--risk-high)'
      case 'functional':  return 'var(--risk-low)'
      case 'essential':   return 'var(--risk-low)'
      default:            return 'var(--text-tertiary)'
    }
  }

  return (
    <>
      <tr
        onClick={() => setExpanded(e => !e)}
        className="cursor-pointer hover:bg-bg-tertiary transition-colors"
        style={{ borderBottom: expanded ? 'none' : '1px solid var(--border-subtle)' }}
      >
        <td className="px-4 py-2.5 font-medium text-text-primary truncate max-w-[160px]">
          <span className="flex items-center gap-1.5">
            {cookie.known_tracker && <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--risk-high)' }} />}
            {cookie.domain}
          </span>
        </td>
        <td className="px-4 py-2.5 text-text-secondary truncate max-w-[120px]">{cookie.name}</td>
        <td className="px-4 py-2.5 capitalize text-text-secondary">{cookie.browser}</td>
        <td className="px-4 py-2.5">
          <span className="px-1.5 py-0.5 rounded-badge text-xs font-medium"
            style={{ color: getCategoryColor(cookie.category), background: getCategoryColor(cookie.category) + '18' }}>
            {cookie.category || 'unknown'}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <span className={cn('px-1.5 py-0.5 rounded border text-xs', getRiskBgClass(cookie.risk_level))}>
            {cookie.risk_level || '—'}
          </span>
        </td>
        <td className="px-4 py-2.5 text-text-tertiary text-xs">
          {cookie.jurisdiction || 'Unknown'}
        </td>
        <td className="px-4 py-2.5 text-text-tertiary text-xs">
          {cookie.expires_unix
            ? new Date(cookie.expires_unix).toLocaleDateString([], { year: '2-digit', month: 'short', day: 'numeric' })
            : '—'}
        </td>
        <td className="px-4 py-2.5 w-8">
          {expanded ? <ChevronDown size={12} className="text-text-tertiary" /> : <ChevronRight size={12} className="text-text-tertiary" />}
        </td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <td colSpan={8} className="px-4 py-3" style={{ background: 'var(--bg-tertiary)' }}>
            <div className="grid grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-text-tertiary">Company</span>
                <div className="text-text-primary mt-0.5">{cookie.company || 'Unknown'}</div>
              </div>
              <div>
                <span className="text-text-tertiary">Third Party</span>
                <div className="text-text-primary mt-0.5">{cookie.is_third_party ? 'Yes' : 'No'}</div>
              </div>
              <div>
                <span className="text-text-tertiary">Secure / HttpOnly</span>
                <div className="text-text-primary mt-0.5">
                  {cookie.is_secure ? 'Secure' : 'Not secure'} · {cookie.is_httponly ? 'HttpOnly' : 'Accessible to JS'}
                </div>
              </div>
              <div>
                <span className="text-text-tertiary">Persistent</span>
                <div className="text-text-primary mt-0.5">{cookie.is_persistent ? 'Yes' : 'Session'}</div>
              </div>
              {cookie.tracker_name && (
                <div>
                  <span className="text-text-tertiary">Tracker</span>
                  <div className="text-text-primary mt-0.5">{cookie.tracker_name}</div>
                </div>
              )}
              {cookie.expires_unix ? (
                <div>
                  <span className="text-text-tertiary">Expires</span>
                  <div className="text-text-primary mt-0.5">
                    {new Date(cookie.expires_unix).toLocaleString()}
                  </div>
                </div>
              ) : null}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Cookies() {
  const { cookies: storedCookies } = useAppStore()
  const [browser, setBrowser]       = useState<Browser>('all')
  const [search, setSearch]         = useState('')
  const [liveCookies, setLiveCookies] = useState<CookieItem[] | null>(null)
  const [loading, setLoading]       = useState(false)
  const [fdaGranted, setFdaGranted] = useState<boolean | null>(null)
  const [stats, setStats]           = useState<Record<string, any>>({})
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [sortField, setSortField]   = useState<SortField>('risk')
  const [sortDir, setSortDir]       = useState<SortDir>('desc')

  const applyData = (data: any) => {
    if (data.cookies !== undefined) {
      setLiveCookies(data.cookies)
      setStats(data.stats || {})
      setFdaGranted(data.fda_granted ?? true)
    } else if (Array.isArray(data)) {
      setLiveCookies(data)
      setFdaGranted(true)
    }
    setLastUpdated(new Date())
  }

  const loadCookies = useCallback(() => {
    setLoading(true)
    fetch(`${SIDECAR_BASE}/api/cookies`)
      .then(r => r.json()).then(applyData)
      .catch(() => setFdaGranted(false))
      .finally(() => setLoading(false))
  }, [])

  // Initial load
  useEffect(() => { loadCookies() }, [loadCookies])

  // Auto-refresh every 90 seconds
  useEffect(() => {
    const id = setInterval(loadCookies, 90_000)
    return () => clearInterval(id)
  }, [loadCookies])

  // Auto-detect FDA grant: poll every 3s while gate is visible
  useEffect(() => {
    if (fdaGranted !== false) return
    const id = setInterval(() => {
      fetch(`${SIDECAR_BASE}/api/cookies/status`)
        .then(r => r.json())
        .then(d => { if (d.fda_granted) { clearInterval(id); loadCookies() } })
        .catch(() => {})
    }, 3000)
    return () => clearInterval(id)
  }, [fdaGranted, loadCookies])

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const cookies: CookieItem[] = liveCookies || storedCookies as CookieItem[]

  const filtered = useMemo(() => {
    let list = [...cookies]
    if (browser !== 'all') list = list.filter(c => c.browser?.toLowerCase() === browser)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c => c.domain?.toLowerCase().includes(q) || c.name?.toLowerCase().includes(q))
    }
    list.sort((a, b) => {
      let cmp = 0
      if (sortField === 'domain')       cmp = (a.domain || '').localeCompare(b.domain || '')
      if (sortField === 'risk')         cmp = (RISK_ORDER[a.risk_level] ?? 0) - (RISK_ORDER[b.risk_level] ?? 0)
      if (sortField === 'jurisdiction') cmp = (a.jurisdiction || 'Unknown').localeCompare(b.jurisdiction || 'Unknown')
      if (sortField === 'expiry')       cmp = (a.expires_unix || 0) - (b.expires_unix || 0)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [cookies, browser, search, sortField, sortDir])

  const computedStats = useMemo(() => ({
    total:      stats.total      ?? cookies.length,
    trackers:   stats.high_risk  ?? cookies.filter(c => c.known_tracker).length,
    thirdParty: stats.third_party ?? cookies.filter(c => c.is_third_party).length,
    euSafe:     stats.eu_only    ?? cookies.filter(c => c.jurisdiction?.startsWith('EU')).length,
  }), [cookies, stats])

  const retryFDA = () => { setFdaGranted(null); loadCookies() }

  // Hard gate only if no cookies at all
  if (fdaGranted === false && (liveCookies === null || liveCookies.length === 0)) {
    return (
      <div className="p-6 space-y-5">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-text-primary">Browser Cookies</h1>
          <p className="text-sm text-text-secondary mt-1">Tracking cookies detected across your browsers</p>
        </motion.div>
        <FDAGate onGranted={retryFDA} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <h1 className="text-2xl font-bold text-text-primary">Browser Cookies</h1>
        <p className="text-sm text-text-secondary mt-1">Tracking cookies detected across your browsers</p>
      </motion.div>

      {/* Safari FDA banner — shown when we have cookies but FDA wasn't granted */}
      {fdaGranted === false && cookies.length > 0 && (
        <FDABanner onGranted={retryFDA} />
      )}

      {/* Stat cards */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04, duration: 0.2 }}
        className="grid grid-cols-4 gap-4"
      >
        <StatCard icon={Cookie}       label="Total Cookies" value={computedStats.total}      color="var(--accent-blue)" />
        <StatCard icon={AlertTriangle} label="Trackers"      value={computedStats.trackers}   color="var(--risk-high)" />
        <StatCard icon={Globe}        label="Third-Party"   value={computedStats.thirdParty} color="var(--risk-medium)" />
        <StatCard icon={ShieldCheck}  label="EU-Safe"       value={computedStats.euSafe}     color="var(--risk-low)" />
      </motion.div>

      {/* Browser tabs + search */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.2 }}
        className="flex items-center gap-4 flex-wrap"
      >
        <div className="flex items-center gap-1 p-1 rounded-lg flex-wrap"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
          {BROWSERS.filter(b => b === 'all' || cookies.some(c => c.browser?.toLowerCase() === b)).map(b => (
            <button key={b} onClick={() => setBrowser(b)}
              className="px-3 py-1 rounded text-xs font-medium capitalize transition-colors"
              style={{
                background: browser === b ? 'var(--bg-tertiary)' : 'transparent',
                color:      browser === b ? 'var(--text-primary)' : 'var(--text-secondary)',
                border:     browser === b ? '1px solid var(--border-default)' : '1px solid transparent',
              }}>
              {b}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search domain or name…"
            className="w-full pl-8 pr-3 py-2 rounded-input text-xs outline-none"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
          />
        </div>
        <button onClick={loadCookies} disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded text-xs font-medium transition-opacity disabled:opacity-50"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Scanning…' : 'Refresh'}
        </button>
        <span className="text-xs text-text-tertiary">
          {filtered.length} cookies
          {lastUpdated && <span className="ml-1.5 opacity-60">· {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
        </span>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.2 }}
        className="rounded-card border overflow-hidden"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}
      >
        {loading && (
          <div className="px-4 py-3 text-xs text-text-tertiary border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            Loading live cookie data…
          </div>
        )}
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-tertiary)' }}>
              {([
                ['domain',       'Domain'],
                [null,           'Name'],
                [null,           'Browser'],
                [null,           'Category'],
                ['risk',         'Risk'],
                ['jurisdiction', 'Jurisdiction'],
                ['expiry',       'Expiry'],
                [null,           ''],
              ] as [SortField | null, string][]).map(([field, label]) => (
                <th key={label}
                  onClick={() => field && handleSort(field)}
                  className={cn(
                    'px-4 py-2.5 text-left font-semibold text-text-secondary select-none',
                    field && 'cursor-pointer hover:text-text-primary transition-colors'
                  )}>
                  {field ? (
                    <span className="flex items-center gap-1">
                      {label}
                      {sortField === field
                        ? (sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)
                        : <span className="opacity-30"><ChevronUp size={10} /></span>}
                    </span>
                  ) : label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-text-tertiary">
                  {cookies.length === 0 ? 'Run a scan to see cookies' : 'No cookies match your filters'}
                </td>
              </tr>
            ) : filtered.slice(0, 300).map((cookie, i) => (
              <CookieRow key={`${cookie.domain}-${cookie.name}-${i}`} cookie={cookie} />
            ))}
          </tbody>
        </table>
        {filtered.length > 300 && (
          <div className="px-4 py-2 text-xs text-text-tertiary border-t" style={{ borderColor: 'var(--border-subtle)' }}>
            Showing 300 of {filtered.length} cookies
          </div>
        )}
      </motion.div>
    </div>
  )
}
