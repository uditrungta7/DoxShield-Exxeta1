import React from 'react'
import { Bell } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { cn } from '../../lib/utils'

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  network:   'Network Monitor',
  cookies:   'Cookies & Trackers',
  apps:      'Applications',
  alerts:    'Alerts',
  settings:  'Settings',
  'app-detail': 'App Detail',
}

export function TitleBar() {
  const { currentPage, ollamaStatus, unreadAlertCount, setCurrentPage } = useAppStore()
  const title = PAGE_TITLES[currentPage] || 'Dashboard'

  const dotColor = ollamaStatus === 'ready'   ? 'var(--risk-low)'
    : ollamaStatus === 'loading' ? 'var(--risk-medium)' : 'var(--risk-high)'
  const label    = ollamaStatus === 'ready'   ? 'Mistral Ready'
    : ollamaStatus === 'loading' ? 'AI Loading' : 'AI Offline'

  return (
    <div
      className="title-bar flex items-center flex-shrink-0 border-b"
      style={{
        height: 'var(--titlebar-height)',
        background: 'var(--bg-primary)',
        borderBottomColor: 'var(--border-subtle)',
        paddingLeft: 80,          // clear the traffic light buttons
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Page title — no-drag */}
      <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
           className="flex items-center gap-2">
        <span className="text-text-tertiary text-xs">/</span>
        <span className="text-text-primary text-base font-medium">{title}</span>
      </div>

      {/* Right controls — no-drag */}
      <div
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        className="ml-auto flex items-center gap-4 pr-4"
      >
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
               style={{ background: dotColor }} />
          <span className="text-xs text-text-tertiary">{label}</span>
        </div>
        <button
          onClick={() => setCurrentPage('alerts')}
          className="relative p-1 rounded hover:bg-bg-tertiary transition-colors"
        >
          <Bell size={16} className="text-text-secondary" />
          {unreadAlertCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-white font-bold"
                  style={{ background: 'var(--accent-blue)' }}>
              {unreadAlertCount > 9 ? '9+' : unreadAlertCount}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
