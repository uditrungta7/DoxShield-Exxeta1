import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getRiskColor(riskLevel: string): string {
  switch (riskLevel?.toUpperCase()) {
    case 'LOW':    return 'var(--risk-low)'
    case 'MEDIUM': return 'var(--risk-medium)'
    case 'HIGH':   return 'var(--risk-high)'
    case 'SEVERE': return 'var(--risk-severe)'
    default:       return 'var(--risk-unverified)'
  }
}

export function getRiskBgClass(riskLevel: string): string {
  switch (riskLevel?.toUpperCase()) {
    case 'LOW':    return 'bg-risk-low/10 text-risk-low border-risk-low/20'
    case 'MEDIUM': return 'bg-risk-medium/10 text-risk-medium border-risk-medium/20'
    case 'HIGH':   return 'bg-risk-high/10 text-risk-high border-risk-high/20'
    case 'SEVERE': return 'bg-risk-severe/10 text-risk-severe border-risk-severe/20'
    default:       return 'bg-risk-unverified/10 text-risk-unverified border-risk-unverified/20'
  }
}

export function getJurisdictionFlag(jurisdiction: string): string {
  const flags: Record<string, string> = {
    US: '🇺🇸', EU: '🇪🇺', CN: '🇨🇳', RU: '🇷🇺',
    UK: '🇬🇧', FVEY: '👁', LOCAL: '🏠', Unknown: '🌐', Other: '🌐',
  }
  return flags[jurisdiction] || '🌐'
}

export function getCountryFlag(cc: string): string {
  if (!cc || cc.length !== 2) return '🌐'
  const offset = 0x1F1E6 - 65
  return cc.toUpperCase().split('').map(c => String.fromCodePoint(c.charCodeAt(0) + offset)).join('')
}

export function formatRelativeTime(isoDate: string): string {
  try {
    const diff = Date.now() - new Date(isoDate).getTime()
    const s = Math.floor(diff / 1000)
    if (s < 60)   return 'just now'
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    if (s < 604800) return `${Math.floor(s / 86400)}d ago`
    return new Date(isoDate).toLocaleDateString()
  } catch { return '' }
}

export function truncate(str: string, len: number): string {
  if (!str || str.length <= len) return str || ''
  return str.slice(0, len) + '...'
}
