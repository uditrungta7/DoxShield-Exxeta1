import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, AlertTriangle, ShieldAlert, Info, Globe } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { getRiskColor } from '../../lib/utils'

interface ToastItem {
  id: string
  app_name: string
  title: string
  risk_level: string
  timestamp: string
  destination_country?: string
}

const CN_RU_COUNTRIES = new Set(['China', 'Russia', 'CN', 'RU'])

function isCnRu(toast: ToastItem) {
  return CN_RU_COUNTRIES.has(toast.destination_country || '') ||
    /\b(china|russia|chinese|russian)\b/i.test(toast.title)
}

function AlertToast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const cnRu = isCnRu(toast)
  // CN/RU SEVERE alerts linger 60s; others auto-dismiss in 8s
  const timeout = cnRu ? 60_000 : 8_000

  useEffect(() => {
    const t = setTimeout(onDismiss, timeout)
    return () => clearTimeout(t)
  }, [onDismiss, timeout])

  const Icon = cnRu
    ? Globe
    : toast.risk_level === 'SEVERE' ? ShieldAlert
    : toast.risk_level === 'HIGH' ? AlertTriangle
    : Info

  const borderColor = cnRu ? '#dc2626' : getRiskColor(toast.risk_level)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="flex items-start gap-3 p-3 rounded-card border shadow-xl w-80"
      style={{
        background: cnRu ? 'rgba(30, 5, 5, 0.97)' : 'var(--bg-elevated)',
        borderColor: 'var(--border-default)',
        borderLeftWidth: 3,
        borderLeftColor: borderColor,
      }}
    >
      <Icon size={16} className="flex-shrink-0 mt-0.5" style={{ color: borderColor }} />
      <div className="flex-1 min-w-0">
        {cnRu && (
          <div className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: '#dc2626' }}>
            ⚠ Authoritarian Jurisdiction
          </div>
        )}
        <div className="text-sm font-semibold text-text-primary truncate">{toast.app_name}</div>
        <div className="text-xs text-text-secondary mt-0.5 line-clamp-2">{toast.title}</div>
      </div>
      <button onClick={onDismiss} className="flex-shrink-0 text-text-tertiary hover:text-text-primary transition-colors">
        <X size={14} />
      </button>
    </motion.div>
  )
}

export function AlertToastContainer() {
  const { alerts, unreadAlertCount } = useAppStore()
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set())
  const [shown, setShown] = React.useState<Set<string>>(new Set())

  // CN/RU SEVERE alerts always surface (never suppressed by the shown-set gate)
  const cnRuAlerts = alerts.filter(a => isCnRu(a) && !dismissed.has(a.id)).slice(0, 2)
  const recentOthers = alerts
    .filter(a => !isCnRu(a) && !dismissed.has(a.id) && shown.has(a.id))
    .slice(0, 2)

  const toasts = [
    ...cnRuAlerts,
    ...recentOthers,
  ].slice(0, 4)

  // Track newly added non-CN/RU alerts
  useEffect(() => {
    if (alerts.length > 0) {
      const newIds = alerts.slice(0, 3).map(a => a.id)
      setShown(prev => {
        const next = new Set(prev)
        newIds.forEach(id => next.add(id))
        return next
      })
    }
  }, [unreadAlertCount])

  const dismiss = (id: string) => setDismissed(prev => new Set([...prev, id]))

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto">
            <AlertToast toast={toast} onDismiss={() => dismiss(toast.id)} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  )
}
