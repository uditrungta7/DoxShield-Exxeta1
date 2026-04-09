import { useEffect, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'

export function useRiskProfile() {
  const { setOverallRisk, setApps, setCookies, setLastScanAt, sidecarStatus, overallRisk, apps } = useAppStore()

  const load = useCallback(async () => {
    if (sidecarStatus !== 'ready') return
    try {
      const r = await fetch('http://127.0.0.1:8765/api/risk/profile')
      if (r.ok) {
        const d = await r.json()
        if (d.error) return
        if (d.overall) setOverallRisk(d.overall)
        if (d.apps) setApps(d.apps)
        if (d.cookies) setCookies(d.cookies)
        if (d.scanned_at) setLastScanAt(d.scanned_at)
      }
    } catch { /* sidecar not ready */ }
  }, [sidecarStatus, setOverallRisk, setApps, setCookies, setLastScanAt])

  useEffect(() => {
    if (sidecarStatus === 'ready') load()
  }, [sidecarStatus, load])

  return { loadProfile: load, overallRisk, apps }
}
