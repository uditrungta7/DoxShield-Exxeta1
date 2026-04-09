import React, { lazy, Suspense } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'
import { useAppStore } from '../../store/useAppStore'
import { useRiskProfile } from '../../hooks/useRiskProfile'
import { useNetworkMonitor } from '../../hooks/useNetworkMonitor'
import { useOllamaStatus } from '../../hooks/useOllamaStatus'
import { ConsumerDashboard } from '../dashboard/ConsumerDashboard'
import { BusinessDashboard } from '../dashboard/BusinessDashboard'

const NetworkMonitor  = lazy(() => import('../../pages/NetworkMonitor'))
const Cookies         = lazy(() => import('../../pages/Cookies'))
const Alerts          = lazy(() => import('../../pages/Alerts'))
const Settings        = lazy(() => import('../../pages/Settings'))
const AppDetail       = lazy(() => import('../../pages/AppDetail'))
const Applications    = lazy(() => import('../../pages/Applications'))

const variants   = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 } }
const transition = { duration: 0.2, ease: 'easeOut' }

function Spinner() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent-blue)', borderTopColor: 'transparent' }} />
    </div>
  )
}

function PageContent() {
  const { currentPage, user } = useAppStore()
  const isBusiness = user?.plan === 'business'

  const render = () => {
    switch (currentPage) {
      case 'dashboard':   return isBusiness ? <BusinessDashboard /> : <ConsumerDashboard />
      case 'network':     return <NetworkMonitor />
      case 'cookies':     return <Cookies />
      case 'apps':        return <Applications />
      case 'alerts':      return <Alerts />
      case 'settings':    return <Settings />
      case 'app-detail':  return <AppDetail />
      default:            return isBusiness ? <BusinessDashboard /> : <ConsumerDashboard />
    }
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentPage}
        variants={variants} initial="initial" animate="animate" exit="exit"
        transition={transition}
        className="flex-1 overflow-auto"
        style={{ background: 'var(--bg-primary)' }}
      >
        <Suspense fallback={<Spinner />}>{render()}</Suspense>
      </motion.div>
    </AnimatePresence>
  )
}

export function AppShell() {
  useRiskProfile()
  useNetworkMonitor()
  useOllamaStatus()

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TitleBar />
        <PageContent />
      </div>
    </div>
  )
}
