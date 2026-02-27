#!/bin/bash
# Auto-restart dev server if it crashes
# Usage: ./dev.sh

cd "$(dirname "$0")"

while true; do
  echo "$(date): Starting Next.js dev server..."
  npm run dev
  EXIT_CODE=$?
  echo "$(date): Dev server exited with code $EXIT_CODE. Restarting in 2 seconds..."
  sleep 2
done
