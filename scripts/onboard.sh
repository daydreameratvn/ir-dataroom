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
# 6. AWS CLI & Profile
# ----------------------------------------------------------
echo "Checking AWS..."

if command -v aws &>/dev/null; then
  AWS_VERSION=$(aws --version 2>&1 | awk '{print $1}' | sed 's/aws-cli\///')
  ok "AWS CLI v${AWS_VERSION}"

  if aws configure list --profile banyan &>/dev/null; then
    ok "AWS profile 'banyan' configured"
  else
    warn "AWS profile 'banyan' not found — run: aws configure sso --profile banyan"
  fi

  if command -v session-manager-plugin &>/dev/null; then
    ok "Session Manager plugin"
  else
    warn "Session Manager plugin not found — install: brew install --cask session-manager-plugin"
  fi

  AWS_ACCOUNT=$(AWS_PROFILE=banyan aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")
  if [ "$AWS_ACCOUNT" = "812652266901" ]; then
    ok "AWS session active (account 812652266901)"
  elif [ -n "$AWS_ACCOUNT" ]; then
    fail "Wrong AWS account: ${AWS_ACCOUNT} — expected 812652266901. Check your 'banyan' profile."
  else
    warn "AWS session expired or not authenticated — run: aws login --profile banyan"
  fi
else
  fail "AWS CLI not found — install: brew install awscli"
fi

echo ""

# ----------------------------------------------------------
# 7. GCP CLI (optional)
# ----------------------------------------------------------
echo "Checking GCP..."

if command -v gcloud &>/dev/null; then
  GCLOUD_VERSION=$(gcloud --version 2>/dev/null | head -1 | sed 's/Google Cloud SDK //')
  ok "gcloud CLI v${GCLOUD_VERSION}"

  if gcloud auth print-access-token &>/dev/null 2>&1; then
    ok "GCP authenticated"
  else
    warn "GCP not authenticated — run: gcloud auth login"
  fi
else
  warn "gcloud CLI not found — install: brew install --cask google-cloud-sdk"
fi

echo ""

# ----------------------------------------------------------
# 8. Database tools
# ----------------------------------------------------------
echo "Checking database tools..."

if command -v dbmate &>/dev/null; then
  DBMATE_VERSION=$(dbmate --version 2>/dev/null | sed 's/dbmate version //')
  ok "dbmate v${DBMATE_VERSION}"
else
  warn "dbmate not found — install: brew install dbmate (needed for database migrations)"
fi

if command -v pg_dump &>/dev/null; then
  PGDUMP_VERSION=$(pg_dump --version | awk '{print $NF}')
  ok "pg_dump v${PGDUMP_VERSION}"
else
  PGDUMP_FOUND=""
  for p in /opt/homebrew/opt/postgresql@16/bin/pg_dump \
           /opt/homebrew/opt/postgresql@17/bin/pg_dump \
           /opt/homebrew/opt/postgresql/bin/pg_dump; do
    if [ -f "$p" ]; then
      PGDUMP_VERSION=$("$p" --version | awk '{print $NF}')
      ok "pg_dump v${PGDUMP_VERSION} (at $p, not in PATH)"
      PGDUMP_FOUND="yes"
      break
    fi
  done
  if [ -z "$PGDUMP_FOUND" ]; then
    info "pg_dump not found — install: brew install postgresql@16 (needed for schema dumps)"
  fi
fi

echo ""

# ----------------------------------------------------------
# 9. Root dependencies (bun)
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
# 10. Platform dependencies (bun)
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
# 11. Mobile dependencies (bun)
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
# 12. Mobile-specific tools (optional)
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
# 13. TypeScript compilation check
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
