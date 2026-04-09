import { useEffect, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'

export const SIDECAR_BASE = 'http://127.0.0.1:8765'

export async function fetchJSON(path: string, opts?: RequestInit) {
  const r = await fetch(`${SIDECAR_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export function useSidecar() {
  const { setSidecarStatus } = useAppStore()

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const r = await fetch(`${SIDECAR_BASE}/health`, { signal: AbortSignal.timeout(3000) })
        if (!cancelled) setSidecarStatus(r.ok ? 'ready' : 'error')
      } catch {
        if (!cancelled) setSidecarStatus('error')
      }
    }
    check()
    const iv = setInterval(check, 10000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [setSidecarStatus])

  const fetchJSON = useCallback(async (path: string, opts?: RequestInit) => {
    const r = await fetch(`${SIDECAR_BASE}${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...opts?.headers },
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  }, [])

  return {
    base: SIDECAR_BASE,
    fetchJSON,
    getRiskProfile: useCallback(() => fetchJSON('/api/risk/profile'), [fetchJSON]),
    getApps: useCallback(() => fetchJSON('/api/apps'), [fetchJSON]),
    getAppDetail: useCallback((id: string) => fetchJSON(`/api/apps/${id}`), [fetchJSON]),
    getLiveConnections: useCallback(() => fetchJSON('/api/network/live'), [fetchJSON]),
    getCookies: useCallback((browser = 'all') => fetchJSON(`/api/cookies?browser=${browser}`), [fetchJSON]),
    getAIStatus: useCallback(() => fetchJSON('/api/ai/status'), [fetchJSON]),
    sendTestAlert: useCallback((d: object) => fetchJSON('/api/alerts/send', { method: 'POST', body: JSON.stringify(d) }), [fetchJSON]),
  }
}
