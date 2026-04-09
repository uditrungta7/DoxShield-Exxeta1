import React, { useEffect, useState, useRef } from 'react'
import { CheckCircle2, Circle, Loader2, AlertCircle, ChevronRight } from 'lucide-react'

interface StepState {
  status: 'pending' | 'running' | 'done' | 'error'
  message: string
  percent: number
}

const STAGES = [
  { id: 'install-ollama', label: 'Install Ollama runtime' },
  { id: 'start-ollama',   label: 'Start Ollama server' },
  { id: 'pull-mistral',   label: 'Download Mistral AI model (~4 GB)' },
]

function StepIcon({ status }: { status: StepState['status'] }) {
  if (status === 'done')    return <CheckCircle2 size={18} style={{ color: 'var(--risk-low)' }} />
  if (status === 'running') return <Loader2 size={18} className="animate-spin" style={{ color: '#3b82f6' }} />
  if (status === 'error')   return <AlertCircle size={18} style={{ color: 'var(--risk-high)' }} />
  return <Circle size={18} style={{ color: 'var(--text-muted)' }} />
}

export default function OllamaSetup({ onComplete }: { onComplete: () => void }) {
  const [steps, setSteps] = useState<Record<string, StepState>>(() =>
    Object.fromEntries(STAGES.map(s => [s.id, { status: 'pending', message: '', percent: 0 }]))
  )
  const [started, setStarted] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [allDone, setAllDone] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const [logs, setLogs] = useState<string[]>([])

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-80), msg])
    setTimeout(() => logRef.current?.scrollTo({ top: 9999, behavior: 'smooth' }), 50)
  }

  useEffect(() => {
    if (!window.sovereign) return

    const unProgress = window.sovereign.onSetupProgress(({ stage, msg, percent }) => {
      setSteps(prev => ({
        ...prev,
        [stage]: { status: percent >= 100 ? 'done' : 'running', message: msg, percent },
      }))
      addLog(msg)
    })

    const unDone = window.sovereign.onSetupDone(({ ok, error }) => {
      if (ok) {
        setSteps(prev =>
          Object.fromEntries(
            Object.entries(prev).map(([k, v]) => [k, { ...v, status: 'done', percent: 100 }])
          )
        )
        setAllDone(true)
        addLog('✓ Setup complete!')
      } else {
        setGlobalError(error ?? 'Setup failed')
        addLog(`✗ Error: ${error}`)
      }
    })

    return () => { unProgress(); unDone() }
  }, [])

  const startSetup = () => {
    if (!window.sovereign) return
    setStarted(true)
    // Mark first stage as running
    setSteps(prev => ({
      ...prev,
      'install-ollama': { ...prev['install-ollama'], status: 'running' },
    }))
    addLog('Starting Doxshield setup…')
    window.sovereign.setupRun()
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-8"
      style={{ background: 'var(--bg-primary)', WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Drag region spacer */}
      <div className="absolute top-0 left-0 right-0 h-10" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

      <div className="w-full max-w-md" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)' }}>
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <path d="M16 2L4 7v9c0 7.18 5.16 13.9 12 15.5C22.84 29.9 28 23.18 28 16V7L16 2z"
                    fill="white" fillOpacity="0.9"/>
              <path d="M13 16.5l2.5 2.5 5-5" stroke="#3B82F6" strokeWidth="2.2"
                    strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Doxshield Setup</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>One-time AI engine installation</p>
          </div>
        </div>

        {/* Steps */}
        <div className="rounded-xl p-5 mb-4 space-y-4"
             style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
          {STAGES.map((stage, i) => {
            const step = steps[stage.id]
            return (
              <div key={stage.id} className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0">
                  <StepIcon status={step.status} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {stage.label}
                    </span>
                    {step.status === 'running' && step.percent > 0 && (
                      <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
                        {step.percent}%
                      </span>
                    )}
                  </div>
                  {step.status === 'running' && step.percent > 0 && (
                    <div className="mt-1.5 h-1 rounded-full overflow-hidden"
                         style={{ background: 'var(--bg-tertiary)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${step.percent}%`, background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' }}
                      />
                    </div>
                  )}
                  {step.message && step.status !== 'pending' && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                      {step.message}
                    </p>
                  )}
                </div>
                {i < STAGES.length - 1 && (
                  <ChevronRight size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--border-subtle)' }} />
                )}
              </div>
            )
          })}
        </div>

        {/* Log output */}
        {started && (
          <div
            ref={logRef}
            className="rounded-lg p-3 mb-4 h-28 overflow-y-auto text-xs font-mono"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
          >
            {logs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}

        {/* Error */}
        {globalError && (
          <div className="rounded-lg p-3 mb-4 flex items-start gap-2"
               style={{ background: '#1a0505', border: '1px solid var(--risk-high)' }}>
            <AlertCircle size={14} style={{ color: 'var(--risk-high)', marginTop: 1, flexShrink: 0 }} />
            <p className="text-xs" style={{ color: 'var(--risk-high)' }}>{globalError}</p>
          </div>
        )}

        {/* Action button */}
        {!started && !allDone && (
          <button
            onClick={startSetup}
            className="w-full py-2.5 rounded-button text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white' }}
          >
            Set Up Doxshield
          </button>
        )}

        {allDone && (
          <button
            onClick={onComplete}
            className="w-full py-2.5 rounded-button text-sm font-medium transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white' }}
          >
            <CheckCircle2 size={16} />
            Launch Doxshield
          </button>
        )}

        {started && !allDone && !globalError && (
          <div className="text-center py-2">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Downloading Mistral (~4 GB) — this runs only once.
            </p>
          </div>
        )}

        {globalError && (
          <button
            onClick={() => {
              setGlobalError(null)
              setStarted(false)
              setSteps(Object.fromEntries(STAGES.map(s => [s.id, { status: 'pending', message: '', percent: 0 }])))
              setLogs([])
            }}
            className="w-full py-2.5 rounded-button text-sm font-medium mt-2"
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
          >
            Retry Setup
          </button>
        )}
      </div>
    </div>
  )
}
