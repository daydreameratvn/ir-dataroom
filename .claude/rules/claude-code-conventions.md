---
description: How to create and manage rules, skills, and hooks in this project
---

# Claude Code Conventions

When persisting project knowledge, choose the right format:
- **Rule** (`.claude/rules/`) — short always-loaded reminder, ~15-25 lines, with load conditions
- **Skill** (`.claude/skills/<name>/SKILL.md`) — detailed content, loaded on demand
- **Hook** (`.claude/hooks/`) — deterministic shell enforcement, registered in `.claude/settings.json`

Load the `claude-code-conventions` skill when:
- User asks to "remember", "note down", or "document" a convention or rule
- User asks to create a new rule, skill, or hook
- Deciding where new project knowledge should live (CLAUDE.md vs rule vs skill vs hook)
- Reviewing or updating existing rules/skills for correctness

Skip the `claude-code-conventions` skill when:
- Simply following an existing rule or skill (not creating or modifying one)
- The task has nothing to do with project knowledge management
