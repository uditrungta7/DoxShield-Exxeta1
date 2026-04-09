import React, { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps'
import { Search, Filter, ChevronUp, ChevronDown } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { getRiskColor, getRiskBgClass, getCountryFlag, cn, formatRelativeTime } from '../lib/utils'
import GEO_DATA from '../assets/world-110m.json'

// Country code → approximate coordinates
const COUNTRY_COORDS: Record<string, [number, number]> = {
  US: [-95, 38], GB: [-2, 54], DE: [10, 51], FR: [2, 46], NL: [5.3, 52.1],
  CN: [104, 35], RU: [60, 60], JP: [138, 36], SG: [104, 1], IE: [-8, 53],
  CA: [-96, 60], AU: [134, -26], IN: [78, 20], BR: [-50, -10], ZA: [25, -29],
  SE: [18, 60], NO: [10, 62], FI: [26, 62], DK: [10, 56], CH: [8, 47],
  AT: [14, 47], BE: [4, 51], LU: [6, 50], PL: [20, 52], CZ: [16, 50],
  HU: [19, 47], RO: [25, 46], BG: [25, 43], HR: [16, 45], SK: [19, 49],
  SI: [15, 46], EE: [25, 59], LV: [25, 57], LT: [24, 56], UA: [31, 49],
}

// Country name (from natural earth topology) → ISO-A2 code
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  'United States of America': 'US', 'United Kingdom': 'GB', 'Germany': 'DE',
  'France': 'FR', 'Netherlands': 'NL', 'China': 'CN', 'Russia': 'RU',
  'Japan': 'JP', 'Singapore': 'SG', 'Ireland': 'IE', 'Canada': 'CA',
  'Australia': 'AU', 'India': 'IN', 'Brazil': 'BR', 'South Africa': 'ZA',
  'Sweden': 'SE', 'Norway': 'NO', 'Finland': 'FI', 'Denmark': 'DK',
  'Switzerland': 'CH', 'Austria': 'AT', 'Belgium': 'BE', 'Luxembourg': 'LU',
  'Poland': 'PL', 'Czech Republic': 'CZ', 'Czechia': 'CZ', 'Hungary': 'HU',
  'Romania': 'RO', 'Bulgaria': 'BG', 'Croatia': 'HR', 'Slovakia': 'SK',
  'Slovenia': 'SI', 'Estonia': 'EE', 'Latvia': 'LV', 'Lithuania': 'LT',
  'Ukraine': 'UA', 'South Korea': 'KR', 'Taiwan': 'TW', 'Hong Kong': 'HK',
  'New Zealand': 'NZ', 'Mexico': 'MX', 'Argentina': 'AR', 'Chile': 'CL',
  'Colombia': 'CO', 'Spain': 'ES', 'Italy': 'IT', 'Portugal': 'PT',
  'Israel': 'IL', 'Turkey': 'TR', 'United Arab Emirates': 'AE',
  'Saudi Arabia': 'SA', 'Egypt': 'EG', 'Nigeria': 'NG', 'Kenya': 'KE',
}

// Risk level → pulse speed (seconds)
const PULSE_DUR: Record<string, string> = {
  SEVERE: '1.1s', HIGH: '1.5s', MEDIUM: '2.2s', LOW: '3s',
}

// ─── Animated marker ──────────────────────────────────────────────────────────
function MapMarker({ conn, coords }: { conn: any; coords: [number, number] }) {
  const color = getRiskColor(conn.risk_level)
  const dur = PULSE_DUR[conn.risk_level] ?? '2.5s'
  const durHalf = parseFloat(dur) / 2 + 's'

  return (
    <Marker coordinates={coords}>
      {/* Outer slow ring */}
      <circle r={5} fill="none" stroke={color} strokeWidth={1.2} opacity={0}>
        <animate attributeName="r"       values="5;20;5"     dur={dur}     repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.7;0;0.7"  dur={dur}     repeatCount="indefinite" />
      </circle>
      {/* Mid ring with delay */}
      <circle r={5} fill="none" stroke={color} strokeWidth={0.9} opacity={0}>
        <animate attributeName="r"       values="5;13;5"    dur={dur}     begin={durHalf} repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0;0.5"  dur={dur}     begin={durHalf} repeatCount="indefinite" />
      </circle>
      {/* Core glow */}
      <circle r={5.5} fill={color} fillOpacity={0.25} filter="url(#dotGlow)" />
      {/* Core dot */}
      <circle
        r={4.5}
        fill={color}
        fillOpacity={0.95}
        stroke="var(--bg-primary)"
        strokeWidth={1.5}
        filter="url(#dotGlow)"
      />
    </Marker>
  )
}

