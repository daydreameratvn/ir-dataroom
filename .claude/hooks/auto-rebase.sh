#!/bin/bash
# Auto-rebase current branch onto origin/main at session start.
# Exits silently on failure to avoid blocking the session.

git fetch origin main 2>/dev/null || exit 0
git rebase origin/main 2>/dev/null && echo "Rebased onto origin/main" >&2 || echo "Auto-rebase failed — run manually" >&2
exit 0
