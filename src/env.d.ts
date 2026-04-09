/// <reference types="vite/client" />

interface Window {
  sovereign?: {
    getSystemInfo: () => Promise<{ platform: string; arch: string; username: string; homedir: string; version: string }>
    openExternal: (url: string) => Promise<void>
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    quit: () => Promise<void>
    getSidecarStatus: () => Promise<string>
    setLoginItem: (enabled: boolean) => Promise<void>
    getLoginItem: () => Promise<boolean>
    showNotification: (title: string, body: string) => Promise<void>
    onDeepLink: (callback: (url: string) => void) => () => void
  }
}
