---
description: Git workflow reminder
---

# Git Workflow

Key reminders:
- Feature branches: `feat/`, `fix/`, `chore/` — never commit to main directly
- Stage specific files only (never `git add -A` or `git add .`)
- Typecheck before every commit
- Rebase on `origin/main` before pushing
- Always create a PR after completing tasks

Load the `git-workflow` skill when:
- About to run `git commit`, `git push`, `git rebase`, or `gh pr create`
- Creating or switching branches
- Resolving merge/rebase conflicts
- Preparing to finish a task and push work

Skip the `git-workflow` skill when:
- Only reading git history (`git log`, `git diff`, `git status`)
- The task involves no git operations
