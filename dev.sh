#!/bin/bash
# Auto-restart dev server if it crashes
# Usage: ./dev.sh
# This ensures the dev server always comes back up after any crash.

cd "$(dirname "$0")"

cleanup() {
  echo "Stopping dev server..."
  kill $DEV_PID 2>/dev/null
  # Kill anything still on port 3000
  lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null
  exit 0
}

trap cleanup SIGINT SIGTERM

while true; do
  # Kill any stale processes on port 3000
  lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null
  sleep 1

  echo ""
  echo "=========================================="
  echo "$(date): Starting Next.js dev server..."
  echo "=========================================="

  npm run dev &
  DEV_PID=$!
  wait $DEV_PID
  EXIT_CODE=$?

  echo ""
  echo "$(date): Dev server exited with code $EXIT_CODE."
  echo "Restarting in 2 seconds..."
  sleep 2
done
