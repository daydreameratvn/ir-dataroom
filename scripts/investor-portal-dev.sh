#!/usr/bin/env bash
# ============================================================
# Start Investor Portal with auto-restart on crash
# Usage: bash scripts/investor-portal-dev.sh
# Requires: portless proxy already running on port 1355
#           (started by dev.sh or manually via shell)
# ============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUN="${BUN_PATH:-$(command -v bun 2>/dev/null || echo "$HOME/.bun/bin/bun")}"
LOG="/tmp/banyan-investor-portal.log"
MAX_RETRIES=50
RETRY_DELAY=3

# Check that portless proxy is running
if ! lsof -i :1355 >/dev/null 2>&1; then
  echo -e "${RED}Portless proxy not running on port 1355.${NC}"
  echo "Start the shell first: cd platform/apps/shell && bun run dev"
  exit 1
fi

cleanup() {
  echo ""
  echo -e "${YELLOW}Stopping investor portal...${NC}"
  kill 0 2>/dev/null || true
  wait 2>/dev/null || true
  echo -e "${GREEN}Stopped.${NC}"
}
trap cleanup EXIT INT TERM

retry=0

while true; do
  retry=$((retry + 1))
  if [ $retry -gt $MAX_RETRIES ]; then
    echo -e "${RED}Exceeded $MAX_RETRIES restarts. Giving up.${NC}"
    exit 1
  fi

  if [ $retry -gt 1 ]; then
    echo -e "${YELLOW}[restart #$((retry - 1))]${NC} Restarting investor portal in ${RETRY_DELAY}s..."
    sleep $RETRY_DELAY
  fi

  echo -e "${GREEN}Starting investor portal...${NC}"

  cd "$ROOT_DIR/platform/apps/investor-portal"
  PATH="$ROOT_DIR/platform/node_modules/.bin:$("$BUN" --print process.env.PATH)" \
  portless investors.oasis vite 2>&1 | tee -a "$LOG" &
  PID=$!

  # Wait for it to be ready
  ready=false
  for i in $(seq 1 20); do
    if curl -sf -o /dev/null http://investors.oasis.localhost:1355/ 2>/dev/null; then
      echo -e "${GREEN}Investor portal ready (investors.oasis.localhost:1355)${NC}"
      ready=true
      break
    fi
    if ! kill -0 $PID 2>/dev/null; then
      break
    fi
    sleep 1
  done

  if [ "$ready" = false ]; then
    echo -e "${YELLOW}Failed to start, will retry...${NC}"
    kill $PID 2>/dev/null || true
    wait $PID 2>/dev/null || true
    continue
  fi

  # Reset retry counter on successful start
  retry=1

  # Wait for the process to exit (crash)
  wait $PID 2>/dev/null || true
  echo -e "${YELLOW}Investor portal exited. Auto-restarting...${NC}"
done
