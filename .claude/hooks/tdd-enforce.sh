#!/usr/bin/env bash
# PreToolUse hook — blocks git commit when staged source files lack test files.
# Enforces the red/green TDD requirement: no source without a test.

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('command', ''))" 2>/dev/null || echo "")

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Only run on git commit commands
if ! echo "$COMMAND" | grep -qE 'git\s+commit'; then
  exit 0
fi

# Get staged files (new or modified source files)
STAGED=$(git diff --cached --name-only --diff-filter=AM 2>/dev/null || echo "")
if [ -z "$STAGED" ]; then
  exit 0
fi

MISSING=""

while IFS= read -r file; do
  # Only check .ts and .tsx source files
  case "$file" in
    *.ts|*.tsx) ;;
    *) continue ;;
  esac

  # Skip files that are themselves tests, configs, types, migrations, or declarations
  case "$file" in
    *.test.ts|*.test.tsx) continue ;;
    *.spec.ts|*.spec.tsx) continue ;;
    *.d.ts) continue ;;
    */test/*|*/tests/*|*/__tests__/*) continue ;;
    */types/*|*/types.ts|*/shared-types/*) continue ;;
    *tsconfig*|*vite.config*|*vitest.config*|*.config.ts) continue ;;
    *index.ts|*index.tsx) continue ;;           # barrel exports
    *main.ts|*main.tsx|*bootstrap.tsx) continue ;; # app entry points
    *vite-env.d.ts) continue ;;
    hasura/*|rootstock/*|scripts/*|.claude/*) continue ;; # non-app code
  esac

  # Derive expected test file path (sibling .test.ts/.test.tsx)
  dir=$(dirname "$file")
  base=$(basename "$file")
  ext="${base##*.}"
  name="${base%.*}"
  test_file="$dir/$name.test.$ext"

  # Check if test file exists on disk OR is being staged in this commit
  if [ ! -f "$test_file" ] && ! echo "$STAGED" | grep -qF "$test_file"; then
    MISSING="$MISSING\n  $file -> missing $test_file"
  fi
done <<< "$STAGED"

if [ -n "$MISSING" ]; then
  echo "ERROR: TDD violation — source files staged without corresponding test files:" >&2
  echo -e "$MISSING" >&2
  echo "" >&2
  echo "Write failing tests FIRST (red), then implement (green). See the tdd skill for the full protocol." >&2
  exit 1
fi

exit 0
