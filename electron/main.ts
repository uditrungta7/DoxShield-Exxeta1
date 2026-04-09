import { app, BrowserWindow, Tray, Menu, shell, ipcMain, Notification, nativeImage, safeStorage, dialog } from 'electron'
import { join } from 'path'
import { existsSync, writeFileSync, readFileSync, unlinkSync } from 'fs'
import { startSidecar, stopSidecar, getSidecarStatus } from './sidecar'
import { checkSetupStatus, runFullSetup } from './setup'
import os from 'os'

// Set app name BEFORE ready — fixes macOS menu bar name
app.setName('Doxshield')

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

// ─── Shield tray icon (base64 SVG → nativeImage) ─────────────────────────────
function createTrayIcon(size: number): Electron.NativeImage {
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 2L4 7v9c0 7.18 5.16 13.9 12 15.5C22.84 29.9 28 23.18 28 16V7L16 2z"
          fill="#3B82F6" opacity="0.9"/>
    <path d="M16 5L7 9.5v7c0 5.4 3.87 10.44 9 11.6V5z" fill="white" opacity="0.15"/>
    <path d="M13 16.5l2.5 2.5 5-5" stroke="white" stroke-width="2.2"
          stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  return nativeImage.createFromDataURL(dataUrl)
}

// ─── Window ───────────────────────────────────────────────────────────────────
function createWindow(): void {
  const icon1x = createTrayIcon(16)
  const icon2x = createTrayIcon(32)

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#0A0A0F',
    title: 'Doxshield',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.on('close', () => {
    app.removeAllListeners('window-all-closed')
    app.quit()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ─── Tray ─────────────────────────────────────────────────────────────────────
function createTray(): void {
  const icon = createTrayIcon(16)
  icon.setTemplateImage(true)
  tray = new Tray(icon)

  const menu = Menu.buildFromTemplate([
    { label: 'Open Doxshield', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { type: 'separator' },
    { label: `Sidecar: ${getSidecarStatus()}`, enabled: false },
    { type: 'separator' },
    { label: 'Quit Doxshield', click: () => { app.removeAllListeners('window-all-closed'); app.quit() } },
  ])

  tray.setToolTip('Doxshield')
  tray.setContextMenu(menu)
  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.hide()
    else { mainWindow?.show(); mainWindow?.focus() }
  })
}

// ─── IPC ──────────────────────────────────────────────────────────────────────
function setupIPC(): void {
  ipcMain.handle('get-system-info', () => ({
    platform: process.platform, arch: process.arch,
    username: os.userInfo().username, homedir: os.homedir(),
    version: app.getVersion(),
  }))

  ipcMain.handle('open-external', (_, url: string) => {
    if (url && (url.startsWith('https://') || url.startsWith('http://') ||
        url.startsWith('x-apple.systempreferences:'))) {
      shell.openExternal(url)
    }
  })

  ipcMain.handle('minimize-window', () => mainWindow?.minimize())
  ipcMain.handle('maximize-window', () => {
    mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize()
  })
  ipcMain.handle('hide-window',   () => mainWindow?.hide())
  ipcMain.handle('quit-app',      () => { app.removeAllListeners('window-all-closed'); app.quit() })
  ipcMain.handle('get-sidecar-status', () => getSidecarStatus())
  ipcMain.handle('set-login-item', (_, enabled: boolean) => app.setLoginItemSettings({ openAtLogin: enabled }))
  ipcMain.handle('get-login-item', () => app.getLoginItemSettings().openAtLogin)
  ipcMain.handle('show-notification', (_, { title, body }: { title: string; body: string }) => {
    if (Notification.isSupported()) new Notification({ title, body }).show()
  })

  // ─── Secure token storage ─────────────────────────────────────────────────
  const tokenPath = join(app.getPath('userData'), 'auth.enc')

  ipcMain.handle('store-token', (_, token: string) => {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(token)
        writeFileSync(tokenPath, encrypted)
      } else {
        // Fallback: base64 only (not ideal, but functional on systems without keychain)
        writeFileSync(tokenPath, Buffer.from(token).toString('base64'))
      }
    } catch (err) {
      console.error('store-token error:', err)
    }
  })

  ipcMain.handle('load-token', () => {
    try {
      if (!existsSync(tokenPath)) return null
      const data = readFileSync(tokenPath)
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(data)
      } else {
        return Buffer.from(data.toString(), 'base64').toString()
      }
    } catch {
      return null
    }
  })

  ipcMain.handle('clear-token', () => {
    try {
      if (existsSync(tokenPath)) unlinkSync(tokenPath)
    } catch { /* ignore */ }
  })

  // ─── First-launch setup (Ollama + Mistral) ───────────────────────────────
  ipcMain.handle('setup-check-status', () => checkSetupStatus())

  ipcMain.handle('setup-run', async (_event) => {
    try {
      await runFullSetup((stage, msg, percent) => {
        mainWindow?.webContents.send('setup-progress', { stage, msg, percent })
      })
      mainWindow?.webContents.send('setup-done', { ok: true })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      mainWindow?.webContents.send('setup-done', { ok: false, error: message })
    }
  })

  // ─── PDF export ───────────────────────────────────────────────────────────
  ipcMain.handle('save-pdf', async (_, { html, defaultName }: { html: string; defaultName: string }) => {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: defaultName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (canceled || !filePath) return null

    // Render in a hidden BrowserWindow then printToPDF
    const pdfWin = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })
    await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    // Brief settle time for fonts/layout
    await new Promise(r => setTimeout(r, 600))
    const pdfBuffer = await pdfWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 },
    })
    pdfWin.close()
    writeFileSync(filePath, pdfBuffer)
    return filePath
  })
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  app.setAsDefaultProtocolClient('doxshield')

  app.on('open-url', (event, url) => {
    event.preventDefault()
    mainWindow?.show()
    mainWindow?.webContents.send('deep-link', url)
  })

  setupIPC()

  try {
    await startSidecar()
    console.log('[Doxshield] Sidecar started')
  } catch (err) {
    console.error('[Doxshield] Sidecar failed:', err)
  }

  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else mainWindow?.show()
  })
})

app.on('before-quit', async () => {
  await stopSidecar()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
