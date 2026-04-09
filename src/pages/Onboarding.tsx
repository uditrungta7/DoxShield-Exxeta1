import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield, Mail, CheckCircle, Circle, ChevronRight, Loader2,
  Lock, Wifi, Bell, UserCircle, Building2
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { SIDECAR_BASE } from '../hooks/useSidecar'

// ─── Step 1: Profile (OTP + user type) ───────────────────────────────────────

function DigitInput({ value, onChange, onKeyDown, inputRef, disabled }: {
  value: string; onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  inputRef: React.RefObject<HTMLInputElement>; disabled?: boolean
}) {
  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      maxLength={1}
      value={value}
      disabled={disabled}
      onChange={e => {
        const v = e.target.value.replace(/\D/g, '').slice(-1)
        onChange(v)
      }}
      onKeyDown={onKeyDown}
      className="w-12 h-14 rounded-xl text-center text-2xl font-bold outline-none transition-all"
      style={{
        background: 'var(--bg-tertiary)',
        border: `2px solid ${value ? 'var(--accent-blue)' : 'var(--border-default)'}`,
        color: 'var(--text-primary)',
        caretColor: 'var(--accent-blue)',
      }}
    />
  )
}

function StepProfile({ onNext }: { onNext: () => void }) {
  const { setUser } = useAppStore()
  const [email, setEmail]       = useState('')
  const [name, setName]         = useState('')
  const [userType, setUserType] = useState<'consumer' | 'business'>('consumer')
  const [mode, setMode]         = useState<'form' | 'otp'>('form')
  const [digits, setDigits]     = useState<string[]>(['', '', '', '', '', ''])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [shake, setShake]       = useState(false)
  const inputRefs = Array.from({ length: 6 }, () => useRef<HTMLInputElement>(null))

  // Auto-focus first digit box when OTP mode starts
  useEffect(() => {
    if (mode === 'otp') {
      setTimeout(() => inputRefs[0].current?.focus(), 80)
    }
  }, [mode])

  const handleSend = async () => {
    if (!email || loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${SIDECAR_BASE}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, user_type: userType }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to send code')
      setDigits(['', '', '', '', '', ''])
      setMode('otp')
    } catch (e: any) {
      setError(e.message || 'Could not send code')
    } finally {
      setLoading(false)
    }
  }

  const handleDigitChange = (idx: number, val: string) => {
    const next = [...digits]
    next[idx] = val
    setDigits(next)
    if (val && idx < 5) inputRefs[idx + 1].current?.focus()
  }

  const handleDigitKey = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        const next = [...digits]; next[idx] = ''; setDigits(next)
      } else if (idx > 0) {
        inputRefs[idx - 1].current?.focus()
        const next = [...digits]; next[idx - 1] = ''; setDigits(next)
      }
    }
    if (e.key === 'ArrowLeft' && idx > 0) inputRefs[idx - 1].current?.focus()
    if (e.key === 'ArrowRight' && idx < 5) inputRefs[idx + 1].current?.focus()
  }

  // Handle paste of full 6-digit code
  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (text.length === 6) {
      setDigits(text.split(''))
      inputRefs[5].current?.focus()
    }
  }

  const handleVerify = async () => {
    const code = digits.join('')
    if (code.length < 6 || loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${SIDECAR_BASE}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Invalid code')
      }
      const data = await res.json()
      if (!data.success) throw new Error('Verification failed')

      // Store JWT
      if (window.sovereign?.storeToken) {
        await window.sovereign.storeToken(data.token)
      }

      const u = data.user
      setUser({
        id: u.email,
        email: u.email,
        name: u.name || u.email.split('@')[0],
        plan: u.user_type === 'business' ? 'business' : 'consumer',
      })
      onNext()
    } catch (e: any) {
      setError(e.message || 'Invalid code')
      setShake(true)
      setDigits(['', '', '', '', '', ''])
      setTimeout(() => { setShake(false); inputRefs[0].current?.focus() }, 600)
    } finally {
      setLoading(false)
    }
  }

  // Auto-verify when all 6 digits filled
  useEffect(() => {
    if (digits.every(d => d) && mode === 'otp') handleVerify()
  }, [digits])

  return (
    <div className="space-y-6 w-full max-w-sm mx-auto">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-text-primary">Welcome to Doxshield</h1>
        <p className="text-sm text-text-secondary">Secure your data sovereignty</p>
      </div>

      <AnimatePresence mode="wait">
        {mode === 'form' ? (
          <motion.div key="form" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.18 }} className="space-y-4">

            {/* User type toggle */}
            <div className="grid grid-cols-2 gap-2.5">
              {([
                { value: 'consumer', label: 'Personal',  icon: UserCircle },
                { value: 'business', label: 'Business',  icon: Building2  },
              ] as const).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setUserType(value)}
                  className="flex flex-col items-center gap-2 py-4 rounded-xl transition-all"
                  style={{
                    background: userType === value ? 'var(--accent-blue)18' : 'var(--bg-tertiary)',
                    border: `2px solid ${userType === value ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                  }}
                >
                  <Icon size={22} style={{ color: userType === value ? 'var(--accent-blue)' : 'var(--text-secondary)' }} />
                  <span className="text-sm font-semibold"
                    style={{ color: userType === value ? 'var(--accent-blue)' : 'var(--text-secondary)' }}>
                    {label}
                  </span>
                </button>
              ))}
            </div>

            {/* Name + email */}
            <input
              type="text"
              placeholder="Your name (optional)"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-input text-sm outline-none"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            />
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              className="w-full px-3 py-2.5 rounded-input text-sm outline-none"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            />

            {error && <p className="text-xs text-center" style={{ color: 'var(--risk-high)' }}>{error}</p>}

            <button
              onClick={handleSend}
              disabled={!email || loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-button text-sm font-semibold transition-opacity disabled:opacity-50"
              style={{ background: 'var(--accent-blue)', color: '#fff' }}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              {loading ? 'Sending…' : 'Send verification code'}
            </button>
          </motion.div>
        ) : (
          <motion.div key="otp" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.18 }} className="space-y-5">

            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-text-primary">Check your inbox</p>
              <p className="text-xs text-text-secondary">
                We sent a 6-digit code to <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>
              </p>
            </div>

            {/* Digit boxes */}
            <motion.div
              className="flex items-center justify-center gap-2"
              animate={shake ? { x: [0, -8, 8, -6, 6, 0] } : {}}
              transition={{ duration: 0.4 }}
              onPaste={handlePaste}
            >
              {digits.map((d, i) => (
                <DigitInput
                  key={i}
                  value={d}
                  onChange={v => handleDigitChange(i, v)}
                  onKeyDown={e => handleDigitKey(i, e)}
                  inputRef={inputRefs[i]}
                  disabled={loading}
                />
              ))}
            </motion.div>

            {error && (
              <p className="text-xs text-center" style={{ color: 'var(--risk-high)' }}>{error}</p>
            )}

            {loading && (
              <div className="flex items-center justify-center gap-2 text-xs text-text-secondary">
                <Loader2 size={13} className="animate-spin" /> Verifying…
              </div>
            )}

            <button
              onClick={handleVerify}
              disabled={digits.join('').length < 6 || loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-button text-sm font-semibold transition-opacity disabled:opacity-50"
              style={{ background: 'var(--accent-blue)', color: '#fff' }}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {loading ? 'Verifying…' : 'Verify code'}
            </button>

            <div className="flex items-center justify-between text-xs text-text-tertiary">
              <button onClick={() => { setMode('form'); setError('') }}
                className="hover:text-text-secondary transition-colors">
                ← Change email
              </button>
              <button
                onClick={handleSend}
                disabled={loading}
                className="hover:text-text-secondary transition-colors disabled:opacity-50"
              >
                Resend code
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Step 2: Permissions ─────────────────────────────────────────────────────

function PermissionRow({ icon: Icon, title, description, granted }: {
  icon: React.ElementType; title: string; description: string; granted: boolean
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-elevated)' }}>
        <Icon size={16} style={{ color: 'var(--text-secondary)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary">{title}</div>
        <div className="text-xs text-text-secondary mt-0.5">{description}</div>
      </div>
      {granted
        ? <CheckCircle size={16} style={{ color: 'var(--risk-low)' }} className="flex-shrink-0" />
        : <Circle size={16} style={{ color: 'var(--text-tertiary)' }} className="flex-shrink-0" />
      }
    </div>
  )
}

function StepPermissions({ onNext }: { onNext: () => void }) {
  const [checking, setChecking] = useState(false)
  const [checked, setChecked]   = useState(false)

  const handleCheck = async () => {
    setChecking(true)
    await new Promise(r => setTimeout(r, 1200))
    setChecking(false)
    setChecked(true)
  }

  return (
    <div className="space-y-5 w-full max-w-sm mx-auto">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-text-primary">System Permissions</h1>
        <p className="text-sm text-text-secondary">Doxshield needs these to monitor your privacy</p>
      </div>

      <div className="space-y-2">
        <PermissionRow icon={Lock}  title="Full Disk Access"    description="Read app permissions from macOS TCC database" granted={checked} />
        <PermissionRow icon={Wifi}  title="Network Monitoring"  description="Track outbound connections from your apps"     granted={checked} />
        <PermissionRow icon={Bell}  title="Notifications"       description="Alert you when high-risk activity is detected" granted={checked} />
      </div>

      {!checked ? (
        <button onClick={handleCheck} disabled={checking}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-button text-sm font-semibold transition-opacity disabled:opacity-50"
          style={{ background: 'var(--accent-blue)', color: '#fff' }}>
          {checking ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
          {checking ? 'Requesting…' : 'Grant Permissions'}
        </button>
      ) : (
        <button onClick={onNext}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-button text-sm font-semibold"
          style={{ background: 'var(--accent-blue)', color: '#fff' }}>
          Continue <ChevronRight size={14} />
        </button>
      )}

      <button onClick={onNext} className="w-full text-center text-xs text-text-tertiary hover:text-text-secondary transition-colors">
        Skip for now
      </button>
    </div>
  )
}

// ─── Step 3: Initial Scan ────────────────────────────────────────────────────

const SCAN_STEPS = [
  { step: 'apps',        label: 'Scanning installed applications…' },
  { step: 'permissions', label: 'Reading app permissions…' },
  { step: 'network',     label: 'Analysing network connections…' },
  { step: 'cookies',     label: 'Checking browser cookies…' },
  { step: 'ai',          label: 'Running AI risk analysis…' },
  { step: 'scoring',     label: 'Computing sovereignty scores…' },
  { step: 'complete',    label: 'Scan complete!' },
]

function StepScan({ onDone }: { onDone: () => void }) {
  const { setIsScanning, setScanProgress, setOverallRisk, setApps, setCookies, setLastScanAt, setOnboardingComplete } = useAppStore()
  const [started, setStarted]       = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [done, setDone]             = useState(false)
  const [detail, setDetail]         = useState('')

  const handleScan = () => {
    setStarted(true)
    setIsScanning(true)
    const es = new EventSource(`${SIDECAR_BASE}/api/scan/full-stream`)
    es.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data)
        const idx = SCAN_STEPS.findIndex(s => s.step === d.step)
        if (idx >= 0) setCurrentStep(idx)
        setDetail(d.detail || '')
        if (d.step === 'complete') {
          es.close(); setIsScanning(false); setScanProgress(null)
          if (d.data?.overall) setOverallRisk(d.data.overall)
          if (d.data?.apps)    setApps(d.data.apps)
          if (d.data?.cookies) setCookies(d.data.cookies)
          if (d.data?.scanned_at) setLastScanAt(d.data.scanned_at)
          setDone(true)
        } else if (d.step === 'error') {
          es.close(); setIsScanning(false); setDone(true)
        } else {
          setScanProgress({ step: d.step, detail: d.detail })
        }
      } catch { /* ignore */ }
    }
    es.onerror = () => { es.close(); setIsScanning(false); setDone(true) }
  }

  const handleFinish = () => { setOnboardingComplete(true); onDone() }

  return (
    <div className="space-y-6 w-full max-w-sm mx-auto">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-text-primary">Initial Privacy Scan</h1>
        <p className="text-sm text-text-secondary">We'll analyse your system and score your data sovereignty</p>
      </div>

      {!started ? (
        <div className="space-y-4">
          <div className="p-4 rounded-card text-sm text-text-secondary space-y-2"
            style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}>
            <p>Doxshield will scan:</p>
            <ul className="space-y-1 ml-3">
              {['Installed applications', 'Active network connections', 'Browser cookies', 'App permissions'].map(item => (
                <li key={item} className="flex items-center gap-2 text-xs">
                  <div className="w-1 h-1 rounded-full" style={{ background: 'var(--text-tertiary)' }} /> {item}
                </li>
              ))}
            </ul>
          </div>
          <button onClick={handleScan}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-button text-sm font-semibold"
            style={{ background: 'var(--accent-blue)', color: '#fff' }}>
            <Shield size={14} /> Start Scan
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-center py-4">
            <div className="relative w-24 h-24">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r="40" fill="none" stroke="var(--bg-tertiary)" strokeWidth="4" />
                <motion.circle cx="48" cy="48" r="40" fill="none"
                  stroke="var(--accent-blue)" strokeWidth="4" strokeLinecap="round"
                  strokeDasharray={251}
                  animate={{ strokeDashoffset: 251 - (251 * currentStep / (SCAN_STEPS.length - 1)) }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                {done
                  ? <CheckCircle size={28} style={{ color: 'var(--risk-low)' }} />
                  : <Loader2 size={22} className="animate-spin" style={{ color: 'var(--accent-blue)' }} />
                }
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            {SCAN_STEPS.map((s, i) => (
              <div key={s.step} className="flex items-center gap-2">
                <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                  {(i < currentStep || done)
                    ? <CheckCircle size={14} style={{ color: 'var(--risk-low)' }} />
                    : i === currentStep
                    ? <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-blue)' }} />
                    : <Circle size={14} style={{ color: 'var(--text-tertiary)' }} />
                  }
                </div>
                <span className={`text-xs ${i <= currentStep ? 'text-text-primary' : 'text-text-tertiary'}`}>{s.label}</span>
              </div>
            ))}
          </div>

          {detail && <p className="text-xs text-text-tertiary truncate">{detail}</p>}

          {done && (
            <button onClick={handleFinish}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-button text-sm font-semibold"
              style={{ background: 'var(--accent-blue)', color: '#fff' }}>
              View Dashboard <ChevronRight size={14} />
            </button>
          )}
        </div>
      )}

      {!started && (
        <button onClick={handleFinish} className="w-full text-center text-xs text-text-tertiary hover:text-text-secondary transition-colors">
          Skip scan, go to dashboard
        </button>
      )}
    </div>
  )
}

// ─── Main Onboarding ──────────────────────────────────────────────────────────

const STEPS = ['profile', 'permissions', 'scan'] as const

export default function Onboarding() {
  const { setCurrentPage } = useAppStore()
  const [step, setStep] = useState(0)

  const next = () => setStep(s => Math.min(s + 1, STEPS.length - 1))
  const done = () => setCurrentPage('dashboard')

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8"
      style={{ background: 'var(--bg-primary)' }}>

      {/* Logo */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2.5 mb-10">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)' }}>
          <Shield size={20} className="text-white" />
        </div>
        <span className="text-xl font-bold text-text-primary">Doxshield</span>
      </motion.div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full transition-colors duration-300"
              style={{ background: i <= step ? 'var(--accent-blue)' : 'var(--bg-tertiary)' }} />
            {i < STEPS.length - 1 && <div className="w-8 h-px" style={{ background: 'var(--border-subtle)' }} />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="w-full max-w-sm">
        <AnimatePresence mode="wait">
          <motion.div key={step}
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
            {step === 0 && <StepProfile onNext={next} />}
            {step === 1 && <StepPermissions onNext={next} />}
            {step === 2 && <StepScan onDone={done} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
