import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface User {
  id: string
  name: string
  email: string
  plan: 'consumer' | 'business'
}

export interface OverallRisk {
  sovereignty_score: number
  risk_score: number
  risk_level: string
  app_risk_score: number
  network_risk_score: number
  cookie_risk_score: number
  top_risk_apps?: Array<{ name: string; risk_score: number; risk_level: string }>
}

export interface AppRisk {
  app_id: string
  app_name: string
  bundle_id?: string
  risk_score: number
  risk_level: string
  jurisdiction: string
  privacy_policy_url?: string
  eu_alternative?: string
  risk_factors: string[]
  recommended_actions: Array<{
    type: string; priority: string; title: string; description?: string; action_url?: string
  }>
  layer_scores: { jurisdiction: number; policy: number; permissions: number; network: number }
  // Convenience aliases from full API response
  jurisdiction_score?: number
  policy_score?: number
  permission_score?: number
  network_score?: number
  policy_analysis?: Record<string, any>
}

export interface Connection {
  pid: number; process_name: string; app_name?: string; bundle_id?: string
  remote_ip: string; remote_port: number; remote_domain?: string
  country: string; country_code: string; jurisdiction: string
  is_known_tracker: boolean; tracker_category?: string
  risk_level: string; risk_score?: number; timestamp: string
}

export interface Cookie {
  id?: string
  domain: string; name: string; browser: string
  jurisdiction?: string; is_third_party?: boolean; is_tracker?: boolean
  category?: string; risk_level: string; expiry?: string; expires?: string
}

export interface Alert {
  id: string; app_id?: string; app_name: string; title: string
  message?: string; body?: string
  risk_level: string; timestamp: string; read: boolean
  destination_country?: string
}

export interface AppSettings {
  // Scan
  autoScanOnLaunch: boolean
  scanIntervalMinutes: number
  scanBrowsers: boolean
  // Alerts
  alertsEnabled: boolean
  emailAlertsEnabled: boolean
  alertMinLevel: string
  // AI
  ollamaModel: string
  autoAnalyze: boolean
  // Launch
  startMinimised: boolean
  // Privacy
  telemetryEnabled: boolean
  cachePolicyAnalyses: boolean
}

interface AppState {
  user: User | null; isAuthenticated: boolean; onboardingComplete: boolean
  currentPage: string; selectedAppId: string | null
  overallRisk: OverallRisk | null; apps: AppRisk[]
  connections: Connection[]; cookies: Cookie[]
  lastScanAt: string | null; isScanning: boolean
  scanProgress: { step: string; detail: string } | null
  alerts: Alert[]; unreadAlertCount: number
  ollamaStatus: 'ready' | 'loading' | 'offline'
  sidecarStatus: 'starting' | 'ready' | 'error'
  settings: AppSettings

  setUser: (u: User | null) => void
  setAuthenticated: (v: boolean) => void
  setOnboardingComplete: (v: boolean) => void
  setCurrentPage: (p: string) => void
  setSelectedAppId: (id: string | null) => void
  setOverallRisk: (r: OverallRisk) => void
  setApps: (a: AppRisk[]) => void
  setConnections: (c: Connection[]) => void
  addConnection: (c: Connection) => void
  setCookies: (c: Cookie[]) => void
  setLastScanAt: (dt: string) => void
  setIsScanning: (v: boolean) => void
  setScanProgress: (p: { step: string; detail: string } | null) => void
  addAlert: (a: Alert) => void
  markAlertRead: (id: string) => void
  dismissAlert: (id: string) => void
  markAllAlertsRead: () => void
  setOllamaStatus: (s: 'ready' | 'loading' | 'offline') => void
  setSidecarStatus: (s: 'starting' | 'ready' | 'error') => void
  setSettings: (s: Partial<AppSettings>) => void
  logout: () => void
  reset: () => void
}

const DEFAULT_SETTINGS: AppSettings = {
  autoScanOnLaunch: true,
  scanIntervalMinutes: 60,
  scanBrowsers: true,
  alertsEnabled: true,
  emailAlertsEnabled: false,
  alertMinLevel: 'HIGH',
  ollamaModel: 'mistral',
  autoAnalyze: false,
  startMinimised: false,
  telemetryEnabled: false,
  cachePolicyAnalyses: true,
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null, isAuthenticated: false, onboardingComplete: false,
      currentPage: 'dashboard', selectedAppId: null,
      overallRisk: null, apps: [], connections: [], cookies: [],
      lastScanAt: null, isScanning: false, scanProgress: null,
      alerts: [], unreadAlertCount: 0,
      ollamaStatus: 'loading', sidecarStatus: 'starting',
      settings: DEFAULT_SETTINGS,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setAuthenticated: (v) => set({ isAuthenticated: v }),
      setOnboardingComplete: (v) => set({ onboardingComplete: v }),
      setCurrentPage: (p) => set({ currentPage: p }),
      setSelectedAppId: (id) => set({ selectedAppId: id }),
      setOverallRisk: (r) => set({ overallRisk: r }),
      setApps: (apps) => set({ apps }),
      setConnections: (c) => set({ connections: c }),
      addConnection: (c) => set(s => ({ connections: [c, ...s.connections].slice(0, 500) })),
      setCookies: (c) => set({ cookies: c }),
      setLastScanAt: (dt) => set({ lastScanAt: dt }),
      setIsScanning: (v) => set({ isScanning: v }),
      setScanProgress: (p) => set({ scanProgress: p }),
      addAlert: (a) => set(s => ({ alerts: [a, ...s.alerts], unreadAlertCount: s.unreadAlertCount + 1 })),
      markAlertRead: (id) => set(s => {
        const alerts = s.alerts.map(a => a.id === id ? { ...a, read: true } : a)
        return { alerts, unreadAlertCount: alerts.filter(a => !a.read).length }
      }),
      dismissAlert: (id) => set(s => {
        const alerts = s.alerts.filter(a => a.id !== id)
        return { alerts, unreadAlertCount: alerts.filter(a => !a.read).length }
      }),
      markAllAlertsRead: () => set(s => ({
        alerts: s.alerts.map(a => ({ ...a, read: true })), unreadAlertCount: 0,
      })),
      setOllamaStatus: (s) => set({ ollamaStatus: s }),
      setSidecarStatus: (s) => set({ sidecarStatus: s }),
      setSettings: (ns) => set(s => ({ settings: { ...s.settings, ...ns } })),
      logout: () => set({
        user: null, isAuthenticated: false, onboardingComplete: false,
        overallRisk: null, apps: [], connections: [], cookies: [],
        alerts: [], unreadAlertCount: 0,
      }),
      reset: () => set({
        user: null, isAuthenticated: false, onboardingComplete: false,
        overallRisk: null, apps: [], connections: [], cookies: [],
        alerts: [], unreadAlertCount: 0, settings: DEFAULT_SETTINGS,
      }),
    }),
    {
      name: 'doxshield-storage',
      partialize: (s) => ({
        user: s.user, isAuthenticated: s.isAuthenticated,
        onboardingComplete: s.onboardingComplete, settings: s.settings,
      }),
    }
  )
)
