import React, { useEffect } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { getRiskColor } from '../../lib/utils'

interface Props { score: number; size?: number; showLabel?: boolean }

export function RiskGauge({ score, size = 200, showLabel = true }: Props) {
  const clamped = Math.max(0, Math.min(100, score))
  const level = clamped <= 25 ? 'LOW' : clamped <= 50 ? 'MEDIUM' : clamped <= 75 ? 'HIGH' : 'SEVERE'
  const color = getRiskColor(level)

  const radius = (size - 20) / 2
  const sw = size / 20
  // 270-degree arc
  const circumference = radius * Math.PI * 1.5

  const animated = useMotionValue(0)
  const dashOffset = useTransform(animated, [0, 100], [circumference, 0])

  useEffect(() => {
    const c = animate(animated, clamped, { duration: 1, ease: 'easeOut' })
    return c.stop
  }, [clamped, animated])

  const cx = size / 2, cy = size / 2
  const toXY = (angleDeg: number) => {
    const r = ((angleDeg - 90) * Math.PI) / 180
    return { x: cx + radius * Math.cos(r), y: cy + radius * Math.sin(r) }
  }
  const s = toXY(135), e = toXY(405 - 0.01)
  const arc = `M ${s.x} ${s.y} A ${radius} ${radius} 0 1 1 ${e.x} ${e.y}`

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0">
        <path d={arc} fill="none" stroke="var(--bg-tertiary)" strokeWidth={sw} strokeLinecap="round" />
        <motion.path
          d={arc} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={circumference} style={{ strokeDashoffset: dashOffset }}
        />
      </svg>
      <div className="flex flex-col items-center z-10">
        <span style={{ fontSize: size * 0.22, color: 'var(--text-primary)', fontWeight: 700, lineHeight: 1 }}>
          {Math.round(clamped)}
        </span>
        {showLabel && (
          <span style={{ fontSize: size * 0.055, color, fontWeight: 600, letterSpacing: '0.08em', marginTop: 4 }}>
            {level}
          </span>
        )}
      </div>
    </div>
  )
}
