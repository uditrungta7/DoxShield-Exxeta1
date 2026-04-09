import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../../store/useAppStore'
import { getCountryFlag, getRiskColor } from '../../lib/utils'

export function NetworkFeed() {
  const { connections } = useAppStore()
  const recent = connections.slice(0, 20)

  return (
    <div className="overflow-y-auto" style={{ maxHeight: 300 }}>
      {recent.length === 0 ? (
        <div className="flex items-center justify-center h-16 text-text-tertiary text-base">
          No active connections
        </div>
      ) : (
        <AnimatePresence>
          {recent.map((conn, i) => {
            const age = Date.now() - new Date(conn.timestamp).getTime()
            return (
              <motion.div
                key={`${conn.remote_ip}-${conn.remote_port}-${i}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: age > 55000 ? 0.3 : 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-bg-tertiary transition-colors text-xs"
              >
                <span className="font-medium text-text-primary truncate w-24 flex-shrink-0">
                  {conn.app_name || conn.process_name}
                </span>
                <span className="text-text-tertiary flex-shrink-0">→</span>
                <span className="text-text-secondary truncate flex-1">
                  {conn.remote_domain || conn.remote_ip}
                </span>
                <span className="flex-shrink-0">{getCountryFlag(conn.country_code)}</span>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: getRiskColor(conn.risk_level) }} />
              </motion.div>
            )
          })}
        </AnimatePresence>
      )}
    </div>
  )
}
