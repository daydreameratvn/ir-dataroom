#!/usr/bin/env bash
# ============================================================
# Papaya Banyan — Local Dev Launcher
# Starts SSM tunnel + auth service + frontend in one command.
# Usage: bash scripts/dev.sh
# ============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUN="${BUN_PATH:-$(command -v bun 2>/dev/null || echo "$HOME/.bun/bin/bun")}"

if [ ! -x "$BUN" ]; then
  echo -e "${RED}bun not found. Install: curl -fsSL https://bun.sh/install | bash${NC}"
  exit 1
fi

cleanup() {
  echo ""
  echo -e "${YELLOW}Shutting down...${NC}"
  # Kill all background processes in this process group
  kill 0 2>/dev/null || true
  wait 2>/dev/null || true
  echo -e "${GREEN}All services stopped.${NC}"
}
trap cleanup EXIT INT TERM

# ----------------------------------------------------------
# 1. SSM Tunnel (localhost:15432 -> RDS)
# ----------------------------------------------------------
echo -e "${GREEN}[1/3]${NC} Starting SSM tunnel to RDS..."

if lsof -i :15432 >/dev/null 2>&1; then
  echo -e "${YELLOW}  Tunnel already running on port 15432${NC}"
else
  cd "$ROOT_DIR"
  AWS_PROFILE="${AWS_PROFILE:-banyan}" "$BUN" run hasura/scripts/tunnel.ts > /tmp/banyan-tunnel.log 2>&1 &
  TUNNEL_PID=$!

  # Wait for tunnel to be ready
  for i in $(seq 1 30); do
    if lsof -i :15432 >/dev/null 2>&1; then
      echo -e "${GREEN}  Tunnel ready (localhost:15432)${NC}"
      break
    fi
    if ! kill -0 $TUNNEL_PID 2>/dev/null; then
      echo -e "${RED}  Tunnel failed to start. Check /tmp/banyan-tunnel.log${NC}"
      cat /tmp/banyan-tunnel.log
      exit 1
    fi
    sleep 1
  done

  if ! lsof -i :15432 >/dev/null 2>&1; then
    echo -e "${RED}  Tunnel timed out after 30s. Check /tmp/banyan-tunnel.log${NC}"
    exit 1
  fi
fi

# ----------------------------------------------------------
# 2. Auth Service (port 4000)
# ----------------------------------------------------------
echo -e "${GREEN}[2/3]${NC} Starting auth service..."

if lsof -i :4000 >/dev/null 2>&1; then
  echo -e "${YELLOW}  Auth already running on port 4000${NC}"
else
  cd "$ROOT_DIR"

  # Get tunneled DB URL (no SSL for local tunnel)
  DB_URL=$("$BUN" -e "
    import { getDbUrl } from './hasura/lib/db.ts';
    let url = await getDbUrl({ tunnel: true });
    url = url.replace(/[?&]sslmode=require/, '');
    console.log(url);
  " 2>/dev/null)

  if [ -z "$DB_URL" ]; then
    echo -e "${RED}  Failed to resolve DATABASE_URL from Secrets Manager${NC}"
    exit 1
  fi

  cd "$ROOT_DIR/auth"
  DATABASE_URL="$DB_URL" \
  HASURA_ADMIN_SECRET="${HASURA_ADMIN_SECRET:-dummy}" \
  AUTH_BASE_URL="http://oasis.localhost:1355" \
  "$BUN" run --hot src/index.ts > /tmp/banyan-auth.log 2>&1 &
  AUTH_PID=$!

  # Wait for auth to be ready
  for i in $(seq 1 15); do
    if curl -sf http://localhost:4000/auth/health >/dev/null 2>&1; then
      echo -e "${GREEN}  Auth ready (localhost:4000)${NC}"
      break
    fi
    if ! kill -0 $AUTH_PID 2>/dev/null; then
      echo -e "${RED}  Auth failed to start. Check /tmp/banyan-auth.log${NC}"
      cat /tmp/banyan-auth.log
      exit 1
    fi
    sleep 1
  done

  if ! curl -sf http://localhost:4000/auth/health >/dev/null 2>&1; then
    echo -e "${RED}  Auth timed out. Check /tmp/banyan-auth.log${NC}"
    exit 1
  fi
fi

# ----------------------------------------------------------
# 3. Frontend (portless on oasis.localhost:1355)
# ----------------------------------------------------------
echo -e "${GREEN}[3/3]${NC} Starting frontend..."

if lsof -i :1355 >/dev/null 2>&1; then
  echo -e "${YELLOW}  Frontend already running on port 1355${NC}"
else
  cd "$ROOT_DIR/platform/apps/shell"
  PATH="$ROOT_DIR/platform/node_modules/.bin:$("$BUN" --print process.env.PATH)" \
  portless oasis vite > /tmp/banyan-frontend.log 2>&1 &
  FRONTEND_PID=$!

  # Wait for frontend
  for i in $(seq 1 20); do
    if lsof -i :1355 >/dev/null 2>&1; then
      echo -e "${GREEN}  Frontend ready (oasis.localhost:1355)${NC}"
      break
    fi
    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
      echo -e "${RED}  Frontend failed. Check /tmp/banyan-frontend.log${NC}"
      cat /tmp/banyan-frontend.log
      exit 1
    fi
    sleep 1
  done
fi

# ----------------------------------------------------------
# Ready
# ----------------------------------------------------------
echo ""
echo -e "${GREEN}=== All services running ===${NC}"
echo "  Frontend:  http://oasis.localhost:1355"
echo "  Auth API:  http://localhost:4000"
echo "  DB Tunnel: localhost:15432"
echo ""
echo "  Logs:"
echo "    Tunnel:   /tmp/banyan-tunnel.log"
echo "    Auth:     /tmp/banyan-auth.log"
echo "    Frontend: /tmp/banyan-frontend.log"
echo ""
echo -e "Press ${YELLOW}Ctrl+C${NC} to stop all services."

# Wait forever (until Ctrl+C)
wait
