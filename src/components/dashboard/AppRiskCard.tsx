import React from 'react'
import { motion } from 'framer-motion'
import { ChevronRight, AppWindow } from 'lucide-react'
import { AppRisk } from '../../store/useAppStore'
import { cn, getRiskBgClass, getJurisdictionFlag } from '../../lib/utils'
import { useAppStore } from '../../store/useAppStore'

interface Props { app: AppRisk; index?: number }

export function AppRiskCard({ app, index = 0 }: Props) {
  const { setCurrentPage, setSelectedAppId } = useAppStore()

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.2 }}
      onClick={() => { setSelectedAppId(app.app_id); setCurrentPage('app-detail') }}
      className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-bg-tertiary group"
    >
      <div className="w-8 h-8 bg-bg-elevated rounded-lg flex items-center justify-center flex-shrink-0">
        <AppWindow size={16} className="text-text-secondary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-md font-medium text-text-primary truncate">{app.app_name}</span>
          <span className="text-xs flex-shrink-0">{getJurisdictionFlag(app.jurisdiction)}</span>
        </div>
        <p className="text-xs text-text-secondary truncate mt-0.5">
          {app.risk_factors[0] || `${app.jurisdiction} jurisdiction`}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded border', getRiskBgClass(app.risk_level))}>
          {app.risk_level}
        </span>
        <ChevronRight size={14} className="text-text-tertiary group-hover:text-text-secondary transition-colors" />
      </div>
    </motion.div>
  )
}
