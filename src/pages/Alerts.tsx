import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Check, X, Filter } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { getRiskColor, formatRelativeTime, cn } from '../lib/utils'

const RISK_FILTERS = ['ALL', 'SEVERE', 'HIGH', 'MEDIUM', 'LOW'] as const
type RiskFilter = typeof RISK_FILTERS[number]

export default function Alerts() {
  const { alerts, setCurrentPage, setSelectedAppId } = useAppStore()
  const [filter, setFilter] = useState<RiskFilter>('ALL')
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [read, setRead] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    let list = alerts.filter(a => !dismissed.has(a.id))
    if (filter !== 'ALL') list = list.filter(a => a.risk_level === filter)
    return list
  }, [alerts, dismissed, filter])

  const dismiss = (id: string) => setDismissed(prev => new Set([...prev, id]))
  const markRead = (id: string) => setRead(prev => new Set([...prev, id]))
  const dismissAll = () => setDismissed(new Set(alerts.map(a => a.id)))

  const unread = filtered.filter(a => !read.has(a.id)).length

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
        className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Alerts</h1>
          <p className="text-sm text-text-secondary mt-1">
            {unread > 0 ? `${unread} unread alert${unread !== 1 ? 's' : ''}` : 'All caught up'}
          </p>
        </div>
        {filtered.length > 0 && (
          <button
            onClick={dismissAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-button text-xs text-text-secondary hover:text-text-primary transition-colors"
            style={{ border: '1px solid var(--border-default)' }}
          >
            <Check size={12} /> Dismiss all
          </button>
        )}
      </motion.div>

      {/* Risk filters */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04, duration: 0.2 }}
        className="flex items-center gap-2">
        <Filter size={12} className="text-text-tertiary" />
        {RISK_FILTERS.map(level => (
          <button
            key={level}
            onClick={() => setFilter(level)}
            className="px-3 py-1 rounded-badge text-xs font-medium transition-colors"
            style={{
              background: filter === level
                ? (level === 'ALL' ? 'var(--bg-tertiary)' : getRiskColor(level) + '22')
                : 'var(--bg-secondary)',
              color: filter === level
                ? (level === 'ALL' ? 'var(--text-primary)' : getRiskColor(level))
                : 'var(--text-secondary)',
              border: `1px solid ${filter === level
                ? (level === 'ALL' ? 'var(--border-default)' : getRiskColor(level) + '66')
                : 'var(--border-subtle)'}`,
            }}
          >
            {level}
          </button>
        ))}
      </motion.div>

      {/* Alert list */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.2 }}
        className="rounded-card border overflow-hidden"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Bell size={32} className="text-text-tertiary" />
            <p className="text-text-tertiary text-sm">
              {alerts.length === 0 ? 'No alerts yet — run a scan to get started' : 'No alerts match your filter'}
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {filtered.map((alert, i) => {
              const isUnread = !read.has(alert.id)
              return (
                <motion.div
                  key={alert.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.2 }}
                  onClick={() => markRead(alert.id)}
                  className="flex items-center gap-4 px-4 py-3.5 cursor-pointer transition-colors hover:bg-bg-tertiary group"
                  style={{
                    borderBottom: i < filtered.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    borderLeft: `3px solid ${getRiskColor(alert.risk_level)}`,
                    background: isUnread ? 'var(--bg-secondary)' : 'transparent',
                  }}
                >
                  {/* Unread dot */}
                  <div className="w-2 h-2 rounded-full flex-shrink-0 transition-colors"
                    style={{ background: isUnread ? getRiskColor(alert.risk_level) : 'transparent' }} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary truncate">{alert.app_name}</span>
                      <span className="px-1.5 py-0.5 rounded text-xs font-bold flex-shrink-0"
                        style={{ color: getRiskColor(alert.risk_level), background: getRiskColor(alert.risk_level) + '18' }}>
                        {alert.risk_level}
                      </span>
                    </div>
                    <div className="text-xs text-text-secondary mt-0.5 truncate">{alert.title}</div>
                    {(alert.body || alert.message) && (
                      <div className="text-xs text-text-tertiary mt-1 line-clamp-2">{alert.body || alert.message}</div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-text-tertiary">{formatRelativeTime(alert.timestamp)}</span>
                    <button
                      onClick={e => { e.stopPropagation(); setSelectedAppId(alert.app_id); setCurrentPage('app-detail') }}
                      className="text-xs text-accent-blue opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                    >
                      Details
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); dismiss(alert.id) }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-text-tertiary hover:text-text-primary"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
      </motion.div>
    </div>
  )
}
