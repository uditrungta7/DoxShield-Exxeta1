import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('sovereign', {
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  openExternal:  (url: string) => ipcRenderer.invoke('open-external', url),
  minimize:      () => ipcRenderer.invoke('minimize-window'),
  maximize:      () => ipcRenderer.invoke('maximize-window'),
  close:         () => ipcRenderer.invoke('hide-window'),
  quit:          () => ipcRenderer.invoke('quit-app'),
  getSidecarStatus: () => ipcRenderer.invoke('get-sidecar-status'),
  setLoginItem:  (enabled: boolean) => ipcRenderer.invoke('set-login-item', enabled),
  getLoginItem:  () => ipcRenderer.invoke('get-login-item'),
  showNotification: (title: string, body: string) =>
    ipcRenderer.invoke('show-notification', { title, body }),
  onDeepLink: (callback: (url: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, url: string) => callback(url)
    ipcRenderer.on('deep-link', handler)
    return () => ipcRenderer.removeListener('deep-link', handler)
  },
  // Secure token storage
  storeToken: (token: string) => ipcRenderer.invoke('store-token', token),
  loadToken:  () => ipcRenderer.invoke('load-token'),
  clearToken: () => ipcRenderer.invoke('clear-token'),
  // PDF export
  savePdf: (html: string, defaultName: string) => ipcRenderer.invoke('save-pdf', { html, defaultName }),
  // First-launch setup
  setupCheckStatus: () => ipcRenderer.invoke('setup-check-status'),
  setupRun: () => ipcRenderer.invoke('setup-run'),
  onSetupProgress: (cb: (data: { stage: string; msg: string; percent: number }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { stage: string; msg: string; percent: number }) => cb(data)
    ipcRenderer.on('setup-progress', handler)
    return () => ipcRenderer.removeListener('setup-progress', handler)
  },
  onSetupDone: (cb: (data: { ok: boolean; error?: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { ok: boolean; error?: string }) => cb(data)
    ipcRenderer.on('setup-done', handler)
    return () => ipcRenderer.removeListener('setup-done', handler)
  },
})

declare global {
  interface Window {
    sovereign?: {
      getSystemInfo: () => Promise<{ platform: string; arch: string; username: string; homedir: string; version: string }>
      openExternal:  (url: string) => Promise<void>
      minimize:      () => Promise<void>
      maximize:      () => Promise<void>
      close:         () => Promise<void>
      quit:          () => Promise<void>
      getSidecarStatus: () => Promise<string>
      setLoginItem:  (enabled: boolean) => Promise<void>
      getLoginItem:  () => Promise<boolean>
      showNotification: (title: string, body: string) => Promise<void>
      onDeepLink:    (callback: (url: string) => void) => () => void
      storeToken:    (token: string) => Promise<void>
      loadToken:     () => Promise<string | null>
      clearToken:    () => Promise<void>
      savePdf:       (html: string, defaultName: string) => Promise<string | null>
      setupCheckStatus: () => Promise<{ ollamaInstalled: boolean; ollamaRunning: boolean; mistralReady: boolean }>
      setupRun:      () => Promise<void>
      onSetupProgress: (cb: (data: { stage: string; msg: string; percent: number }) => void) => () => void
      onSetupDone:   (cb: (data: { ok: boolean; error?: string }) => void) => () => void
    }
  }
}
