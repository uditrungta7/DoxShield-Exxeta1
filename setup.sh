#!/usr/bin/env bash
set -euo pipefail

# ─── DoxShield Setup Script ────────────────────────────────────────────────────
# Idempotent: safe to run multiple times.

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

step() { echo -e "\n${BOLD}▶ $*${NC}"; }
ok()   { echo -e "  ${GREEN}✓${NC} $*"; }
warn() { echo -e "  ${YELLOW}⚠${NC}  $*"; }
fail() { echo -e "  ${RED}✗${NC} $*"; exit 1; }

echo -e "${BOLD}DoxShield Setup${NC} — Data Sovereignty Monitor"
echo "──────────────────────────────────────────────"

# ─── 1. Homebrew ──────────────────────────────────────────────────────────────
step "Checking Homebrew"
if ! command -v brew &>/dev/null; then
  warn "Homebrew not found. Installing..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
ok "Homebrew ready ($(brew --version | head -1))"

# ─── 2. Python 3.11 ───────────────────────────────────────────────────────────
step "Checking Python 3.11+"
PYTHON=""
for candidate in python3.12 python3.11 python3; do
  if command -v "$candidate" &>/dev/null; then
    ver=$("$candidate" -c "import sys; print(sys.version_info[:2])")
    if [[ "$ver" == "(3, 11)" || "$ver" == "(3, 12)" || "$ver" == "(3, 13)" ]]; then
      PYTHON="$candidate"; break
    fi
  fi
done
if [[ -z "$PYTHON" ]]; then
  warn "Python 3.11+ not found. Installing via Homebrew..."
  brew install python@3.11
  PYTHON="$(brew --prefix python@3.11)/bin/python3.11"
fi
ok "Python: $($PYTHON --version)"

# ─── 3. Ollama + Mistral ─────────────────────────────────────────────────────
step "Checking Ollama"
if ! command -v ollama &>/dev/null; then
  warn "Ollama not found. Installing..."
  brew install ollama
fi
ok "Ollama: $(ollama --version 2>/dev/null || echo 'installed')"

step "Checking Mistral 7B model"
if ! ollama list 2>/dev/null | grep -q "mistral"; then
  echo "  Pulling Mistral 7B (this may take several minutes)..."
  ollama pull mistral || warn "Mistral pull failed — AI analysis will be unavailable"
else
  ok "Mistral 7B model present"
fi

# ─── 4. Python virtual environment ──────────────────────────────────────────
step "Setting up Python virtualenv"
VENV="sidecar/.venv"
if [[ ! -d "$VENV" ]]; then
  $PYTHON -m venv "$VENV"
  ok "Created $VENV"
else
  ok "Virtualenv already exists"
fi

step "Installing Python dependencies"
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet -r sidecar/requirements.txt
ok "Python dependencies installed"

# ─── 5. Node / npm ────────────────────────────────────────────────────────────
step "Checking Node.js"
if ! command -v node &>/dev/null; then
  warn "Node.js not found. Installing via Homebrew..."
  brew install node
fi
ok "Node: $(node --version)"

step "Installing npm dependencies"
npm install --silent
ok "npm dependencies installed"

# ─── 6. Environment file ─────────────────────────────────────────────────────
step "Checking .env"
if [[ ! -f ".env" ]]; then
  cp .env.example .env
  ok "Created .env from .env.example"
  warn "Edit .env to add your CLERK_PUBLISHABLE_KEY and RESEND_API_KEY"
else
  ok ".env already exists"
fi

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}Setup complete!${NC}"
echo ""
echo "  To start DoxShield in development:"
echo "    ./start.sh"
echo ""
echo "  To build for production:"
echo "    npm run build"
echo ""
