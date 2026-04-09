/**
 * First-launch setup: installs Ollama and pulls the Mistral model.
 * All functions are called from IPC handlers in main.ts.
 */
import { exec, spawn, execSync } from 'child_process'
import { existsSync, createWriteStream, chmodSync, mkdirSync } from 'fs'
import { promisify } from 'util'
import { join, dirname } from 'path'
import { app } from 'electron'
import * as https from 'https'

const execAsync = promisify(exec)

// ─── Ollama binary discovery ──────────────────────────────────────────────────

const OLLAMA_SEARCH_PATHS = [
  '/opt/homebrew/bin/ollama',
  '/usr/local/bin/ollama',
  '/usr/bin/ollama',
  '/Applications/Ollama.app/Contents/Resources/ollama',
]

export function findOllama(): string | null {
  for (const p of OLLAMA_SEARCH_PATHS) {
    if (existsSync(p)) return p
  }
  try {
    const r = execSync('which ollama 2>/dev/null', { encoding: 'utf8' }).trim()
    if (r && existsSync(r)) return r
  } catch { /* not in PATH */ }
  return null
}

// ─── Status check ─────────────────────────────────────────────────────────────

export interface SetupStatus {
  ollamaInstalled: boolean
  ollamaRunning: boolean
  mistralReady: boolean
}

export async function checkSetupStatus(): Promise<SetupStatus> {
  const ollamaPath = findOllama()
  const ollamaInstalled = ollamaPath !== null

  let ollamaRunning = false
  let mistralReady = false

  if (ollamaInstalled) {
    try {
      const resp = await fetch('http://localhost:11434/api/tags', {
        signal: AbortSignal.timeout(3000),
      })
      if (resp.ok) {
        ollamaRunning = true
        const data = (await resp.json()) as { models?: Array<{ name: string }> }
        const models = data.models ?? []
        mistralReady = models.some(m => m.name.startsWith('mistral'))
      }
    } catch { /* ollama not running */ }
  }

  return { ollamaInstalled, ollamaRunning, mistralReady }
}

// ─── Ollama installation ──────────────────────────────────────────────────────

async function downloadFile(url: string, dest: string): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true })
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)
    const request = (target: string) => {
      https.get(target, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close()
          request(res.headers.location!)
          return
        }
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve()))
        file.on('error', reject)
        res.on('error', reject)
      }).on('error', reject)
    }
    request(url)
  })
}

export async function installOllama(
  onProgress: (msg: string) => void
): Promise<void> {
  // Prefer Homebrew if available
  try {
    execSync('which brew', { encoding: 'utf8' })
    onProgress('Installing Ollama via Homebrew…')
    await execAsync('brew install ollama', { timeout: 120_000 })
    onProgress('Ollama installed via Homebrew.')
    return
  } catch { /* brew not available or failed */ }

  // Direct download: the official macOS CLI binary
  const OLLAMA_VERSION = 'v0.6.5'
  const BINARY_URL = `https://github.com/ollama/ollama/releases/download/${OLLAMA_VERSION}/ollama-darwin`
  const destDir = '/usr/local/bin'
  const destPath = join(destDir, 'ollama')

  onProgress('Downloading Ollama binary…')
  try {
    await downloadFile(BINARY_URL, destPath)
    chmodSync(destPath, 0o755)
    onProgress('Ollama binary installed to /usr/local/bin/ollama.')
  } catch (err) {
    // /usr/local/bin might not be writable without sudo — fall back to userData
    const fallbackPath = join(app.getPath('userData'), 'bin', 'ollama')
    mkdirSync(dirname(fallbackPath), { recursive: true })
    onProgress('Downloading Ollama binary to app data directory…')
    await downloadFile(BINARY_URL, fallbackPath)
    chmodSync(fallbackPath, 0o755)
    onProgress(`Ollama binary installed to ${fallbackPath}.`)
  }
}

// ─── Start Ollama server ──────────────────────────────────────────────────────

export async function ensureOllamaRunning(
  onProgress: (msg: string) => void
): Promise<void> {
  // Check if already running
  try {
    const r = await fetch('http://localhost:11434/', { signal: AbortSignal.timeout(2000) })
    if (r.ok || r.status === 404) {
      onProgress('Ollama is already running.')
      return
    }
  } catch { /* not running */ }

  const ollamaPath = findOllama()
  if (!ollamaPath) throw new Error('Ollama binary not found after installation.')

  onProgress('Starting Ollama server…')
  const proc = spawn(ollamaPath, ['serve'], {
    detached: true,
    stdio: 'ignore',
  })
  proc.unref()

  // Wait for server to be ready (up to 30s)
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 800))
    try {
      const r = await fetch('http://localhost:11434/', { signal: AbortSignal.timeout(2000) })
      if (r.ok || r.status === 404) {
        onProgress('Ollama server is ready.')
        return
      }
    } catch { /* still starting */ }
  }
  throw new Error('Ollama server did not start within 30 seconds.')
}

// ─── Pull Mistral with progress ───────────────────────────────────────────────

export async function pullMistral(
  onProgress: (msg: string, percent: number) => void
): Promise<void> {
  onProgress('Pulling Mistral model (this may take a few minutes)…', 0)

  const ollamaPath = findOllama()
  if (!ollamaPath) throw new Error('Ollama binary not found.')

  return new Promise<void>((resolve, reject) => {
    const proc = spawn(ollamaPath, ['pull', 'mistral'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let lastPct = 0

    const parseLine = (line: string) => {
      // Lines look like: "pulling manifest" or "5% ▕████     ▏  124 MB/2.4 GB"
      const pctMatch = line.match(/(\d+)%/)
      if (pctMatch) {
        lastPct = parseInt(pctMatch[1], 10)
        onProgress(`Downloading Mistral… ${lastPct}%`, lastPct)
      } else if (line.trim()) {
        onProgress(line.trim(), lastPct)
      }
    }

    proc.stdout?.on('data', (d: Buffer) =>
      d.toString().split('\n').forEach(parseLine)
    )
    proc.stderr?.on('data', (d: Buffer) =>
      d.toString().split('\n').forEach(parseLine)
    )

    proc.on('exit', (code) => {
      if (code === 0) {
        onProgress('Mistral model ready.', 100)
        resolve()
      } else {
        reject(new Error(`ollama pull exited with code ${code}`))
      }
    })
    proc.on('error', reject)
  })
}

// ─── Full setup orchestration (called from IPC handler) ───────────────────────

export async function runFullSetup(
  onProgress: (stage: string, msg: string, percent: number) => void
): Promise<void> {
  const status = await checkSetupStatus()

  if (!status.ollamaInstalled) {
    onProgress('install-ollama', 'Installing Ollama…', 0)
    await installOllama((msg) => onProgress('install-ollama', msg, 50))
    onProgress('install-ollama', 'Ollama installed.', 100)
  } else {
    onProgress('install-ollama', 'Ollama already installed.', 100)
  }

  if (!status.ollamaRunning) {
    onProgress('start-ollama', 'Starting Ollama server…', 0)
    await ensureOllamaRunning((msg) => onProgress('start-ollama', msg, 50))
    onProgress('start-ollama', 'Ollama running.', 100)
  } else {
    onProgress('start-ollama', 'Ollama already running.', 100)
  }

  if (!status.mistralReady) {
    await pullMistral((msg, pct) => onProgress('pull-mistral', msg, pct))
  } else {
    onProgress('pull-mistral', 'Mistral already available.', 100)
  }
}
