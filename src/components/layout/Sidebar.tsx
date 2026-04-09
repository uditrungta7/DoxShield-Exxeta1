import React from 'react'
import { Shield, Activity, Cookie, AppWindow, Bell, Settings } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { cn } from '../../lib/utils'

const NAV = [
  { id: 'dashboard', label: 'Dashboard',         icon: Shield },
  { id: 'network',   label: 'Network Monitor',    icon: Activity },
  { id: 'cookies',   label: 'Cookies & Trackers', icon: Cookie },
  { id: 'apps',      label: 'Applications',       icon: AppWindow },
  { id: 'alerts',    label: 'Alerts',             icon: Bell },
]

function NavItem({ id, label, icon: Icon, active, onClick, badge }: {
  id: string; label: string; icon: React.ElementType
  active: boolean; onClick: () => void; badge?: number
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 h-9 rounded-md text-left transition-colors border-l-2',
        active
          ? 'bg-bg-tertiary text-text-primary border-accent-blue pl-[10px]'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary border-transparent'
      )}
    >
      <Icon size={16} className="flex-shrink-0" />
      <span className="text-base flex-1 truncate">{label}</span>
      {!!badge && badge > 0 && (
        <span className="bg-accent-blue text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-medium">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}

export function Sidebar() {
  const { currentPage, setCurrentPage, user, unreadAlertCount } = useAppStore()
  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <div
      className="flex flex-col h-full flex-shrink-0 border-r"
      style={{ width: 'var(--sidebar-width)', background: 'var(--bg-secondary)', borderRightColor: 'var(--border-subtle)' }}
    >
      {/* Logo — matches titlebar height, draggable region, content clear of traffic lights */}
      <div
        className="flex items-center border-b flex-shrink-0"
        style={{
          height: 'var(--titlebar-height)',
          paddingLeft: 82,
          borderBottomColor: 'var(--border-subtle)',
          WebkitAppRegion: 'drag',
          userSelect: 'none',
        } as React.CSSProperties}
      >
        <div
          className="flex items-center gap-2.5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div className="w-6 h-6 bg-accent-blue rounded-md flex items-center justify-center flex-shrink-0">
            <Shield size={14} className="text-white" />
          </div>
          <span className="text-base font-semibold text-text-primary">Doxshield</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map(item => (
          <NavItem
            key={item.id} id={item.id} label={item.label} icon={item.icon}
            active={currentPage === item.id}
            onClick={() => setCurrentPage(item.id)}
            badge={item.id === 'alerts' ? unreadAlertCount : undefined}
          />
        ))}
      </nav>

      {/* Bottom */}
      <div className="border-t px-2 py-3 space-y-0.5" style={{ borderTopColor: 'var(--border-subtle)' }}>
        <NavItem
          id="settings" label="Settings" icon={Settings}
          active={currentPage === 'settings'}
          onClick={() => setCurrentPage('settings')}
        />
        {user && (
          <div className="flex items-center gap-2.5 px-3 py-2 mt-1">
            <div className="w-7 h-7 bg-accent-blue rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-semibold">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base text-text-primary font-medium truncate">{user.name}</div>
              <div className="text-xs text-text-tertiary capitalize">{user.plan}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
