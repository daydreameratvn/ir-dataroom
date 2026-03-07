#!/usr/bin/env bash
# PreToolUse hook for Bash tool — blocks common AI agent mistakes

set -euo pipefail

# Read the tool input from stdin (Claude Code passes JSON)
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('command', ''))" 2>/dev/null || echo "")

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Block npm/npx/node usage (use bun/bunx instead)
if echo "$COMMAND" | grep -qE '(^|\s)(npm|npx)\s'; then
  echo "ERROR: Use bun/bunx instead of npm/npx. Replace 'npm' with 'bun' and 'npx' with 'bunx'." >&2
  exit 1
fi

# Block git add -A or git add . (stage specific files by name)
if echo "$COMMAND" | grep -qE 'git\s+add\s+(-A|--all|\.)(\s|$)'; then
  echo "ERROR: Never use 'git add -A' or 'git add .'. Stage specific files by name: 'git add path/to/file1 path/to/file2'" >&2
  exit 1
fi

# Block --no-verify on git commands (fix hook issues instead of skipping)
if echo "$COMMAND" | grep -qE 'git\s+.*--no-verify'; then
  echo "ERROR: Never use --no-verify. If a hook fails, fix the underlying issue and retry." >&2
  exit 1
fi

exit 0
