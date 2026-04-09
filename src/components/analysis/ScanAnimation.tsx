import React from 'react'
import { motion } from 'framer-motion'
import { Shield, Activity, Globe, Lock, Cpu, CheckCircle } from 'lucide-react'

const ICONS: Record<string, React.ElementType> = {
  apps: Shield, permissions: Lock, network: Activity,
  cookies: Globe, geolocation: Globe, ai: Cpu,
  risk: CheckCircle, complete: CheckCircle,
}

interface Props { currentStep?: string; currentDetail?: string; progress?: number }

export function ScanAnimation({ currentStep = 'apps', currentDetail = 'Starting...', progress = 0 }: Props) {
  const Icon = ICONS[currentStep] || Shield

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="relative w-48 h-48 flex items-center justify-center">
        {[1, 2, 3].map(ring => (
          <motion.div
            key={ring}
            className="absolute rounded-full border"
            style={{ width: ring * 56, height: ring * 56, borderColor: 'rgba(59,130,246,0.25)' }}
            animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.15, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, delay: ring * 0.3, ease: 'easeInOut' }}
          />
        ))}
        <motion.div
          className="w-16 h-16 bg-accent-blue rounded-2xl flex items-center justify-center z-10"
          animate={{ rotate: [0, 4, -4, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Icon size={28} className="text-white" />
        </motion.div>
      </div>

      <motion.p
        key={currentDetail}
        initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
        className="text-base text-text-secondary text-center max-w-xs"
      >
        {currentDetail}
      </motion.p>

      <div className="w-96 h-0.5 bg-bg-tertiary rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-accent-blue rounded-full"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}
