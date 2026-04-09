import React, { useEffect, useState, lazy, Suspense } from 'react'
import { useAppStore } from './store/useAppStore'
import { AppShell } from './components/layout/AppShell'
import { AlertToastContainer } from './components/alerts/AlertToast'
import { SIDECAR_BASE } from './hooks/useSidecar'

const Onboarding  = lazy(() => import('./pages/Onboarding'))
const OllamaSetup = lazy(() => import('./pages/OllamaSetup'))

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-xl animate-pulse" style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)' }} />
        <p className="text-xs text-text-tertiary">Loading Doxshield…</p>
      </div>
    </div>
  )
}

export default function App() {
  const { onboardingComplete, sidecarStatus, setSidecarStatus, setUser, setOnboardingComplete } = useAppStore()
  const [authChecked, setAuthChecked] = useState(false)
  // null = not yet checked, true = needs setup, false = setup complete / skip
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)

  // Check if Ollama + Mistral are available (packaged app only)
  useEffect(() => {
    if (!window.sovereign?.setupCheckStatus) {
      setNeedsSetup(false)
      return
    }
    window.sovereign.setupCheckStatus().then(status => {
      setNeedsSetup(!status.mistralReady)
    }).catch(() => setNeedsSetup(false))
  }, [])

  // Poll sidecar status
  useEffect(() => {
    if (!window.sovereign) return
    const check = async () => {
      try {
        const status = await window.sovereign?.getSidecarStatus()
        if (status) setSidecarStatus(status as 'starting' | 'ready' | 'error')
      } catch { /* ignore */ }
    }
    check()
    const interval = setInterval(check, 3000)
    return () => clearInterval(interval)
  }, [setSidecarStatus])

  // JWT auto-login on startup
  useEffect(() => {
    const tryAutoLogin = async () => {
      try {
        if (!window.sovereign?.loadToken) {
          setAuthChecked(true)
          return
        }
        const token = await window.sovereign.loadToken()
        if (!token) { setAuthChecked(true); return }

        const res = await fetch(`${SIDECAR_BASE}/api/auth/verify-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        if (!res.ok) { setAuthChecked(true); return }

        const data = await res.json()
        if (data.valid && data.user) {
          const u = data.user
          setUser({
            id: u.email,
            email: u.email,
            name: u.name || u.email.split('@')[0],
            plan: u.user_type === 'business' ? 'business' : 'consumer',
          })
          setOnboardingComplete(true)
        }
      } catch {
        /* ignore — sidecar may still be starting */
      } finally {
        setAuthChecked(true)
      }
    }

    // Wait a moment for sidecar to be ready before trying auto-login
    const timer = setTimeout(tryAutoLogin, 1500)
    return () => clearTimeout(timer)
  }, [setUser, setOnboardingComplete])

  // Deep link handler
  useEffect(() => {
    if (!window.sovereign) return
    const cleanup = window.sovereign.onDeepLink((url: string) => {
      console.log('Deep link:', url)
    })
    return cleanup
  }, [])

  if (!authChecked || needsSetup === null) return <LoadingScreen />

  if (needsSetup) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <OllamaSetup onComplete={() => setNeedsSetup(false)} />
      </Suspense>
    )
  }

  return (
    <>
      <Suspense fallback={<LoadingScreen />}>
        {!onboardingComplete ? <Onboarding /> : <AppShell />}
      </Suspense>
      <AlertToastContainer />
    </>
  )
}
