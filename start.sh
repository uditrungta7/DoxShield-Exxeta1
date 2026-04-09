#!/usr/bin/env bash
set -euo pipefail

# ─── DoxShield Dev Launcher ───────────────────────────────────────────────────

BOLD='\033[1m'; GREEN='\033[0;32m'; NC='\033[0m'

echo -e "${BOLD}DoxShield${NC} — starting development mode"
echo "────────────────────────────────────────"

# Ensure venv exists
if [[ ! -f "sidecar/.venv/bin/python" ]]; then
  echo "Virtual environment not found — run ./setup.sh first"
  exit 1
fi

# Start Ollama in background if not running
if ! pgrep -x ollama &>/dev/null; then
  echo "  Starting Ollama..."
  ollama serve &>/dev/null &
  sleep 2
fi

# Start the Electron + Vite dev server
echo -e "  ${GREEN}▶${NC} Starting Electron dev server..."
npm run dev
