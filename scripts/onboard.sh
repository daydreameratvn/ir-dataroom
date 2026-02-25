#!/usr/bin/env bash
# ============================================================
# Papaya Banyan — Onboard Script
# Run this before starting any development work.
# Usage: bash scripts/onboard.sh
# ============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

ok()   { echo -e "  ${GREEN}[OK]${NC} $1"; }
warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "  ${RED}[FAIL]${NC} $1"; ERRORS=$((ERRORS + 1)); }
info() { echo -e "  ${BLUE}[INFO]${NC} $1"; }

ERRORS=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo ""
echo "=== Papaya Banyan — Environment Check ==="
echo ""

# ----------------------------------------------------------
# 1. Claude Code
# ----------------------------------------------------------
echo "Checking Claude Code..."

if command -v claude &>/dev/null; then
  CLAUDE_VERSION=$(claude --version 2>/dev/null || echo "unknown")
  ok "Claude Code v${CLAUDE_VERSION}"
else
  warn "Claude Code not installed — installing..."
  if curl -fsSL https://claude.ai/install.sh | bash 2>/dev/null; then
    ok "Claude Code installed"
  else
    fail "Claude Code installation failed — install manually: curl -fsSL https://claude.ai/install.sh | bash"
  fi
fi

# Check Claude Code authentication
if command -v claude &>/dev/null; then
  if claude auth status &>/dev/null 2>&1; then
    ok "Claude Code authenticated"
  else
    warn "Claude Code not authenticated — run 'claude' to log in via browser"
  fi
fi

echo ""

# ----------------------------------------------------------
# 2. Node.js
# ----------------------------------------------------------
echo "Checking runtime tools..."

if command -v node &>/dev/null; then
  NODE_VERSION=$(node --version | sed 's/v//')
  NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 20 ]; then
    ok "Node.js v${NODE_VERSION}"
  else
    fail "Node.js v${NODE_VERSION} — requires v20+"
  fi
else
  fail "Node.js not found — install via nvm or nodejs.org"
fi

# ----------------------------------------------------------
# 3. Bun
# ----------------------------------------------------------
if command -v bun &>/dev/null; then
  BUN_VERSION=$(bun --version)
  ok "Bun v${BUN_VERSION}"
else
  fail "Bun not found — install: curl -fsSL https://bun.sh/install | bash"
fi

# ----------------------------------------------------------
# 4. TypeScript Go (tsgo) — optional but preferred
# ----------------------------------------------------------
if command -v tsgo &>/dev/null; then
  TSGO_VERSION=$(tsgo --version 2>/dev/null || echo "unknown")
  ok "TypeScript Go (tsgo) v${TSGO_VERSION}"
else
  warn "tsgo not found — falling back to tsc. Install when available for faster type checking."
fi

# ----------------------------------------------------------
# 5. Git
# ----------------------------------------------------------
if command -v git &>/dev/null; then
  GIT_VERSION=$(git --version | sed 's/git version //')
  ok "Git v${GIT_VERSION}"
else
  fail "Git not found"
fi

echo ""

# ----------------------------------------------------------
# 6. Root dependencies (bun)
# ----------------------------------------------------------
echo "Checking dependencies..."

if [ -d "$ROOT_DIR/node_modules" ]; then
  ok "Root node_modules present"
else
  warn "Root node_modules missing — running: bun install"
  (cd "$ROOT_DIR" && bun install)
  ok "Root dependencies installed"
fi

# ----------------------------------------------------------
# 7. Platform dependencies (bun)
# ----------------------------------------------------------
PLATFORM_DIR="$ROOT_DIR/platform"
if [ -d "$PLATFORM_DIR" ]; then
  if [ -d "$PLATFORM_DIR/node_modules" ]; then
    ok "Platform node_modules present"
  else
    if command -v bun &>/dev/null; then
      warn "Platform node_modules missing — running: bun install"
      (cd "$PLATFORM_DIR" && bun install)
      ok "Platform dependencies installed"
    else
      fail "Cannot install platform deps — bun not found"
    fi
  fi
else
  warn "platform/ directory not found — skip if not working on frontend"
fi

# ----------------------------------------------------------
# 8. Mobile dependencies (bun)
# ----------------------------------------------------------
MOBILE_DIR="$ROOT_DIR/mobile"
if [ -d "$MOBILE_DIR" ] && [ -f "$MOBILE_DIR/package.json" ]; then
  if [ -d "$MOBILE_DIR/node_modules" ]; then
    ok "Mobile node_modules present"
  else
    if command -v bun &>/dev/null; then
      warn "Mobile node_modules missing — running: bun install"
      (cd "$MOBILE_DIR" && bun install)
      ok "Mobile dependencies installed"
    else
      fail "Cannot install mobile deps — bun not found"
    fi
  fi
fi

# ----------------------------------------------------------
# 9. Mobile-specific tools (optional)
# ----------------------------------------------------------
if [ -d "$MOBILE_DIR" ]; then
  echo ""
  echo "Checking mobile tools (optional)..."

  if command -v eas &>/dev/null; then
    ok "EAS CLI (Expo Application Services)"
  else
    info "EAS CLI not found — install with: npm install -g eas-cli (needed for mobile builds)"
  fi

  if command -v watchman &>/dev/null; then
    ok "Watchman (file watcher for React Native)"
  else
    info "Watchman not found — install with: brew install watchman (recommended for mobile dev)"
  fi

  if [[ "$OSTYPE" == "darwin"* ]]; then
    if command -v xcodebuild &>/dev/null; then
      ok "Xcode CLI tools"
    else
      info "Xcode CLI tools not found — install with: xcode-select --install (needed for iOS builds)"
    fi

    if command -v pod &>/dev/null; then
      ok "CocoaPods"
    else
      info "CocoaPods not found — install with: sudo gem install cocoapods (needed for iOS native modules)"
    fi
  fi
fi

echo ""

# ----------------------------------------------------------
# 10. TypeScript compilation check
# ----------------------------------------------------------
echo "Checking compilation..."

if [ -d "$PLATFORM_DIR" ] && [ -d "$PLATFORM_DIR/node_modules" ]; then
  if (cd "$PLATFORM_DIR" && bun run typecheck 2>/dev/null); then
    ok "Platform typecheck passes"
  else
    warn "Platform typecheck has errors — run 'cd platform && bun run typecheck' for details"
  fi
fi

echo ""

# ----------------------------------------------------------
# Summary
# ----------------------------------------------------------
if [ "$ERRORS" -eq 0 ]; then
  echo -e "${GREEN}All checks passed. Ready to work.${NC}"
else
  echo -e "${RED}${ERRORS} check(s) failed. Fix the issues above before proceeding.${NC}"
  exit 1
fi

echo ""