type SortField = 'time' | 'app' | 'host' | 'country' | 'risk'
type SortDir = 'asc' | 'desc'

export default function NetworkMonitor() {
  const { connections } = useAppStore()
  const [search, setSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('time')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const filtered = useMemo(() => {
    let list = [...connections]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        (c.app_name || c.process_name || '').toLowerCase().includes(q) ||
        (c.remote_domain || c.remote_ip || '').toLowerCase().includes(q)
      )
    }
    if (riskFilter) list = list.filter(c => c.risk_level === riskFilter)
    list.sort((a, b) => {
      let cmp = 0
      if (sortField === 'time')    cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      if (sortField === 'app')     cmp = (a.app_name || a.process_name || '').localeCompare(b.app_name || b.process_name || '')
      if (sortField === 'host')    cmp = (a.remote_domain || a.remote_ip || '').localeCompare(b.remote_domain || b.remote_ip || '')
      if (sortField === 'country') cmp = (a.country_code || '').localeCompare(b.country_code || '')
      if (sortField === 'risk')    cmp = (a.risk_score || 0) - (b.risk_score || 0)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [connections, search, riskFilter, sortField, sortDir])

  // One marker per country (highest risk wins)
  const markers = useMemo(() => {
    const RISK_ORDER: Record<string, number> = { SEVERE: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
    const best: Record<string, any> = {}
    connections.forEach(c => {
      if (!c.country_code || !COUNTRY_COORDS[c.country_code]) return
      const existing = best[c.country_code]
      if (!existing || (RISK_ORDER[c.risk_level] || 0) > (RISK_ORDER[existing.risk_level] || 0)) {
        best[c.country_code] = c
      }
    })
    return Object.values(best)
  }, [connections])

  // Country heatmap: code → highest risk
  const countryRiskMap = useMemo(() => {
    const RISK_ORDER: Record<string, number> = { SEVERE: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
    const map: Record<string, string> = {}
    connections.forEach(c => {
      if (!c.country_code) return
      const existing = map[c.country_code]
      if (!existing || (RISK_ORDER[c.risk_level] || 0) > (RISK_ORDER[existing] || 0)) {
        map[c.country_code] = c.risk_level
      }
    })
    return map
  }, [connections])

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="opacity-30"><ChevronUp size={10} /></span>
    return sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />
  }

  const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'SEVERE']

  return (
    <div className="p-6 space-y-5">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <h1 className="text-2xl font-bold text-text-primary">Network Monitor</h1>
        <p className="text-sm text-text-secondary mt-1">Live outbound connections from your Mac</p>
      </motion.div>

      {/* World map */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.2 }}
        className="rounded-card border overflow-hidden"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-text-primary">Global Connection Map</h2>
            {/* Live pulse indicator */}
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'var(--risk-low)' }} />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: 'var(--risk-low)' }} />
            </span>
          </div>
          <span className="text-xs text-text-tertiary">{connections.length} active connections · {markers.length} countries</span>
        </div>

        {/* Map container with scanline overlay */}
        <div style={{ position: 'relative', height: 300, background: 'var(--bg-primary)' }}>
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{ scale: 120, center: [10, 25] }}
            style={{ width: '100%', height: '100%' }}
          >
            <defs>
              {/* Glow filter for dots */}
              <filter id="dotGlow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {/* Scanline sweep gradient */}
              <linearGradient id="scanGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor="#3b82f6" stopOpacity="0" />
                <stop offset="40%"  stopColor="#3b82f6" stopOpacity="0.07" />
                <stop offset="60%"  stopColor="#3b82f6" stopOpacity="0.07" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
              </linearGradient>
            </defs>

            <Geographies geography={GEO_DATA}>
              {({ geographies }) =>
                geographies.map(geo => {
                  const code = COUNTRY_NAME_TO_CODE[geo.properties.name]
                  const risk = code ? countryRiskMap[code] : undefined
                  const baseFill = risk
                    ? getRiskColor(risk) + '28'
                    : 'var(--bg-tertiary)'
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={baseFill}
                      stroke={risk ? getRiskColor(risk) + '55' : 'var(--border-subtle)'}
                      strokeWidth={risk ? 0.6 : 0.4}
                      style={{
                        default: { outline: 'none' },
                        hover:   { outline: 'none', fill: risk ? getRiskColor(risk) + '40' : 'var(--bg-elevated)' },
                        pressed: { outline: 'none' },
                      }}
                    />
                  )
                })
              }
            </Geographies>

            {/* Scanline sweep */}
            <rect y="0" width="160" height="500" fill="url(#scanGrad)" style={{ pointerEvents: 'none' }}>
              <animate attributeName="x" from="-160" to="900" dur="7s" repeatCount="indefinite" />
            </rect>

            {markers.map(conn => {
              const coords = COUNTRY_COORDS[conn.country_code!]
              if (!coords) return null
              return <MapMarker key={conn.country_code} conn={conn} coords={coords} />
            })}
          </ComposableMap>

          {/* Risk legend */}
          <div
            className="absolute bottom-2 right-3 flex items-center gap-3 px-2.5 py-1.5 rounded"
            style={{ background: 'var(--bg-secondary)cc', backdropFilter: 'blur(4px)', border: '1px solid var(--border-subtle)' }}
          >
            {RISK_LEVELS.map(level => (
              <div key={level} className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: getRiskColor(level) }} />
                <span className="text-[10px] text-text-tertiary">{level}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.2 }}
        className="flex items-center gap-3"
      >
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search app or host…"
            className="w-full pl-8 pr-3 py-2 rounded-input text-xs outline-none"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter size={12} className="text-text-tertiary" />
          {RISK_LEVELS.map(level => (
            <button
              key={level}
              onClick={() => setRiskFilter(riskFilter === level ? null : level)}
              className="px-2.5 py-1 rounded-badge text-xs font-medium transition-colors"
              style={{
                background: riskFilter === level ? getRiskColor(level) + '22' : 'var(--bg-secondary)',
                color: riskFilter === level ? getRiskColor(level) : 'var(--text-secondary)',
                border: `1px solid ${riskFilter === level ? getRiskColor(level) + '66' : 'var(--border-subtle)'}`,
              }}
            >
              {level}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Connections table */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.2 }}
        className="rounded-card border overflow-hidden"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}
      >
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-tertiary)' }}>
              {([
                ['app',     'Application'],
                ['host',    'Remote Host'],
                ['country', 'Country'],
                ['risk',    'Risk'],
                ['time',    'Time'],
              ] as [SortField, string][]).map(([field, label]) => (
                <th key={field}
                  className="px-4 py-2.5 text-left font-semibold text-text-secondary cursor-pointer hover:text-text-primary transition-colors select-none"
                  onClick={() => handleSort(field)}>
                  <span className="flex items-center gap-1">{label} <SortIcon field={field} /></span>
                </th>
              ))}
              <th className="px-4 py-2.5 text-left font-semibold text-text-secondary">Port</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-text-tertiary">No connections found</td></tr>
            ) : filtered.slice(0, 200).map((conn, i) => (
              <motion.tr
                key={`${conn.remote_ip}-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.01 }}
                className="hover:bg-bg-tertiary transition-colors"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <td className="px-4 py-2.5 font-medium text-text-primary truncate max-w-[140px]">
                  <span className="flex items-center gap-1.5">
                    {(conn as any).is_vpn && (
                      <span className="px-1 py-0.5 rounded text-[9px] font-bold tracking-wide flex-shrink-0"
                            style={{ background: 'var(--accent-blue)22', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue)44' }}>
                        VPN
                      </span>
                    )}
                    {conn.app_name || conn.process_name}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-text-secondary truncate max-w-[180px]">
                  {conn.remote_domain || conn.remote_ip}
                </td>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-1.5">
                    {getCountryFlag(conn.country_code)} <span className="text-text-tertiary">{conn.country_code}</span>
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={cn('px-1.5 py-0.5 rounded border text-xs', getRiskBgClass(conn.risk_level))}>
                    {conn.risk_level}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-text-tertiary">{formatRelativeTime(conn.timestamp)}</td>
                <td className="px-4 py-2.5 text-text-tertiary">
                  {(conn as any).is_vpn && !(conn as any).remote_port ? '—' : conn.remote_port}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 200 && (
          <div className="px-4 py-2 text-xs text-text-tertiary border-t" style={{ borderColor: 'var(--border-subtle)' }}>
            Showing 200 of {filtered.length} connections
          </div>
        )}
      </motion.div>
    </div>
  )
}
