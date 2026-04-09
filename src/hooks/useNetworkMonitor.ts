import { useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'

const CN_RU = new Set(['CN', 'RU'])

// Deduplicate CN/RU alerts: key = countryCode + processName, value = last alert timestamp
const _cnRuAlertedKeys = new Set<string>()
// Re-alert after 5 minutes for the same process+country pair
const CN_RU_COOLDOWN_MS = 5 * 60 * 1000
const _cnRuLastAlert: Record<string, number> = {}

function maybeFiraCnRuAlert(conn: any) {
  const cc: string = conn.country_code || conn.jurisdiction || ''
  if (!CN_RU.has(cc)) return

  const key = `${cc}:${conn.process_name || conn.app_name || 'unknown'}`
  const now = Date.now()
  const last = _cnRuLastAlert[key] ?? 0
  if (now - last < CN_RU_COOLDOWN_MS) return

  _cnRuLastAlert[key] = now

  const countryName = cc === 'CN' ? 'China' : 'Russia'
  const processLabel = conn.app_name || conn.process_name || 'Unknown process'
  const domain = conn.remote_domain || conn.remote_ip || ''
  const lawNote = cc === 'CN'
    ? 'subject to Chinese national security data laws'
    : 'subject to Russian SORM surveillance laws'

  useAppStore.getState().addAlert({
    id: `cn-ru-${key}-${now}`,
    app_id: conn.bundle_id || undefined,
    app_name: processLabel,
    title: `Data transmitted to ${countryName}${domain ? ` (${domain})` : ''} — ${lawNote}`,
    message: `Live connection detected: ${processLabel} → ${domain || conn.remote_ip} in ${countryName}`,
    risk_level: 'SEVERE',
    timestamp: new Date().toISOString(),
    read: false,
    destination_country: countryName,
  })
}

export function useNetworkMonitor(enabled = true) {
  const { addConnection, setConnections, sidecarStatus } = useAppStore()
  const esRef = useRef<EventSource | null>(null)

  const start = useCallback(() => {
    if (esRef.current || sidecarStatus !== 'ready') return
    const es = new EventSource('http://127.0.0.1:8765/api/network/stream')
    esRef.current = es
    es.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data)
        if (d.type === 'new_high_risk_connection' && d.data) {
          addConnection(d.data)
          maybeFiraCnRuAlert(d.data)
        }
      } catch { /* ignore */ }
    }
    es.onerror = () => {
      es.close(); esRef.current = null
      setTimeout(start, 5000)
    }
  }, [addConnection, sidecarStatus])

  const stop = useCallback(() => {
    esRef.current?.close(); esRef.current = null
  }, [])

  useEffect(() => {
    if (!enabled || sidecarStatus !== 'ready') return
    let cancelled = false
    const poll = async () => {
      try {
        const r = await fetch('http://127.0.0.1:8765/api/network/live')
        if (!cancelled && r.ok) {
          const conns = await r.json() as any[]
          setConnections(conns)
          // Check polled connections for CN/RU too
          conns.forEach(c => maybeFiraCnRuAlert(c))
        }
      } catch { /* sidecar not ready */ }
    }
    poll()
    const iv = setInterval(poll, 10000)
    start()
    return () => { cancelled = true; clearInterval(iv); stop() }
  }, [enabled, sidecarStatus, setConnections, start, stop])

  return { start, stop }
}
