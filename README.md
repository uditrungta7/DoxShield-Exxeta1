# DoxShield

**Real-time data sovereignty monitor for European consumers and businesses.**

DoxShield tells you which of your installed Mac apps are sending data to non-EU jurisdictions, analyses privacy policies with a local Mistral 7B model, and alerts you to high-risk network connections — all without sending your data to any cloud.

```
 ┌─────────────────────────────────────────────────────┐
 │  Electron (React + TypeScript)                      │
 │  ┌───────────┐  ┌──────────┐  ┌──────────────────┐ │
 │  │  Sidebar  │  │ TitleBar │  │   Page Content   │ │
 │  │  (nav)    │  │ (status) │  │  (lazy-loaded)   │ │
 │  └───────────┘  └──────────┘  └──────────────────┘ │
 └───────────────────────┬─────────────────────────────┘
                         │ HTTP / SSE  (port 8765)
 ┌───────────────────────▼─────────────────────────────┐
 │  Python Sidecar (FastAPI + Uvicorn)                 │
 │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
 │  │ App scan │ │ Network  │ │ Cookies  │            │
 │  │ lsof     │ │ monitor  │ │ parser   │            │
 │  └──────────┘ └──────────┘ └──────────┘            │
 │  ┌──────────────────────────────────────┐           │
 │  │  Risk Engine (4-layer scoring)       │           │
 │  │  Jurisdiction · Policy · Perms · Net │           │
 │  └──────────────────────────────────────┘           │
 │  ┌──────────────────┐  ┌───────────────────────┐   │
 │  │  Ollama client   │  │  Resend email alerts  │   │
 │  │  (Mistral 7B)    │  │  (24h deduplication)  │   │
 │  └──────────────────┘  └───────────────────────┘   │
 └─────────────────────────────────────────────────────┘
```

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| macOS       | 13 Ventura+ |
| Node.js     | 18+ |
| Python      | 3.11+ |
| Homebrew    | Any |
| Ollama      | Latest |
| Disk space  | ~5 GB (Mistral 7B model) |

---

## Setup (5 minutes)

```bash
git clone https://github.com/your-org/doxshield
cd doxshield
./setup.sh
```

The setup script will:
1. Check/install Homebrew, Python 3.11+, Ollama
2. Pull the Mistral 7B model (~4 GB, one-time download)
3. Create `sidecar/.venv` and install Python deps
4. Run `npm install`
5. Copy `.env.example` → `.env`

### Configure `.env`

```bash
# Optional — required for magic-link auth
CLERK_PUBLISHABLE_KEY=pk_test_...

# Optional — required for email alerts
RESEND_API_KEY=re_...

# Sidecar (defaults work out of the box)
SIDECAR_PORT=8765
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=mistral
```

---

## Run

```bash
./start.sh      # starts Ollama + Electron dev mode
```

Or manually:

```bash
ollama serve &
npm run dev
```

---

## macOS Permissions

DoxShield works best with the following macOS permissions:

| Permission | Why | Where to grant |
|------------|-----|----------------|
| **Full Disk Access** | Reads TCC permission database | System Settings → Privacy & Security → Full Disk Access |
| **Network** | Monitors outbound connections | Granted automatically on first lsof run |
| **Notifications** | Alerts for high-risk activity | System Settings → Notifications → DoxShield |

> Without Full Disk Access, app permission data will be unavailable. Risk scores will still be calculated from jurisdiction and network data.

---

## Architecture

### Electron Renderer (React)
- **Zustand** store with persist middleware (auth + settings persisted; scan data always fresh)
- **Framer Motion** page transitions (opacity+y, 0.2s ease-out)
- **Recharts** donut chart for risk breakdown
- **react-simple-maps** world map for network connections
- **Tailwind CSS** with custom design tokens (dark theme, risk color palette)

### Python Sidecar (port 8765)
- **App scanner** — reads `/Applications` + Info.plist, cross-references 40-app jurisdiction DB
- **Permission reader** — sqlite3 against macOS TCC database (read-only)
- **Network monitor** — `lsof -i` polling every 10s, IP geolocation, tracker detection
- **Cookie parser** — Chrome/Firefox/Safari binary cookies (Safari struct parser in pure Python)
- **Risk engine** — 4-layer scoring: Jurisdiction (30%) + Policy AI (20%) + Permissions (25%) + Network (25%)
- **Ollama client** — Mistral 7B via local API, Metal-accelerated on Apple Silicon
- **Resend client** — HTML email alerts with 24-hour deduplication

### Risk Scoring
```
Sovereignty Score = 100 - Risk Score

Risk Score = weighted average of:
  • Jurisdiction  (30%): US=15, UK=10, EU=0, CN/RU=25-40
  • Policy AI     (20%): Mistral analysis of privacy policy text
  • Permissions   (25%): sensitive permissions (location, contacts, camera)
  • Network       (25%): CN/RU connections, known trackers, high frequency
```

---

## 5-Minute Demo

1. **Launch** `./start.sh` — app opens, sidecar starts
2. **Skip onboarding** → lands on Consumer Dashboard
3. Click **Rescan Now** → watch the SSE progress: apps → permissions → network → cookies → AI → scoring
4. Observe the **Sovereignty Score** gauge update
5. Click any app in the **Applications** list → App Detail page with 3 tabs
6. Open **AI Analysis** tab → click "Analyse Policy" (requires Ollama running)
7. Check **Network Monitor** → world map shows connection origins
8. Check **Cookies** → browser tabs show third-party tracker cookies
9. Open **Settings** → toggle Email Alerts, configure scan interval

---

## Known Limitations

- **Chrome cookie values** are Keychain-encrypted since Chrome 80 — DoxShield reads metadata only (domain, name, category), not values
- **Full Disk Access** is required for TCC permission reading; without it, permission layer scores default to 0
- **Safari binary cookies** uses an unofficial format parser — may break on future macOS versions
- **IP geolocation** uses `ip-api.com` (free, 45 req/min) with a fallback to known CIDR ranges
- **Mistral 7B** requires ~8 GB RAM; on 8 GB Macs it may be slow
- The app is **read-only** — it monitors and reports, but does not block connections or modify settings

---

## Build for Distribution

```bash
npm run build        # build renderer + preload
npm run build:mac    # create .dmg via electron-builder
```

Output: `dist/DoxShield-<version>.dmg`

---

## Project Structure

```
DoxShield/
├── electron/           Electron main process
│   ├── main.ts         Window, tray, IPC, deep links
│   ├── preload.ts      contextBridge API
│   └── sidecar.ts      Python process management
├── src/                React renderer
│   ├── components/     Reusable UI components
│   ├── pages/          Full-page views
│   ├── store/          Zustand state
│   ├── hooks/          Data-fetching hooks
│   └── lib/            Utilities
├── sidecar/            Python backend
│   ├── main.py         FastAPI app + routes
│   ├── scanner/        App, network, cookie, IP scanners
│   ├── ai/             Ollama client + risk engine
│   ├── alerts/         Resend email client
│   └── data/           JSON databases (apps, trackers, IP ranges)
├── setup.sh            Idempotent setup script
└── start.sh            Dev mode launcher
```
