import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'

export function useOllamaStatus() {
  const { setOllamaStatus, ollamaStatus } = useAppStore()

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const r = await fetch('http://127.0.0.1:8765/api/ai/status', {
          signal: AbortSignal.timeout(5000),
        })
        if (!cancelled && r.ok) {
          const d = await r.json()
          setOllamaStatus(d.status === 'ready' ? 'ready' : d.status === 'offline' ? 'offline' : 'loading')
        }
      } catch {
        if (!cancelled) setOllamaStatus('offline')
      }
    }
    check()
    const iv = setInterval(check, 30000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [setOllamaStatus])

  return ollamaStatus
}
