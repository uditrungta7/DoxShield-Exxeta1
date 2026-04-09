import React, { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Search, SlidersHorizontal } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { AppRiskCard } from '../components/dashboard/AppRiskCard'
import { getRiskColor } from '../lib/utils'

const JURISDICTIONS = ['All', 'EU', 'US', 'UK', 'CN', 'RU', 'Other']
const RISK_LEVELS    = ['All', 'LOW', 'MEDIUM', 'HIGH', 'SEVERE']

type SortMode = 'risk_desc' | 'risk_asc' | 'name_asc' | 'name_desc'

export default function Applications() {
  const { apps } = useAppStore()
  const [search,       setSearch]       = useState('')
  const [jurisdiction, setJurisdiction] = useState('All')
  const [riskLevel,    setRiskLevel]    = useState('All')
  const [sort,         setSort]         = useState<SortMode>('risk_desc')

  const filtered = useMemo(() => {
    let list = [...apps]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(a => a.app_name.toLowerCase().includes(q))
    }
    if (jurisdiction !== 'All') {
      list = list.filter(a => {
        if (jurisdiction === 'EU')    return a.jurisdiction?.startsWith('EU') || a.jurisdiction === 'EU'
        if (jurisdiction === 'Other') return !['US','EU','UK','CN','RU'].includes(a.jurisdiction)
        return a.jurisdiction === jurisdiction
      })
    }
    if (riskLevel !== 'All') list = list.filter(a => a.risk_level === riskLevel)

    list.sort((a, b) => {
      if (sort === 'risk_desc') return b.risk_score - a.risk_score
      if (sort === 'risk_asc')  return a.risk_score - b.risk_score
      if (sort === 'name_asc')  return a.app_name.localeCompare(b.app_name)
      if (sort === 'name_desc') return b.app_name.localeCompare(a.app_name)
      return 0
    })
    return list
  }, [apps, search, jurisdiction, riskLevel, sort])

  const riskCounts = useMemo(() => ({
    SEVERE: apps.filter(a => a.risk_level === 'SEVERE').length,
    HIGH:   apps.filter(a => a.risk_level === 'HIGH').length,
    MEDIUM: apps.filter(a => a.risk_level === 'MEDIUM').length,
    LOW:    apps.filter(a => a.risk_level === 'LOW').length,
  }), [apps])

  return (
    <div className="p-6 space-y-5">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
        className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Applications</h1>
          <p className="text-sm text-text-secondary mt-1">{apps.length} apps scanned</p>
        </div>
        {/* Risk summary pills */}
        <div className="flex items-center gap-2">
          {(['SEVERE', 'HIGH', 'MEDIUM', 'LOW'] as const).map(level => (
            riskCounts[level] > 0 && (
              <button
                key={level}
                onClick={() => setRiskLevel(riskLevel === level ? 'All' : level)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-badge text-xs font-semibold transition-colors"
                style={{
                  color: getRiskColor(level),
                  background: getRiskColor(level) + (riskLevel === level ? '22' : '11'),
                  border: `1px solid ${getRiskColor(level)}${riskLevel === level ? '66' : '33'}`,
                }}
              >
                <span>{riskCounts[level]}</span> {level}
              </button>
            )
          ))}
        </div>
      </motion.div>

      {/* Filters row */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04, duration: 0.2 }}
        className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search apps…"
            className="pl-8 pr-3 py-2 rounded-input text-xs outline-none w-52"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
          />
        </div>

        {/* Jurisdiction filter */}
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
          {JURISDICTIONS.map(j => (
            <button key={j} onClick={() => setJurisdiction(j)}
              className="px-2.5 py-1 rounded text-xs font-medium transition-colors"
              style={{
                background: jurisdiction === j ? 'var(--bg-tertiary)' : 'transparent',
                color: jurisdiction === j ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: jurisdiction === j ? '1px solid var(--border-default)' : '1px solid transparent',
              }}>
              {j}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1.5 ml-auto">
          <SlidersHorizontal size={12} className="text-text-tertiary" />
          <select
            value={sort} onChange={e => setSort(e.target.value as SortMode)}
            className="px-2.5 py-1.5 rounded-input text-xs outline-none"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}>
            <option value="risk_desc">Risk ↓</option>
            <option value="risk_asc">Risk ↑</option>
            <option value="name_asc">Name A–Z</option>
            <option value="name_desc">Name Z–A</option>
          </select>
        </div>
      </motion.div>

      {/* App list */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.2 }}
        className="rounded-card border overflow-hidden"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-text-tertiary text-sm">
            {apps.length === 0 ? 'Run a scan to see your installed apps' : 'No apps match your filters'}
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {filtered.map((app, i) => (
              <AppRiskCard key={app.app_id} app={app} index={i} />
            ))}
          </div>
        )}
      </motion.div>
    </div>
  )
}
